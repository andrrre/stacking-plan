import { SUITE_H } from '../layout3d'
import { columnXs } from '../tourRoom'
import { entryX } from '../tourCamera'
import { DOOR, WALL_T, type RoomPlan } from './roomPlan'
import { grow, overlaps, piece, rectAt, rectW, type Piece, type Rect } from './rect'

// The suite's shell from inside: party walls on both sides, the corridor wall with its entrance door (frame, open
// leaf, handle) and a glass sidelight, mullions, sill and transom on both facades, the carpet, ceiling light panels
// and the structural columns inside the room. Pure: a plan in, pieces out. The facades keep the bays the camera
// flies through clear (enterVia), and the door stands open on its line.

/** The floor finish's top and the fit-out's base, just above the room's floor. */
export const FLOOR_TOP = 0.012
const FLOOR_BASE = 0.008
const MULLION = { w: 0.014, d: 0.03, pane: 0.4 }
const SILL_H = 0.05
const TRANSOM = 0.62 // above the floor: a door's height and a bit, over the camera's eye
const LEAF_T = 0.012
const COLUMN = 0.09
const COLUMN_CLEAR = 0.5 // no column within this of the eye's clear zone: one at arm's length would fill the view
const ART = { w: 0.36, h: 0.24, lift: 0.3, every: 2.2 } // framed panels along the party walls
const SKIRTING = { h: 0.022, t: 0.006 }
const BOARD = { w: 0.62, h: 0.27, lift: 0.26 } // a whiteboard (≈ 2.5 × 1.1 m)
const PANELS = { w: 0.2, gap: 0.06, h: 0.26, lift: 0.3 } // three framed panels in a row
const CREDENZA = { w: 0.72, h: 0.15, d: 0.11 } // a low cabinet under them
const LIGHT = { w: 0.3, d: 0.15, h: 0.006, spacing: 0.8, most: 100 }
/** The clear width the camera's way in keeps through the street facade's glazing. */
const ENTRY_CLEAR = 0.2

export type Shell = { pieces: Piece[]; walls: number; doors: number; obstacles: Rect[] }

const height = SUITE_H - FLOOR_BASE

/** A full-height wall piece from x0 to x1 (or z0 to z1 when `alongZ`) on the line `at`. */
function wallRun(tone: Piece['tone'], a: number, b: number, at: number, y0: number, alongZ: boolean, lift = 0, h = height - lift): Piece {
  const mid = (a + b) / 2
  const len = b - a
  return alongZ ? piece(tone, at, mid, WALL_T, h, len, y0, lift) : piece(tone, mid, at, len, h, WALL_T, y0, lift)
}

function partyWalls(p: RoomPlan, y0: number): Piece[] {
  const f = p.foot
  return [f.x0 + WALL_T / 2, f.x1 - WALL_T / 2].map((x) => wallRun('party', f.z0 + 0.04, f.z1 - 0.04, x, y0, true))
}

/** Where the sidelight goes: on the wider side of the door, if the room has space for it there. */
function sidelight(p: RoomPlan): { x0: number; x1: number } | null {
  const o = { x0: p.door.x - DOOR.w / 2, x1: p.door.x + DOOR.w / 2 }
  const room = DOOR.side + 2 * DOOR.frame + 0.04
  const right = p.inner.x1 - o.x1
  const left = o.x0 - p.inner.x0
  if (Math.max(left, right) < room) return null
  return right >= left ? { x0: o.x1 + DOOR.frame, x1: o.x1 + DOOR.frame + DOOR.side } : { x0: o.x0 - DOOR.frame - DOOR.side, x1: o.x0 - DOOR.frame }
}

