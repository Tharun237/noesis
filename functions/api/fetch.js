// GET /api/fetch?url=<http(s) url>
// Fetches a public web page / PDF / EPUB for "Add link", because browsers block
// cross-origin reads. No CORS headers on purpose: only Noesis itself (same origin) can read it.
// Runs as a Cloudflare Pages Function in production and as Vite middleware in dev.

const MAX_BYTES = 60 * 1024 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 25_000
const UA = 'Mozilla/5.0 (compatible; NoesisReader/0.1; +https://github.com/Tharun237/noesis)'

// ponytail: blocks literal private/loopback hosts; DNS that *resolves* to a private IP is not
// checked (Workers can't resolve DNS). On Cloudflare that's harmless; in local dev it's your own LAN.
function isBlockedHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:')) return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return /^\d+$/.test(h) // bare-integer IPs like http://2130706433
  const [a, b] = [+m[1], +m[2]]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

export function validateTarget(raw) {
  let u
  try { u = new URL(raw) } catch { return 'Not a valid URL' }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Only http(s) links are supported'
  if (u.port && u.port !== '80' && u.port !== '443') return 'Non-standard ports are not allowed'
  if (u.username || u.password) return 'Credentials in URLs are not allowed'
  if (isBlockedHost(u.hostname)) return 'Private network addresses are not allowed'
  return null
}

const fail = (status, error) => new Response(JSON.stringify({ error }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export async function handleFetch(request) {
  let target = new URL(request.url).searchParams.get('url') || ''
  let res
  for (let hop = 0; ; hop++) {
    const err = validateTarget(target)
    if (err) return fail(400, err)
    try {
      res = await fetch(target, {
        redirect: 'manual',
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/pdf,application/epub+zip,text/plain,*/*;q=0.8' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (e) {
      return fail(502, e.name === 'TimeoutError' ? 'The site took too long to respond' : 'Could not reach that site')
    }
    if (res.status < 300 || res.status >= 400) break
    const loc = res.headers.get('location')
    if (!loc || hop >= MAX_REDIRECTS) return fail(502, 'Too many redirects')
    target = new URL(loc, target).href // re-validated at the top of the loop
  }
  if (!res.ok) return fail(502, `The site answered ${res.status}`)
  if (+res.headers.get('content-length') > MAX_BYTES) return fail(413, 'File is larger than 60 MB')

  // Stream with a hard cap — content-length can lie or be absent.
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) { reader.cancel(); return fail(413, 'File is larger than 60 MB') }
    chunks.push(value)
  }
  return new Response(new Blob(chunks), {
    headers: {
      'content-type': res.headers.get('content-type') || 'application/octet-stream',
      'x-final-url': target,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  })
}

export const onRequestGet = ({ request }) => handleFetch(request)
