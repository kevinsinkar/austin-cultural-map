# Austin Cultural Map — Architecture & File Dependencies

> **Last updated**: March 3, 2026 (post-efficiency refactoring)
> **Purpose**: Machine-readable project structure for AI assistants and new contributors.

---

## 1. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.2.0 |
| Build | Vite | 7.3.1 |
| Maps | Leaflet | 1.9.4 |
| Charts | Recharts | 3.7.0 |
| Data | D3 | 7.9.0 |
| Utilities | Lodash | 4.17.23 |
| Lint | ESLint (flat config) | — |

---

## 2. Directory Layout

```
austin-cultural-map/
├── index.html              # Vite SPA entry (loads src/main.jsx)
├── index.jsx               # Root React component (AustinCulturalMap)
├── styles.css              # Global application styles
├── vite.config.js          # Vite build config (React plugin)
├── eslint.config.js        # ESLint flat config
├── package.json            # Dependencies & scripts
│
├── src/
│   ├── main.jsx            # React DOM bootstrap (renders <App />)
│   ├── App.jsx             # Thin wrapper → imports AustinCulturalMap from ../index
│   └── index.css           # Base CSS (Vite scaffold)
│
├── components/
│   ├── Header.jsx          # Tab navigation + title bar
│   ├── MapView.jsx         # Leaflet map + slider + overlays + detail sidebar
│   ├── RegionDetailPanel.jsx  # Region detail sidebar (DVI, charts, businesses)
│   ├── ComparisonView.jsx  # Side-by-side region comparison
│   ├── TriageView.jsx      # Grant triage & prioritisation (scatter + table)
│   ├── TimelineView.jsx    # "River of Time" business timeline
│   ├── AboutModal.jsx      # Data sources & methodology modal
│   ├── AgendaModal.jsx     # ISSUES.md agenda modal
│   ├── ChartTooltip.jsx    # Custom Recharts tooltip (for area charts)
│   └── ErrorBoundary.jsx   # React error boundary wrapper
│
├── hooks/
│   └── useAustinMap.js     # Leaflet map lifecycle hook
│
├── utils/
│   ├── math.js             # DVI interpolation, anchor density, scoring
│   ├── mapHelpers.js       # Music data lookup, dev-pressure color ramp
│   └── formatters.js       # fmtPct, fmtChange, pressureDots, catColor
│
├── data/
│   ├── index.js            # Barrel re-export (central data import point)
│   ├── phase1_output/      # ★ Source-of-truth: 3 audited normalized JSONs
│   │   ├── audited_demographics_normalized.json
│   │   ├── audited_property_normalized.json
│   │   └── audited_socioeconomic_normalized.json
│   ├── auditedData.js      # ★ Central normaliser: imports phase1 JSONs once,
│   │                        #   exports Maps + flat arrays + (regionId,year) lookups
│   ├── auditedDvi.js       # Computes DVI from auditedData.js pre-normalised data
│   ├── interim_demographics.js   # Enriches demos with derived pct/pop fields (from auditedData)
│   ├── interim_property.js       # Pass-through from auditedData normalised property rows
│   ├── interim_socioeconomic.js  # Joins socio+property+demo via auditedData Maps → SOCIOECONOMIC
│   ├── businesses.js       # Static legacy business data (41 operating, 52 closed)
│   ├── constants.js        # REGION_NAMES (from regionIndex), SNAP_YEARS, PLAY_YEARS, DEMO_COLORS
│   ├── final_updated_regions.js  # Canonical GeoJSON (269 regions, full polygons)
│   │                        #   Only imported by hooks/useAustinMap.js for Leaflet rendering
│   ├── regionIndex.js      # Lightweight region metadata (centroids, DVI scores — no geometry)
│   ├── regionLookup.js     # Name↔ID maps (from regionIndex)
│   ├── musicNightlife.js   # Music/nightlife venue counts per region/year
│   ├── projectConnect.js   # Transit line polylines + proximity regions
│   ├── timelineInfra.js    # Infrastructure/policy timeline events
│   ├── tippingPoints.js    # Tipping-point narratives per region
│   └── _archive/           # Obsolete pipeline artifacts (do not import)
│
├── scripts/
│   └── _archive/           # Phase 1 automation scripts (completed)
│
├── archive/                # Legacy pre-refactor code & data
│
└── public/
    └── ISSUES.md           # Project issues/agenda
```

