import { caveatText } from '../../domain/caveats'
import type { ShortlistEntry } from '../../domain/types'

/** What a client may read about an option: the caveats in client wording, plus the what-if line. */
export function optionNotes(e: ShortlistEntry, audience: 'broker' | 'client'): string[] {
  const notes = e.candidate.caveats.map((c) => caveatText(c, audience))
  return e.whatIf && audience === 'client' ? [...notes, 'Indicative: depends on lease changes not yet confirmed.'] : notes
}
