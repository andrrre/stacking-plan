import { piece, placeAt, type Piece, type Tone } from './rect'

// Low-poly office furniture, each built round its own centre on the floor (y0), facing +z, from boxes, cylinders and
// spheres. Pure: sizes in world units (one floor ≈ 4 m, so 0.25 is a metre). fitOut turns and places them.

/** An office chair: seat, back, column and a round base. `face` is the way its sitter looks (quarter turns from +z). */
export function chair(x: number, z: number, face: number, y0: number, tone: Tone = 'fabric'): Piece[] {
  const local = [
    piece('dark', 0, 0, 0.12, 0.008, 0.12, y0, 0, 'cylinder'),
    piece('metal', 0, 0, 0.018, 0.095, 0.018, y0, 0.008, 'cylinder'),
    piece(tone, 0, 0, 0.115, 0.022, 0.11, y0, 0.103),
    piece(tone, 0, -0.058, 0.11, 0.13, 0.02, y0, 0.13),
  ]
  return placeAt(local, x, z, face)
}

/** A plant in a pot: a low one, or a tall one with two clumps. */
export function plant(x: number, z: number, y0: number, tall = false): Piece[] {
  const pot = tall ? 0.12 : 0.09
  return [
    piece('pot', x, z, 0.09, pot, 0.09, y0, 0, 'cylinder'),
    piece('plant', x, z, 0.17, 0.15, 0.17, y0, pot - 0.02, 'sphere'),
    ...(tall ? [piece('leaf', x + 0.015, z - 0.01, 0.13, 0.13, 0.13, y0, pot + 0.1, 'sphere')] : []),
  ]
}

/** Footprint of a bench of `pairs` desk pairs (two desks face to face, with their chairs). */
export const benchSize = (pairs: number) => ({ w: 0.4 * pairs, d: 0.68 })

/**
 * A bench: `pairs` 1.6 m desks along x on each side of a low screen, monitors, a chair at every desk. `top`: the
 * desks' colour, `fabric`: the chairs'.
 */
export function deskBench(pairs: number, y0: number, top: Tone, fabric: Tone): Piece[] {
  const w = 0.4 * pairs
  const seats = Array.from({ length: pairs }, (_, i) => -w / 2 + 0.2 + 0.4 * i)
  return [
    piece(top, 0, -0.1, w, 0.018, 0.19, y0, 0.17),
    piece(top, 0, 0.1, w, 0.018, 0.19, y0, 0.17),
    piece('metal', -w / 2 + 0.008, 0, 0.012, 0.17, 0.36, y0),
    piece('metal', w / 2 - 0.008, 0, 0.012, 0.17, 0.36, y0),
    piece('fabric', 0, 0, w - 0.02, 0.07, 0.01, y0, 0.188),
    ...seats.flatMap((x) => [
      piece('dark', x, -0.035, 0.13, 0.08, 0.01, y0, 0.215),
      piece('dark', x, 0.035, 0.13, 0.08, 0.01, y0, 0.215),
      ...chair(x, -0.25, 0, y0, fabric),
      ...chair(x, 0.25, 2, y0, fabric),
    ]),
  ]
}

/** Footprint of a row of `desks` desks against a wall (behind it, at −z), chairs facing the wall. */
export const wallBenchSize = (desks: number) => ({ w: 0.4 * desks, d: 0.33 })

export function wallBench(desks: number, y0: number, top: Tone, fabric: Tone): Piece[] {
  const w = 0.4 * desks
  const back = -0.165
  const seats = Array.from({ length: desks }, (_, i) => -w / 2 + 0.2 + 0.4 * i)
  return [
    piece(top, 0, back + 0.09, w, 0.018, 0.17, y0, 0.17),
    piece('metal', -w / 2 + 0.008, back + 0.09, 0.012, 0.17, 0.15, y0),
    piece('metal', w / 2 - 0.008, back + 0.09, 0.012, 0.17, 0.15, y0),
    ...seats.flatMap((x) => [piece('dark', x, back + 0.03, 0.13, 0.08, 0.01, y0, 0.188), ...chair(x, back + 0.255, 2, y0, fabric)]),
  ]
}

/** A meeting table for `side` chairs along each long side (one at each end too when it is long). */
export function meetingTable(side: number, y0: number): Piece[] {
  const w = Math.max(side * 0.16 + 0.06, 0.3)
  const xs = Array.from({ length: side }, (_, i) => -w / 2 + (w / side) * (i + 0.5))
  const ends = side >= 3 ? [chair(-w / 2 - 0.08, 0, 1, y0), chair(w / 2 + 0.08, 0, 3, y0)].flat() : []
  return [
    piece('wood', 0, 0, w, 0.02, 0.26, y0, 0.175),
    piece('metal', -w / 4, 0, 0.05, 0.175, 0.05, y0, 0, 'cylinder'),
    piece('metal', w / 4, 0, 0.05, 0.175, 0.05, y0, 0, 'cylinder'),
    ...xs.flatMap((x) => [...chair(x, -0.2, 0, y0), ...chair(x, 0.2, 2, y0)]),
    ...ends,
  ]
}

export const meetingTableSize = (side: number) => ({ w: Math.max(side * 0.16 + 0.06, 0.3) + (side >= 3 ? 0.3 : 0), d: 0.54 })

