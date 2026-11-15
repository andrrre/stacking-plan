# StackMatch

StackMatch is an interactive stacking plan for office buildings. The app opens on a 3D model of the building, drawn in WebGL. It answers the question a leasing broker actually has: **where can my tenant go, and when?**

Built for the Ascendix "Vice City" tech challenge, November 2026. All buildings, tenants and leases are fictional demo data.

**Status of the other deliverables:** there is no public deploy and no demo video yet. Both need the team's accounts and a decision (see [Status](#status-of-the-other-deliverables)). The app runs locally in two commands. The plan for turning it into a real feature is in [docs/development-plan.md](docs/development-plan.md).

## The problem

A stacking plan shows who is in a building. A broker with a prospect needs more:

- What is vacant today?
- What expires in the next 12 months?
- Where could a 10,000 SF tenant go, today and later?

A static stack answers the first two at best. The third means reading suite sizes, guessing which suites can be joined, and remembering which leases end when. A broker who offers space that the tenant then renews loses the client.

## The solution

StackMatch opens on a 3D building: floors as stacked plates, suites as blocks sized by area, with the status written on each suite's face. The broker can then ask the building a question. The 2D stack is one click away and is the automatic fallback when WebGL is not available. Each of the three questions has a place in the app.

| Question | Where it is answered | What it looks like on the 3D building (hero building, as of 15 Nov 2026) |
|---|---|---|
| What is vacant today? | On first paint, no clicks | Vacant suites are orange, hatched and labelled "VACANT" on their faces. KPI tile: 38,150 SF vacant. |
| What expires in 12 months? | On first paint, no clicks | Expiring suites are light blue and their faces show a clock and the end date. KPI tile: 26,500 SF expiring. |
| Where could 10,000 SF go? | Type "10,000" in the requirement box | The rest of the building ghosts. Suite 500 (10,250 SF) and the combination of Suites 700 and 710 (10,500 SF) lift out of it with a ring and a rank badge, 1 and 2. |

Then the broker moves the date. At mid-2027 a 12,400 SF suite whose lease ends in April 2027 appears as **potential** space, and the match list re-ranks. Matches that look good go into a shortlist, which prints as a client-ready page.

The hero workflow is: requirement, matches with reasons, move the date, shortlist, client summary.

## Features

All fifteen planned stories are built, including CSV import and the AI summary intro. The one item left out on purpose is a lease timeline view, which is in the development plan. DESIGN.md ranks 3D as a low-priority, CSS-only view with no WebGL. The project owner overruled that: 3D is now the main screen.

**3D building (the main screen)**
- Built with three.js and `@react-three/fiber`. The three.js code is a separate lazy chunk, so the header, KPI tiles and form paint first.
- Floors are stacked plates with depth, a roof cap and a base. Each suite is a block on its floor, sized by area. Smaller floor plates are narrower: the second building shows a podium and tower.
- It is drawn from the same view model as the 2D stack, so the two cannot disagree: the same status colours (read from the same CSS tokens), vacant hatch, dashed potential edge, committed pattern and lease-risk colours.
- Labels sit on the facade: status cue (VACANT, a clock and end date for expiring, a lock and start date for committed, Potential), suite number, tenant and area. The least important parts drop out as a face gets smaller. Floor numbers run down the side.
- Every feature drives it. A search ghosts the rest of the building and lifts the matches out with a ring and a numbered rank badge. The date slider, lease-risk mode, KPI highlights, scenarios, selection, the second building and imported buildings all apply.
- Controls: drag to orbit, scroll or pinch to zoom, rotate and zoom buttons, **Reset view**, and **Separate floors**, which spreads the floors apart, raises the viewpoint and moves the labels onto the top faces so the plates can be read from above.
- Accessibility: the canvas is mirrored by one focusable button per suite with the same accessible names as in 2D. Arrow keys move between suites, Enter selects, and the scene shows a visible focus indicator. The 2D stack remains the most readable view for detail.
- Fallback: without WebGL, or if the 3D scene fails, the 2D stack is shown with a short note. Printing uses the 2D stack.
- The default view is 3D. `view=stack` in the URL selects the 2D stack. Rendering is on demand: nothing is drawn while idle. No third-party requests.

