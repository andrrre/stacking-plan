import { createContext, useContext } from 'react'

/**
 * Whether the requirement form has an invalid field. Kept out of the app reducer on purpose: it is screen state
 * that is never persisted or put in the URL. The match list reads it to say its results are for the last valid
 * requirement. Without a provider the form reports into nothing and the list shows no note.
 */
export type FormValidity = { invalid: boolean; setInvalid: (invalid: boolean) => void }

export const FormValidityContext = createContext<FormValidity>({ invalid: false, setInvalid: () => undefined })

export const useFormValidity = (): FormValidity => useContext(FormValidityContext)
