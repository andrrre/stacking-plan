# StackMatch: development plan

How the prototype could become a real Ascendix feature.

## Where we are

The prototype proves the idea: a broker asks a building a question, moves the date, and gets a ranked answer with reasons. It runs on made-up data in the browser.

The matching logic is separate from the screen, so it can be reused inside another product as it is.

Going to production is mostly a **data and trust** job, not a screen job.

## What must change

| Area | Today | For real use |
|---|---|---|
| Data | Demo files and CSV import | Read Property, Space and Lease records from xRE |
| Users | None | Use the host platform's login. A broker sees only what they may see in xRE. |
| Saved work | Kept in the browser | Shortlists saved per user and property, shareable with the team |
| AI and privacy | Only demo data goes to the model | A security and legal decision on what real data may go to an AI provider |
| Checks | One browser, made-up data | Real buildings, more browsers, an accessibility audit |

## Steps

Each step can ship on its own.

**Step 0. Check with real data and real brokers.**
Load a few real buildings through the CSV import and see what breaks. Show the prototype to brokers and watch what they do first.

**Step 1. Read-only stack on the Property page.**
The building, the totals, the date slider and the lease-risk colours, fed by xRE. No AI yet. It uses data the customer already keeps, so it gives value first.

**Step 2. Finder, shortlist and client summary.**
The space search with reasons, Make room, saved shortlists and the client page.

**Step 3. A true-to-life 3D model from photos.**
Today every building is drawn as simple blocks sized by area. In this step the user uploads a photo of the building and photos of the floor plans, and AI adjusts the 3D model to match:

- from the building photo: the shape, the number of floors, setbacks and the look of the facade;
- from the floor plan photos: the outline of each floor and where each suite sits.

A person checks and corrects the result before it is saved. Areas and lease dates still come from the lease data, not from the photo. The client then sees their own building, not a generic one.

**Step 4. Brochures.**
Send a shortlist or a building image into Composer, so the client page is a brochure and not a browser print.

**Step 5. Across the portfolio.**
- Search all buildings at once: "where can a 10,000 SF tenant go in any of my properties, and when?"
- A small stack in the property search results, so vacancy is visible before a property is opened.
- Renewal options and first-refusal rights on the stack. A tenant with a renewal option is a weaker source of potential space.

## More ideas

- **Alerts.** Save a client's requirement. Get a message when a lease change creates a fit.
- **Client link.** A read-only link with the 3D building and the suite tour, in place of a printed page.
- **Longer Make room chains.** Two or three moves in a row, and moves between buildings.
- **Lease documents in.** Upload a lease or a rent roll; AI reads the dates, areas and rents, and a person confirms.
- **Split a suite.** Try dividing a large vacant suite for two smaller tenants.

## Risks

| Risk | What we do about it |
|---|---|
| xRE has no field for which suites can be joined | Start with single-suite matches. Let users record joinable suites. |
| "Potential" space is taken for available space | Keep the label and the warning on every such match. Add renewal options in Step 5. |
| Lease data has gaps or is out of date | Check the data on load and show the problems. |
| Real data goes to an AI provider | Keep AI optional. Send only client-safe data, or use an approved provider. |
| The AI model reads a photo wrongly | A person confirms every model before it is saved. Areas never come from the photo. |
| 3D is slow or blocked on office machines | The 2D stack is the automatic fallback. |

## Open questions for the xRE team

1. Which objects and fields hold area, asking rent, lease dates and tenant? Can one lease cover several spaces?
2. Is there a field for joinable suites, suite order on a floor, or a notice to vacate?
3. Should this be a Lightning Web Component, and may it use 3D graphics there?
4. Which AI services are approved for customer data?
5. Which roles may see lease rents and tenant names?
