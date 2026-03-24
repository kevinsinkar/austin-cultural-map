## Task: Ensure neighborhood mode produces the same detail panel as tract mode

### Problem

RegionDetailPanel.jsx renders three tabs (Demographics, Economics, Culture)
using seven specific data shapes computed from tract-level data. When the
user switches to Neighborhoods mode and clicks a neighborhood, the panel
must show the same tabs with the same metrics — but aggregated from all
constituent tracts. Currently the aggregation function doesn't produce
the full set of props the panel expects.

### Current data flow (tract mode)

When `activeRegionId` changes, these computations run:

**In index.jsx (passed as props through MapView to RegionDetailPanel):**
```
regionBizOpen    = LEGACY_OPERATING.filter(b => b.region_id === activeRegionId)
regionBizClosed  = LEGACY_CLOSED.filter(b => b.region_id === activeRegionId)
tippingPoint     = TIPPING_POINTS.find(t => t.region === activeRegionName)
narrativeCallouts = [computed from DEMOGRAPHICS + SOCIOECONOMIC arrays]
currentDvi       = { [displayName]: interpolateDvi(regionId, year) }
```

**In MapView.jsx (passed as props to RegionDetailPanel):**
```
demoChartData  = toDemoChartData(activeRegionId)
   → array of { year, White, Black, Hispanic, Asian, Other, total, rent_burden_pct }

propertyNow    = closestRow(AUDITED_PROP_BY_ID.get(regionId), year)
   → { year, median_home_value, median_rent_monthly, pct_home_value_change_yoy,
       vacancy_rate, new_construction_permits, total_housing_units, ... }

propertyPrev   = priorRow(AUDITED_PROP_BY_ID.get(regionId), year)
   → same shape, earlier year

socioNow       = closestRow(AUDITED_SOCIO_BY_ID.get(regionId), year)
   → { year, median_household_income, poverty_rate, unemployment_rate,
       gini_coefficient, eviction_filing_rate, snap_participation_rate, ... }

socioPrev      = priorRow(AUDITED_SOCIO_BY_ID.get(regionId), year)
   → same shape, earlier year
```

**Computed inline in RegionDetailPanel.jsx:**
```
density        = calcAnchorDensity(activeFeature.properties.region_id)
anchorBadge    = getAnchorBadge(density)
PA items       = PA_ALL.filter(proximity to region centroid < 0.012 degrees)
```

### What to build

Update `utils/aggregation.js` so that `aggregateNeighborhood(neighborhoodId, year)`
returns an object that can be used AS-IS by RegionDetailPanel — same field
names, same data shapes. The panel shouldn't need to know whether it's
rendering tract data or neighborhood data.

### Required output shape

```javascript
aggregateNeighborhood(neighborhoodId, year) → {
  // Identity
  id: "east-cesar-chavez",
  name: "East Cesar Chavez",
  tract_ids: [12, 13, 14],
  tractCount: 3,

  // DVI
  aggDvi: 52.3,                // population-weighted average

  // ── Demographics tab ──

  demoChartData: [             // same shape as toDemoChartData()
    { year: 1990, White: 0.32, Black: 0.18, Hispanic: 0.45,
      Asian: 0.02, Other: 0.03, total: 14200, rent_burden_pct: 38.2 },
    { year: 2000, ... },
    { year: 2010, ... },
    { year: 2020, ... },
    { year: 2023, ... },
  ],

  narrativeCallouts: [         // same shape as index.jsx computes
    { type: "pop_loss", text: "East Cesar Chavez lost 34% of its..." },
    { type: "home_value", text: "Median home values rose 210%..." },
  ],

  // ── Economics tab ──

  propertyNow: {               // same shape as closestRow() returns
    year: 2023,
    median_home_value: 485000, // pop-weighted average across tracts
    median_rent_monthly: 1650, // pop-weighted average
    region_id: null,           // not applicable for neighborhood
  },

  propertyPrev: {              // same shape, earlier year
    year: 2018,
    median_home_value: 295000,
    median_rent_monthly: 1180,
    region_id: null,
  },

  socioNow: {
    year: 2023,
    median_household_income: 52000,
    poverty_rate: 22.1,
    unemployment_rate: 6.2,
    region_id: null,
  },

  socioPrev: {
    year: 2018,
    median_household_income: 41000,
    poverty_rate: 25.8,
    unemployment_rate: 7.1,
    region_id: null,
  },

  rentBurdenNow: 42.5,        // pop-weighted avg of rent_burden_pct

  // ── Culture tab ──

  bizOpen: [...],              // union of LEGACY_OPERATING across all tract_ids
  bizClosed: [...],            // union of LEGACY_CLOSED across all tract_ids
  paItems: [...],              // union of PA_ALL near any constituent tract centroid
  tippingPoints: [...],        // all TIPPING_POINTS matching any constituent tract name

  // ── Anchor badge ──
  anchorDensity: 0.55,         // combined: total surviving / (surviving + closed)
}
```

