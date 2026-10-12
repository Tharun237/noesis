// Sign in with Google: OAuth 2.0 authorization-code flow with PKCE, done server-side.
// A full-page redirect (no popup) so it works with the app's cross-origin isolation and inside the
// installed PWA. The session is a random token in an HttpOnly cookie; only its SHA-256 is stored.
//
// GET  /api/auth/config    → { google, dev }        which sign-in methods are available
// GET  /api/auth/me        → { user | null }
// GET  /api/auth/google    → 302 to Google
// GET  /api/auth/callback  → 302 back to /#signed-in (or /#signin-failed=<reason>)
// POST /api/auth/logout
// POST /api/auth/dev       { name } — local development only (DEV_LOGIN=1 and localhost)

const SESSION = 'noesis_session'
const OAUTH = 'noesis_oauth'
const SESSION_AGE = 400 * 24 * 3600 // browsers cap cookies at 400 days
const SEEN_EVERY = 24 * 3600 * 1000

const te = new TextEncoder()
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = n => b64url(crypto.getRandomValues(new Uint8Array(n)))
const sha256 = async s => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))))
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

const isLocal = url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname)
const readCookies = req => Object.fromEntries((req.headers.get('cookie') || '').split(/;\s*/).filter(Boolean).map(c => {
  const i = c.indexOf('=')
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]
}))
const cookie = (name, value, maxAge, url) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isLocal(url) ? '' : '; Secure'}`

function jwtPayload(token) {
  const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p + '='.repeat((4 - (p.length % 4)) % 4)), c => c.charCodeAt(0))))
}

const publicUser = u => ({ id: u.id, email: u.email, name: u.name, picture: u.picture })
const devAllowed = (req, env) => env.DEV_LOGIN === '1' && isLocal(req.url)

export async function getUser(request, env) {
  const token = readCookies(request)[SESSION]
  if (!token) return null
  const hash = await sha256(token)
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.picture, s.seen FROM sessions s JOIN users u ON u.id = s.uid WHERE s.token = ?1',
  ).bind(hash).first()
  if (!row) return null
  if (Date.now() - row.seen > SEEN_EVERY) await env.DB.prepare('UPDATE sessions SET seen = ?2 WHERE token = ?1').bind(hash, Date.now()).run()
  return row
}

async function startSession(request, env, user) {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, name, picture, created) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`)
      .bind(user.id, user.email || null, user.name || null, user.picture || null, now),
  ])
  const token = random(32)
  await env.DB.prepare('INSERT INTO sessions (token, uid, created, seen) VALUES (?1, ?2, ?3, ?3)').bind(await sha256(token), user.id, now).run()
  return cookie(SESSION, token, SESSION_AGE, request.url)
}

function backToApp(request, hash, cookies = []) {
  const headers = new Headers({ location: `/${hash}`, 'cache-control': 'no-store' })
  headers.append('set-cookie', cookie(OAUTH, '', 0, request.url))
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 302, headers })
}

export async function handleAuth(request, env) {
  const url = new URL(request.url)
  const action = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '')
  const redirectUri = `${url.origin}/api/auth/callback`
  const googleReady = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

  if (action === 'config') return json({ google: googleReady, dev: devAllowed(request, env) })

  if (action === 'me') {
    const u = await getUser(request, env)
    return json({ user: u ? publicUser(u) : null })
  }

  if (action === 'google') {
    if (!googleReady) return json({ error: 'Google sign-in is not configured on this server' }, 503)
    const state = random(24)
    const verifier = random(48)
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(verifier))))
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
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
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
      }),
    })
    if (!res.ok) {
      // Google says why in a short code (invalid_client: the server's own key was refused; invalid_grant: this
      // sign-in was already used or took too long). The code is passed on, so the message can be a true one
      // and whoever runs the server can tell a wrong key from a slow customer. It names no secret.
      const why = String((await res.json().catch(() => ({}))).error || 'google').replace(/[^a-z_]/g, '').slice(0, 40) || 'google'
      console.warn('Google sign-in: token exchange refused:', why)
      return backToApp(request, `#signin-failed=${why}`)
    }
    const { id_token: idToken } = await res.json()
    // The ID token came straight from Google's token endpoint over TLS (not via the browser),
    // so its origin is established by the channel; the claims are still checked.
    const c = jwtPayload(idToken)
    if (c.aud !== env.GOOGLE_CLIENT_ID || !['https://accounts.google.com', 'accounts.google.com'].includes(c.iss) || c.exp * 1000 < Date.now()) {
      return backToApp(request, '#signin-failed=token')
    }
    const session = await startSession(request, env, { id: `g:${c.sub}`, email: c.email, name: c.name || c.email, picture: c.picture })
    return backToApp(request, '#signed-in', [session])
  }

  if (action === 'logout' && request.method === 'POST') {
    const token = readCookies(request)[SESSION]
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(await sha256(token)).run()
    return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION, '', 0, request.url) })
  }

  if (action === 'dev' && request.method === 'POST') {
    if (!devAllowed(request, env)) return json({ error: 'Not available' }, 404)
    const { name } = await request.json().catch(() => ({}))
    const clean = String(name || '').replace(/[^\w-]/g, '').slice(0, 24)
    if (!clean) return json({ error: 'Name required' }, 400)
    const session = await startSession(request, env, { id: `dev:${clean}`, email: `${clean}@localhost`, name: clean })
    return json({ ok: true }, 200, { 'set-cookie': session })
  }

  return json({ error: 'Not found' }, 404)
}