**2D stack (the alternative view)**
- One click on the view toggle switches to it. It is the most readable view for detail.
- Floors top to bottom, suites left to right. Suite width is proportional to area.
- Status comes from the as-of date: occupied, expiring (within 12 months), vacant, common space.
- Four KPI tiles: occupancy, vacant SF, SF expiring within 12 months, largest contiguous block. Clicking a tile highlights its suites.
- Every suite is a keyboard-focusable button with a full text label. In the 2D stack, availability status is never shown by colour alone: vacant suites are hatched and say "VACANT", expiring suites show a clock and the end date, potential suites have a dashed edge and say "Potential" (with the ending lease when the cell is wide enough), and committed suites show a lock. Lease-risk mode is the exception noted under limitations.
- Suite details: tenant, area, rent, lease dates, months left, what the suite can combine with.

**Space finder**
- Requirement: minimum SF, optional maximum SF, optional maximum rent, "include potential space".
- Matches are single suites or runs of neighbouring suites that are marked combinable. Runs are minimal. The top 5 are ranked: firm before potential, smallest excess SF, fewest suites, higher floor.
- "Why this works" for each match: suites, total SF, excess, blended asking rent, the date all space is free, and plain-word caveats.
- When nothing fits, the app says why (largest block, space split across floors, a limit that is too tight) and names the earliest date a fit appears, with a **Jump to date** button. If potential space is switched off and a potential fit exists on the date shown, it offers **Include potential space** instead.
- While a requirement field is invalid, the list keeps the last valid results and says so above them.

**Time machine**
- A date slider from today to five years out, in monthly steps (61 positions). Statuses, KPIs, matches and both views recompute.
- Two labelled overlays on vacant space: **potential** (a lease ends before that date; shown dashed, never called "available") and **committed** (a signed lease starts later; excluded from matches).

**Lease risk**
- A second colour mode that colours suites by months to lease end (6, 12, 24, 36, over 36, no end date) with its own legend.

**Shortlist, compare, client summary**
- Save matches, compare them in a table, print a client summary (`window.print()`, so save as PDF from the print dialog).
- The client summary contains no tenant names and no lease rents. Caveats are reworded for the client ("Subject to the current tenant vacating").

**Scenario simulator**
- Renew, vacate or add a lease, without changing the base data. A bar shows occupancy, vacant SF and annual rent roll before and after.
- **Place tenant here** on any match adds a new lease from the match. In the hero building, placing a tenant on Suite 500 moves occupancy from 72% to 79% and rent roll by +$492,000.

**Ask box**
- Type a requirement in plain words ("Law firm, roughly 9-11k SF, moving in by Q2 next year, under $60"). The app fills the requirement form and sets the date. The broker sees and can edit what was understood.
- An offline parser handles this with no network. An AI model reads the sentence instead when a key is configured.

**CSV import**
- Import a building from a CSV file. A template is downloadable. Errors are listed by row and column, and any error rejects the whole file.

**URL state and a second building**
- Building, date, colour mode, view and requirement are in the URL, so a link restores the screen.
- A second bundled building, Palm Bay Plaza (7 floors, 28 suites, small suites), shows that nothing is hard-coded to the hero.

## Run it

Requires Node.js 22.12 or newer (the test runner, Vitest 5, needs it). It was built and tested on Node 24.

```
npm ci
npx playwright install chromium    # only needed for the end-to-end tests
npm run dev                        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serves the build on port 4173 |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run test` | Vitest unit and component tests |
| `npm run test:e2e` | Playwright end-to-end tests (builds and serves the app itself) |
| `npm run test:all` | Typecheck, then lint, then Vitest, then Playwright. This is the one command a reviewer needs. |

`npm run e2e:install` is the same as the `playwright install chromium` line.

The AI endpoints (`/api/ask`, `/api/summary`) are Vercel functions and do not run under `npm run dev`. The app does not need them: it falls back to offline parsing and templated text.

A deploy ships security headers from `vercel.json`: a Content-Security-Policy and related headers.

### The `?today=` parameter

The app reads today's date once. Add `?today=YYYY-MM-DD` to the URL to override it, for example `http://localhost:5173/?today=2026-11-15`.

Why: every status, KPI and match depends on today. The demo data and all tests are written for 15 Nov 2026. Without the parameter the numbers in this README drift as the real date moves on. The tests and the demo recording pin it.

## Optional AI

The app is fully usable without it. Every test and the demo run on the offline fallback.

Set two variables on the server only, as Vercel environment variables (`.env.example` lists the names; nothing in the repo reads a local `.env` file):