### Implementation: aggregateNeighborhood()

Update `utils/aggregation.js` with the complete function:

```javascript
import _ from "lodash";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import {
  AUDITED_DEMO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID,
  DEMO_BY_RY, PROP_BY_RY, SOCIO_BY_RY,
  closestRow, priorRow,
} from "../data/auditedData";
import {
  REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL, TIPPING_POINTS,
} from "../data";
import { ID_TO_NAME } from "../data/regionLookup";
import { interpolateDvi } from "./math";

// Chart years matching toDemoChartData() output
const CHART_YEARS = [1990, 2000, 2010, 2020, 2023];

/**
 * Aggregate all panel data for a neighborhood at a given year.
 * Returns the same data shapes that RegionDetailPanel expects,
 * so the panel can render without knowing whether it's showing
 * a single tract or an aggregated neighborhood.
 */
export function aggregateNeighborhood(neighborhoodId, year) {
  const hood = NEIGHBORHOOD_BY_ID.get(neighborhoodId);
  if (!hood) return null;
  const { tract_ids } = hood;

  // ═══ HELPERS ═══

  // Get population for a tract at a year (for weighting)
  function tractPop(tid, yr) {
    const d = DEMO_BY_RY.get(`${tid}_${yr}`);
    return d?.total_population ?? 0;
  }

  // Population-weighted average of a field across tracts for a given year
  function popWeightedAvg(tracts, yr, getRow, field) {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const tid of tracts) {
      const row = getRow(tid, yr);
      const pop = tractPop(tid, yr);
      const val = row?.[field];
      if (val != null && pop > 0) {
        weightedSum += val * pop;
        totalWeight += pop;
      }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  // Get closest property row for a tract
  function closestProp(tid, yr) {
    return closestRow(AUDITED_PROP_BY_ID.get(tid), yr);
  }

  // Get closest socio row for a tract
  function closestSocio(tid, yr) {
    return closestRow(AUDITED_SOCIO_BY_ID.get(tid), yr);
  }

  // Get prior property row for a tract
  function priorProp(tid, yr) {
    return priorRow(AUDITED_PROP_BY_ID.get(tid), yr);
  }

  // Get prior socio row for a tract
  function priorSocio(tid, yr) {
    return priorRow(AUDITED_SOCIO_BY_ID.get(tid), yr);
  }

  // Get demo row by region+year key
  function demoRow(tid, yr) {
    return DEMO_BY_RY.get(`${tid}_${yr}`);
  }

  // ═══ DVI ═══

  const dviEntries = tract_ids.map(tid => ({
    dvi: interpolateDvi(tid, year),
    pop: tractPop(tid, year),
  })).filter(e => e.dvi != null);
  const totalDviPop = _.sumBy(dviEntries, "pop");
  const aggDvi = totalDviPop > 0
    ? +(_.sumBy(dviEntries, e => e.dvi * e.pop) / totalDviPop).toFixed(1)
    : 0;

  // ═══ DEMOGRAPHICS TAB — demoChartData ═══

  const demoChartData = CHART_YEARS.map(yr => {
    const rows = tract_ids
      .map(tid => DEMO_BY_RY.get(`${tid}_${yr}`))
      .filter(Boolean);
    if (rows.length === 0) return null;

    const totalPop = _.sumBy(rows, "total_population");
    if (totalPop === 0) return null;

    // Population-weighted percentages (as 0–1 fractions for the chart)
    const wAvg = (field) => {
      const sum = _.sumBy(rows, r => (r[field] ?? 0) * (r.total_population ?? 0));
      return sum / totalPop / 100; // Convert from 0-100 pct to 0-1 fraction
    };

    const White = wAvg("pct_white_non_hispanic");
    const Black = wAvg("pct_black_non_hispanic");
    const Hispanic = wAvg("pct_hispanic");
    const Asian = wAvg("pct_asian");
    const Other = Math.max(0, 1 - White - Black - Hispanic - Asian);

    // Rent burden (population-weighted average, stays as percentage)
    const rbSum = _.sumBy(rows, r => (r.rent_burden_pct ?? 0) * (r.total_population ?? 0));
    const rent_burden_pct = rbSum / totalPop;

    return {
      year: yr,
      White, Black, Hispanic, Asian, Other,
      total: totalPop,
      // Absolute counts for narrative callouts
      popBlack: Math.round(totalPop * Black),
      popHispanic: Math.round(totalPop * Hispanic),
      popWhite: Math.round(totalPop * White),
      rent_burden_pct,
    };
  }).filter(Boolean);

  // ═══ DEMOGRAPHICS TAB — narrativeCallouts ═══

  const narrativeCallouts = [];
  for (let i = 1; i < demoChartData.length; i++) {
    const prev = demoChartData[i - 1];
    const curr = demoChartData[i];

    // Black population loss callout (>25% decline)
    if (prev.popBlack > 0) {
      const drop = (prev.popBlack - curr.popBlack) / prev.popBlack;
      if (drop > 0.25) {
        narrativeCallouts.push({
          type: "pop_loss",
          text: `${hood.name} lost ${(drop * 100).toFixed(0)}% of its Black population between ${prev.year} and ${curr.year} — a decline of ${(prev.popBlack - curr.popBlack).toLocaleString()} residents. ${curr.popBlack.toLocaleString()} remained.`,
        });
      }
    }
  }

  // Home value surge callout (>100% increase between periods)
  // Use aggregated property values across tracts per period
  for (const [yrA, yrB] of [[2000, 2010], [2010, 2020], [2020, 2023]]) {
    const hvA = popWeightedAvg(tract_ids, yrA, (tid, yr) => closestProp(tid, yr), "median_home_value");
    const hvB = popWeightedAvg(tract_ids, yrB, (tid, yr) => closestProp(tid, yr), "median_home_value");
    if (hvA > 0 && hvB > 0) {
      const inc = (hvB - hvA) / hvA;
      if (inc > 1) {
        narrativeCallouts.push({
          type: "home_value",
          text: `Median home values rose ${(inc * 100).toFixed(0)}%, from $${(hvA / 1000).toFixed(0)}k to $${(hvB / 1000).toFixed(0)}k, between ${yrA} and ${yrB}.`,
        });
      }
    }
  }

  // ═══ ECONOMICS TAB — propertyNow / propertyPrev ═══

  // Collect all closest-year property rows and weight them
  const propRows = tract_ids
    .map(tid => ({ tid, row: closestProp(tid, year) }))
    .filter(r => r.row);

  let propertyNow = null;
  if (propRows.length > 0) {
    // Use the most common "closest year" as the aggregate year
    const yearCounts = _.countBy(propRows, r => r.row.year);
    const aggPropYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];

    propertyNow = {
      year: aggPropYear,
      median_home_value: popWeightedAvg(tract_ids, aggPropYear, closestProp, "median_home_value"),
      median_rent_monthly: popWeightedAvg(tract_ids, aggPropYear, closestProp, "median_rent_monthly"),
      pct_home_value_change_yoy: popWeightedAvg(tract_ids, aggPropYear, closestProp, "pct_home_value_change_yoy"),
      region_id: null,
    };
  }

  const propPrevRows = tract_ids
    .map(tid => ({ tid, row: priorProp(tid, year) }))
    .filter(r => r.row);

  let propertyPrev = null;
  if (propPrevRows.length > 0) {
    const yearCounts = _.countBy(propPrevRows, r => r.row.year);
    const aggPropPrevYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];

    propertyPrev = {
      year: aggPropPrevYear,
      median_home_value: popWeightedAvg(tract_ids, aggPropPrevYear, closestProp, "median_home_value"),
      median_rent_monthly: popWeightedAvg(tract_ids, aggPropPrevYear, closestProp, "median_rent_monthly"),
      region_id: null,
    };
  }

  // ═══ ECONOMICS TAB — socioNow / socioPrev ═══

  const socioRows = tract_ids
    .map(tid => ({ tid, row: closestSocio(tid, year) }))
    .filter(r => r.row);

  let socioNow = null;
  if (socioRows.length > 0) {
    const yearCounts = _.countBy(socioRows, r => r.row.year);
    const aggSocioYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];

    socioNow = {
      year: aggSocioYear,
      median_household_income: popWeightedAvg(tract_ids, aggSocioYear, closestSocio, "median_household_income"),
      poverty_rate: popWeightedAvg(tract_ids, aggSocioYear, closestSocio, "poverty_rate"),
      unemployment_rate: popWeightedAvg(tract_ids, aggSocioYear, closestSocio, "unemployment_rate"),
      region_id: null,
    };
  }

  const socioPrevRows = tract_ids
    .map(tid => ({ tid, row: priorSocio(tid, year) }))
    .filter(r => r.row);

  let socioPrev = null;
  if (socioPrevRows.length > 0) {
    const yearCounts = _.countBy(socioPrevRows, r => r.row.year);
    const aggSocioPrevYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];

    socioPrev = {
      year: aggSocioPrevYear,
      median_household_income: popWeightedAvg(tract_ids, aggSocioPrevYear, closestSocio, "median_household_income"),
      poverty_rate: popWeightedAvg(tract_ids, aggSocioPrevYear, closestSocio, "poverty_rate"),
      region_id: null,
    };
  }

  // ═══ CULTURE TAB — businesses ═══

  const bizOpen = LEGACY_OPERATING.filter(b => tract_ids.includes(b.region_id));
  const bizClosed = LEGACY_CLOSED.filter(b => tract_ids.includes(b.region_id));

  // ═══ CULTURE TAB — anchor density (combined across all tracts) ═══

  const totalSurviving = bizOpen.length;
  const totalClosed = bizClosed.length;
  const anchorDensity = (totalSurviving + totalClosed) > 0
    ? totalSurviving / (totalSurviving + totalClosed)
    : null;

  // ═══ CULTURE TAB — Preservation Austin items ═══

  const paItems = PA_ALL.filter(item => {
    return tract_ids.some(tid => {
      const tract = REGION_INDEX.find(r => r.region_id === tid);
      if (!tract?.centroid) return false;
      const dlat = item.lat - tract.centroid[0];
      const dlng = item.lng - tract.centroid[1];
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
    });
  });

  // ═══ CULTURE TAB — tipping points ═══
  // Collect all tipping point narratives for constituent tract names

  const tippingPoints = tract_ids
    .map(tid => {
      const name = ID_TO_NAME.get(tid);
      return TIPPING_POINTS.find(t => t.region === name);
    })
    .filter(Boolean);

  // ═══ RETURN ═══

  return {
    id: hood.id,
    name: hood.name,
    tract_ids,
    tractCount: tract_ids.length,
    aggDvi,
    demoChartData,
    narrativeCallouts,
    propertyNow,
    propertyPrev,
    socioNow,
    socioPrev,
    bizOpen,
    bizClosed,
    anchorDensity,
    paItems,
    tippingPoints,
  };
}
```

