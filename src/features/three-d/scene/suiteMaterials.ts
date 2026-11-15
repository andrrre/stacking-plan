import { Color } from 'three'
import type { LookColours } from '../palette'
import type { SuiteBox } from '../layout3d'
import { SuiteMaterial } from './suiteMaterial'

// One material per suite (one shared shader program), so each suite can fade its own colour when the date
// or the colour mode changes. Owns every material it creates and disposes them.

export const COLOUR_MS = 180

type Tween = { from: Color; to: Color; ghostFrom: number; ghostTo: number; start: number }

const PATTERN_KIND = { hatch: 1, committed: 2 } as const
const PATTERN_GEOMETRY = { hatch: { period: 0.18, ratio: 0.375 }, committed: { period: 0.13, ratio: 0.34 } } as const

export class SuiteMaterials {
  private readonly mats = new Map<string, SuiteMaterial>()
  private readonly tweens = new Map<SuiteMaterial, Tween>()
  private readonly seen = new Set<SuiteMaterial>()
  private readonly applied = new Map<SuiteMaterial, string>() // the look key last applied, to skip repeats

  get(id: string): SuiteMaterial {
    const existing = this.mats.get(id)
    if (existing) return existing
    const m = new SuiteMaterial()
    this.mats.set(id, m)
    return m
  }

  /** Disposes the materials of suites that are no longer in the building. */
  retain(ids: ReadonlySet<string>): void {
    for (const [id, m] of this.mats) {
      if (ids.has(id)) continue
      m.dispose()
      this.mats.delete(id)
      this.tweens.delete(m)
      this.seen.delete(m)
      this.applied.delete(m)
    }
  }

  /**
   * Sets a suite's look. With `animateAt` (a timestamp) the fill and ghosting fade over COLOUR_MS. `key`
   * identifies the look (see lookKey); a suite whose key, colours and box are unchanged is skipped.
   */
  apply(id: string, c: LookColours, ghost: boolean, box: SuiteBox, animateAt: number | null, key: string): void {
    const m = this.get(id)
    const signature = `${key}|${JSON.stringify(c)}|${box.x},${box.y},${box.z},${box.w},${box.h},${box.d}`
    if (this.applied.get(m) === signature) return
    this.applied.set(m, signature)
    const u = m.u
    const target = new Color(c.base)
    const ghostTo = ghost ? 1 : 0
    const changed = !m.color.equals(target) || u.uGhost.value !== ghostTo
    if (this.seen.has(m) && changed && animateAt !== null) {
      this.tweens.set(m, { from: m.color.clone(), to: target, ghostFrom: u.uGhost.value, ghostTo, start: animateAt })
    } else if (changed) {
      this.tweens.delete(m)
      m.color.copy(target)
      u.uGhost.value = ghostTo
    }
    this.seen.add(m)
    m.depthWrite = !ghost
    u.uPatKind.value = c.pattern ? PATTERN_KIND[c.pattern.kind] : 0
    if (c.pattern) {
      u.uPatColor.value.set(c.pattern.hex)
      u.uPatAlpha.value = c.pattern.alpha
      u.uPatPeriod.value = PATTERN_GEOMETRY[c.pattern.kind].period
      u.uPatRatio.value = PATTERN_GEOMETRY[c.pattern.kind].ratio
    }
    u.uEdgeAlpha.value = c.edge ? 1 : 0
    if (c.edge) {
      u.uEdgeColor.value.set(c.edge.hex)
      u.uEdgePx.value = c.edge.px
      u.uEdgeDash.value = c.edge.dashed ? 1 : 0
    }
    u.uBoxMin.value.set(box.x - box.w / 2, box.y - box.h / 2, box.z - box.d / 2)
    u.uBoxMax.value.set(box.x + box.w / 2, box.y + box.h / 2, box.z + box.d / 2)
  }

  setHover(id: string | null): void {
    for (const [key, m] of this.mats) m.u.uHover.value = key === id ? 1 : 0
  }

  /** Advances running fades; true while any is still running (the caller renders another frame). */
  step(now: number): boolean {
    for (const [m, t] of this.tweens) {
      const k = Math.min(Math.max((now - t.start) / COLOUR_MS, 0), 1)
      const e = k * (2 - k) // ease out
      m.color.copy(t.from).lerp(t.to, e)
      m.u.uGhost.value = t.ghostFrom + (t.ghostTo - t.ghostFrom) * e
      if (k >= 1) this.tweens.delete(m)
    }
    return this.tweens.size > 0
  }

  /**
   * Frees the GPU side of every material. The materials themselves stay valid and in use (three re-uploads
   * one that is drawn again), so StrictMode's unmount/remount replay does not orphan the meshes' materials.
   */
  dispose(): void {
    for (const m of this.mats.values()) m.dispose()
    this.tweens.clear()
    this.applied.clear()
  }
}
