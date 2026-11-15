# StackMatch — Technical specification

> **What this is.** The technical specification that the code comments cite as "spec-technical §1" … "§8".
> It was written before the build, with the requirement resolutions in [`spec.md`](spec.md) and the product design in [`DESIGN.md`](../../DESIGN.md).
> Where this file and the code differ, the code and its tests are authoritative.

Architect pass, reconciled with Part A of [`spec.md`](spec.md). Product behaviour: [`DESIGN.md`](../../DESIGN.md).
Precedence on any conflict: `spec.md` Part A → this file → DESIGN.md.

Structural choice: parallel stories never touch the same file.
- **Story 1** installs every dependency, so no later story edits `package.json`.
- **Story 2** creates the complete domain types, shared zod schemas and the full reducer and action union. Later stories only dispatch actions.
- **Story 3** creates the layout shell, the stack renderer and all design tokens. The stack renderer draws every visual state from data, so later stories feed it data instead of editing it.

The dependency set was installed together in a throwaway project: `npm install` had no peer conflicts, and `tsc -b`, `eslint .`, `vitest run` and `vite build` passed. **Not verified:** Playwright browser install and run; Vercel deploy.

---

## 1. Directory and file layout

```
stacking-plan/
  package.json                 deps pinned exact; scripts (§2). S1 only.
  index.html                   #root, <title>StackMatch</title>
  vite.config.ts               react plugin + Vitest block (jsdom, setup, include src/** + server/**)
  tsconfig.json                references app + node
  tsconfig.app.json            src/** (browser)
  tsconfig.node.json           vite/playwright configs, api/, server/, e2e/, src/shared/
  eslint.config.js             flat config + repo-rule lint rules (§2)
  playwright.config.ts         chromium, 1440x900, tz America/New_York, build+preview webServer
  vercel.json                  {"functions":{"api/*.ts":{"maxDuration":10}}}  (no rewrites: single route "/")
  .env.example                 ANTHROPIC_API_KEY=  AI_MODEL=claude-haiku-5-5
  .gitignore                   FIX existing typo "*/.envv"; add node_modules dist .env* !.env.example test-results playwright-report .vercel
  api/
    ask.ts                     3-line wrapper: export function POST(req) { return handleAsk(req, process.env) }
    summary.ts                 same for handleSummary
  server/                      handler logic + tests (kept OUT of api/ so test files never become functions)
    ask.ts / ask.test.ts       handleAsk(req, env): Response
    summary.ts / summary.test.ts
    model.ts                   getModel(env): LanguageModel | null (null when no key)
    rateLimit.ts               allow(ip, nowMs): boolean (10 req / 60 s / IP, per instance)
    http.ts                    jsonError(status), clientIp(req), runAi(fn) → maps timeout→504, error→502
  e2e/
    helpers.ts                 (S3) gotoApp(page, params), suite(page, id), TODAY='2026-11-15'
    s01-smoke.spec.ts … s15-summary-ai.spec.ts   one spec per story, owned by that story
  src/
    main.tsx                   reads clock today ONCE, imports font + tokens, mounts <App>
    test/setup.ts              import '@testing-library/jest-dom/vitest'
    styles/tokens.css          ALL design tokens (§7). S3 only.
    styles/global.css          reset, body, focus ring, print base. S3 only.
    shared/                    zod-only; imported by src AND server; relative imports MUST end in .js
      isoDate.ts               isoDate = z.iso.date()
      domain.schema.ts         Lease/Suite/Floor/Building/Change/Caveat/Candidate/ShortlistEntry schemas
      ask.schema.ts            AskRequest, ParsedQuery
      summary.schema.ts        SummaryRequest, SummaryCopy (S15)
    domain/                    pure TS, no React, no clock; every file has a .test.ts
      types.ts                 z.infer re-exports + derived result types (§3)
      constants.ts             EXPIRING_MONTHS=12, HORIZON_MONTHS=60, MAX_RESULTS=5, RISK_EDGES=[6,12,24,36]
      dates.ts                 addMonthsIso, addDaysIso, monthOffset, snapToSlider, maxIso
      format.ts                formatSf, formatPsf, formatMoney, formatMonthYear, formatMmYyyy, formatLongDate
      status.ts                statusAt, riskBucket, isAvailable
      blocks.ts                maximalRuns, largestBlock
      kpis.ts                  kpis
      findFits.ts              findFits (S5)
      caveats.ts               caveatText(caveat, audience) (S5)
      explainNoFit.ts          (S7)
      scenario.ts              applyScenario, modifiedSuiteIds, findLease (S11)
      parseQuery.ts            fallback NL parser (S12)
      csv/parseCsv.ts, csv/rows.ts, csv/template.ts   (S14)
      testing/fixtures.ts      lease(), suite(), floor(), building() builders (S2; read-only afterwards)
    data/
      ocean-drive-tower.json   hero (S2)
      palm-bay-plaza.json      second building (S10)
      index.ts                 BUNDLED_BUILDINGS = BuildingSchema.array().parse([...])
    app/
      App.tsx, App.module.css  grid shell (S3)
      state/
        types.ts               AppState, Action, Selection, RequirementDraft, KpiKey
        reducer.ts             every action implemented (S2)
        init.ts                initState(search, storage, clockToday)
        storage.ts             loadShortlist/saveShortlist/loadImported/saveImported (zod, try/catch)
        StateProvider.tsx      context; useAppState(): { state, dispatch }
        usePersistence.ts      effect: save shortlist + imported when they change
        selectors.ts           selectBuildings, selectBaseBuilding, activeRequirement, horizonEnd
        selectBuilding.ts      selectBuilding(state): Building (S2 = base; S11 makes it apply the scenario)
        url.ts                 parseUrlState / serializeUrlState (S10)
        useUrlSync.ts          replaceState on change (S10)
    features/
      layout/   Header, LeftRail, CenterPane, RightPanel (+ .module.css)       S3
      stack/    StackView, FloorRow, SuiteCell, MatchOutline, Legend,
                suiteVisual.ts (buildStackModel, pure), useStackModel.ts,
                useRovingFocus.ts, stack.module.css                          S3
      kpi/      KpiBar, KpiTile                                               S4
      details/  SuiteDetails                                                  S4
      timeline/ DateSlider                                                    S6
      finder/   RequirementForm, MatchList, MatchCard, useMatches.ts          S5
                MatchWhy, NoFit                                               S7
      risk/     StackToolbar, ColourModeToggle, RiskLegend                    S8
      shortlist/ Shortlist, CompareDialog, CompareTable, ClientSummary, MiniStack, entryId.ts   S9
      building/ BuildingSwitcher                                              S10
      scenario/ ScenarioBar, ChangeDialog, changeDefaults.ts                  S11
      ask/      AskBox, askService.ts                                         S12
      three-d/  Stack3D, Floor3D, useDragRotate.ts, ViewToggle                S13
      import/   ImportCsvButton, ImportErrors, downloadTemplate.ts            S14
      summary-ai/ summaryService.ts, templateSummary.ts, SummaryIntro         S15
```

