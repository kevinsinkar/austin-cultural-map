## Project Roadmap

Our goal is to move the **Austin Cultural Map** from a retrospective tool to a predictive, action-oriented platform for Preservation Austin's 2026 strategy.

> **Last updated:** March 14, 2026

---

### Completed Work

#### Phase 1 — Data Integrity ✅

* **269-Region Data Audit:** All 269 census-tract-level neighborhoods have been audited and normalized via Gemini 2.5-fast automation. Three canonical datasets live in `data/phase1_output/`:
  - `audited_demographics_normalized.json` — 4,811 rows across 269 regions (population, race/ethnicity breakdowns, education, rent burden, age)
  - `audited_property_normalized.json` — 2,645 rows across 209 regions (home values, rent, commercial sqft, vacancy, permits)
  - `audited_socioeconomic_normalized.json` — 2,544 rows across 209 regions (income, poverty, unemployment, Gini, eviction, SNAP)
* **Field Normalization:** Dozens of variant field names (20+ Hispanic variants, 14+ Black variants, etc.) collapsed to canonical names. Percentage scales unified.
* **Rent Burden:** Added to the RegionDetailPanel detail cards with "% of renter households paying ≥30% of income on rent" subtitle.

#### Phase 2 — Core Feature Gaps ✅

* **Grant Triage View:** New "Triage" tab classifies all 269 regions into Urgent / Critical / Monitor / Post-Displacement / High Risk–Data Gap tiers using DVI + anchor density. Features scatter plot, sortable/filterable table with search, and per-region grant recommendations.
* **Cultural Anchor Density Metric:** `calcAnchorDensity` and `calcAnchorPressureScore` computed per region. Badge shown in RegionDetailPanel and ComparisonView.
* **DVI Weight Sliders:** TriageView's "Advanced" panel lets users adjust the three DVI sub-index weights (Demographic, Market, Socioeconomic) and see triage results update live. Includes "Reset to defaults" button.
* **Expanded Demographics:** ComparisonView supports "Black & Hispanic" / "All Groups" toggle showing Asian%, Other%, and all five demographic groups in charts.
* **Data Confidence Score:** `auditedDvi.js` computes average audit confidence across data sources; low-confidence regions automatically boost Socioeconomic Stress weight to compensate for data deserts.
* **Fractional-Year DVI Interpolation:** `interpolateDvi` in `math.js` supports fractional years (e.g., 2023.5) for smoother time-slider animation.

#### Phase 3 — Narrative & Context Enrichment (Partial) ✅

* **Enriched Comparison Narratives:** ComparisonView auto-narratives now reference closed businesses by cultural affiliation (e.g., "East Austin lost 8 African American heritage businesses between 2000–2020"), surviving businesses under pressure, and cultural context beyond raw DVI numbers.
* **Inflation-Adjusted Property Cards:** RegionDetailPanel and ComparisonView display dual nominal / 2023$ values for home values, rent, and income. Change arrows use inflation-adjusted figures.

#### Infrastructure & Cleanup ✅

* **Project architecture documented** in `ARCHITECTURE.md` with full file dependency graph.
* **Obsolete files archived** to `data/_archive/` and `scripts/_archive/` (old DVI computation, audit runners, gap-fill pipeline, Gemini prompts, interim JSONs).
* **Data barrel** (`data/index.js`) cleaned — dead exports removed.
* **Non-functional map filters removed** (Dev Pressure, Music Venues UI toggles removed; underlying data/hooks retained for future use).
* **Responsive sizing fixed** across all views to fit browser width; removed legacy `isMobile` calls.
* **Feedback link added** to header (Google Form).
* **White-on-white text bug fixed** in various views.
* **Detail panel reorganized** into three tabs (Demographics, Economics, Culture) with a persistent header showing DVI badge and anchor density.
* **Aggregate demographics chart** in Timeline view updated to include all 5 groups (White, Black, Hispanic, Asian, Other) across all regions.
* **Alphabetized** Compare region selectors, DVI heatmap rows in Timeline.

---

### Open Work

#### Phase 3 — Narrative & Context Enrichment (Remaining)

| Priority | Task | Status |
| --- | --- | --- |
| 🟡 **Med** | Generalize receiving-community annotations | In Progress — Dove Springs hardcoded; needs data-driven approach for Del Valle, Pflugerville, Manor, SE Austin |
| 🟡 **Med** | Add language/linguistic displacement data | Not Started — ACS Table B16001 (language at home) not yet sourced. `pct_foreign_born` used as proxy in DVI only. |

#### Phase 4 — Forward-Looking & Qualitative Layers

| Priority | Task | Status |
| --- | --- | --- |
| 🟡 **Med** | Re-integrate dev pressure into detail panel | Not Started — Map toggle removed; data still available via `showDevPressure` prop and `getDevPressureColor` in `mapHelpers.js`. Needs per-region surface in RegionDetailPanel. |
| 🟡 **Med** | Add institutional/social anchor data model | Not Started — Churches, community orgs, informal gathering spaces not tracked. |
| 🔵 **Low** | Add oral history / community voice hooks | Not Started |
| 🔵 **Low** | Create "How to Use This for Grants" guide (GrantGuideModal) | Not Started — No component exists yet. |

#### Known Technical Debt

| Priority | Issue | Notes |
| --- | --- | --- |
| 🔴 **High** | 44 duplicate region names across 269 tracts | e.g., "Circle C Ranch" appears 7 times, "Montopolis" 7 times, "Zilker" 5 times. Compare dropdowns, Triage table, and Timeline heatmap show identical names with no way to distinguish them. Need to either merge contiguous tracts or append a disambiguator (e.g., tract ID, cardinal direction). See `nextTask.md` for full details. |
| 🟡 **Med** | Dual GeoJSON files | `regions.js` (old) used only by `constants.js` for `REGION_NAMES`; `final_updated_regions.js` (canonical, 269 regions) used everywhere else. Should unify. |
| 🟡 **Med** | Bundle size ~13.6 MB | Large GeoJSON polygons dominate. Consider code-splitting or lazy-loading geometry data via `React.lazy()`. |
| 🟡 **Med** | Business data coverage | Legacy businesses only cover ~40 of 269 regions. Triage logic marks zero-business high-DVI regions as "High Risk / Data Gap" but more data would improve accuracy. |
| 🔵 **Low** | Property/socio coverage gap | 209 of 269 regions have property & socioeconomic data; 60 regions have demographics only. |
| 🔵 **Low** | Predictive "At-Risk" modeling | Trend-line feature for early-stage displacement indicators — backlog. |
| 🔵 **Low** | Community Landmark Layer | Soft-data layer for murals, social clubs, gathering spaces — backlog. |
| 🔵 **Low** | ARCHITECTURE.md out of date | Does not reflect Data Confidence Score, removed map filters, inflation-adjustment logic, enriched narratives, or detail panel tabs. Last updated March 3. |

---
