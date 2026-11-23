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

- [ ] **D3. Preservation Austin grant list: on hold.** The maintainer is documenting where the list came from. Nothing in `PA_GRANTS` changes until then.
- [ ] **D4. "Built for Preservation Austin" in [README.md](README.md).** Check that this is wording Preservation Austin has agreed to. Reword if not.
- [ ] **D5. The City's 2022 category on public story cards.** Open from an earlier session: the City's file carries unusual licence metadata. Decide whether to keep showing the City's category.
- [ ] **D6. The questions shown for each Matrix group in Triage.** They were written for this tool ([utils/lenses.js](utils/lenses.js), the `prompt` lines). Approve or rewrite them.
- [ ] **D8. The `main` branch.** It is 12 commits ahead of `origin/main` and well behind `test`. The site publishes from `test`. Decide whether `main` is brought level or retired.
- [ ] **D9. The August lists.** [agent-todo-list.md](agent-todo-list.md), [docs/agent-todo-list.md](docs/agent-todo-list.md), [docs/ISSUES.md](docs/ISSUES.md) and [docs/nextTask.md](docs/nextTask.md) predate the move from the old score to displacement stages. Decide which of their ideas are still wanted (institutional anchors, a timeline redesign, 2010 boundaries, uninsured population) and move those here.
- [ ] **D11. Entries that fall short of the 20-year rule** (listed 2026-11-22; nothing was removed). The rule for adding a closed business is: locally owned, open at least 20 years in Austin, closing reported by a named news source. Decide whether it also applies to what was already listed, and whether the operating list needs its own rule.
  - Closed, open under 20 years by the file's dates: Contigo (2011–2021), Weather Up (2012–2019), Stay Gold (2015–2021), Rosewood (2018–2022), Redbud Ice House (2024–2025), Old Thousand (Burnet) (2020–2023), Nubian Queen Lola's (2000–2014), Gene's Po-Boys (2001–2020), Beerland (2002–2018), Skylark Lounge (2013–2025), Armadillo World Headquarters (1970–1980), South Congress Books (2011–2025), DipDipDip Tatsu-Ya (2019–2025), Sunny's Backyard (2021–2025), Empire Control Room & Garage (2014–2026), Asia Market (at least 2006 to 2021 or later; neither date is firm).
  - Operating, founded after 2006: The Liberty, Yellow Jacket Social Club, The Grackle, Hillside Farmacy, Fresa's, Sawyer & Co, Launderette, Juniper, Suerte, Paperboy, Licha's Cantina, Nixta Taqueria, Pueblo Viejo, Lustre Pearl, Cheer Up Charlies, Dai Due, Saigon Le Vendeur (about 2013). Tamale House East (2012, 1707 E 6th St) is operating and is on neither list.
  - Not locally owned businesses: Stubb's BBQ (corporate owner); Downs Field, Rosewood Park and Barton Springs Pool (City of Austin); Huston-Tillotson University; Breed & Co. (owned by Westlake Ace Hardware since 2024).

## E. Errors found, not yet fixed

