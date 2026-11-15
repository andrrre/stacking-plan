import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { PointerEvent } from 'react'
import { DEFAULT_ANGLE, isDefaultAngle, useDragRotate } from './useDragRotate'

const ev = (clientX: number, over: Record<string, unknown> = {}) =>
  ({
    clientX, pointerId: 1, button: 0, currentTarget: { setPointerCapture: () => undefined, releasePointerCapture: () => undefined },
    ...over,
  }) as unknown as PointerEvent<HTMLElement>

function drag(result: { current: ReturnType<typeof useDragRotate> }, from: number, to: number) {
  act(() => result.current.handlers.onPointerDown(ev(from)))
  act(() => result.current.handlers.onPointerMove(ev(to)))
  act(() => result.current.handlers.onPointerUp(ev(to)))
}

describe('useDragRotate', () => {
  it('starts at the default angle, not dragging', () => {
    const { result } = renderHook(() => useDragRotate())
    expect(result.current.angle).toBe(DEFAULT_ANGLE)
    expect(result.current.dragging).toBe(false)
  })

  it('a horizontal pointer drag changes the angle, and the opposite drag changes it back', () => {
    const { result } = renderHook(() => useDragRotate())
    drag(result, 100, 160)
    const turned = result.current.angle
    expect(turned).not.toBe(DEFAULT_ANGLE)
    drag(result, 160, 100)
    expect(result.current.angle).toBeCloseTo(DEFAULT_ANGLE)
  })

  it('a tiny movement is a click, not a rotation', () => {
    const { result } = renderHook(() => useDragRotate())
    drag(result, 100, 102)
    expect(result.current.angle).toBe(DEFAULT_ANGLE)
    expect(result.current.consumeDragClick()).toBe(false)
  })

  it('swallows exactly the click that ends a real drag', () => {
    const { result } = renderHook(() => useDragRotate())
    drag(result, 100, 200)
    expect(result.current.consumeDragClick()).toBe(true)
    expect(result.current.consumeDragClick()).toBe(false)
  })

  it('ignores non-primary buttons and moves without a press', () => {
    const { result } = renderHook(() => useDragRotate())
    act(() => result.current.handlers.onPointerMove(ev(300)))
    act(() => result.current.handlers.onPointerDown(ev(100, { button: 2 })))
    act(() => result.current.handlers.onPointerMove(ev(300)))
    expect(result.current.angle).toBe(DEFAULT_ANGLE)
  })

  it('rotateBy turns by degrees and reset returns to the default', () => {
    const { result } = renderHook(() => useDragRotate())
    act(() => result.current.rotateBy(15))
    expect(result.current.angle).toBe(DEFAULT_ANGLE + 15)
    act(() => result.current.reset())
    expect(result.current.angle).toBe(DEFAULT_ANGLE)
  })

  it('pointercancel ends the drag and releases the pointer', () => {
    const { result } = renderHook(() => useDragRotate())
    act(() => result.current.handlers.onPointerDown(ev(100)))
    act(() => result.current.handlers.onPointerMove(ev(160)))
    expect(result.current.dragging).toBe(true)
    act(() => result.current.handlers.onPointerCancel(ev(160)))
    expect(result.current.dragging).toBe(false)
    const turned = result.current.angle
    act(() => result.current.handlers.onPointerMove(ev(300)))
    expect(result.current.angle).toBe(turned)
  })

  it('a touch needs 10px before it rotates, a mouse only 4px', () => {
    const touch = renderHook(() => useDragRotate()).result
    act(() => touch.current.handlers.onPointerDown(ev(100, { pointerType: 'touch' })))
    act(() => touch.current.handlers.onPointerMove(ev(108, { pointerType: 'touch' })))
    expect(touch.current.angle).toBe(DEFAULT_ANGLE)
    act(() => touch.current.handlers.onPointerMove(ev(112, { pointerType: 'touch' })))
    expect(touch.current.angle).not.toBe(DEFAULT_ANGLE)
    const mouse = renderHook(() => useDragRotate()).result
    drag(mouse, 100, 106)
    expect(mouse.current.angle).not.toBe(DEFAULT_ANGLE)
  })

  it('a move with no button down ends the drag (the pointer-up was lost)', () => {
    const { result } = renderHook(() => useDragRotate())
    act(() => result.current.handlers.onPointerDown(ev(100)))
    act(() => result.current.handlers.onPointerMove(ev(160)))
    act(() => result.current.handlers.onPointerMove(ev(220, { buttons: 0 })))
    expect(result.current.dragging).toBe(false)
    const turned = result.current.angle
    act(() => result.current.handlers.onPointerMove(ev(400, { buttons: 1 })))
    expect(result.current.angle).toBe(turned)
  })

  it('lost pointer capture ends the drag', () => {
    const { result } = renderHook(() => useDragRotate())
    act(() => result.current.handlers.onPointerDown(ev(100)))
    act(() => result.current.handlers.onPointerMove(ev(160)))
    act(() => result.current.handlers.onLostPointerCapture(ev(160)))
    expect(result.current.dragging).toBe(false)
  })

  it('the click-swallow flag does not outlive the drag: a later click with no pointerdown passes', async () => {
    const { result } = renderHook(() => useDragRotate())
    drag(result, 100, 200)
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.consumeDragClick()).toBe(false)
  })

  it('isDefaultAngle counts whole turns as the default', () => {
    expect(isDefaultAngle(DEFAULT_ANGLE)).toBe(true)
    expect(isDefaultAngle(DEFAULT_ANGLE + 360)).toBe(true)
    expect(isDefaultAngle(DEFAULT_ANGLE - 720)).toBe(true)
    expect(isDefaultAngle(DEFAULT_ANGLE + 15)).toBe(false)
  })
})
