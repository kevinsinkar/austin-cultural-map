## Project Roadmap

Our goal is to move the **Austin Cultural Map** from a retrospective tool to a predictive, action-oriented platform for Preservation Austin's 2026 strategy.

> **Last updated:** September 24, 2026

---

### Completed Work

#### Data Pipeline — Real Census Data

* **AI-generated data replaced:** All three Phase 1 JSON files replaced with real Census Bureau data fetched via API. The original Gemini-generated estimates (off by up to 48 percentage points) are no longer used.
* **Historical backfill:** `fill_census_gaps_v2.py` and `fill_demographic_history.py` backfill pre-2020 data using Decennial Census 2000/2010 SF1 and ACS 5-Year estimates with 2010→2020 and 2000→2010 tract crosswalking.
* **Current coverage:**
  - Demographics: 1,542 rows — 247 tracts at 2000, 246 at 2005 (interpolated), 256 at 2010/2015, 269 at 2020/2023
  - Property: 1,052 rows — 257 tracts at 2010/2015, 269 at 2020/2023
  - Socioeconomic: 1,052 rows — 257 tracts at 2010/2015, 269 at 2020/2023
* **Non-Hispanic race variables:** Fixed to use Census P004 (2000) and P005 (2010) tables so race percentages don't exceed 100%.
* **Construction permits:** 191K permits from City of Austin dataset (3syk-w9eu) merged into property data — `new_construction_permits` (~700 rows) and `commercial_sqft` (~643 rows).
* **Census variable discovery:** Full API availability scan across ACS 2010–2023 documented in `data/census_variable_discovery.json`.

#### Core Features

* **Three-Lens Grant Triage:** Trajectory (displacement velocity), Equity (underserved communities), Risk Matrix (intervention type matching). Scatter plots + sortable tables for all 269 regions.
* **Locate on Map:** Clicking a region in triage shows a "Locate on Map" button that navigates to the map, zooms to the tract, and opens the data panel.
* **Dual Boundary System:** Census Tracts (269) and 137 neighborhoods with toggle. Population-weighted aggregation for neighborhood mode. Contiguity enforcement ejects orphan tracts (>2km from nearest neighbor) into standalone neighborhoods to prevent non-contiguous groupings.
* **Standardized charts:** Demographics chart spans 1990–2025 with `connectNulls={false}` for honest gaps. Missing-data notes explain why (tract created after 2010, etc.). Economics cards show actual data year when it differs from the slider.
* **DVI Weight Sliders:** Advanced panel for adjusting DVI sub-index weights (demographic 35%, market 35%, socioeconomic 30%).
* **Inflation-adjusted values:** Dual nominal / 2023$ display for home values, rent, and income via CPI-U Austin MSA data.
* **Data Methodology:** Full methodology rendered inline in About modal via react-markdown + remark-gfm. Single source of truth from `DATA_METHODOLOGY.md`.

#### Geocoding & Map Accuracy

* **Legacy businesses geocoded:** All 93 businesses (41 operating, 52 closed) re-geocoded via Google Maps API for rooftop-level precision.
* **Preservation Austin geocoded:** All 156 PA entries (grants, merit awards, legacy businesses, advocacy) re-geocoded via Google Maps API. Private residences kept at neighborhood centroids for privacy.

#### Recent Additions (2026)

* **BASTA eviction filing rates:** Integrated 2014–2025 tract-level eviction filing rates (data-vintage note in methodology).
* **Texas Legislature cost-of-living track:** 26 bills (2006–2025) rendered as a timeline track under the map slider.
* **AISD school closures overlay:** 15 campuses (2012–2026) on the main map.
* **History tab:** New view built from the Preservation Austin historical data package (Sept 2026) — 112 events from Clovis-era occupation to the 2026 crosswalk removal. Warped timeline, community/era/type/documentation-flag filters, per-event perspective accounts and unverified-claims panels, plus five reference overlays (HOLC 1935, city limits 1839–2022, historic districts, Indigenous presence zones, I-35 corridor / 1884–85 Tonkawa removal route).
* **1935 Redlining overlay on main map:** HOLC grades render beneath the DVI choropleth so displacement scores can be read against 1935 grades directly.

#### Region Naming & Identity

* **269 tracts mapped to 232 visible regions** with unique display names.
* **125 regions renamed** from census-tract labels to recognized neighborhood names via City of Austin data and Google Maps.
* **Merge infrastructure:** `VISIBLE_REGIONS`, `getMergedIds()`, `toPrimaryId()`, `MERGE_LOOKUP`.

#### Infrastructure

* **Repo reorganized:** Scripts in `scripts/`, docs in `docs/`, data in `data/`. Intermediates cleaned up. `.gitignore` updated.
* **Security:** API credentials moved to environment variables.
* **Architecture documented:** `ARCHITECTURE.md` covers full file dependency graph, data flow, and domain concepts.

---

### Open Work

#### UX / UI Overhaul — September 2026 Design Review

Full review in `docs/ux-ui-design-review.md`; implementation sequence in `docs/ux-overhaul-prompt.md`.

