import { formatLongDate, formatNumber, formatPsf } from '../../domain/format'
import type { SummaryCopy, SummaryRequest } from '../../shared/summary.schema'

type Option = SummaryRequest['options'][number]

const HEADLINE_MAX = 90
const PARAGRAPH_MAX = 600
const COUNT_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five']

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** "A", "A and B", "A, B and C". */
function listOf(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "10,500 SF" for one value or all-equal, "10,500 to 12,000 SF" for a spread. */
function span(values: readonly number[], format: (n: number) => string, unit: string): string {
  const [lo, hi] = [Math.min(...values), Math.max(...values)]
  return lo === hi ? `${format(lo)}${unit}` : `${format(lo)} to ${format(hi)}${unit}`
}

/** A note as a sentence: leading capital, one closing stop. */
const sentence = (note: string) => `${note.charAt(0).toUpperCase()}${note.slice(1).replace(/\.$/, '')}.`

/** A note as a clause after its option's label: no closing stop, and a leading capital lowered ("Subject to" → "subject to"). */
const clause = (note: string) => note.replace(/\.$/, '').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase())

/**
 * The notes as sentences. One option: each note on its own ("Subject to … . Indicative: …"). Several: each option's
 * label leads its first note ("Suite 600 – subject to … ."), and any further notes follow as sentences.
 */
function notesSentence(options: readonly Option[]): string {
  const withNotes = options.filter((o) => o.notes.length > 0)
  if (options.length === 1) return withNotes.flatMap((o) => o.notes.map(sentence)).join(' ')
  return withNotes
    .map((o) => {
      const [first = '', ...rest] = o.notes
      return [`${o.label} – ${clause(first)}.`, ...rest.map(sentence)].join(' ')
    })
    .join(' ')
}

function rentPhrase(options: readonly Option[]): string {
  const rents = options.flatMap((o) => (o.blendedRentPsf === undefined ? [] : [o.blendedRentPsf]))
  if (rents.length === 0) return ''
  const plural = Math.min(...rents) !== Math.max(...rents)
  return `${plural ? 'asking rents' : 'an asking rent'} of ${span(rents, formatPsf, '')} per SF per year`
}

function single(o: Option, building: string): SummaryCopy {
  const rent = rentPhrase([o])
  const text = `${o.label} on floor ${o.floor} offers ${formatNumber(o.totalSf)} SF${rent ? ` at ${rent}` : ''}, available from ${formatLongDate(o.availableFrom)}.`
  return { headline: clip(`${o.label} at ${building}`, HEADLINE_MAX), paragraph: clip([text, notesSentence([o])].filter(Boolean).join(' '), PARAGRAPH_MAX) }
}

function several(options: readonly Option[], building: string): SummaryCopy {
  const count = `${COUNT_WORDS[options.length] ?? options.length} office options`
  const earliest = options.reduce((a, b) => (b.availableFrom < a.availableFrom ? b : a), options[0] as Option)
  const labels = listOf(options.map((o) => `${o.label} (floor ${o.floor})`))
  const rent = rentPhrase(options)
  const sizes = options.every((o) => o.totalSf === options[0]?.totalSf)
    ? `${formatNumber(options[0]?.totalSf ?? 0)} SF each`
    : span(options.map((o) => o.totalSf), formatNumber, ' SF')
  const details = `They range from ${sizes}${rent ? ` at ${rent}` : ''}, the earliest available from ${formatLongDate(earliest.availableFrom)} (${earliest.label}).`
  const introFull = `${labels} are shortlisted.`
  const introShort = `${count} are shortlisted at ${building}.`
  const notes = notesSentence(options)
  // Notes are caveats and are never dropped for length; the descriptive sentences give way first.
  const variants = [[introFull, details, notes], [introShort, details, notes], [introShort, notes]].map((p) => p.filter(Boolean).join(' '))
  const fits = variants.find((v) => v.length <= PARAGRAPH_MAX)
  return {
    headline: clip(`${count} at ${building}`, HEADLINE_MAX),
    paragraph: fits ?? clip(variants[2] ?? '', PARAGRAPH_MAX),
  }
}

/**
 * The deterministic intro copy: what a client sees with no API key, on any error, and until the AI copy arrives.
 * Uses only the request, which is already client-safe.
 */
export function templateSummary(req: SummaryRequest): SummaryCopy {
  const [first] = req.options
  if (!first) return { headline: clip(req.buildingName, HEADLINE_MAX), paragraph: 'No options are shortlisted yet.' }
  return req.options.length === 1 && first ? single(first, req.buildingName) : several(req.options, req.buildingName)
}
