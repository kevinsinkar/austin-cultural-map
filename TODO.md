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

- [ ] **D1. Push `test`.** The 22 November work is committed on `test` and not pushed. Pushing publishes the site.
- [ ] **D2. Which year the map opens on.** It opens on 2024, the latest census year, so closures and listings dated 2025–26 appear only when the slider reaches 2026. Opening on 2026 shows them at once, but the year shown would not be a census year.
- [ ] **D3. Preservation Austin grant list: on hold.** The maintainer is documenting where the list came from. Nothing in `PA_GRANTS` changes until then.
- [ ] **D4. "Built for Preservation Austin" in [README.md](README.md).** Check that this is wording Preservation Austin has agreed to. Reword if not.
- [ ] **D5. The City's 2022 category on public story cards.** Open from an earlier session: the City's file carries unusual licence metadata. Decide whether to keep showing the City's category.
- [ ] **D6. The questions shown for each Matrix group in Triage.** They were written for this tool ([utils/lenses.js](utils/lenses.js), the `prompt` lines). Approve or rewrite them.
- [ ] **D7. Which 2026 closures belong on the business lists.** Reported in the press and on neither list: Lammes Candies, Wheatsville Co-op (Guadalupe), Hoover's Cooking, Vespaio, Little Mexico, Vince Young Steakhouse, Hideout Theatre, Marlow, Feels So Good. The lists have no written rule for what counts as a legacy business; one is needed before adding any.
- [ ] **D8. The `main` branch.** It is 12 commits ahead of `origin/main` and 4 behind `test`. The site publishes from `test`. Decide whether `main` is brought level or retired.
- [ ] **D9. The August lists.** [agent-todo-list.md](agent-todo-list.md), [docs/agent-todo-list.md](docs/agent-todo-list.md), [docs/ISSUES.md](docs/ISSUES.md) and [docs/nextTask.md](docs/nextTask.md) predate the move from the old score to displacement stages. Decide which of their ideas are still wanted (institutional anchors, a timeline redesign, 2010 boundaries, uninsured population) and move those here.
- [ ] **D10. Business records that cannot be traced** (found 2026-11-22). A search of published sources found no trace of six records, and three more are clusters with no source, not single businesses. Decide: remove them, or keep them marked as unverified.
  - No trace found: Evan's Barbershop (listed as operating), Erwin Center Barber Shop, Mrs. Johnson's Donuts (the known Mrs. Johnson's Bakery is on Airport Blvd and open), Holly Neighborhood Assoc. HQ, Baby Acapulco's (S Lamar), Club 801 (801 Red River was the One Knite, then Stubb's).
  - Clusters: Kealing Jr. High area businesses, Rainey Street bungalow businesses, Fiesta Gardens area tiendas.
  - Why it matters: the story card for census tract 8.03 (Chestnut), the site's main example, now lists three lost businesses, and all three are on this list. Evan's Barbershop is one of its three operating ones.
  - These records keep an approximate dot. Club 801 and Tamale House East (E11) are still filed under a tract their dot is not in.
## E. Errors found, not yet fixed

- [ ] **E3. Three "closed" businesses are operating somewhere else.** Yard Dog (the file says "Closed permanently"; reported at 916 Springdale Rd), Uncommon Objects (1602 Fortview Rd), I Luv Video (its collection reopened as We Luv Video).
- [ ] **E4. Operating-list records that do not match what was found.**
  - Asia Market: a listing says permanently closed; no news report found. The only address found is 8650 Spicewood Springs Rd #115, from a 2006 Austin Chronicle listing. Its dot is approximate.
  - Saigon Le Vendeur: the record does not describe the real business. The Austin Chronicle places it at 2601 E 7th St, a food truck for about a decade that opened a restaurant in November 2023. The record says North Austin, founded 1990. Its dot is in North Austin.
  - Victory Grill: rebranded Victory East in 2024; current status not confirmed.
  - Taqueria Chapala: no William Cannon or Dove Springs site found. The long-running one was at 2101 E Cesar Chavez St (opened 1 July 1997); it closed there in 2026 and reopened at 2448 S 1st St. Its dot is approximate.
  - Evan's Barbershop: no trace found (D10). Pueblo Viejo: could not be traced.
  - Ownership fields: Cheer Up Charlies (sold October 2025) and Breed & Co. (sold 2024) are still marked independent and family-owned.
- [ ] **E8. The inflation table is unverified.** [utils/cpi.js](utils/cpi.js) is labelled with a Bureau of Labor Statistics series that does not exist, and its values match no series checked. Nothing uses it. Replace it with a verified series or delete it.
- [ ] **E9. SNAP participation in the 2010, 2015 and 2020 rows is unchecked.** The 2019–2023 rows had no figure in 27 tracts and a wrong figure in 10. Compare the earlier years with census table B22003.
- [ ] **E10. Six fields for 2010 and 2015 still carry a parent tract's value.** Income, home value, rent, poverty, foreign-born and education come from the first backfill, which copied the parent's figure onto every tract split from it ([DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §10). Rebuild them the way population and tenure were rebuilt.
- [ ] **E11. Closed-business records whose details contradict published sources** (found 2026-11-22 while looking up addresses). The dots are now on the right address; the details below are unchanged. Each fix needs the source opened first.
  - El Gallo: the record says founded 1954, closed 2014, rent and redevelopment. The Austin Chronicle says it opened 7 April 1957; CultureMap reportedly gives its last day as 29 January 2017. Cause and replacement not checked.
  - Gene's Po-Boys: the record says founded 2001, closed 2020, rent and COVID. The Austin Chronicle reviewed it in September 2000; a 2009 blog post says it had closed; Hillside Farmacy has been at its address since 2012.
  - Nubian Queen Lola's: the record says closed 2014. It was open in 2013 and 2017; a neighborhood site says closed as of December 2020.
  - Las Cazuelas: listed as closed in 2016. No report of closing was found, and current listings show it at 1701 E Cesar Chavez St. It may be operating.
  - Tamale House East (original): mixes three places. The original, at First and Congress, was sold in the 1980s; Tamale House No. 3 at 5003 Airport Blvd closed in 2014; Tamale House East at 1707 E 6th St appears to be operating.
  - South Congress Books: the dot is at 1608 S Congress Ave, which the store left on 8 January 2023. The record's 2025 is the closing of the later Kerbey Lane store.
  - Sunny's Backyard: the record says founded 2010. The Austin Chronicle reportedly says it closed "after five years", so about 2020.
  - Fran's Hamburgers: the record is now the South Congress store (closed 2013). The Cameron Road store reportedly closed in 2015 and has no record.
  - Star Seeds Cafe: renamed Stars Cafe in 2019; closed 10 November 2024. The record does not mention the rename.
  - Mt. Olive Baptist Church: the state historical marker says the congregation was organized in 1889; the record says 1888.
  - Vulcan Video: the dot is at its last store, 4411 Russell Dr. Its better-known stores were elsewhere. Decide which place the record should show.
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
- [ ] **R11. "Will Klemm" or "Will Klemt"** (2025 merit award, East 9th Street). Preservation Austin spells the name both ways: "Klemm" in its announcement of 16 September 2025 and its photo post, "Klemt" on its past-winners page. The file follows the announcement. Ask Preservation Austin which is right.
- [ ] **R12. The "Holly / Rainey Street" turning point is attached to census tract 10 only** ([data/tippingPoints.js](data/tippingPoints.js)). Rainey Street is in tract 11.03, so that tract's story card does not show it (found 2026-11-22).

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
- [x] 2026-11-22. D1, first half. The update above is committed on `test`. The push is still open (D1).
- [x] 2026-11-22. **E1. Businesses filed under the wrong census tract.** 50 of 106 records named a tract their dot was not in. 55 records were refiled and 24 dots moved to an address confirmed on a published page; every area name in the file now matches the name the site shows. Tract 8.03 went from 15 tracked businesses to 6. Two records are still mismatched because they cannot be traced (D10, E11). Method and sources: [DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §1.2.
- [x] 2026-11-22. **E2. Six closed businesses never appeared on the map.** Their closing dates were stored as text only. Each date was checked and the year added: Contigo 2021, Weather Up 2019, Stay Gold 2021, Rosewood 2022, Redbud Ice House 2025, Old Thousand (Burnet) 2023. Redbud's date was a year early in the file (it said 2024), and Stay Gold opened in January 2015, not April.
- [x] 2026-11-22. **E5. "Will Klemm".** Checked, no change: the file matches Preservation Austin's announcement. Its past-winners page differs, so the question went to R11.
- [x] 2026-11-22. **E6. Becker Elementary.** Checked, no change. KUT's story of 18 August 2026 describes former Becker families who moved to Travis Heights; it does not say the zone was assigned there. Austin ISD's letter to families, as quoted by the lookup, says Galindo or Zilker by address and the dual-language program to Sánchez, which is what the file says. The PDF itself could not be opened during the check.
- [x] 2026-11-22. **E7. Legislation track.** SB 2835 no longer says Austin's adoption is pending: Council adopted its own single-stair amendment on 10 April 2025, effective 10 July 2025, before the state law took effect on 1 September 2025. HB 9 (the $125,000 business inventory exemption, approved 4 November 2025, effective 1 January 2026) added as the 27th entry.
- [x] 2026-11-22. Two stale counts in [METHODOLOGY_AT_A_GLANCE.md](METHODOLOGY_AT_A_GLANCE.md) corrected (181 listings; 46 open and 60 closed businesses).