| Priority | Task | Status |
| --- | --- | --- |
| High | Choropleth redesign — binned colorblind-safe sequential ramp; distinct blue/hatched treatment for capped "Exclusive/Appreciated" tracts (match Triage #1565C0); legend bins match fill | Done — Phase 1 |
| High | Shareable URLs — consolidate index.jsx state into a reducer, serialize view/year/layers/selection to URL hash | Done — Phase 2 |
| High | Unified ConfidenceChip uncertainty component (DVI tile, map tooltip, pre-2010 badge); mark interpolated vs. measured values in charts | Done — Phase 3 |
| Med | Map-first layout — full-height map, on-map legend, docked time bar, grouped Layers popover; Triage recommendation card moved to top; 11px type floor | Done — Phase 4 |
| Med | Ambient historical context — clickable timeline ticks, year-aware policy callouts, History↔Map cross-links, tipping-point teaser in panel header | Not Started — Phase 5 |
| Med | Layer decluttering — shape+color point encoding, HOLC as hatch/outline instead of stacked fill | Not Started — deferred |
| Low | Compare view: wire to global year slider (or label "Latest data 2023"); add citywide baseline lines | Not Started — deferred |
| Low | Read-only mobile fallback below 900px (tract lookup + DVI card) | Not Started — deferred |

#### Data Gaps — High Priority

| Priority | Task | Status |
| --- | --- | --- |
| High | Tribal consultation before public launch of Indigenous presence zones — Tonkawa Tribe of Oklahoma, Comanche Nation, Lipan Apache Tribe of Texas, Indigenous Cultures Institute | Not Started — required by data-package terms before release |
| High | HOLC 1935 license check — CC BY-NC (Mapping Inequality). Drop layer or get permission if the tool is ever monetized | Needs Decision — attribution shown in-app; fine while non-commercial |
| High | Geocoding pass on History-tab event coordinates — many generated from a downtown grid model, not geocoded | Not Started — verify all address/intersection points |
| High | Backfill 22 remaining tracts missing 2000 data (92% → 100%) | In Progress — crosswalk limitations for newest tracts |
| High | Add SNAP participation rates from Texas HHSC | Pending — not yet sourced |
| Med | Verify 44 unverified claims in historical events — each lists its resolving record (council resolutions for 1928 plan, I-35 court outcome, TxDOT letters, etc.) | Not Started — see event detail panels |
| Med | Backfill 13 tracts missing 2010/2015 data | In Progress — Williamson County crosswalk gaps |

#### Region Naming — In Progress

| Priority | Task | Status |
| --- | --- | --- |
| Med | Review ~117 tracts outside NPA coverage still showing tract numbers | In Progress — need manual neighborhood name assignments |
| Med | Rebuild neighborhoods after name audit complete | Blocked — waiting on name review |

#### History Tab — Data Verification & Enrichment

Ordered by value, per the data package's own handoff notes (`Preservation Austin/files/README.md` §6).

| Priority | Task | Status |
| --- | --- | --- |
| High | Load City of Austin annexation-history GIS layer — replaces 4 dashed proxy circles and settles the 28 events marked `undetermined_pre1990` | Not Started — city publishes the layer; Austin History Center holds period maps |
| High | Load city landmark / historic-district inventory + National Register listings coded by era and community — makes "designated vs. removed" quantitative | Not Started — highest-value next dataset per the spec |
| Med | Replace hand-built street-bounds polygons (Clarksville, Blackland, etc.) with City of Austin open-data or National Register shapefiles (current error ±100–300 m) | Not Started |
| Med | Enrich the 102 index-level event records — full citations + ≥2 perspective accounts each; 35 of 45 major events are still index-level | Not Started — research work |
| Med | Indigenous-origin accounts: 22 of 25 Indigenous-tagged events have none | Not Started — consultation work, not archival |
| Med | East Austin cultural landscape 1930–1990 (E 11th/12th district, Victory Grill, Harlem Theater, Rosewood Park, Parque Zaragoza) — currently absent | Not Started — Six Square, Carver Museum, ATX Barrio Archive, AHC community archivists |
| Med | LGBTQ+ history 1990–2021 gap (AIDS-era organizing, Pride, marriage litigation) | Not Started |
| Low | Retrieve IUPRA East Austin study tract list (placeholder feature) and Mears's freedom-colonies list (≥15 colonies; only Clarksville & Wheatville mapped) | Not Started |
| Low | Integrate Preservation Austin advocacy letters (2024, 2026 PDFs in `Preservation Austin/Advocacy Letters/`) into the PA advocacy overlay | Not Started — needs extraction + geocoding |

#### Forward-Looking Features

| Priority | Task | Status |
| --- | --- | --- |
| Med | Timeline view redesign | Paused — component exists, button removed from header. Needs better UX/alignment before re-enabling |
| Med | Re-integrate dev pressure into detail panel | Not Started — data available via overlay, needs per-region surface in panel |
| Med | Add institutional/social anchor data model | Not Started — churches, community orgs, schools not tracked |
| Med | Predictive "At-Risk" modeling | Not Started — trend-line displacement forecasting |
| Low | Add oral history / community voice hooks | Not Started |
| Low | Create "How to Use This for Grants" guide | Not Started |
| Low | Community Landmark Layer | Not Started — murals, social clubs, soft-data layer |

#### Technical Debt

| Priority | Issue | Notes |
| --- | --- | --- |
| Med | Bundle size ~9.5 MB | GeoJSON polygons + history events dominate. Consider lazy-loading MapView/HistoryView or code-splitting. |
| Med | Business data coverage | ~40 of 269 regions have tracked businesses. More inventories needed. |
| Low | 65+ population field | `pct_65_and_over` requires summing 12 age bracket variables — not yet computed from Census API |
| Low | Uninsured population | Health insurance variables (B27010/B27001) available from 2012+ ACS but not yet integrated |

---
