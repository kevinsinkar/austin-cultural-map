## Task: Implement dual boundary system — Census Tracts + Neighborhoods toggle

### Overview

Add a toggle that lets users switch between census tract boundaries (the
existing default, data-precise) and neighborhood boundaries (familiar names,
aggregated data). Tracts are the data layer; neighborhoods are the context
layer. Each tract belongs to exactly one neighborhood based on which
neighborhood polygon contains its centroid.

### Architecture (see ARCHITECTURE.md)

Current system:
- 269 census tract regions in `data/final_updated_regions.js` (REGIONS_GEOJSON)
- Tract metadata in `data/regionIndex.js` (REGION_INDEX, with centroids)
- Name lookups in `data/regionLookup.js` (ID_TO_NAME, NAME_TO_ID, etc.)
- Merged regions via MERGE_LOOKUP; VISIBLE_REGIONS excludes secondaries
- All data modules keyed by `region_id` (tract-level)
- View routing: map | compare | triage | timeline (see index.jsx)
- State managed in index.jsx, passed as props to views

New additions:
- City of Austin NPA boundaries fetched via Socrata API at build time
  (dataset ID: `inrm-c3ee`, cached locally after first fetch)
- `data/neighborhoods.js` — computed tract→neighborhood mapping (NEW)
- `data/neighborhoods_geojson.js` — merged neighborhood polygons (NEW)
- `utils/aggregation.js` — centroid-assignment aggregation (NEW)
- `boundaryMode` state: "tracts" | "neighborhoods" in index.jsx

### Step 0: Fetch the COA NPA boundaries

The City of Austin publishes Neighborhood Planning Area boundaries as open
data on their Socrata portal. The dataset ID is `inrm-c3ee`.

The build script should fetch this data via API rather than reading a
static file. Try these endpoints in order (first success wins):

```javascript
const NPA_ENDPOINTS = [
  // SODA 2.1 resource endpoint (may work without app token)
  "https://data.austintexas.gov/resource/inrm-c3ee.geojson?$limit=5000",
  // SODA3 export endpoint (full dataset download)
  "https://data.austintexas.gov/api/v3/views/inrm-c3ee/export.geojson",
  // SODA3 query endpoint (requires app token — pass via env var if set)
  "https://data.austintexas.gov/api/v3/views/inrm-c3ee/query.geojson",
];

async function fetchNPABoundaries() {
  const appToken = process.env.COA_APP_TOKEN; // optional

  for (const url of NPA_ENDPOINTS) {
    try {
      const headers = { "Accept": "application/json" };
      if (appToken) headers["X-App-Token"] = appToken;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn(`  ${url} → HTTP ${res.status}, trying next...`);
        continue;
      }
      const data = await res.json();
      // Validate it looks like GeoJSON
      if (data.type === "FeatureCollection" && data.features?.length > 0) {
        console.log(`✓ Fetched ${data.features.length} NPA boundaries from:`);
        console.log(`  ${url}`);
        return data;
      }
    } catch (e) {
      console.warn(`  ${url} → ${e.message}, trying next...`);
    }
  }

  // Fallback: check for a local file the user may have downloaded
  const localPaths = [
    "data/_cached_npa_boundaries.geojson",
    "data/coa_neighborhoods.geojson",
    "data/Boundaries__City_of_Austin_Neighborhoods.geojson",
    "data/inrm-c3ee.geojson",
  ];
  for (const p of localPaths) {
    if (fs.existsSync(p)) {
      console.log(`✓ Using local file: ${p}`);
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  }

  throw new Error(
    "Could not fetch NPA boundaries from API or find a local file.\n" +
    "Either set COA_APP_TOKEN env var, or download the GeoJSON from:\n" +
    "https://data.austintexas.gov/City-Government/Boundaries-City-of-Austin-Neighborhoods/inrm-c3ee\n" +
    "and save it to data/coa_neighborhoods.geojson"
  );
}
```

