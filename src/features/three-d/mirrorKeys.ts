import type { KeyboardEvent } from 'react'
import type { RovingItemProps } from '../stack/useRovingFocus'

const SWAP: Record<string, string> = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' }

/**
 * Data order runs left to right only up to a quarter turn either way. Past that the building is mirrored
 * on screen, so Left and Right swap; Up and Down (floors) keep their meaning.
 */
export function mirrorKeys(props: RovingItemProps, angle: number): RovingItemProps {
  if (Math.cos((angle * Math.PI) / 180) >= 0) return props
  return {
    ...props,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const key = SWAP[e.key]
      props.onKeyDown(key ? Object.create(e, { key: { value: key } }) : e)
    },
  }
}
