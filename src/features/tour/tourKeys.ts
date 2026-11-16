// The tour's keys: Escape ends it, ← and → step between stops, Space plays or pauses. Pure: a key and the element
// it was pressed on in, a command (or null: the key belongs to something else) out.

export type TourCommand = 'exit' | 'prev' | 'next' | 'toggle'

/** A dialog owns every key pressed inside it. */
const DIALOG = 'dialog, [role=dialog]'
/** Controls that use the arrows and Space themselves. */
const FIELD = 'input, textarea, select, [role=slider], [role=spinbutton], [contenteditable=""], [contenteditable="true"]'
/** Controls that Space presses. */
const PRESSABLE = 'button, a[href], summary, [role=button], [role=switch], [role=checkbox], [role=radio], [role=tab]'

export function tourKey(key: string, target: Element | null): TourCommand | null {
  if (target?.closest(DIALOG)) return null
  if (key === 'Escape') return 'exit'
  if (target?.closest(FIELD)) return null
  if (key === 'ArrowLeft') return 'prev'
  if (key === 'ArrowRight') return 'next'
  if (key === ' ' && !target?.closest(PRESSABLE)) return 'toggle'
  return null
}
