# Preservation Austin — Map Overlay Data & Claude Code Prompt

## Overview

This document consolidates Preservation Austin's grants, merit awards, Legacy Business Month participants, and advocacy work into structured data for adding a new "Preservation Austin" toggle overlay to the Austin's Shifting Ground map tool. The overlay should show dots/pins on the map representing where Preservation Austin has invested in the community.

---

## PART 1: DATA TABLES

### A. Preservation Austin Grants (from master CSV + geocoding needed)

These are grants awarded by Preservation Austin since 2016. Each entry needs a lat/lng. Addresses are drawn from the grant descriptions; some will require geocoding.

| # | Recipient / Project | Address (approx.) | Council Dist. | Amount | Date | Category |
|---|---|---|---|---|---|---|
| 1 | Six Square — Symposium on Historic Black Cemeteries | East Austin (Six Square district) | 1 & 3 | $3,500 | Sep 2016 | Education |
| 2 | Paramount Theatre — Marquee Restoration | 713 Congress Ave | 9 | $5,000 | Jan 2017 | Bricks & Mortar |
| 3 | Norwood Park Foundation — Historic Landscape Plan | Norwood Park, 1009 E 9th St (approx) | 9 | $5,000 | Jan 2017 | Planning |
| 4 | Watershed Productions — Living Springs Documentary | District 8 | 8 | $5,000 | Jun 2017 | Education |
| 5 | Travis Heights–Fairview Park — NR Historic District Survey | Travis Heights neighborhood | 9 | $5,000 | Sep 2017 | Survey/HD |
| 6 | Terrace Park / Smoot Subdivision — LHD Survey | Terrace Park neighborhood | 9 | $2,500 | Sep 2017 | Survey/HD |
| 7 | Friends of Mayfield Park — Stone Path | 3505 W 35th St | 10 | $3,869 | Jan 2018 | Bricks & Mortar |
| 8 | Paramount Theatre — Roof Parapet | 713 Congress Ave | 9 | $4,500 | Jan 2018 | Bricks & Mortar |
| 9 | Holy Cross Neighborhood Assoc. — LHD Work | Holy Cross neighborhood, East Austin | 1 | $597 | Mar 2018 | Survey/HD |
| 10 | Hyde Park Neighborhood Assoc. — Street Sign Toppers | Hyde Park neighborhood | 9 | $1,250 | Mar 2018 | Community |
| 11 | Boggy Creek Farm — Windows | 3414 Lyons Rd | 3 | $5,000 | Jun 2018 | Bricks & Mortar |
| 12 | Millett Opera House / Austin Club — Windows/Painting | 110 E 9th St | 9 | $5,000 | Jun 2018 | Bricks & Mortar |
| 13 | Waterloo Greenway — Hardeman House Entry Door | Waller Creek area, downtown | 9 | $5,000 | Jan 2019 | Bricks & Mortar |
| 14 | Holy Cross Neighborhood Assoc. — LHD City Fees | Holy Cross neighborhood | 1 | $771 | Jan 2019 | Survey/HD |
| 15 | Old Austin Neighborhood Assoc. — LHD Survey | Old West Austin | 9 | $5,000 | Apr 2019 | Survey/HD |
| 16 | Interfaith Action of Central Texas — Oakwood Cemetery Exhibit | Oakwood Cemetery, 1601 Navasota St | 1 | $4,000 | Jul 2019 | Education |
| 17 | The Contemporary Austin @ Laguna Gloria | 3809 W 35th St | 10 | $5,000 | Oct 2019 | Bricks & Mortar |
| 18 | Millett Opera House / Austin Club — Masonry | 110 E 9th St | 9 | $5,000 | Dec 2019 | Bricks & Mortar |
| 19 | Boggy Creek Farm — Siding | 3414 Lyons Rd | 3 | $5,000 | Jan 2020 | Bricks & Mortar |
| 20 | Paramount Theatre — Masonry Repair | 713 Congress Ave | 9 | $5,000 | Mar 2020 | Bricks & Mortar |
| 21 | Mary Baylor House — Clarksville Historic Designation | Clarksville neighborhood | 9 | $1,082 | Mar 2020 | Survey/HD |
| 22 | Millett Opera House — Education/Publication | 110 E 9th St | 9 | $1,199 | Mar 2020 | Education |
| 23 | Holy Cross Neighborhood Assoc. — Add'l City Fees | Holy Cross neighborhood | 1 | $289 | Jun 2020 | Survey/HD |
| 24 | Rogers House — Repairs | 1104 E 10th St | 1 | $5,000 | Jun 2020 | Bricks & Mortar |
| 25 | Boggy Creek Farm — Roof Repairs | 3414 Lyons Rd | 3 | $5,000 | Jun 2020 | Bricks & Mortar |
| 26 | El Camino Real Association | N/A (regional) | N/A | $5,000 | Oct 2020 | Education |
| 27 | Waterloo Greenway Conservancy — Park Wayfinding | Waller Creek / downtown | 9 | $5,000 | Jan 2021 | Community |
| 28 | Austin History Center | 810 Guadalupe St | 9 | $3,000 | Jan 2021 | Education |
| 29 | Huston-Tillotson University — Seabrook Chapel | 900 Chicon St | 1 | $5,000 | Apr 2021 | Bricks & Mortar |
| 30 | Hillside Farmacy — Painting | 1209 E 11th St | 1 | $3,365 | Apr 2021 | Bricks & Mortar |
| 31 | Patricia Calhoun — Siding | 2401 Givens Ave | 1 | $4,000 | Apr 2021 | Bricks & Mortar |
| 32 | Seymour Fogel House / Southwind — Bricks & Mortar | 2411 Kinney Rd | 5 | $5,000 | Jun 2021 | Bricks & Mortar |
| 33 | Patricia Calhoun — Windows & Electrical | 2401 Givens Ave | 1 | $5,000 | Jul 2021 | Bricks & Mortar |
| 34 | Sarah Gamble — Publication on House Relocation | N/A | N/A | $5,000 | Sep 2021 | Education |
| 35 | Cisco's Restaurant — Electrical/Plumbing | 1511 E 6th St | 3 | $8,500 | Jan 2022 | Bricks & Mortar |
| 36 | Old Austin Neighborhood Assoc. — NR HD Application | Old West Austin | 9 | $5,000 | Jan 2022 | Survey/HD |
| 37 | Roberts Clinic — Restoration Planning | 1174 San Bernard St | 1 | $5,000 | Jan 2022 | Planning |
| 38 | Luther Hall — Bricks & Mortar | 108 W 16th St | 9 | $7,500 | Jan 2022 | Bricks & Mortar |
| 39 | Cisco's Restaurant — Paint & Mortar | 1511 E 6th St | 3 | $4,000 | Jul 2022 | Bricks & Mortar |
| 40 | Patricia Calhoun — Plumbing | 2401 Givens Ave | 1 | $5,000 | Jul 2022 | Bricks & Mortar |
| 41 | Boggy Creek Farm — Cistern | 3414 Lyons Rd | 3 | $2,000 | Jul 2022 | Bricks & Mortar |
| 42 | Neill-Cochran House Museum — Signs & Landscaping | 2310 San Gabriel St | 9 | $3,000 | Jul 2022 | Education |
| 43 | Oakwood Cemetery Chapel — Brick Restoration | 1601 Navasota St | 1 | $5,000 | Jan 2023 | Bricks & Mortar |
| 44 | Cotton/Lyons House — ADA Ramp | East Austin | 1 | $5,000 | Jan 2023 | Bricks & Mortar |
| 45 | Original LC Anderson HS — Educational Display | 900 Thompson St (approx) | 1 | $2,000 | Jan 2023 | Education |
| 46 | Pease Park Conservancy — Kingsbury Commons Signs | Pease Park | 9 | $1,500 | Jan 2023 | Education |
| 47 | Olle/Zilker House — Siding Restoration | Zilker neighborhood | 5 | $5,000 | Jun 2023 | Bricks & Mortar |
| 48 | Texas Hillel — Parapet Restoration | 2105 San Antonio St | 9 | $3,500 | Jun 2023 | Bricks & Mortar |
| 49 | Green & White Grocery — Masonry/Roof | 1201 E 7th St | 1 | $5,000 | Jun 2023 | Bricks & Mortar |
| 50 | Cotton/Lyons House — HVAC | East Austin | 1 | $5,000 | Jun 2023 | Bricks & Mortar |
| 51 | Millett Opera House — Publishing Grant | 110 E 9th St | 9 | $3,000 | Jun 2023 | Education |
| 52 | Green Gate Farms — Windows/Electrical | 8310 Canoga Ave (approx) | — | $3,000 | Oct 2023 | Bricks & Mortar |
| 53 | Waterloo Greenway — Seiders Springs House | Boggy Creek area | 3 | $4,500 | Oct 2023 | Bricks & Mortar |
| 54 | Waterloo Greenway — Palm Park Shelter Engineering | Palm Park, downtown | 9 | $4,000 | Jan 2024 | Planning |
| 55 | Liz Moskowitz — I-35 Capital Express Education | I-35 corridor | 1,3,4,9 | $3,500 | Jan 2024 | Education |
| 56 | Deep Eddy Cabaret — Mortar & Drainage | 2315 Lake Austin Blvd | 10 | $2,000 | Jun 2024 | Bricks & Mortar |
| 57 | Center for Women & Their Work — Window Screens | East Austin (approx 1710 Lavaca moved to E Austin) | 3 | $6,525 | Jun 2024 | Bricks & Mortar |
| 58 | Neill-Cochran House Museum — Murals Project | 2310 San Gabriel St | 9 | $2,000 | Jun 2024 | Education |
| 59 | Sugarloaf Pictures — Tonkawa Documentary | N/A | N/A | $3,750 | Jun 2024 | Education |
| 60 | Black Austin Tours — Black Barbers Project | East Austin | 1 | $3,725 | Jun 2024 | Education |
| 61 | Austin Woman's Club / Chateau Bellevue — Doors | 908 W 9th St (approx) | 9 | $2,500 | Jan 2026 | Bricks & Mortar |
| 62 | ATX116 / Closing Chapters — AISD Schools | Citywide | — | $2,000 | Jan 2026 | Education |
| 63 | Guajardo — E 10th St Home Plumbing | E 10th St, East Austin | 1 | $2,000 | Jan 2026 | Bricks & Mortar |
| 64 | First United Methodist Church — Column/Capital | 1201 Lavaca St | 9 | $3,500 | Jan 2026 | Bricks & Mortar |
| 65 | Future Front Texas — Community Storytelling | East Austin (approx) | — | $2,000 | Jan 2026 | Education |
| 66 | Pat Calhoun — Givens Ave Roof | 2401 Givens Ave | 1 | $3,000 | Jan 2026 | Bricks & Mortar |
| 67 | Marilynn Poole — John Chase Booklet | N/A | — | $1,500 | Jan 2026 | Education |
| 68 | Judges Hill — NR HD Nomination | Judges Hill neighborhood | 9 | $3,500 | Jan 2026 | Survey/HD |
| 69 | Cherrywood NA — Manor Memories Brochure | Cherrywood neighborhood | 9 | $1,500 | Jan 2026 | Education |
| 70 | Austin Chinese American Network — Oral History | East Austin / Chinatown area | — | $2,500 | Jan 2026 | Education |
| 71 | Roberts Clinic — Foundation Work | 1174 San Bernard St | 1 | $3,500 | Jan 2026 | Bricks & Mortar |
| 72 | Zeta Phi Beta / Thompson Home — Window Screens | East Austin | 1 | $2,526 | Jan 2026 | Bricks & Mortar |

