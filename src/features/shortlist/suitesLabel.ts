import type { Candidate } from '../../domain/types'

export const suitesLabel = (c: Pick<Candidate, 'suiteNumbers'>) =>
  c.suiteNumbers.length === 1 ? `Suite ${c.suiteNumbers[0]}` : `Suites ${c.suiteNumbers.join(' + ')}`