---

## 3. Data Flow

```
data/phase1_output/*.json          (3 audited, normalized JSON files — source of truth)
│
└──► data/auditedData.js           ★ SINGLE ENTRY POINT — imports 3 JSONs once, normalises
       │                             field names, then exports:
       │                             • AUDITED_DEMO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID (Maps)
       │                             • NORMALIZED_DEMO, NORMALIZED_PROP, NORMALIZED_SOCIO (flat arrays)
       │                             • DEMO_BY_RY, PROP_BY_RY, SOCIO_BY_RY (regionId_year → row Maps)
       │                             • closestRow(), priorRow(), toDemoChartData() helpers
       │
       ├──► data/auditedDvi.js            Consumes DEMO_BY_RY, PROP_BY_RY, SOCIO_BY_RY
       │      Computes AUDITED_DVI_LOOKUP {[region_id]: [{year, dvi}]}
       │      Weights: demographic 35%, market 35%, socioeconomic 30%
       │
       ├──► data/interim_demographics.js  Consumes NORMALIZED_DEMO
       │      Derives: pctBlack, pctHispanic, pctWhite, pctAsian, pctOther,
       │      popBlack, popHispanic, popWhite → exports DEMOGRAPHICS[]
       │
       ├──► data/interim_property.js      Consumes NORMALIZED_PROP → exports PROPERTY_DATA[]
       │
       └──► data/interim_socioeconomic.js Consumes AUDITED_*_BY_ID Maps
              Joins by (region_id, year): incomeAdj, homeValue, pctBachelors,
              pctCostBurdened → exports SOCIOECONOMIC[]

         │
         ▼
data/regionLookup.js               Builds NAME_TO_ID, ID_TO_NAME (from REGION_INDEX)
         │
         ▼
data/index.js                      Barrel re-export (excludes REGIONS_GEOJSON)
         │
         ▼
components/*, utils/*              Consume data via  import { ... } from "../data"
hooks/useAustinMap.js              Imports REGIONS_GEOJSON directly from final_updated_regions.js
```

---

## 4. Phase 1 Output JSON Schemas

### audited_demographics_normalized.json
- **Rows**: ~4811 | **Regions**: 269 unique region_ids
- **Fields**: `year`, `total_population`, `median_age`, `pct_hispanic`, `pct_white_non_hispanic`, `pct_black_non_hispanic`, `pct_asian`, `pct_foreign_born`, `pct_owner_occupied`, `rent_burden_pct`, `pct_65_and_over`, `pct_bachelors_degree_or_higher`, `region`, `region_id`, `audit_source`, `audit_confidence`

### audited_property_normalized.json
- **Rows**: ~2645 | **Regions**: 209 unique region_ids
- **Fields**: `year`, `median_home_value`, `median_rent_monthly`, `commercial_sqft`, `median_property_tax`, `pct_home_value_change_yoy`, `vacancy_rate`, `new_construction_permits`, `total_housing_units`, `region`, `region_id`, `audit_source`, `audit_confidence`

### audited_socioeconomic_normalized.json
- **Rows**: ~2544 | **Regions**: 209 unique region_ids
- **Fields**: `year`, `median_household_income`, `poverty_rate`, `unemployment_rate`, `gini_coefficient`, `pct_uninsured`, `eviction_filing_rate`, `snap_participation_rate`, `dominant_industries[]`, `region`, `region_id`, `audit_source`, `audit_confidence`

---

## 5. File-Level Dependency Graph

### Entry Chain

```
index.html
  └── src/main.jsx
        └── src/App.jsx
              └── index.jsx  (AustinCulturalMap — root component)
```

### index.jsx (Root Component)

