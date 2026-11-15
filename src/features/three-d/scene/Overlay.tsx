import type { LabelContent } from '../labels3d'
import type { Layout3D } from '../layout3d'
import type { SuiteVisual } from '../../stack/suiteVisual'
import { ClockGlyph, LockGlyph } from '../../stack/SuiteCell'
import { bind, register, type OverlayRefs } from './overlayRefs'
import styles from '../three-d.module.css'

// The HTML drawn over the canvas: crisp text without font loading or textures. React renders the content;
// the frame loop (overlaySync) positions it and picks which parts show.

type Props = {
  layout: Layout3D
  visuals: ReadonlyMap<string, SuiteVisual>
  contents: ReadonlyMap<string, LabelContent>
  ghosts: ReadonlySet<string>
  refs: OverlayRefs
}

function Label({ v, c, ghost, refs }: { v: SuiteVisual; c: LabelContent; ghost: boolean; refs: OverlayRefs }) {
  return (
    <div
      ref={register(refs.labels, v.suite.id)}
      className={styles.label}
      data-testid={`label3d-${v.suite.id}`}
      data-fill={v.fill}
      data-ghost={String(ghost)}
      data-hidden="true"
    >
      {c.cue && (
        <span className={styles.lCue} data-kind={c.cue.kind}>
          {c.cue.kind === 'clock' && <ClockGlyph />}
          {c.cue.kind === 'lock' && <LockGlyph />}
          {c.cue.text}
        </span>
      )}
      <span className={styles.lNumber}>{c.number}</span>
      {c.tenant && <span className={styles.lTenant}>{c.tenant}</span>}
      <span className={styles.lSf}>{c.sf}</span>
      {v.modified && <span className={styles.modifiedDot} />}
    </div>
  )
}

function Rings({ layout, refs }: Pick<Props, 'layout' | 'refs'>) {
  const ring = (key: string, kind: string) => (
    <polygon key={key} ref={register(refs.rings, key)} className={styles.ring} data-kind={kind} data-on="false" points="" />
  )
  return (
    <svg className={styles.rings}>
      {ring('hover', 'hover')}
      {layout.runs.flatMap((r) => [ring(`run-${r.rank}`, 'run'), ring(`run-${r.rank}-inner`, 'run-inner')])}
      {ring('selected', 'selected')}
      {ring('selected-inner', 'selected-inner')}
      {ring('focus', 'focus')}
    </svg>
  )
}

export function Overlay({ layout, visuals, contents, ghosts, refs }: Props) {
  return (
    <div className={styles.overlay} aria-hidden="true">
      <Rings layout={layout} refs={refs} />
      {layout.tags.map((t) => (
        <span key={t.floor} ref={register(refs.tags, t.floor)} className={styles.floorTag} data-testid={`floor3d-${t.floor}`}>
          {t.floor}
        </span>
      ))}
      {layout.suites.map((b) => {
        const v = visuals.get(b.id)
        const c = contents.get(b.id)
        return v && c ? <Label key={b.id} v={v} c={c} ghost={ghosts.has(b.id)} refs={refs} /> : null
      })}
      {layout.runs.map((r) => (
        <span key={r.rank} ref={register(refs.badges, r.rank)} className={styles.badge} data-testid={`badge3d-${r.rank}`}>
          {r.rank}
        </span>
      ))}
      <div ref={bind(refs.tooltip)} className={styles.tooltip} data-testid="tooltip3d" hidden />
    </div>
  )
}