### How this plugs into the existing component tree

The key insight: RegionDetailPanel doesn't need to change its rendering
logic. It just needs to receive the same prop shapes regardless of mode.
The switching happens in the PARENT components (index.jsx and MapView.jsx).

**In index.jsx**, add a parallel computation path:

```javascript
// Existing tract-mode computations (keep as-is)
const regionBizOpen = useMemo(
  () => activeRegionId ? LEGACY_OPERATING.filter(b => b.region_id === activeRegionId) : [],
  [activeRegionId]
);
// ... etc

// NEW: neighborhood-mode aggregation
const neighborhoodAgg = useMemo(() => {
  if (boundaryMode !== "neighborhoods" || !activeNeighborhoodId) return null;
  return aggregateNeighborhood(activeNeighborhoodId, year);
}, [boundaryMode, activeNeighborhoodId, year]);
```

**In MapView.jsx**, pass the correct data to RegionDetailPanel based on mode:

```jsx
<RegionDetailPanel
  // Identity — changes per mode
  activeFeature={boundaryMode === "tracts" ? activeFeature : null}
  activeRegionName={boundaryMode === "tracts"
    ? activeDisplayName
    : neighborhoodAgg?.name}

  // Mode flag
  boundaryMode={boundaryMode}
  neighborhoodAgg={neighborhoodAgg}

  // Data — switch source per mode
  year={year}
  currentDvi={currentDvi}
  regionBizOpen={boundaryMode === "tracts" ? regionBizOpen : neighborhoodAgg?.bizOpen ?? []}
  regionBizClosed={boundaryMode === "tracts" ? regionBizClosed : neighborhoodAgg?.bizClosed ?? []}
  demoChartData={boundaryMode === "tracts" ? demoChartData : neighborhoodAgg?.demoChartData ?? []}
  propertyNow={boundaryMode === "tracts" ? propertyNow : neighborhoodAgg?.propertyNow}
  propertyPrev={boundaryMode === "tracts" ? propertyPrev : neighborhoodAgg?.propertyPrev}
  socioNow={boundaryMode === "tracts" ? socioNow : neighborhoodAgg?.socioNow}
  socioPrev={boundaryMode === "tracts" ? socioPrev : neighborhoodAgg?.socioPrev}
  tippingPoint={boundaryMode === "tracts"
    ? tippingPoint
    : neighborhoodAgg?.tippingPoints?.[0] ?? null}
  narrativeCallouts={boundaryMode === "tracts"
    ? narrativeCallouts
    : neighborhoodAgg?.narrativeCallouts ?? []}

  // These stay the same in both modes
  selectedBiz={selectedBiz}
  setSelectedBiz={setSelectedBiz}
  bizTab={bizTab}
  setBizTab={setBizTab}
  panelTab={panelTab}
  setPanelTab={setPanelTab}
  selectedPA={selectedPA}
  setSelectedPA={setSelectedPA}
  setSelectedRegion={setSelectedRegion}
  setHoveredRegion={setHoveredRegion}
/>
```

