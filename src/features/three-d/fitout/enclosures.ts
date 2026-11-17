import { SUITE_H } from '../layout3d'
import { meetingTable, officeSet } from './furniture'
import { piece, placeAt, type Piece, type Rect } from './rect'
import { FLOOR_TOP } from './shell'

// A glazed room in the front zone, its back to the corridor wall: a meeting room (a table for four to eight and a
// screen on the wall) or an office (a desk, two chairs, a cabinet and a plant). Glass to the ceiling on the aisle
// sides, a frosted band across it at eye level, and a glass door near the side facing the main aisle. Pure.

const GLASS_T = 0.012
const BAND = { lift: 0.3, h: 0.028 }
const DOOR = { w: 0.22, h: 0.55, frame: 0.012, inset: 0.05 }
const height = SUITE_H - FLOOR_TOP // from the fit-out's base (y0) to the ceiling

export type Enclosure = { pieces: Piece[]; seats: number; walls: number; doors: number }

/** A glass pane from a to b along x (at z) or along z (at x), floor to ceiling, with the frosted band across it. */
function pane(a: number, b: number, at: number, y0: number, alongZ: boolean, lift = 0): Piece[] {
  const mid = (a + b) / 2
  const len = b - a
  if (len <= 0.005) return []
  const box = (tone: Piece['tone'], h: number, l: number, d: number) =>
    (alongZ ? piece(tone, at, mid, d, h, len, y0, l) : piece(tone, mid, at, len, h, d, y0, l))
  return [box('glass', height - lift, lift, GLASS_T), ...(lift === 0 ? [box('pale', BAND.h, BAND.lift, GLASS_T + 0.004)] : [])]
}

/** The glass front (along x at the room's front edge) with a door near the inner side, and the glass side at the inner side. */
function glazing(r: Rect, inner: 'x0' | 'x1', y0: number): Piece[] {
  const z = r.z0 + GLASS_T / 2
  const d0 = inner === 'x1' ? r.x1 - DOOR.inset - DOOR.w : r.x0 + DOOR.inset
  const d1 = d0 + DOOR.w
  const sideX = inner === 'x1' ? r.x1 - GLASS_T / 2 : r.x0 + GLASS_T / 2
  const handleX = inner === 'x1' ? d0 + 0.03 : d1 - 0.03
  return [
    ...pane(r.x0, d0 - DOOR.frame, z, y0, false),
    ...pane(d1 + DOOR.frame, r.x1, z, y0, false),
    ...pane(d0 - DOOR.frame, d1 + DOOR.frame, z, y0, false, DOOR.h + DOOR.frame),
    ...pane(r.z0 + GLASS_T, r.z1, sideX, y0, true),
    piece('frame', d0 - DOOR.frame / 2, z, DOOR.frame, DOOR.h, 0.024, y0),
    piece('frame', d1 + DOOR.frame / 2, z, DOOR.frame, DOOR.h, 0.024, y0),
    piece('frame', (d0 + d1) / 2, z, DOOR.w + 2 * DOOR.frame, DOOR.frame, 0.024, y0, DOOR.h),
    piece('glass', (d0 + d1) / 2, z, DOOR.w - 0.004, DOOR.h - 0.006, GLASS_T * 0.8, y0, 0.003),
    piece('metal', handleX, z - 0.012, 0.01, 0.12, 0.012, y0, 0.2),
  ]
}

/** How many chairs a side the meeting room's table seats, along its depth. */
const sideSeats = (r: Rect) => Math.min(Math.max(Math.floor((r.z1 - r.z0 - 0.5) / 0.17), 2), 4)

/** A meeting room in `r`: the table along the room's depth, a screen on the corridor wall at its end. */
export function meetingRoom(r: Rect, inner: 'x0' | 'x1', y0: number): Enclosure {
  const cx = (r.x0 + r.x1) / 2
  const cz = (r.z0 + r.z1) / 2 + 0.02
  const side = sideSeats(r)
  return {
    pieces: [
      ...glazing(r, inner, y0),
      ...placeAt(meetingTable(side, y0), cx, cz, 1),
      piece('dark', cx, r.z1 - 0.008, 0.3, 0.17, 0.01, y0, 0.3),
    ],
    seats: 2 * side + (side >= 3 ? 2 : 0),
    walls: 2,
    doors: 1,
  }
}

/** An office in `r`: its desk by the corridor wall, facing the glass. */
export function office(r: Rect, inner: 'x0' | 'x1', y0: number): Enclosure {
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  return {
    pieces: [...glazing(r, inner, y0), ...placeAt(officeSet(w - 0.04, d - 0.04, y0), (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 2)],
    seats: 2,
    walls: 2,
    doors: 1,
  }
}
