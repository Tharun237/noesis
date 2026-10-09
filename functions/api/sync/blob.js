import { handleBlob } from '../../../server/sync.js'

export const onRequestGet = ({ request, env }) => handleBlob(request, env)
export const onRequestPut = ({ request, env }) => handleBlob(request, env)