/** The corridor wall either side of the opening (door and sidelight together) and the wall over it, to the ceiling. */
function corridorWall(p: RoomPlan, y0: number, side: { x0: number; x1: number } | null): Piece[] {
  const z = p.corridorZ
  const lo = Math.min(p.door.x - DOOR.w / 2, side?.x0 ?? Infinity) - DOOR.frame
  const hi = Math.max(p.door.x + DOOR.w / 2, side?.x1 ?? -Infinity) + DOOR.frame
  const runs = [[p.foot.x0 + WALL_T, lo], [hi, p.foot.x1 - WALL_T]].filter(([a = 0, b = 0]) => b - a > 0.005)
  return [
    ...runs.map(([a = 0, b = 0]) => wallRun('wall', a, b, z, y0, false)),
    wallRun('wall', lo, hi, z, y0, false, DOOR.h + DOOR.frame),
  ]
}

/** The door's frame (jambs and head), its leaf standing open into the room on its hinge, and a handle on the leaf. */
function entranceDoor(p: RoomPlan, y0: number, side: { x0: number; x1: number } | null): Piece[] {
  const z = p.corridorZ
  const o = { x0: p.door.x - DOOR.w / 2, x1: p.door.x + DOOR.w / 2 }
  const fd = WALL_T + 0.012
  const jambs = [o.x0 - DOOR.frame / 2, o.x1 + DOOR.frame / 2, ...(side ? [side.x0 < o.x0 ? side.x0 - DOOR.frame / 2 : side.x1 + DOOR.frame / 2] : [])]
  const head = { x0: Math.min(o.x0, side?.x0 ?? o.x0) - DOOR.frame, x1: Math.max(o.x1, side?.x1 ?? o.x1) + DOOR.frame }
  // Hinged on the side away from the sidelight, swung square into the room.
  const hingeLeft = !side || side.x0 > o.x0
  const leafX = hingeLeft ? o.x0 + LEAF_T / 2 + 0.002 : o.x1 - LEAF_T / 2 - 0.002
  const leafZ = z - WALL_T / 2 - DOOR.w / 2
  const handleX = leafX + (hingeLeft ? 1 : -1) * (LEAF_T / 2 + 0.006)
  return [
    ...jambs.map((x) => piece('frame', x, z, DOOR.frame, DOOR.h, fd, y0)),
    piece('frame', (head.x0 + head.x1) / 2, z, head.x1 - head.x0, DOOR.frame, fd, y0, DOOR.h),
    piece('wood', leafX, leafZ, LEAF_T, DOOR.h - 0.01, DOOR.w - 0.012, y0, 0.004),
    piece('metal', handleX, leafZ - DOOR.w / 2 + 0.035, 0.008, 0.012, 0.04, y0, 0.25),
    ...(side ? [piece('glass', (side.x0 + side.x1) / 2, z, side.x1 - side.x0, DOOR.h, 0.01, y0)] : []),
  ]
}

/** Mullions dividing each bay between the facade's columns into panes, but none in the camera's way in. */
function mullionXs(x0: number, x1: number, clear: number | null): number[] {
  const cols = columnXs(x0, x1)
  return cols.slice(1).flatMap((b, i) => {
    const a = cols[i] ?? b
    const n = Math.max(Math.round((b - a) / MULLION.pane), 1)
    return Array.from({ length: n - 1 }, (_, k) => a + ((b - a) * (k + 1)) / n)
  }).filter((x) => clear === null || Math.abs(x - clear) > ENTRY_CLEAR)
}

function facade(p: RoomPlan, z: number, y0: number, clear: number | null): Piece[] {
  const f = p.foot
  const w = f.x1 - f.x0
  const inward = z < 0 ? 1 : -1
  const zi = z + inward * 0.03
  return [
    ...mullionXs(f.x0, f.x1, clear).map((x) => piece('frame', x, zi, MULLION.w, height, MULLION.d, y0)),
    piece('frame', (f.x0 + f.x1) / 2, zi, w, SILL_H, MULLION.d + 0.02, y0),
    piece('frame', (f.x0 + f.x1) / 2, zi, w, MULLION.w, MULLION.d, y0, TRANSOM),
  ]
}