| Import | Source |
|--------|--------|
| `useState, useEffect, useRef, useMemo, useCallback` | react |
| `_` | lodash |
| `REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, SOCIOECONOMIC, TIPPING_POINTS` | ./data |
| `PLAY_YEARS` | ./data/constants |
| `interpolateDvi, interpolateSocio, findPriorSocio` | ./utils/math |
| `Header` | ./components/Header |
| `AboutModal` | ./components/AboutModal |
| `AgendaModal` | ./components/AgendaModal |
| `MapView` | ./components/MapView |
| `ErrorBoundary` | ./components/ErrorBoundary |
| `ComparisonView` | ./components/ComparisonView |
| `TriageView` | ./components/TriageView |
| `TimelineView` | ./components/TimelineView |

**State managed**: `year`, `viewMode`, `activeRegionId`, `selectedRegion`, `activeFeature`, `hoveredRegion`, `showAbout`, `showAgenda`, `isPlaying`, `playIndex`

**View routing**: `viewMode` state → one of `"map"` | `"compare"` | `"triage"` | `"timeline"`

---

### Components

#### MapView.jsx
| Import | Source |
|--------|--------|
| `useRef, useMemo` | react |
| `useAustinMap` | ../hooks/useAustinMap |
| `RegionDetailPanel` | ./RegionDetailPanel |
| `SNAP_YEARS, PLAY_YEARS, TIMELINE_EVENTS` | ../data/constants |
| `AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID, closestRow, priorRow, toDemoChartData` | ../data/auditedData |

#### RegionDetailPanel.jsx
| Import | Source |
|--------|--------|
| `_` | lodash |
| `AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine` | recharts |
| `DEMO_COLORS` | ../data/constants |
| `getDviColor, getDviBand, getDviBandColor, calcAnchorDensity, getAnchorBadge` | ../utils/math |
| `fmtPct, fmtChange, pressureColor, pressureDots` | ../utils/formatters |
| `ChartTooltip` | ./ChartTooltip |

#### ComparisonView.jsx
| Import | Source |
|--------|--------|
| `useMemo, useState` | react |
| `_` | lodash |
| `LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer` | recharts |
| `SOCIOECONOMIC, DEMOGRAPHICS` | ../data |
| `REGION_NAMES, DEMO_COLORS` | ../data/constants |
| `NAME_TO_ID` | ../data/regionLookup |
| `interpolateDvi, calcAnchorDensity` | ../utils/math |
| `fmtPct` | ../utils/formatters |

#### TriageView.jsx
| Import | Source |
|--------|--------|
| `useState, useMemo, useCallback` | react |
| `_` | lodash |
| `ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell` | recharts |
| `REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS` | ../data |
| `interpolateDvi, calcAnchorDensity, calcAnchorPressureScore, getDviBandColor` | ../utils/math |

#### TimelineView.jsx
| Import | Source |
|--------|--------|
| `useMemo, useState, useRef, useCallback` | react |
| `_` | lodash |
| `LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer` | recharts |
| `REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, TIMELINE_INFRA` | ../data |
| `DEMO_COLORS` | ../data/constants |
| `interpolateDvi, getDviColor` | ../utils/math |
| `catColor` | ../utils/formatters |

#### Header.jsx, AboutModal.jsx, AgendaModal.jsx, ChartTooltip.jsx
- **No imports** (pure components, props only)

#### ErrorBoundary.jsx
| Import | Source |
|--------|--------|
| `React` | react |

---

### Hooks

#### useAustinMap.js
| Import | Source |
|--------|--------|
| `useEffect, useRef` | react |
| `L` | leaflet |
| `leaflet/dist/leaflet.css` | leaflet |
| `REGION_INDEX` | ../data |
| `REGIONS_GEOJSON` | ../data/final_updated_regions |
| `LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES` | ../data |
| `AUDITED_PROP_BY_ID` | ../data/auditedData |
| `interpolateDvi, getDviColor` | ../utils/math |
| `getDevPressureColor` | ../utils/mapHelpers |

**Lifecycle**: 4 useEffect hooks:
1. Map init + GeoJSON layer creation (runs once)
2. Region style update (runs on `year`/`activeRegionId` change)
3. Overlay redraw — business pins, music venues, transit lines, dev-pressure (runs on `year`/toggle changes)
4. Cleanup when `selectedRegion` becomes null

---

### Utils

