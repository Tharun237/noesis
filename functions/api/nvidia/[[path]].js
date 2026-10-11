// Relay to NVIDIA's OpenAI-compatible API (https://integrate.api.nvidia.com/v1).
// The browser cannot call NVIDIA directly (no CORS allow-origin header), so the app
// calls same-origin /api/nvidia/* and this Function forwards it. Nothing is logged or stored.
const UPSTREAM = 'https://integrate.api.nvidia.com/v1'
const MAX_BODY = 6 * 1024 * 1024 // a request that reads page images carries them inside

const fail = (status, error) => new Response(JSON.stringify({ error }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export async function handleNvidia(request) {
  const url = new URL(request.url)
  const sub = url.pathname.replace(/^\/api\/nvidia\/?/, '')
  const ok = (request.method === 'POST' && sub === 'chat/completions') ||
    (request.method === 'GET' && sub === 'models')
  if (!ok) return fail(404, 'Not found')
  const auth = request.headers.get('authorization')
  if (!auth || !/^Bearer\s+\S/.test(auth)) return fail(401, 'Missing or invalid Authorization header')
  const origin = request.headers.get('origin')
  if (origin) {
    let host = ''
    try { host = new URL(origin).host } catch { return fail(403, 'Forbidden') }
    if (host !== url.host) return fail(403, 'Forbidden')
  }
  if (+request.headers.get('content-length') > MAX_BODY) return fail(413, 'Body is larger than 6 MB')
  let body
  if (request.method === 'POST') {
    const buf = await request.arrayBuffer()
    if (buf.byteLength > MAX_BODY) return fail(413, 'Body is larger than 6 MB')
    body = buf
  }
  let up
  try {
    up = await fetch(UPSTREAM + '/' + sub + url.search, {
      method: request.method,
      headers: { authorization: auth, ...(body !== undefined ? { 'content-type': request.headers.get('content-type') || 'application/json' } : {}) },
      body: body !== undefined ? body : undefined,
    })
  } catch {
    return fail(502, 'Could not reach NVIDIA')
  }
  return new Response(up.body, {
    status: up.status,
    headers: { 'content-type': up.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' },
  })
}

export const onRequest = ({ request }) => handleNvidia(request)
