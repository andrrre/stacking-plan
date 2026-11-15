import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RiskLegend } from './RiskLegend'

describe('RiskLegend', () => {
  it('lists the seven risk entries in order, using the stack fill keys', () => {
    render(<RiskLegend />)
    const items = within(screen.getByTestId('legend-risk')).getAllByTestId('legend-risk-entry')
    expect(items.map((i) => i.textContent)).toEqual(['Vacant', '≤ 6 months', '≤ 12 months', '≤ 24 months', '≤ 36 months', 'Over 36 months', 'No end date'])
    const fills = items.map((i) => i.querySelector('[data-fill]')?.getAttribute('data-fill'))
    expect(fills).toEqual(['vacant', 'risk-le6', 'risk-le12', 'risk-le24', 'risk-le36', 'risk-gt36', 'risk-open'])
  })

  it('also explains the potential and committed overlays that stay in risk mode', () => {
    render(<RiskLegend />)
    expect(screen.getAllByTestId('legend-risk-overlay')).toHaveLength(2)
  })
})