#### math.js
| Import | Source |
|--------|--------|
| `* as d3` | d3 |
| `_` | lodash |
| `AUDITED_DVI_LOOKUP` | ../data/auditedDvi.js |
| `AUDITED_SOCIO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID` | ../data/auditedData |
| `LEGACY_OPERATING, LEGACY_CLOSED` | ../data |
| `NAME_TO_ID` | ../data/regionLookup |

**Exports**: `lerp`, `interpolateDvi`, `getDviColor`, `getDviBand`, `getDviBandColor`, `getDviTimeSeries`, `interpolateSocio`, `findPriorSocio`, `calcAnchorDensity`, `calcAnchorPressureScore`, `getAnchorBadge`

#### mapHelpers.js
| Import | Source |
|--------|--------|
| `* as d3` | d3 |
| `MUSIC_NIGHTLIFE` | ../data/musicNightlife |
| `AUDITED_PROP_BY_ID` | ../data/auditedData |
| `NAME_TO_ID` | ../data/regionLookup |

**Exports**: `getMusicData`, `getDevPressureColor`

#### formatters.js
- **No imports** (pure functions)
- **Exports**: `fmtPct`, `fmtChange`, `pressureColor`, `pressureDots`, `catColor`

---

### Data Modules

#### data/index.js (Barrel)
| Export | Source Module |
|--------|--------------|
| `REGION_INDEX` | ./regionIndex |
| `NAME_TO_ID, ID_TO_NAME, toId, toName` | ./regionLookup |
| `LEGACY_OPERATING, LEGACY_CLOSED` | ./businesses |
| `DEMOGRAPHICS` | ./interim_demographics |
| `SOCIOECONOMIC` | ./interim_socioeconomic |
| `TIPPING_POINTS` | ./tippingPoints |
| `AUDITED_DVI_LOOKUP` | ./auditedDvi |
| `MUSIC_NIGHTLIFE` | ./musicNightlife |
| `PROPERTY_DATA` | ./interim_property |
| `PROJECT_CONNECT_LINES, PC_PROXIMITY_REGIONS` | ./projectConnect |
| `TIMELINE_INFRA` | ./timelineInfra |
| `REGION_NAMES, TIMELINE_EVENTS, SNAP_YEARS, PLAY_YEARS, DEMO_COLORS` | ./constants |

> **Note**: `REGIONS_GEOJSON` (~7.6 MB) is intentionally excluded from the barrel.
> Only `hooks/useAustinMap.js` imports it directly from `./final_updated_regions`
> for Leaflet polygon rendering.

#### Static Data Modules (no imports)
- `businesses.js` → `LEGACY_OPERATING`, `LEGACY_CLOSED`
- `final_updated_regions.js` → `REGIONS_GEOJSON` (269 regions, canonical — only used by useAustinMap.js)
- `regionIndex.js` → `REGION_INDEX` (61 KB lightweight metadata, no geometry)
- `musicNightlife.js` → `MUSIC_NIGHTLIFE`
- `projectConnect.js` → `PROJECT_CONNECT_LINES`, `PC_PROXIMITY_REGIONS`
- `timelineInfra.js` → `TIMELINE_INFRA`
- `tippingPoints.js` → `TIPPING_POINTS`

#### Computed Data Modules
| Module | Reads From | Exports |
|--------|-----------|---------|
| `auditedData.js` | phase1_output (3 JSONs) | `AUDITED_DEMO_BY_ID`, `AUDITED_PROP_BY_ID`, `AUDITED_SOCIO_BY_ID`, `NORMALIZED_DEMO`, `NORMALIZED_PROP`, `NORMALIZED_SOCIO`, `DEMO_BY_RY`, `PROP_BY_RY`, `SOCIO_BY_RY`, `closestRow`, `priorRow`, `toDemoChartData` |
| `auditedDvi.js` | auditedData.js (BY_RY Maps) | `AUDITED_DVI_LOOKUP` |
| `interim_demographics.js` | auditedData.js (NORMALIZED_DEMO) | `DEMOGRAPHICS` |
| `interim_property.js` | auditedData.js (NORMALIZED_PROP) | `PROPERTY_DATA` |
| `interim_socioeconomic.js` | auditedData.js (AUDITED_*_BY_ID Maps) | `SOCIOECONOMIC` |
| `regionLookup.js` | regionIndex.js | `NAME_TO_ID`, `ID_TO_NAME`, `toId`, `toName` |
| `constants.js` | regionIndex.js | `REGION_NAMES`, `TIMELINE_EVENTS`, `SNAP_YEARS`, `PLAY_YEARS`, `DEMO_COLORS` |

