## Project Roadmap

Our goal is to move the **Austin Cultural Map** from a retrospective tool to a predictive, action-oriented platform for Preservation Austin's 2026 strategy.

> **Last updated:** March 3, 2026

---

### Completed Work

#### Phase 1 — Data Integrity ✅

* **269-Region Data Audit:** All 269 census-tract-level neighborhoods have been audited and normalized via Gemini 2.5-fast automation. Three canonical datasets live in `data/phase1_output/`:
  - `audited_demographics_normalized.json` — 4,811 rows across 269 regions (population, race/ethnicity breakdowns, education, rent burden, age)
  - `audited_property_normalized.json` — 2,645 rows across 209 regions (home values, rent, commercial sqft, vacancy, permits)
  - `audited_socioeconomic_normalized.json` — 2,544 rows across 209 regions (income, poverty, unemployment, Gini, eviction, SNAP)
* **Field Normalization:** Dozens of variant field names (20+ Hispanic variants, 14+ Black variants, etc.) collapsed to canonical names. Percentage scales unified.
* **Rent Burden:** Added to the RegionDetailPanel detail cards.

#### Phase 2 — Core Feature Gaps ✅

* **Grant Triage View:** New "Triage" tab classifies all 269 regions into Urgent / Critical / Monitor / Post-Displacement tiers using DVI + anchor density. Features scatter plot, sortable/filterable table with search, and per-region grant recommendations.
* **Cultural Anchor Density Metric:** `calcAnchorDensity` and `calcAnchorPressureScore` computed per region. Badge shown in RegionDetailPanel and ComparisonView.
* **DVI Weight Sliders:** TriageView's "Advanced" panel lets users adjust the three DVI sub-index weights (Demographic, Market, Socioeconomic) and see triage results update live.
* **Expanded Demographics:** ComparisonView supports "Black & Hispanic" / "All Groups" toggle showing Asian%, Other%, and all five demographic groups in charts.

#### Infrastructure & Cleanup ✅

* **Project architecture documented** in `ARCHITECTURE.md` with full file dependency graph.
* **Obsolete files archived** to `data/_archive/` and `scripts/_archive/` (old DVI computation, audit runners, gap-fill pipeline, Gemini prompts, interim JSONs).
* **Data barrel** (`data/index.js`) cleaned — dead exports removed.

---

### Open Work

#### Phase 3 — Narrative & Context Enrichment

| Priority | Task | Status |
| --- | --- | --- |
| 🟡 **Med** | Enrich comparison auto-narratives with cultural data | Not Started |
| 🟡 **Med** | Add inflation-adjustment labels to property cards | Not Started |
| 🟡 **Med** | Add receiving-community annotations | Not Started |
| 🟡 **Med** | Add language/linguistic displacement data | Not Started |

#### Phase 4 — Forward-Looking & Qualitative Layers

| Priority | Task | Status |
| --- | --- | --- |
| 🟡 **Med** | Integrate dev pressure into detail panel metrics | Not Started |
| 🟡 **Med** | Add institutional/social anchor data model | Not Started |
| 🔵 **Low** | Add oral history / community voice hooks | Not Started |
| 🔵 **Low** | Create "How to Use This for Grants" guide | Not Started |

#### Known Technical Debt

| Priority | Issue | Notes |
| --- | --- | --- |
| 🟡 **Med** | Dual GeoJSON files | `regions.js` (old) used only by `constants.js` for `REGION_NAMES`; `final_updated_regions.js` (canonical, 269 regions) used everywhere else. Should unify. |
| 🟡 **Med** | Bundle size ~13.6 MB | Large GeoJSON polygons dominate. Consider code-splitting or lazy-loading geometry data. |
| 🟡 **Med** | Business data coverage | Legacy businesses only cover ~40 of 269 regions. Triage logic accounts for this but more data would improve accuracy. |
| 🔵 **Low** | Property/socio coverage gap | 209 of 269 regions have property & socioeconomic data; 60 regions have demographics only. |
| 🔵 **Low** | Predictive "At-Risk" modeling | Trend-line feature for early-stage displacement indicators — backlog. |
| 🔵 **Low** | Community Landmark Layer | Soft-data layer for murals, social clubs, gathering spaces — backlog. |

---
