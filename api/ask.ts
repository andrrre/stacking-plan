import { handleAsk } from '../server/ask.js'

export const POST = (request: Request): Promise<Response> => handleAsk(request, process.env)
