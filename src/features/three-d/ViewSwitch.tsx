import { useAppState } from '../../app/state/useAppState'
import { StackView } from '../stack/StackView'
import { Building3D } from './Building3D'

/** The stack area: the 3D building (the main screen) or the 2D stack, chosen by `state.view`. */
export function ViewSwitch() {
  const { state } = useAppState()
  return state.view === '3d' ? <Building3D /> : <StackView />
}