/** Light panels on a grid under the ceiling, spaced so a whole floor has at most LIGHT.most of them. */
function ceilingLights(p: RoomPlan, y0: number): Piece[] {
  const r = p.inner
  const s = Math.max(LIGHT.spacing, Math.sqrt((rectW(r) * (r.z1 - r.z0)) / LIGHT.most))
  const nx = Math.max(Math.floor(rectW(r) / s), 1)
  const nz = Math.max(Math.floor((r.z1 - r.z0) / s), 1)
  const w = Math.min(LIGHT.w, rectW(r) * 0.6)
  return Array.from({ length: nx * nz }, (_, i) => {
    const x = r.x0 + ((i % nx) + 0.5) * (rectW(r) / nx)
    const z = r.z0 + (Math.floor(i / nx) + 0.5) * ((r.z1 - r.z0) / nz)
    return piece('light', x, z, w, LIGHT.h, LIGHT.d, y0, height - LIGHT.h - 0.002)
  })
}

/** Columns on the facade grid, a third and two thirds of the way back, but none in an aisle or by the eye. */
function columns(p: RoomPlan): Rect[] {
  const f = p.foot
  const d = f.z1 - f.z0
  const xs = columnXs(f.x0, f.x1).slice(1, -1)
  const zs = [f.z0 + d / 3, f.z0 + (2 * d) / 3]
  const keepOut = [...p.lanes, p.front].map((r) => grow(r, 0.03)).concat(grow(p.keep, COLUMN_CLEAR))
  return zs.flatMap((z) => xs.map((x) => rectAt(x, z, COLUMN, COLUMN))).filter((c) => !keepOut.some((k) => overlaps(c, k)))
}

/** A skirting line along both party walls, the length of the suite. */
function skirting(p: RoomPlan, y0: number): Piece[] {
  const f = p.foot
  return [p.inner.x0 + SKIRTING.t / 2, p.inner.x1 - SKIRTING.t / 2]
    .map((x) => piece('frame', x, (f.z0 + f.z1) / 2, SKIRTING.t, SKIRTING.h, f.z1 - f.z0 - 0.08, y0))
}

type Dressing = { pieces: Piece[]; rects: Rect[] }

/** A whiteboard on the wall at x (facing `out`), centred on z: frame, board and pen tray. */
function whiteboard(x: number, out: number, z: number, y0: number): Piece[] {
  return [
    piece('frame', x + out * 0.006, z, 0.012, BOARD.h, BOARD.w, y0, BOARD.lift),
    piece('pale', x + out * 0.013, z, 0.004, BOARD.h - 0.024, BOARD.w - 0.024, y0, BOARD.lift + 0.012),
    piece('metal', x + out * 0.02, z, 0.025, 0.008, BOARD.w * 0.6, y0, BOARD.lift - 0.006),
  ]
}

/** Three framed panels in a row on the wall at x, centred on z, over a low credenza if there is floor for it. */
function panelsAndCredenza(x: number, out: number, z: number, y0: number, credenza: boolean): Piece[] {
  const step = PANELS.w + PANELS.gap
  const tones = ['accent', 'wood', 'plant'] as const
  const panels = tones.flatMap((tone, i) => {
    const pz = z + (i - 1) * step
    return [
      piece('frame', x + out * 0.006, pz, 0.012, PANELS.h, PANELS.w, y0, PANELS.lift),
      piece(tone, x + out * 0.013, pz, 0.004, PANELS.h - 0.03, PANELS.w - 0.03, y0, PANELS.lift + 0.015),
    ]
  })
  const cx = x + out * (CREDENZA.d / 2 + 0.003)
  const cabinet = [
    piece('pale', cx, z, CREDENZA.d, CREDENZA.h, CREDENZA.w, y0),
    piece('wood', cx, z, CREDENZA.d + 0.008, 0.012, CREDENZA.w + 0.008, y0, CREDENZA.h),
    ...[-1, 1].map((k) => piece('metal', x + out * (CREDENZA.d + 0.004), z + k * CREDENZA.w / 4, 0.004, 0.06, 0.005, y0, 0.06)),
  ]
  return credenza ? [...panels, ...cabinet] : panels
}

/**
 * The party walls dressed square across from the viewer (the side views): a whiteboard on one, three framed panels
 * over a low credenza on the other, each only where nothing in `blocked` (the items, the aisles) stands at the wall.
 * Returns the pieces and their plan rectangles.
 */
