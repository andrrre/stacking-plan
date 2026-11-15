# StackMatch — Requirement resolutions and hero data

> **What this is.** The requirement resolutions (Part A) that the code comments cite as "spec A1" … "spec A15".
> It was written before the build, alongside [`spec-technical.md`](spec-technical.md) and [`DESIGN.md`](../../DESIGN.md).
> Where this file and the code differ, the code and its tests are authoritative.

Written 2026-11-15. Product behaviour is defined by [`DESIGN.md`](../../DESIGN.md); this file only adds
what an implementer would otherwise have to guess. Where the two disagree, this file wins, because every
entry here resolves a gap or contradiction found in DESIGN.md.

Part A is requirements (analyst pass, arithmetic independently recomputed). Part B is the technical
specification (architect pass).

---

# Part A — Requirements resolutions

## A1. Dates (lock before any domain code)

| # | Rule |
|---|---|
| D1 | Slider has 61 steps. Step 0 = `today`. Step n (1..60) = the 1st of month(today)+n. With today 2026-11-15: 2026-12-01 … 2031-11-01. The no-fit scan uses the same steps. |
| D2 | Domain works on `'YYYY-MM-DD'` strings via date-fns `parseISO` / `format`. Never `new Date('YYYY-MM-DD')` (UTC parse shifts a day in US time zones). `today` = local `format(new Date(),'yyyy-MM-dd')`, read once; `?today=` overrides. |
| D3 | `D` is clamped to [today, step 60]. A value between steps snaps down to the latest step ≤ value. |
| D4 | `moveInBy` = end of the named period (June → 06-30, Q2 → 06-30, a year → 12-31). `D` = latest step ≤ moveInBy. Absent → `D` unchanged. |
| D5 | Expiring: `D ≤ end ≤ addMonths(D,12)`, inclusive, date-fns clamping. |

## A2. statusAt

- Active: `start ≤ D` and (`end` null or `D ≤ end`). A lease ending on `D` is active on `D`.
- **Committed** = no active lease and some lease with `start > D` (however far off). Wins over potential.
- **Potential** = no active lease, not committed, and the lease with the latest `end < D` has `end ≥ today` and is not `vacating`. A lease that ended before `today` leaves plain vacant.
- A `vacating` lease, while active, shows its normal occupied/expiring status plus a "Vacant from MM/YYYY" tag (end + 1 day). After it ends: plain vacant, no overlay.
- Back-to-back renewals are not modelled (mock data has none); README lists it as a limitation.
- Result carries the leases the labels need: `{ status, overlay?, lease?, endingLease?, nextLease?, vacantFrom? }`.

## A3. Lease-risk buckets

Bucket k ∈ {6, 12, 24, 36} iff `end ≤ addMonths(D,k)`; else "over 36"; `end` null → "No end date"; no active lease → "vacant".
The ≤6 and ≤12 buckets together are exactly the `expiring` set, at every step. "Months remaining" in suite details is display only (`differenceInMonths`).

## A4. Labels

- For an expiring suite the clock + `MM/YYYY` is the status cue, so it outranks tenant and SF when width shrinks.
- Every suite's `aria-label` always carries number, status, tenant, SF and end date, whatever is truncated visually.
- Common suites need a display name: add `name?: string` to `Suite`.
- A dashed joint is drawn between neighbouring vacant suites that can combine; a solid wall otherwise. Suite details say what a suite can and cannot combine with.
- Suite width is proportional to SF with a minimum width, done in CSS flex (technical spec §5.6); a row never overflows.

## A5. findFits

