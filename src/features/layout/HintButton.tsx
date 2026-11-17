import { useEffect, useId, useState, type ReactNode, type Ref } from 'react'
import styles from './hintButton.module.css'

// A button that cannot be pressed yet and says why. It stays focusable (aria-disabled, not disabled, which most
// browsers never hover-title and assistive tech skips), and the reason is a real tooltip it is described by:
// shown on hover and on keyboard focus, hoverable itself, and dismissed by moving away, blurring or Escape
// (WCAG 1.4.13). Without a reason it is a plain button with no tooltip. The tooltip hangs under the button,
// anchored to its right edge (these buttons sit at the header's right end).

type Props = {
  hint: string | null // why the button cannot be pressed; null: it can
  className?: string
  testId: string
  onClick: () => void
  buttonRef?: Ref<HTMLButtonElement>
  children: ReactNode
}

/** Whether focus arrived by keyboard; a browser without :focus-visible counts every focus. */
function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

function useTip(active: boolean) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = active && (hovered || focused) && !dismissed
  // Escape hides it wherever the pointer or focus is, and is handled so it does nothing else (a suite tour,
  // presentation mode): in the capture phase, so it comes first whenever the others started listening.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setDismissed(true)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])
  return {
    open,
    wrap: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => {
        setHovered(false)
        setDismissed(false)
      },
    },
    button: {
      onFocus: (e: { currentTarget: Element }) => setFocused(keyboardFocus(e.currentTarget)),
      onBlur: () => {
        setFocused(false)
        setDismissed(false)
      },
    },
  }
}

export function HintButton({ hint, className, testId, onClick, buttonRef, children }: Props) {
  const id = useId()
  const tip = useTip(hint !== null)
  return (
    <span className={styles.wrap} {...tip.wrap}>
      <button
        ref={buttonRef} type="button" className={className} data-testid={testId}
        aria-disabled={hint !== null ? true : undefined} aria-describedby={hint !== null ? id : undefined}
        onClick={hint !== null ? undefined : onClick} {...tip.button}
      >
        {children}
      </button>
      {hint !== null && (
        <span id={id} role="tooltip" className={styles.tip} data-testid={`${testId}-hint`} data-open={String(tip.open)}>
          {hint}
        </span>
      )}
    </span>
  )
}
