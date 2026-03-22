## Project Roadmap

Our goal is to move the **Austin Cultural Map** from a retrospective tool to a predictive, action-oriented platform for Preservation Austin's 2026 strategy.

> **Last updated:** March 21, 2026

---

### Completed Work

#### Phase 1 — Data Integrity

* **269-Region Data Audit:** All 269 census-tract-level neighborhoods audited and normalized via Gemini 2.5-flash automation. Three canonical datasets in `data/phase1_output/`.
* **Field Normalization:** Dozens of variant field names collapsed to canonical names. Percentage scales unified.
* **Rent Burden:** Added to RegionDetailPanel detail cards.

#### Phase 2 — Core Feature Gaps

* **Three-Lens Grant Triage:** Triage tab replaced single classification with three toggleable prioritization lenses scoring all 232 visible regions using census/ACS data (no business-data gating):
  - **Trajectory** — displacement velocity, acceleration, intervention window
  - **Equity** — demographic vulnerability, economic precarity, equity deficit, preservation gap
  - **Risk Matrix** — market pressure vs community vulnerability with quadrant assignment and suggested grant types
* **Interactive Scatter-Table Linking:** Clicking a region row in the triage table highlights its bubble in the scatter plot and grays out others.
* **Cultural Anchor Density Metric:** `calcAnchorDensity` and `calcAnchorPressureScore` per region. Badge in RegionDetailPanel and ComparisonView.
* **DVI Weight Sliders:** Advanced panel for adjusting DVI sub-index weights across all three lenses.
* **Expanded Demographics:** ComparisonView supports "Black & Hispanic" / "All Groups" toggle.
* **Data Confidence Score:** Low-confidence regions auto-boost Socioeconomic Stress weight.
* **Fractional-Year DVI Interpolation:** Supports fractional years for smooth animation.

#### Dual Boundary System

* **Census Tracts + Neighborhoods toggle:** Users switch between 232 census tract boundaries (data-precise) and 87 City of Austin Neighborhood Planning Area boundaries (aggregated, familiar names).
* **Build pipeline:** `scripts/build_neighborhoods.cjs` fetches 95 NPA boundaries from COA Socrata API, assigns tracts via centroid-in-polygon (Turf.js), generates merged polygon GeoJSON.
* **Aggregation:** Population-weighted averages for demographics, DVI, property, and socioeconomic data. Each tract belongs to exactly one neighborhood — no double-counting.
* **Neighborhood detail panel:** Aggregated demographics chart, economics summary, business counts, and contributing tracts list.
* **ComparisonView dropdown** swaps to neighborhood names in neighborhood mode.

#### Phase 3 — Narrative & Context Enrichment (Partial)

* **Enriched Comparison Narratives:** Auto-narratives reference closed businesses by cultural affiliation, surviving businesses under pressure, and cultural context.
* **Inflation-Adjusted Property Cards:** Dual nominal / 2023$ values for home values, rent, and income.

#### Region Name Disambiguation & Reconciliation

* **44 duplicate region names resolved:** 269 census tracts mapped to 232 visible regions with unique display names.
* **`display_name` system:** All UI components render `display_name`. Original `region_name` preserved.
* **Merge infrastructure:** `VISIBLE_REGIONS`, `getMergedIds()`, `toPrimaryId()`, `MERGE_LOOKUP`.
* **125 regions renamed** from census-tract labels to recognized neighborhood names via City of Austin data (77) and Gemini suggestions (48).

#### Infrastructure & Cleanup

* **Architecture documented** in `ARCHITECTURE.md`.
* **Obsolete files archived.**
* **Data barrel cleaned.**
* **Responsive sizing fixed** across all views.
* **Detail panel reorganized** into Demographics, Economics, Culture tabs.

---

### Open Work

#### Region Naming

| Priority | Task | Status |
| --- | --- | --- |
| Med | Re-audit remaining ~149 region names outside COA official coverage | Not Started — suburbs, ETJ areas still have census-tract labels |
| Med | Apply user override corrections via `build_master_remap.py` | Not Started |

#### Narrative & Context

| Priority | Task | Status |
| --- | --- | --- |
| Med | Generalize receiving-community annotations | In Progress — Dove Springs hardcoded; needs data-driven approach |
| Med | Add language/linguistic displacement data | Not Started — ACS Table B16001 not yet sourced |

#### Forward-Looking Layers

| Priority | Task | Status |
| --- | --- | --- |
| Med | Timeline view redesign | Paused — component exists but needs better UX before re-enabling |
| Med | Re-integrate dev pressure into detail panel | Not Started — data available, needs per-region surface |
| Med | Add institutional/social anchor data model | Not Started — churches, community orgs not tracked |
| Low | Add oral history / community voice hooks | Not Started |
| Low | Create "How to Use This for Grants" guide | Not Started |

#### Technical Debt

| Priority | Issue | Notes |
| --- | --- | --- |
| Med | Bundle size ~15 MB | GeoJSON polygons + neighborhood polygons dominate. Consider code-splitting or lazy-loading. |
| Med | Business data coverage | ~40 of 269 regions. Triage no longer gates on this but more data improves accuracy. |
| Low | Property/socio coverage gap | 209 of 269 regions have property & socioeconomic data |
| Low | Predictive "At-Risk" modeling | Trend-line feature — backlog |
| Low | Community Landmark Layer | Soft-data layer for murals, social clubs — backlog |

---
