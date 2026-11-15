import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const read = () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches

/** True while the user asks for reduced motion; follows changes live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
