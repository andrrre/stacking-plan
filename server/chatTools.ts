import { tool } from 'ai'
import { EXPIRING_MONTHS, MAX_RESULTS } from '../src/domain/constants.js'
import type { ChatContext } from './chatContext.js'
import {
  BuildingOverviewInput, buildingOverview, ExpiringLeasesInput, expiringLeases, FindSpaceInput, findSpace,
  ListSuitesInput, listSuites, MAX_LEASES, MAX_SUITES, SuiteDetailsInput, suiteDetails,
} from './chatToolFns.js'

/**
 * Tool executions allowed per request (one `chatTools` call); later calls get TOOL_BUDGET_TEXT instead of a result.
 * A second bound: chat.ts allows at most four calls (one per step, last step answers only); it binds if that changes.
 */
export const MAX_TOOL_CALLS = 6
export const TOOL_BUDGET_TEXT = 'Tool budget for this question is used up. Answer with what you have.'

const OVERVIEW = 'Occupancy and vacancy totals for the building on the as-of date. leasableSf = leasedSf + vacantSf '
  + '(common areas excluded); occupancyPct = leasedSf / leasableSf (1 decimal). vacantSf counts every leasable suite with '
  + 'no lease active on the date, so it includes potentialSf (the lease ends on or after today and before the date and the '
  + 'tenant has not confirmed leaving: available only if that tenant does not renew) and committedSf (already leased to '
  + 'a tenant who moves in after the date: not available). uncommittedSf = vacantSf - committedSf: vacant space not '
  + 'already committed, potential space included. For a vacancy or availability question, give vacantSf (the figure on '
  + 'the app\'s "Available" tile) and say how much of it is committedSf, and potentialSf when it is not zero. '
  + `expiringSf and expiringCount: leases active on the date that end within ${EXPIRING_MONTHS} `
  + 'months of it. rentRoll: annual dollars (area times annual rent per SF) of the leases active on the date. '
  + 'largestBlock: the largest run of joined available suites on one floor, potential space counted, committed space not.'

const LIST = `Leasable suites with their status on the as-of date (vacant, expiring, occupied), in floor order. Occupied `
  + `and expiring rows carry tenant and leaseEnd (no leaseEnd: an open-ended lease); expiring means the lease ends within ${EXPIRING_MONTHS} `
  + 'months of the date. Vacant rows carry askingRentPsf and an overlay: "none" = available from availableFrom; '
  + '"potential" = available from availableFrom only if endingTenant does not renew its lease ending on leaseEnd; '
  + '"committed" = already leased to a tenant who moves in on committedFrom, not available. Optional filters: status, '
  + `floor. At most ${MAX_SUITES} rows; \`total\` is the full count.`

const FIND = 'Suites or combinations of neighbouring suites on one floor that fit a size, rent and move-in requirement, '
  + `with blended rent (2 decimals) and caveats. At most ${MAX_RESULTS} options, in rank order: available now before `
  + 'potential, then least excess area, then fewest suites, then higher floor. `moreMayFit: true` means the list stopped '
  + `at ${MAX_RESULTS} and more options may fit. The date is the as-of date, or the month step of moveInBy. `
  + 'includePotential defaults to true. When nothing fits it returns the reasons and the earliest date something fits.'

const DETAILS = 'Facts about one suite by its number on the as-of date: area, asking rent, status, overlay, '
  + 'available-from date, and whether it joins its neighbours. `lease` is the lease active on the date; `endedLease` '
  + '(potential) ends before the date and the space is available only if that tenant does not renew; `nextLease` '
  + '(committed) is a signed lease that starts after the date. `found: false` when no suite has that number.'

/** The five read-only tools the chat model may call, bound to one request's building, scenario and dates. */
export function chatTools(ctx: ChatContext) {
  let used = 0
  const budgeted = <T>(lookup: () => T): T | { error: string } => {
    used += 1
    return used > MAX_TOOL_CALLS ? { error: TOOL_BUDGET_TEXT } : lookup()
  }
  return {
    building_overview: tool({
      description: OVERVIEW,
      inputSchema: BuildingOverviewInput,
      execute: async () => budgeted(() => buildingOverview(ctx)),
    }),
    list_suites: tool({
      description: LIST,
      inputSchema: ListSuitesInput,
      execute: async (input) => budgeted(() => listSuites(ctx, input)),
    }),
    expiring_leases: tool({
      description: 'Leases active on the as-of date that end within the given number of months, soonest first, with '
        + `tenant, area, end date and rent. At most ${MAX_LEASES} rows; \`total\` and \`totalSf\` cover every match.`,
      inputSchema: ExpiringLeasesInput,
      execute: async (input) => budgeted(() => expiringLeases(ctx, input)),
    }),
    find_space: tool({
      description: FIND,
      inputSchema: FindSpaceInput,
      execute: async (input) => budgeted(() => findSpace(ctx, input)),
    }),
    suite_details: tool({
      description: DETAILS,
      inputSchema: SuiteDetailsInput,
      execute: async (input) => budgeted(() => suiteDetails(ctx, input)),
    }),
  }
}