---

## 6. View Routing

The root component (`index.jsx`) renders one of four views based on `viewMode` state:

| viewMode | Component | Description |
|----------|-----------|-------------|
| `"map"` | `MapView` | Leaflet choropleth map with time slider, overlay toggles, and RegionDetailPanel sidebar |
| `"compare"` | `ComparisonView` | Side-by-side region comparison with line charts and summary table |
| `"triage"` | `TriageView` | Grant triage: scatter plot + sortable table classifying 269 regions by DVI tier |
| `"timeline"` | `TimelineView` | Gantt-style business timeline with DVI overlay and event markers |

`Header.jsx` renders the tab bar that sets `viewMode`. `AboutModal` and `AgendaModal` are always-available overlays toggled by `showAbout`/`showAgenda` state.

---

## 7. Key Domain Concepts

| Concept | Description |
|---------|-------------|
| **Region** | One of 269 census-tract-level neighborhoods in Austin. Identified by `region_id` (1–269) and `region_name`. |
| **DVI** | Displacement Vulnerability Index (0–100). Computed from 3 sub-indices: demographic change (35%), market pressure (35%), socioeconomic stress (30%). Higher = more vulnerable. |
| **DVI Bands** | Low (0–20), Moderate (20–35), High (35–55), Critical (55–75), Severe (75–100) |
| **Anchor Density** | Count of surviving legacy businesses per region. Used with DVI to classify triage urgency. |
| **Anchor Pressure Score** | Ratio of closed-to-total legacy businesses in a region (0–1). |
| **Legacy Business** | Culturally significant business with `culture`, `category`, `yearOpened`, `yearClosed`, `lat/lng`, `pressure` rating. |
| **Triage Categories** | Urgent — Act Now, Critical, Monitor, Post-Displacement. Assigned per region based on DVI + anchor metrics. |
| **Phase 1 Data** | Gemini-audited normalized datasets in `data/phase1_output/`. The single source of truth for all demographic, property, and socioeconomic data. |

---

## 8. Known Architectural Notes

1. **Single data entry point**: `auditedData.js` is the sole importer of the 3 phase1_output JSONs. All downstream modules (`auditedDvi.js`, `interim_*.js`, `math.js`, `useAustinMap.js`, `mapHelpers.js`) consume pre-normalised Maps and arrays from it. This eliminates redundant JSON parsing (previously 4× per file).

2. **GeoJSON isolation**: The ~7.6 MB `final_updated_regions.js` (REGIONS_GEOJSON) is NOT exported from the barrel (`data/index.js`). Only `hooks/useAustinMap.js` imports it directly for Leaflet polygon rendering. All other consumers use `REGION_INDEX` (61 KB, no geometry) for region iteration.

3. **O(1) lookups throughout**: `AUDITED_DEMO_BY_ID`, `AUDITED_PROP_BY_ID`, `AUDITED_SOCIO_BY_ID` (Map<region_id, rows[]>) and `DEMO_BY_RY`, `PROP_BY_RY`, `SOCIO_BY_RY` (Map<"regionId_year", row>) provide constant-time access. Previous O(n) array scans in `math.js` and `mapHelpers.js` have been replaced.

4. **Bundle size**: ~13.6 MB (minified). The GeoJSON polygons dominate. For further reduction, `MapView` could be wrapped in `React.lazy()` to code-split the GeoJSON into an async chunk (the default view is "map" so the benefit is limited to non-map entry points).

5. **Business coverage**: Only ~40 of 269 regions have associated legacy business data. The triage logic accounts for this — regions without businesses are classified purely by DVI.

6. **Property/Socio coverage**: 209 of 269 regions have property and socioeconomic data. 269 regions have demographic data.

7. **Archived files**: `data/_archive/` and `scripts/_archive/` contain obsolete pipeline artifacts (old DVI computation, `regions.js`, audit runners, gap-fill, Gemini prompts). These are not imported by any active code.