Once fetched, examine the schema and report before proceeding:

```javascript
const npa = await fetchNPABoundaries();
console.log("Features:", npa.features.length);
console.log("Sample properties:", JSON.stringify(npa.features[0].properties, null, 2));
// Identify the name field — could be planning_area_name, NEIGHNAME, NAME, etc.
const sampleProps = Object.keys(npa.features[0].properties);
console.log("Property fields:", sampleProps.join(", "));
const nameField = sampleProps.find(k =>
  /name|neigh|planning/i.test(k) && typeof npa.features[0].properties[k] === "string"
);
console.log("Detected name field:", nameField);
console.log("All neighborhood names:",
  npa.features.map(f => f.properties[nameField]).sort().join("\n")
);
```

Report what you find — how many neighborhoods, what names, what property
fields — before proceeding to Step 1. The field containing the neighborhood
name might be `planning_area_name`, `NEIGHNAME`, `NAME`, or something else
depending on the Socrata export format.

Cache the fetched GeoJSON locally so subsequent runs don't re-fetch:
```javascript
// After successful fetch:
fs.writeFileSync("data/_cached_npa_boundaries.geojson", JSON.stringify(npa));
// Add data/_cached_npa_boundaries.geojson to .gitignore
```
The local fallback paths in `fetchNPABoundaries()` include this cache file.

### Step 1: Build tract-to-neighborhood mapping via centroid assignment

Create a build script `scripts/build_neighborhoods.cjs` that:

1. Reads `data/regionIndex.js` to get every tract's `region_id` and
   `centroid` [lat, lng].

2. Reads the COA NPA GeoJSON to get neighborhood polygons with names.

3. For each tract in VISIBLE_REGIONS (skip merged secondaries via
   MERGE_LOOKUP), test which NPA polygon contains its centroid using
   Turf.js `booleanPointInPolygon`.

   ```javascript
   const turf = require("@turf/turf");

   // For each tract centroid, find containing NPA polygon
   function assignTractToNeighborhood(centroid, npaFeatures) {
     const point = turf.point([centroid[1], centroid[0]]); // [lng, lat]
     for (const feature of npaFeatures) {
       if (turf.booleanPointInPolygon(point, feature)) {
         return {
           id: slugify(feature.properties.NAME), // adjust field name
           name: feature.properties.NAME,         // adjust field name
         };
       }
     }
     return null; // centroid falls outside all NPA boundaries
   }
   ```

   ⚠️ COORDINATE ORDER: REGION_INDEX centroids are [lat, lng].
   Turf.js expects [lng, lat]. Make sure to swap.

4. Group tracts by their assigned neighborhood. Output:

   ```javascript
   {
     "east-cesar-chavez": {
       id: "east-cesar-chavez",
       name: "East Cesar Chavez",
       tract_ids: [12, 13, 14],
       source: "City of Austin NPA"
     },
     "hyde-park": { ... },
     ...
   }
   ```

5. Track unassigned tracts — those whose centroids fall outside all NPA
   polygons. These are likely ETJ, suburban, or edge tracts. Print them:
   ```
   Unassigned tracts: 87
     region_id: 201, centroid: [30.142, -97.801], current_name: "..."
     region_id: 203, centroid: [30.498, -97.692], current_name: "..."
     ...
   ```

   For unassigned tracts, attempt a secondary assignment:
   a) If the centroid is outside Austin city limits, determine the city
      (Pflugerville, Round Rock, Cedar Park, Manor, Del Valle, Bee Cave,
      etc.) from position and group as "[City] — [direction]".
   b) If inside Austin but not in any NPA (gaps between planning areas),
      assign to the nearest NPA centroid within 2 km. If none, leave
      unassigned.

6. For each neighborhood, compute a centroid (average of constituent
   tract centroids, or centroid of the NPA polygon).