export function sideDressing(p: RoomPlan, blocked: readonly Rect[]): Dressing {
  const y0 = p.foot.floor + FLOOR_TOP
  const z = p.eye.z
  const free = (r: Rect) => !blocked.some((b) => overlaps(r, b, 0.02))
  const left = p.inner.x0
  const right = p.inner.x1
  const board = rectAt(left + 0.015, z, 0.03, BOARD.w)
  const wall = rectAt(right - 0.015, z, 0.03, 3 * PANELS.w + 2 * PANELS.gap)
  const cab = rectAt(right - CREDENZA.d / 2 - 0.004, z, CREDENZA.d + 0.008, CREDENZA.w + 0.008)
  const withCab = free(cab)
  const parts: Dressing[] = [
    free(board) ? { pieces: whiteboard(left, 1, z, y0), rects: [board] } : { pieces: [], rects: [] },
    free(wall) ? { pieces: panelsAndCredenza(right, -1, z, y0, withCab), rects: withCab ? [wall, cab] : [wall] } : { pieces: [], rects: [] },
  ]
  return { pieces: parts.flatMap((d) => d.pieces), rects: parts.flatMap((d) => d.rects) }
}

/**
 * Framed panels hung along both party walls through the open-plan zone, every ART.every or so, but none over
 * anything standing against the wall there (`clear`: the items' plan rectangles).
 */
export function wallArt(p: RoomPlan, clear: readonly Rect[]): Piece[] {
  const y0 = p.foot.floor + FLOOR_TOP
  const d = p.desks.z1 - p.desks.z0
  const n = Math.max(Math.floor(d / ART.every), 1)
  const zs = Array.from({ length: n }, (_, i) => p.desks.z0 + (d * (i + 0.5)) / n)
  return [p.inner.x0, p.inner.x1].flatMap((x) => zs.flatMap((z, i) => {
    const out = x < p.eye.x ? 1 : -1
    if (clear.some((r) => overlaps(r, rectAt(x, z, 0.1, ART.w), 0.03))) return []
    return [
      piece('frame', x + out * 0.006, z, 0.012, ART.h, ART.w, y0, ART.lift),
      piece(i % 2 === 0 ? 'accent' : 'wood', x + out * 0.013, z, 0.004, ART.h - 0.03, ART.w - 0.03, y0, ART.lift + 0.015),
    ]
  }))
}

/** The carpet: wall to wall, from the window to the corridor wall. */
function carpet(p: RoomPlan, y0: number): Piece[] {
  const f = p.foot
  const r = { x0: f.x0 + WALL_T, x1: f.x1 - WALL_T, z0: f.z0 + 0.03, z1: p.corridorZ - WALL_T / 2 }
  if (r.x1 - r.x0 <= 0.05) return []
  return [piece('carpet', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, FLOOR_TOP - FLOOR_BASE, r.z1 - r.z0, y0)]
}

/** The door's swing and the way through it: nothing may stand there. */
const doorClear = (p: RoomPlan): Rect =>
  ({ x0: p.door.x - DOOR.w / 2 - 0.03, x1: p.door.x + DOOR.w / 2 + 0.03, z0: p.corridorZ - DOOR.w - 0.08, z1: p.corridorZ })

export function shell(p: RoomPlan): Shell {
  const y0 = p.foot.floor + FLOOR_BASE
  const side = sidelight(p)
  const cols = columns(p)
  const pieces = [
    ...carpet(p, y0),
    ...partyWalls(p, y0),
    ...skirting(p, y0),
    ...corridorWall(p, y0, side),
    ...entranceDoor(p, y0, side),
    ...facade(p, p.foot.z0, y0, null),
    ...facade(p, p.foot.z1, y0, entryX(p.foot, p.foot.z1)),
    ...ceilingLights(p, y0),
    ...cols.map((c) => piece('wall', (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, COLUMN, height, COLUMN, y0)),
  ]
  return { pieces, walls: 3 + (side ? 1 : 0), doors: 1, obstacles: [...cols, doorClear(p)] }
}
