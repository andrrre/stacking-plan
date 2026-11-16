import { largestBlock } from './blocks'
import { statusAt } from './status'
import type { Building, ISODate, Kpis, StatusResult, Suite } from './types'

type Rated = { suite: Suite; st: StatusResult }

const sumSf = (rows: readonly Rated[]) => rows.reduce((sum, r) => sum + r.suite.areaSf, 0)
const idsOf = (rows: readonly Rated[]) => rows.map((r) => r.suite.id)

export function kpis(b: Building, D: ISODate, today: ISODate, includePotential: boolean): Kpis {
  const rated: Rated[] = b.floors.flatMap((f) => f.suites)
    .filter((s) => s.kind === 'leasable')
    .map((suite) => ({ suite, st: statusAt(suite, D, today) }))

  const leased = rated.filter((r) => r.st.status === 'occupied' || r.st.status === 'expiring')
  const vacant = rated.filter((r) => r.st.status === 'vacant')
  const expiring = rated.filter((r) => r.st.status === 'expiring')
  const potential = vacant.filter((r) => r.st.status === 'vacant' && r.st.overlay === 'potential')
  const committed = vacant.filter((r) => r.st.status === 'vacant' && r.st.overlay === 'committed')
  const rentRoll = leased.reduce(
    (sum, r) => sum + (r.st.status === 'occupied' || r.st.status === 'expiring' ? r.suite.areaSf * r.st.lease.rentPsf : 0),
    0,
  )

  const leasableSf = sumSf(rated)
  const leasedSf = sumSf(leased)
  const block = largestBlock(b, D, today, includePotential)
  const numberOf = new Map(rated.map((r) => [r.suite.id, r.suite.number]))
  return {
    leasableSf,
    leasedSf,
    occupancyPct: leasableSf === 0 ? null : (leasedSf / leasableSf) * 100,
    vacantSf: sumSf(vacant),
    potentialSf: sumSf(potential),
    committedSf: sumSf(committed),
    expiringSf: sumSf(expiring),
    expiringCount: expiring.length,
    largestBlock: block,
    largestBlockSuiteNumbers: block ? block.suiteIds.map((id) => numberOf.get(id) ?? id) : [],
    rentRoll,
    ids: {
      occupancy: idsOf(leased),
      vacant: idsOf(vacant),
      expiring: idsOf(expiring),
      largestBlock: block ? block.suiteIds : [],
    },
  }
}
