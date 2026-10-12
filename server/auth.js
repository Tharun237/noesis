// Sign in with Google, with nothing kept on the server.
//
// Signing in exists for one thing: the customer's library on all of their devices. The library is kept in
// the customer's OWN Google Drive (the hidden folder Drive gives each app; src/lib/drive.js reads and writes
// it straight from the browser). So the server has no accounts, no sessions and no database. All it holds is
// the app's own Google key, and all it does is the two things a browser cannot be trusted with:
//   1. finish Google's sign-in (exchange the code, which needs the key), and
//   2. renew the customer's short-lived Drive pass when it runs out (also needs the key).
// What it learns at sign-in (who the customer is, and Google's long-lived renewal token) goes back to the
// customer's own browser in one cookie, encrypted with a key only the server has, so page script cannot
// read it and nobody but this server can use it. A thousand customers cost what one does: a small request
// about once an hour each. (It used to keep users, sessions and every library's text in a database of ours:
// Tharun, 2026-10-12: "if any money involved us buying storage, that is bad. Use their hardware, their
// services.")
//
// OAuth 2.0 authorization-code flow with PKCE, as a full-page redirect (no popup), so it works with the
// app's cross-origin isolation and inside the installed app.
//
// GET  /api/auth/config    → { google, dev }        which sign-in methods are available
// GET  /api/auth/me        → { user | null }
// GET  /api/auth/google    → 302 to Google
// GET  /api/auth/callback  → 302 back to /#signed-in (or /#signin-failed=<reason>)
// POST /api/auth/token     → { access_token, expires_in, api? }  a pass for the customer's own Drive
// POST /api/auth/logout
// POST /api/auth/dev       { name } — local development only (DEV_LOGIN=1 and localhost)

const SESSION = 'noesis_session'
const OAUTH = 'noesis_oauth'
const SESSION_AGE = 400 * 24 * 3600 // browsers cap cookies at 400 days
const DRIVE = 'https://www.googleapis.com/auth/drive.appdata' // Noesis's own hidden folder in the customer's Drive, and nothing else in it
const SCOPE = `openid email profile ${DRIVE}`
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DEV_DRIVE = '/api/devdrive' // local development: a stand-in for Drive (server/devdrive.js)
const DEV_KEY = 'noesis local development only' // seals the cookie where there is no Google key: localhost

const te = new TextEncoder()
const td = new TextDecoder()
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))
const random = n => b64url(crypto.getRandomValues(new Uint8Array(n)))
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

