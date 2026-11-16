import type { SuiteVisual } from './suiteVisual'

/**
 * The state attributes every suite element carries, in 2D and 3D (spec-technical §4). Tests and CSS read
 * these; the element adds its own data-testid (`suite-{id}` in 2D, `suite3d-{id}` on the 3D mirror).
 */
export function suiteDataAttributes(v: SuiteVisual, joinsNext: boolean) {
  return {
    'data-status': v.status.status,
    'data-overlay': v.status.status === 'vacant' ? v.status.overlay : 'none',
    'data-fill': v.fill,
    'data-risk': v.risk,
    'data-match-rank': v.matchRank ?? undefined,
    'data-dimmed': String(v.dimmed),
    'data-filtered': String(v.filtered),
    'data-modified': String(v.modified),
    'data-joins-next': joinsNext ? 'true' : undefined,
  }
}
