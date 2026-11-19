# StackMatch

An interactive 3D stacking plan for office buildings. It answers the question a leasing broker has: **where can my tenant go, and when?**

- **Prototype:** https://stacking-plan-ten.vercel.app/
- Built for the Ascendix "Vice City" tech challenge, November 2026. All buildings, tenants and leases are made-up demo data.

## The problem

A stacking plan shows who is in a building. A broker with a client needs more:

- What is vacant today?
- What expires in the next 12 months?
- Where could a 10,000 SF tenant go, today and later?

A static stack answers the first two at best. For the third, the broker reads suite sizes, guesses which suites can be joined, and remembers which leases end when. If the broker offers space and the tenant then renews, the broker loses the client.

## The solution

The app opens on a 3D building. Floors are stacked plates, suites are blocks sized by area, and each suite shows its status on its face.

| Question | How the app answers it |
|---|---|
| What is vacant today? | Visible at once: vacant suites are orange and say "VACANT". A tile shows the total (38,150 SF in the demo building). |
| What expires in 12 months? | Visible at once: expiring suites are light blue with the end date. A tile shows the total (26,500 SF). |
| Where could 10,000 SF go? | Type the size. The rest of the building fades and the matching suites lift out, ranked, each with a "why this works" note. |

What else the broker can do:

- **Move the date.** A slider goes five years ahead. Space that frees up later shows as "potential", never as "available".
- **Make room.** When nothing fits, the app proposes moving one tenant to a vacant suite to free a larger block, and plays the move in 3D.
- **Ask in plain words.** An AI assistant answers questions about the building. Its numbers come from the app's own logic, not from the model.
- **Look inside.** Separate the floors, open a floor view, or take a walk-through tour of a suite.
- **Share.** Save matches to a shortlist and print a client summary with no tenant names and no rents.
- **Use your own data.** Import a building from a CSV file. A 2D stack is one click away and is shown when 3D is not supported.

## Tools used

**How it was built**

1. Two solutions were built side by side: one with **Codex 6.1 Sol**, one with **Claude Code** on **Claude Opus**.
2. **Claude Fable 5.2** acted as the judge. It compared the two and gave a verdict.
3. The final app was updated based on that verdict, then extended and polished with Claude Code.

Separate AI agents wrote and reviewed each part, and the tests ran after every step. The challenge deck asks for the BMAD loop tool. This build followed the same shape (one agent per story, separate review, one commit per story) but did not use that tool.

**In the app**

- React, TypeScript, Vite. three.js for the 3D building.
- Claude Haiku for the AI assistant, through the Vercel AI SDK. The key stays on the server.
- Vitest and Playwright for tests. Vercel for hosting.

**Demo video:** Playwright for the screen capture, ffmpeg for the encoding, Kokoro (a local AI voice) for the voiceover.

## Assumptions

- A lease that ends is **not renewed**. Its space shows as "potential", never as "available".
- Space with a signed future lease is "committed" and is never offered as a match.
- Suites can be joined only where the data marks them as joinable. Being neighbours is not enough.
- Suite width shows area. It is not the real floor shape.
- A Make room move is a proposal. It assumes the tenant agrees to move.
- Asking rent is used to price potential space.
- "Expiring" means the lease ends within 12 months of the date shown.

## Limits

- Desktop only (1280 px and wider). No accounts: data stays in the browser.
- Tested on made-up data only. No real lease data has been loaded.
- The AI assistant works only on the bundled demo buildings. Imported data is never sent to the AI.
- 3D was tested in Chrome. Without WebGL the app shows the 2D stack.
