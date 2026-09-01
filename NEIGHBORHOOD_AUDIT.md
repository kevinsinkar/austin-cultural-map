# Neighborhood & Boundaries Audit

> Analysis of the current neighborhood generation system, data aggregation, and UX for temporal analysis
> 
> **Date:** 2026-08-30 | **Status:** Ready for refinement

---

## Executive Summary

The neighborhood system is **architecturally sound** with solid data foundations but lacks nuance in temporal storytelling. The current implementation:

✅ **What Works**
- Clean centroid-assignment model (one tract → one neighborhood, no double-counting)
- Population-weighted aggregation for rates/percentages
- Automatic ingestion of City of Austin NPA boundaries
- Contiguity enforcement prevents spatially disconnected groupings
- Accurate GeoJSON rendering with proper styling

⚠️ **Needs Love & Care**
- Narrative callouts too sparse (only >25% Black population loss and >100% home value appreciation)
- No temporal boundary changes visualization (tracts created/split over time are invisible)
- Missing tract-level breakdowns in neighborhood mode (users can't see which specific tracts drove the neighborhood's change)
- No "composition shift" metrics (what % of neighborhood's DVI change came from tract-level vs demographic shifts?)
- Limited UX for understanding intra-neighborhood heterogeneity (a 5-tract neighborhood could have 3 high-DVI + 2 low-DVI tracts)

---

## 1. Neighborhood Generation Pipeline

### Current Architecture

**Input**: City of Austin Neighborhood Planning Areas (NPA) boundaries from data.austintexas.gov
**Process**: `scripts/build_neighborhoods.cjs`
1. Fetch NPA GeoJSON via API (with fallback to cached local file)
2. Assign each tract to exactly one neighborhood via centroid-in-polygon
3. Build tract→neighborhood lookup tables
4. Generate `NEIGHBORHOODS` array + `NEIGHBORHOODS_GEOJSON` for Leaflet

**Output**: 
- `data/neighborhoods.js` — 137 neighborhoods with metadata, tract lists, centroids
- `data/neighborhoods_geojson.js` — merged polygon GeoJSON (only for Leaflet rendering)

### Key Design Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| **Centroid assignment** | One tract per neighborhood, no fractional allocation | ✅ Simple aggregation; ❌ loses edge cases (tracts straddling boundaries) |
| **NPA-first mapping** | Prefer City of Austin official boundaries | ✅ Authoritative; ❌ 117 tracts outside NPA coverage map to synthetic "suburbs" |
| **Contiguity enforcement** | Eject orphan tracts >2–3km from neighbors | ✅ Prevents spatial nonsense; ❌ creates one-tract neighborhoods, not ideal for aggregation |
| **GeoJSON merged** | Union all tracts' polygons into one neighborhood polygon | ✅ Leaflet-friendly; ❌ neighborhood boundary is synthetic, not authoritative |

### Data Coverage

```
Total tracts:          269
In City of Austin NPA: 152  (~56%)
Synthetic/suburban:    117  (~44%)

Neighborhood count:    137
  - From NPA:         ~73
  - Synthetic (1-3 tracts): ~64
```

**Issue**: Single-tract neighborhoods (orphans) aren't true neighborhoods—they're artifacts. The UI shows them identically to multi-tract areas.

---

## 2. Current Data Aggregation (utils/aggregation.js)

### What aggregateNeighborhood() Computes

```javascript
aggregateNeighborhood(neighborhoodId, year) → {
  id, name, tract_ids, tractCount,
  aggDvi,                           // population-weighted DVI
  demoChartData,                    // [1990, 2000, 2010, 2020, 2023]
  narrativeCallouts,                // [{ type, text }, ...]
  propertyNow, propertyPrev,        // median home value, rent
  socioNow, socioPrev,              // median income, poverty
  bizOpen, bizClosed,               // legacy business counts
  anchorDensity,                    // surviving / (surviving + closed)
  paItems,                          // nearby Preservation Austin grants
  tippingPoints                     // concatenated narratives
}
```

### Aggregation Methods

| Field | Method | Quality |
|-------|--------|---------|
| **DVI** | Pop-weighted average | ✅ Good |
| **Demographics** (race, rent burden) | Pop-weighted average across tracts | ✅ Good |
| **Property** | Pop-weighted median per neighborhood | ✅ Good |
| **Socioeconomic** | Pop-weighted median per neighborhood | ✅ Good |
| **Narrative callouts** | Auto-detected from CHART_YEARS (1990, 2000, 2010, 2020, 2023) | ⚠️ Limited—only 2 types |

### Narrative Callouts (Only 2 Types)

**Type 1: Pop Loss** (>25% Black population decline between consecutive chart years)
- Triggers for only dramatic demographic losses
- Misses subtle displacement (10–20% decline)
- Doesn't detect Hispanic population loss, gentrification influx

**Type 2: Home Value Appreciation** (>100% between 2000/2010, 2010/2020, 2020/2023)
- Only fires for neighborhoods that more than doubled home value
- Misses moderate appreciation (50–100%) that still indicates displacement pressure

**Missing**: No callouts for:
- Poverty rate increases
- Income decline
- Eviction filing rate spikes (once data is populated)
- Commercial displacement (commercial sqft losses)
- Business anchor loss (surviving → closed conversion)

---

## 3. UI/UX for Temporal Analysis

### Current State: RegionDetailPanel

**Demographics Tab**
- Stacked area chart (1990–2025 range, `connectNulls={false}`)
- Race/ethnicity percentages with `|` line separators
- Narrative callouts (sparse, as noted above)

**Economics Tab**
- 4 metric cards: home value, rent, income, poverty
- Nominal + 2023-adjusted values
- Comparison arrows (vs prior census year)
- Data year mismatch warning (e.g., "Showing 2020 data, no 2023 available")

**Culture Tab**
- Tipping point narratives
- Business counts (operating / closed)
- Preservation Austin items (proximity-matched)
- PA sub-tabs for grant types

**Neighborhood Mode** (when `boundaryMode === "neighborhoods"`)
- Header shows `[N tracts]` label
- Demographics chart aggregated
- Collapsible "Contributing census tracts" details panel
  - Lists all tract IDs with DVI color codes
  - Explains pop-weighted aggregation method
  - Advises switching to Census Tracts for precision

### UX Gaps for Temporal Story

| Gap | Impact | Example |
|-----|--------|---------|
| **No intra-neighborhood variance** | Users can't see if 1 tract drove the neighborhood's change | Neighborhood's DVI rose from 45→62: was it all 1 tract, or distributed? |
| **Tract composition not shown by year** | Users can't track which tracts existed in 2010 vs 2020 | If neighborhood added 3 new tracts, did DVI actually worsen or did new areas skew it? |
| **No "decomposition" of change** | Can't separate tract-level evolution from population shifts | Did DVI rise because tracts got worse, or because low-DVI people moved out? |
| **Callouts don't guide narrative** | Only dramatic changes trigger notes; subtle patterns invisible | 3 consecutive census years of 15% income decline = bad, but no callout |
| **Boundary changes invisible** | NPA annexations, tract splits (2010→2020) not surfaced | User doesn't know if neighborhood's data gap is real or artifact |

---

## 4. Improvements: "Love & Care" Roadmap

### 🟢 Quick Wins (1–2 hours each)

#### A. Expand Narrative Callouts
- [ ] Add **poverty rate callout**: >5% increase between any 2 chart years
- [ ] Add **income decline callout**: >10% decrease between chart years
- [ ] Add **business loss callout**: >50% anchor density loss (more closed than operating)
- [ ] Add **rent burden callout**: >5% increase in rent-burden percentage
- [ ] Deduplicate callouts (don't show 3 callouts for same event)

**File**: `utils/aggregation.js` → `aggregateNeighborhood()`, expand `narrativeCallouts` loop (~20 lines new code)

#### B. Tract Context Card in Neighborhood Mode
When viewing neighborhood, add a small stats card showing:
- "Composition": e.g., "3 high-DVI (50–70) + 2 low-DVI (10–25)"
- "Added after 2010": e.g., "Tracts 234, 245 (2010→2020 split)"
- "Data coverage": e.g., "1990 data for 2/5 tracts (40%)"

**File**: `components/RegionDetailPanel.jsx` → add card after demoChartData, before narrative callouts (~40 lines)

#### C. Hover Tooltip on Tract List
In the collapsible "Contributing census tracts" section, add hover tooltips showing:
- Tract's demographic profile
- Whether it existed in 2010 vs 2000
- How much it contributed to neighborhood's pop-weighted DVI

**File**: `components/RegionDetailPanel.jsx` → map over `tract_ids`, add `<span title={...}>` (~15 lines)

---

### 🟡 Medium Effort (3–5 hours each)

#### D. Tract Timeline Sparklines
For each tract in the collapsible list, add a tiny sparkline (10px tall) showing:
- DVI trend 1990→2023 (red/orange line)
- Population trend (gray area)
- Hover shows exact values per year

**Tech**: Use `<svg>` inline or Recharts `<LineChart>` at 80px width
**File**: New component `TractSparklines.jsx`, imported into RegionDetailPanel

#### E. DVI Decomposition Modal
Add button "Why did DVI change?" that opens a modal showing:
- Stacked bar: "35% demographic, 35% market, 30% socioeconomic"
- Line chart: each sub-index over time
- Callout: which sub-index drove the change most

**Tech**: Recharts `<BarChart>` stacked + `<LineChart>` overlaid
**File**: New component `DviBreakdownModal.jsx`, imported into RegionDetailPanel

#### F. Boundary History Toggle
"Show 2010 vs 2020 boundaries" toggle on the map that:
- Overlays 2010 tract boundaries (dashed lines)
- Highlights tracts created/split between 2010 and 2020
- Tooltip: "Tract 245 created in 2010→2020 redistricting"

**Data needed**: Add `created_in_year` field to tract metadata (can infer from REGION_INDEX)
**File**: `useAustinMap.js` → add new overlay layer, `MapView.jsx` → add toggle

---

### 🔴 Higher Effort (1–2 days each)

#### G. Neighborhood-Level Data Gap Audit
Show in neighborhood detail panel:
- % of tracts with 2000 data (e.g., "2/5 tracts have 1990 data")
- Audit confidence score (high/medium/low based on data availability)
- Note: "This neighborhood's 1990 DVI estimate covers ~40% of current population"

**Data source**: Add `audit_confidence` roll-up to `aggregateNeighborhood()`
**File**: `utils/aggregation.js` → add confidence scoring

#### H. Compare Two Neighborhoods Across Time
New view (3rd tab: "Compare Neighborhoods") allowing side-by-side comparison:
- Two neighborhood selectors (dropdowns)
- Dual stacked area charts (demographics over time)
- Side-by-side metric cards
- Relative DVI trajectory (neighborhood A vs B)

**Tech**: Similar to existing `ComparisonView.jsx` but for neighborhoods
**File**: New component `NeighborhoodComparisonView.jsx`

#### I. Neighborhood Composition Stability Score
Metric (0–100) showing how much a neighborhood's composition changed 2010→2023:
- Accounts for tract adds/removes
- Adjusts DVI for composition churn
- Displayed as "Composition Stability" badge

**Method**: Simulate 2020 DVI using only 2010-vintage tracts; compare to actual
**File**: `utils/aggregation.js` → add `stabilityScore()` function

---

## 5. Specific Boundary Issues to Address

### Issue 1: Single-Tract Neighborhoods
**Current**: 64 neighborhoods are single tracts (orphans ejected during contiguity enforcement)
**Problem**: Aggregation functions don't add value; UI treats them same as multi-tract areas
**Options**:
- Option A: Merge adjacent single-tract neighborhoods into "clusters" (e.g., "Southeast Sprawl")
- Option B: Raise contiguity threshold (currently 2–3km) to allow loose groupings
- Option C: Surface in UI that this is a "tract" not a "neighborhood" (visual distinction)

**Recommendation**: Option C + modify `build_neighborhoods.cjs` to mark source origin in metadata

### Issue 2: NPA Coverage Gaps (~117 tracts outside official NPA)
**Current**: Assigned to synthetic "suburban-community" neighborhoods based on geographic clustering
**Problem**: Clusters are auto-generated and not validated against real community identity
**Options**:
- Option A: Manual audit + rename (already partially done in agent-todo-list.md)
- Option B: Fetch supplemental boundaries (e.g., City of Austin annexation maps, developer community names)
- Option C: Leave as "Tract XXX" with geographic clusters for context only

**Recommendation**: Complete Option A (manual audit); escalate to Preservation Austin for community input

### Issue 3: Tract Boundary Changes (2010 → 2020)
**Current**: Hidden — tracts created/split between decades not surfaced in UI
**Problem**: Users see 2010 DVI vs 2023 DVI without knowing if tracts are comparable
**Options**:
- Add `tract_lifecycle` metadata (created_year, split_from_id, merged_into_id)
- Visualize on map (overlay historical boundaries as dashed lines)
- Annotate charts ("This tract didn't exist in 2010 data")

**Recommendation**: Add metadata + map overlay (medium effort, high impact)

---

## 6. Recommended Priority Sequence

### Phase 1: Quick Wins (Next 2–3 hours)
1. **A. Expand narrative callouts** — Biggest bang for buck, immediately richer storytelling
2. **B. Tract context card** — Gives users transparency into aggregation

### Phase 2: Medium Interactivity (Next 1 week)
3. **D. Tract sparklines** — Visual at-a-glance tract health
4. **F. Boundary history toggle** — Context for 2010 vs 2020 discontinuities
5. **G. Data gap audit** — Trust & transparency

### Phase 3: Advanced Analysis (Post-launch)
6. **E. DVI decomposition modal** — For power users
7. **H. Neighborhood comparison** — Comparative analysis
8. **I. Composition stability score** — Analytical rigor

### Separate: Boundary Housekeeping
- Complete **Issue 2** (region naming audit, already in agent-todo-list.md)
- Address **Issue 1** (single-tract classification)
- Implement **Issue 3** (tract lifecycle metadata)

---

## 7. Data Schema Enhancements

To support the above improvements, consider adding fields:

### neighborhoods.js
```javascript
{
  id: "downtown",
  name: "Downtown",
  tract_ids: [1, 2, 3],
  source: "City of Austin NPA",  // existing
  source_confidence: "high",      // NEW: "high" (NPA), "medium" (synthetic), "low" (manual)
  created_year: 2010,             // NEW: when this neighborhood was defined
  previous_id: null,              // NEW: if merged from prior neighborhood
  single_tract: false,            // NEW: flag for orphans
  audit_confidence: "high",       // NEW: data coverage across tracts
  centroid: [30.26, -97.74],      // existing
}
```

### regionIndex.js (tracts)
```javascript
{
  region_id: 1,
  region_name: "Tract 1.00",
  created_in_year: 2000,          // NEW: when tract was created (Decennial)
  split_from: null,               // NEW: if this was a split from another tract
  merged_into: null,              // existing (for region merging)
  ...
}
```

---

## 8. Testing & Validation Checklist

After implementing improvements:

- [ ] Narrative callouts fire correctly (manual test 5 neighborhoods)
- [ ] Tract sparklines render without performance hit (check DevTools)
- [ ] Data gap audit shows correct coverage % (verify against phase1_output JSONs)
- [ ] Boundary history toggle works (visual inspection 2010 vs 2020 overlays)
- [ ] DVI decomposition modal math verified (spot-check 3 neighborhoods)
- [ ] Neighborhood comparison charts match tract-level precision
- [ ] No console errors or missing fields
- [ ] Mobile responsive (tracts list collapsible on small screens)

---

## Summary: What Needs Love

1. **Narrative richness** — Expand callouts to catch subtle patterns (easy)
2. **Tract transparency** — Show which tracts are driving neighborhood changes (medium)
3. **Temporal context** — Surface boundary changes, data gaps, composition shifts (medium–hard)
4. **Advanced analysis** — DVI decomposition, stability scoring for power users (hard)
5. **Boundary housekeeping** — Mark single-tract neighborhoods, finalize naming, track splits (ongoing)

The foundation is solid. These improvements transform it from "working" to "insightful."