Styling: one CSS Module per component. Tests never select by class name.

---

## 2. Dependencies, scripts and config

All versions are pinned exact. I checked them with `npm view` on 2026-11-15 and installed them together.

| dependencies | version |
|---|---|
| react / react-dom | 19.3.1 |
| zod | 4.6.7 |
| date-fns | 4.4.0 |
| ai | 7.0.173 |
| @ai-sdk/anthropic | 4.0.105 |
| @fontsource-variable/inter | 5.3.0 (bundled font; no network font at demo time) |

| devDependencies | version | note |
|---|---|---|
| vite | 8.3.8 | |
| @vitejs/plugin-react | 6.3.0 | peer vite ^8; its other peers are optional |
| typescript | **6.0.3** | **not 7.0.2**: typescript-eslint 8.72.2 peer is `>=4.8.4 <6.1.0` |
| vitest | 5.1.0 | engines node ^24 ok |
| jsdom | 31.0.1 | engines `^24.15.0`; Node 24.17 ok |
| @testing-library/react | 16.3.3 | |
| @testing-library/dom | 10.4.2 | required peer |
| @testing-library/user-event | 14.6.10 | |
| @testing-library/jest-dom | 7.0.1 | |
| @playwright/test | 1.65.1 | browsers installed with `npm run e2e:install` |
| eslint | 10.15.0 | |
| @eslint/js | 10.0.1 | |
| typescript-eslint | 8.72.2 | |
| eslint-plugin-react-hooks | 7.1.1 | use `reactHooks.configs.flat.recommended` |
| eslint-plugin-react-refresh | 0.5.8 | `reactRefresh.configs.vite` |
| globals | 17.14.0 | |
| @types/react / @types/react-dom | 19.3.0 | |
| @types/node | 24.19.2 | matches Node 24 |

Not used: `@vercel/node` (the functions use Web `Request`/`Response`) and the `vercel` CLI (deploy through the git integration).

```json
"type": "module",
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview --port 4173 --strictPort",
  "typecheck": "tsc -b",
  "lint": "eslint . --max-warnings 0",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "test:all": "npm run typecheck && npm run lint && npm run test && npm run test:e2e",
  "e2e:install": "playwright install chromium"
}
```

