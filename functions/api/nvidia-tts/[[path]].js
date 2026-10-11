// Relay to NVIDIA's hosted Magpie multilingual TTS (plain HTTPS, no gRPC).
// The browser cannot call NVIDIA directly (no CORS allow-origin header), so the app
// calls same-origin /api/nvidia-tts/* and this Function forwards it. Nothing is logged or stored.
// NVIDIA may change this address; it lives in this ONE constant.
// Same rules and style as functions/api/nvidia/[[path]].js.
const UPSTREAM = 'https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio'
const MAX_BODY = 1024 * 1024

const fail = (status, error) => new Response(JSON.stringify({ error }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export async function handleNvidiaTts(request) {
  const url = new URL(request.url)
  const sub = url.pathname.replace(/^\/api\/nvidia-tts\/?/, '')
  const ok = (request.method === 'POST' && sub === 'synthesize') ||
    (request.method === 'GET' && sub === 'list_voices')
  if (!ok) return fail(404, 'Not found')
  const auth = request.headers.get('authorization')
  if (!auth || !/^Bearer\s+\S/.test(auth)) return fail(401, 'Missing or invalid Authorization header')
  const origin = request.headers.get('origin')
  if (origin) {
    let host = ''
    try { host = new URL(origin).host } catch { return fail(403, 'Forbidden') }
    if (host !== url.host) return fail(403, 'Forbidden')
  }
  if (+request.headers.get('content-length') > MAX_BODY) return fail(413, 'Body is larger than 1 MB')
  let body
  if (request.method === 'POST') {
    const buf = await request.arrayBuffer()
    if (buf.byteLength > MAX_BODY) return fail(413, 'Body is larger than 1 MB')
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

export const onRequest = ({ request }) => handleNvidiaTts(request)
