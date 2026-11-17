import { hashSeed, seededRandom } from '../city/plan'
import type { Mover } from '../city/traffic'
import type { Footprint } from '../tourCamera'
import { meetingRoom, office, type Enclosure } from './enclosures'
import {
  CAFE, RECEPTION, benchSize, cafeTable, deskBench, kitchen, kitchenSize, lounge, loungeSize, plant, reception, wallBench, wallBenchSize,
} from './furniture'
import { occupants, type Spot } from './occupants'
import { overlaps, placeAt, rectD, rectW, turnedRect, within, type Piece, type Rect, type Tone } from './rect'
import { roomPlan, type RoomPlan } from './roomPlan'
import { FLOOR_TOP, shell, wallArt } from './shell'

// A staged test fit for a suite on the tour: an illustration of how the space could be used, not its real layout
// (the stage says so). Pure and seeded by the suite: the same suite always gets the same rooms, desks and people.
// The shell first (walls, door, glazing, lights, columns), then items in order of priority, each placed only where it
// lies inside the room clear of the aisles, the eye, the door and everything placed before it: reception by the
// door, glazed meeting rooms and offices along the corridor wall, a kitchenette, a lounge by the window, desk
// benches nearest the viewer first up to a seat count set by the suite's size, then plants. A small suite simply
// fits fewer of them.

export type ItemKind = 'reception' | 'meeting' | 'office' | 'kitchen' | 'cafe' | 'lounge' | 'bench' | 'plant'
export type Item = { kind: ItemKind; rect: Rect; seats: number }

export type Interior = {
  plan: RoomPlan
  pieces: Piece[]
  items: Item[]
  walls: number // party walls, the corridor wall, its sidelight and the glazed rooms' partitions
  doors: number // the entrance and the glazed rooms' doors
  people: Mover[]
}

export type FitOutInput = { foot: Footprint; sf: number; seed: string }

/** The most pieces a whole floor is drawn with (instanced: a few draw calls whatever the count). */
export const MAX_PIECES = 1200
const SF_PER_SEAT = 110
const MAX_SEATS = 80
const SF_PER_ROOM = 2500
const MAX_ROOMS = 6
const SF_PER_PLANT = 1200
const GAP = 0.02

type Placed = Item & { pieces: Piece[]; walls: number; doors: number }
type Fit = { taken: Rect[]; placed: Placed[]; spots: Spot[] }
type Ctx = { plan: RoomPlan; y0: number; rand: () => number; sf: number; look: { top: Tone; fabric: Tone; pairs: number } }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const scaled = (sf: number, per: number, lo: number, hi: number) => clamp(Math.round((Number.isFinite(sf) ? Math.max(sf, 0) : 0) / per), lo, hi)

/** Inside the room and at least GAP from everything taken (a hair less, so an item set exactly GAP off an aisle fits). */
const fits = (f: Fit, plan: RoomPlan, rect: Rect) => within(rect, plan.inner) && !f.taken.some((t) => overlaps(rect, t, GAP - 1e-6))

/** `f` with `p` added if it fits; else `f` unchanged. */
const tryAdd = (f: Fit, plan: RoomPlan, p: Placed): Fit => (fits(f, plan, p.rect) ? { ...f, taken: [...f.taken, p.rect], placed: [...f.placed, p] } : f)

/** An item built round its centre, facing +z, turned `quarter` times and set at (x, z). */
function item(kind: ItemKind, local: Piece[], size: { w: number; d: number }, x: number, z: number, quarter: number, seats = 0): Placed {
  return { kind, rect: turnedRect(x, z, size.w, size.d, quarter), seats, pieces: placeAt(local, x, z, quarter), walls: 0, doors: 0 }
}

const enclosed = (kind: ItemKind, rect: Rect, e: Enclosure): Placed => ({ kind, rect, seats: e.seats, pieces: e.pieces, walls: e.walls, doors: e.doors })