### What changes inside RegionDetailPanel.jsx (minimal)

The panel receives the same prop names regardless of mode, so most of the
rendering code stays unchanged. The only modifications needed:

**1. Header — show neighborhood name + tract count instead of region ID:**

```jsx
// Replace the existing header:
{boundaryMode === "neighborhoods" && neighborhoodAgg ? (
  <h2 style={{ /* same styles */ }}>
    {neighborhoodAgg.name}
    <span style={{ fontSize: 12, fontWeight: 400, color: "#a8a49c" }}>
      {" "}[{neighborhoodAgg.tractCount} tracts]
    </span>
  </h2>
) : (
  // Existing tract header with region_id
  <h2 style={{ /* same styles */ }}>
    {activeRegionName}
    <span style={{ fontSize: 12, fontWeight: 400, color: "#a8a49c" }}>
      {" "}[id. {activeFeature.properties.region_id}]
    </span>
  </h2>
)}
```

**2. DVI badge — use aggregated DVI for neighborhoods:**

```jsx
const d = boundaryMode === "neighborhoods" && neighborhoodAgg
  ? neighborhoodAgg.aggDvi
  : (currentDvi[activeRegionName] || 0);
```

**3. Anchor density — use aggregated density for neighborhoods:**

```jsx
const density = boundaryMode === "neighborhoods" && neighborhoodAgg
  ? neighborhoodAgg.anchorDensity
  : calcAnchorDensity(activeFeature?.properties?.region_id);
```