**Config facts (checked before the build):**
- **TypeScript 6 settings.** Set `"types"` explicitly: app `["vite/client"]`, node `["node"]`. Also set `moduleResolution: "bundler"`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `resolveJsonModule` and `noEmit`.
- **Vitest.** No globals: every test does `import { it, expect, vi } from 'vitest'`. jest-dom types come in through `src/test/setup.ts`.
- **Vitest config.** Settings: `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, `include: ['src/**/*.test.{ts,tsx}','server/**/*.test.ts']`, `css: { modules: { classNameStrategy: 'non-scoped' } }`.
- **ESLint rules on all files:**
  - `no-console: error`
  - `max-lines: [error, 800]`
  - `max-lines-per-function: [error, {max: 50, skipBlankLines: true, skipComments: true}]`
  - `max-depth: [error, 4]`
- **ESLint override for tests:** `*.test.*` and `e2e/**` turn `max-lines-per-function` off.
- **ESLint rules for `src/domain/**` and `src/shared/**`** (keeps the domain pure):
  - `no-restricted-imports` bans `react`.
  - `no-restricted-syntax` bans `NewExpression[callee.name='Date']`.
- **Playwright** settings: `use: { baseURL: 'http://localhost:4173', viewport: {width:1440,height:900}, timezoneId: 'America/New_York' }`, `webServer: { command: 'npx vite build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120000 }`, `fullyParallel: true`, `retries: 0`.

---

## 3. Contracts

### 3.1 Shared schemas (`src/shared/*.ts`, zod 4; types are `z.infer`)
```ts
export const isoDate = z.iso.date()                       // 'YYYY-MM-DD'
export const LeaseSchema = z.object({
  id: z.string().min(1), tenant: z.string().min(1).max(80),
  start: isoDate, end: isoDate.nullable(), rentPsf: z.number().nonnegative(),
  vacating: z.boolean().optional(),
}).refine(l => l.end === null || l.end >= l.start, 'end before start')
export const SuiteSchema = z.object({
  id: z.string().min(1), number: z.string().min(1), areaSf: z.number().int().positive(),
  kind: z.enum(['leasable', 'common']), name: z.string().max(60).optional(), askingRentPsf: z.number().positive().optional(),
  joinsNext: z.boolean(), leases: z.array(LeaseSchema),
}).refine(s => s.kind === 'common' || s.askingRentPsf !== undefined, 'asking rent required')
  .refine(s => noOverlaps(s.leases), 'overlapping leases')
export const FloorSchema = z.object({ number: z.number().int(), suites: z.array(SuiteSchema).min(1) })
export const BuildingSchema = z.object({ id: z.string().min(1), name: z.string().min(1), address: z.string(), floors: z.array(FloorSchema).min(1) })
export const ChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('renew'), leaseId: z.string(), newEnd: isoDate }),
  z.object({ kind: z.literal('vacate'), leaseId: z.string(), on: isoDate }),
  z.object({ kind: z.literal('newLease'), suiteIds: z.array(z.string()).min(1), tenant: z.string().min(1).max(80),
             start: isoDate, end: isoDate, rentPsf: z.number().positive() }),
])
export const CaveatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('combine'), count: z.number().int().min(2) }),
  z.object({ kind: z.literal('assumesNoRenewal'), tenant: z.string(), leaseEnd: isoDate }),
])
export const CandidateSchema = z.object({
  key: z.string(),                       // suiteIds.join('+')
  suiteIds: z.array(z.string()).min(1), suiteNumbers: z.array(z.string()).min(1),
  floor: z.number().int(), totalSf: z.number(), excessSf: z.number(),
  blendedRentPsf: z.number(), availableFrom: isoDate,
  availability: z.enum(['now', 'potential']), caveats: z.array(CaveatSchema),
})
export const ShortlistEntrySchema = z.object({
  id: z.string(),                        // `${buildingId}|${asOf}|${candidate.key}|${whatIf ? 'w' : 'b'}`
  buildingId: z.string(), candidate: CandidateSchema, asOf: isoDate, whatIf: z.boolean(),
})
// ask.schema.ts (S2 creates it, because the reducer uses ParsedQuery)
export const AskRequestSchema = z.object({ query: z.string().trim().min(1).max(500), today: isoDate })
export const ParsedQuerySchema = z.object({
  minSf: z.number().int().min(1).max(1_000_000).optional(),
  maxSf: z.number().int().min(1).max(1_000_000).optional(),
  maxRentPsf: z.number().positive().max(1000).optional(),
  moveInBy: isoDate.optional(),
}).refine(q => q.minSf === undefined || q.maxSf === undefined || q.maxSf >= q.minSf)
// summary.schema.ts (S15)
export const ClientOptionSchema = z.object({ label: z.string().max(40), floor: z.number().int(),
  suiteNumbers: z.array(z.string()).min(1), totalSf: z.number(), blendedRentPsf: z.number().optional(),
  availableFrom: isoDate, notes: z.array(z.string().max(200)) })   // notes = client-audience caveat text, no tenant names
export const SummaryRequestSchema = z.object({ buildingName: z.string().min(1).max(120), asOf: isoDate,
  options: z.array(ClientOptionSchema).min(1).max(5) })
export const SummaryCopySchema = z.object({ headline: z.string().min(1).max(90), paragraph: z.string().min(1).max(600) })
```

### 3.2 Domain result types (`src/domain/types.ts`)
```ts
export type ISODate = string
export type Requirement = { minSf: number; maxSf?: number; maxRentPsf?: number; includePotential: boolean }
export type Status = 'occupied' | 'expiring' | 'vacant' | 'common'
export type StatusResult =
  | { status: 'common' }
  | { status: 'occupied'; lease: Lease; openEnded: boolean }
  | { status: 'expiring'; lease: Lease }                                  // lease.end !== null
  | { status: 'vacant'; overlay: 'none'; availableFrom: ISODate }         // > today ⇒ label "Vacant from MM/YYYY"
  | { status: 'vacant'; overlay: 'potential'; endedLease: Lease; availableFrom: ISODate }
  | { status: 'vacant'; overlay: 'committed'; nextLease: Lease }
export type RiskBucket = 'common' | 'vacant' | 'le6' | 'le12' | 'le24' | 'le36' | 'gt36' | 'openEnded'
export type Block = { floor: number; suiteIds: string[]; totalSf: number }
export type KpiKey = 'occupancy' | 'vacant' | 'expiring' | 'largestBlock'
export type Kpis = {
  leasableSf: number; leasedSf: number; occupancyPct: number | null   // 0..100, unrounded; null when leasableSf=0
  vacantSf: number; potentialSf: number; committedSf: number    // potential and committed are subsets of vacant
  expiringSf: number; largestBlock: Block | null
  rentRoll: number                                              // Σ areaSf × rentPsf, leases active on D
  ids: Record<KpiKey, string[]>                                 // occupancy → leased suites
}
export type NoFitReason =
  | { kind: 'nothingAvailable' }
  | { kind: 'largestBlock'; block: Block }
  | { kind: 'spread'; totalSf: number; floorCount: number; blockCount: number }
  | { kind: 'filtered'; by: Array<'maxSf' | 'maxRentPsf'> }
export type NoFit = { reasons: NoFitReason[]; earliestFit: { date: ISODate; candidate: Candidate } | null }
export type ScenarioError = { index: number; code: 'leaseNotFound' | 'suiteNotFound' | 'notLeasable' | 'invalidDates' | 'overlap'; message: string }
export type ScenarioResult = { ok: true; building: Building } | { ok: false; error: ScenarioError }
export type CsvColumn = 'building'|'floor'|'suite'|'area_sf'|'kind'|'asking_rent_psf'|'joins_next'|'tenant'|'lease_start'|'lease_end'|'rent_psf'|'vacating'
export type CsvError = { row: number /* file line, header = 1 */; column: CsvColumn | null; message: string }
export type CsvResult = { ok: true; buildings: Building[] } | { ok: false; errors: CsvError[] }
```

### 3.3 Pure domain functions
```ts
// dates.ts — ISO in, ISO out; parseISO/format only (local time), never new Date('YYYY-MM-DD')
addMonthsIso(d: ISODate, n: number): ISODate          // date-fns addMonths (clamps month end)
addDaysIso(d: ISODate, n: number): ISODate
monthOffset(d: ISODate, today: ISODate): number       // slider index of snapToSlider(d): differenceInCalendarMonths, clamped 0..HORIZON_MONTHS
sliderDate(today: ISODate, m: number): ISODate        // m=0 → today; m≥1 → 1st of month(today)+m
snapToSlider(d: ISODate, today: ISODate): ISODate     // largest sliderDate(today,m) ≤ d, m∈[0,60]; d<today ⇒ today
maxIso(...ds: ISODate[]): ISODate
// status.ts
statusAt(suite: Suite, D: ISODate, today: ISODate): StatusResult
riskBucket(suite: Suite, D: ISODate, today: ISODate): RiskBucket
isAvailable(suite: Suite, st: StatusResult, includePotential: boolean): boolean
// blocks.ts
maximalRuns(floor: Floor, D: ISODate, today: ISODate, includePotential: boolean): Block[]
largestBlock(b: Building, D: ISODate, today: ISODate, includePotential: boolean): Block | null
// kpis.ts
kpis(b: Building, D: ISODate, today: ISODate, includePotential: boolean): Kpis
// findFits.ts / caveats.ts
findFits(b: Building, req: Requirement, D: ISODate, today: ISODate): Candidate[]   // ≤ 5, ranked
caveatText(c: Caveat, audience: 'broker' | 'client'): string
  // combine → "Requires combining 2 suites." (same for both audiences)
  // assumesNoRenewal → broker "Assumes Flamingo Row Media does not renew (lease ends 30 Apr 2027)."
  //                    client "Subject to the current tenant vacating (30 Apr 2027)."
