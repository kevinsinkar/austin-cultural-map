# Austin Cultural Map — Architecture & File Dependencies

> **Last updated**: March 21, 2026 (post-Preservation Austin overlay)
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
│
├── src/
│   ├── main.jsx            # React DOM bootstrap (renders <App />)
│   ├── App.jsx             # Thin wrapper → imports AustinCulturalMap from ../index
│   └── index.css           # Base CSS (Vite scaffold)
│
├── components/
│   ├── Header.jsx          # Tab navigation + title bar
│   ├── MapView.jsx         # Leaflet map + slider + overlays + detail sidebar
│   ├── RegionDetailPanel.jsx  # Region detail sidebar (DVI, charts, businesses, PA)
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
│   ├── formatters.js       # fmtPct, fmtChange, pressureDots, catColor
│   └── cpi.js              # CPI-U inflation adjustment (→ 2023 dollars)
│
├── data/
│   ├── index.js            # Barrel re-export (central data import point)
│   ├── phase1_output/      # Source-of-truth: 3 audited normalized JSONs
│   │   ├── audited_demographics_normalized.json
│   │   ├── audited_property_normalized.json
│   │   └── audited_socioeconomic_normalized.json
│   ├── auditedData.js      # Central normaliser: imports phase1 JSONs once,
│   │                        #   exports Maps + flat arrays + (regionId,year) lookups
│   ├── auditedDvi.js       # Computes DVI from auditedData.js pre-normalised data
│   ├── interim_demographics.js   # Enriches demos with derived pct/pop fields
│   ├── interim_property.js       # Pass-through from normalised property rows
│   ├── interim_socioeconomic.js  # Joins socio+property+demo via auditedData Maps
│   ├── businesses.js       # Static legacy business data (41 operating, 52 closed)
│   ├── preservationAustin.js  # ★ PA grants, merit awards, legacy businesses, advocacy (156 entries)
│   ├── constants.js        # REGION_NAMES, SNAP_YEARS, PLAY_YEARS, DEMO_COLORS
│   ├── final_updated_regions.js  # Canonical GeoJSON (269 regions, full polygons)
│   │                        #   Only imported by hooks/useAustinMap.js
│   ├── regionIndex.js      # Lightweight region metadata (centroids, DVI — no geometry)
│   ├── regionLookup.js     # Name↔ID maps, MERGE_LOOKUP, VISIBLE_REGIONS
│   ├── musicNightlife.js   # Music/nightlife venue counts per region/year
│   ├── projectConnect.js   # Transit line polylines + proximity regions
│   ├── timelineInfra.js    # Infrastructure/policy timeline events
│   ├── tippingPoints.js    # Tipping-point narratives per region
│   ├── 01_MASTER_Grants Summary.xlsx - Grants.csv  # Source CSV for PA grants
│   ├── preservation-austin-data-and-prompt.md       # PA data consolidation doc
│   └── _archive/           # Obsolete pipeline artifacts (do not import)
│
├── scripts/
│   ├── audit_region_names.py          # City of Austin official name validation
│   ├── apply_google_maps_names.py     # Google Maps name reconciliation
│   ├── build_master_remap.py          # Duplicate region name disambiguation
│   ├── gemini_google_maps_names.py    # Gemini API semantic name matching
│   ├── gemini_phase3_tasks.py         # Gemini audit recommendations
│   ├── gemini_retry_failed.py         # Retry failed Gemini API calls
│   └── gemini_output/                 # Gemini API output cache
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
data/regionLookup.js               Builds NAME_TO_ID, ID_TO_NAME, MERGE_LOOKUP (from REGION_INDEX)
         │
         ▼
data/index.js                      Barrel re-export (excludes REGIONS_GEOJSON)
         │
         ▼
