import { useEffect, useRef, type ReactNode } from 'react'

type Props = { labelledBy: string; onClose: () => void; className?: string; children: ReactNode }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal dialog. While open: the app shell is inert and body scroll is locked, focus starts inside,
 * Tab stays inside and Escape closes, even when focus has fallen to the container or the body.
 * The keydown listener is on `document` in the capture phase and prevents default, so it runs before the
 * KPI bar's Escape handler, which then leaves the highlight alone. Focus returns to the opener on close.
 */
export function DialogFrame({ labelledBy, onClose, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    const shell = document.querySelector('[data-print="shell"]')
    const overflow = document.body.style.overflow
    shell?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    items()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      const inside = active instanceof HTMLElement && list.includes(active)
      if (!inside || (e.shiftKey && active === first) || (!e.shiftKey && active === last)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      shell?.removeAttribute('inert')
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={className}>
      {children}
    </div>
  )
}