- A run breaks at any unavailable suite (occupied, expiring, committed, common, potential with the toggle off) or at `joinsNext = false`. `joinsNext` on the last suite of a floor is ignored.
- Minimal iff `total − first < min` AND `total − last < min`. A single suite is always minimal. Overlapping minimal runs are both returned.
- `availability: 'now'` means **firm** (no non-renewal assumption); `'potential'` means at least one suite is potential. UI shows "now" iff `availableFrom ≤ today`, else "from MMM yyyy".
- `availableFrom` per suite = max(today, day after its latest ended lease); for a run, the max over its suites.
- Blended rent = Σ(area × asking) ÷ Σ area, unrounded for the max-rent comparison, 2 dp for display. `Candidate.blendedRentPsf` is required. zod: `askingRentPsf` required when `kind = 'leasable'`.
- Ranking: firm before potential → smallest excess SF → fewest suites → higher floor → lower position of first suite. Top 5.
- Caveats: `combine` first, then one `assumesNoRenewal` per potential suite, ordered by lease end.

## A6. explainNoFit

Returns reasons (types in the technical spec §3.2), then the earliest fit:

| Reason | When | Message |
|---|---|---|
| `nothingAvailable` | no available suite | "No space is available on this date." |
| `largestBlock` | any space is available | "Largest block is X SF on floor N." |
| `spread` | total available ≥ min | "X SF is available, but split into B blocks on F floors." |
| `filtered` | a fit exists once max SF and/or max rent is lifted | "Space this size exists above your maximum size / rent." |

- Then `earliestFit { date, candidate }` ("Earliest fit: May 2027 — Suite 600 (potential)"; "(potential)" omitted when the fit is firm) or `noFitInHorizon` ("No fit in the next 5 years").
- The scan always counts potential space. It starts at step(D)+1 when the toggle is on, and at step(D) itself when the toggle is off (a potential fit may already exist at `D`).
- Jump to date sets `D` and switches the toggle on.
- Largest block = the maximal run of consecutive available suites across `joinsNext` boundaries; follows only the toggle; ties go to the higher floor.

## A7. kpis

- Leasable SF = Σ leasable suites (common excluded). Leased SF = suites with an active lease on `D`. Occupancy = leased ÷ leasable; `null` (shown "—") when leasable is 0. Rounded only for display.
- Vacant SF = every suite with status vacant, committed included. Second line "of which potential X · committed Y" when either is > 0.
- Rent roll = Σ area × `rentPsf` of leases active on `D`.
- Clicking a KPI tile temporarily replaces the match overlay with that tile's suites; a second click or Esc restores it.

## A8. Scenarios

- Changes are validated when added (`validateChange`); Reset is the only removal, so a valid list stays valid.
- **Renew:** `newEnd` > current end, no overlap with a later lease, clears `vacating`. Disabled for open-ended leases.
- **Vacate:** `start ≤ on ≤ end` (any date ≥ start when open-ended). Default `on` = lease end, or `D` when open-ended.
- **New lease:** one lease per suite, same tenant/dates/rent; suites consecutive and combinable on one floor. Overlap is inclusive (`s1 ≤ e2 && s2 ≤ e1`, null end = ∞); any overlapping suite rejects the whole change with a message. Ids `scn-{changeIndex}-{suiteId}`. Five-year term: end = `addYears(start,5)` − 1 day.
- Switching building clears scenario, selection and match selection.
- The scenario bar compares base@D with scenario@D.

## A9. parseQuery (fallback grammar; also the test table)

- **Area:** `10000`, `10,000`, `10k`, `10.5k`, `10K SF`, `10,000 sq ft`, `10000sf`. Ranges `9-11k`, `9–11k`, `9k-11k`, `9,000 to 11,000`, `between 9 and 11k` → min/max (a trailing k applies to both). `at least N` → min. `up to|max|under N SF` → max. `~|about|roughly|around N` → min = N.
- **Rent:** only with `$` or `psf|/sf|per sq ft|per foot`. `under|below|max|<` → `maxRentPsf`.
- **Classification:** `$` → rent; `k` / SF / ≥ 1000 → area; anything else ignored.
- **Date:** `now|today|asap|immediately` → today. `by <Month> [YYYY]` (a month already past this year means next year). `by Qn [YYYY|next year]`. `by YYYY` → 12-31. Past → today. Beyond the horizon → step 60 plus a note.
- Everything else is ignored. No size found → partial result, UI says "Size not understood", finder does not run. Input capped at 500 characters.