/** The front zone either side of the way in. */
function frontSides(p: RoomPlan): { left: Rect; right: Rect } {
  const z0 = p.front.z0 + GAP // clear of the cross aisle
  return { left: { ...p.front, z0, x1: p.entry.x0 - GAP }, right: { ...p.front, z0, x0: p.entry.x1 + GAP } }
}

/** The reception desk beside the way in, on the wider side, near the door, facing the aisle. */
function placeReception(f: Fit, c: Ctx): Fit {
  const { left, right } = frontSides(c.plan)
  const onLeft = rectW(left) > rectW(right) || (rectW(left) === rectW(right) && c.rand() < 0.5)
  const half = RECEPTION.d / 2
  const x = onLeft ? left.x1 - half : right.x0 + half
  const z = c.plan.front.z1 - 0.08 - RECEPTION.w / 2
  return tryAdd(f, c.plan, item('reception', reception(c.y0), RECEPTION, x, z, onLeft ? 1 : 3, 1))
}

/** Glazed rooms along the corridor wall on one side, from the party wall towards the way in. */
function placeRoomsOn(f: Fit, c: Ctx, side: Rect, fromLeft: boolean, budget: number): Fit {
  let fit = f
  let edge = fromLeft ? side.x0 : side.x1
  for (let n = 0; n < budget; n++) {
    const meeting = n % 2 === 0 ? c.rand() < 0.75 : c.rand() < 0.35
    const w = meeting ? 1.1 : 0.8
    const rect = fromLeft ? { ...side, x0: edge, x1: edge + w } : { ...side, x0: edge - w, x1: edge }
    const inner = fromLeft ? 'x1' : 'x0'
    const e = meeting ? meetingRoom(rect, inner, c.y0) : office(rect, inner, c.y0)
    const next = tryAdd(fit, c.plan, enclosed(meeting ? 'meeting' : 'office', rect, e))
    if (next === fit) break
    fit = next
    edge = fromLeft ? rect.x1 + GAP : rect.x0 - GAP
  }
  return fit
}

function placeRooms(f: Fit, c: Ctx): Fit {
  const { left, right } = frontSides(c.plan)
  const budget = scaled(c.sf, SF_PER_ROOM, 0, MAX_ROOMS)
  const leftFirst = c.rand() < 0.5
  const one = Math.ceil(budget / 2)
  const a = placeRoomsOn(f, c, leftFirst ? left : right, leftFirst, one)
  const done = a.placed.length - f.placed.length
  return placeRoomsOn(a, c, leftFirst ? right : left, !leftFirst, budget - done)
}

/** A kitchenette against a party wall just behind the cross aisle, room to stand in front of it, and a high table. */
function placeKitchen(f: Fit, c: Ctx, onLeft: boolean): Fit {
  const p = c.plan
  const len = rectW(p.inner) > 4 ? 1 : 0.7
  const size = kitchenSize(len)
  const z = p.cross.z0 - GAP - len / 2
  const x = onLeft ? p.inner.x0 + size.d / 2 : p.inner.x1 - size.d / 2
  const k = item('kitchen', kitchen(len, c.y0), size, x, z, onLeft ? 1 : 3)
  const stand = onLeft ? { ...k.rect, x0: k.rect.x1 + GAP, x1: k.rect.x1 + GAP + 0.22 } : { ...k.rect, x0: k.rect.x0 - GAP - 0.22, x1: k.rect.x0 - GAP }
  if (!fits(f, p, k.rect) || !fits(f, p, stand)) return f
  const heading = onLeft ? -Math.PI / 2 : Math.PI / 2
  const sx = (stand.x0 + stand.x1) / 2
  const spots = [{ x: sx, z: z - len / 5, heading }, { x: sx, z: z + len / 5, heading: heading + (onLeft ? 0.6 : -0.6) }]
  const withKitchen = { taken: [...f.taken, k.rect, stand], placed: [...f.placed, k], spots: [...f.spots, ...spots] }
  const cx = onLeft ? stand.x1 + GAP + CAFE.w / 2 : stand.x0 - GAP - CAFE.w / 2
  return tryAdd(withKitchen, p, item('cafe', cafeTable(c.y0), CAFE, cx, z, 0, 2))
}

