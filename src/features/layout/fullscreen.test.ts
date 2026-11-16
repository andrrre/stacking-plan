import { describe, it, expect, vi } from 'vitest'
import { enterFullscreen, exitFullscreen } from './fullscreen'

const el = (requestFullscreen?: () => Promise<void>) => ({ requestFullscreen }) as unknown as Element
const doc = (over: Partial<{ fullscreenElement: Element | null; exitFullscreen: () => Promise<void>; fullscreenEnabled: boolean }> = {}) =>
  ({ fullscreenElement: null, exitFullscreen: vi.fn(() => Promise.resolve()), ...over }) as unknown as Document

describe('enterFullscreen', () => {
  it('asks the element and reports success', async () => {
    const request = vi.fn(() => Promise.resolve())
    expect(await enterFullscreen(el(request), doc())).toBe(true)
    expect(request).toHaveBeenCalledOnce()
  })

  it('is false, without asking, where the API is missing or fullscreen is not enabled', async () => {
    expect(await enterFullscreen(el(), doc())).toBe(false)
    const request = vi.fn(() => Promise.resolve())
    expect(await enterFullscreen(el(request), doc({ fullscreenEnabled: false }))).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('is false, and does not throw, when the browser refuses', async () => {
    expect(await enterFullscreen(el(() => Promise.reject(new TypeError('denied'))), doc())).toBe(false)
  })
})

describe('exitFullscreen', () => {
  it('leaves fullscreen only when in it', () => {
    const out = doc()
    exitFullscreen(out)
    expect(out.exitFullscreen).not.toHaveBeenCalled()
    const inside = doc({ fullscreenElement: el() })
    exitFullscreen(inside)
    expect(inside.exitFullscreen).toHaveBeenCalledOnce()
  })

  it('swallows a rejected exit', () => {
    expect(() => exitFullscreen(doc({ fullscreenElement: el(), exitFullscreen: () => Promise.reject(new Error('gone')) }))).not.toThrow()
  })
})