7. Supplement with manually defined neighborhoods for well-known areas
   that the COA NPAs might not cover as distinct entities. Check if
   these exist in the NPA data; only add manually if missing:
   - Rainey Street Historic District
   - Warehouse District
   - Red River Cultural District
   - Market District
   - Mueller
   - North Loop (may be part of a larger NPA)
   - Cherrywood (may be part of a larger NPA)

   For manual additions, assign tracts based on centroid proximity to
   known landmark coordinates:
   - Rainey Street: [30.257, -97.740]
   - Warehouse District: [30.267, -97.748]
   - Red River: [30.268, -97.735]
   - Mueller: [30.298, -97.705]
   - North Loop: [30.318, -97.724]
   - Cherrywood: [30.289, -97.717]

8. Output the final mapping to `data/neighborhoods.js`:

   ```javascript
   // Auto-generated by scripts/build_neighborhoods.cjs
   // Source: City of Austin Neighborhood Planning Areas (data.austintexas.gov)
   // Assignment method: centroid-in-polygon (each tract → exactly one neighborhood)
   //
   // To regenerate: node scripts/build_neighborhoods.cjs

   export const NEIGHBORHOODS = [
     {
       id: "east-cesar-chavez",
       name: "East Cesar Chavez",
       tract_ids: [12, 13, 14],
       centroid: [30.253, -97.729],
       source: "City of Austin NPA",
     },
     // ...
   ];

   // Reverse lookup: tract_id → neighborhood_id (one-to-one)
   export const TRACT_TO_NEIGHBORHOOD = new Map();
   NEIGHBORHOODS.forEach(n => {
     n.tract_ids.forEach(tid => {
       TRACT_TO_NEIGHBORHOOD.set(tid, n.id);
     });
   });

   // Neighborhood lookup by id
   export const NEIGHBORHOOD_BY_ID = new Map(
     NEIGHBORHOODS.map(n => [n.id, n])
   );

   // Sorted name list for dropdowns
   export const NEIGHBORHOOD_NAMES = NEIGHBORHOODS
     .map(n => n.name)
     .sort((a, b) => a.localeCompare(b));
   ```

   Also print a summary:
   ```
   Total NPA neighborhoods: N
   Manual neighborhoods added: N
   Total tracts assigned: N / 232 visible
   Unassigned tracts: N (list)
   Largest neighborhood: "X" (N tracts)
   Smallest neighborhood: "Y" (N tracts)
   Average tracts per neighborhood: N
   ```

Install Turf.js if not present: `npm install @turf/turf`

### Step 2: Generate neighborhood GeoJSON

In the same script (or a second pass), generate merged polygons:

```javascript
const turf = require("@turf/turf");

// For each neighborhood, union its constituent tract polygons
// from REGIONS_GEOJSON (data/final_updated_regions.js)
function buildNeighborhoodPolygon(hood, tractsGeoJSON) {
  const tractFeatures = tractsGeoJSON.features.filter(f =>
    hood.tract_ids.includes(f.properties.region_id)
  );
  if (tractFeatures.length === 0) return null;
  if (tractFeatures.length === 1) {
    const feature = JSON.parse(JSON.stringify(tractFeatures[0]));
    feature.properties = {
      neighborhood_id: hood.id,
      neighborhood_name: hood.name,
      tract_ids: hood.tract_ids,
      tract_count: hood.tract_ids.length,
    };
    return feature;
  }

  let merged = tractFeatures[0];
  for (let i = 1; i < tractFeatures.length; i++) {
    try {
      merged = turf.union(
        turf.featureCollection([merged, tractFeatures[i]])
      );
    } catch (e) {
      console.warn(`Union failed for ${hood.name}, tract index ${i}:`, e.message);
      // Skip this tract if union fails (topology issues)
    }
  }
  merged.properties = {
    neighborhood_id: hood.id,
    neighborhood_name: hood.name,
    tract_ids: hood.tract_ids,
    tract_count: hood.tract_ids.length,
  };
  return merged;
}
```

