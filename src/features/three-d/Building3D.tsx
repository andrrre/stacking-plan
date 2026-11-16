import { Component, Suspense, lazy, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { selectBuilding } from '../../app/state/selectBuilding'
import { useAppState } from '../../app/state/useAppState'
import { StackView } from '../stack/StackView'
import { useRovingFocus } from '../stack/useRovingFocus'
import { useStackModel } from '../stack/useStackModel'
import { Controls3D } from './Controls3D'
import { FloorSlider } from './FloorSlider'
import { initialFloor } from './floorView'
import { Mirror } from './Mirror'
import type { StackModel } from '../stack/suiteVisual'
import type { Rig, ScreenPoint } from './sceneTypes'
import { Fallback, type FailReason } from './Fallback3D'
import { usePrinting } from './usePrinting'
import { canUseWebGL } from './webgl'
import styles from './three-d.module.css'

// The main screen: the building in WebGL. This shell is in the main bundle (the DOM mirror, controls and
// fallback); three.js and the scene load as a separate chunk behind a light placeholder. Without WebGL, if
// the scene fails to load, or if the WebGL context is lost for good, the 2D stack takes its place with a
// short note saying which. The 2D stack for printing is mounted only around printing.

/** A fresh lazy component for the scene chunk; a retry needs a new one because React caches a failed import. */
const loadScene = () => lazy(() => import('./Scene3D'))
type SceneComponent = ReturnType<typeof loadScene>

const NO_POINTS: ReadonlyMap<string, ScreenPoint> = new Map()

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Placeholder() {
  return <div className={styles.placeholder} data-testid="scene3d-loading">Loading 3D building…</div>
}

export function Building3D() {
  const [usable] = useState(canUseWebGL)
  const [failure, setFailure] = useState<FailReason | null>(null)
  const [Scene, setScene] = useState<SceneComponent>(loadScene)
  const onLoadFailed = useCallback(() => setFailure('load'), [])
  const onLost = useCallback(() => setFailure('lost'), [])
  const retry = useCallback(() => {
    setScene(() => loadScene())
    setFailure(null)
  }, [])
  if (!usable) return <Fallback reason="unavailable" />
  if (failure) return <Fallback reason={failure} onRetry={failure === 'load' ? retry : undefined} />
  return <Stage Scene={Scene} onLoadFailed={onLoadFailed} onLost={onLost} />
}

type StageProps = { Scene: SceneComponent; onLoadFailed: () => void; onLost: () => void }

/**
 * Separate floors (local) and floor view (`state.floor`, in the URL) exclude each other. Floor view opens on
 * the selected suite's floor, else the highest floor with vacant space. `shown` is what the mirror lists:
 * in floor view, only the floor shown.
 */
function useViewModes(model: StackModel, selectedId: string | null) {
  const { state, dispatch } = useAppState()
  const [separated, setSeparated] = useState(false)
  const floor = state.floor
  const setFloor = useCallback((n: number | null) => dispatch({ type: 'floor/set', floor: n }), [dispatch])
  const shown = useMemo(() => (floor === null ? model : { floors: model.floors.filter((f) => f.number === floor) }), [model, floor])
  return {
    separated, floor, setFloor, shown,
    onSeparate: (on: boolean) => {
      setSeparated(on)
      if (on) setFloor(null)
    },
    onFloorView: (on: boolean) => {
      if (on) setSeparated(false)
      setFloor(on ? initialFloor(model, selectedId) : null)
    },
    leave: () => {
      setSeparated(false)
      setFloor(null)
    },
  }
}

function Stage({ Scene, onLoadFailed, onLost }: StageProps) {
  const model = useStackModel()
  const { state, dispatch } = useAppState()
  const selectedId = state.selection?.kind === 'suite' ? state.selection.suiteId : null
  const modes = useViewModes(model, selectedId)
  const { shown, floor } = modes
  const grid = useMemo(() => shown.floors.map((f) => f.suites.map((v) => v.suite.id)), [shown])
  const onSelectOrClear = useCallback(
    (id: string | null) => dispatch({ type: 'select', selection: id === null ? null : { kind: 'suite', suiteId: id } }),
    [dispatch],
  )
  const onSelect = useCallback((id: string) => onSelectOrClear(id), [onSelectOrClear])
  const { getItemProps } = useRovingFocus(grid, { selectedId, onSelect: onSelectOrClear })
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [points, setPoints] = useState(NO_POINTS)
  const rig = useRef<Rig | null>(null)
  const printing = usePrinting()
  const onReset = () => {
    rig.current?.reset() // drops the button turns and zooms, and reframes
    modes.leave()
  }
  return (
    <>
      <div className={styles.stage} data-testid="stack-3d" data-separated={String(modes.separated)} data-floor={floor ?? undefined}
        role="group" aria-label={`3D building, ${selectBuilding(state).name}`}>
        <Mirror model={shown} points={points} getItemProps={getItemProps} onSelect={onSelect} onFocusChange={setFocusedId} />
        <SceneBoundary onError={onLoadFailed}>
          <Suspense fallback={<Placeholder />}>
            <Scene
              model={model} mode={state.mode} separated={modes.separated} floor={floor} focusedId={focusedId} rig={rig}
              onSelect={onSelect} onPoints={setPoints} onLost={onLost}
            />
          </Suspense>
        </SceneBoundary>
        {floor !== null && <FloorSlider model={model} floor={floor} onFloor={modes.setFloor} />}
        <Controls3D
          rig={rig} separated={modes.separated} onSeparate={modes.onSeparate}
          floorView={floor !== null} onFloorView={modes.onFloorView} onReset={onReset}
        />
      </div>
      {printing && (
        <div className={styles.printOnly}>
          <StackView />
        </div>
      )}
    </>
  )
}