| Variable | Meaning | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Enables the AI paths. Never sent to the browser. | unset (AI off) |
| `AI_MODEL` | Anthropic model id | `claude-haiku-5-5` |

What is sent to the model:

- **Ask:** the sentence the broker typed (at most 500 characters) and today's date. The model returns only requirement fields (minimum and maximum SF, maximum rent, move-in date), checked against a schema. It never picks suites; the deterministic finder does.
- **Client summary intro:** the shortlisted options in their client wording: building name, floor, suite numbers, SF, asking rent, available-from date, caveat notes. Never tenant names. At most 5 options.
- **Imported buildings:** nothing. While an imported building is shown, neither the Ask box nor the summary intro makes an AI request, because imported data may be real; both use the offline parser and templated copy.

If the key is missing, or the call fails or takes more than 8 seconds, the app uses the offline parser and templated summary copy. The Ask box then shows an "offline parsing" note.

For a public deploy, use a dedicated key with a spend limit set at the provider, and set it for the Production environment only, so preview deploys do not get it.

## Tools used

- **Claude Code** with the **oh-my-claudecode "autopilot"** workflow, working from [DESIGN.md](DESIGN.md).
- **App stack:** React 19, TypeScript 6, Vite 8, zod 4 (all external input is validated), date-fns 4. No chart library.
- **3D:** three.js 0.187.0 and `@react-three/fiber` 9.8.2, with no other 3D library.
- **AI in the product:** Vercel AI SDK (`ai` 7) with an Anthropic model, server-side only and optional.
- **Tests:** Vitest 5 with Testing Library, Playwright 1.65, ESLint 10.
- **Hosting target:** Vercel (`vercel.json`, `api/`). Not deployed.

### How it was built

The challenge deck asks developer teams to use the BMAD loop (the `bmad-loop` tool: a fresh session per story, tests run by the orchestrator, a separate review session, one commit per story). **This build followed that shape but did not use the `bmad-loop` tool.**

- The first build followed DESIGN.md's priority and shipped 3D as a secondary CSS view. The project owner then redirected the project to make 3D the main screen, and it was rebuilt in WebGL in a follow-up. The CSS view was removed. The story count and commit list below describe the first build.
- Each story was implemented by a separate agent with no shared context.
- The orchestrator ran the test command (`typecheck`, `lint`, `test`, then Playwright).
- A separate reviewer agent reviewed every feature story before its commit (the two stack-view parts were reviewed together). The scaffold and the end-to-end demo-flow test were checked by the orchestrator only, with no reviewer agent.
- There is one commit per story; see `git log`. By kind: 16 feature-story commits (scaffold; types, data and status logic; stack view in two parts; KPIs and details; slider; finder; why and no-fit; lease risk; URL and second building; Ask; shortlist and summary; scenarios; 3D; CSV; AI summary), the end-to-end demo-flow test, a visual polish pass, these documents, small fixes, and the final-validation fixes.
- **Stories built in parallel within a wave were tested together as one combined tree and then committed one by one.** Those individual commits were not each tested in isolation, so checking out a commit in the middle of a wave may not pass the full test command.

At the end, three final validators (functional, security, code quality) reviewed the whole project, and their findings were fixed in a final commit.

Reviews were substantive, not a rubber stamp. Several used independent brute-force or property checks against the domain logic: the space finder on 100,000 randomised cases, the no-fit explanation on 18,208, scenarios on 40,000, and the CSV parser on 1,357 hostile inputs. Reviews changed the code. Examples: a size parser read "10,5k" as 105,000 SF; an API endpoint accepted cross-site requests; clicks in the 3D view missed suites; a dialog's focus trap could be escaped.

**Test counts at the time of writing:** 1,034 Vitest tests in 80 files and 103 Playwright tests in 15 files, all passing in `npm run test:all`.

**Not used, although the deck suggests them:** the UI/UX Pro Max and Taste skills, Lovable, Claude Design, ElevenLabs.

## Assumptions

From the project's assumptions table:

1. **Autopilot, not `bmad-loop`.** The BMAD trail is approximated, as described above.
2. **Vacant SF includes committed space**, with an "of which potential ... committed ..." second line.
3. **Slider steps fall on the 1st of each month.** This makes "Earliest fit: May 2027" true for a lease that ends 30 April.
4. **What-if shortlist entries carry an "Indicative" caveat** in the client summary.
5. **Suite 400's lease is the one marked vacating**, so the match list re-ranks at mid-2027.
6. **The header Print button prints the current stack**, legend, KPIs and date.
7. **The shortlist is capped at 10 entries** per building and each can be removed.
8. **Tenant names are fictional.** They were chosen not to match real firms. That cannot be fully verified, which is why the "Demo data" badge is shown.