components/*, utils/*              Consume data via  import { ... } from "../data"
hooks/useAustinMap.js              Imports REGIONS_GEOJSON directly from final_updated_regions.js


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
- **Rows**: ~4811 | **Regions**: 269 unique region_ids
- **Fields**: `year`, `total_population`, `median_age`, `pct_hispanic`, `pct_white_non_hispanic`, `pct_black_non_hispanic`, `pct_asian`, `pct_foreign_born`, `pct_owner_occupied`, `rent_burden_pct`, `pct_65_and_over`, `pct_bachelors_degree_or_higher`, `region`, `region_id`, `audit_source`, `audit_confidence`

### audited_property_normalized.json
- **Rows**: ~2645 | **Regions**: 209 unique region_ids
- **Fields**: `year`, `median_home_value`, `median_rent_monthly`, `commercial_sqft`, `median_property_tax`, `pct_home_value_change_yoy`, `vacancy_rate`, `new_construction_permits`, `total_housing_units`, `region`, `region_id`, `audit_source`, `audit_confidence`

### audited_socioeconomic_normalized.json
- **Rows**: ~2544 | **Regions**: 209 unique region_ids
- **Fields**: `year`, `median_household_income`, `poverty_rate`, `unemployment_rate`, `gini_coefficient`, `pct_uninsured`, `eviction_filing_rate`, `snap_participation_rate`, `dominant_industries[]`, `region`, `region_id`, `audit_source`, `audit_confidence`

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
| `interpolateDvi, interpolateSocio, findPriorSocio` | ./utils/math |
| `Header, AboutModal, AgendaModal, MapView, ErrorBoundary, ComparisonView, TriageView, TimelineView` | ./components/* |

**State managed**: `year`, `viewMode`, `activeRegionId`, `selectedRegion`, `activeFeature`, `hoveredRegion`, `selectedBiz`, `bizTab`, `panelTab`, `showAbout`, `showAgenda`, `isPlaying`, `showHeritage`, `showPins`, `showProjectConnect`, `showMusicVenues`, `showDevPressure`, `showPreservationAustin`, `paFilter`, `selectedPA`, `compA`, `compB`, `tlFilter`

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
| `ID_TO_NAME` | ../data/regionLookup |
| `AUDITED_PROP_BY_ID, AUDITED_SOCIO_BY_ID, closestRow, priorRow, toDemoChartData` | ../data/auditedData |

**Key responsibilities**:
- Overlay toggle toolbar (Heritage, Businesses, Project Connect, Preservation Austin)
- PA sub-toggles in legend (Grant, Merit Award, Legacy Business, Advocacy)
- Time slider with snap years and playback animation
- Passes `leafletMapRef`, `bizMarkersRef`, `paMarkersRef` to RegionDetailPanel for bidirectional linking

#### RegionDetailPanel.jsx
| Import | Source |
|--------|--------|
| `_` | lodash |
| `AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine` | recharts |
| `DEMO_COLORS` | ../data/constants |
| `getDviColor, getDviBand, getDviBandColor, calcAnchorDensity, getAnchorBadge` | ../utils/math |
| `PA_ALL, PA_COLORS, PA_LABELS` | ../data |
| `REGION_INDEX` | ../data |
| `fmtPct, fmtChange, pressureColor, pressureDots` | ../utils/formatters |
| `adjustForInflation` | ../utils/cpi |
| `ChartTooltip` | ./ChartTooltip |

**Tabs**: Demographics, Economics, Culture

**Culture tab features**:
- Tipping point narratives
- Legacy businesses (Still Here / What We Lost sub-tabs)
- Preservation Austin section (proximity-matched PA items when overlay active)
- Bidirectional linking: card click → flyTo + openPopup; map dot click → switch to Culture tab + highlight

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

**Features**: DVI weight sliders (demographic 35%, market 35%, socioeconomic 30%), scatter plot (anchor density vs DVI), sortable triage table, 5 categories (Active Displacement, High Risk/Data Gap, Critical Near Tipping, Monitor, Exclusive/Appreciated)

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
| `LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES` | ../data |
| `AUDITED_PROP_BY_ID` | ../data/auditedData |
| `AUDITED_DVI_LOOKUP` | ../data/auditedDvi |
| `interpolateDvi, getDviColor` | ../utils/math |
| `getDevPressureColor` | ../utils/mapHelpers |
| `PA_ALL, PA_COLORS` | ../data |

**Lifecycle**: 4 useEffect hooks:
1. Map init + GeoJSON layer creation (runs once)
2. Region style update (runs on `year`/`activeRegionId` change)
3. Overlay redraw — business pins, music venues, transit lines, dev-pressure, PA dots (runs on `year`/toggle changes)
4. Cleanup when `selectedRegion` becomes null

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

**Exports**: `lerp`, `interpolateDvi`, `getDviColor`, `getDviBand`, `getDviBandColor`, `getDviTimeSeries`, `interpolateSocio`, `findPriorSocio`, `calcAnchorDensity`, `calcAnchorPressureScore`, `getAnchorBadge`

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

> **Note**: `REGIONS_GEOJSON` (~7.6 MB) is intentionally excluded from the barrel.
> Only `hooks/useAustinMap.js` imports it directly from `./final_updated_regions`
> for Leaflet polygon rendering.

#### Static Data Modules (no imports)
- `businesses.js` → `LEGACY_OPERATING`, `LEGACY_CLOSED`
- `final_updated_regions.js` → `REGIONS_GEOJSON` (269 regions, canonical — only used by useAustinMap.js)
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
| `regionLookup.js` | regionIndex.js | `NAME_TO_ID`, `ID_TO_NAME`, `toId`, `toName`, `VISIBLE_REGIONS`, `MERGE_LOOKUP`, `toPrimaryId`, `getMergedIds` |
| `constants.js` | regionIndex.js | `REGION_NAMES`, `TIMELINE_EVENTS`, `SNAP_YEARS`, `PLAY_YEARS`, `DEMO_COLORS` |

---

## 6. View Routing

The root component (`index.jsx`) renders one of four views based on `viewMode` state:

| viewMode | Component | Description |
|----------|-----------|-------------|
| `"map"` | `MapView` | Leaflet choropleth map with time slider, overlay toggles (Heritage, Businesses, Project Connect, Preservation Austin), and RegionDetailPanel sidebar |
| `"compare"` | `ComparisonView` | Side-by-side region comparison with line charts, all-groups demographic toggle, and summary table |
| `"triage"` | `TriageView` | Grant triage: scatter plot + sortable table classifying 269 regions by DVI tier with adjustable weights |
| `"timeline"` | `TimelineView` | Gantt-style business timeline with DVI overlay, infrastructure event markers, and horizontal scroll |

`Header.jsx` renders the tab bar that sets `viewMode`. `AboutModal` and `AgendaModal` are always-available overlays toggled by `showAbout`/`showAgenda` state.

---

## 7. Key Domain Concepts

| Concept | Description |
|---------|-------------|
| **Region** | One of 269 census-tract-level neighborhoods in Austin. Identified by `region_id` (1–269) and `region_name`. Some have `merge_into` redirects via `MERGE_LOOKUP`. |
| **DVI** | Displacement Vulnerability Index (0–100). Computed from 3 sub-indices: demographic change (35%), market pressure (35%), socioeconomic stress (30%). Higher = more vulnerable. Adjustable weights in TriageView. |
| **DVI Bands** | Stable (0–20), Early Pressure (20–35), Active Displacement (35–55), Historic Displacement (55+). Affluent/excluded regions capped at DVI 20 and shown in neutral slate. |
| **Anchor Density** | `surviving_businesses / (surviving + closed)`. Ratio 0–1. Badge: Strong (>70%), Eroding (40–70%), Critical (<40%). |
| **Anchor Pressure Score** | `(high_pressure_count * 2 + moderate_pressure_count) / surviving_count`. Higher = more threat. |
| **Legacy Business** | Culturally significant business with `culture`, `type`, `est`, `pressure` rating, `lat/lng`. 41 operating + 52 closed. |
| **Triage Categories** | Active Displacement, High Risk/Data Gap, Critical Near Tipping, Monitor, Exclusive/Appreciated. Assigned per region based on DVI + anchor metrics + income threshold. |
| **Preservation Austin** | Overlay layer showing 156 geocoded entries: grants ($284K+ since 2016), merit awards (2022–2025), Legacy Business Month participants (2023–2025), and advocacy milestones. Private residences shown at neighborhood-level centroids. |
| **Phase 1 Data** | Gemini-audited normalized datasets in `data/phase1_output/`. The single source of truth for all demographic, property, and socioeconomic data. |

---

## 8. Preservation Austin Overlay Architecture

The PA overlay is architecturally independent from the census/DVI data pipeline:

```
data/preservationAustin.js          (standalone, no phase1 dependencies)
  │
  ├── PA_GRANTS (72)               type:"grant", with amount field
  ├── PA_MERIT_AWARDS (41)         type:"merit_award"
  ├── PA_LEGACY_BUSINESSES (33)    type:"legacy_business"
  ├── PA_ADVOCACY (10)             type:"advocacy"
  ├── PA_ALL (combined flat array)
  ├── PA_COLORS                    { grant:#7c3aed, merit_award:#2563eb,
  │                                  legacy_business:#d97706, advocacy:#059669 }
  └── PA_LABELS                    Display names per type
```

**State flow** (index.jsx):
- `showPreservationAustin` — master toggle
- `paFilter` — `{ grant: bool, merit_award: bool, legacy_business: bool, advocacy: bool }` sub-toggles
- `selectedPA` — highlighted PA card (set from map dot click)
- `panelTab` — lifted from RegionDetailPanel to enable map→panel navigation

**Bidirectional linking**:
- **Card → Map**: `leafletMapRef.current.flyTo()` + `paMarkersRef.current.get(id).openPopup()` (850ms delay for animation)
- **Map → Panel**: dot click sets `setPanelTab("culture")` + `setSelectedPA(item)`, highlighting the card

**Proximity matching** (RegionDetailPanel Culture tab): PA items within ~0.012 degrees (~1.3 km) of region centroid are shown.

---

## 9. Known Architectural Notes

1. **Single data entry point**: `auditedData.js` is the sole importer of the 3 phase1_output JSONs. All downstream modules consume pre-normalised Maps and arrays from it, eliminating redundant JSON parsing.

2. **GeoJSON isolation**: The ~7.6 MB `final_updated_regions.js` (REGIONS_GEOJSON) is NOT exported from the barrel (`data/index.js`). Only `hooks/useAustinMap.js` imports it directly for Leaflet polygon rendering. All other consumers use `REGION_INDEX` (61 KB, no geometry).

3. **O(1) lookups throughout**: `AUDITED_DEMO_BY_ID`, `AUDITED_PROP_BY_ID`, `AUDITED_SOCIO_BY_ID` (Map<region_id, rows[]>) and `DEMO_BY_RY`, `PROP_BY_RY`, `SOCIO_BY_RY` (Map<"regionId_year", row>) provide constant-time access.

4. **PA data independence**: `preservationAustin.js` has zero dependencies on the phase1 pipeline. It can be updated independently (new grants, awards) without touching the census data flow.

5. **Marker ref storage**: `bizMarkersRef` and `paMarkersRef` (Map<id, L.circleMarker>) are rebuilt on each overlay redraw cycle. They enable programmatic popup opening from panel card clicks.

6. **Lifted panel tab state**: `panelTab` was lifted from local state in RegionDetailPanel to index.jsx to allow map dot clicks to switch the panel to the Culture tab.

7. **Bundle size**: ~13.6 MB (minified). The GeoJSON polygons dominate. For further reduction, `MapView` could be wrapped in `React.lazy()` to code-split the GeoJSON into an async chunk.

8. **Business coverage**: Only ~40 of 269 regions have associated legacy business data. The triage logic accounts for this — regions without businesses are classified purely by DVI.

9. **Property/Socio coverage**: 209 of 269 regions have property and socioeconomic data. 269 regions have demographic data.

10. **Region merging**: Some regions are marked `merge_into` (secondary IDs redirect to primary IDs via `MERGE_LOOKUP`). `VISIBLE_REGIONS` excludes merged secondaries.

11. **Inflation adjustment**: `utils/cpi.js` provides `adjustForInflation()` using CPI-U Austin MSA data. Property and income metrics display both nominal and 2023-constant values.
