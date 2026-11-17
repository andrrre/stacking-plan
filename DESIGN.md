# StackMatch — Interactive Stacking Plan: Design

Ascendix "Vice City" tech challenge, November 2026. Due **2026-11-18, end of day**.
Status: draft for approval. Written 2026-11-15.

This is the single source of truth. Everything it was built from is in [`context/`](context/):
the kickoff deck, the rules screenshots, and three earlier proposals from other models.

---

## 1. Intent

A stacking plan shows who is in a building. A broker's real question is **"where can my tenant go, and when?"**

StackMatch is a standalone web app that draws a building as a stack of floors (every suite with tenant, area, lease status and expiry) and then lets the broker *ask the building a question*: enter a requirement, see the suites and suite combinations that satisfy it light up, move the date forward, and watch the answer change. Good options go into a shortlist that exports as a client-ready page.

**Persona:** a leasing broker working one office building for a prospect. Asset managers and leasing agents are served by the lease-risk view and the scenario simulator, but they do not drive the layout.

**How it is judged** (kickoff deck, slide "One reference in…"):
1. **UX first.** A broker answers in ten seconds: what is vacant today, what expires in the next 12 months, where could a 10,000 SF tenant go.
2. **UI second.** Of those that pass, which looks like a product a broker would pay for.

The challenge site also has a voting step, and the rules list idea chips (interactive stacking plans, 3D, AI-assisted tools, leasing scenario simulators). So the hero workflow must be deep, and each chip must be visibly present.

---

## 2. Judgement of the three proposals

| | A · `stacking-plan-design.md` | B · `stacking-plan-functionality-suggestions.md` | C · `deep-research-report.md` |
|---|---|---|---|
| **What it is** | A buildable spec | A product brief | Market research plus a concept |
| **Best at** | Engineering: status derived from date, a suite holds a list of leases, pure domain functions, minimal adjacent runs, AI returns filters not answers, offline fallback, the three judging questions as E2E tests, a cut order | Product truth: the outcome is a *credible shortlist*; vacancy is not availability; expiry is not availability; adjacency must be recorded; failed searches must explain themselves | Differentiation: competitors already ship nice stacks, so win on "Fit + Time Machine"; one colour meaning per mode; acceptance tests; edge cases; a 60-second script |
| **Weak at** | Five feature groups at equal weight, no hero. A lease that ends silently becomes "vacant". Adjacency inferred from draw order. Two competing entry points (Fit box and Ask box). A per-suite AI flyer that is not the broker's job. react-three-fiber for a showpiece. WALT tile answers none of the three questions | No data model, stack, tests or plan. Pushes 3D, AI and scenarios to "later", though the rules name them | Eight-entity relational model for a POC. Treats Fit as a third colour mode. Ranks by `abs()` variance, so a too-small suite can outrank a real fit. Dismisses 3D and AI, though the rules name them and colleagues vote |
| **Verdict** | Keep the skeleton | Keep the rules and the shortlist | Keep the hero and the name |

### What this design takes, changes and drops

| Decision | Source | Why |
|---|---|---|
| Hero = requirement → matches → move time → answer changes | C | The only thing competitors' screenshots do not make immediate; it *is* judging question 3 |
| Outcome = shortlist with a client-facing export | B | Gives the demo an ending and replaces A's per-suite flyer |
| Vite + React + TS SPA, pure domain functions, lease list per suite, derived status | A | Fast, testable, fits one-story-per-session BMAD |
| "Potential availability" is a separate, labelled state | B, C (against A) | A broker who offers space the tenant then renews loses the client |
| Adjacency stored explicitly | B, C (against A) | Neighbouring rectangles do not prove suites can be joined |
| Ask box fills the requirement form | A's idea, merged | One entry point; the form is the "editable chips" |
| Fit is an overlay, not a colour mode | corrects C | Dim-and-outline works on top of either colour mode |
| All five idea areas stay in scope, but tiered | A's scope (decided by the user earlier), C's priorities | Chips get ticked without starving the hero |
| 3D done with CSS 3D transforms, not WebGL | mine | Same wow in the video, no heavy dependency, same DOM and tests |
| "Largest contiguous block" KPI replaces WALT | mine | Answers question 3 before the broker types anything |
| No-fit result names the earliest date a fit appears | mine, extending B | Turns a dead end into the time-machine moment |
| State in the URL | mine | Shareable link, deterministic demo recording and E2E |
| Dropped: Expand change type, per-suite flyer, Supabase/SQLite, tenant/prospect tables, timeline view | — | Cost without demo value; timeline goes to the backlog |

