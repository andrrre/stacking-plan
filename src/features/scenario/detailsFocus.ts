// After Place tenant here, the match panel (and the dialog's opener) unmounts and the placed suite's details mount
// in its place. PlaceTenant marks the suite here; SuiteDetails takes the mark on mount and focuses its heading.

let pending: string | null = null

export function focusDetailsNext(suiteId: string): void {
  pending = suiteId
}

/** True once for the marked suite; clears the mark. */
export function takeDetailsFocus(suiteId: string): boolean {
  if (pending !== suiteId) return false
  pending = null
  return true
}