**Total awarded since inception: ~$284K across 72+ grants**

---

### B. Preservation Merit Award Winners (2022–2025)

Projects with physical locations in Austin. These represent sites where significant preservation work was completed and recognized.

#### 2025 (65th Annual)
| Project | Recipient | Award Type | Location (approx.) |
|---|---|---|---|
| Buford Tower & Kitchens Memorial Chimes | Austin Parks & Rec | Rehabilitation | UT Campus / Buford Tower |
| East 9th Street | David West & Will Klemm | Restoration | East 9th St, East Austin |
| Henry G. Madison Cabin | Austin Parks & Rec + Austin Parks Foundation | Restoration | Rosewood Park, 2300 Rosewood Ave |
| San Gabriel Residence | (private) | Restoration | San Gabriel St area |
| Second Century House | Susan & Mitch Oringer | Infill/Addition | (private residence) |
| Tisdale Residence | Chanel & Eric Tarlo | Rehabilitation | (private residence) |
| Dr. Sidney Jr. & Helen F. White House | Alta & Lamont Alexander | Stewardship | East Austin (historic Black neighborhood) |
| Equity-Based Preservation Plan | City of Austin Historic Preservation Office | Media/Scholarship | Citywide policy |
| Haskell House & Story of Clarksville Documentary | Austin Parks & Rec | Education | Clarksville / 1703 Waterston Ave |
| Kathy Robinson / ReUse People of Austin | Kathy Robinson | Public Service | Citywide |

