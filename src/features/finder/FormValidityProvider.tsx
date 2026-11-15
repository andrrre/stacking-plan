import { useMemo, useState, type ReactNode } from 'react'
import { FormValidityContext } from './formValidity'

/** Shares the requirement form's "has an invalid field" flag with the match list (see formValidity.ts). */
export function FormValidityProvider({ children }: { children: ReactNode }) {
  const [invalid, setInvalid] = useState(false)
  const value = useMemo(() => ({ invalid, setInvalid }), [invalid])
  return <FormValidityContext.Provider value={value}>{children}</FormValidityContext.Provider>
}
