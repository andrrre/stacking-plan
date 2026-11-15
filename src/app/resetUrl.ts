import { isoDate } from '../shared/isoDate'

/** The bare path, keeping only a valid `today` so a pinned clock survives the reset. */
export function resetUrl(pathname: string, search: string): string {
  const today = isoDate.safeParse(new URLSearchParams(search).get('today'))
  return today.success ? `${pathname}?today=${today.data}` : pathname
}