#### 2024 (64th Annual)
| Project | Recipient | Award Type | Location (approx.) |
|---|---|---|---|
| 4300 Speedway | State Street Properties | Rehabilitation | 4300 Speedway, North Campus |
| Christianson-Leberman Building | Texas Historical Commission | Rehabilitation | 108 W 16th St (Luther Hall) |
| Hartford Home | Molly & Alex McVey | Infill/Addition | Hartford area |
| Hogg Memorial Auditorium | UT Austin | Restoration | UT Campus, 2300 Whitis Ave |
| Hutson Gallagher | Tracy & Chris Hutson | Public Service | Citywide |
| OFFbeat | Roger Fisher & Lorrie Castellano | Infill/Addition | (private) |
| Old General Land Office Building | State Preservation Board | Restoration | 108 E 11th St |
| Raymond-Morley House | Reid Wittliff | Rehabilitation | (private) |
| Neill-Cochran House Museum Slave Quarters + Tara Dudley | Neill-Cochran House Museum | Restoration + Stewardship | 2310 San Gabriel St |
| Mark Wolfe | Mark Wolfe | Public Service | (individual) |
| Sue Spears-Martin | Sue Spears-Martin | Stewardship | (individual) |
| Chris Riley | Chris Riley | Public Service | (individual) |

