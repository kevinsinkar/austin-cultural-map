# Austin Cultural Map — Architecture & File Dependencies

> **Last updated**: March 23, 2026 (post-historical Census data integration)
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
├── ARCHITECTURE.md         # This file
├── agent-todo-list.md      # Task tracker for AI agents
├── census_variable_discovery.json  # Census API variable availability scan
│
├── src/
│   ├── main.jsx            # React DOM bootstrap (renders <App />)
│   ├── App.jsx             # Thin wrapper → imports AustinCulturalMap from ../index
│   └── index.css           # Base CSS (Vite scaffold)
│
├── components/
│   ├── Header.jsx          # Tab navigation + title bar (Map, Compare, Triage)
│   ├── MapView.jsx         # Leaflet map + slider + overlays + detail sidebar
│   ├── RegionDetailPanel.jsx  # Region detail sidebar (DVI, charts, businesses, PA)
│   ├── ComparisonView.jsx  # Side-by-side region comparison
│   ├── TriageView.jsx      # Grant triage & prioritisation (3 lenses: Trajectory, Equity, Risk Matrix)
│   ├── TimelineView.jsx    # "River of Time" business timeline (inactive — button removed from header)
│   ├── TimelineDashboard.jsx  # Timeline dashboard component (WIP)
│   ├── TimelineEras.jsx    # Timeline eras component (WIP)
│   ├── AboutModal.jsx      # Data sources & methodology modal
│   ├── AgendaModal.jsx     # ISSUES.md agenda modal
│   ├── ChartTooltip.jsx    # Custom Recharts tooltip (for area charts)
│   └── ErrorBoundary.jsx   # React error boundary wrapper
│
├── hooks/
│   └── useAustinMap.js     # Leaflet map lifecycle hook
│
├── utils/
│   ├── math.js             # DVI interpolation, triage scoring (trajectory, equity, risk matrix)
│   ├── mapHelpers.js       # Music data lookup, dev-pressure color ramp
│   ├── formatters.js       # fmtPct, fmtChange, pressureDots, catColor
│   ├── cpi.js              # CPI-U inflation adjustment (→ 2023 dollars)
│   └── aggregation.js      # Neighborhood aggregation (pop-weighted DVI, demographics, economics)
│
├── data/
│   ├── index.js            # Barrel re-export (central data import point)
│   ├── phase1_output/      # Source-of-truth: 3 audited normalized JSONs
│   │   ├── audited_demographics_normalized.json   (873 rows, 269 regions, years: 2000–2023)
│   │   ├── audited_property_normalized.json       (736 rows, 269 regions, years: 2010–2023)
│   │   └── audited_socioeconomic_normalized.json  (733 rows, 269 regions, years: 2010–2023)
│   ├── auditedData.js      # Central normaliser: imports phase1 JSONs once,
│   │                        #   exports Maps + flat arrays + (regionId,year) lookups
│   │                        #   Also defines CHART_YEARS and toDemoChartData()
│   ├── auditedDvi.js       # Computes DVI from auditedData.js pre-normalised data
│   ├── interim_demographics.js   # Enriches demos with derived pct/pop fields
│   ├── interim_property.js       # Pass-through from normalised property rows
│   ├── interim_socioeconomic.js  # Joins socio+property+demo via auditedData Maps
│   ├── businesses.js       # Static legacy business data (41 operating, 52 closed)
│   ├── preservationAustin.js  # PA grants, merit awards, legacy businesses, advocacy (156 entries)
│   ├── constants.js        # REGION_NAMES, SNAP_YEARS, PLAY_YEARS, DEMO_COLORS
│   ├── final_updated_regions.js  # Canonical GeoJSON (269 regions, full polygons)
│   │                        #   Only imported by hooks/useAustinMap.js
│   ├── neighborhoods.js    # Neighborhood definitions, TRACT_TO_NEIGHBORHOOD, NEIGHBORHOOD_BY_ID
│   ├── neighborhoods_geojson.js  # Neighborhood GeoJSON polygons (only imported by useAustinMap.js)
│   ├── regionIndex.js      # Lightweight region metadata (centroids, DVI — no geometry)
│   ├── regionLookup.js     # Name↔ID maps, MERGE_LOOKUP, VISIBLE_REGIONS
│   ├── region_tract_rosetta.json  # region_id ↔ Census tract code ↔ GEOID mapping (269 entries)
│   ├── musicNightlife.js   # Music/nightlife venue counts per region/year
│   ├── projectConnect.js   # Transit line polylines + proximity regions
│   ├── timelineInfra.js    # Infrastructure/policy timeline events
│   ├── tippingPoints.js    # Tipping-point narratives per region
│   ├── _cached_npa_boundaries.geojson  # Cached City of Austin NPA boundaries
│   └── _archive/           # Obsolete pipeline artifacts (do not import)
│
├── scripts/
│   ├── fetch_census_data.cjs        # Census Bureau API fetcher (2020/2023 ACS)
│   ├── fetch_historical_census.cjs  # Historical Census data fetcher (2000 SF1, 2010 SF1+ACS, 2015 ACS)
│   ├── build_neighborhoods.cjs      # Builds neighborhood definitions from NPA boundaries + contiguity enforcement
│   ├── audit_neighborhoods.cjs      # Audits neighborhood contiguity (spread, orphan detection)
│   ├── generate_name_candidates.cjs # Region name candidate generation
│   └── _archive/                    # Archived automation scripts
│
├── (root-level data scripts)
│   ├── fill_census_gaps_v2.py       # Census Bureau API backfill for historical gaps (Decennial + ACS + crosswalk)
│   ├── extract_permits.py           # Extracts COA construction permit CSV into region-year aggregates
│   └── merge_permits_and_evictions.py  # Merges permits and (future) eviction data into phase1_output JSONs
│
├── public/
│   ├── ISSUES.md           # Project issues/agenda
│   └── vite.svg            # Vite favicon
│
└── (root-level reference files)
    ├── COA_NPA_REFERENCE.md         # City of Austin NPA reference
    ├── DATA_INTEGRITY_FINDINGS.md   # Data audit findings
    ├── DATA_METHODOLOGY.md          # Data methodology documentation
    ├── FILL_GAPS_README.md          # Census gap-fill documentation
    ├── README.md                    # Project overview
    ├── fill_census_gaps.py          # Python Census gap-fill script v1
    ├── fill_census_gaps_v2.py       # Python Census gap-fill script v2
    ├── extract_permits.py           # Permit data extraction
    ├── inspect_permits.py           # Permit data inspection
    └── merge_permits.py             # Permit data merge