**4. Empty state — show correct prompt per mode:**

```jsx
if (boundaryMode === "neighborhoods" ? !neighborhoodAgg : !activeFeature) {
  return (
    <div className="detail-panel" ...>
      <div style={{ /* same empty state styles */ }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🗺️</div>
        <div style={{ /* same title styles */ }}>
          {boundaryMode === "neighborhoods"
            ? "Select a neighborhood"
            : "Select a neighborhood"}
        </div>
        <div style={{ /* same subtitle styles */ }}>
          {boundaryMode === "neighborhoods"
            ? "Click any neighborhood on the map to explore its aggregated demographic history, displacement metrics, and cultural story."
            : "Click any region on the map to explore its demographic history, displacement metrics, and cultural story."}
        </div>
      </div>
    </div>
  );
}
```

**5. Contributing tracts (NEW — add at the bottom of the panel, after Culture tab):**

```jsx
{boundaryMode === "neighborhoods" && neighborhoodAgg && (
  <details style={{ marginTop: 12, background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 16px" }}>
    <summary style={{ fontSize: 12, color: "#7c6f5e", cursor: "pointer", fontWeight: 500 }}>
      Contributing census tracts ({neighborhoodAgg.tractCount})
    </summary>
    <div style={{ marginTop: 8 }}>
      {neighborhoodAgg.tract_ids.map(tid => {
        const tractDvi = interpolateDvi(tid, year);
        const tractName = ID_TO_NAME.get(tid);
        return (
          <div key={tid} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 11, padding: "3px 0", borderBottom: "1px solid #f0ede8",
          }}>
            <span style={{ color: "#44403c" }}>
              {tractName} <span style={{ color: "#a8a49c" }}>[id. {tid}]</span>
            </span>
            <span style={{ fontWeight: 600, color: getDviBandColor(tractDvi), fontSize: 10 }}>
              DVI {tractDvi?.toFixed(0) ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
    <div style={{ fontSize: 10, color: "#a8a49c", fontStyle: "italic", marginTop: 8, lineHeight: 1.4 }}>
      Neighborhood data is aggregated from these tracts using population-weighted
      averages. For tract-level precision, switch to Census Tracts view.
    </div>
  </details>
)}
```