// explainNoFit.ts
explainNoFit(b: Building, req: Requirement, D: ISODate, today: ISODate): NoFit
// scenario.ts
applyScenario(base: Building, changes: readonly Change[]): ScenarioResult
modifiedSuiteIds(base: Building, changes: readonly Change[]): ReadonlySet<string>
findLease(b: Building, leaseId: string): { floor: number; suite: Suite; lease: Lease } | null
// parseQuery.ts
parseQuery(text: string, today: ISODate): ParsedQuery
// csv
parseCsv(text: string, existingIds: readonly string[]): CsvResult
CSV_TEMPLATE: string
```

### 3.4 Reducer (`src/app/state/types.ts`; S2 implements every action)
```ts
type ColourMode = 'availability' | 'risk'
type ViewMode = 'stack' | '3d'
type RequirementDraft = { minSf: number | null; maxSf: number | null; maxRentPsf: number | null; includePotential: boolean }
type Selection = { kind: 'suite'; suiteId: string } | { kind: 'match'; key: string } | null
type Overlay = 'none' | 'compare' | 'summary'
type AppState = {
  today: ISODate; buildingId: string; asOf: ISODate; mode: ColourMode; view: ViewMode
  req: RequirementDraft; selection: Selection; highlight: KpiKey | null
  changes: Change[]; shortlist: ShortlistEntry[]; importedBuildings: Building[]; overlay: Overlay
}
type Action =
  | { type: 'building/set'; buildingId: string }        // clears selection, highlight, changes
  | { type: 'asOf/set'; asOf: ISODate }                 // snapped to a slider step in [today, sliderDate(today,60)]
  | { type: 'mode/set'; mode: ColourMode }
  | { type: 'view/set'; view: ViewMode }
  | { type: 'req/set'; patch: Partial<RequirementDraft> }   // merge; clears a 'match' selection
  | { type: 'req/clear' }                               // min/max/rent → null; keeps includePotential
  | { type: 'ask/apply'; parsed: ParsedQuery }          // copies present fields; moveInBy → asOf = snapToSlider; clears selection
  | { type: 'noFit/jump'; asOf: ISODate }               // asOf + includePotential=true
  | { type: 'select'; selection: Selection }
  | { type: 'highlight/toggle'; kpi: KpiKey }
  | { type: 'scenario/add'; change: Change }            // the CALLER validates with applyScenario first
  | { type: 'scenario/reset' }
  | { type: 'shortlist/add'; entry: ShortlistEntry }    // no-op if the id exists or 10 entries are held
  | { type: 'shortlist/remove'; id: string }
  | { type: 'building/import'; buildings: Building[] }  // append; buildingId = first imported
  | { type: 'overlay/set'; overlay: Overlay }
// selectors.ts
selectBuildings(s): Building[]            // [...BUNDLED_BUILDINGS, ...s.importedBuildings]
selectBaseBuilding(s): Building           // by id, falling back to first
activeRequirement(s): Requirement | null  // null when req.minSf === null
horizonEnd(s): ISODate                    // sliderDate(today, 60)
// selectBuilding.ts
selectBuilding(s): Building               // S2: base. S11: applyScenario(base, changes), falling back to base if !ok
```
Every case returns a new object. The reducer imports only types, `dates.ts` and `constants.ts`.

### 3.5 URL state (`app/state/url.ts`, S10; S2's `init.ts` already reads `today`)
| param | field | format | written when |
|---|---|---|---|
| `today` | today | YYYY-MM-DD | only if present on load (kept as is) |
| `b` | buildingId | id (`odt`, `pbp`, `csv-…`) | ≠ first bundled |
| `asOf` | asOf | YYYY-MM-DD | ≠ today |
| `mode` | mode | `availability` \| `risk` | ≠ availability |
| `view` | view | `stack` \| `3d` | ≠ stack |
| `min` / `max` | req.minSf / maxSf | positive int | non-null |
| `rent` | req.maxRentPsf | positive number | non-null |
| `pot` | includePotential | `0` \| `1` | = 0 |

Parsing runs per parameter through zod: an invalid value is ignored and that field keeps its default. Writes use `history.replaceState`, only when the serialized string changes. Selection, highlight, scenario and overlay stay out of the URL.

### 3.6 localStorage (`app/state/storage.ts`, S2)
| key | schema | on bad data |
|---|---|---|
| `stackmatch.v1.shortlist` | `z.array(ShortlistEntrySchema)` | return `[]` |
| `stackmatch.v1.imported` | `z.array(BuildingSchema)` | return `[]` |

Every access is wrapped in try/catch (private mode or quota errors return `[]`, and a failed save is silent). `usePersistence` saves when `state.shortlist` or `state.importedBuildings` changes identity.

### 3.7 API routes
| | `POST /api/ask` | `POST /api/summary` |
|---|---|---|
| body | `AskRequestSchema` | `SummaryRequestSchema` |
| 200 | `ParsedQuery` | `SummaryCopy` |
| errors (`{error: string}`, generic text) | 400 bad body · 429 rate · 503 no key · 504 timeout · 502 provider or schema error | same |
| model call | `generateObject({ model: getModel(env), schema, system, prompt, temperature: 0, maxRetries: 0, abortSignal: AbortSignal.timeout(8000) })` | same |

Handler shape: `export async function POST(request: Request): Promise<Response>`.

`getModel`:
- returns `null` when `ANTHROPIC_API_KEY` is unset;
- otherwise returns `createAnthropic({ apiKey })(env.AI_MODEL ?? 'claude-haiku-5-5')`.

`claude-haiku-5-5` is in the SDK's model-id union, but I have not checked it against the live API. `generateObject` exists in ai 7.0.173 and is marked `@deprecated` in favour of `generateText` with `output`. It still works, and no lint rule flags it under the recommended configs.

Client services. Each falls back on any non-OK status, a thrown error, a timeout or a zod failure:
```ts
askService(query: string, today: ISODate, fetchFn = fetch): Promise<{ parsed: ParsedQuery; source: 'ai' | 'offline' }>   // fallback = parseQuery
summaryService(req: SummaryRequest, fetchFn = fetch): Promise<{ copy: SummaryCopy; source: 'ai' | 'offline' }>          // fallback = templateSummary
```
The client timeout is 9 s, so the server's 8 s limit fires first.

---

## 4. Component tree, state and test hooks

Every component reads state through `useAppState()`. No component calls the clock.

| Component (story) | Props | Reads | Dispatches | Test hooks |
|---|---|---|---|---|
| App (S3; +S4 KpiBar, S9 overlays, S10 useUrlSync) | – | overlay | – | `role=main` |
| Header (S3; +S9, S10, S14) | – | building name | – | `app-header`, `demo-badge` |
| BuildingSwitcher (S10) | – | buildingId, selectBuildings | building/set | `building-switcher` (`<select aria-label="Building">`) |
| ImportCsvButton + ImportErrors (S14) | – | importedBuildings | building/import | `import-csv-button`, `import-csv-input`, `import-errors`, `import-template` |
| Client summary button (S9) | – | shortlist | overlay/set | `open-summary` |
| KpiBar / KpiTile (S4) | tile: `{kpi, label, value, sub?}` | kpis(selectBuilding, asOf, today, req.includePotential), highlight | highlight/toggle | `kpi-occupancy`, `kpi-vacant`, `kpi-expiring`, `kpi-largest-block` (buttons, `aria-pressed`); value spans `kpi-*-value`; `kpi-vacant-potential` |
| LeftRail (S3; +S5, S12, S9) | – | – | – | `left-rail` |
| AskBox (S12) | – | today | ask/apply | `ask-input`, `ask-submit`, `ask-status` (text "Offline parsing" when source=offline) |
| RequirementForm (S5) | – | req | req/set, req/clear | `req-min-sf`, `req-max-sf`, `req-max-rent`, `req-include-potential` (checkbox), `req-clear` |
| Shortlist (S9) | – | shortlist filtered by buildingId | shortlist/remove, overlay/set | `shortlist`, `shortlist-entry-{n}` (1-based), `shortlist-remove-{n}`, `open-compare`, `whatif-tag` |
| CenterPane (S3; +S6, S8, S11, S13) | – | view, mode | – | `center-pane` |
| StackToolbar (S8; +S13) | – | mode, view | mode/set | `mode-availability`, `mode-risk` (radio buttons) |
| ViewToggle (S13) | – | view | view/set | `view-stack`, `view-3d` |
| StackView / FloorRow / SuiteCell (S3) | `model: StackModel` from `useStackModel()` | – | select | `stack`; `floor-{n}`; `suite-{suiteId}` (button) with `data-status`, `data-overlay`, `data-fill`, `data-risk`, `data-match-rank` (absent or "1".."5"), `data-dimmed="true|false"`, `data-modified`, `aria-pressed`, full `aria-label`; `match-outline-{rank}` |
| Legend (S3) / RiskLegend (S8) | – | mode | – | `legend`, `legend-risk`, `legend-assumption` |
| DateSlider (S6) | – | asOf, today | asOf/set | `date-slider` (`<input type=range min=0 max=60 step=1 aria-label="As of date" aria-valuetext="May 2027">`), `date-label`, `date-today` |
| ScenarioBar (S11) | – | changes, kpis base vs scenario | scenario/reset | `scenario-bar`, `scenario-count`, `scenario-occupancy`, `scenario-vacant`, `scenario-rent-roll`, `scenario-reset` |
| Stack3D / Floor3D (S13) | `model: StackModel` | – | select | `stack-3d`, `suite3d-{suiteId}` (same data-* attributes) |
| RightPanel (S3; +S4, S5, S7) | – | selection, activeRequirement | – | `right-panel`, `right-empty` |
| SuiteDetails (S4; +S11 actions) | `suiteId` | selectBuilding, asOf, today | select(null); S11: opens ChangeDialog | `suite-details`, `action-renew`, `action-vacate`, `action-lease` |
| MatchList / MatchCard (S5; +S9 Save) | MatchCard: `{candidate, rank}` | useMatches() | select match | `match-list`, `match-{rank}` (`data-key`), `save-match-{rank}` |
| MatchWhy (S7; +S11) | `candidate` | asOf | select | `match-why`, `match-why-caveat`, `place-tenant` |
| NoFit (S7) | `noFit: NoFit` | – | noFit/jump | `no-fit`, `no-fit-reason` (one per reason), `jump-to-date` |
| ChangeDialog (S11) | `{initial: Change, onClose}` | selectBaseBuilding, changes | scenario/add | `change-dialog`, `change-submit`, `change-error` (`<dialog>`) |
| CompareDialog / CompareTable (S9) | – | shortlist | overlay/set | `compare-dialog`, `compare-table` |
| ClientSummary + MiniStack (S9; +S15 SummaryIntro) | – | shortlist, building | overlay/set | `client-summary`, `summary-print`, `summary-close`, `summary-intro` |

Right panel precedence (decided in S3, filled in by S4, S5 and S7):
1. A selected match → MatchWhy. If the key no longer matches anything, fall through to the list.
2. A selected suite → SuiteDetails.
3. An active requirement → MatchList, or NoFit when the list is empty.
4. Otherwise `right-empty` ("Enter a size to find space · click a suite for details").

Hooks:
- `useMatches(): { req: Requirement | null; matches: Candidate[] }` (S5), memoized on building, req, asOf and today.
- `useStackModel(): StackModel` (S3). S5 changes `matches: []` to `useMatches().matches`. S11 adds `modifiedSuiteIds`.

```ts
type FillKey = 'occupied'|'expiring'|'vacant'|'potential'|'committed'|'common'|'risk-le6'|'risk-le12'|'risk-le24'|'risk-le36'|'risk-gt36'|'risk-open'
type SuiteVisual = { suite: Suite; status: StatusResult; risk: RiskBucket; fill: FillKey
  label: { number: string; primary: string; sf: string; end?: string }   // primary: tenant | 'Vacant' | 'Potential' | 'Leased from 03/2027'
  ariaLabel: string; tooltip: string; dimmed: boolean; matchRank: number | null; modified: boolean; selected: boolean }