```

---

## 3. Data Flow

```
data/phase1_output/*.json          (3 audited, normalized JSON files — source of truth)
│                                    Demographics: 2000, 2005, 2010, 2015, 2020, 2023
│                                    Property: 2010, 2015, 2020, 2023
│                                    Socioeconomic: 2010, 2015, 2020, 2023
│
└──► data/auditedData.js           ★ SINGLE ENTRY POINT — imports 3 JSONs once, normalises
       │                             field names, then exports:
       │                             • AUDITED_DEMO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID (Maps)
       │                             • NORMALIZED_DEMO, NORMALIZED_PROP, NORMALIZED_SOCIO (flat arrays)
       │                             • DEMO_BY_RY, PROP_BY_RY, SOCIO_BY_RY (regionId_year → row Maps)
       │                             • closestRow(), priorRow(), toDemoChartData() helpers
       │                             • CHART_YEARS constant [1990..2025]
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
data/regionLookup.js               Builds NAME_TO_ID, ID_TO_NAME, MERGE_LOOKUP (from REGION_INDEX)
         │
         ▼
data/index.js                      Barrel re-export (excludes REGIONS_GEOJSON, NEIGHBORHOODS_GEOJSON)
         │
         ▼
components/*, utils/*              Consume data via  import { ... } from "../data"
hooks/useAustinMap.js              Imports REGIONS_GEOJSON and NEIGHBORHOODS_GEOJSON directly


data/preservationAustin.js         ★ STANDALONE — no dependencies on phase1 data
  │                                  Exports: PA_GRANTS, PA_MERIT_AWARDS, PA_LEGACY_BUSINESSES,
  │                                  PA_ADVOCACY, PA_ALL, PA_COLORS, PA_LABELS
  │
  └──► data/index.js (barrel)      Re-exports PA_ALL, PA_COLORS, PA_LABELS
         └──► hooks/useAustinMap.js   (map dot rendering)
         └──► components/RegionDetailPanel.jsx  (Culture tab PA section)
```

---

## 4. Phase 1 Output JSON Schemas

### audited_demographics_normalized.json
- **Rows**: 873 | **Regions**: 269 unique region_ids
- **Years**: 2000 (70 tracts), 2005 (70, interpolated), 2010 (98), 2015 (98), 2020 (269), 2023 (268)
- **Fields**: `year`, `total_population`, `median_age`, `pct_hispanic`, `pct_white_non_hispanic`, `pct_black_non_hispanic`, `pct_asian`, `pct_foreign_born`, `pct_owner_occupied`, `rent_burden_pct`, `pct_65_and_over`, `pct_bachelors_degree_or_higher`, `region`, `region_id`, `audit_source`, `audit_confidence`, `audit_flags`, `audit_timestamp`
- **Sources**: Decennial Census 2000 SF1, Decennial 2010 SF1 + ACS 2006-2010, ACS 2011-2015, Decennial Census 2020 PL + ACS 2016-2020, ACS 2019-2023

### audited_property_normalized.json
- **Rows**: 736 | **Regions**: 269 unique region_ids
- **Years**: 2010 (99), 2015 (99), 2020 (269), 2023 (269)
- **Fields**: `year`, `median_home_value`, `median_rent_monthly`, `total_housing_units`, `vacancy_rate`, `pct_home_value_change_yoy`, `new_construction_permits`, `commercial_sqft`, `region`, `region_id`, `audit_source`, `audit_confidence`, `audit_flags`, `audit_timestamp`
- **Permits data**: `new_construction_permits` populated for ~700 rows, `commercial_sqft` for ~643 rows, sourced from City of Austin Issued Construction Permits (dataset `3syk-w9eu`, 2005–2023)

### audited_socioeconomic_normalized.json
- **Rows**: 733 | **Regions**: 269 unique region_ids
- **Years**: 2010 (96), 2015 (99), 2020 (269), 2023 (269)
- **Fields**: `year`, `median_household_income`, `poverty_rate`, `unemployment_rate`, `gini_coefficient`, `eviction_filing_rate`, `snap_participation_rate`, `region`, `region_id`, `audit_source`, `audit_confidence`, `audit_flags`, `audit_timestamp`

### Historical data coverage notes
- Pre-2020 data only available for tracts whose Census codes match across decades
- 70 tracts have 2000 data (Decennial SF1, non-Hispanic race breakdown)
- ~99 tracts have 2010/2015 data (tracts that existed in 2010 boundaries)
- 269 tracts have 2020/2023 data (full coverage, 2020 boundaries)
- ~170 tracts created after 2010 (suburban expansion, tract splits) have no pre-2020 data
- 2005 data is linearly interpolated from 2000 and 2010

### preservationAustin.js (Preservation Austin Overlay)
- **Entries**: 156 total across 4 categories
- **Grants** (72): `id`, `name`, `lat`, `lng`, `type:"grant"`, `year`, `category`, `amount`, `recipient`, `description`, `address`
- **Merit Awards** (41): same shape, `type:"merit_award"`, no `amount`
- **Legacy Businesses** (33): same shape, `type:"legacy_business"`, no `amount`
- **Advocacy** (10): same shape, `type:"advocacy"`, no `amount`

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
| `ID_TO_NAME` | ./data/regionLookup |
| `REGIONS_GEOJSON` | ./data/final_updated_regions |
| `interpolateDvi, interpolateSocio, findPriorSocio` | ./utils/math |
| `aggregateNeighborhood` | ./utils/aggregation |
| `Header, AboutModal, AgendaModal, MapView, ErrorBoundary, ComparisonView, TriageView, TimelineView` | ./components/* |

**State managed**: `year`, `viewMode`, `activeRegionId`, `selectedRegion`, `activeFeature`, `hoveredRegion`, `selectedBiz`, `bizTab`, `panelTab`, `showAbout`, `showAgenda`, `isPlaying`, `showHeritage`, `showPins`, `showProjectConnect`, `showMusicVenues`, `showDevPressure`, `showRegions`, `showPreservationAustin`, `paFilter`, `selectedPA`, `compA`, `compB`, `tlFilter`, `boundaryMode`, `activeNeighborhoodId`

**View routing**: `viewMode` state → one of `"map"` | `"compare"` | `"triage"` | `"timeline"`

**Cross-view navigation**: `handleLocateOnMap(regionId)` — called from TriageView to switch to map, select a tract, and zoom to it.

---

### Components

#### MapView.jsx
| Import | Source |
|--------|--------|
| `useRef, useMemo` | react |
| `useAustinMap` | ../hooks/useAustinMap |
| `RegionDetailPanel` | ./RegionDetailPanel |
| `SNAP_YEARS, PLAY_YEARS, TIMELINE_EVENTS` | ../data/constants |
| `ID_TO_NAME` | ../data/regionLookup |
| `regionLookupMap` | ../data/regionIndex |
| `AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID, closestRow, priorRow, toDemoChartData` | ../data/auditedData |

**Key responsibilities**:
- Overlay toggle toolbar (Heritage, Businesses, Project Connect, Preservation Austin)
- Boundary mode toggle (Census Tracts / Neighborhoods)
- PA sub-toggles in legend (Grant, Merit Award, Legacy Business, Advocacy)
- Time slider with snap years and playback animation
- Passes `leafletMapRef`, `bizMarkersRef`, `paMarkersRef` to RegionDetailPanel for bidirectional linking

#### RegionDetailPanel.jsx
| Import | Source |
|--------|--------|
| `_` | lodash |
| `AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine` | recharts |
| `DEMO_COLORS` | ../data/constants |
| `getDviColor, getDviBand, getDviBandColor, calcAnchorDensity, getAnchorBadge, interpolateDvi` | ../utils/math |
| `PA_ALL, PA_COLORS, PA_LABELS` | ../data |
| `REGION_INDEX` | ../data |
| `ID_TO_NAME` | ../data/regionLookup |
| `fmtPct, fmtChange, pressureColor, pressureDots` | ../utils/formatters |
| `adjustForInflation` | ../utils/cpi |
| `ChartTooltip` | ./ChartTooltip |

**Tabs**: Demographics, Economics, Culture

**Demographics tab features**:
- Stacked area chart (1990–2025 range, `connectNulls={false}` for gaps)
- Missing-data note explaining why data is absent (tract created after 2010, etc.)
- Population breakdown at nearest year

**Economics tab features**:
- Metric cards showing actual data year when it differs from slider
- Missing-data banner when slider year has no census data
- Inflation-adjusted values (nominal / 2023$) with change arrows

**Culture tab features**:
- Tipping point narratives
- Legacy businesses (Still Here / What We Lost sub-tabs)
- Preservation Austin section (proximity-matched PA items when overlay active)
- Bidirectional linking: card click → flyTo + openPopup; map dot click → switch to Culture tab + highlight

**Neighborhood mode**: When `boundaryMode === "neighborhoods"`, displays aggregated data from `neighborhoodAgg` (pop-weighted DVI, combined demographics, contributing tract list).

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
| `ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell, ReferenceLine` | recharts |
| `VISIBLE_REGIONS` | ../data/regionLookup |
| `calcTrajectory, calcEquityPriority, calcRiskMatrix, getDviBandColor` | ../utils/math |

**Three analysis lenses**:
- **Trajectory**: Where is displacement accelerating fastest? (DVI velocity vs DVI score)
- **Equity**: Which underserved communities need investment most? (equity deficit vs DVI)
- **Risk Matrix**: What type of intervention does each area need? (market pressure vs community vulnerability)

**Features**: DVI weight sliders, scatter plot with category-colored dots, sortable triage table, "Locate on Map" button (calls `onLocateOnMap` prop to navigate to map view)

#### TimelineView.jsx (inactive — button removed from Header)
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
- **No data imports** (pure components, props only)

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
| `regionLookupMap` | ../data/regionIndex |
| `REGIONS_GEOJSON` | ../data/final_updated_regions |
| `NEIGHBORHOODS_GEOJSON` | ../data/neighborhoods_geojson |
| `NEIGHBORHOOD_BY_ID` | ../data/neighborhoods |
| `LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES` | ../data |
| `AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID, closestRow` | ../data/auditedData |
| `AUDITED_DVI_LOOKUP` | ../data/auditedDvi |
| `interpolateDvi, getDviColor` | ../utils/math |
| `getDevPressureColor` | ../utils/mapHelpers |
| `PA_ALL, PA_COLORS` | ../data |

**Lifecycle**: 7 useEffect hooks:
1. Map init + GeoJSON tract layer + neighborhood layer creation (runs once)
2. Region style update (runs on `year`/`activeRegionId` change)
3. Boundary mode switch — swap tract ↔ neighborhood layers (runs on `boundaryMode`)
4. Neighborhood style update (runs on `year`/`activeNeighborhoodId`/`boundaryMode`)
5. Region polygon visibility toggle (runs on `showRegions`/`boundaryMode`)
6. Overlay redraw — business pins, music venues, transit lines, dev-pressure, PA dots (runs on `year`/toggle changes)
7. Auto-zoom to selected region (runs on `activeRegionId` change)
8. Cleanup when `selectedRegion` becomes null

**Overlay layer groups** (created in init, stored in `_overlayLayers`):
- `operatingLayer` — green/amber business pins
- `closedLayer` — gray closed business pins
- `musicLayer` — purple music venue circles
- `pcLayer` — blue dashed transit polylines
- `pressureLayer` — dev pressure outlines
- `paLayer` — Preservation Austin dots (4 colors)

**Marker refs** (for bidirectional linking):
- `bizMarkersRef` — Map<business_id, L.circleMarker>
- `paMarkersRef` — Map<pa_item_id, L.circleMarker>

**Returns**: `{ leafletMapRef, bizMarkersRef, paMarkersRef }`

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

**Exports**: `lerp`, `interpolateDvi`, `getDviColor`, `getDviBand`, `getDviBandColor`, `getDviTimeSeries`, `interpolateSocio`, `findPriorSocio`, `calcAnchorDensity`, `getAnchorBadge`, `calcTrajectory`, `calcEquityPriority`, `calcRiskMatrix`

#### aggregation.js
| Import | Source |
|--------|--------|
| `_` | lodash |
| `NEIGHBORHOOD_BY_ID` | ../data/neighborhoods |
| `AUDITED_DEMO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID, closestRow, priorRow` | ../data/auditedData |
| `LEGACY_OPERATING, LEGACY_CLOSED` | ../data |
| `ID_TO_NAME` | ../data/regionLookup |
| `interpolateDvi` | ./math |

**Exports**: `aggregateNeighborhood(neighborhoodId, year)` — returns pop-weighted DVI, aggregated demographics, property, socioeconomic data, PA items, and contributing tract list.

#### mapHelpers.js
| Import | Source |
|--------|--------|
| `* as d3` | d3 |
| `MUSIC_NIGHTLIFE` | ../data/musicNightlife |
| `AUDITED_PROP_BY_ID` | ../data/auditedData |
| `NAME_TO_ID` | ../data/regionLookup |

**Exports**: `getMusicData`, `getDevPressureColor`

#### cpi.js
- **Exports**: `adjustForInflation(nominal, year)` — converts to 2023 constant dollars using CPI-U Austin MSA data

#### formatters.js
- **No imports** (pure functions)
- **Exports**: `fmtPct`, `fmtChange`, `pressureColor`, `pressureDots`, `catColor`

---

### Data Modules

#### data/index.js (Barrel)
| Export | Source Module |
|--------|--------------|
| `REGION_INDEX` | ./regionIndex |
| `NAME_TO_ID, ID_TO_NAME, toId, toName, VISIBLE_REGIONS, MERGE_LOOKUP, toPrimaryId, getMergedIds` | ./regionLookup |
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
| `PA_ALL, PA_COLORS, PA_LABELS` | ./preservationAustin |

> **Note**: `REGIONS_GEOJSON` (~7.6 MB) and `NEIGHBORHOODS_GEOJSON` are intentionally excluded from the barrel.
> Only `hooks/useAustinMap.js` imports them directly for Leaflet polygon rendering.

#### Static Data Modules (no imports)
- `businesses.js` → `LEGACY_OPERATING`, `LEGACY_CLOSED`
- `final_updated_regions.js` → `REGIONS_GEOJSON` (269 regions, canonical — only used by useAustinMap.js)
- `neighborhoods_geojson.js` → `NEIGHBORHOODS_GEOJSON` (only used by useAustinMap.js)
- `regionIndex.js` → `REGION_INDEX` (61 KB lightweight metadata, no geometry), `regionLookupMap`
- `musicNightlife.js` → `MUSIC_NIGHTLIFE`
- `projectConnect.js` → `PROJECT_CONNECT_LINES`, `PC_PROXIMITY_REGIONS`
- `timelineInfra.js` → `TIMELINE_INFRA`
- `tippingPoints.js` → `TIPPING_POINTS`
- `preservationAustin.js` → `PA_GRANTS`, `PA_MERIT_AWARDS`, `PA_LEGACY_BUSINESSES`, `PA_ADVOCACY`, `PA_ALL`, `PA_COLORS`, `PA_LABELS`

#### Computed Data Modules
| Module | Reads From | Exports |
|--------|-----------|---------|
| `auditedData.js` | phase1_output (3 JSONs) | `AUDITED_DEMO_BY_ID`, `AUDITED_PROP_BY_ID`, `AUDITED_SOCIO_BY_ID`, `NORMALIZED_DEMO`, `NORMALIZED_PROP`, `NORMALIZED_SOCIO`, `DEMO_BY_RY`, `PROP_BY_RY`, `SOCIO_BY_RY`, `closestRow`, `priorRow`, `toDemoChartData` |
| `auditedDvi.js` | auditedData.js (BY_RY Maps) | `AUDITED_DVI_LOOKUP` |
| `interim_demographics.js` | auditedData.js (NORMALIZED_DEMO) | `DEMOGRAPHICS` |
| `interim_property.js` | auditedData.js (NORMALIZED_PROP) | `PROPERTY_DATA` |
| `interim_socioeconomic.js` | auditedData.js (AUDITED_*_BY_ID Maps) | `SOCIOECONOMIC` |
| `neighborhoods.js` | (static data) | `NEIGHBORHOODS`, `TRACT_TO_NEIGHBORHOOD`, `NEIGHBORHOOD_BY_ID`, `NEIGHBORHOOD_NAMES` |
| `regionLookup.js` | regionIndex.js | `NAME_TO_ID`, `ID_TO_NAME`, `toId`, `toName`, `VISIBLE_REGIONS`, `MERGE_LOOKUP`, `toPrimaryId`, `getMergedIds` |
| `constants.js` | regionIndex.js | `REGION_NAMES`, `TIMELINE_EVENTS`, `SNAP_YEARS`, `PLAY_YEARS`, `DEMO_COLORS` |

---

## 6. View Routing

The root component (`index.jsx`) renders one of four views based on `viewMode` state:

| viewMode | Component | Description |
|----------|-----------|-------------|
| `"map"` | `MapView` | Leaflet choropleth map with time slider, overlay toggles (Heritage, Businesses, Project Connect, Preservation Austin), boundary mode toggle (Tracts/Neighborhoods), and RegionDetailPanel sidebar |
| `"compare"` | `ComparisonView` | Side-by-side region comparison with line charts, all-groups demographic toggle, and summary table |
| `"triage"` | `TriageView` | Grant triage: 3 analysis lenses (Trajectory, Equity, Risk Matrix) with scatter plots, sortable tables, "Locate on Map" navigation, and adjustable DVI weights |
| `"timeline"` | `TimelineView` | Business timeline (inactive — button removed from Header, component still exists) |

`Header.jsx` renders the tab bar (Map, Compare, Triage) that sets `viewMode`. `AboutModal` and `AgendaModal` are always-available overlays toggled by `showAbout`/`showAgenda` state.

---

## 7. Key Domain Concepts

| Concept | Description |
|---------|-------------|
| **Region** | One of 269 census-tract-level neighborhoods in Austin. Identified by `region_id` (1–269) and `region_name`. Some have `merge_into` redirects via `MERGE_LOOKUP`. |
| **Neighborhood** | City of Austin Neighborhood Planning Area (NPA). Each contains multiple tracts. Aggregated data computed by `utils/aggregation.js`. |
| **DVI** | Displacement Vulnerability Index (0–100). Computed from 3 sub-indices: demographic change (35%), market pressure (35%), socioeconomic stress (30%). Higher = more vulnerable. Adjustable weights in TriageView. |
| **DVI Bands** | Stable (0–20), Early Pressure (20–35), Active Displacement (35–55), Historic Displacement (55+). Affluent/excluded regions capped at DVI 20 and shown in neutral slate. |
| **Anchor Density** | `surviving_businesses / (surviving + closed)`. Ratio 0–1. Badge: Strong (>70%), Eroding (40–70%), Critical (<40%). |
| **Legacy Business** | Culturally significant business with `culture`, `type`, `est`, `pressure` rating, `lat/lng`. 41 operating + 52 closed. |
| **Triage Lenses** | Trajectory (displacement velocity), Equity (underserved communities), Risk Matrix (intervention type matching). Each lens produces categories and a priority score per region. |
| **Preservation Austin** | Overlay layer showing 156 geocoded entries: grants ($284K+ since 2016), merit awards (2022–2025), Legacy Business Month participants (2023–2025), and advocacy milestones. |
| **Census Data** | Real Census Bureau data fetched via API. Demographics from Decennial SF1 (2000, 2010, 2020) and ACS 5-Year (2010, 2015, 2020, 2023). Race variables use Not-Hispanic-by-Race tables (P004/P005) to avoid double-counting. |
| **Tract Rosetta** | `region_tract_rosetta.json` maps region_id ↔ Census tract code (tractce22) ↔ full GEOID. Essential for Census API queries. |

---

## 8. Scripts

| Script | Purpose |
|--------|---------|
| `scripts/fetch_census_data.cjs` | Fetches ACS 2020/2023 data for all 269 tracts from Census Bureau API |
| `scripts/fetch_historical_census.cjs` | Fetches historical data: 2000 SF1 (P004 non-Hispanic race), 2010 SF1+ACS, 2015 ACS. Merges into existing data files. Interpolates 2005 from 2000+2010. |
| `scripts/build_neighborhoods.cjs` | Builds neighborhood definitions by assigning tracts to NPA polygons. Includes contiguity enforcement that ejects orphan tracts (>2km from nearest neighbor for non-NPA, >3km for NPA) into standalone neighborhoods. |
| `scripts/audit_neighborhoods.cjs` | Audits neighborhood contiguity — reports max spread, orphan tracts, and non-contiguous suspects |
| `scripts/generate_name_candidates.cjs` | Generates region display name candidates |
| `fill_census_gaps_v2.py` | Census Bureau API backfill for 171 regions missing pre-2020 data. Uses Decennial 2000/2010 SF1 and ACS 5-Year estimates with 2010→2020 tract crosswalking. |
| `extract_permits.py` | Extracts City of Austin 1.5GB construction permit CSV (dataset `3syk-w9eu`) into region-year aggregates |
| `merge_permits_and_evictions.py` | Merges permit counts and commercial sqft into `audited_property_normalized.json`. Prepared for future eviction data merge. |

---

## 9. Known Architectural Notes

1. **Single data entry point**: `auditedData.js` is the sole importer of the 3 phase1_output JSONs. All downstream modules consume pre-normalised Maps and arrays from it, eliminating redundant JSON parsing.

2. **GeoJSON isolation**: The ~7.6 MB `final_updated_regions.js` (REGIONS_GEOJSON) and `neighborhoods_geojson.js` (NEIGHBORHOODS_GEOJSON) are NOT exported from the barrel (`data/index.js`). Only `hooks/useAustinMap.js` imports them directly for Leaflet polygon rendering.

3. **O(1) lookups throughout**: `AUDITED_DEMO_BY_ID`, `AUDITED_PROP_BY_ID`, `AUDITED_SOCIO_BY_ID` (Map<region_id, rows[]>) and `DEMO_BY_RY`, `PROP_BY_RY`, `SOCIO_BY_RY` (Map<"regionId_year", row>) provide constant-time access.

4. **PA data independence**: `preservationAustin.js` has zero dependencies on the phase1 pipeline. It can be updated independently (new grants, awards) without touching the census data flow.

5. **Marker ref storage**: `bizMarkersRef` and `paMarkersRef` (Map<id, L.circleMarker>) are rebuilt on each overlay redraw cycle. They enable programmatic popup opening from panel card clicks.

6. **Lifted panel tab state**: `panelTab` was lifted from local state in RegionDetailPanel to index.jsx to allow map dot clicks to switch the panel to the Culture tab.

7. **Dual boundary mode**: Map supports "tracts" (269 census tracts) and "neighborhoods" (137 areas). Neighborhood data is aggregated on-the-fly by `utils/aggregation.js` using population-weighted averages.

8. **Neighborhood contiguity enforcement**: `build_neighborhoods.cjs` ejects orphan tracts whose nearest neighbor in the same neighborhood exceeds a distance threshold (2.0 km for non-NPA sources, 3.0 km for NPA). Ejected tracts become standalone neighborhoods. This prevents distant tracts from being grouped together by radius-based suburban community matching. Audit via `scripts/audit_neighborhoods.cjs`.

8. **Cross-view navigation**: TriageView's "Locate on Map" button calls `handleLocateOnMap(regionId)` in index.jsx, which sets `viewMode="map"`, `boundaryMode="tracts"`, selects the region, and triggers auto-zoom in useAustinMap.

9. **Historical data gaps**: Pre-2020 census data only exists for tracts whose codes match across decades (~70 for 2000, ~99 for 2010/2015). Charts use `connectNulls={false}` to show gaps honestly. Panel shows amber notes explaining missing data.

10. **Census variable compatibility**: The Census Bureau API has different variable tables across decades. 2010 ACS lacks B15003 (use B15002) and B23025 (unemployment unavailable). See `census_variable_discovery.json` for full compatibility matrix.

11. **Inflation adjustment**: `utils/cpi.js` provides `adjustForInflation()` using CPI-U Austin MSA data. Property and income metrics display both nominal and 2023-constant values.

12. **Region merging**: Some regions are marked `merge_into` (secondary IDs redirect to primary IDs via `MERGE_LOOKUP`). `VISIBLE_REGIONS` excludes merged secondaries.

13. **Bundle size**: ~7.5 MB (minified). The GeoJSON polygons dominate. For further reduction, `MapView` could be wrapped in `React.lazy()` to code-split the GeoJSON into an async chunk.
