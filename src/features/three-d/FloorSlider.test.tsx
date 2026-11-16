import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { BUNDLED_BUILDINGS } from '../../data'
import { findFits } from '../../domain/findFits'
import { buildStackModel, type StackModel } from '../stack/suiteVisual'
import { FloorSlider } from './FloorSlider'
import { WHEEL_NOTCH } from './floorView'

const TODAY = '2026-11-15'
const [ODT] = BUNDLED_BUILDINGS

function model(minSf: number | null = null): StackModel {
  const matches = minSf === null ? [] : findFits(ODT, { minSf, includePotential: true }, TODAY, TODAY)
  return buildStackModel({
    building: ODT, asOf: TODAY, today: TODAY, mode: 'availability', matches, highlightIds: null, modifiedIds: new Set(), selectedSuiteId: null,
  })
}

function setup(floor = 7, m = model()) {
  const onFloor = vi.fn<(n: number) => void>()
  render(<FloorSlider model={m} floor={floor} onFloor={onFloor} />)
  return { onFloor, slider: screen.getByTestId('floor-slider') }
}

describe('FloorSlider', () => {
  it('is a vertical range named Floor, with the top floor at the top', () => {
    const { slider } = setup()
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAccessibleName('Floor')
    expect(slider).toHaveAttribute('aria-orientation', 'vertical')
    expect(slider).toHaveAttribute('aria-valuetext', 'Floor 7, 7 of 12')
    expect(slider).toHaveAccessibleDescription(screen.getByTestId('floor-caption').textContent ?? '')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '11')
    expect(slider).toHaveValue('6') // floor 7 is the 7th from the bottom
  })

  it('moving the slider picks the floor at that step', () => {
    const { onFloor, slider } = setup()
    fireEvent.change(slider, { target: { value: '4' } })
    expect(onFloor).toHaveBeenCalledWith(5)
  })

  it('the wheel steps one floor at a time: away from you goes up', () => {
    const { onFloor } = setup()
    const rail = screen.getByTestId('floor-rail')
    fireEvent.wheel(rail, { deltaY: -WHEEL_NOTCH })
    expect(onFloor).toHaveBeenLastCalledWith(8)
    fireEvent.wheel(rail, { deltaY: WHEEL_NOTCH })
    expect(onFloor).toHaveBeenLastCalledWith(6)
  })

  it('a wheel that scrolls by lines steps a floor per notch too', () => {
    const { onFloor } = setup()
    fireEvent.wheel(screen.getByTestId('floor-rail'), { deltaY: -3, deltaMode: 1 })
    expect(onFloor).toHaveBeenLastCalledWith(8)
  })

  it('the wheel stops at the top and bottom floors', () => {
    const top = setup(12)
    fireEvent.wheel(screen.getByTestId('floor-rail'), { deltaY: -WHEEL_NOTCH })
    expect(top.onFloor).not.toHaveBeenCalled()
  })

  it('ticks every floor, emphasising the current one and marking vacancy and matches', () => {
    setup(5, model(10000))
    const ticks = within(screen.getByTestId('floor-ticks')).getAllByRole('listitem', { hidden: true })
    expect(ticks.map((t) => t.textContent)).toEqual(['12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1'])
    const attr = (name: string) => ticks.filter((t) => t.getAttribute(name) === 'true').map((t) => t.textContent)
    expect(attr('data-current')).toEqual(['5'])
    expect(attr('data-vacant')).toEqual(['7', '5', '4', '3'])
    expect(attr('data-match')).toEqual(['7', '5'])
  })

  it('captions the floor with its plate and vacant space', () => {
    setup(5)
    expect(screen.getByTestId('floor-caption')).toHaveTextContent(/^Floor 5 · [\d,]+ SF · 10,250 SF vacant$/)
  })
})
