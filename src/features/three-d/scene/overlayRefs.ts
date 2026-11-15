// The DOM nodes of the HTML overlay (labels, floor numbers, rank badges, rings, tooltip), registered by
// callback refs so the frame loop can position them without a React render per frame.

export type OverlayRefs = {
  labels: Map<string, HTMLElement>
  tags: Map<number, HTMLElement>
  badges: Map<number, HTMLElement>
  rings: Map<string, SVGPolygonElement>
  tooltip: { current: HTMLDivElement | null }
}

export function createOverlayRefs(): OverlayRefs {
  return { labels: new Map(), tags: new Map(), badges: new Map(), rings: new Map(), tooltip: { current: null } }
}

/** A callback ref that keeps `map[key]` in step with the mounted element. */
export function register<K, E extends Element>(map: Map<K, E>, key: K) {
  return (el: E | null) => {
    if (el) map.set(key, el)
    else map.delete(key)
  }
}

/** A callback ref that stores the element in `holder.current`. */
export function bind<E extends Element>(holder: { current: E | null }) {
  return (el: E | null) => {
    holder.current = el
  }
}

const last = new WeakMap<Element, Map<string, string>>()

/** Writes a style property or data attribute only when its value changed (the loop runs every frame). */
export function write(el: HTMLElement | SVGElement, key: string, value: string): void {
  const seen = last.get(el) ?? new Map<string, string>()
  if (seen.get(key) === value) return
  seen.set(key, value)
  last.set(el, seen)
  if (key.startsWith('data-') || key === 'points') el.setAttribute(key, value)
  else el.style.setProperty(key, value)
}