#### 2023 (63rd Annual)
| Project | Recipient | Award Type | Location (approx.) |
|---|---|---|---|
| Austin State Supported Living Center | TX Health & Human Services | Rehabilitation | 2203 W 35th St |
| Battle Hall | UT Austin | Restoration | UT Campus |
| St. David's Episcopal Church | Episcopal Church Council | Restoration | 301 E 8th St |
| Uptown Sports Club | Jason Jones, Aaron Franklin et al. | Rehabilitation | 1200 E 6th St |
| Windsor Road House | Birgit Enstrom & Hugh Jefferson Randolph | Rehabilitation | Windsor Road area |
| Huston-Tillotson University | HTU | Stewardship | 900 Chicon St |
| U.S. General Services Admin — LBJ Suite | GSA | Stewardship | Federal Building |
| Robin Shepherd / 5 Birds Dwellings | Robin Shepherd | Stewardship | Multiple East Austin |
| Black Austin Tours | Javier Wallace | Education | East Austin |
| Original L.C. Anderson High School | Preservation Team | Public Service | 900 Thompson St |
| To Emancipate: Oakwood Cemetery Chapel | Austin Parks & Rec | Education | 1601 Navasota St |
| Translating Community History | City of Austin HPO | Media/Scholarship | Citywide |

