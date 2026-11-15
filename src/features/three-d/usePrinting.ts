import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * True while the page is being printed. `beforeprint` renders synchronously so the print layout sees the
 * change; the `print` media query covers browsers (and print emulation) that only report that.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const on = () => flushSync(() => setPrinting(true))
    const off = () => setPrinting(false)
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null
    const onMedia = (e: MediaQueryListEvent) => (e.matches ? on() : off())
    window.addEventListener('beforeprint', on)
    window.addEventListener('afterprint', off)
    mq?.addEventListener('change', onMedia)
    return () => {
      window.removeEventListener('beforeprint', on)
      window.removeEventListener('afterprint', off)
      mq?.removeEventListener('change', onMedia)
    }
  }, [])
  return printing
}