## A10. CSV import

- RFC-4180 parsing (quoted commas, CRLF, BOM). Header required: case-insensitive, trimmed, any order; unknown columns are an error. Rows numbered spreadsheet-style (header = row 1).
- `joins_next` / `vacating` accept true/false/yes/no/1/0/empty. Dates are real `YYYY-MM-DD`; `lease_end ≥ lease_start`.
- `tenant` present → `lease_start` and `rent_psf` required; empty `lease_end` = open-ended. Lease columns without a tenant, or a lease on a common suite → error.
- Suite-level columns must match across a suite's rows. Suite numbers are unique per floor. Suite order = first appearance; floors display descending.
- Limits: 1 MB, 2,000 rows, first 50 errors shown. Building id `csv-{slug}` with a numeric suffix on collision; address empty and hidden.

## A11. Shortlist and client summary

- A snapshot = the `Candidate` plus suite numbers and floor (ids alone cannot render later). Deduped on (building, suites, asOf, whatIf). Removable per entry. Capped at 10.
- A selected match survives a date move only if a candidate with the same suites exists at the new `D`; otherwise the selection clears.
- Client summary: header "Prepared {today}"; each option prints its own available-from date; the mini stack is layout only (neutral fill, suite numbers, options outlined and numbered).
- The summary contains no tenant name and no lease rent — only asking rent.
- Caveat wording: `combine` → "Requires combining N suites" (both audiences). `assumesNoRenewal` → broker "Assumes {tenant} does not renew (lease ends 30 Apr 2027)", client "Subject to the current tenant vacating (30 Apr 2027)". What-if entries add, for the client, "Indicative: depends on lease changes not yet confirmed."
- Dates "d MMM yyyy", money en-US.

## A12. URL and storage

- Params: `b`, `asOf`, `mode=availability|risk`, `view=stack|3d`, `min`, `max`, `rent`, `pot=0|1`, `today`. Parsed with zod; invalid values fall back to defaults silently; an unknown building falls back to the hero. All writes use `replaceState`, so the slider adds no history entries.
- localStorage keys `stackmatch.v1.shortlist` and `stackmatch.v1.imported`, read through zod; a failed read is ignored and never breaks first paint.

## A13. Input guardrails

`minSf` integer 1..1,000,000; `maxSf ≥ minSf`; `maxRentPsf` 1..1,000. The size field is a text input that accepts "10000", "10,000" and "10k", with an "e.g. 10,000" placeholder. Header [Print] prints the current stack, legend, KPIs and as-of date (lowest priority).

## A14. Hero building — "Ocean Drive Tower", 1 Ocean Drive, Vice City

Fictional. 12 floors, 32 suites (29 leasable, 3 common), 134,800 leasable SF. Left → right; `J` = `joinsNext`.

