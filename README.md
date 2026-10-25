# Austin's Shifting Ground

An interactive data visualization mapping four decades of cultural displacement across Austin, TX (1990–2025). Built for [Preservation Austin](https://www.preservationaustin.org/) to help identify neighborhoods at risk of losing their cultural anchors and prioritize grant intervention.

**Live demo:** _coming soon_

---

## Current focus: PA Community Engagement

The site is currently repurposed as an outreach-planning tool for Preservation Austin's Community Engagement committee. Three tabs are shown (**Map**, **Outreach**, **Strategic Plan**); the analysis views below still exist and work via direct URL (`#/history`, `#/compare`, `#/triage`) — flip `SHOW_ANALYSIS_TABS` in `appConfig.js` to bring their tabs back.

- **Tabling Opportunities layer** — 320 events, recurring series, and civic listening bodies (Oct 2026 – Dec 2027) from the committee's research database, pinned over the DVI choropleth. Pins are colored by tabling status (open to nonprofits / vendor fee / partner-only / listening / unknown) with filters and an upcoming-events horizon. A council-district overlay (official 10-1 boundaries) can be toggled in Layers.
- **Outreach planner** (Outreach tab) — the committee worklist: date-sorted, filterable by status, mission fit, council district, advocacy arena, and type; per-event pipeline stage (identified → contacted → applied → confirmed → tabled) with outcome capture (attendance, signups) on tabled events; notes saved in the browser; CSV export for the monthly meeting; "show on map" drops a pin at the event location.
- **Coverage view** (Outreach tab → Coverage) — displacement need vs. outreach activity per council district and per advocacy arena, flagging "outreach deserts" (high-DVI districts with no confirmed nonprofit-open opportunity). Produces the numbers behind the strategic plan's "reach across all parts of the city," "advocates activated by arena," and "first-time participants" measures. *Caveat: census tracts are assigned to council districts by tract centroid, so a tract straddling a boundary counts entirely toward the district containing its center; events are assigned by pin location, falling back to the database's inferred district when unmapped. Good for coverage reporting — verify against the City's district lookup before citing a specific tract's district.*
- **Equity Audit view** (Outreach tab → Equity Audit) — "how Austin is changing alongside how PA is serving the city": PA's grants, awards, legacy businesses, and advocacy per district against each district's DVI and measured Black+Hispanic share change, plus an east/west-of-I-35 dollars-vs-need split. PA's incoming Homes Tour and Equity Audit datasets plug into `data/equityAudit.js` (the file documents the row shape).
- **Neighborhood story cards** — the "📄 Story card" button on a selected tract opens a printable one-pager for tablers: the data story in plain language, the historic turning point, cultural anchors still standing and lost, and PA's nearby work. Printing shows only the card.
- **Strategic Plan tab** — PA's 2026–2029 mission, vision, pillars, objectives with their measures, and values, with notes on how this tool supports each measure and suggested starting DVI weights per objective. For board-member reference.
- **Adjustable DVI weights** — the "DVI Weights" panel on the map exposes every weight in the index (sub-index balance plus each field within each sub-index), the two methodology rules (vulnerability gate, data-desert boost), and objective-named presets sourced from the same data as the Strategic Plan cards (Participation, Advocacy, Equity Standard, Whole Story, Pipeline). Recalculates live as sliders move, or on demand; custom weights persist locally.

The opportunity data is generated from `preservation_austin_tabling_database.md` by `scripts/parse_tabling_db.py` (add `--geocode` to refresh coordinates via Nominatim; results are cached). Council district boundaries come from `scripts/fetch_council_districts.py` (City of Austin ArcGIS). Re-run the parser whenever the database file is updated.

## Features

- **Interactive Map** — Leaflet-based choropleth of 269 census-tract neighborhoods colored by Displacement Vulnerability Index (DVI). Time slider animates from 1990 to 2025.
- **Region Detail Panel** — Click any region to see DVI trends, demographic breakdowns, property market data, rent burden, and surviving/closed cultural businesses.
- **Grant Triage View** — Scatter plot + sortable table classifying regions into *Active Displacement*, *High Risk / Data Gap*, *Critical — Near Tipping*, *Monitor*, and *Exclusive / Appreciated* tiers. Includes adjustable DVI weight sliders.
- **Comparison View** — Side-by-side comparison of two regions across demographic, economic, and displacement dimensions.
- **Timeline View** — "River of Time" visualization of business openings, closures, and infrastructure/policy events.

## How DVI Works

The Displacement Vulnerability Index combines three sub-indices:

| Sub-Index | Weight | Inputs |
|-----------|--------|--------|
| Demographic Vulnerability | 35% | Rent burden, renter share, foreign-born % |
| Market Pressure | 35% | Home-value appreciation, rent-to-income ratio |
| Socioeconomic Stress | 30% | Poverty rate, unemployment, eviction filings |

Additional refinements:
- **Data Confidence Score** — When audit confidence is low, Socioeconomic Stress weight is boosted to compensate for "data deserts."
- **Vulnerability Gate** — Affluent tracts (income >150% city median + >75% owner-occupancy) are capped at DVI 20 and flagged as *Exclusive / Appreciated* to prevent conflating wealth appreciation with displacement risk.

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
```

## Data Sources

All data lives in `data/phase1_output/` as three audited, normalized JSON files covering 269 regions:

- **Demographics** (1,542 rows; 2000–2023) — population, race/ethnicity, education, rent burden, age
- **Property** (1,052 rows; 2010–2023) — home values, rent, commercial sqft, vacancy, permits
- **Socioeconomic** (1,052 rows; 2010–2023) — income, poverty, unemployment, Gini coefficient, eviction, SNAP

Field coverage is uneven across years (e.g., 2010 has no home-value-appreciation, unemployment, or eviction values): the DVI re-weights across the fields present rather than zero-filling, and cross-year comparisons use only fields measured in both years. See `DATA_METHODOLOGY.md`.

Business data tracks 41 operating and 52 closed cultural anchors with location, founding year, and displacement pressure ratings.

## Project Structure

```
├── src/              # React entry point
├── components/       # UI components (MapView, TriageView, etc.)
├── hooks/            # Leaflet map lifecycle hook
├── utils/            # DVI math, formatting, map helpers
├── data/             # All data files + barrel export
│   └── phase1_output/  # Source-of-truth audited JSONs
├── public/           # Static assets
└── archive/          # Legacy code (not imported)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full file dependency graph and data flow.

## Feedback

Found a mistake or have a suggestion? [Leave feedback here.](https://forms.gle/r3FojhBqyHPzw4mG7)

## License

Private — all rights reserved.
