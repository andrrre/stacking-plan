import type { Box } from '../layout3d'

// Plan rectangles (x along the facade, z out of it) and the drawn pieces of a suite's interior. Pure helpers.

export type Rect = { x0: number; x1: number; z0: number; z1: number }

/**
 * What a piece is drawn in: the shell (walls, glass, frames, floor finishes, ceiling lights) and the fit-out
 * (wood, fabric in two tones, dark kit, pale tops, metal, plants and their pots). The scene maps each to a colour
 * from the palette's tokens.
 */
export type Tone =
  | 'wall' | 'party' | 'frame' | 'glass' | 'carpet' | 'rug' | 'light' | 'leaf'
  | 'wood' | 'fabric' | 'accent' | 'dark' | 'pale' | 'metal' | 'plant' | 'pot'

export type Shape = 'box' | 'cylinder' | 'sphere'

/** One drawn piece: a box's centre and size in world units (a cylinder or sphere fills that box). */
export type Piece = Box & { shape: Shape; tone: Tone }

export const rectW = (r: Rect) => r.x1 - r.x0
export const rectD = (r: Rect) => r.z1 - r.z0

/** True when `a` and `b` overlap by more than `gap` (a negative gap lets them come that close apart). */
export const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap

/** True when `a` lies within `outer` (to within a hair). */
export const within = (a: Rect, outer: Rect): boolean =>
  a.x0 >= outer.x0 - 1e-9 && a.x1 <= outer.x1 + 1e-9 && a.z0 >= outer.z0 - 1e-9 && a.z1 <= outer.z1 + 1e-9

export const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m })

export const rectAt = (x: number, z: number, w: number, d: number): Rect => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 })

/** A piece's plan footprint. */
export const planOf = (p: Box): Rect => rectAt(p.x, p.z, p.w, p.d)

/**
 * A piece standing on `y0`: centre (x, z), size w × h × d, its base `lift` above the floor.
 * The pieces of one item are built with this in the item's own frame, then turned and moved into place.
 */
export function piece(tone: Tone, x: number, z: number, w: number, h: number, d: number, y0: number, lift = 0, shape: Shape = 'box'): Piece {
  return { tone, shape, x, y: y0 + lift + h / 2, z, w, h, d }
}

/**
 * Pieces built round (0, 0) facing +z, turned `quarter` quarter turns (each +90° about y: +z → +x) and moved to
 * (x, z). Boxes stay square to the axes, so a turn swaps width and depth.
 */
export function placeAt(pieces: readonly Piece[], x: number, z: number, quarter: number): Piece[] {
  const q = ((quarter % 4) + 4) % 4
  return pieces.map((p) => {
    const [px, pz] = q === 0 ? [p.x, p.z] : q === 1 ? [p.z, -p.x] : q === 2 ? [-p.x, -p.z] : [-p.z, p.x]
    const swap = q % 2 === 1
    return { ...p, x: x + px, z: z + pz, w: swap ? p.d : p.w, d: swap ? p.w : p.d }
  })
}

/** The plan rectangle of a w × d footprint (in its own frame, facing +z) turned `quarter` times at (x, z). */
export const turnedRect = (x: number, z: number, w: number, d: number, quarter: number): Rect =>
  (((quarter % 2) + 2) % 2 === 1 ? rectAt(x, z, d, w) : rectAt(x, z, w, d))
