import { handleSync } from '../../../server/sync.js'

export const onRequestPost = ({ request, env }) => handleSync(request, env)