| Fl | Suite | SF | J | Ask | Lease (tenant, start → end, rent) |
|---|---|---|---|---|---|
| 12 | 1200 | 10,800 | – | 62 | Pelican Point Partners, 2021-07-01 → 2031-06-30, 60 |
| 11 | 1100 | 3,600 | J | 58 | Tidewater Legal LLP, 2023-10-01 → 2028-09-30, 56 |
| 11 | 1110 | 2,900 | J | 58 | Seagrape Studio, 2024-06-01 → 2029-05-31, 57 |
| 11 | 1120 | 3,100 | J | 58 | Driftwood Architects, 2025-02-01 → 2030-01-31, 58 |
| 11 | 1130 | 2,800 | – | 58 | Seaglass Recruiting, 2023-03-01 → 2028-02-29, 55 |
| 10 | 1000 | 5,400 | J | 56 | Mangrove Analytics, 2022-10-01 → 2027-09-30, 54 |
| 10 | 1010 | 3,000 | J | 56 | vacant; committed: Bayfront Dental Group, 2027-03-01 → 2032-02-29, 56 |
| 10 | 1020 | 4,000 | – | 56 | Lantern Cove Software, 2024-09-01 → 2029-08-31, 55 |
| 9 | 900 | 12,400 | – | 55 | Coralstone Insurance, 2020-01-01 → 2029-12-31, 53 |
| 8 | 800 | 7,900 | J | 54 | Marlin & Gray LLP, 2023-07-01 → 2028-06-30, 52 |
| 8 | 810 | 4,500 | – | 54 | Blue Heron Health, 2024-11-01 → 2029-10-31, 53 |
| 7 | 700 | 4,300 | J | 51 | vacant (past lease 2020-01-01 → 2025-12-31, 49) |
| 7 | 710 | 6,200 | – | 53 | vacant |
| 7 | 720 | 1,900 | – | 52 | Halcyon Tide Realty, 2025-04-01 → 2030-03-31, 50 |
| 6 | 600 | 12,400 | – | 50 | Flamingo Row Media, 2017-05-01 → 2027-04-30, 48 (not vacating) |
| 5 | 500 | 10,250 | J | 48 | vacant (past lease 2019-07-01 → 2026-06-30, 46) |
| 5 | 510 | 2,150 | – | 48 | Northpier Engineering, 2025-09-01 → 2030-08-31, 47 |
| 4 | 400 | 6,100 | J | 45 | Sunquay Logistics, 2022-06-01 → 2027-05-31, 44, **vacating** |
| 4 | 410 | 4,000 | – | 46 | vacant |
| 4 | 420 | 1,300 | J | 46 | Saltwind Ventures, 2023-11-01 → 2028-10-31, 45 |
| 4 | 430 | 1,000 | – | 46 | Keystone Reef Labs, 2026-04-01 → 2031-03-31, 46 |
| 3 | 300 | 5,600 | – (core) | 44 | vacant |
| 3 | 310 | 4,800 | J | 44 | vacant |
| 3 | 320 | 1,200 | J | 44 | Breakwater Consulting, 2024-04-01 → 2029-03-31, 43 |
| 3 | 330 | 800 | – | 44 | Palmhaven Wealth, 2025-12-01 → 2030-11-30, 44 |
| 2 | 200 | 3,500 | J | 42 | Citrus Lane Capital, 2023-02-01 → 2028-01-31, 41 |
| 2 | 210 | 3,000 | J | 42 | Starboard Staffing, 2023-05-01 → 2028-04-30, 41 |
| 2 | 220 | 2,600 | J | 42 | Kite Beach Travel, 2024-09-01 → 2027-08-31, 40 |
| 2 | 230 | 3,300 | – | 42 | Gullwing Print Co, 2019-01-01 → open-ended, 38 |
| 1 | 100 / 110 / 120 | 7,200 / 3,000 / 2,200 | – | – | common: Lobby, Fitness centre, Conference centre |

**Data file:** [`src/data/ocean-drive-tower.json`](../../src/data/ocean-drive-tower.json) is this table as JSON (ids `odt-<number>`, lease ids `odt-<number>-l<n>`). The two past leases are held by Harbor Lane Advisors (700) and Causeway Mutual (500).

**Expected values (recomputed independently; use these in tests, never the 6.1 sketch figures):**

| As of | Leased SF | Occupancy | Vacant SF | Expiring SF | Largest block | Rent roll |
|---|---|---|---|---|---|---|
| 2026-11-15 | 96,650 | 71.7% → "72%" | 38,150 (committed 3,000) | 26,500 | 10,500 · Fl 7 | $4,913,650 |
| 2027-05-01 | 87,250 | 64.7% | 47,550 (potential 12,400) | 23,400 | 12,400 · Fl 6 | $4,486,450 |
| 2027-07-01 | 81,150 | 60.2% | 53,650 (potential 12,400) | 25,200 | 12,400 · Fl 6 (toggle off: 10,500 · Fl 7) | $4,218,050 |

**Expected finder results:**