Output to `data/neighborhoods_geojson.js`:
```javascript
// Auto-generated — do not edit manually
// Polygons are unions of constituent census tract polygons
export const NEIGHBORHOODS_GEOJSON = { type: "FeatureCollection", features: [...] };
```

Like REGIONS_GEOJSON, do NOT export this from the barrel (`data/index.js`).
Only `hooks/useAustinMap.js` should import it directly.

DO export NEIGHBORHOODS, TRACT_TO_NEIGHBORHOOD, NEIGHBORHOOD_BY_ID, and
NEIGHBORHOOD_NAMES from the barrel.

### Step 3: Create aggregation utilities

Create `utils/aggregation.js`:

```javascript
import _ from "lodash";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import { DEMO_BY_RY, PROP_BY_RY, SOCIO_BY_RY } from "../data/auditedData";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi";
import {
  REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL,
} from "../data";
import { interpolateDvi } from "./math";
import { toDemoChartData } from "../data/auditedData";

/**
 * Aggregate tract-level data for a neighborhood at a given year.
 *
 * METHOD: Centroid-assignment — each tract belongs to exactly one
 * neighborhood. No double-counting. Population-weighted averages
 * for rates and percentages. Sums for absolute counts.
 */
export function aggregateNeighborhood(neighborhoodId, year) {
  const hood = NEIGHBORHOOD_BY_ID.get(neighborhoodId);
  if (!hood) return null;
  const { tract_ids } = hood;

  // ── Demographics (population-weighted averages) ──
  const demoRows = tract_ids
    .map(id => DEMO_BY_RY.get(`${id}_${year}`))
    .filter(Boolean);

  if (demoRows.length === 0) return null;

  const totalPop = _.sumBy(demoRows, "total_population");

  function popWeightedAvg(field) {
    if (totalPop === 0) return 0;
    return _.sumBy(demoRows, r =>
      (r[field] || 0) * (r.total_population || 0)
    ) / totalPop;
  }

  const demographics = {
    total_population: totalPop,
    pct_hispanic: popWeightedAvg("pct_hispanic"),
    pct_white: popWeightedAvg("pct_white_non_hispanic"),
    pct_black: popWeightedAvg("pct_black_non_hispanic"),
    pct_asian: popWeightedAvg("pct_asian"),
    pct_owner_occupied: popWeightedAvg("pct_owner_occupied"),
    median_age: popWeightedAvg("median_age"),
  };

  // ── DVI (population-weighted average) ──
  const dviEntries = tract_ids.map(id => {
    const dvi = interpolateDvi(id, year);
    const pop = DEMO_BY_RY.get(`${id}_${year}`)?.total_population || 0;
    return { dvi, pop };
  }).filter(e => e.dvi != null);

  const totalDviPop = _.sumBy(dviEntries, "pop");
  const aggDvi = totalDviPop > 0
    ? _.sumBy(dviEntries, e => e.dvi * e.pop) / totalDviPop
    : 0;

  // ── Property (population-weighted averages) ──
  const propRows = tract_ids
    .map(id => PROP_BY_RY.get(`${id}_${year}`))
    .filter(Boolean);

  const property = propRows.length > 0 ? {
    median_home_value: popWeightedAvgFrom(propRows, demoRows, "median_home_value"),
    median_rent: popWeightedAvgFrom(propRows, demoRows, "median_rent_monthly"),
  } : null;

  // ── Socioeconomic (population-weighted averages) ──
  const socioRows = tract_ids
    .map(id => SOCIO_BY_RY.get(`${id}_${year}`))
    .filter(Boolean);

  const socioeconomic = socioRows.length > 0 ? {
    median_household_income: popWeightedAvgFrom(socioRows, demoRows, "median_household_income"),
    poverty_rate: popWeightedAvgFrom(socioRows, demoRows, "poverty_rate"),
  } : null;

  // ── Businesses (union — no double counting since tracts are exclusive) ──
  const bizOpen = LEGACY_OPERATING.filter(b => tract_ids.includes(b.region_id));
  const bizClosed = LEGACY_CLOSED.filter(b => tract_ids.includes(b.region_id));

  // ── Preservation Austin items (matched to constituent tracts) ──
  const paItems = PA_ALL.filter(p => {
    return tract_ids.some(tid => {
      const tract = REGION_INDEX.find(r => r.region_id === tid);
      if (!tract) return false;
      const dlat = p.lat - tract.centroid[0];
      const dlng = p.lng - tract.centroid[1];
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
    });
  });

  // ── Demographic chart data (combined across tracts) ──
  // Build combined chart data by summing populations per year
  const chartYears = [1990, 2000, 2010, 2020, 2023];
  const demoChartData = chartYears.map(yr => {
    const rows = tract_ids
      .map(id => DEMO_BY_RY.get(`${id}_${yr}`))
      .filter(Boolean);
    const pop = _.sumBy(rows, "total_population");
    if (pop === 0) return null;
    return {
      year: yr,
      White: _.sumBy(rows, r => (r.pct_white_non_hispanic || 0) * r.total_population) / pop,
      Black: _.sumBy(rows, r => (r.pct_black_non_hispanic || 0) * r.total_population) / pop,
      Hispanic: _.sumBy(rows, r => (r.pct_hispanic || 0) * r.total_population) / pop,
      Asian: _.sumBy(rows, r => (r.pct_asian || 0) * r.total_population) / pop,
      Other: 0, // compute as remainder if needed
    };
  }).filter(Boolean);

  return {
    id: hood.id,
    name: hood.name,
    tractCount: tract_ids.length,
    tract_ids,
    totalPopulation: totalPop,
    aggDvi,
    demographics,
    property,
    socioeconomic,
    bizOpen,
    bizClosed,
    paItems,
    demoChartData,
  };
}

/**
 * Population-weighted average where data and population come from
 * different row sets (e.g., property rows weighted by demo populations).
 */
function popWeightedAvgFrom(dataRows, demoRows, field) {
  // Build a region_id → population map from demoRows
  const popMap = new Map();
  demoRows.forEach(r => {
    if (r.region_id) popMap.set(r.region_id, r.total_population || 0);
  });

  let totalWeight = 0;
  let weightedSum = 0;
  dataRows.forEach(r => {
    const pop = popMap.get(r.region_id) || 0;
    const val = r[field];
    if (val != null && pop > 0) {
      weightedSum += val * pop;
      totalWeight += pop;
    }
  });
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
```