/** A lounge corner by the window against a party wall: the full one if it fits, else a small one. */
function placeLounge(f: Fit, c: Ctx, onLeft: boolean): Fit {
  const p = c.plan
  const tries = [true, false].map((full) => {
    const s = loungeSize(full)
    const x = onLeft ? p.inner.x0 + s.d / 2 : p.inner.x1 - s.d / 2
    return item('lounge', lounge(full, c.y0), s, x, p.window.z1 + GAP + s.w / 2, onLeft ? 1 : 3, full ? 5 : 2)
  })
  return tries.reduce((fit, t) => (fit === f ? tryAdd(f, p, t) : fit), f)
}

export function fitOut(input: FitOutInput): Interior {
  const plan = roomPlan(input.foot)
  const rand = seededRandom(hashSeed(`${input.seed}:fit-out`))
  const s = shell(plan)
  const look = { top: rand() < 0.5 ? 'pale' : 'wood', fabric: rand() < 0.7 ? 'fabric' : 'accent', pairs: rand() < 0.5 ? 2 : 3 } as const
  const c: Ctx = { plan, y0: input.foot.floor + FLOOR_TOP, rand, sf: input.sf, look }
  const kitchenLeft = rand() < 0.5
  const start: Fit = { taken: [...plan.lanes, plan.keep, ...s.obstacles], placed: [], spots: [] }
  const steps = [
    (f: Fit) => placeReception(f, c),
    (f: Fit) => placeRooms(f, c),
    (f: Fit) => placeKitchen(f, c, kitchenLeft),
    (f: Fit) => placeLounge(f, c, !kitchenLeft),
    (f: Fit) => placeDesks(f, c),
    (f: Fit) => placePlants(f, c),
  ]
  const fit = steps.reduce((f, step) => step(f), start)
  return {
    plan,
    pieces: [...s.pieces, ...fit.placed.flatMap((p) => p.pieces), ...wallArt(plan, fit.placed.map((p) => p.rect))],
    items: fit.placed.map(({ kind, rect, seats }) => ({ kind, rect, seats })),
    walls: s.walls + fit.placed.reduce((n, p) => n + p.walls, 0),
    doors: s.doors + fit.placed.reduce((n, p) => n + p.doors, 0),
    people: occupants(plan, fit.spots, input.sf, rand),
  }
}

/**
 * The open-plan regions: the open-plan zone in bands (split at the mid aisle, and behind the eye where the main aisle
 * stops short of the window), each either side of the main aisle where it runs; and the front zone either side of the way in.
 */
function regions(p: RoomPlan): Rect[] {
  const cuts = [p.desks.z0, ...(p.main.z0 > p.desks.z0 ? [p.keep.z0] : []), ...(p.mid ? [p.mid.z0, p.mid.z1] : []), p.desks.z1].sort((a, b) => a - b)
  const bands = cuts.slice(1).map((z1, i) => ({ ...p.desks, z0: cuts[i] ?? z1, z1 })).filter((b) => !p.mid || b.z0 !== p.mid.z0)
  const sides = (r: Rect) => (r.z1 <= p.main.z0 + 1e-9 ? [r] : [{ ...r, x1: p.main.x0 }, { ...r, x0: p.main.x1 }])
  const { left, right } = frontSides(p)
  return [...bands.flatMap(sides), left, right].filter((r) => rectW(r) > 0.3 && rectD(r) > 0.3)
}