type FloorVisual = { number: number; plateSf: number; widthPct: number; suites: SuiteVisual[]
  runs: { rank: number; first: number; last: number }[] }
type StackModel = { floors: FloorVisual[] }        // floors sorted by number, descending
buildStackModel(i: { building: Building; asOf: ISODate; today: ISODate; mode: ColourMode; matches: Candidate[]
  highlightIds: ReadonlySet<string> | null; modifiedIds: ReadonlySet<string>; selectedSuiteId: string | null }): StackModel
```
Label rule: an active lease with `vacating` adds the tag "Vacant from MM/YYYY" (lease end + 1 day) to the cell and tooltip.

`aria-label` examples:
- "Suite 500, floor 5, vacant, 10,250 SF"
- "Suite 600, floor 6, Flamingo Row Media, 12,400 SF, expiring, lease ends 30 Apr 2027"
- Potential suites add ", potential: Flamingo Row Media lease ends 30 Apr 2027"; matches add ", match 1".

Keyboard: roving tabindex (exactly one suite has `tabIndex=0`). Left and Right move within a floor; Up and Down move to the same index on the floor above or below, clamped. Enter and Space select. Escape sends `select(null)`.

**E2E expectations:** see `spec.md` A14 (expected values) and A15 (acceptance criteria per story). All runs pin `?today=2026-11-15`; suite ids are `odt-<number>`, e.g. `suite-odt-500`.

---

## 5. Algorithms

### 5.1 statusAt (inclusive boundaries; ISO strings compared lexically)
```
statusAt(s, D, today):
  if s.kind == 'common': return {status:'common'}
  active = s.leases.find(l => l.start <= D && (l.end == null || D <= l.end))   // non-overlap ⇒ at most one
  if active:
    if active.end != null && active.end <= addMonthsIso(D, 12): return {status:'expiring', lease:active}
    return {status:'occupied', lease:active, openEnded: active.end == null}
  next = minBy(s.leases.filter(l => l.start > D), l => l.start)
  if next: return {status:'vacant', overlay:'committed', nextLease:next}          // committed wins over potential
  last = maxBy(s.leases.filter(l => l.end != null && l.end < D), l => l.end)
  if last && last.end >= today:                                                   // ended in [today, D)
    from = addDaysIso(last.end, 1)
    if !last.vacating: return {status:'vacant', overlay:'potential', endedLease:last, availableFrom:from}
    return {status:'vacant', overlay:'none', availableFrom:from}                  // "Vacant from MM/YYYY"
  return {status:'vacant', overlay:'none', availableFrom: today}
