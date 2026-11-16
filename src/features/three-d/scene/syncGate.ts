// Whether a rendered frame must move the overlay and restart the "camera is still" report. Pure.

/** The view (camera place and lens, canvas size, hovered suite) and the inputs the last sync used. */
export type SyncMark = { key: string; inputs: object | null }

/**
 * A frame syncs when the view key or the inputs (a new object on every scene render) changed. A frame with
 * neither (the city's traffic redrawing while the building stands still) leaves the labels and the pending
 * report of screen points alone, so they settle as if nothing had been drawn.
 */
export const syncNeeded = (last: SyncMark, key: string, inputs: object): boolean =>
  key !== last.key || inputs !== last.inputs
