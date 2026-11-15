import { handleSummary } from '../server/summary.js'

export const POST = (request: Request): Promise<Response> => handleSummary(request, process.env)
