import type { LocalReason } from './useAssistant'

// The assistant's empty-state words: what it can do in each mode, and the example questions it can answer there.

export const AI_EXAMPLES = [
  'What is vacant on this date?',
  'Which leases expire in the next 12 months?',
  'Where could a 10,000 SF tenant go?',
] as const
/** The one example the offline parser can answer: it is a requirement. */
export const LOCAL_EXAMPLES = ['Where could a 10,000 SF tenant go?'] as const

export const AI_INTRO = 'Describe a requirement to search the building, or ask about vacancy, leases or a suite.'
export const LOCAL_INTRO: Record<LocalReason, string> = {
  unavailable: 'AI is unavailable, so a requirement (size, rent, move-in date) is read locally into the search form.',
  imported: 'AI is off for imported buildings: their data stays in this browser. A requirement (size, rent, move-in date) is read locally into the search form.',
}
export const SETUP_HINT = 'Add ANTHROPIC_API_KEY to .env and restart to turn the AI on.'