const isLocal = url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname)
const readCookies = req => Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map(c => {
  const i = c.indexOf('=')
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]
}))
const cookie = (name, value, maxAge, url) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isLocal(url) ? '' : '; Secure'}`

const jwtPayload = token => JSON.parse(td.decode(unb64url(token.split('.')[1])))

// ── the sealed cookie ────────────────────────────────────────────────────────────────────────────────────
// AES-GCM under a key derived from the app's Google key: nothing more to keep or to lose, and replacing the
// Google key signs everyone out, which is what replacing it should do.
const IV_BYTES = 12
async function sealKey(env) {
  const raw = await crypto.subtle.importKey('raw', te.encode(env.GOOGLE_CLIENT_SECRET || DEV_KEY), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('noesis'), info: te.encode('session cookie 1') }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), te.encode(JSON.stringify(value))))
  return `${b64url(iv)}.${b64url(sealed)}`
}
// Anything that does not open (a cookie from before, one that was tampered with, a replaced key) is no session.
async function unseal(env, text) {
  try {
    const [iv, sealed] = text.split('.').map(unb64url)
    return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await sealKey(env), sealed)))
  } catch { return null }
}

const devAllowed = (req, env) => env.DEV_LOGIN === '1' && isLocal(req.url)
const isDev = session => session.user.id.startsWith('dev:')

// Who is signed in: read from their own cookie. { user: { id, email, name, picture }, renew } or null.
export async function getSession(request, env) {
  const text = readCookies(request)[SESSION]
  const session = text ? await unseal(env, text) : null
  if (!session?.user?.id) return null
  if (isDev(session) && !devAllowed(request, env)) return null // a development cookie means nothing anywhere else
  return session
}
const startSession = async (request, env, user, renew) => cookie(SESSION, await seal(env, { user, renew }), SESSION_AGE, request.url)

function backToApp(request, hash, cookies = []) {
  const headers = new Headers({ location: `/${hash}`, 'cache-control': 'no-store' })
  headers.append('set-cookie', cookie(OAUTH, '', 0, request.url))
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 302, headers })
}

// Google says why it refused in a short code (invalid_client: the app's own key was refused; invalid_grant:
// this sign-in was already used, took too long, or was withdrawn). It names no secret, and it is passed on so
// that the message can be a true one.
const refusal = async res => String((await res.json().catch(() => ({}))).error || 'google').replace(/[^a-z_]/g, '').slice(0, 40) || 'google'

export async function handleAuth(request, env) {
  const url = new URL(request.url)
  const action = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '')
  const redirectUri = `${url.origin}/api/auth/callback`
  const googleReady = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

  if (action === 'config') return json({ google: googleReady, dev: devAllowed(request, env) })

  if (action === 'me') return json({ user: (await getSession(request, env))?.user || null })

  if (action === 'google') {
    if (!googleReady) return json({ error: 'Google sign-in is not configured on this server' }, 503)
    const state = random(24)
    const verifier = random(48)
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(verifier))))
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
      state, code_challenge: challenge, code_challenge_method: 'S256',
      // offline + consent: Google then returns the renewal token every time, not only the first time ever
      access_type: 'offline', prompt: 'consent select_account',
    })
    return new Response(null, {
      status: 302,
      headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, 'set-cookie': cookie(OAUTH, `${state}.${verifier}`, 600, request.url), 'cache-control': 'no-store' },
    })
  }

  if (action === 'callback') {
    const [state, verifier] = (readCookies(request)[OAUTH] || '').split('.')
    if (!state || url.searchParams.get('state') !== state) return backToApp(request, '#signin-failed=expired')
    const code = url.searchParams.get('code')
    if (!code) return backToApp(request, `#signin-failed=${encodeURIComponent(url.searchParams.get('error') || 'cancelled')}`)
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
      }),
    })
    if (!res.ok) {
      const why = await refusal(res)
      console.warn('Google sign-in: token exchange refused:', why)
      return backToApp(request, `#signin-failed=${why}`)
    }
    const got = await res.json()
    // The ID token came straight from Google's token endpoint over TLS (not via the browser),
    // so its origin is established by the channel; the claims are still checked.
    const c = jwtPayload(got.id_token)
    if (c.aud !== env.GOOGLE_CLIENT_ID || !['https://accounts.google.com', 'accounts.google.com'].includes(c.iss) || c.exp * 1000 < Date.now()) {
      return backToApp(request, '#signin-failed=token')
    }
    // Google lets a customer untick a permission. Without the Drive folder there is nowhere to keep the
    // library, and signing in would do nothing: say so instead of pretending.
    if (!String(got.scope || '').split(' ').includes(DRIVE)) return backToApp(request, '#signin-failed=no_drive')
    if (!got.refresh_token) return backToApp(request, '#signin-failed=no_renewal')
    const session = await startSession(request, env, { id: `g:${c.sub}`, email: c.email, name: c.name || c.email, picture: c.picture }, got.refresh_token)
    return backToApp(request, '#signed-in', [session])
  }

  // A pass for the customer's own Drive, good for about an hour. The browser asks when it has none.
  if (action === 'token' && request.method === 'POST') {
    const session = await getSession(request, env)
    if (!session) return json({ error: 'Signed out' }, 401)
    if (isDev(session)) return json({ access_token: session.user.id, expires_in: 3600, api: DEV_DRIVE })
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: session.renew }),
    })
    if (!res.ok) {
      const why = await refusal(res)
      console.warn('Google sign-in: renewal refused:', why)
      // invalid_grant: the customer took Noesis's access away in their Google account, or it lapsed. They are
      // signed out here. Anything else is our trouble or Google's, and the session stays for the next try.
      return why === 'invalid_grant'
        ? json({ error: 'Signed out' }, 401, { 'set-cookie': cookie(SESSION, '', 0, request.url) })
        : json({ error: `Google refused (${why})` }, 502)
    }
    const got = await res.json()
    return json({ access_token: got.access_token, expires_in: got.expires_in })
  }

  // Signing out forgets the cookie. Google's permission is left alone: taking it away would sign out the
  // customer's other devices too. (They can remove it, and the hidden folder, in their Google account.)
  if (action === 'logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION, '', 0, request.url) })

  if (action === 'dev' && request.method === 'POST') {
    if (!devAllowed(request, env)) return json({ error: 'Not available' }, 404)
    const { name } = await request.json().catch(() => ({}))
    const clean = String(name || '').replace(/[^\w-]/g, '').slice(0, 24)
    if (!clean) return json({ error: 'Name required' }, 400)
    return json({ ok: true }, 200, { 'set-cookie': await startSession(request, env, { id: `dev:${clean}`, email: `${clean}@localhost`, name: clean }, 'dev') })
  }

  return json({ error: 'Not found' }, 404)
}
