import { useAppState } from '../../app/state/useAppState'
import { Legend } from '../stack/Legend'
import { RiskLegend } from './RiskLegend'

/** One legend per colour mode, so a colour never carries two meanings at once. */
export function LegendSwitch() {
  const { state } = useAppState()
  return state.mode === 'risk' ? <RiskLegend /> : <Legend />
}