### Step 4: Add boundaryMode state to index.jsx

Add to state:
```javascript
const [boundaryMode, setBoundaryMode] = useState("tracts");
const [activeNeighborhoodId, setActiveNeighborhoodId] = useState(null);
```

Pass to all views that need it:
- `MapView` — `boundaryMode`, `setBoundaryMode`, `activeNeighborhoodId`,
  `setActiveNeighborhoodId`
- `RegionDetailPanel` — `boundaryMode`, `activeNeighborhoodId`
- `ComparisonView` — `boundaryMode`
- `TriageView` — `boundaryMode`

### Step 5: Add boundary toggle to MapView.jsx toolbar

Place the toggle near the existing overlay buttons, but visually distinct
since it changes the entire map mode rather than adding a layer:

```jsx
{/* Boundary mode toggle — place above or beside overlay toggles */}
<div style={{
  display: "flex",
  background: "#edeae4",
  borderRadius: 8,
  padding: 3,
  marginRight: 12,
}}>
  {[
    { key: "tracts", label: "Census Tracts" },
    { key: "neighborhoods", label: "Neighborhoods" },
  ].map(mode => (
    <button
      key={mode.key}
      onClick={() => setBoundaryMode(mode.key)}
      aria-current={boundaryMode === mode.key ? "page" : undefined}
      style={{
        padding: "4px 12px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: boundaryMode === mode.key ? 600 : 400,
        background: boundaryMode === mode.key ? "#fffffe" : "transparent",
        color: boundaryMode === mode.key ? "#0f766e" : "#7c6f5e",
        border: "none",
        cursor: "pointer",
        boxShadow: boundaryMode === mode.key
          ? "0 1px 3px rgba(0,0,0,.08)" : "none",
        minHeight: 32,
      }}
    >
      {mode.label}
    </button>
  ))}
</div>
```