**6. Tipping points — show multiple if the neighborhood spans several tracts with narratives:**

```jsx
{/* In the Culture tab, where tippingPoint is rendered */}
{boundaryMode === "neighborhoods" && neighborhoodAgg?.tippingPoints?.length > 1 ? (
  // Show all tipping points from constituent tracts
  neighborhoodAgg.tippingPoints.map((tp, i) => (
    <div key={i} style={{ /* existing tipping point card styles */ }}>
      <div style={{ fontSize: 10, color: "#a8a49c", marginBottom: 2 }}>
        {tp.region}
      </div>
      {/* ... existing tipping point content rendering ... */}
    </div>
  ))
) : tippingPoint ? (
  // Existing single tipping point rendering (tract mode or single match)
  // ... keep existing code ...
) : null}
```

### PA items in neighborhood mode

The Culture tab's PA section already filters by proximity. In neighborhood
mode, the aggregated `paItems` array is passed directly — it's already the
union of all PA items near any constituent tract. The existing rendering
code works as-is since it just iterates the array.

### What does NOT change

- **The three tab buttons** (Demographics, Economics, Culture) — identical in both modes
- **The AreaChart component** — receives `demoChartData` array in the same shape either way
- **The economics metric cards** — receive `propertyNow`/`propertyPrev`/`socioNow`/`socioPrev` in the same shape
- **The business list** — receives `regionBizOpen`/`regionBizClosed` arrays in the same shape
- **The PA section** — receives filtered PA items in the same shape
- **All formatting functions** (`fmtPct`, `fmtChange`, `adjustForInflation`) — work on values regardless of source
- **Chart tooltips** — work on the same data shape

### Validation

1. Click a tract in tract mode → panel shows Demographics, Economics, Culture as before
2. Switch to Neighborhoods mode → panel shows "Select a neighborhood"
3. Click a neighborhood → panel shows:
   - Header with neighborhood name + "[N tracts]"
   - DVI badge with aggregated score
   - Anchor density badge (computed from union of all businesses)
   - Demographics tab: stacked area chart with combined populations
   - Economics tab: weighted-average home values, rent, income, poverty
   - Culture tab: all businesses from all tracts, all PA items, all tipping points
   - Contributing tracts section at bottom with individual DVI scores
4. Time slider → aggregated data updates for the selected year
5. Switch back to tract mode → panel reverts to single-tract display
6. All change arrows (↑↓) work correctly with aggregated values
7. Inflation adjustment works correctly on aggregated dollar values