#### 2022 (62nd Annual)
| Project | Recipient | Award Type | Location (approx.) |
|---|---|---|---|
| Bluebonnet House | Nick & Brianna Adams | Rehabilitation | (private) |
| Downs Field | Austin Parks & Rec | Rehabilitation | 2816 E 12th St |
| Haskell House | Austin Parks & Rec | Rehabilitation | 1703 Waterston Ave (Clarksville) |
| Luther Hall | Texas Historical Commission | Rehabilitation | 108 W 16th St |
| Theresa Passive House | Trey Farmer | Sustainability | Theresa St area |
| The Hangar / Garden 17 | Lamar Takeoff | Stewardship | East Austin |
| Parque Zaragoza Documentary | Austin Parks & Rec | Education | 2608 Gonzales St |

---

### C. Legacy Business Month Participants (2023–2025)

All 33 businesses featured across three years, with addresses.

#### 2023 (Inaugural — 13 businesses)
| Business | Address | Neighborhood |
|---|---|---|
| BookPeople | 603 N Lamar Blvd | Downtown / Clarksville |
| Broken Spoke | 3201 S Lamar Blvd | South Lamar |
| Carousel Lounge | 1110 E 52nd St | North Loop / Highland |
| Cisco's Restaurant | 1511 E 6th St | East Austin |
| Deep Eddy Cabaret | 2315 Lake Austin Blvd | West Austin |
| The Driskill Hotel | 604 Brazos St | Downtown |
| Green & White Grocery | 1201 E 7th St | East Austin |
| The Herb Bar | 200 W Mary St | South Austin / Bouldin |
| The Paramount Theatre | 713 Congress Ave | Downtown |
| Peter Pan Mini-Golf | 1207 Barton Springs Rd | Zilker / Barton Springs |
| Playland Skate Center | 8822 McCann Dr | North Austin |
| Quality Seafood Market | 5621 Airport Blvd | North Central |
| Waterloo Records & Video | 600A N Lamar Blvd | Downtown / Clarksville |

#### 2024 (10 businesses)
| Business | Address | Neighborhood |
|---|---|---|
| Antone's Record Shop | 2928 Guadalupe St #101 | UT / Drag |
| Aster's Ethiopian Restaurant | 2804 N I-35 | North Central |
| BookWoman | 5501 N Lamar Blvd | North Austin |
| The Continental Club | 1315 S Congress Ave | SoCo / Travis Heights |
| Esther's Follies | 525 E 6th St | Downtown / 6th St |
| Joe's Bakery | 2305 E 7th St | East Austin |
| The Little Longhorn Saloon | 5434 Burnet Rd | Brentwood / Allandale |
| Nature's Treasures | 4103 N I-35 | North Central |
| Scholz Garten | 1607 San Jacinto Blvd | Downtown / UT |
| Zilker Park Boat Rentals | 2101 Andrew Zilker Rd | Zilker |

#### 2025 (10 businesses)
| Business | Address | Neighborhood |
|---|---|---|
| Antone's Nightclub | 305 E 5th St | Downtown / Warehouse |
| Aussie's Grill & Beach Bar | 306 Barton Springs Rd | Zilker / SoCo |
| Mozart's Coffee Roasters | 3825 Lake Austin Blvd | West Austin / Tarrytown |
| Mr. Natural | 1901 E Cesar Chavez St | East Austin / Holly |
| Oilcan Harry's | 211 W 4th St | Downtown / Warehouse |
| Room Service Vintage | 117 E North Loop Blvd | North Loop |
| Sam's BBQ | 2000 E 12th St | East Austin |
| Shandeez Grill | 8863 Anderson Mill Rd #109 | NW Austin |
| Terra Toys | 2438 W Anderson Ln C1 | North Austin / Allandale |
| The Saxon Pub | 1320 S Lamar Blvd | South Lamar / Zilker |

---

### D. Advocacy Milestones & Key Sites

