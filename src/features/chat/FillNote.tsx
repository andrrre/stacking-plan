import type { ISODate } from '../../domain/types'
import { fillNotes, understood, type Fill } from './requirementFill'
import styles from './ChatPanel.module.css'

const SOURCE = { ai: 'Read by AI', offline: 'Offline parsing' } as const

/** What the assistant put into the search form: the fields in the form's words, any warnings, and who read them. */
export function FillNote({ fill, horizon }: { fill: Fill; horizon: ISODate }) {
  const parts = understood(fill.parsed)
  return (
    <div className={styles.fill} data-testid="chat-fill" data-source={fill.source} data-applied={String(fill.applied)}>
      <p className={styles.understood} data-testid="ask-understood">
        {parts.map((part, i) => (
          <span key={part} className={styles.part}>{part}{i < parts.length - 1 && <span aria-hidden="true"> ·</span>}</span>
        ))}
      </p>
      {fillNotes(fill, horizon).map((n) => <p key={n} className={styles.warning} data-testid="ask-warning">{n}</p>)}
      <p className={styles.source} data-testid="ask-status">{SOURCE[fill.source]} · check the fields below</p>
    </div>
  )
}
