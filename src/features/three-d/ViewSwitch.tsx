import { useAppState } from '../../app/state/useAppState'
import { StackView } from '../stack/StackView'
import { Stack3D } from './Stack3D'
import { useDragRotate } from './useDragRotate'

/** The stack area: the 2D plan or its 3D twin, chosen by `state.view`. The angle is held here so it survives a 2D round trip. */
export function ViewSwitch() {
  const { state } = useAppState()
  const rotation = useDragRotate()
  return state.view === '3d' ? <Stack3D rotation={rotation} /> : <StackView />
}