| Year | Action | Location/Context |
|---|---|---|
| 2022 | Adopted Legacy Businesses as an Advocacy Priority | Citywide |
| 2023 | Secured $300K from City Council for Equity-Based Preservation Plan | Citywide |
| 2023 | City Council proclaimed October as Legacy Business Month | Citywide |
| 2023 | BIPOC Preservation Commission Training launched | Citywide |
| 2024 | Equity-Based Preservation Plan adopted by City Council (Nov 21) | Citywide |
| 2024 | Advocating for East 6th St historic zoning | East 6th St corridor |
| 2025 | Calhoun House designated as City of Austin Landmark | 2401 Givens Ave, East Austin |
| 2025 | JuanRaymon Rubio Preservation Fellowship established | Citywide (underrepresented heritage) |
| 2025 | The Black Space Project with Charles L. Davis II | East Austin historic sites |
| 2025 | PA moves into McFarland-McBee House | 3805 Red River St |

---

## PART 2: CLAUDE CODE PROMPT

Below is a prompt you can give directly to Claude Code. Copy everything between the `---START PROMPT---` and `---END PROMPT---` markers.

---START PROMPT---

## Task: Add a "Preservation Austin" Map Overlay

I'm building an interactive map of Austin's cultural displacement called "Austin's Shifting Ground." I need to add a new toggle overlay layer that shows Preservation Austin's community investments — grants, merit awards, Legacy Business Month participants, and advocacy landmarks — as colored dots on the map.

### Context on the existing codebase

The app is a React application. Here's how overlays currently work:

- **MapView.jsx** contains toggle buttons at the top (Heritage, Businesses, Project Connect) that control boolean state like `showPins`, `showProjectConnect`, etc.
- **useAustinMap.js** is a custom hook that manages Mapbox/Leaflet rendering. It reads the toggle states and conditionally adds/removes map layers.
- The map already supports business pins (open/closed/pressure) and transit overlays.
- There's a legend at the bottom of MapView that explains each overlay's symbols.
- State is managed at the App level and passed through props.

### What to build

**1. New data file: `src/data/preservationAustin.js`**

Create a data file exporting four arrays, each containing objects with this shape:

```js
{
  id: "pa-grant-1",
  name: "Paramount Theatre — Marquee Restoration",
  lat: 30.2672,     // geocoded latitude
  lng: -97.7431,    // geocoded longitude
  type: "grant",    // one of: "grant", "merit_award", "legacy_business", "advocacy"
  year: 2017,
  category: "Bricks & Mortar",  // or award type, or business type
  amount: 5000,     // grants only
  recipient: "Austin Theatre Alliance",
  description: "Preservation Austin grant for marquee restoration at the Paramount Theatre",
  address: "713 Congress Ave"
}
```

Use the consolidated data below to populate these arrays. You'll need to geocode the addresses to lat/lng. For well-known Austin addresses, use approximate coordinates. Here is the full dataset:

**GRANTS (72 entries):**
[Include the full grants table from Part 1A above — all 72 entries with addresses, amounts, dates, and categories]

**MERIT AWARDS (2022–2025, ~40 entries):**
[Include the full merit awards table from Part 1B — all four years with project names, recipients, award types, and locations]

**LEGACY BUSINESS MONTH (33 businesses across 2023–2025):**
[Include the full Legacy Business Month tables from Part 1C — all three years with business names, addresses, and neighborhoods]

**ADVOCACY MILESTONES (10 entries):**
[Include the advocacy table from Part 1D]

For geocoding, use known Austin coordinates:
- Downtown core: ~30.267, -97.743
- East Austin (E 6th/7th/11th/12th): ~30.264, -97.728
- UT Campus: ~30.285, -97.733
- South Congress: ~30.248, -97.748
- South Lamar: ~30.252, -97.762
- North Loop: ~30.318, -97.724
- Zilker: ~30.263, -97.773
- Clarksville: ~30.278, -97.757
- Hyde Park: ~30.305, -97.730
- For specific addresses, estimate lat/lng based on the street grid

**2. New state in App.jsx:**

```js
const [showPreservationAustin, setShowPreservationAustin] = useState(false);
```

Pass `showPreservationAustin` and `setShowPreservationAustin` to MapView.

**3. Update MapView.jsx:**

Add a toggle button in the toolbar alongside Heritage, Businesses, Project Connect:

