import { BufferGeometry, Color, Float32BufferAttribute, type InstancedMesh, type Material, type Object3D } from 'three'
import type { Piece, Tone } from '../fitout/rect'
import { FILL_KEYS, type Palette } from '../palette'
import { mix, scratch } from './cityShared'

// What the suite tour's interior is drawn with: a colour for every tone, from the palette's tokens (so the light and
// dark themes both read), instance matrices for the pieces, and one merged set of outlines for the boxes (the
// sketch look of the rest of the scene, and what makes a pile of boxes read as furniture).

/** Tones drawn without an outline: the floor finish (its edge is the status band's). */
const NO_EDGE: ReadonlySet<Tone> = new Set(['carpet'])

const luminance = (hex: string) => {
  const c = new Color(hex)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

/** A colour for every tone; lights glow and screens stay dark in either theme. */
export function toneColours(p: Palette): Record<Tone, Color> {
  const dark = luminance(p.surface) < 0.5
  return {
    wall: mix(p.surface, p.roofEdge, dark ? 0.55 : 0.22),
    party: mix(p.surface, p.roofEdge, dark ? 0.75 : 0.42),
    frame: mix(p.roofEdge, p.muted, 0.45),
    glass: mix(p.surface, p.match, 0.35),
    carpet: mix(p.roof, p.muted, dark ? 0.12 : 0.2),
    rug: mix(p.fit.accent, p.surface, 0.5),
    light: dark ? mix(p.text, p.surface, 0.2) : new Color(p.surface),
    leaf: mix(p.fit.plant, p.surface, 0.18),
    wood: new Color(p.fit.wood),
    fabric: new Color(p.fit.fabric),
    accent: new Color(p.fit.accent),
    dark: dark ? mix(p.bg, '#000000', 0.35) : mix(p.text, p.muted, 0.25),
    pale: dark ? mix(p.surface, p.text, 0.42) : mix(p.surface, p.bg, 0.25),
    metal: mix(p.muted, p.roofEdge, 0.4),
    plant: new Color(p.fit.plant),
    pot: mix(p.roofEdge, p.muted, 0.5),
  }
}

/** The outlines' colour: a quiet line against the faces in either theme. */
export const edgeColour = (p: Palette): Color => mix(p.muted, p.surface, luminance(p.surface) < 0.5 ? 0.35 : 0.5)

/** Writes each piece's matrix (its box: centre and size) and colour into the instanced mesh. */
export function fillInstances(mesh: InstancedMesh, pieces: readonly Piece[], colours: Record<Tone, Color>): void {
  pieces.forEach((p, i) => {
    scratch.position.set(p.x, p.y, p.z)
    scratch.rotation.set(0, 0, 0)
    scratch.scale.set(p.w, p.h, p.d)
    scratch.updateMatrix()
    mesh.setMatrixAt(i, scratch.matrix)
    mesh.setColorAt(i, colours[p.tone])
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

// A unit box's twelve edges, as pairs of corners: corner i is ±0.5 on x, y and z by its bits 0, 1 and 2.
const corner = (i: number): [number, number, number] => [(i & 1) - 0.5, ((i >> 1) & 1) - 0.5, ((i >> 2) & 1) - 0.5]
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const

/** The outlines of every outlined box piece, merged into one line-segments geometry (one draw). */
export function outlineGeometry(pieces: readonly Piece[]): BufferGeometry {
  const boxes = pieces.filter((p) => p.shape === 'box' && !NO_EDGE.has(p.tone))
  const out = new Float32Array(boxes.length * EDGES.length * 6)
  boxes.forEach((p, b) => {
    EDGES.forEach(([a, c], e) => {
      const at = (b * EDGES.length + e) * 6
      for (const [k, i] of [[0, a], [3, c]] as const) {
        const [cx, cy, cz] = corner(i)
        out[at + k] = p.x + cx * p.w
        out[at + k + 1] = p.y + cy * p.h
        out[at + k + 2] = p.z + cz * p.d
      }
    })
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(out, 3))
  return g
}

/** The pieces split by how they are drawn: opaque boxes, cylinders and spheres, and glass. */
export function byKind(pieces: readonly Piece[]) {
  const solid = pieces.filter((p) => p.tone !== 'glass')
  return {
    box: solid.filter((p) => p.shape === 'box'),
    cylinder: solid.filter((p) => p.shape === 'cylinder'),
    sphere: solid.filter((p) => p.shape === 'sphere'),
    glass: pieces.filter((p) => p.tone === 'glass'),
  }
}

/** Status fills that are neutral greys (occupied, common, no lease on file): a wall may share one by chance. */
const NEUTRAL = new Set(['occupied', 'common', 'risk-open'])

/** Every colour that says something about a suite's status: coloured fills and sides, the hatch, edges, the match accent. */
export function statusColours(p: Palette): ReadonlySet<string> {
  const coloured = FILL_KEYS.filter((k) => !NEUTRAL.has(k))
  return new Set([...coloured.flatMap((k) => [p.fills[k], p.sides[k]]), p.hatch, ...Object.values(p.edges), p.match])
}

const colourOf = (m: Material | Material[]): Color | null => {
  const one = Array.isArray(m) ? m[0] : m
  return one && 'color' in one && one.color instanceof Color ? one.color : null
}

/** How many meshes, lines and instances under `root` are drawn in a status colour (a room seen from inside: none). */
export function statusColoured(root: Object3D, p: Palette): number {
  const status = statusColours(p)
  const hit = (c: Color) => (status.has(`#${c.getHexString()}`) ? 1 : 0)
  let n = 0
  const c = new Color()
  root.traverse((o) => {
    const m = o as InstancedMesh
    const base = 'material' in m ? colourOf(m.material) : null
    if (!base) return
    if (!m.isInstancedMesh || !m.instanceColor) {
      n += hit(base)
      return
    }
    for (let i = 0; i < m.count; i++) {
      m.getColorAt(i, c)
      n += hit(c.multiply(base))
    }
  })
  return n
}
