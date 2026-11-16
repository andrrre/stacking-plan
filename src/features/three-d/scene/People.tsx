import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BoxGeometry, Color, CylinderGeometry, SphereGeometry, type InstancedMesh } from 'three'
import type { Tick } from '../city/motion'
import type { Mover } from '../city/traffic'
import { FIGURE, figureAt, type Figure } from '../city/walk'
import type { Palette } from '../palette'
import { fillMaterial, shadeByNormal, type FadeUniforms } from './cityMaterials'
import { MOVER_PROPS, mix, paint, scratch, useMeshDisposal } from './cityShared'

// Pedestrians as small figures: a head, a tapered torso, two legs and two arms, each part one instanced mesh
// for everyone (four draws). Where each part goes comes from figureAt (city/walk.ts), a pure function of the
// person and the time; this file only turns it into instance matrices. Flat sketch colours: a top and
// trousers from muted tokens, a pale head, no faces.

const ARM = { x: 0.15, length: 0.36, width: 0.05 } // fractions of the figure's height
const LEG = { x: 0.055, width: 0.075 }
const TORSO = { top: 0.13, bottom: 0.09, depth: 0.55 } // half-widths at the shoulders and hips; depth as a share of width

function useParts() {
  const geo = useMemo(() => ({
    head: shadeByNormal(new SphereGeometry(1, 8, 6)),
    // Four sides turned square to the walk, the shoulders wider than the hips; the base at the hip.
    torso: shadeByNormal(new CylinderGeometry(TORSO.top, TORSO.bottom, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
    limb: shadeByNormal(new BoxGeometry(1, 1, 1).translate(0, -0.5, 0)), // hangs from its joint
  }), [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  return geo
}

type Place = { f: Figure; x: number; y: number; z: number; swing: number; size: [number, number, number] }

/** Puts instance `i` at a point given in the figure's own frame (x to its side, z ahead), turned and swung. */
function put(mesh: InstancedMesh, i: number, p: Place): void {
  const { f } = p
  const [s, c] = [Math.sin(f.heading), Math.cos(f.heading)]
  scratch.position.set(f.x + c * p.x + s * p.z, p.y, f.z - s * p.x + c * p.z)
  scratch.rotation.set(-p.swing, f.heading, 0, 'YXZ') // + swing brings a hanging limb forward
  scratch.scale.set(...p.size)
  scratch.updateMatrix()
  mesh.setMatrixAt(i, scratch.matrix)
}

type Meshes = { head: InstancedMesh; torso: InstancedMesh; legs: InstancedMesh; arms: InstancedMesh }

function placeFigure(m: Meshes, i: number, f: Figure): void {
  const h = f.height * f.scale
  const hip = (FIGURE.leg * f.height + f.bob) * f.scale
  const shoulder = hip + (FIGURE.shoulder - FIGURE.leg) * h
  const r = FIGURE.head * h
  put(m.head, i, { f, x: 0, y: shoulder + 0.03 * h + r, z: 0, swing: 0, size: [r, r * 1.08, r] })
  put(m.torso, i, { f, x: 0, y: hip, z: 0, swing: 0, size: [h, shoulder - hip, h * TORSO.depth] })
  for (const side of [0, 1] as const) {
    const sign = side === 0 ? 1 : -1
    put(m.legs, 2 * i + side, { f, x: sign * LEG.x * h, y: hip, z: 0, swing: f.legs[side], size: [LEG.width * h, FIGURE.leg * h, LEG.width * h] })
    put(m.arms, 2 * i + side, { f, x: sign * ARM.x * h, y: shoulder - 0.02 * h, z: 0, swing: f.arms[side], size: [ARM.width * h, ARM.length * h, ARM.width * h] })
  }
}

/** Muted clothing: tops and trousers from the text and edge tokens, quieter than any status colour. */
function outfits(p: Palette, people: readonly Mover[]) {
  const tops = [new Color(p.muted), mix(p.muted, p.edges.committed, 0.55), mix(p.text, p.muted, 0.55), mix(p.muted, p.borderStrong, 0.3)]
  const trousers = [mix(p.text, p.muted, 0.35), mix(p.muted, p.text, 0.25), mix(p.edges.committed, p.text, 0.45)]
  const skin = mix(p.borderStrong, p.edges.committed, 0.4)
  const top = (m: Mover) => tops[m.tone % tops.length] ?? skin
  const legs = (m: Mover) => trousers[m.tone2 % trousers.length] ?? skin
  return {
    head: people.map(() => skin),
    torso: people.map(top),
    legs: people.flatMap((m) => [legs(m), legs(m)]),
    arms: people.flatMap((m) => [top(m), top(m)]),
  }
}

type Props = { people: readonly Mover[]; palette: Palette; u: FadeUniforms; clock: RefObject<Tick> }

export function People({ people, palette, u, clock }: Props) {
  const geo = useParts()
  const mat = useMemo(() => fillMaterial('#ffffff', 0.95, u), [u])
  useEffect(() => () => mat.dispose(), [mat])
  const refs = { head: useRef<InstancedMesh>(null), torso: useRef<InstancedMesh>(null), legs: useRef<InstancedMesh>(null), arms: useRef<InstancedMesh>(null) }
  const { head, torso, legs, arms } = refs
  const n = people.length
  useMeshDisposal(head, geo.head, mat, n)
  useMeshDisposal(torso, geo.torso, mat, n)
  useMeshDisposal(legs, geo.limb, mat, 2 * n)
  useMeshDisposal(arms, geo.limb, mat, 2 * n)
  const drawn = useRef<{ t: number; people: readonly Mover[] | null }>({ t: -1, people: null })
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const c = outfits(palette, people)
    const all = [[head.current, c.head], [torso.current, c.torso], [legs.current, c.legs], [arms.current, c.arms]] as const
    for (const [mesh, colours] of all) if (mesh) paint(mesh, colours)
    drawn.current = { t: -1, people: null } // the meshes may be new: place everyone on the next frame
    invalidate()
  }, [people, palette, geo, mat, invalidate, head, torso, legs, arms])
  useFrame(() => {
    const t = clock.current.elapsed
    const m = { head: head.current, torso: torso.current, legs: legs.current, arms: arms.current }
    if (!m.head || !m.torso || !m.legs || !m.arms) return
    if (drawn.current.t === t && drawn.current.people === people) return
    drawn.current = { t, people }
    people.forEach((p, i) => placeFigure(m as Meshes, i, figureAt(p, t)))
    for (const mesh of Object.values(m)) if (mesh) mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh key={`h${n}`} ref={head} args={[geo.head, mat, n]} {...MOVER_PROPS} />
      <instancedMesh key={`t${n}`} ref={torso} args={[geo.torso, mat, n]} {...MOVER_PROPS} />
      <instancedMesh key={`l${n}`} ref={legs} args={[geo.limb, mat, 2 * n]} {...MOVER_PROPS} />
      <instancedMesh key={`a${n}`} ref={arms} args={[geo.limb, mat, 2 * n]} {...MOVER_PROPS} />
    </>
  )
}
