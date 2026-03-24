# fill_census_gaps.py — Quick Start

## What this does

Fills the missing historical data in your three `phase1_output` JSON files by
querying the Census Bureau API directly. Based on analysis of your current data:

| Gap | Regions affected | What it fills from |
|-----|------------------|--------------------|
| Demographics pre-2020 | 171 of 269 regions | Decennial 2000/2010 + ACS 5-Year |
| Property pre-2020 | 170 of 269 regions | ACS 5-Year (2010, 2015) |
| Socioeconomic pre-2020 | 170–173 of 269 regions | ACS 5-Year (2010, 2015) |
| SNAP participation | 100% missing (all years) | ACS B22003 |
| pct_65_and_over | 38% missing | ACS B01001 (age by sex) |
| pct_home_value_change_yoy | 60% missing | Computed from filled home values |
| Unemployment gaps | 99 rows | ACS B23025 |

## Run it

```bash
cd austin-cultural-map/

# Install dependency (only needs requests)
pip install requests

# Preview what it will fetch (no API calls)
python fill_census_gaps.py --dry-run

# Run the full pipeline
python fill_census_gaps.py

# Or with explicit paths
python fill_census_gaps.py \
  --data-dir ./data/phase1_output \
  --output-dir ./data/phase1_output_patched \
  --region-index ./data/regionIndex.js
```

## How it handles the two types of regions

**154 "Tract xxx" regions** — mapped automatically to Census GEOIDs
(e.g., "Tract 22.14" → GEOID 48453002214)

**115 named regions** (e.g., "Bouldin Creek", "Downtown") — the script reads
your `regionIndex.js` to get centroids, then uses the FCC Census Geocoder API
to resolve each lat/lng to a tract GEOID. If regionIndex.js isn't found, it
writes a `region_geoid_manual.json` template you can fill in and re-run.

## Output

Patched JSON files go to `data/phase1_output_patched/` (doesn't overwrite originals).
Once you've verified the output, copy them over:

```bash
cp data/phase1_output_patched/*.json data/phase1_output/
```

## What it CAN'T fill

| Field | Why | Where to get it |
|-------|-----|-----------------|
| eviction_filing_rate | Not in Census | evictionlab.org — bulk download for Travis County |
| commercial_sqft | Not in Census | CoStar or City of Austin commercial permits |
| new_construction_permits | Not in Census | data.austintexas.gov (building permits dataset) |
| Pre-2000 demographics | 1990 tracts differ from 2020 | nhgis.org for crosswalked 1990 data |
| ACS fields at 2000/2005 | ACS didn't start until 2005 (1-yr) / 2009 (5-yr) | Decennial 2000 covers basics; 2005 is interpolated |

## Notes

- **Never overwrites existing data** — only adds rows for (region_id, year) pairs
  that don't exist yet, and patches null fields in existing rows
- **Audit trail** — every new row is tagged with `audit_source`, `audit_notes`,
  and `audit_timestamp` so you know exactly what was backfilled
- **Rate limited** — 0.6s between Census API calls to stay under limits
- **~15 min runtime** depending on how many gaps exist and API response times
