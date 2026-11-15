import { useEffect, useMemo } from 'react'
import { BoxGeometry, EdgesGeometry, PlaneGeometry } from 'three'

// Unit shapes shared by every box, edge outline and the ground plane; scaled per object. Disposing frees
// their GPU buffers; the objects stay valid and three uploads them again if they are drawn after a
// StrictMode unmount/remount replay, so nothing is left holding a dead resource.

export function useSharedGeometry() {
  const shapes = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1)
    return { box, edges: new EdgesGeometry(box), plane: new PlaneGeometry(1, 1) }
  }, [])
  useEffect(() => () => Object.values(shapes).forEach((g) => g.dispose()), [shapes])
  return shapes
}

export type Shapes = ReturnType<typeof useSharedGeometry>
