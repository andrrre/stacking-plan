import { handleChat, handleChatStatus } from '../server/chat.js'

export const GET = (request: Request): Promise<Response> => handleChatStatus(request, process.env)
export const POST = (request: Request): Promise<Response> => handleChat(request, process.env)
