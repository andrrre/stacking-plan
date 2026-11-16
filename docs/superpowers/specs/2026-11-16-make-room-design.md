# Make room — design

Date: 2026-11-16. Status: approved by the project owner in conversation. Size: a small feature, about one day.

## Intent

StackMatch already covers every approach on the challenge brief. Make room is the one feature meant to stand out: when no space fits a requirement, the building proposes a tenant move that creates the space, and shows the move in 3D. Restacking is what brokers and landlords work out by hand on real deals. It must show well in the 60-second demo video and run with no AI key and no network.

## Goals

- When the finder has no fit on the date shown, offer up to three one-move options that create a fit.
- Each option is one sentence a broker can read aloud, plus what it frees.
- **Show move** previews the move on the 3D building without changing data.
- **Apply as scenario** puts the move into the existing scenario, so the scenario bar shows occupancy and rent roll before and after, and the freed block becomes a normal match.

## Non-goals

- Chains of two or more moves.
- Moves between buildings.
- Splitting or re-measuring suites.
- AI-proposed moves.
- A play button on the date slider (offered, not chosen).

## Anti-goals

- An option that breaks the app's own rules (a destination that is not free, a block that cannot be combined, a block over the maximum size or rent).
- A preview that changes the scenario or the base data.
- Wording that presents a move as agreed. It is always a proposal that depends on the tenant.

## Approaches

1. **One move, worked out by rules (chosen).** A tenant that blocks a run of available suites moves to a vacant suite elsewhere in the building. Deterministic, explainable in one sentence, and it turns the existing 12,000 SF no-fit demo into a fit.
2. **Chains of up to two moves.** Solves a few more cases. In the hero building it unlocks almost nothing extra, the search is larger, and the result is harder to explain. Rejected.
3. **AI-proposed moves.** Needs a key and a deploy, and can propose moves that break the rules. Rejected.

## Behaviour

### The solver (pure domain function, next to `findFits` and `explainNoFit`)

Input: building, requirement, as-of date `D`, today. Called only when `findFits` is empty on `D`. Output: at most three options, each with the mover (tenant, lease, suite), the destination suite and the freed candidate.

An option is valid when all of these hold on `D`:

- The mover holds an active lease on a leasable suite.
- Treating the mover's suite as available produces a run on that floor (joined only across `joinsNext` boundaries, minimal for the requirement, as in `findFits`) that meets the minimum SF and passes the maximum SF and maximum rent limits. The run must include the mover's suite.
- The destination is plainly vacant on `D` (not potential, not committed), is leasable, has area at least the mover's current area, and is not in the freed run.
- Mover and destination are in the same building. They may be on the same floor.

For each mover the destination is the valid suite with the smallest area, ties to the higher floor.

Ranking of options: smallest mover area first, then smallest destination excess (destination area minus mover area), then smallest freed-block excess over the minimum SF, then higher freed floor.

Reference case, hero building, today 2026-11-15, minimum 12,000 SF: the first option is Northpier Engineering (2,150 SF) from Suite 510 to Suite 410 (4,000 SF), freeing Suites 500 + 510, 12,400 SF on floor 5.

### The no-fit panel

A "Make room" section under the existing reasons, above or below the earliest-fit line (builder's call). Hidden when there are no options. Each option reads:

> Move Northpier Engineering (2,150 SF) from Suite 510 to Suite 410 (4,000 SF).
> Frees Suites 500 + 510: 12,400 SF on floor 5.
> Assumes Northpier Engineering agrees to relocate.

with two buttons, **Show move** and **Apply as scenario**.

### Show move (preview)

- 3D: the mover's block lifts out of its floor, travels to the destination suite and settles. The freed run then lights up with the same ring used for matches. The rest of the building is ghosted as it is for a search.
- Reduced motion: no flight; the end state is shown.
- 2D stack: the two suites carry "Moves out" and "Moves in" tags and the freed run is highlighted.
- The preview changes neither the scenario nor the base data. It ends when the broker picks another option, changes the requirement or date, or applies the move.

### Apply as scenario

- Adds the move to the scenario as existing change kinds: the mover's lease ends in its old suite, and a new lease for the same tenant starts in the destination with the same rent per SF and the same end date. This is my call, not the owner's: it keeps the scenario bar, Reset and URL handling unchanged. A new change kind is acceptable if the existing kinds cannot give the outcome below.
- Required outcome: on the scenario building, `findFits` for the same requirement on `D` returns the freed block, and the scenario bar shows the before and after figures.
- Known wrinkle for the builder: when `D` is after today, a lease ended between today and `D` reads as potential space, which needs "include potential space". The required outcome still holds; choose the dates or the handling so the freed block is a match on `D`.
- Movers whose lease cannot be re-created in the destination (for example an open-ended lease, if a new lease must have an end date) are not offered.

## Constraints

- Follows the project rules: immutable domain code, tests first, small files, no hard-coded values.
- The 3D building is the primary surface; the 2D stack must stay consistent with it.
- Existing spec figures and tests for the hero building must not change. The move uses the data as it is.
- Deadline 2026-11-18, with the deploy and demo video still open.

## Left to the builder

- Function and type names, and whether options live on `NoFit` or in a separate result.
- The animation path, timing and how the preview state is held.
- Exact placement and styling of the section in the no-fit panel.
- Test hooks and the e2e spec for the reference case.
- README and spec updates.
