# Austin's Shifting Ground

An interactive data visualization mapping four decades of cultural displacement across Austin, TX (1990–2025). Built for [Preservation Austin](https://www.preservationaustin.org/) to help identify neighborhoods at risk of losing their cultural anchors and prioritize grant intervention.

**Live demo:** _coming soon_

---

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

- **Demographics** (4,811 rows) — population, race/ethnicity, education, rent burden, age
- **Property** (2,645 rows) — home values, rent, commercial sqft, vacancy, permits
- **Socioeconomic** (2,544 rows) — income, poverty, unemployment, Gini coefficient, eviction, SNAP

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
