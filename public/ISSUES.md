## Project Roadmap

Our goal is to move the **Austin Cultural Map** from a retrospective tool to a predictive, action-oriented platform for Preservation Austin's 2026 strategy.

> **Last updated:** March 24, 2026

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
* **Dual Boundary System:** Census Tracts (269) and City of Austin Neighborhood Planning Areas (~87) with toggle. Population-weighted aggregation for neighborhood mode.
* **Standardized charts:** Demographics chart spans 1990–2025 with `connectNulls={false}` for honest gaps. Missing-data notes explain why (tract created after 2010, etc.). Economics cards show actual data year when it differs from the slider.
* **DVI Weight Sliders:** Advanced panel for adjusting DVI sub-index weights (demographic 35%, market 35%, socioeconomic 30%).
* **Inflation-adjusted values:** Dual nominal / 2023$ display for home values, rent, and income via CPI-U Austin MSA data.
* **Data Methodology:** Full methodology rendered inline in About modal via react-markdown + remark-gfm. Single source of truth from `DATA_METHODOLOGY.md`.

#### Geocoding & Map Accuracy

* **Legacy businesses geocoded:** All 93 businesses (41 operating, 52 closed) re-geocoded via Google Maps API for rooftop-level precision.
* **Preservation Austin geocoded:** All 156 PA entries (grants, merit awards, legacy businesses, advocacy) re-geocoded via Google Maps API. Private residences kept at neighborhood centroids for privacy.

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

#### Data Gaps — High Priority

| Priority | Task | Status |
| --- | --- | --- |
| High | Backfill 22 remaining tracts missing 2000 data (92% → 100%) | In Progress — crosswalk limitations for newest tracts |
| High | Add eviction filing rates from BASTA Austin | Pending — awaiting data access from bastaaustin.org |
| High | Add SNAP participation rates from Texas HHSC | Pending — not yet sourced |
| Med | Backfill 13 tracts missing 2010/2015 data | In Progress — Williamson County crosswalk gaps |

#### Region Naming — In Progress

| Priority | Task | Status |
| --- | --- | --- |
| Med | Review ~117 tracts outside NPA coverage still showing tract numbers | In Progress — need manual neighborhood name assignments |
| Med | Rebuild neighborhoods after name audit complete | Blocked — waiting on name review |

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
| Med | Bundle size ~8.4 MB | GeoJSON polygons dominate. Consider lazy-loading MapView or code-splitting. |
| Med | Business data coverage | ~40 of 269 regions have tracked businesses. More inventories needed. |
| Low | 65+ population field | `pct_65_and_over` requires summing 12 age bracket variables — not yet computed from Census API |
| Low | Uninsured population | Health insurance variables (B27010/B27001) available from 2012+ ACS but not yet integrated |

---
