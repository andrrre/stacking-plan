import { useEffect, type RefObject } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'

// Small helpers shared by the city's meshes (City.tsx, People.tsx).

export const NO_HIT = () => undefined // never picked: the facade under a car, a person or a block is still the building's

/** A scratch object for composing instance matrices (per-frame mutation, as the rest of the scene code does). */
export const scratch = new Object3D()

export const mix = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t)

/** Instance colours, one per instance. */
export function paint(mesh: InstancedMesh, colours: readonly Color[]): void {
  colours.forEach((c, i) => mesh.setColorAt(i, c))
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/** Frees an instanced mesh's own buffers (instance matrices, colours) when it is replaced or unmounted. */
export function useMeshDisposal(ref: RefObject<InstancedMesh | null>, geometry: unknown, material: unknown, count: number): void {
  useEffect(() => {
    void geometry
    void material
    void count
    const mesh = ref.current
    return () => mesh?.dispose()
  }, [ref, geometry, material, count])
}

/** Instanced-mesh props every moving part of the city shares: not picked, not culled, drawn after the building. */
export const MOVER_PROPS = { dispose: null, raycast: NO_HIT, frustumCulled: false, renderOrder: 4 } as const
