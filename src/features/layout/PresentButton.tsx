import { useCallback, useEffect, useRef } from 'react'
import { useAppState } from '../../app/state/useAppState'
import { enterFullscreen, exitFullscreen } from './fullscreen'

// Presentation mode: both drawers shut (useDrawers) and the page in browser fullscreen where the browser allows
// it. The same button, Escape, or leaving fullscreen by the browser's own controls ends it. Never saved.

function usePresentation() {
  const { state, dispatch } = useAppState()
  const { presenting } = state
  const live = useRef(presenting)
  useEffect(() => {
    live.current = presenting
  }, [presenting])
  const stop = useCallback(() => {
    dispatch({ type: 'present/set', on: false })
    exitFullscreen()
  }, [dispatch])
  const start = useCallback(() => {
    dispatch({ type: 'present/set', on: true })
    void enterFullscreen(document.documentElement)
  }, [dispatch])
  // Fullscreen left by Escape or the browser's controls ends the mode. Fullscreen granted only after the mode
  // has already ended (a quick Present, Exit) is left again at once.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) dispatch({ type: 'present/set', on: false })
      else if (!live.current) exitFullscreen()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [dispatch])
  // Without fullscreen (refused or unsupported) Escape still ends it, unless a dialog or a drawer took the key.
  useEffect(() => {
    if (!presenting) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest('dialog, [role=dialog]')) return
      stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, stop])
  return { presenting, toggle: presenting ? stop : start }
}

export function PresentButton({ className }: { className?: string }) {
  const { presenting, toggle } = usePresentation()
  return (
    <button type="button" className={className} data-testid="present" aria-pressed={presenting} onClick={toggle}>
      {presenting ? 'Exit presentation' : 'Present'}
    </button>
  )
}