/** Candidate benches in a region: rows of face-to-face benches from the main aisle outwards, or desks along a party wall when narrow. */
function benchSlots(r: Rect, p: RoomPlan, c: Ctx): Placed[][] {
  const leftOfAisle = (r.x0 + r.x1) / 2 < p.eye.x
  const wide = rectW(r) >= benchSize(1).w + 2 * GAP
  if (!wide) return wallSlots(r, leftOfAisle, c)
  const rows = Math.floor((rectD(r) + 0.2) / 0.88)
  const pitch = 0.4 * c.look.pairs + 0.3
  const cols = Math.ceil(rectW(r) / pitch)
  return Array.from({ length: rows * cols }, (_, i) => {
    const z = r.z1 - GAP - benchSize(1).d / 2 - Math.floor(i / cols) * 0.88
    const edge = leftOfAisle ? r.x1 - GAP - (i % cols) * pitch : r.x0 + GAP + (i % cols) * pitch
    return Array.from({ length: c.look.pairs }, (_, k) => c.look.pairs - k).map((pairs) => {
      const w = benchSize(pairs).w
      return item('bench', deskBench(pairs, c.y0, c.look.top, c.look.fabric), benchSize(pairs), leftOfAisle ? edge - w / 2 : edge + w / 2, z, 0, 2 * pairs)
    })
  })
}

/** Desks in a row along the party wall, chairs facing it (a narrow suite). */
function wallSlots(r: Rect, leftOfAisle: boolean, c: Ctx): Placed[][] {
  const size = wallBenchSize(2)
  if (rectW(r) < size.d + GAP) return []
  const n = Math.floor((rectD(r) + 0.15) / (size.w + 0.15))
  const x = leftOfAisle ? r.x0 + size.d / 2 : r.x1 - size.d / 2
  return Array.from({ length: n }, (_, i) => {
    const top = r.z1 - GAP - i * (size.w + 0.15)
    return [2, 1].map((desks) => {
      const w = wallBenchSize(desks).w
      return item('bench', wallBench(desks, c.y0, c.look.top, c.look.fabric), wallBenchSize(desks), x, top - w / 2, leftOfAisle ? 1 : 3, desks)
    })
  })
}

const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })

/** Benches nearest the viewer first, each the longest that fits its slot, until the seats for the suite's size are placed. */
function placeDesks(f: Fit, c: Ctx): Fit {
  const p = c.plan
  const cap = scaled(c.sf, SF_PER_SEAT, 2, MAX_SEATS)
  const slots = regions(p).flatMap((r) => benchSlots(r, p, c))
  const dist = (s: Placed[]) => {
    const m = s[0] ? centre(s[0].rect) : { x: 0, z: 0 }
    return Math.hypot(m.x - p.eye.x, m.z - p.eye.z)
  }
  const sorted = [...slots].sort((a, b) => dist(a) - dist(b))
  return sorted.reduce((fit, options) => {
    const seated = fit.placed.reduce((n, x) => n + (x.kind === 'bench' ? x.seats : 0), 0)
    const room = options.filter((o) => seated + o.seats <= cap)
    const first = room.find((o) => fits(fit, p, o.rect))
    return first ? tryAdd(fit, p, first) : fit
  }, f)
}

/** Plants by the door, then in the corners of the open-plan regions, as many as the suite's size calls for. */
function placePlants(f: Fit, c: Ctx): Fit {
  const p = c.plan
  const n = scaled(c.sf, SF_PER_PLANT, 2, 10)
  const size = { w: 0.18, d: 0.18 }
  const inset = 0.1 + GAP
  const byDoor = [p.entry.x0 - inset, p.entry.x1 + inset].map((x) => ({ x, z: p.inner.z1 - inset }))
  const corners = regions(p).flatMap((r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].map(([x = 0, z = 0]) => ({
    x: x === r.x0 ? x + inset : x - inset, z: z === r.z0 ? z + inset : z - inset,
  })))
  const shuffled = corners.map((s) => ({ s, k: c.rand() })).sort((a, b) => a.k - b.k).map((x) => x.s)
  return [...byDoor, ...shuffled].reduce((fit, s, i) => {
    if (fit.placed.filter((x) => x.kind === 'plant').length >= n) return fit
    return tryAdd(fit, p, item('plant', plant(0, 0, c.y0, i % 3 === 0), size, s.x, s.z, 0))
  }, f)
}
