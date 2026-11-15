import { useEffect, useMemo, useState } from 'react'
import { BUNDLED_BUILDINGS } from '../../data'
import type { ISODate } from '../../domain/types'
import type { SummaryCopy, SummaryRequest } from '../../shared/summary.schema'
import type { ClientOption } from '../shortlist/clientOptions'
import styles from './SummaryIntro.module.css'
import { summaryService } from './summaryService'
import { toSummaryRequest } from './summaryRequest'
import { templateSummary } from './templateSummary'

type Props = {
  buildingId: string
  buildingName: string
  asOf: ISODate
  options: readonly ClientOption[]
  fetchFn?: typeof fetch
}

/**
 * The summary's headline and paragraph. The templated copy shows at once, so the page and its print never wait on
 * the network; AI copy replaces it only if it arrives, validates, and still belongs to the options on screen.
 * One request per summary open (and per change of the options), cancelled when either ends. Imported buildings
 * may hold real data, and only bundled mock data is ever sent (DESIGN §6.6), so they get the template alone.
 */
export function SummaryIntro({ buildingId, buildingName, asOf, options, fetchFn }: Props) {
  const key = JSON.stringify(toSummaryRequest(buildingName, asOf, options))
  const sendable = options.length > 0 && BUNDLED_BUILDINGS.some((b) => b.id === buildingId)
  const [ai, setAi] = useState<{ key: string; copy: SummaryCopy } | null>(null)
  const template = useMemo(() => templateSummary(JSON.parse(key) as SummaryRequest), [key])

  useEffect(() => {
    if (!sendable) return undefined
    const controller = new AbortController()
    void summaryService(JSON.parse(key) as SummaryRequest, fetchFn, controller.signal).then((result) => {
      if (!controller.signal.aborted && result.source === 'ai') setAi({ key, copy: result.copy })
    })
    return () => controller.abort()
  }, [key, sendable, fetchFn])

  if (options.length === 0) return null
  const fromAi = ai?.key === key
  const copy = fromAi ? ai.copy : template
  return (
    <section className={styles.intro} data-testid="summary-intro" data-source={fromAi ? 'ai' : 'template'} aria-labelledby="summary-intro-title">
      <h3 id="summary-intro-title" className={styles.headline}>{copy.headline}</h3>
      <p className={styles.paragraph}>{copy.paragraph}</p>
    </section>
  )
}