### Step 6: Add methodology disclaimer

Add a small info note below the boundary toggle that appears when
Neighborhoods mode is active:

```jsx
{boundaryMode === "neighborhoods" && (
  <div style={{
    fontSize: 10,
    color: "#a8a49c",
    fontStyle: "italic",
    lineHeight: 1.4,
    marginTop: 4,
    maxWidth: 420,
  }}>
    Neighborhood boundaries follow City of Austin planning areas. Data is
    aggregated from census tracts assigned by centroid location — each tract
    contributes to exactly one neighborhood. For precise tract-level data,
    switch to Census Tracts view.
  </div>
)}
```

Also add to the About modal (`AboutModal.jsx`), in the Data Confidence
section:

```jsx
<h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
  Neighborhood Aggregation
</h3>
<p style={{ margin: "0 0 16px" }}>
  Neighborhood boundaries are based on City of Austin Neighborhood Planning
  Areas. Census tracts are assigned to neighborhoods using centroid-in-polygon
  matching — each tract belongs to exactly one neighborhood, and its full
  population and metrics are attributed to that neighborhood. This avoids
  double-counting but means tracts that straddle two neighborhoods are
  assigned entirely to one. For boundary-sensitive analysis, use the
  Census Tracts view, which shows the underlying data at its native
  resolution.
</p>
```

### Step 7: Update useAustinMap.js

This is the biggest change. The hook needs to manage two GeoJSON layers.

a) Import the new neighborhood GeoJSON:
```javascript
import { NEIGHBORHOODS_GEOJSON } from "../data/neighborhoods_geojson";
```

b) Accept `boundaryMode`, `activeNeighborhoodId`, `setActiveNeighborhoodId`
   in the hook's params.

c) In the init useEffect (effect #1), create BOTH layers but only add
   the active one to the map:

```javascript
// Tract layer (existing) — keep current implementation
const tractLayer = L.geoJSON(REGIONS_GEOJSON, { /* existing style + handlers */ });

// Neighborhood layer (new)
const neighborhoodLayer = L.geoJSON(NEIGHBORHOODS_GEOJSON, {
  style: (feature) => {
    // Color by aggregated DVI (computed from constituent tracts)
    const hood = NEIGHBORHOOD_BY_ID.get(feature.properties.neighborhood_id);
    if (!hood) return { fillColor: "#e8e5e0", fillOpacity: 0.4 };
    // Compute weighted DVI for this neighborhood
    const dviEntries = hood.tract_ids.map(id => {
      const dvi = interpolateDvi(id, year);
      const pop = /* get pop for this tract at this year */;
      return { dvi, pop };
    }).filter(e => e.dvi != null);
    const totalPop = _.sumBy(dviEntries, "pop");
    const aggDvi = totalPop > 0
      ? _.sumBy(dviEntries, e => e.dvi * e.pop) / totalPop : 0;
    return {
      fillColor: getDviColor(aggDvi),
      fillOpacity: 0.55,
      color: /* active highlight if selected */ "#d6d3cd",
      weight: 1.5,
    };
  },
  onEachFeature: (feature, layer) => {
    layer.on("click", () => {
      setActiveNeighborhoodId(feature.properties.neighborhood_id);
      // Also set activeRegionId to null so the panel knows to show
      // neighborhood-level data
    });
    layer.on("mouseover", () => { /* highlight */ });
    layer.on("mouseout", () => { /* unhighlight */ });
  },
});

// Store both as refs
mapInstanceRef.current._tractLayer = tractLayer;
mapInstanceRef.current._neighborhoodLayer = neighborhoodLayer;

// Add the default layer
tractLayer.addTo(mapInstanceRef.current);
```

d) Add a useEffect that responds to `boundaryMode` changes:
```javascript
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;
  const tractLayer = map._tractLayer;
  const neighborhoodLayer = map._neighborhoodLayer;
  if (!tractLayer || !neighborhoodLayer) return;

  if (boundaryMode === "tracts") {
    if (map.hasLayer(neighborhoodLayer)) map.removeLayer(neighborhoodLayer);
    if (!map.hasLayer(tractLayer)) tractLayer.addTo(map);
    // Clear neighborhood selection
    setActiveNeighborhoodId(null);
  } else {
    if (map.hasLayer(tractLayer)) map.removeLayer(tractLayer);
    if (!map.hasLayer(neighborhoodLayer)) neighborhoodLayer.addTo(map);
    // Clear tract selection
    // (keep overlays — business pins, PA dots, etc. stay visible)
  }
}, [boundaryMode]);
```

