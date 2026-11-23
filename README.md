# Austin's Shifting Ground

An interactive data visualization mapping four decades of cultural displacement across Austin, TX (1990–2026). Built for [Preservation Austin](https://www.preservationaustin.org/) to help identify neighborhoods at risk of losing their cultural anchors and prioritize grant intervention.

**Live demo:** _coming soon_

---

## Current focus: PA Community Engagement

The site is currently repurposed as an outreach-planning tool for Preservation Austin's Community Engagement committee. It builds in two modes:

| | Public build | Presenter mode |
|---|---|---|
| Command | `npm run build` (and `npm run dev`) | `npm run present` |
| Where it runs | GitHub Pages | This computer only (`localhost`) |
| Views | Map, and a story card page for each place | Map, story cards, Outreach, Strategic Plan, History, Compare, Triage |
| Private data | None — the outreach dataset is replaced by an empty list | Full outreach dataset, including organizer contacts |
| DVI weights | Published defaults, no panel | Adjustable, saved in the browser |

The mode is fixed when the bundle is built (`appConfig.js`, `vite.config.js`), so the public site cannot be switched into presenter mode from the browser, and the other views do not open by direct URL. `npm run check:public` inspects `dist/` and fails if contact details or a presenter-only view are in it; the deploy workflow runs it before publishing. Never upload a presenter build.

Everything below describes presenter mode unless it says otherwise.

- **Tabling Opportunities layer** — 320 events, recurring series, and civic listening bodies (Oct 2026 – Dec 2027) from the committee's research database, pinned over the DVI choropleth. Pins are colored by tabling status (open to nonprofits / vendor fee / partner-only / listening / unknown) with filters and an upcoming-events horizon. A council-district overlay (official 10-1 boundaries) can be toggled in Layers.
- **Outreach planner** (Outreach tab) — the committee worklist: date-sorted, filterable by status, mission fit, council district, advocacy arena, and type; per-event pipeline stage (identified → contacted → applied → confirmed → tabled) with outcome capture (attendance, signups) on tabled events; notes saved in the browser; CSV export for the monthly meeting; "show on map" drops a pin at the event location.
- **Coverage view** (Outreach tab → Coverage) — displacement need vs. outreach activity per council district and per advocacy arena, flagging "outreach deserts" (high-DVI districts with no confirmed nonprofit-open opportunity). Produces the numbers behind the strategic plan's "reach across all parts of the city," "advocates activated by arena," and "first-time participants" measures. *Caveat: census tracts are assigned to council districts by tract centroid, so a tract straddling a boundary counts entirely toward the district containing its center; events are assigned by pin location, falling back to the database's inferred district when unmapped. Good for coverage reporting — verify against the City's district lookup before citing a specific tract's district.*
- **Equity Audit view** (Outreach tab → Equity Audit) — "how Austin is changing alongside how PA is serving the city": PA's grants, awards, legacy businesses, and advocacy per district against each district's DVI and measured Black+Hispanic share change, plus an east/west-of-I-35 dollars-vs-need split. PA's incoming Homes Tour and Equity Audit datasets plug into `data/equityAudit.js` (the file documents the row shape).
- **Neighborhood story cards** — "Open the story card" on a selected place opens a one-page profile for tablers: the data story in plain language, the historic turning point, cultural anchors still standing and lost, and PA's nearby work. Each card is a page with its own short address (`#/card?tract=84`, `#/card?hood=montopolis`), so it can be linked or turned into a QR code; printing shows only the card. Story cards are also in the public build, where the heading carries the site's name rather than Preservation Austin's.
- **Strategic Plan tab** — PA's 2026–2029 mission, vision, pillars, objectives with their measures, and values, with notes on how this tool supports each measure and suggested starting DVI weights per objective. For board-member reference.
- **Adjustable DVI weights** — the "DVI Weights" panel on the map exposes every weight in the index (sub-index balance plus each field within each sub-index), the two methodology rules (vulnerability gate, data-desert boost), and objective-named presets sourced from the same data as the Strategic Plan cards (Participation, Advocacy, Equity Standard, Whole Story, Pipeline). Recalculates live as sliders move, or on demand; custom weights persist locally.

The opportunity data is generated from `private/preservation_austin_tabling_database.md` by `scripts/parse_tabling_db.py`, which writes `private/outreach_events.json` (add `--geocode` to refresh coordinates via Nominatim; results are cached). The `private/` folder is git-ignored: it holds organizer contacts and internal notes, exists only on the keeper's machine, and should be backed up separately. The Outreach planner's **Back up plan** and **Restore…** buttons save and load the pipeline (stages, notes, outcomes), which otherwise lives only in one browser. Council district boundaries come from `scripts/fetch_council_districts.py` (City of Austin ArcGIS). Re-run the parser whenever the database file is updated.

## Features

- **Interactive Map** — Leaflet-based choropleth of 269 census tracts colored by displacement stage (vulnerable, early, dynamic, late, continued loss), decided by the three-part test of the UT "Uprooted" study and checked against the City of Austin's own map. It opens on 2024, the latest census year; the year slider runs from 1990 to 2026. The color key sits above the map and the year controls below it, so nothing covers the map. Works on phones and tablets.
- **Start here** — With nothing selected, the right-hand card states the five ideas the map is built around, each with one thing to do on the map. The numbers in it are computed from the data (`data/bigIdeas.js`).
- **Search** — Find a neighborhood, a census tract number, a tracked cultural anchor or a street address. Everything except the address lookup runs in the browser; an address is sent to OpenStreetMap's Nominatim service only when the person chooses to look it up.
- **Place panel and story card** — Selecting a census tract or a neighborhood opens the same summary panel, which leads to the same story card. Places are titled by neighborhood name where a City of Austin planning area supports one, with the census tract number second (`utils/places.js`).
- **Triage View** (presenter mode) — Three lenses on the displacement stages (Trajectory, Equity, Matrix). Each sorts every tract into a group by a stated rule and shows the measured figures behind it in a chart and a sortable table. No composite score; the formulas are printed under each lens.
- **Comparison View** — Side-by-side comparison of two regions across demographic, economic, and displacement dimensions.
- **Timeline View** — "River of Time" visualization of business openings, closures, and infrastructure/policy events.

## How the Stages Work

Each census tract is put through three tests for each census year from 2010 on (`scripts/build_stages.mjs` → `data/stages.js`):

| Test | Asks | Measures |
|------|------|----------|
| Vulnerable residents | Are residents more exposed to rising housing costs than the five-county region? | Renters, people of color, lower-income households, children in poverty, adults without a bachelor's degree (3 of 5 well above the region) |
| Demographic change since 2000 | Has the population shifted more than the region's? | Owner share, white non-Hispanic share, bachelor's share, median family income |
| Housing market | What have home values done since 2000? | Accelerating, appreciated, or adjacent to tracts that are |

The answers place a tract in a stage: **Vulnerable**, **Early**, **Dynamic**, **Late** or **Continued loss**, or in none. The test is the one in Appendix 3 of the University of Texas study *Uprooted* (2018), which the City of Austin commissioned. Worked out here from census tables, it agrees with the City's own 2022 displacement risk map on the stage of about four tracts in five. Method, departures and limits: [DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §3.

Presenter mode also keeps the earlier 0–100 composite as a **pressure score** (rent burden, renter share, poverty, housing costs; `data/auditedDvi.js`). It describes present-day conditions, feeds the Compare view, and no longer colors the map.

Every formula on the site, with the data behind each term, is on one page: [METHODOLOGY_AT_A_GLANCE.md](METHODOLOGY_AT_A_GLANCE.md). The same page opens from the About dialog. Each formula is marked as published (with its source) or as this site's own; [DATA_METHODOLOGY.md](DATA_METHODOLOGY.md) §12 traces the stage method from Freeman (2005) through Bates (2013) to the UT study and the City of Austin's updates, and explains every choice that is not from research.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Build | Vite 7 |
| Maps | Leaflet |
| Charts | Recharts |
| Data Processing | D3, Lodash |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Regenerate the slim map shapes after any change to tract or neighborhood geometry
npm run build:shapes

# Regenerate tract titles after any change to data/audit_output/tract_npa_overlap.json
npm run build:places

# Regenerate the area-name layer (City planning areas) and its search list
npm run build:areas

# Recompute the displacement stages (runs offline from data/_cache/census_history/;
# add -- --report to print the checks against the City's map)
npm run build:stages

# Rebuild 2000/2010/2015 population, race, owner share and rent burden from
# census tables (runs offline from data/_cache/census_history/)
npm run build:history

# Move the site to a newer census survey: change LATEST_ACS in
# scripts/lib/census.mjs, then run these two (the first pull needs a Census
# API key in CENSUS_API_KEY; add -- --check to build:latest to compare the
# rows already held against their own release without writing anything)
npm run build:latest
npm run build:stages

# Rebuild the light rail overlay from Austin Transit Partnership's published
# layers (add -- --refresh to download them again)
npm run build:rail
```

The map polygons the site loads (`data/shapes/*.min.json`), the tract titles (`data/placeNames.js`), the area-name list (`data/areaNames.js`), the displacement stages (`data/stages.js`) and the Triage lens figures (`data/stageLenses.js`) are generated files that are checked in. The full-precision geometry in `data/final_updated_regions.js` and `data/neighborhoods_geojson.js` is the source and is no longer bundled, which took the first download from about 9.7 MB to about 3.4 MB (a 2.9 MB script plus 0.5 MB of tract shapes, before compression).

## Data Sources

All data lives in `data/phase1_output/` as three audited, normalized JSON files covering 269 regions:

- **Demographics** (1,541 rows; 2000–2024) — population, race/ethnicity, education, rent burden, age
- **Property** (1,052 rows; 2010–2024) — home values, rent, commercial sqft, vacancy, permits
- **Socioeconomic** (1,052 rows; 2010–2024) — income, poverty, unemployment, Gini coefficient, eviction, SNAP

Field coverage is uneven across years (e.g., 2010 has no home-value-appreciation, unemployment, or eviction values): the pressure score re-weights across the fields present rather than zero-filling, and cross-year comparisons use only fields measured in both years. A (region, year) must have at least 3 of the 8 input fields to get a DVI point at all — below that, re-weighting degenerates into echoing a single field (the 2000 rows carry only owner-occupancy, which scored every low-ownership tract a spurious 100), so those years show the nearest measured value with a confidence note instead. See `DATA_METHODOLOGY.md`.

Business data tracks 45 operating and 68 closed cultural anchors with location, founding year, cultural community, and (for closures) cause and replacement.

## Project Structure

```
├── src/              # React entry point
├── components/       # UI components (MapView, TriageView, etc.)
├── hooks/            # Leaflet map lifecycle hook
├── utils/            # DVI math, formatting, map helpers
├── data/             # All data files + barrel export
│   └── phase1_output/  # Source-of-truth audited JSONs
├── public/           # Static assets (published as-is: keep internal files out)
├── docs/             # Working notes and the internal roadmap (not published)
└── archive/          # Legacy code (not imported)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full file dependency graph and data flow.

## Feedback

Found a mistake or have a suggestion? [Leave feedback here.](https://forms.gle/r3FojhBqyHPzw4mG7)

## License

Private — all rights reserved.