```
Required tests:
- A lease with end == D is active, and expiring.
- end == D+12 months is expiring; D+12 months + 1 day is occupied.
- start == D is active.
- A lease ending on today-1 gives plain vacant at D > today; one ending on today gives potential.
- An open-ended lease is never expiring or potential.
- A vacating lease gives overlay 'none'.
- A suite with both a past and a future lease is committed.

`riskBucket`:
- common → 'common'; vacant → 'vacant'; open-ended → 'openEnded'.
- Otherwise check m in [6, 12, 24, 36]: the first m where `end <= addMonthsIso(D, m)` gives `le{m}`; if none, 'gt36'.
- So the le12 bucket is exactly the expiring set.

`isAvailable(s, st, inclPot)` is true when all hold: s.kind == 'leasable', st.status == 'vacant', st.overlay ≠ 'committed', and (st.overlay ≠ 'potential' or inclPot).

### 5.2 findFits
```
findFits(b, req, D, today):
  out = []
  for f in b.floors:
    A = f.suites.map(s => isAvailable(s, statusAt(s,D,today), req.includePotential))
    for i in 0..n-1:
      if !A[i]: continue
      total = 0; run = []
      for j in i..n-1:
        if !A[j]: break
        if j > i && !f.suites[j-1].joinsNext: break        // may only cross a combinable boundary
        run = [...run, f.suites[j]]; total += f.suites[j].areaSf
        if total < req.minSf: continue
        // first j where total ≥ min ⇒ dropping the right end is already < min
        minimal = (j == i) || (total - f.suites[i].areaSf < req.minSf)
        if minimal && passesFilters(run, total, req): out.push(toCandidate(f, run, total, req, D, today))
        break                                               // longer runs from i are never minimal
  return out.sort(rank).slice(0, MAX_RESULTS)

passesFilters: (req.maxSf == null || total <= req.maxSf)
               && (req.maxRentPsf == null || blended(run) <= req.maxRentPsf)
blended(run) = Σ(areaSf × askingRentPsf) / Σ areaSf            // rounded to 2 dp only for display
toCandidate: key = ids.join('+'); excessSf = total - minSf
  availability = any suite has overlay 'potential' ? 'potential' : 'now'
  availableFrom = maxIso(...suite availableFrom)                // always ≤ D
  caveats = [...(run.length > 1 ? [{kind:'combine', count}] : []),
             ...potential suites.map(s => {kind:'assumesNoRenewal', tenant: endedLease.tenant, leaseEnd: endedLease.end})]
rank(a, b): (a.availability=='now' ? 0 : 1) - (b...)  ||  a.excessSf - b.excessSf
            || a.suiteIds.length - b.suiteIds.length  ||  b.floor - a.floor
            || indexOfFirstSuite(a) - indexOfFirstSuite(b)      // determinism
```
Complexity is O(Σ n²) per floor, which is trivial at 40 suites.

### 5.3 Largest contiguous block (KPI, and the no-fit reason)
```
maximalRuns(f, D, today, inclPot):
  runs = []; cur = []
  for i, s in f.suites:
    if isAvailable(s, statusAt(s,D,today), inclPot):
      if cur.length && !f.suites[i-1].joinsNext: runs.push(cur); cur = []
      cur = [...cur, s]
    else if cur.length: runs.push(cur); cur = []
  if cur.length: runs.push(cur)
  return runs.map(r => ({floor:f.number, suiteIds: ids(r), totalSf: Σ r.areaSf}))
largestBlock = first of all runs sorted by totalSf desc, floor desc, first index asc; null if none
```
With no maxima set, `findFits` called with minSf equal to the block total returns this block as a candidate, so the KPI tile and the finder agree.

### 5.4 explainNoFit
```
explainNoFit(b, req, D, today):
  blk  = largestBlock(b, D, today, req.includePotential)
  runs = all maximalRuns(...)                                   // same eligibility
  total = Σ runs.totalSf; floors = distinct runs.floor
  reasons = []
  if !blk: reasons.push({kind:'nothingAvailable'})
  else:
    reasons.push({kind:'largestBlock', block: blk})
    if total >= req.minSf: reasons.push({kind:'spread', totalSf: total, floorCount: |floors|, blockCount: |runs|})
    by = []
    if findFits(b, {...req, maxSf: undefined}, D, today).length:      by.push('maxSf')
    if findFits(b, {...req, maxRentPsf: undefined}, D, today).length: by.push('maxRentPsf')
    if by.length: reasons.push({kind:'filtered', by})
  scanReq = {...req, includePotential: true}
  start = req.includePotential ? monthOffset(D,today) + 1 : monthOffset(D,today)  // checks D itself when the toggle is off
  for m in start..HORIZON_MONTHS:
    date = sliderDate(today, m)                  // slider steps: 1st of each month
    c = findFits(b, scanReq, date, today)
    if c.length: return {reasons, earliestFit: {date, candidate: c[0]}}
  return {reasons, earliestFit: null}
```
Copy:
- "Largest block is 10,500 SF on floor 7."
- "35,150 SF is available, but split into 5 blocks on 4 floors."
- "Space this size exists above your maximum size / rent."
- "Earliest fit: May 2027 — Suite 600 (potential)." ("(potential)" omitted when the fit is firm; "No fit in the next 5 years." when none) with a Jump to date button that dispatches `noFit/jump`.

### 5.5 applyScenario
```
applyScenario(base, changes):
  b = base
  for i, c in changes:
    r = applyOne(b, c, i); if !r.ok: return r          // error carries index i
    b = r.building
  return {ok:true, building:b}
applyOne(b, c, i):
  renew:    loc = findLease(b, c.leaseId) ?? fail('leaseNotFound')
            if loc.lease.end == null || c.newEnd <= loc.lease.end: fail('invalidDates')
            l2 = {...loc.lease, end: c.newEnd, vacating: false}
            if overlapsAny(l2, others(loc.suite, l2.id)): fail('overlap', "Overlaps <tenant> from <start>")
            return replaceLease(b, loc.suite.id, l2)
  vacate:   loc = ...; if c.on < loc.lease.start || (loc.lease.end != null && c.on > loc.lease.end): fail('invalidDates')
            return replaceLease(b, loc.suite.id, {...loc.lease, end: c.on, vacating: true})
  newLease: if c.end < c.start: fail('invalidDates')
            for sid in c.suiteIds:
              s = findSuite(b, sid) ?? fail('suiteNotFound'); if s.kind != 'leasable': fail('notLeasable')
              l = {id: `${sid}-scn${i}`, tenant: c.tenant, start: c.start, end: c.end, rentPsf: c.rentPsf}
              if overlapsAny(l, s.leases): fail('overlap', `Suite ${s.number} is leased to ${t} ${start}–${end}`)
              b = replaceSuite(b, sid, {...s, leases: sortByStart([...s.leases, l])})
            return ok(b)