/** Footprint of the reception desk: a counter facing +z (visitors' side), the receptionist behind it. */
export const RECEPTION = { w: 0.5, d: 0.42 }

export function reception(y0: number): Piece[] {
  return [
    piece('wood', 0, 0.12, 0.5, 0.27, 0.04, y0),
    piece('pale', 0, 0.1, 0.52, 0.016, 0.1, y0, 0.27),
    piece('wood', -0.23, 0.0, 0.04, 0.27, 0.2, y0),
    piece('pale', 0, 0.01, 0.46, 0.018, 0.18, y0, 0.17),
    piece('dark', 0.08, 0.06, 0.13, 0.08, 0.01, y0, 0.188),
    ...chair(0.04, -0.12, 0, y0, 'accent'),
  ]
}

/** A sofa `len` long facing +z: base, seat, back and arms. */
export function sofa(len: number, y0: number, tone: Tone = 'accent'): Piece[] {
  return [
    piece(tone, 0, 0.01, len - 0.08, 0.1, 0.18, y0, 0.01),
    piece(tone, 0, -0.08, len, 0.2, 0.05, y0, 0.01),
    piece(tone, -len / 2 + 0.025, 0.01, 0.05, 0.15, 0.2, y0, 0.01),
    piece(tone, len / 2 - 0.025, 0.01, 0.05, 0.15, 0.2, y0, 0.01),
  ]
}

const coffeeTable = (x: number, z: number, y0: number): Piece[] => [
  piece('wood', x, z, 0.2, 0.012, 0.2, y0, 0.1, 'cylinder'),
  piece('metal', x, z, 0.03, 0.1, 0.03, y0, 0, 'cylinder'),
]

/** Footprint of a lounge corner: the full one (sofa, two armchairs, coffee table, rug, plant) or a small one. */
export const loungeSize = (full: boolean) => (full ? { w: 0.8, d: 0.72 } : { w: 0.36, d: 0.36 })

/** A lounge corner facing +z (the sofa's back at −z). */
export function lounge(full: boolean, y0: number): Piece[] {
  if (!full) return [...placeAt(sofa(0.24, y0), 0, -0.06, 0), ...plant(0.12, 0.12, y0)]
  return [
    piece('rug', 0, 0.02, 0.66, 0.004, 0.52, y0),
    ...placeAt(sofa(0.5, y0), 0, -0.24, 0),
    ...coffeeTable(0, 0, y0),
    ...placeAt(sofa(0.22, y0, 'fabric'), -0.17, 0.24, 2),
    ...placeAt(sofa(0.22, y0, 'fabric'), 0.17, 0.24, 2),
    ...plant(0.33, -0.29, y0, true),
  ]
}

/** Footprint of a kitchenette `len` long against a wall (behind it, at −z). */
export const kitchenSize = (len: number) => ({ w: len, d: 0.17 })

/** A kitchenette: base cupboards, worktop with a sink, wall cupboards and a tall fridge at one end. */
export function kitchen(len: number, y0: number): Piece[] {
  const back = -0.085
  const run = len - 0.16
  const cx = -len / 2 + run / 2
  return [
    piece('pale', cx, back + 0.075, run, 0.215, 0.15, y0),
    piece('wood', cx, back + 0.08, run, 0.014, 0.16, y0, 0.215),
    piece('metal', cx + run / 4, back + 0.08, 0.12, 0.004, 0.09, y0, 0.229),
    piece('pale', cx, back + 0.045, run, 0.16, 0.09, y0, 0.4),
    piece('metal', len / 2 - 0.08, back + 0.08, 0.15, 0.47, 0.16, y0),
  ]
}

/** A high table with two stools (the kitchenette's). */
export const CAFE = { w: 0.34, d: 0.2 }

export function cafeTable(y0: number): Piece[] {
  return [
    piece('wood', 0, 0, 0.18, 0.012, 0.18, y0, 0.26, 'cylinder'),
    piece('metal', 0, 0, 0.03, 0.26, 0.03, y0, 0, 'cylinder'),
    piece('accent', -0.13, 0, 0.07, 0.18, 0.07, y0, 0, 'cylinder'),
    piece('accent', 0.13, 0, 0.07, 0.18, 0.07, y0, 0, 'cylinder'),
  ]
}

/** An office's furniture, facing +z (its glass front): a desk with a monitor, the chair behind it, a guest chair, a cabinet and a plant. */
export function officeSet(w: number, d: number, y0: number): Piece[] {
  const back = -d / 2
  return [
    piece('wood', 0, back + 0.3, 0.36, 0.018, 0.18, y0, 0.17),
    piece('metal', -0.17, back + 0.3, 0.012, 0.17, 0.16, y0),
    piece('metal', 0.17, back + 0.3, 0.012, 0.17, 0.16, y0),
    piece('dark', 0, back + 0.25, 0.14, 0.085, 0.01, y0, 0.188),
    ...chair(0, back + 0.14, 0, y0, 'accent'),
    ...chair(0.06, back + 0.5, 2, y0),
    piece('pale', -w / 2 + 0.08, back + 0.12, 0.1, 0.3, 0.2, y0),
    ...plant(w / 2 - 0.09, back + 0.09, y0),
  ]
}
