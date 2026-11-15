# StackMatch development plan

How the StackMatch prototype could become a real Ascendix feature or product. For the prototype itself, see the [README](../README.md).

## Summary

- The prototype proves the **interaction**: a broker can ask a building a question, move the date and get a ranked, explained answer. It runs on fictional data in the browser.
- The domain logic is separate from the screen. It is pure TypeScript with no framework, which is the part most worth keeping.
- Going to production is mainly a **data and trust** problem, not a UI problem: real data from xRE, permissions, saved state, and a clear position on what goes to an AI model.
- Proposed path: five phases, each shippable on its own. Phase 1 puts a read-only stack on a Property page. Later phases add brochures, search, real geometry and lease options.
- **Limit of this document:** the author has not seen xRE's actual data model. The mapping below goes only as far as DESIGN.md supports. Everything else is marked **Assumption** and must be validated with the xRE team. No effort, cost, date or team-size estimates are given, because there is nothing in the repo to base them on.

## What the prototype proves

| Claim | Evidence in the repo |
|---|---|
| Brokers get the three key answers without clicking | Vacant SF, expiring SF and largest block show on first paint; a typed size gives ranked matches. End-to-end tests cover each. |
| Vacant is not the same as available | Status is derived from a date. Space freed by a lease ending is "potential" and labelled, never "available"; space with a signed future lease is "committed" and excluded. |
| Matches can be trusted | Combined suites must be marked combinable. The finder was checked on 100,000 randomised cases in review. |
| A dead end can explain itself | The no-fit result gives the largest block and the earliest date a fit appears. |
| The output can leave the building | The client summary has no tenant names or lease rents. |
| The logic is portable | `src/domain/` has no React and takes `today` as an argument. |

What it does **not** prove: that real xRE data is clean enough to drive it, that brokers want it inside xRE, or that the matching rules fit how brokers actually combine space. Those are the first things to test.

## What must change for production

### Data source

The prototype loads two JSON files and a user-imported CSV. Production reads from xRE.

Mapping at the level DESIGN.md supports (the objects are named there as xRE Property, Space and Lease):

| StackMatch type | Likely xRE source | Notes |
|---|---|---|
| `Building` | Property | Name, address. |
| `Floor` | Derived from Space | **Assumption:** floor is a field on Space, not its own object. |
| `Suite` | Space | Number, area in SF, whether it is leasable or common space, asking rent. |
| `Suite.leases` | Lease | Tenant, start, end, rent per SF. Past, current and future leases per space. |
| `joinsNext` (combinable with the suite to its right) | **No known source** | See open questions. |
| Suite order on a floor | **No known source** | The prototype uses left-to-right order only for drawing. |
| `vacating` flag | **No known source** | May map to a notice date, a status or a custom field. |

Everything in the right-hand column beyond the object names is an assumption to validate with the xRE team: field names, how multi-space leases are stored, how a lease with several spaces is split, and whether open-ended or month-to-month leases are marked.

Work needed:
- An adapter that turns xRE records into the `Building` type, validated by the existing zod schemas. Bad records are reported, not drawn.
- A fallback for missing data. The CSV import already defines a flat one-row-per-lease format; it can double as an interim path and as a spec for a data export.
- A decision on **where combinability and suite order come from**. If xRE has neither, someone must record them (see Phase 4).

### Auth and permissions

The prototype has no users. Production inherits the host platform's identity.

- A broker sees only properties and leases they may see in xRE. The component must not cache data across users.
- The client summary must stay free of tenant names and lease rents. The rule exists today as one function (`clientOptions`) and one test; keep it as the only path to client output.
- **Open:** whether asking rents or lease rents are restricted by role inside Ascendix's customers' orgs.

### Persistence

The prototype keeps the shortlist and imported buildings in browser `localStorage` and scenarios in memory.

- Shortlists become records tied to a user and a property, so they survive a browser change and can be shared with a team.
- A saved shortlist entry today is a frozen snapshot with the date it was saved for. Keep that: a broker needs to see what was offered on a given day. Decide whether the snapshot is stored as data or as a reference to leases that may change.
- Scenarios could stay in memory (they are what-ifs) or become saved drafts. Decide with brokers.
- Replace the browser-only imported buildings with real property data (above).

### The AI boundary and data privacy

Today the AI is optional, runs server-side, and receives only mock data. Facts from the code:

- **Ask** sends the typed sentence (at most 500 characters) and today's date. The model returns requirement fields only, checked against a schema. It never picks suites.
- **Summary intro** sends client-safe option data, no tenant names. It is never requested for imported buildings.
- Every path has an offline fallback. A failed or slow call (8 s) falls back silently.

For production:
- Decide whether real property or lease data may go to an external model provider at all. The prototype's answer is "only the client-safe projection, never tenant names". Confirm this with Ascendix's security and legal owners and with customer contracts. **Not known here.**
- Keep the model on field extraction. The "AI returns filters, not answers" design means a wrong model output is a visible, editable form value, not a wrong recommendation.
- Move the provider key and model choice into the platform's secret store. Replace the in-memory, per-instance rate limit with a shared one, plus a provider-side budget cap.
- Log what was sent, not only what came back, if the data-privacy position requires an audit trail.
- If the Salesforce platform has its own approved AI services, evaluate them instead of calling a provider directly. **Assumption:** not assessed here.

### Accessibility

The prototype already has keyboard-focusable suites, arrow-key navigation, text labels in addition to colour, a focus-trapped dialog and reduced-motion support. It has **not** been audited by a specialist or tested with screen readers.