From the design:

- A lease that ends is assumed **not renewed**. Its space is shown as "potential", never "available".
- **Back-to-back renewals are not modelled.** The mock data has none.
- Suite widths are proportional to area. They are not real floor plates.
- Which suites can be combined is stored per boundary between suites. Touching rectangles do not imply they can be joined.
- Asking rent is used to price potential space.
- All tenant and building names are fictional mock data.

## Known limitations

- **Desktop only.** Designed for 1280 px wide and up. No mobile layout.
- **No accounts, no server database.** State lives in the browser. The URL holds the view; the shortlist and imported buildings are in `localStorage`. Scenarios are in memory and vanish on reload.
- **Imported buildings:** they can be removed from the building switcher. If browser storage is full, the save fails silently and the building is gone after reload. CSV dates must be `YYYY-MM-DD` and the file UTF-8; dates outside the years 1900 to 2200 are rejected. Limits: 1 MB, 2,000 rows.
- **Lease-risk mode:** suites narrower than 140 px show the risk bucket by colour only. The words are in the tooltip and the screen-reader label.
- **Offline parser gaps:** it ignores sizes written with a European thousands dot ("9.000 SF") and does not read "by next year".
- **AI on imported buildings:** the Ask box and the summary intro make no AI request for an imported building, only for the two bundled ones. The client summary shows no "offline" note when it uses the template.
- **Rate limit is best-effort.** `/api/ask` and `/api/summary` deploy as separate functions, so each has its own budget of 10 requests per minute per client, counted per serverless instance; they do not share one. It trusts the platform's forwarded-IP headers. Real spend control is a budget cap on the provider key.
- **No authentication** on the API endpoints. They accept only same-site JSON requests.
- **Unverified on Vercel.** The `api/` functions have only been run in tests. Whether their imports resolve on Vercel is unknown until a deploy. If they fail, the AI paths return errors and the offline fallback keeps the app working.
- **WebGL 2 is required for the 3D building.** Without it the 2D stack is shown.
- **The 3D chunk is large:** `npm run build` gives 969 kB (259 kB gzipped) for the lazy three.js chunk, on top of a 459 kB (140 kB gzipped) main bundle.
- **Small facade labels:** on short windows or very tall buildings the labels get small. Zoom in, use **Separate floors**, or switch to the 2D stack.
- **Playwright tests use one browser** (headless Chromium, 1440 x 900, New York time zone) with software WebGL. Real GPUs and other browsers are unverified.
- **Fictional data only.** No real lease data has been loaded or tested.

## Status of the other deliverables

| Deliverable | Status | Why |
|---|---|---|
| README | This file | |
| Development plan | [docs/development-plan.md](docs/development-plan.md) | |
| Public app link | Not done | Needs a Vercel account login and a decision to publish. An Anthropic key is optional. |
| Demo video (60 s or less) | Not done | The planned tooling needs an ElevenLabs account. The beats are written in DESIGN.md section 9. |

**Recording the demo:** the demo starts on the 3D building. Go back to the match list ("All matches") before dragging the date. An open "why this works" panel hides the re-ranking. The search frame and **Separate floors** are the strongest 3D moments.

## Repository map

| Path | Contents |
|---|---|
| `DESIGN.md` | Product design and judging criteria |
| `src/app/` | App shell and state: reducer, URL and storage sync |
| `src/domain/` | Pure logic: status, KPIs, finder, no-fit, scenarios, CSV, query parser |
| `src/shared/` | zod schemas and limits shared with the server |
| `src/styles/` | Design tokens and global CSS |
| `src/features/` | One folder per feature (stack, finder, shortlist, scenario, ask, three-d, import). `src/features/three-d` is the WebGL building |
| `src/data/` | The two bundled mock buildings |
| `api/`, `server/` | The two optional AI endpoints and their shared code |
| `e2e/` | Playwright tests, including the three judging questions |
| `docs/` | The development plan, and `docs/spec/`: the requirement resolutions and technical specification written before the build |

Code comments that cite "spec" (for example "spec A6" or "spec-technical §5.4") refer to the files in `docs/spec/`.
