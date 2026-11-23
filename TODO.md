# To-do list

Open questions, known errors and things to check on *Austin's Shifting Ground*. Last updated 2026-11-22.

**How this list works**

- Each item has a short code (E1, R3 …) so it can be named in conversation.
- A new question or error goes at the end of its section, with the date it was found.
- A finished item is ticked and moved to *Done* at the bottom with the date and what was decided.
- Items that touch private working data are kept in `private/TODO-private.md`, which is not in the repository.

| Section | What is in it |
|---------|---------------|
| [D](#d-decisions-waiting-on-the-maintainer) | Decisions only the maintainer can make |
| [E](#e-errors-found-not-yet-fixed) | Errors already found and not yet fixed |
| [R](#r-records-to-check) | Records that may be wrong or out of date and need checking |
| [F](#f-figures-and-documents-to-refresh) | Figures and documents that lag the data |
| [W](#w-dates-to-watch) | Things that will change on a known or expected date |
| [S](#s-site-behaviour-to-check) | How the site behaves |
| [H](#h-housekeeping) | Code and repository upkeep |

---

## D. Decisions waiting on the maintainer

- [ ] **D1. Commit and push the 22 November update.** The census move to the 2020–2024 survey, the redrawn light rail, and the record fixes are in the working tree only. Pushing `test` publishes the site.
- [ ] **D2. Which year the map opens on.** It opens on 2024, the latest census year, so closures and listings dated 2025–26 appear only when the slider reaches 2026. Opening on 2026 shows them at once, but the year shown would not be a census year.
- [ ] **D3. Preservation Austin grant list: on hold.** The maintainer is documenting where the list came from. Nothing in `PA_GRANTS` changes until then.
- [ ] **D4. "Built for Preservation Austin" in [README.md](README.md).** Check that this is wording Preservation Austin has agreed to. Reword if not.
- [ ] **D5. The City's 2022 category on public story cards.** Open from an earlier session: the City's file carries unusual licence metadata. Decide whether to keep showing the City's category.
- [ ] **D6. The questions shown for each Matrix group in Triage.** They were written for this tool ([utils/lenses.js](utils/lenses.js), the `prompt` lines). Approve or rewrite them.
- [ ] **D7. Which 2026 closures belong on the business lists.** Reported in the press and on neither list: Lammes Candies, Wheatsville Co-op (Guadalupe), Hoover's Cooking, Vespaio, Little Mexico, Vince Young Steakhouse, Hideout Theatre, Marlow, Feels So Good. The lists have no written rule for what counts as a legacy business; one is needed before adding any.
- [ ] **D8. The `main` branch.** It is 12 commits ahead of `origin/main` and 4 behind `test`. The site publishes from `test`. Decide whether `main` is brought level or retired.
- [ ] **D9. The August lists.** [agent-todo-list.md](agent-todo-list.md), [docs/agent-todo-list.md](docs/agent-todo-list.md), [docs/ISSUES.md](docs/ISSUES.md) and [docs/nextTask.md](docs/nextTask.md) predate the move from the old score to displacement stages. Decide which of their ideas are still wanted (institutional anchors, a timeline redesign, 2010 boundaries, uninsured population) and move those here.

## E. Errors found, not yet fixed

- [ ] **E1. Businesses filed under the wrong census tract.** 47 of the 106 tracked businesses name a tract that does not contain their map point, and 3 points fall outside every tract (checked 2026-11-22). Examples: Victory Grill, Hillside Farmacy, Joe's Bakery, Cisco's, Huston-Tillotson, the Continental Club, Home Slice. The per-place business counts on the side panel, the story card and Triage use the tract named in the record, so they are wrong wherever the two differ. Fix: assign each business to the tract its point falls in ([data/businesses.js](data/businesses.js)).
- [ ] **E2. Six closed businesses never appear on the map** because their records have no closing year: Contigo, Weather Up, Stay Gold, Rosewood, Redbud Ice House, Old Thousand (Burnet).
- [ ] **E3. Three "closed" businesses are operating somewhere else.** Yard Dog (the file says "Closed permanently"; reported at 916 Springdale Rd), Uncommon Objects (1602 Fortview Rd), I Luv Video (its collection reopened as We Luv Video).
- [ ] **E4. Operating-list records that do not match what was found.**
  - Asia Market: a listing says permanently closed; no news report found.
  - Saigon Le Vendeur: the record does not describe the real business (2601 E 7th St).
  - Victory Grill: rebranded Victory East in 2024; current status not confirmed.
  - Taqueria Chapala: the listed site could not be matched; the East Cesar Chavez restaurant moved to 2448 S 1st St in November 2026.
  - Evan's Barbershop, Pueblo Viejo: could not be traced.
  - Ownership fields: Cheer Up Charlies (sold October 2025) and Breed & Co. (sold 2024) are still marked independent and family-owned.
- [ ] **E5. A 2025 merit award recipient is spelled "Will Klemm".** Preservation Austin's page reportedly spells it "Klemt". Check its 2025 winners page, then correct ([data/preservationAustin.js](data/preservationAustin.js)).
- [ ] **E6. Becker Elementary.** The file says students were rezoned to Galindo and Zilker. KUT (18 August 2026) reports Becker students at Travis Heights ([data/aisdSchools.js](data/aisdSchools.js)).
- [ ] **E7. Two gaps in the legislation track.** The SB 2835 entry says it awaits adoption by Austin; Austin reportedly adopted it effective 10 July 2025. The November 2025 amendment exempting $125,000 of business inventory has no entry ([data/legislation.js](data/legislation.js)).
- [ ] **E8. The inflation table is unverified.** [utils/cpi.js](utils/cpi.js) is labelled with a Bureau of Labor Statistics series that does not exist, and its values match no series checked. Nothing uses it. Replace it with a verified series or delete it.
- [ ] **E9. SNAP participation in the 2010, 2015 and 2020 rows is unchecked.** The 2019–2023 rows had no figure in 27 tracts and a wrong figure in 10. Compare the earlier years with census table B22003.
- [ ] **E10. Six fields for 2010 and 2015 still carry a parent tract's value.** Income, home value, rent, poverty, foreign-born and education come from the first backfill, which copied the parent's figure onto every tract split from it ([DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §10). Rebuild them the way population and tenure were rebuilt.

## R. Records to check

- [ ] **R1. 24 operating businesses not confirmed open.** No report of closing was found, and none of being open: Sam's BBQ, The Liberty, The Grackle, Hillside Farmacy, Sawyer & Co, Launderette, Paperboy, Joe's Bakery, Cisco's, Licha's, Nixta, Lustre Pearl, Breed & Co., Avenue B Grocery, Mi Madre's, Dai Due, Allen's Boots, Continental Club, Home Slice, Rosewood Park, and the four churches.
- [ ] **R2. Two award-winning private homes with no published address.** Starling House is not drawn at all. Swede Hill House is drawn on East 14th Street, the only location made public. Preservation Austin could say whether to place them more exactly or leave them.
- [ ] **R3. Spectre Offices (2026 merit award).** Placed at 701 E 6th St from a state project record named "Spectre Office". That record names the building's owner and designer, not the award's recipient. Confirm it is the same project.
- [ ] **R4. Pathways at Rosewood Courts.** The City gives 1141 Chicon St; a state record gives 2001 Rosewood Ave. The pin marks the complex, not the eight restored buildings.
- [ ] **R5. LBJ Suite (2023 merit award).** Open from an earlier session: confirm the pin is on the right building.
- [ ] **R6. Preservation Austin milestones from 2025 that are not in the file.** Whitehall Cooperative landmarked (9 October 2025); SB 2639 defeated. Also: the file dates the move into the McFarland-McBee House to 2025, and the grand opening was 10 March 2026.
- [ ] **R7. Music venue counts stop at 2025.** Red River and downtown lost venues in 2026 ([data/musicNightlife.js](data/musicNightlife.js)).
- [ ] **R8. Key moments on the time bar stop at 2024.** Candidates: I-35 cap columns funded (22 May 2025); Prop Q rejected (4 November 2025); school closures vote (21 November 2025); light rail Record of Decision (16 January 2026); City displacement StoryMap (7 July 2026); Red River Cultural District open letter (8 September 2026).
- [ ] **R9. History events.** Compiled from research with a confidence level on each, with no outside review. Not re-checked in the November data check.
- [ ] **R10. Council district outlines.** The count matches the City's (10). The outlines were not compared.

## F. Figures and documents to refresh

- [ ] **F1. Pressure score (presenter only).** Its quarter bands and the ceiling checks in the methodology still use the 2019–2023 figures.
- [ ] **F2. Construction permits.** Fetched March 2026; the bucket labelled 2023 runs from January 2023 to March 2026; no view shows them. Refresh them or drop the two fields.
- [ ] **F3. [ARCHITECTURE.md](ARCHITECTURE.md) is out of date in many places** (tract counts by year, the mounted components). Rewrite or retire it.

## W. Dates to watch

- [ ] **W1. 11 December 2026.** Final state ratings for Burnet and Webb middle schools. A fifth failing rating forces a closure or a replaced board.
- [ ] **W2. Late January 2027 (expected, no date announced).** The 2021–2025 census survey. Updating is one number (`LATEST_ACS`) and two commands; see [README.md](README.md). The Triage comparison then moves from 2011–2015 to 2016–2020 by itself: check its labels and tables after the update.
- [ ] **W3. The City's next Displacement Risk Areas edition.** The file on the City's portal is still the 2022 edition. When a new one appears, load it and rerun the comparison.
- [ ] **W4. Eviction filings after 2025.** BASTA releases raw data by request form only. The City's 2026 "Levers of Economic Mobility" dataset holds a tract eviction rate built on 2024 filings.
- [ ] **W5. Venues with an announced change.** Emo's (last shows December 2026), Valhalla (closing announced, not confirmed), the building housing Elysium (for sale), Katz's (renovation to March 2027).
- [ ] **W6. Light rail.** Austin Transit Partnership edits its map layers; `npm run build:rail -- --refresh` redraws from them. Construction is scheduled for 2027.

## S. Site behaviour to check

- [ ] **S1. Light rail station names on hover.** The automated check did not see a tooltip. Check by hand.
- [ ] **S2. Phone width after the slider change.** The slider now ends at 2026 and the last label reads 2024.
- [ ] **S3. The live site after the next push.** Only the deploy job has been checked, never the published page.
- [ ] **S4. Old links with `year=2023`.** They now show the 2016–2020 stage, the latest reading at or before 2023. Decide whether that is right or whether 2023 should open 2024.
- [ ] **S5. A closed business has no dot before the year it closed.** Empire Control Room shows nothing on the default map (2024), although it was open then. Decide whether closed businesses should show as open until their closing year.
- [ ] **S6. Other browsers and a screen reader.** Only Chrome has been used for checks.

## H. Housekeeping

- [ ] **H1. Unmounted code.** `components/RegionDetailPanel.jsx`, `components/TractSparkline.jsx` and `utils/cpi.js` are not used by any view. Delete or keep.
- [ ] **H2. 38 lint errors** in `archive/`, `data/_archive/` and the three timeline components. None is in the code the site runs today except the timeline components.

---

## Done

- [x] 2026-11-22. Census figures moved from the 2019–2023 survey to 2020–2024; slider extended to 2026.
- [x] 2026-11-22. Light rail overlay redrawn from Austin Transit Partnership's published route and stations.
- [x] 2026-11-22. Empire Control Room and El Azteca moved to the closed list; duplicate South Congress Books removed; Paredes Middle School added; Oak Springs entry corrected; Buford Tower moved downtown.
- [x] 2026-11-22. Preservation Austin's 2026 merit awards, Legacy Business Month businesses and three landmark designations added.
- [x] 2026-11-22. Sources that no figure rests on removed from the footer and methodology; Compare view no longer labels income as inflation-adjusted.