overlaps(x, y) = x.start <= (y.end ?? '9999-12-31') && y.start <= (x.end ?? '9999-12-31')
```
- Every replace* rebuilds only the path building → floors → suites → leases. The base is never mutated, and a test checks this with a deep-frozen base.
- ChangeDialog validates with `applyScenario(base, [...changes, draft])` before dispatching.
- "Place tenant here" defaults: tenant "Prospect", start D, end `addDaysIso(addMonthsIso(D,60),-1)` (five years less a day), rent `candidate.blendedRentPsf`, suiteIds `candidate.suiteIds`.
- Scenario bar: `kpis(base)` versus `kpis(selectBuilding)` for occupancy, vacant SF and rent roll.

### 5.6 Suite widths and label truncation
```
maxPlate = max over floors of Σ suite.areaSf          (common space included)
floor.widthPct = plateSf / maxPlate × 100             → FloorRow style width:%
suite width: CSS flex, NOT JS:  flex: <areaSf> 1 0px;  min-width: var(--suite-min-w)
```
The CSS "resolve flexible lengths" algorithm is exactly the water-fill we want: give each suite its share W·aᵢ/Σa; freeze any suite below the minimum at the minimum; share the remaining width among the rest; repeat. So there is no measuring and no ResizeObserver.

Label priority uses container queries. Each SuiteCell has an inner wrapper with `container-type: inline-size`. The breakpoints below are literals in `stack.module.css`, because custom properties cannot be used inside `@container`.

| cell width | shows |
|---|---|
| ≥ 140px | cue · number · primary · SF · end |
| 104–139 | cue · number · primary · SF |
| 72–103 | cue · number · primary (ellipsis) |
| 44–71 | cue · number |
| < 44 | cue only |

The full text is always present in `aria-label` and in the hover tooltip. So the E2E checks visibility at 1440 px, and the unit tests only check DOM content. One E2E check runs at 1280 px and asserts `document.documentElement.scrollWidth <= 1280`.

3D (S13):
- Container `transform: rotateX(58deg) rotateZ(var(--rot, -35deg))` with no perspective (axonometric).
- Each floor is `translateZ(i × --floor-3d-h)`. Its top face is the same flex row of suites, and its front face is a flex row rotated -90deg about X.
- `useDragRotate` updates `--rot` in local state, not the reducer.
- If rotation slips, ship the fixed `-35deg`.

### 5.7 Hero data contract
The hero building `odt` (Ocean Drive Tower) is fully specified in `spec.md` A14: every suite, lease and rent, plus the expected KPI and finder results. Suite id = `odt-<number>`, lease id = `odt-<number>-l<n>`. S2 adds `data/ocean-drive-tower.test.ts` asserting the A14 table and every "must contain" item in DESIGN §7.

Second building `pbp`, Palm Bay Plaza (S10): 7 floors; podium floors 1–3 at 18,000 SF, tower floors 4–7 at 8,000 SF; about 25 suites, mostly 1–3k SF; common lobby on the ground floor; at least one 10k answer that needs 3 combined suites.

---

## 6. Story dependency graph and file ownership

```
W1: S1 → W2: S2 → W3: S3 → W4: S4 ∥ S6 → W5: S5 → W6: S7 ∥ S8 ∥ S10 ∥ S12 → W7: S9 ∥ S11 → W8: S13 ∥ S14 ∥ S15
```
| # | New files owned | Shared files edited (and why it is conflict-free) |
|---|---|---|
| 1 | all root configs, `package.json` with **all** deps (ai and anthropic included), `src/main.tsx`, a minimal `App.tsx`, `src/test/setup.ts`, `e2e/s01-smoke.spec.ts`, `git init`, fixed `.gitignore` | – |
| 2 | `src/shared/{isoDate,domain.schema,ask.schema}.ts`, `domain/{types,constants,dates,format,status,blocks,kpis}.ts`, `domain/testing/fixtures.ts`, `data/ocean-drive-tower.json`, `data/index.ts`, all of `app/state/*` except url.ts and useUrlSync.ts | – |
| 3 | `styles/*`, `features/layout/*`, `features/stack/*`, `e2e/helpers.ts`; rewrites `App.tsx` | – |
| 4 | `features/kpi/*`, `features/details/*` | App.tsx (KpiBar), RightPanel |
| 6 | `features/timeline/*` | CenterPane (slider) |
| 5 | `domain/findFits.ts`, `domain/caveats.ts`, `features/finder/{RequirementForm,MatchList,MatchCard,useMatches}` | LeftRail, RightPanel, `stack/useStackModel.ts` |
| 7 | `domain/explainNoFit.ts`, `finder/{MatchWhy,NoFit}` | RightPanel, MatchList |
| 8 | `features/risk/*` | CenterPane (toolbar, legend switch) |
| 10 | `data/palm-bay-plaza.json`, `state/url.ts`, `state/useUrlSync.ts`, `features/building/*` | Header, App.tsx, `state/init.ts`, `data/index.ts` |
| 12 | `domain/parseQuery.ts`, `features/ask/*`, `api/ask.ts`, `server/{ask,model,rateLimit,http}.ts` | LeftRail |
| 9 | `features/shortlist/*` | LeftRail, MatchCard (Save), App.tsx (overlays), Header (button) |
| 11 | `domain/scenario.ts`, `features/scenario/*` | CenterPane (ScenarioBar), SuiteDetails, MatchWhy, useStackModel, `state/selectBuilding.ts` |
| 13 | `features/three-d/*` | CenterPane (view switch), StackToolbar |
| 14 | `domain/csv/*`, `features/import/*` | Header |
| 15 | `shared/summary.schema.ts`, `features/summary-ai/*`, `api/summary.ts`, `server/summary.ts` | ClientSummary |

Every story owns `e2e/sNN-*.spec.ts` plus the `.test.ts` files next to its own source.

I checked every row against the others in its wave: the edited files do not overlap.

Frozen after their creating story; nobody else edits them:
- `package.json` and the lockfile (S1)
- `domain/types.ts`, `shared/domain.schema.ts`, `state/types.ts`, `reducer.ts` (S2)
- `tokens.css`, `global.css`, `suiteVisual.ts`, `e2e/helpers.ts` (S3)

If a later story needs a new token, it declares a local custom property in its own CSS module. If it needs a reducer change, that is a spec defect: stop and report it rather than editing.

Before committing, the orchestrator should check `git diff --name-only` against the story's row in this table.

---

## 7. Design tokens (`src/styles/tokens.css`)
Contrast ratios were computed (WCAG formula) for every pair marked with ✓.

```css
:root{
  --c-bg:#F5F6F8; --c-surface:#FFFFFF; --c-surface-2:#EEF0F4; --c-border:#DDE1E7; --c-border-strong:#B8C0CC;
  --c-text:#111827 /*16.4 on bg ✓*/; --c-text-muted:#5B6475 /*6.0 ✓*/; --c-focus:#2563EB;
  --c-accent:#C2185B /*Vice pink; 5.4 vs bg ✓, white ink 5.9 ✓*/; --c-accent-ink:#FFFFFF;
  --c-occupied:#1E3A6E; --c-occupied-ink:#FFFFFF;                          /*11.1 ✓*/
  --c-expiring:#A9CFF2; --c-expiring-ink:#0B1F3A; --c-expiring-edge:#4A7FB5;  /*10.1 ✓; edge 3.9 vs bg ✓*/
  --c-vacant:#F28C28;   --c-vacant-ink:#1C1206; --c-vacant-stripe:rgba(255,255,255,.35); /*7.5 ✓*/
  --c-potential:#FCD9B4; --c-potential-ink:#5A2A00; --c-potential-edge:#B45309;   /*8.9 ✓; edge 3.8 ✓*/
  --c-committed:#E9E4DC; --c-committed-ink:#3B3326; --c-committed-edge:#8A7B63;   /*9.8 ✓*/
  --c-common:#DADDE3; --c-common-ink:#3A4250;                               /*7.4 ✓*/
  --c-risk-le6:#3B0764;  --c-risk-le6-ink:#FFFFFF;   /*15.0 ✓*/
  --c-risk-le12:#6D28D9; --c-risk-le12-ink:#FFFFFF;  /* 7.1 ✓*/
  --c-risk-le24:#A78BFA; --c-risk-le24-ink:#1A1033;  /* 6.6 ✓*/
  --c-risk-le36:#D4C9FB; --c-risk-le36-ink:#1A1033;  /*11.6 ✓*/
  --c-risk-gt36:#F1EDFE; --c-risk-gt36-ink:#1A1033;  /*15.7 ✓*/
  --c-risk-open:#CBD2DC; --c-risk-open-ink:#1F2733;  /* 9.9 ✓*/
  --c-modified:#0F766E /*5.5 ✓*/; --c-up:#15803D; --c-down:#B91C1C;
  --pat-hatch:repeating-linear-gradient(135deg,var(--c-vacant-stripe) 0 3px,transparent 3px 8px);
  --pat-committed:repeating-linear-gradient(45deg,rgba(59,51,38,.14) 0 2px,transparent 2px 6px);
  --edge-potential:2px dashed var(--c-potential-edge); --edge-committed:1px solid var(--c-committed-edge);
  --match-ring:0 0 0 2px var(--c-surface),0 0 0 4px var(--c-accent);  /* white inner ring: pink alone is 1.9 on occupied */
  --dim-opacity:.28; --dim-filter:saturate(.35);
  --font-sans:'Inter Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --fs-2xs:10px; --fs-xs:11px; --fs-sm:12px; --fs-md:13px /*body*/; --fs-lg:15px; --fs-xl:18px; --fs-kpi:22px;
  --fw-regular:450; --fw-medium:550; --fw-semibold:650; --lh-tight:1.2; --lh:1.4;  /* + font-variant-numeric: tabular-nums on numbers */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px; --sp-6:24px; --sp-8:32px;
  --r-sm:3px; --r-md:6px; --r-lg:10px; --shadow-1:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.10);
  --header-h:48px; --kpi-h:64px; --rail-w:272px; --panel-w:336px;
  --floor-h:40px; --floor-gap:2px; --suite-gap:2px; --floor-label-w:32px; --suite-min-w:28px; --floor-3d-h:22px;
  --dur-fast:120ms; --dur-status:180ms; --ease:cubic-bezier(.2,0,0,1);
}
@media (prefers-reduced-motion:reduce){:root{--dur-fast:0ms;--dur-status:0ms}}
```
Rules:
- **Non-colour cues** (required by DESIGN.md):
  - vacant: hatch plus "VACANT";
  - potential: dashed edge plus "Potential";
  - committed: diagonal pattern plus a lock glyph plus "Leased from MM/YYYY";
  - expiring: clock glyph plus "MM/YYYY";
  - open-ended: "No end date" tag;
  - modified: a teal corner dot plus "modified" in the aria-label;
  - match: ring plus a numbered badge.
- **Fills on the page background.** The suite surfaces fall below 3:1 against the light background (vacant 2.3, expiring 1.5). So suites sit on `--c-surface` with 2px gaps, and expiring suites get `--c-expiring-edge`.
- **Light theme only.** No dark mode (not in DESIGN.md).
- **Risk ramp.** Violet, chosen so it cannot be read as either availability blue.

---

## 8. Risks
| # | Risk | Mitigation |
|---|---|---|
| 1 | Parallel executors edit the same file, or the lockfile, and break the one-commit-per-story merge | All deps in S1; the frozen-file list and §6 table; the orchestrator compares `git diff --name-only` with the owned list; a reducer or type gap is reported, not patched in place |
| 2 | Vercel function runtime: ESM resolution of `../server/*.js` and `../src/shared/*.js` in a `"type":"module"` repo, and the named `POST(Request)` Web handler, were **unverified** when this was written | `.js` suffixes on every relative import under `api/`, `server/` and `src/shared/`; `src/shared` imports zod only; S12's done-criterion is a deployed `curl -X POST /api/ask`, which must return 503 (no key) or 200, not 500. If it fails, fall back to the `export default { fetch }` form. The client's offline fallback means the demo survives anyway |
| 3 | Date and timezone off-by-one (`new Date('YYYY-MM-DD')` parses as UTC; month-end arithmetic) | All date maths in `dates.ts` on ISO strings with parseISO/format; a lint rule bans `new Date` in domain and shared code; Playwright runs in America/New_York; scan dates are `sliderDate(today, m)`; boundary tests in §5.1 |
| 4 | Hero data drifts, or a story's change silently alters the demo answers, and the E2E or the video breaks | The fixture table in §5.7 is the contract; S2 adds `data/ocean-drive-tower.test.ts` checking statuses and KPIs; S5 and S7 add the 10k and 12k assertions; filler leases must end on or after 2027-06-01 |
| 5 (minor) | The 50-line function lint on JSX-heavy components and the 3D hit-testing eat time | Split components early; 3D cut order: fixed angle first, then cut S13 |

Unverified: Playwright browser install and run; Vercel deploy behaviour; live availability of the `claude-haiku-5-5` model; the `reactRefresh.configs.vite` call form (typed as either an object or a function, and lint passed with the object form); the two domain lint rules (spec only).