e) All overlay layers (business pins, PA dots, transit lines, music venues)
   remain visible and functional in BOTH modes. They're point/line layers,
   independent of boundary polygons.

f) Update the style-refresh useEffect (effect #2) to also restyle the
   neighborhood layer when `year` changes (recompute aggregated DVIs).

### Step 8: Update RegionDetailPanel.jsx

The panel handles two modes:

**Tract mode** (`boundaryMode === "tracts"`): Current behavior unchanged.

**Neighborhood mode** (`boundaryMode === "neighborhoods"`):
When `activeNeighborhoodId` is set, call `aggregateNeighborhood()` and
display the results.

```jsx
// At the top of the component, compute neighborhood data if in that mode
const neighborhoodData = useMemo(() => {
  if (boundaryMode !== "neighborhoods" || !activeNeighborhoodId) return null;
  return aggregateNeighborhood(activeNeighborhoodId, year);
}, [boundaryMode, activeNeighborhoodId, year]);
```

**Header** in neighborhood mode:
```jsx
<h2 style={{ /* existing styles */ }}>
  {neighborhoodData.name}
  <span style={{ fontSize: 12, fontWeight: 400, color: "#a8a49c" }}>
    {" "}[{neighborhoodData.tractCount} tracts]
  </span>
</h2>
```

**DVI badge**: Show the aggregated DVI with the tract count annotation.

**Demographics chart**: Use `neighborhoodData.demoChartData` — same
AreaChart component, fed with combined data.

**Economics tab**: Show weighted-average income, home value, etc.

**Culture tab**: Show union of businesses and PA items from all tracts.

**Contributing tracts section** (at the bottom of the panel, collapsible):
```jsx
<details style={{ marginTop: 12 }}>
  <summary style={{
    fontSize: 12,
    color: "#7c6f5e",
    cursor: "pointer",
    fontWeight: 500,
  }}>
    Contributing census tracts ({neighborhoodData.tract_ids.length})
  </summary>
  <div style={{ marginTop: 8 }}>
    {neighborhoodData.tract_ids.map(tid => {
      const tractDvi = interpolateDvi(tid, year);
      const tractName = ID_TO_NAME.get(tid);
      return (
        <div key={tid} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          padding: "3px 0",
          borderBottom: "1px solid #f0ede8",
        }}>
          <span style={{ color: "#44403c" }}>
            {tractName} <span style={{ color: "#a8a49c" }}>[id. {tid}]</span>
          </span>
          <span style={{
            fontWeight: 600,
            color: getDviColor(tractDvi),
            fontSize: 10,
          }}>
            DVI {tractDvi?.toFixed(0) ?? "—"}
          </span>
        </div>
      );
    })}
  </div>
</details>
```

When the panel is in neighborhood mode and no neighborhood is selected,
show a prompt similar to the existing tract-mode empty state:
```jsx
<div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5 }}>
  Click any neighborhood on the map to explore its aggregated demographic
  history, displacement metrics, and cultural story.
</div>
```

### Step 9: Update ComparisonView.jsx

When `boundaryMode === "neighborhoods"`:
- The two dropdowns show `NEIGHBORHOOD_NAMES` instead of `REGION_NAMES`
- Data lookups use `aggregateNeighborhood(id, year)` per chart point
- The DVI line chart, demographic chart, and summary table all use
  aggregated values
- Store selected neighborhoods as `compHoodA` / `compHoodB` (neighborhood
  IDs) alongside the existing `compA` / `compB` (region names)

When switching boundary modes, reset the comparison selections.

### Step 10: Update TriageView.jsx

When `boundaryMode === "neighborhoods"`:
- Each row/dot represents a neighborhood, not a tract
- DVI is the population-weighted average across constituent tracts
- Anchor density is computed from the union of businesses in all tracts
- Triage categories are assigned to the neighborhood as a unit
- The table shows neighborhood name, tract count, aggregated DVI,
  aggregated anchor density, and triage category
- Clicking a row could switch to map view with that neighborhood selected

This makes triage recommendations directly actionable:
"Prioritize South Lamar (DVI 47, 4 tracts, anchor density 35%)"

### Step 11: Validate

1. Toggle between tract and neighborhood modes — map should switch layers
   cleanly with no flicker or orphaned layers
2. All overlays (business pins, PA dots, transit) remain visible in both
3. Clicking a neighborhood shows aggregated data in the panel
4. Contributing tracts section shows correct individual DVI scores
5. Switching modes doesn't crash — all state resets cleanly
6. ComparisonView dropdowns update with correct name list per mode
7. TriageView shows correct unit count per mode
8. The disclaimer text renders in neighborhood mode
9. The About modal includes the aggregation methodology note

### Implementation order

Do these in sequence, verifying each before moving on:

1. **Step 0** — examine COA file, report schema
2. **Steps 1–2** — build script: generate neighborhoods.js and
   neighborhoods_geojson.js. This is self-contained. Verify output
   before touching any UI components.
3. **Step 3** — aggregation.js. Test with a few known neighborhoods
   (print aggregated DVI for East Cesar Chavez, Hyde Park, etc.)
4. **Steps 4–6** — state + toggle + disclaimer. Minimal UI, just the
   toggle switch that doesn't do anything yet.
5. **Step 7** — useAustinMap.js dual layers. This is the hardest step.
   Get the layer switching working before worrying about click handlers.
6. **Step 8** — RegionDetailPanel neighborhood mode. Get the panel
   displaying aggregated data.
7. **Steps 9–10** — ComparisonView + TriageView updates. These are
   lower priority and can be deferred.
8. **Step 11** — validation pass.

### Constraints
- Do NOT modify any existing tract-level data, calculations, or behavior
- Tract mode must continue working exactly as before — it's the default
- Neighborhoods are a read-only aggregation lens, not a new data source
- Each tract belongs to exactly ONE neighborhood (centroid-assignment)
- No double-counting in any aggregation
- Pre-compute neighborhood GeoJSON via build script (don't union at runtime)
- The COA NPA data is fetched via API at build time (not bundled in the app).
  The build script caches the response to a local file so it doesn't need
  to re-fetch on every run. The local file is gitignored — only the
  generated outputs (neighborhoods.js, neighborhoods_geojson.js) are
  committed.
- Keep the NEIGHBORHOODS_GEOJSON out of the barrel (data/index.js), same
  pattern as REGIONS_GEOJSON — only useAustinMap.js imports it directly
```