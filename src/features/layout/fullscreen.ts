// Browser fullscreen for presentation mode, guarded: a browser without the API, a page not allowed to go
// fullscreen (an iframe, a headless browser) or a refused request all leave the page as it is.

type FullscreenDoc = Pick<Document, 'fullscreenElement' | 'exitFullscreen'> & { fullscreenEnabled?: boolean }

/** Asks for fullscreen on `el`; true once granted, false when unavailable or refused. Never throws. */
export async function enterFullscreen(el: Element, doc: FullscreenDoc = document): Promise<boolean> {
  if (typeof el.requestFullscreen !== 'function' || doc.fullscreenEnabled === false) return false
  try {
    await el.requestFullscreen()
    return true
  } catch {
    return false // refused (no user gesture, permissions policy): presentation mode goes on without it
  }
}

/** Leaves fullscreen if the page is in it. Never throws. */
export function exitFullscreen(doc: FullscreenDoc = document): void {
  if (!doc.fullscreenElement || typeof doc.exitFullscreen !== 'function') return
  doc.exitFullscreen().catch(() => undefined) // already left (by Escape) between the check and the call
}