- Run an accessibility audit and fix findings before release.
- Lease-risk mode shows the bucket by colour only on narrow suites; the words are in the tooltip. Revisit this.
- The 3D view is a showpiece. Its suites are keyboard-focusable and it has rotate and reset buttons, but suites behind upper floors cannot be clicked at some angles and it has not been tested with assistive technology. The 2D stack remains the accessible view.
- Desktop-first at 1280 px. A property-page component may be narrower; layout needs a pass.

### Testing

The prototype has 980 unit and component tests and 92 end-to-end tests, all on fictional data in one browser.

- Add a contract test suite for the xRE adapter, using anonymised real records.
- Run end-to-end tests on more than Chromium and at the component's real width.
- Test with real-sized buildings. The hero has 12 floors and 32 suites; the performance of the finder and the 3D view on 60 floors is untested.
- Time zones: dates are handled as `YYYY-MM-DD` strings on purpose. Keep that through the adapter.

## Phases

Each phase is shippable alone. A phase's dependencies must be met before it starts. No dates are given.

### Phase 0: validate with real data and users

**Delivers:** an answer to the open questions below, before any build.
- Export a few real buildings from xRE (anonymised) and load them through the CSV import. See what breaks.
- Show the prototype to brokers with the three judging questions. Record what they do first.

**Depends on:** access to sample xRE data; a few brokers' time; a security and legal view on AI.

### Phase 1: read-only stack on the Property page (Lightning Web Component)

**Delivers:** the stack, KPI tiles, date slider and lease-risk colours inside a Salesforce Lightning Web Component on the Property record page. Data comes from xRE Property, Space and Lease. No AI, no shortlist yet.

**Depends on:** the xRE adapter; confirmation of the Salesforce component platform and its limits (the prototype is React, so it is either re-built as an LWC or wrapped; **not decided here**); permission rules.

**Why first:** it uses data the customer already keeps and gives the clearest value, vacant and expiring on first paint.

### Phase 2: finder, shortlist and client summary in the component

**Delivers:** the space finder with explained matches and no-fit, plus saved shortlists and the printable client summary.

**Depends on:** Phase 1; combinability and suite order data (see Phase 4 if xRE lacks them, in which case ship with single-suite matches only); a place to store shortlists.

### Phase 3: Composer brochure feed

**Delivers:** a shortlist or a stack image flowing into Composer brochures, so the client page is a brochure rather than a browser print.

**Depends on:** Phase 2; Composer's template and data-input options. **Assumption:** the client summary's data (`clientOptions`) is a suitable input. The prototype's print page is a stand-in; the real integration is not designed.

### Phase 4: real geometry and combinability

**Delivers:** floor plates drawn from real geometry instead of proportional bars, and recorded combinability of neighbouring suites.

**Depends on:** a source of floor-plate geometry (CAD, BIM or a floor-plan service; **not identified**); a way for users to record which suites can join, if xRE has no such field.

**Note:** the prototype's `joinsNext` flag was chosen because drawing adjacency is cheaper than knowing it. Real geometry replaces the drawing but not the contractual question of whether space can be combined.

### Phase 5: search, portfolio and lease options

**Delivers:**
- A **mini stack in property search results**, so a broker sees vacancy before opening a property.
- **Portfolio search** across buildings ("where can a 10,000 SF tenant go in any of my properties, and when?"). The finder's output is per building today. Ranking across buildings is a new design problem.
- **Lease options and encumbrances** on the stack: renewal options, right of first refusal (ROFR), right of first offer (ROFO). These change what "potential" means: a tenant with a renewal option is a weaker candidate for potential space.

**Depends on:** Phases 1 to 4; how xRE stores options and encumbrances (**unknown**); search architecture for the host platform.

### Later: backlog

From DESIGN.md section 11. Not built, not sequenced:
- Lease timeline view (floors as rows, leases as bars): the one deck visualisation left out of the prototype.
- Multi-floor contiguous blocks.
- Prospect pipeline pinned to suites; tenant-in-market alerts.
- Suite split and demising scenarios.
- Lease abstract upload with AI extraction; Excel rent-roll import.
- A shareable read-only client link, as an alternative to print.

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| xRE data lacks combinability, suite order or notice flags | Matches may be shown that are not physically or contractually plausible | Start with single-suite matches; record combinability explicitly (Phase 4); keep caveats on every combined or potential match |
| "Potential" space is mistaken for available space | A broker offers space the tenant then renews and loses the client | Keep the label, dashed outline and caveat; extend with renewal options (Phase 5) |
| Lease data is stale or has gaps (missing end dates, overlaps) | Wrong statuses and KPIs | Validate on load as the CSV import does; show data problems instead of hiding them |
| Real data goes to an AI provider | Customer confidentiality | Keep AI optional and limited to field extraction on client-safe data; get a security and legal decision first |
| Prototype stack (React) does not fit the host platform | Rework in Phase 1 | Settle the component approach in Phase 0; keep `src/domain/` framework-free |
| Scale: larger buildings and portfolios | Untested performance | Test with real-sized data early in Phase 1 |
| Per-instance rate limit and unverified serverless deploy | The AI paths may fail or be abused | Shared rate limit, provider budget cap, and a real deploy test before relying on them |

## Open questions for the xRE team and Ascendix

1. Which xRE objects and fields hold space area, asking rent, lease start and end, lease rent, and tenant? Are leases linked to one space or several?
2. Is there any field for combinability of spaces, suite order on a floor, or a notice to vacate?
3. Does xRE store renewal options, ROFR/ROFO and other encumbrances, and in what shape?
4. Is the target a Lightning Web Component, and can it use a React-based build or must it be rebuilt?
5. Which AI services, if any, are approved for customer data? Is an external provider acceptable for the client-safe summary and the Ask sentence?
6. Which roles may see lease rents and tenant names?
7. How does Composer take structured input today, and could it take a shortlist?
8. Which brokers will test it, and on which buildings?