- min 10,000 @ today → `[500 (10,250, +250), 700+710 (10,500, +500, $52.18)]`. 300/310 never returned.
- min 10,000 @ 2027-07-01 → `[400+410 (10,100, firm), 500, 700+710, 600 (potential)]`.
- min 12,000 @ today → no fit; "Largest block is 10,500 SF on floor 7"; "Earliest fit: May 2027 — Suite 600 (potential)".
- Ask "Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60" → min 9,000, max 11,000, rent 60, `D` = 2027-06-01 → `[400+410, 500, 700+710]`.
- Place tenant on 500 @ today → occupancy 72% → 79%, rent roll +$492,000.

**Sketch vs rules (6.1 is illustrative):** the sketch's top floor is 9 and its KPI and scenario figures cannot hold for this building; suite "710" appears on two floors in the sketch (floor 8's is 810 here). Demo beat 5 places the tenant on Suite 500, a single suite.

## A15. Acceptance criteria per story

All E2E runs pin `?today=2026-11-15`.

1. **Scaffold.** The single verify command (typecheck + lint with no-console + Vitest + Playwright) exits 0. A smoke test loads `/` and sees "StackMatch" and a "Demo data" badge. `vite build` succeeds.
2. **Types, data, statusAt, kpis.** Hero JSON passes the zod schema. A data-contract test asserts every "must contain" item in DESIGN §7. statusAt boundary cases from A2. kpis match the table in A14 at all three dates. Empty building → occupancy null.
3. **Stack.** 12 floor rows descending; 32 suite buttons; aria-labels per A4; vacant suites show "VACANT" + hatch; expiring suites show a clock and MM/YYYY at 1280 px; floor 12's row is narrower than floor 11's; legend has 4 entries; arrow keys move focus, Enter selects.
4. **KPI tiles, details.** Tiles read "72%", "38,150 SF", "26,500 SF", "10,500 SF · Fl 7". Clicking the largest-block tile highlights exactly 700 and 710. Details for 600: tenant, 12,400 SF, $48.00, 30 Apr 2027, Expiring, 5 months. 700 says it can combine with 710; 300 says it cannot combine.
5. **findFits, form, overlay.** Unit results per A14. max 10,300 → `[500]`; max rent 50 → `[500]`. Minimality, toggle-off, committed exclusion, cap of 5. E2E: "10000", "10,000" and "10k" each light #1 Suite 500 and #2 Suites 700+710; other suites are dimmed; max < min shows a validation error.
6. **Slider, overlays.** 61 steps, "Today" to "Nov 2031". 1010 reads "Leased from 03/2027". At 2027-07-01, 600 reads "Potential · Flamingo Row Media lease ends 04/2027" with a dashed outline, and the 10,000 list is as in A14. No transition under `prefers-reduced-motion`.
7. **Why this works, no-fit.** 700+710 shows 10,500 SF, +500 SF, $52.18, "Requires combining 2 suites". min 12,000 shows the A14 reasons; Jump sets `asOf=2027-05-01&pot=1` and lists 600. min 60,000 → "No fit in the next 5 years".
8. **Lease risk.** At today: 600 is ≤6; 400, 220, 1000 are ≤12; 210, 420 are ≤24; 810 is ≤36; 900 is over 36; 230 is "No end date". The ≤12-and-under set equals the expiring set at every step 0..60.
9. **Shortlist, summary.** Saving adds one entry; saving again does not. Entries do not change when `D` or the scenario changes. Compare shows one row per entry. Summary DOM contains no dataset tenant name and no lease rent. Print calls `window.print`.
10. **URL, second building.** A URL with every param restores state on reload. Garbage params fall back with no console error. Switcher lists 2 buildings; switching clears scenario and selection. Slider drags add no history entries.
11. **Scenario.** Base data deep-frozen in tests and unchanged. Place tenant on 500: 72% → 79%, +$492,000, "modified" marker. New lease on 1010 from 2027-01-01 is rejected. Renewing 600 to 2032-04-30 removes it from the Jul 2027 matches. Vacate on 600 makes it plain vacant. Reset clears.
12. **Ask.** parseQuery table test covers A9. E2E with `/api/ask` failing: the law-firm query fills the form as in A14 and shows the "offline parsing" note. API rejects input over 500 characters and falls back on schema-invalid model output.
13. **3D.** 32 suite elements with the same status classes; clicking 500 opens its details; match outlines persist; date changes recolour.
14. **CSV.** Template parses with 0 errors. A fixture with a bad date, a duplicate suite and an overlapping lease returns row/column errors and imports nothing. A valid import survives reload.
15. **/api/summary.** Request payload contains no tenant names; with no key the templated copy is returned.