```jsx
{
  on: showPreservationAustin,
  toggle: () => setShowPreservationAustin(!showPreservationAustin),
  label: "Preservation Austin",
  icon: <span style={{ width: 7, height: 7, borderRadius: "50%", background: showPreservationAustin ? "#7c3aed" : "#a8a49c", border: "1.5px solid currentColor" }} />
}
```

**4. Update useAustinMap.js:**

When `showPreservationAustin` is true, render dots on the map for each entry in the dataset. Use this color scheme:
- **Grants**: `#7c3aed` (purple) — filled circle
- **Merit Awards**: `#2563eb` (blue) — filled diamond or circle
- **Legacy Business Month**: `#d97706` (amber) — filled circle
- **Advocacy**: `#059669` (emerald) — filled star or circle

Each dot should:
- Have a radius proportional to significance (grants by amount, awards fixed, businesses fixed)
- Show a tooltip/popup on hover with: name, type, year, description, amount (if grant)
- Be filterable by the year slider (show items from that year or before)

**5. Update the Legend in MapView.jsx:**

When `showPreservationAustin` is true, add a legend section:

```jsx
{showPreservationAustin && (
  <div style={{ paddingTop: 6, borderTop: "1px solid #e8e5e0", display: "flex", gap: 8, flexWrap: "wrap" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed" }} />
      <span style={{ fontSize: 10, color: "#64615b" }}>PA Grant</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb" }} />
      <span style={{ fontSize: 10, color: "#64615b" }}>Merit Award</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706" }} />
      <span style={{ fontSize: 10, color: "#64615b" }}>Legacy Business</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669" }} />
      <span style={{ fontSize: 10, color: "#64615b" }}>Advocacy</span>
    </div>
  </div>
)}
```

**6. Update RegionDetailPanel.jsx:**

When a region is selected AND `showPreservationAustin` is on, show a "Preservation Austin" section in the Culture tab listing any PA grants, awards, or businesses within that region. Cross-reference using region boundaries or proximity.

### Design principles
- Match the existing visual language: muted earth tones, small dots, clean tooltips
- The overlay should feel like a "counter-narrative" layer — showing where preservation investment has pushed back against displacement
- Purple/blue tones differentiate PA data from the existing green (open biz) / amber (pressure) / gray (closed) business pins
- Dots should be slightly smaller than business pins to avoid visual clutter
- When both Businesses and Preservation Austin layers are on, PA dots should render on top

### Files to modify
- `src/data/preservationAustin.js` (new)
- `src/App.jsx` (new state)
- `src/components/MapView.jsx` (toggle + legend)
- `src/hooks/useAustinMap.js` (rendering logic)
- `src/components/RegionDetailPanel.jsx` (detail panel integration)

---END PROMPT---

---

## PART 3: NOTES & GAPS

### Data that may need verification or additional research
1. **Exact addresses for private residences** in merit awards (marked as "private") — these could be omitted or shown as neighborhood-level dots
2. **Geocoding accuracy** — The grants CSV doesn't include lat/lng; Claude Code should estimate from addresses or use a geocoding API
3. **Pre-2022 merit awards** — This document covers 2022–2025. Earlier winners (2020, 2021, etc.) are available on preservationaustin.org/programs/past-preservation-merit-award-winners/ if you want more historical depth
4. **Legacy Business Month interactive map** — Preservation Austin has their own map of all featured businesses at preservationaustin.org/programs/legacy-business-month that could be web-scraped for exact coordinates
5. **Homes Tour sites** — PA runs an annual Homes Tour showcasing restored homes. These could be another data layer but are harder to compile addresses for since they're private residences

### Key statistics for the "About" modal or tooltips
- $284K+ in grants awarded since 2016
- 72+ individual grants funding restoration, education, and historic district work
- 33 legacy businesses featured across 3 years of Legacy Business Month
- 65 years of Preservation Merit Awards (since 1960)
- Only 16% of Austin's historic landmarks have known associations with communities of color
- Preservation Austin's advocacy secured $300K for Austin's first new preservation plan in 40 years