---

## 3. Goals, non-goals, anti-goals

**Goals**
- Questions 1 and 2 answered on first paint with zero clicks; question 3 with one typed number.
- One deep workflow: requirement → matches with reasons → time travel → shortlist → client summary.
- A visible, working slice of 3D, AI and scenario simulation.
- Public link, README, development plan, demo video of **60 s or less** (the rules say 1 minute; the deck's 90 s loses).

**Non-goals**
- Salesforce/xRE integration or live Ascendix data (described in the development plan only).
- Auth, multi-user, server-side persistence.
- Real floor-plate geometry, drag-and-drop moves, financial modelling beyond rent roll.
- Mobile layout. Desktop-first, usable down to 1280 px.

**Anti-goals** (failures even if it works)
- A judge hesitates over what a colour means.
- A match is shown that is not physically or contractually plausible, without a caveat.
- The demo depends on a network call succeeding.
- Status is conveyed by colour alone.
- Any confidential company, customer or personal data.

---

## 4. Constraints

- **Time:** Sunday evening Nov 15 to Wednesday Nov 18, including README, development plan and video.
- **Stack (user's choice):** React + TypeScript.
- **Process:** the BMAD loop is required (github.com/bmad-code-org/bmad-loop): fresh session per story → orchestrator runs tests → separate review session → one commit. Every story ships with tests. Pin a tested release.
- **Data:** mock only, fictional names, a visible "Demo data" badge. Assumptions stated in the README.
- **Repo rules:** immutable updates, files under 800 lines, functions under 50, zod on all external input, no secrets in code.
- **Polish tools from the deck:** UI/UX Pro Max before the first screen; Taste (density 8, motion 2) on working screens; 3–5 persona critics.

---

## 5. Approaches

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **1** | **Vite + React + TS SPA; bundled JSON data; state in a reducer and the URL; two small serverless functions for AI; Vercel** | No shared data between users, irrelevant for a prototype | **Chosen** |
| 2 | Next.js + Supabase | Real persistence, but schema and auth cost a day nobody sees | Rejected |
| 3 | Lovable | Fastest to a link, but the deck requires Claude Code + BMAD for teams with developers | Rejected |
| 4 | Salesforce LWC in xRE | Closest to the product, slowest loop | Rejected earlier by the user; goes in the development plan |

Supporting choices (my calls): zod for validation, date-fns for dates, Vitest + Testing Library, Playwright, plain DOM/SVG for the stack, CSS variables for theming, no chart or 3D library.

---

## 6. The product

### 6.1 Screen

```
┌ StackMatch · [Ocean Drive Tower ▾] · Demo data            [Import CSV] [Print] ┐
│ Occupancy 84% │ Vacant 31,200 SF │ Expiring ≤12 mo 24,900 SF │ Largest block 10,500 SF · Fl 7 │
├───────────────┬───────────────────────────────────────────┬──────────────────┤
│ REQUIREMENT   │ Colour: (Availability)(Lease risk)  View: (Stack)(3D)        │
│ Ask: [law firm│ 9│ 900 · Tenant A · 12,400 SF                │ MATCHES (2)     │
│  ~10k SF…  ⏎] │ 8│ 800 · Tenant B · 7,900 │▒710 VACANT 4,500▒│ 1 Suite 500     │
│ Size  [10,000]│ 7│▒700 VACANT 4,300▒┆▒710 VACANT 6,200▒│ 720 │   10,250 SF now │
│ Up to [     ] │ 6│ 600 · Tenant C · ends 04/2027 ◷           │ 2 700+710 Fl 7  │
│ Max rent [  ] │ 5│▒500 VACANT 10,250▒                        │   10,500 SF now │
│ ☑ Include     │ …│                                           │   2 suites      │
│   potential   │ 1│ Lobby & retail                            │                 │
│               │ ■ Occupied ◷ Expiring ≤12 mo ▒ Vacant ┄ Potential │              │
│ SHORTLIST (2) │ As of ◀━━━━●━━━━━━━━━━━━━━▶ Nov 2026 … Nov 2031  [Today]     │
│ [Compare]     │ Scenario: 2 changes · Occupancy 84% → 91% · Rent roll +$410k · [Reset] │
└───────────────┴───────────────────────────────────────────┴──────────────────┘
```

- **Left rail:** the requirement and the shortlist.
- **Centre:** the stack, legend, date slider, scenario bar (only when a scenario exists).
- **Right panel:** matches when a requirement is set; suite details when a suite is selected; "why this works" when a match is selected.
- The sketch shows today: two matches. Suite 600 is not listed until the date passes its lease end (6.4).

### 6.2 The stack (tier 1)

- Floors top-down, highest first. Suites left to right in stored order.
- Suite width is proportional to SF, scaled to the **largest floor plate**, so smaller floors draw narrower.
- Label priority as width shrinks: status cue → suite number → tenant or "Vacant" → SF → end date. What does not fit moves to the hover tooltip. Minimum width keeps every suite clickable.
- Every suite is a focusable button; arrow keys move between suites; Enter selects.

**Status is derived from the as-of date `D`, never stored:**

| Status | Rule | Colour (deck reference) | Non-colour cue |
|---|---|---|---|
| `occupied` | active lease, end more than 12 months after `D`, or no end date | dark blue | — ("no end date" tag if open-ended) |
| `expiring` | active lease, end within 12 months after `D` | light blue | clock icon + end date |
| `vacant` | no active lease on `D` | orange | hatch + "VACANT" |
| `common` | lobby, amenity | neutral grey | — |

Two overlays on `vacant`:
- **Potential** — vacant on `D` only because a lease ended between today and `D`, and that lease is not marked `vacating`. Dashed outline, label "Potential · Tenant C lease ends 04/2027". Never called "available".
- **Committed** — vacant on `D` but a signed lease starts later, however far off. Label "Leased from 03/2027". Excluded from matching. Committed wins when both apply.

A lease marked `vacating` (the tenant has given notice, or the broker confirmed it in a scenario) leaves plain vacant space when it ends: "Vacant from 05/2027", no caveat.

Boundaries: a lease is active when `start ≤ D` and (`end` is null or `D ≤ end`). It is expiring when `end ≤ D + 12 months`, inclusive.

**Colour modes** (one meaning each, own legend):
- *Availability* — the table above. Default.
- *Lease risk* — months to lease end, upper bounds inclusive: vacant, ≤6, ≤12, ≤24, ≤36, over 36, on a sequential ramp, plus a neutral "No end date" swatch for open-ended leases. Vacant suites keep their potential and committed overlays.

**KPI tiles**, all recomputed for `D` and for the active scenario; clicking a tile highlights its suites:
- Occupancy % = leased SF ÷ leasable SF
- Vacant SF — every suite with status vacant on `D`, with a second line "of which potential 10,400 SF" when there is any
- SF expiring within 12 months
- Largest contiguous block (SF and floor) — the largest run the finder could return with no size limit: it respects combinable boundaries, excludes committed space and follows the "include potential" toggle. The no-fit message uses the same number

**Suite details:** tenant, SF, rent or asking rent $/SF/yr, lease start and end, months remaining, status, what it can combine with, upcoming leases. Actions: Renew…, Vacate…, Lease to prospect….

**Buildings:** two bundled mock buildings with a switcher (three more were added later; five are bundled now). The first is tuned for the demo; the second has a different shape (uneven floor plates, more small suites) to show nothing is hard-coded.

### 6.3 Space finder — the hero (tier 1)

**Requirement:** minimum SF (required), maximum SF, maximum rent $/SF/yr, "include potential space" (default on). The move-in date *is* the as-of date: one date drives the whole screen.

**A candidate** is one suite, or a run of neighbouring suites on one floor where every boundary in the run is marked combinable, such that:
- every suite is available on `D` — vacant and not committed; potential suites only if the toggle is on;
- total SF ≥ minimum, and ≤ maximum when given;
- SF-weighted asking rent ≤ maximum rent when given (every leasable suite has an asking rent, and it is the rent used for potential space too);
- the run is minimal: dropping either end suite would fall below the minimum.

**Ranking:** available-now before potential → smallest excess SF → fewest suites → higher floor. Top 5.

**On the stack:** everything else dims; candidates get a numbered outline; combined runs get one outline around all their suites. The colour mode underneath does not change.

**Why this works** (per match): suites and total SF, excess over the requirement, blended asking rent, date all space is free, and caveats in plain words:
- "Requires combining 2 suites."
- "Assumes Tenant C does not renew (lease ends 30 Apr 2027)."

**When nothing fits**, say why and offer the way out:
- "Largest block is 8,100 SF on floor 2."
- "14,300 SF is available, but spread across 3 floors."
- "Earliest fit: May 2027 — Suite 600 (potential)." with a **Jump to date** button. The scan runs monthly from the month after `D` to the end of the slider and always counts potential space; Jump to date sets `D` and switches "include potential" on.

**Shortlist:** save any match. An entry is a frozen snapshot of the candidate plus the date it was saved for, kept per building; it does not recompute. An entry saved while a scenario was active is tagged "what-if". Compare view: a table of options by SF, floor, rent, available date, caveats. **Client summary:** a print-styled page with building name, a mini stack with the options outlined, the comparison table and the as-of date. It leaves out current tenants' names and rents, so caveats are stored as data and rendered twice: for the broker "Assumes Tenant C does not renew (lease ends 30 Apr 2027)", for the client "Subject to the current tenant vacating (30 Apr 2027)". Each option prints its own available-from date. Export is `window.print()` to PDF.

### 6.4 Time machine (tier 1)

Slider from today to +5 years in monthly steps, plus a Today button. Statuses, KPIs, both colour modes, matches and the 3D view all recompute for `D`. Suites animate their colour change (150–200 ms; none with `prefers-reduced-motion`).

Assumption, shown in the legend: a lease that ends is not renewed, and that space is *potential*, not available.

### 6.5 Scenario simulator (tier 2)

A scenario is an ordered list of changes applied over the base data; the base never changes.

| Change | Effect |
|---|---|
| Renew | new end date on an existing lease |
| Vacate | lease ends on a chosen date and is marked `vacating` |
| New lease | tenant, start, end, rent on one suite or a matched run |

The link to the hero: a match has **Place tenant here**, which opens a short dialog prefilled with tenant "Prospect", start `D`, a five-year term and the blended asking rent, then adds a New lease. On a potential match nothing else is needed, because the old lease has already ended by `D`. A New lease that overlaps another lease on the same suite is rejected with a message.

Potential space the broker has confirmed becomes plain vacant by adding a Vacate.

The scenario bar shows the change count and before → after for occupancy, vacant SF and annual rent roll (Σ SF × rent of leases active on `D`). Changed suites carry a "modified" marker. Reset clears. Scenarios live in memory only.

### 6.6 AI (tier 2)

**Ask box.** "Law firm, roughly 9–11k SF, moving in by Q2 next year, under $60" →
`POST /api/ask` → Claude returns structured fields only: `{ minSf, maxSf?, maxRentPsf?, moveInBy? }`, validated with zod → the fields fill the requirement form and set the date → the deterministic finder runs. The broker sees and can edit exactly what was understood. The model never picks suites.

**Client-summary intro** (first to cut). `POST /api/summary` sends the shortlisted options in their client wording (no tenant names) and returns a headline and a short paragraph for the summary page.

**Rules for both:**
- Vercel serverless functions, Vercel AI SDK `generateObject` with the shared zod schemas. Default provider Anthropic (small, fast model); provider is one environment variable.
- Key only in a Vercel environment variable (locally, a git-ignored `.env` read by the dev and preview server). Query capped at 500 characters. 8 s timeout. Simple per-IP rate limit. Only mock data is sent. Errors return a generic message.
- **Fallback when there is no key, or on timeout or error:** a rule-based parser (numbers and ranges with "k", "SF", "$", "by <month | quarter | year>", "now") and templated summary copy, with a small "offline parsing" note. The demo and all tests run on the fallback.

**Building chat** (added after this design; not in the tiers above). A header button opens a floating, read-only panel where the broker asks about the building on screen. `POST /api/chat` streams a plain-text answer. The model does not compute: it calls five server-side tools (`building_overview`, `list_suites`, `expiring_leases`, `find_space`, `suite_details`) that wrap the same domain code as the app, on the scenario-applied building at the as-of date, and its instructions require every number, date, suite number and tenant name to come from a tool result. This keeps "AI returns filters, not answers" in spirit, not in letter: the numbers are deterministic, the wording is not. Differences from the two rules above: the model is a separate variable (`AI_CHAT_MODEL`, default `claude-haiku-5-5` at low effort, the same default as the Ask model), tool results for the bundled buildings include fictional tenant names, lease dates and rents, there is no offline fallback (without a key the button is absent in a production build), and the turn has its own limits: server abort at 25 s, at most 5 model steps of at most 4,000 output tokens each, one tool call per step and the last step answer-only (so at most 4 tool calls per question; a 6-call budget is a second bound), and the browser gives up at 30 s. Imported buildings make no chat request, and the server refuses any building id that is not bundled. The panel is absent in present mode and during the tour.

### 6.7 3D view (tier 3)

The same floors and suites as extruded slabs in an axonometric projection, built with CSS 3D transforms. Drag rotates around the vertical axis. Same colours, same dimming and outlines for matches, same click-to-select, same date slider. No other features. If drag rotation eats time, ship a fixed angle.

### 6.8 CSV import (tier 3)

- One row per lease: `building, floor, suite, area_sf, kind, asking_rent_psf, joins_next, tenant, lease_start, lease_end, rent_psf, vacating`. A suite with no lease has one row with empty lease columns. Row order within a floor is left to right.
- zod validation per row; errors listed by row and column; any error rejects the file. Also rejected: duplicate suite on a floor, overlapping leases on a suite.
- A valid file adds a building to the switcher, stored in localStorage. A template CSV is downloadable.

---

## 7. Data model

```ts
type ISODate = string                      // 'YYYY-MM-DD'

type Building = { id: string; name: string; address: string; floors: Floor[] }
type Floor    = { number: number; suites: Suite[] }        // left → right
type Suite    = {
  id: string; number: string; areaSf: number
  kind: 'leasable' | 'common'
  askingRentPsf?: number                   // required when kind is 'leasable'
  joinsNext: boolean                       // can be combined with the suite to its right
  leases: Lease[]                          // non-overlapping; past, current, future
}
type Lease    = { id: string; tenant: string; start: ISODate; end: ISODate | null; rentPsf: number
                  vacating?: boolean }     // tenant is confirmed leaving at `end`

type Requirement = { minSf: number; maxSf?: number; maxRentPsf?: number; includePotential: boolean }

type Change =
  | { kind: 'renew';    leaseId: string; newEnd: ISODate }
  | { kind: 'vacate';   leaseId: string; on: ISODate }
  | { kind: 'newLease'; suiteIds: string[]; tenant: string; start: ISODate; end: ISODate; rentPsf: number }

type Candidate = {
  suiteIds: string[]; floor: number; totalSf: number; excessSf: number
  blendedRentPsf?: number; availableFrom: ISODate
  availability: 'now' | 'potential'; caveats: Caveat[]
}

type Caveat =
  | { kind: 'combine'; count: number }
  | { kind: 'assumesNoRenewal'; tenant: string; leaseEnd: ISODate }

type ShortlistEntry = { buildingId: string; candidate: Candidate; asOf: ISODate; whatIf: boolean }
```

Notes:
- `joinsNext` is the cheapest honest encoding of adjacency: a run can only cross a boundary that says it can. The demo data includes neighbouring vacant suites that **cannot** combine (a core between them).
- `end: null` is month-to-month or unknown. It renders as occupied with a "no end date" tag and is never counted as expiring or potential.
- All data is `readonly` in practice; every function returns new objects.

**Pure domain functions** (`src/domain/`, no React, most of the unit tests):

| Function | Returns |
|---|---|
| `statusAt(suite, D, today)` | status + potential/committed overlay |
| `kpis(building, D, today)` | the four tiles + rent roll |
| `findFits(building, req, D, today)` | ranked `Candidate[]` |
| `explainNoFit(building, req, D, today)` | reasons + earliest fit date |
| `applyScenario(building, changes)` | a new `Building` |
| `parseCsv(text)` | buildings or row errors |
| `parseQuery(text, today)` | partial `Requirement` + date (the fallback) |

`today` is always passed in, never read from the clock inside the domain. The app reads it once; `?today=` overrides it for tests and the recording.

**App state:** one reducer: building id, `D`, colour mode, view, requirement, selection, scenario changes, shortlist. Building, `D`, mode, view and requirement are mirrored to the URL query string. Imported buildings and the shortlist persist in localStorage, read through zod.

**Mock data must contain** (hero building, 10–12 floors, 30–40 suites):
- a single vacant suite of 10,000+ SF;
- a 10,000+ SF answer that exists only by combining two neighbouring suites;
- two neighbouring vacant suites that add up to 10,000+ SF but cannot combine;
- a 10,000+ SF suite whose lease ends in 5–9 months (the time-machine reveal);
- a vacant suite with a signed future lease (committed);
- one lease marked `vacating`;
- one open-ended lease; full-floor tenants; floors split 2–4 ways; a common ground floor;
- lease ends spread across five years.

---

## 8. Testing

- **Vitest**, every domain function, including: empty building; lease ending exactly on `D`; the 12-month boundary; open-ended lease; committed suite excluded; potential excluded when the toggle is off; non-combinable neighbours never returned; run minimality; maximum SF and maximum rent filters; ranking order; no-fit reasons and earliest date; scenario changes leave the base untouched; malformed, duplicate and overlapping CSV rows; parser phrases.
- **Playwright**, with `?today=` fixed:
  1. On load, vacant suites are visible and labelled.
  2. On load, expiring suites are visible with their dates.
  3. Typing 10,000 outlines the expected candidates in the expected order.
  4. Moving the date adds the potential candidate.
  5. One smoke test each: lease-risk mode, no-fit jump-to-date, shortlist and summary, scenario bar, Ask box on the fallback, 3D select, CSV import.
- AI endpoints are mocked. The test command the BMAD orchestrator runs: typecheck + lint + Vitest + Playwright.

---

## 9. Delivery

**Story order for the BMAD loop** (each with tests, one commit each):

| # | Story | Tier |
|---|---|---|
| 1 | Scaffold, tooling, test command, deploy pipeline | 1 |
| 2 | Types, hero mock data, `statusAt`, `kpis` | 1 |
| 3 | Stack view, legend, labels, keyboard access | 1 |
| 4 | KPI tiles, suite details panel | 1 |
| 5 | `findFits`, requirement form, match overlay, match list | 1 |
| 6 | Date slider, potential and committed overlays | 1 |
| 7 | "Why this works", `explainNoFit`, jump to date | 1 |
| 8 | Lease-risk colour mode | 1 |
| 9 | Shortlist, compare, client summary print | 1 |
| 10 | URL state, second building, switcher | 1 |
| 11 | Scenario changes, scenario bar, place tenant here | 2 |
| 12 | `parseQuery` fallback, Ask box, `/api/ask` | 2 |
| 13 | 3D view | 3 |
| 14 | CSV import and template | 3 |
| 15 | `/api/summary` copy | 3 |

| Day | Focus |
|---|---|
| Sun Nov 15 | Approve design → plan → BMAD setup → stories 1–2. Lock the design system with UI/UX Pro Max |
| Mon Nov 16 | Stories 3–9. Run the ten-second test on someone who has not seen it |
| Tue Nov 17 | Stories 10–14. Deploy. Rough video take |
| Wed Nov 18 | Taste pass, persona critics (broker, asset manager, leasing agent), README, development plan, final video, submit |

Monday carries the most (stories 3–9). If story 9 is not done by Monday night, start cutting on Tuesday morning rather than Wednesday.

**Cut order if time runs short:** 15 → 14 → 3D rotation (fixed angle) → 13 → New lease on multi-suite runs. Stories 1–9 are never cut.

**Deliverables:** public app link; README (problem, solution, tools, assumptions); development plan (xRE Property/Space/Lease mapping, LWC on the Property page, Composer brochure feed, mini stack in property search, real floor plates, options and encumbrances, portfolio search); video ≤ 60 s made with ElevenLabs + Playwright + ffmpeg, as the deck describes. All uploaded to a SharePoint folder; link submitted through the form.

**Demo beats (≤ 60 s):**
1. 0–7 s — "A stacking plan shows who is in a building. A broker needs to know where a tenant can go."
2. 7–16 s — The stack: vacant and expiring readable at once; KPI tiles.
3. 16–30 s — Ask: "10,000 SF". The building dims, a single suite and a two-suite combination light up; open "why this works".
4. 30–42 s — Drag the date to mid-2027: a potential suite appears and the list re-ranks.
5. 42–52 s — Place tenant here: occupancy and rent roll move. Flip to 3D.
6. 52–60 s — Shortlist → client summary. "StackMatch: what's available, what's coming, what fits."

---

## 10. Left to the builder

- Component and file layout within the repo rules; reducer shape.
- Exact visual design (via UI/UX Pro Max, then Taste), within the colour semantics and non-colour cues in 6.2.
- Model id, prompts, and rate-limit mechanism for the two endpoints.
- Mock data content, within the coverage list in section 7.
- Fallback parser grammar beyond the phrases listed.

## 11. Backlog (for the development plan, not built)

- Lease timeline view (floors as rows, leases as bars) — the one deck visualisation left out
- Multi-floor contiguous blocks; portfolio search across buildings
- Renewal options, ROFR/ROFO, encumbrances shown on the stack
- Prospect pipeline pinned to suites; tenant-in-market alerts
- Real floor-plate geometry; suite split and demising scenarios
- Lease abstract upload with AI extraction; Excel rent-roll import
- xRE objects and LWC; Composer templates; shareable read-only client link