- [ ] **E8. The inflation table is unverified.** [utils/cpi.js](utils/cpi.js) is labelled with a Bureau of Labor Statistics series that does not exist, and its values match no series checked. Nothing uses it. Replace it with a verified series or delete it.
- [ ] **E9. SNAP participation in the 2010, 2015 and 2020 rows is unchecked.** The 2019–2023 rows had no figure in 27 tracts and a wrong figure in 10. Compare the earlier years with census table B22003.
- [ ] **E10. Six fields for 2010 and 2015 still carry a parent tract's value.** Income, home value, rent, poverty, foreign-born and education come from the first backfill, which copied the parent's figure onto every tract split from it ([DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §10). Rebuild them the way population and tenure were rebuilt.

## R. Records to check

- [ ] **R1. 23 operating businesses not confirmed open.** No report of closing was found, and none of being open: Sam's BBQ, The Liberty, The Grackle, Hillside Farmacy, Sawyer & Co, Launderette, Paperboy, Joe's Bakery, Cisco's, Licha's, Nixta, Lustre Pearl, Avenue B Grocery, Mi Madre's, Dai Due, Allen's Boots, Continental Club, Home Slice, Rosewood Park, and the four churches.
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
- [ ] **R13. Nine records marked unverified** (2026-11-22). No published source was found for them, and the map, story card and search now say so. Find a source, or remove them later. Six businesses: Evan's Barbershop, Erwin Center Barber Shop, Mrs. Johnson's Donuts (the known Mrs. Johnson's Bakery is on Airport Blvd and open), Holly Neighborhood Assoc. HQ, Baby Acapulco's (S Lamar), Club 801 (801 Red River was the One Knite, then Stubb's). Three clusters that are not single businesses: Kealing Jr. High area businesses, Rainey Street bungalow businesses, Fiesta Gardens area tiendas. They keep an approximate dot; Club 801 is filed under a tract its dot is not in. On the tract 8.03 story card, all three lost businesses and one of the three operating ones are on this list.
- [ ] **R14. Closing dates taken from the announcement** (2026-11-22). Vespaio and Little Mexico were added with the closing date announced beforehand (28 February 2026). No later report was opened to confirm the last day.
- [ ] **R15. Asia Market's dates** (2026-11-22). It is now on the closed list as closed "2021 or later": its own site last posted in March 2021 and a listing shows it closed, but no report of the closing was found. Its founding year is shown as "at least 2006", the year of the earliest source opened; nothing supports the 1985 the file had.
- [ ] **R16. Details left out because the page could not be opened** (2026-11-22). Each rests on a search result only: the Cameron Road Fran's closing in 2014 or 2015; the date Nubian Queen Lola's actually closed and its owner's move to Taylor; a 1958 founding for the original Tamale House (the Austin Chronicle says 1959, which the file now uses); Victory East's kitchen reportedly run by the Rolling Rooster in 2026; Saigon Le Vendeur listed as "Saigon On 7th" in 2026.
- [ ] **R17. Where the original Tamale House stood** (2026-11-22). The Austin Chronicle puts it at the northwest corner of First and Congress and says the site became One Congress Plaza. The dot is at 111 Congress Ave, that building's address. Check that the corner and the building agree.
- [ ] **R18. Gene's Po-Boys closed "about 2009"** (2026-11-22). The year rests on one personal blog post; the building was restored for Hillside Farmacy in 2011. A dated news source would settle it.

## F. Figures and documents to refresh

- [ ] **F1. Pressure score (presenter only).** Its quarter bands and the ceiling checks in the methodology still use the 2019–2023 figures.
- [ ] **F2. Construction permits.** Fetched March 2026; the bucket labelled 2023 runs from January 2023 to March 2026; no view shows them. Refresh them or drop the two fields.
- [ ] **F3. [ARCHITECTURE.md](ARCHITECTURE.md) is out of date in many places** (tract counts by year, the mounted components). Rewrite or retire it.

## W. Dates to watch

- [ ] **W1. 11 December 2026.** Final state ratings for Burnet and Webb middle schools. A fifth failing rating forces a closure or a replaced board.
- [ ] **W2. Late January 2027 (expected, no date announced).** The 2021–2025 census survey. Updating is one number (`LATEST_ACS`) and two commands; see [README.md](README.md). The Triage comparison then moves from 2011–2015 to 2016–2020 by itself: check its labels and tables after the update.
- [ ] **W3. The City's next Displacement Risk Areas edition.** The file on the City's portal is still the 2022 edition. When a new one appears, load it and rerun the comparison.
- [ ] **W4. Eviction filings after 2025.** BASTA releases raw data by request form only. The City's 2026 "Levers of Economic Mobility" dataset holds a tract eviction rate built on 2024 filings.
- [ ] **W5. Venues with an announced change.** Emo's (last shows December 2026), Valhalla (closing announced, not confirmed), the building housing Elysium (for sale), Katz's (renovation to March 2027), the Hideout Theatre (left 617 Congress Ave in March 2026; shows at its North Lamar annex while it looks for a new home), Cheer Up Charlies (a sale announced in October 2025 was rescinded; the owners were briefly locked out over past-due rent in March 2026).
- [ ] **W6. Light rail.** Austin Transit Partnership edits its map layers; `npm run build:rail -- --refresh` redraws from them. Construction is scheduled for 2027.

## S. Site behaviour to check

- [ ] **S1. Light rail station names on hover.** The automated check did not see a tooltip. Check by hand.
- [ ] **S2. Phone width after the slider change.** The slider now ends at 2026 and the last label reads 2024.
- [ ] **S4. Old links with `year=2023`.** They now show the 2016–2020 stage, the latest reading at or before 2023. Decide whether that is right or whether 2023 should open 2024.
- [ ] **S5. A closed business has no dot before the year it closed.** The map now opens on 2026, where every closed business is drawn. Moving the slider back to 2024 hides the 15 that closed in 2025–26, although they were open then. Decide whether closed businesses should show as open until their closing year.
- [ ] **S6. Other browsers and a screen reader.** Only Chrome has been used for checks.
- [ ] **S7. The search pin covers the dot** (found 2026-11-22). Picking a business from search drops a pin on its dot. The pin's popup shows only the name (and the unverified note), and the dot's own popup, with the year and address, cannot be opened while the pin is there.

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
- [x] 2026-11-22. **E1. Businesses filed under the wrong census tract.** 50 of 106 records named a tract their dot was not in. 55 records were refiled and 24 dots moved to an address confirmed on a published page; every area name in the file now matches the name the site shows. Tract 8.03 went from 15 tracked businesses to 6. Two records are still mismatched because they cannot be traced (R13, E11). Method and sources: [DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §1.2.
- [x] 2026-11-22. **E2. Six closed businesses never appeared on the map.** Their closing dates were stored as text only. Each date was checked and the year added: Contigo 2021, Weather Up 2019, Stay Gold 2021, Rosewood 2022, Redbud Ice House 2025, Old Thousand (Burnet) 2023. Redbud's date was a year early in the file (it said 2024), and Stay Gold opened in January 2015, not April.
- [x] 2026-11-22. **E5. "Will Klemm".** Checked, no change: the file matches Preservation Austin's announcement. Its past-winners page differs, so the question went to R11.
- [x] 2026-11-22. **E6. Becker Elementary.** Checked, no change. KUT's story of 18 August 2026 describes former Becker families who moved to Travis Heights; it does not say the zone was assigned there. Austin ISD's letter to families, as quoted by the lookup, says Galindo or Zilker by address and the dual-language program to Sánchez, which is what the file says. The PDF itself could not be opened during the check.
- [x] 2026-11-22. **E7. Legislation track.** SB 2835 no longer says Austin's adoption is pending: Council adopted its own single-stair amendment on 10 April 2025, effective 10 July 2025, before the state law took effect on 1 September 2025. HB 9 (the $125,000 business inventory exemption, approved 4 November 2025, effective 1 January 2026) added as the 27th entry.
- [x] 2026-11-22. Two stale counts in [METHODOLOGY_AT_A_GLANCE.md](METHODOLOGY_AT_A_GLANCE.md) corrected (181 listings; 46 open and 60 closed businesses).
- [x] 2026-11-22. **D2. Which year the map opens on.** Decided: 2026. The stage colors there are the 2024 reading and the time bar names the survey. Links that carry a year are unaffected.
- [x] 2026-11-22. **D7. Which 2026 closures belong on the lists.** Decided: locally owned, open at least 20 years in Austin, closing reported by a named news source. Added under it: Lammes Candies, Wheatsville Co-op (Guadalupe), Hoover's Cooking, Vespaio, Little Mexico, Hideout Theatre (Congress Ave). Left out: Vince Young Steakhouse (15 years), Marlow (about 3), the Feels So Good storefront. The file now holds 46 operating and 66 closed. Existing entries that fall short are in D11.
- [x] 2026-11-22. **D10. Business records that cannot be traced.** Decided: keep them, marked unverified. Nine records carry the mark, shown in the map popup, the story card, search and the About text (R13).
- [x] 2026-11-22. **D1. Push.** Decided: push once the answers above were applied. Pushed; the deploy job passed.
- [x] 2026-11-22. **E3. Three "closed" businesses operating somewhere else.** Yard Dog (916 Springdale Rd) and Uncommon Objects (1602 Fortview Rd) are marked as moved, with where they went; the map says "Left this address in" for them. I Luv Video stays closed, with its collection's reopening as the nonprofit We Luv Video noted.
- [x] 2026-11-22. **E4. Operating-list records that did not match.** Saigon Le Vendeur, Pueblo Viejo, Victory Grill and Breed & Co. corrected. Taqueria Chapala moved to the closed list at its East Cesar Chavez address (closed there 27 September 2026, reopened on South First). Asia Market moved to the closed list (R15). Cheer Up Charlies needed no change: the sale was rescinded. Sources: [DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §1.2.
- [x] 2026-11-22. **E11. Closed-business records that contradicted published sources.** El Gallo, Gene's Po-Boys, Nubian Queen Lola's, South Congress Books, Sunny's Backyard, Fran's, Star Seeds, Vulcan Video, I Luv Video and Mt. Olive corrected. Las Cazuelas turned out to be open and moved to the operating list. The muddled Tamale House record became two: the original at First and Congress, and No. 3 on Airport Blvd. Vulcan Video stays at its last store, where it closed. The file holds 45 operating and 68 closed.
- [x] 2026-11-22. **S3. The live site after a push.** Checked in a browser after the deploy: it opens on 2026 with 46 operating and 66 closed dots, shows the unverified notes and the new closures, has no page errors, and does not scroll sideways at phone width.