## Assumptions

Each is a guess that would have been an interview question. Ranked by how much a returning human would want to veto it.

| # | Assumption | Basis | Reversibility |
|---|---|---|---|
| 1 | Autopilot builds the stories; the BMAD-loop trail is approximated (one commit per story, tests per story, separate review pass), not produced by bmad-loop itself. | User invoked autopilot explicitly. | – |
| 2 | Vacant SF includes committed space, with an "of which committed" line. | DESIGN §6.2: committed is an overlay on vacant. | Cheap: one KPI line. |
| 3 | Slider steps are the 1st of each month. | Makes "Earliest fit: May 2027" true for a lease ending 30 Apr. | Expensive after story 2: fixtures and E2E. |
| 4 | What-if shortlist entries carry an "indicative" caveat in the client summary. | Anti-goal: no implausible match without a caveat. | Cheap. |
| 5 | Suite 400 is the vacating lease, so the list re-ranks at mid-2027. | Demo beat 4 says "re-ranks". | Cheap: data only. |
| 6 | Header [Print] prints the stack view. | Undefined in DESIGN. | Cheap. |
| 7 | Shortlist capped at 10, removable per entry. | Needed for a usable list. | Cheap. |
| 8 | Fictional tenant names do not collide with real firms. | Cannot be fully verified; "Demo data" badge and README cover it. | Cheap. |

---

# Part B — Technical specification

In [`spec-technical.md`](spec-technical.md): file layout, pinned dependencies and scripts, contracts (schemas,
domain functions, reducer, URL, storage, API), component tree with test hooks, algorithms in pseudocode,
story waves with file ownership, design tokens, risks.

Precedence on any conflict: Part A of this file → `spec-technical.md` → `DESIGN.md`.

## Reconciliation (where the two passes disagreed, and what holds)

| Topic | Holds |
|---|---|
| Hero building | Part A14 (complete, numbers recomputed). The architect's filler-based table was removed. |
| Slider steps | 1st of each month (A1), via `sliderDate(today, m)`. |
| Result shapes | The architect's discriminated unions (`StatusResult`, `NoFit`, `ScenarioResult`, `CsvResult`). |
| `Candidate.blendedRentPsf` | Required. |
| `Suite.name` | Added, optional, for common space. |
| `Kpis.occupancyPct` | `null` for an empty building. |
| `kpis(..., includePotential)` | Accepted: the largest-block tile follows the toggle (DESIGN §6.2). |
| `applyScenario` | Returns a result object rather than throwing; the dialog validates by applying. |
| URL | Parameter `asOf`; `replaceState` only. |
| Renew | New end must be later than the current end; not offered for open-ended leases. |
| Shortlist | Entry id includes the what-if flag; capped at 10. |
| Theme | Light only. The dark theme was dropped: DESIGN.md does not ask for it. |
| AI provider | One env var `AI_MODEL` (default `claude-haiku-5-5`), Anthropic only. `generateObject` is deprecated in `ai` 7 but works; S12 checks current SDK docs first. |

## Story waves

`S1 → S2 → S3 → S4 ∥ S6 → S5 → S7 ∥ S8 ∥ S10 ∥ S12 → S9 ∥ S11 → S13 ∥ S14 ∥ S15`

File ownership per story is in `spec-technical.md` §6.
