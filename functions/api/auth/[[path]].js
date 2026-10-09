import { handleAuth } from '../../../server/auth.js'

// Catch-all: /api/auth/config, /me, /google, /callback, /logout, /dev
export const onRequest = ({ request, env }) => handleAuth(request, env)
