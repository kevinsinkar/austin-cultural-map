# Agent Todo List

> Last updated: 2026-08-30

---

## 🔴 High Priority — Data Access Blockers

### Eviction Filing Rate Integration ✅ COMPLETE (2026-09-04)
BASTA delivered tract-level filings 2014–2025 (data/BASTA/). Pipeline:
`prepare_basta_evictions.py` (counts → rates via ACS-aligned windows + renter-household denominators)
→ `merge_permits_and_evictions.py --tract-level` → 724 socio rows filled (242×2015, 240×2020, 242×2023).
2010 rows stay null (BASTA starts 2014); 22 non-Travis tracts have no data.
Avg socio sub-score impact +9.1 pts; East Austin corridors (MLK, Springdale, Pleasant Valley, Georgian Acres) max the component.

<details><summary>Original task list (done)</summary>
- [ ] **Source eviction data** — Contact BASTA Austin or download from [Eviction Lab](https://evictionlab.org/)
  - Needed format: CSV with `zip`, `year`, `eviction_filing_rate` (or `filings`/`renter_households`)
  - Target: 2010–2023 Austin ZIP codes
  
- [ ] **Download HUD ZIP-to-Tract crosswalk**
  - Source: https://www.huduser.gov/portal/datasets/usps_crosswalk.html
  - Select: ZIP → TRACT, Texas, latest year (≥2024 Q4)
  - Save as: `ZIP_TRACT_XXXXXX.xlsx` (any temp location)

- [ ] **Run eviction merge script**

  **BASTA (tract-level) data — preferred path, no crosswalk needed:**
  ```bash
  python scripts/merge_permits_and_evictions.py \
    --evictions <basta-csv> \
    --tract-level \
    --socio data/phase1_output/audited_socioeconomic_normalized.json \
    --in-place
  ```
  Accepts tract identifiers as 11-digit GEOID, 6-digit tractce, or decimal
  name ("24.47"); resolves via `data/region_tract_rosetta.json` (authoritative,
  all 269 regions incl. 22 non-Travis tracts). Script updated 2026-08-30:
  rosetta is now the primary GEOID source (immune to region renames), and the
  ZIP crosswalk filter covers Travis+Williamson+Hays+Bastrop.
  ⚠️ Tract-level path not yet run against real data — dry-run on a copy of the
  socio JSON first (omit `--in-place` to write `*_patched.json`).

  **ZIP-level data (Eviction Lab fallback):**
  ```bash
  python scripts/merge_permits_and_evictions.py \
    --evictions <zip-csv> \
    --socio data/phase1_output/audited_socioeconomic_normalized.json \
    --crosswalk <hud-xlsx> \
    --in-place
  ```
  - Verify: `eviction_filing_rate` fills from null to numeric (733 rows)
  - Check: Entries span 2010, 2015, 2020, 2023

- [ ] **Commit and verify DVI recalculation**
  - Run `npm run build` to ensure no import errors
  - Check TriageView scatter plot: DVI scores should shift (eviction now 30% of socio score)
  - Commit: "feat(data): add eviction filing rates (2010–2023, ZIP→tract distribution)"

</details>

---

## 🟠 Medium Priority — Region Naming & UX

### Region Name Audit ✅ COMPLETE (2026-08-30)
See [REGION_NAMING_AUDIT.md](REGION_NAMING_AUDIT.md) for full details.

- [x] **Identify tracts still showing raw tract numbers** — Found 154 (not ~117); all already had `short_name` values assigned
- [x] **Assign neighborhood names** — No manual naming needed: promoted existing `short_name` → `region_name`; disambiguated 87 duplicate display_names with `[region_id]` suffix
- [x] **Sync phase1_output JSONs** — `region` field updated in 2,042 rows across all 3 files
- [x] **Rebuild neighborhoods** — 136 neighborhoods, 232/232 tracts assigned, contiguity audit unchanged from baseline
- [x] **Update UI display** — Panel header, map tooltips now lead with community names; tract labels shown as context (e.g., "Windsor Hills [Tract 419.0]")
- [ ] **Visual spot-check in browser** — Verify names render correctly in MapView, RegionDetailPanel, TriageView, ComparisonView dropdowns
- [ ] **Commit** — "refactor(data): promote community names for 154 tracts, fix name display priority in UI"

---

## 🟡 Medium Priority — Feature Gaps

### Dev Pressure Per-Region Surface
- [ ] **Extract dev-pressure metric from overlay data**
  - Currently in `MapView` overlay toggle only
  - Add metric cards to RegionDetailPanel Economics tab
  
- [ ] **Surface in detail panel**
  - Show dev-pressure indicator (% of region under high/medium/low pressure)
  - Link to construction permits visualization

### Institutional Anchors Data Model
- [ ] **Research data sources**
  - Churches: Austin Churches Directory or Zillow
  - Community orgs: United Way 211 database
  - Schools: Texas Education Agency (TEA) / Austin ISD

- [ ] **Geocode and integrate**
  - Similar pipeline to `geocode_pa_google.py`
  - Add `institutionalAnchors.js` data module

- [ ] **Render on map**
  - Overlay toggle in MapView
  - Legend entries (church icon, school icon, etc.)

### Timeline View Redesign
- [ ] **Audit current implementation** (`TimelineView.jsx`)
  - Identify UX issues that led to button removal
  - Check performance (large DOM tree?)

- [ ] **Redesign proposal**
  - Alternative: horizontal scrollable business cards?
  - Aggregate by decade + era instead of individual business?

- [ ] **Re-enable if redesign approved**
  - Restore button to `Header.jsx`
  - Test performance

---

## 🟠 Medium Priority — Neighborhoods & Boundaries ("Love & Care")

See [NEIGHBORHOOD_AUDIT.md](NEIGHBORHOOD_AUDIT.md) for full analysis.

### Phase 1: Narrative Richness (2–3 hours)

#### Expand Narrative Callouts
- [x] **Add poverty rate callout** ✅ COMPLETE
  - File: `utils/aggregation.js` → `aggregateNeighborhood()` 
  - Trigger: >5% poverty increase between consecutive chart years (1990, 2000, 2010, 2020, 2023)
  - Format: `{ type: "poverty_increase", text: "Poverty rose from 12.5% to 18.2% between 2010 and 2020..." }`
  - Test: Run on 5 neighborhoods, verify callouts appear in RegionDetailPanel

- [x] **Add income decline callout** ✅ COMPLETE
  - Trigger: >10% decline in median household income between chart years
  - Format: `{ type: "income_decline", text: "Median income fell from $45k to $38k..." }`
  - Adjust for inflation (use `adjustForInflation()` from existing code)
  - Test: Spot-check downtown & outlying neighborhoods

- [ ] **Add business anchor loss callout** ⏸️ DEFERRED
  - Note: Requires historical business data (current data is static snapshot)
  - Can revisit if business timeline data becomes available
  - Alternative: Flag neighborhoods with critically low anchor density (<40%)

- [x] **Add rent burden callout** ✅ COMPLETE
  - Trigger: >5% increase in rent-burden percentage between chart years
  - Format: `{ type: "rent_burden", text: "Rent burden increased from 28% to 35%..." }`
  - Test: Verify on high-cost neighborhoods (downtown, central)

- [x] **Deduplicate & prioritize callouts** ✅ COMPLETE
  - Priority order: income_decline > poverty_increase > home_value > rent_burden > pop_loss
  - Deduplication: max 1 callout per type, sorted by priority
  - Code location: `aggregateNeighborhood()` → deduplicatedCallouts Map + sort
  - Returns deduplicated array in priority order

#### Tract Context Card
- [x] **Add composition card to RegionDetailPanel Demographics tab** ✅ COMPLETE
  - Location: After demoChartData chart, before narrative callouts
  - Shows: DVI distribution of tracts (e.g., "3 tracts 50–70 (high), 2 tracts 10–25 (low)")
  - Implementation: Inline IIFE in RegionDetailPanel.jsx that computes high/medium/low tract counts
  - File: `components/RegionDetailPanel.jsx`
  - Status: Renders only in neighborhood mode, counts are accurate per `interpolateDvi(tid, year)`

- [ ] **Add tract data availability badge** ⏸️ DEFER TO PHASE 2
  - Show % of neighborhood's tracts with 2000 data, 1990 data
  - Example: "1990 data available for 2/5 tracts (40%)"
  - File: `utils/aggregation.js` → add `dataAvailability` object to return value
  - Note: Better suited for Phase 2 with tract-level data gap audit

---

### Phase 2: Visual Tract-Level Insights (1 week)

#### Tract Sparklines (DVI Trends)
- [x] **Create TractSparkline component** ✅ COMPLETE (2026-08-30)
  - File: `components/TractSparkline.jsx` — 72×20px inline SVG (no library, zero deps)
  - DVI trend 2000–2023 from actual `AUDITED_DVI_LOOKUP` data points only — no
    interpolation past data edges, so missing history shows honestly as fewer dots
  - Fixed axes (x: 2000–2023, y: 0–100) so all sparklines in a list are comparable
  - Line + dots colored by tract's latest DVI band; native tooltip lists per-year values
  - Scope note: population trend dropped from the 20px chart (clutter); per-year DVI
    values are in the hover tooltip instead

- [x] **Integrate sparklines into tract list** ✅ COMPLETE
  - `RegionDetailPanel.jsx` → "Contributing census tracts" rows: name · sparkline · DVI badge
  - Plain SVG → negligible render cost for ≤5 tracts per neighborhood

#### Boundary History Toggle (2010 vs 2020)
- [ ] **Add tract lifecycle metadata to regionIndex.js**
  - New fields per tract: `created_in_year` (e.g., 2000, 2010, 2020)
  - Source: Census Bureau tract redefinition docs (available; check census_variable_discovery.json)
  - File: `data/regionIndex.js` → add field to existing entries
  - Script to help: Parse decennial tract crosswalks to infer creation years
  - Acceptance: All 269 tracts have `created_in_year` field

- [ ] **Add "Show 2010 Boundaries" toggle to MapView**
  - Location: `components/MapView.jsx` → overlay toolbar (near "Census Tracts / Neighborhoods")
  - When checked: Overlay dashed-line version of 2010 tract boundaries
  - Highlight newly created tracts (2010→2020) in light red
  - Show tooltip on hover: "Tract 245 created in 2010→2020 redistricting"
  - File: `hooks/useAustinMap.js` → add 7th overlay layer `historicalBoundaryLayer`
  - Data: Can use existing `final_updated_regions.js` + infer 2010 subset
  - Acceptance: Toggle works, historical boundaries visible, no performance hit

#### Data Gap Audit Card
- [x] **Add data-availability roll-up to aggregateNeighborhood()** ✅ COMPLETE (2026-08-30)
  - `utils/aggregation.js` → returns `dataAvailability`: per-year (2000/2010/2020)
    count of tracts with demo data vs total tracts
  - Simpler than the planned audit-confidence % — coverage counts are directly
    verifiable against DEMO_BY_RY; confidence roll-up deferred (see below)

- [x] **Surface coverage in Contributing Tracts section** ✅ COMPLETE
  - Full coverage → green "✓ Full census coverage" note
  - Gaps → amber banner: "Historical data gaps: 2000: 3/5 tracts · 2010: 4/5 tracts …"
    with explanation (tracts created after 2010 in redistricting)

- [ ] **Audit confidence roll-up (high/medium/low %)** — DEFERRED
  - `audit_confidence` is inconsistently shaped in phase1 JSONs (string on some rows,
    per-field object on others) — needs normalization in auditedData.js first

---

### Phase 3: Advanced Analysis (Post-launch)

#### DVI Decomposition Modal
- [ ] **Create DviBreakdownModal component**
  - Shows 3-part breakdown: Demographic 35%, Market 35%, Socioeconomic 30%
  - Stacked bar chart for current year
  - Dual-axis line chart: each sub-index over time (1990–2023)
  - Callout: "Market Pressure grew fastest (+18 pts, 2010→2023)"
  - File: New `components/DviBreakdownModal.jsx`
  - Open from: RegionDetailPanel → "Economics" tab → "DVI Score" card → "Breakdown" link
  - Acceptance: Math verified (3 sub-scores sum to DVI), trends correct

#### Neighborhood Comparison View
- [ ] **Create NeighborhoodComparisonView component**
  - Layout: Two dropdowns (select neighborhood A & B) + dual stacked area charts
  - Metrics: Demographics over time (1990–2023)
  - Card row: Side-by-side metric comparison (income, home value, DVI, anchor density)
  - File: New `components/NeighborhoodComparisonView.jsx`
  - Integrate into main view routing: Add "Compare" view option to Header
  - Acceptance: Charts render correctly, data matches single-neighborhood view

#### Composition Stability Score
- [ ] **Compute tract composition churn 2010→2023**
  - Method: Simulate 2020 DVI using only tracts that existed in 2010; compare to actual 2020 DVI
  - Metric: `stabilityScore = (1 - abs(simulated - actual) / actual) * 100` (0–100 scale)
  - Interpretation: 90+ = stable, 70–89 = moderate churn, <70 = high turnover
  - File: `utils/aggregation.js` → add `stabilityScore()` function, call in `aggregateNeighborhood()`
  - Acceptance: Score aligns with neighborhoods known to have boundary changes

---

### Boundary Housekeeping (Separate Track)

#### Mark Single-Tract Orphans
- [ ] **Add flag to neighborhoods.js**
  - New field: `is_orphan: true/false` (true if created by contiguity enforcement, single tract)
  - File: `scripts/build_neighborhoods.cjs` → output this field
  - UI indicator: Show " ◆ (single tract)" label in RegionDetailPanel header
  - Acceptance: All 64 orphan neighborhoods flagged

#### Region Naming Audit (117 Tracts)
- [ ] See existing task in "Region Naming & UX" section above
- [ ] Cross-reference [agent-todo-list.md](agent-todo-list.md#region-name-audit-~117-tracts)

#### Tract Lifecycle Metadata
- [ ] **Document tract creation/split history**
  - Parse Census Bureau tract redefinition files (2000→2010, 2010→2020)
  - Add fields: `created_in_year`, `split_from_id`, `merged_into_id`
  - File: `data/regionIndex.js` or new `data/tractLifecycle.js`
  - Acceptance: All splits/merges documented, correlates with data gaps

---

## 🟡 Low Priority — Data Completeness

### Age 65+ Population Field
- [ ] **Compute from Census API**
  - Sum age bracket variables (B01001_020E through B01001_024E for males, B01001_044E–B01001_048E for females)
  - Add to demographics backfill scripts

### Uninsured Population
- [ ] **Integrate health insurance variables**
  - Variables: B27010 (ACS 2012+), B27001 (simpler)
  - Add to `fetch_census_data.cjs` queries
  - Integrate into interim data modules

---

## 📊 Post-Data Work

### After Eviction Data Merged
1. Run full test suite
2. Check bundle size impact
3. Update `DATA_INTEGRITY_FINDINGS.md` with new coverage %
4. Update `ISSUES.md` roadmap to mark eviction as complete
5. Tag release (e.g., v0.1.0 — "Eviction data integration")

---

## 🔗 Related Documentation

- [ISSUES.md](public/ISSUES.md) — Full roadmap with completed work
- [ARCHITECTURE.md](ARCHITECTURE.md) — Data flow & file dependencies
- [NEIGHBORHOOD_AUDIT.md](NEIGHBORHOOD_AUDIT.md) — Detailed analysis of neighborhood generation, UX gaps, and improvement roadmap
- [data/census_variable_discovery.json](data/census_variable_discovery.json) — Census API compatibility matrix
- [scripts/merge_permits_and_evictions.py](scripts/merge_permits_and_evictions.py) — Eviction merge tool (ready to run)

---

## 💡 Notes

- **Eviction data is critical** for DVI accuracy; currently all-null rows reduce socioeconomic stress score to only poverty + unemployment
- **SNAP data is ✅ complete** — no action needed
- **Region naming** is primarily UX/discoverability; doesn't affect data integrity
- **Bundle size** (~8.4 MB) can wait unless deployment bandwidth is constrained
