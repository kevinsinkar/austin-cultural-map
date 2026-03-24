#!/usr/bin/env python3
"""
extract_permits.py
══════════════════
Extracts new_construction_permits and commercial_sqft from the City of Austin
Issued Construction Permits dataset (3syk-w9eu) — a 1.5GB CSV — and produces
a small JSON keyed by (region_id, year) for merging into the property data.

USAGE:
  python extract_permits.py path/to/Issued_Construction_Permits.csv

  Optional:
  python extract_permits.py permits.csv --region-index ./data/regionIndex.js --geoid-map ./region_geoid_manual.json

OUTPUT:
  permits_by_region_year.json — ready to merge into audited_property_normalized.json

APPROACH:
  1. Reads CSV header to auto-detect column names (handles Socrata export variations)
  2. Streams CSV in 50K-row chunks (never loads full 1.5GB into memory)
  3. Filters to Building permits with new-construction work classes
  4. Assigns each permit to a census tract via lat/lng → region_id mapping
  5. Aggregates per (region_id, year): permit count + commercial sqft
"""

import csv
import json
import os
import sys
import time
import argparse
import re
from collections import defaultdict
from pathlib import Path
from math import radians, cos, sqrt

# ─── Column Name Detection ───────────────────────────────────────────────
# Maps canonical names → actual CSV column headers.
# Based on inspect of Issued_Construction_Permits export from data.austintexas.gov.

COLUMN_MAP = {
    "permit_type":      "Permit Type",
    "permit_type_desc": "Permit Type Desc",
    "permit_class":     "Permit Class Mapped",    # "Residential" or "Commercial"
    "permit_class_raw": "Permit Class",           # "R- 103 Two Family Bldgs" etc.
    "work_class":       "Work Class",             # "New", "Remodel", "Repair", etc.
    "description":      "Description",
    "issued_date":      "Issued Date",
    "calendar_year":    "Calendar Year Issued",
    "latitude":         "Latitude",
    "longitude":        "Longitude",
    "location":         "Location",
    "new_sqft":         "Total New Add SQFT",
    "existing_sqft":    "Total Existing Bldg SQFT",
    "valuation":        "Total Job Valuation",
    "housing_units":    "Housing Units",
    "council_district": "Council District",
    "total_lot_sqft":   "Total Lot SQFT",
}


def detect_columns(header):
    """Match CSV header columns to canonical names using the known mapping,
    falling back to case-insensitive matching."""
    header_set = set(header)
    header_lower = {h.lower().strip(): h for h in header}
    detected = {}

    for canonical, expected in COLUMN_MAP.items():
        if expected in header_set:
            detected[canonical] = expected
        else:
            # Fallback: try lowercase/underscore match
            normalized = expected.lower().replace(" ", "_")
            if normalized in header_lower:
                detected[canonical] = header_lower[normalized]

    return detected


def parse_location_point(loc_str):
    """Parse Socrata point format: 'POINT (-97.74 30.27)' or '(30.27, -97.74)'."""
    if not loc_str:
        return None, None
    # POINT (-97.74 30.27)
    m = re.search(r'POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)', loc_str)
    if m:
        return float(m.group(2)), float(m.group(1))  # lat, lng
    # (30.27, -97.74)
    m = re.search(r'\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)', loc_str)
    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        # Sanity: Austin lat ~30, lng ~-97
        if 29 < lat < 31 and -99 < lng < -96:
            return lat, lng
        if 29 < lng < 31 and -99 < lat < -96:
            return lng, lat  # Swapped
    return None, None


# ─── Region Assignment ───────────────────────────────────────────────────

def build_region_centroids(region_index_path=None, geoid_map_path=None):
    """
    Build a list of (region_id, lat, lng) for nearest-centroid assignment.
    Tries regionIndex.js first, falls back to geoid_manual.json.
    """
    centroids = []

    if region_index_path and os.path.exists(region_index_path):
        with open(region_index_path) as f:
            content = f.read()
        pattern = r'\{[^}]*?"?id"?\s*:\s*(\d+)[^}]*?"?lat"?\s*:\s*([-\d.]+)[^}]*?"?lng"?\s*:\s*([-\d.]+)'
        for m in re.finditer(pattern, content):
            centroids.append((int(m.group(1)), float(m.group(2)), float(m.group(3))))
        print(f"  Loaded {len(centroids)} region centroids from regionIndex.js")

    if not centroids:
        print("  WARNING: No regionIndex.js found — permits won't be assigned to regions.")
        print("  Pass --region-index ./data/regionIndex.js")

    return centroids


def find_nearest_region(lat, lng, centroids, max_dist_deg=0.03):
    """Find the nearest region centroid within max_dist_deg (~3.3km)."""
    best_rid = None
    best_dist = max_dist_deg ** 2  # Compare squared distances

    for rid, clat, clng in centroids:
        # Approximate distance (good enough for ~3km range)
        dlat = lat - clat
        dlng = (lng - clng) * cos(radians(lat))
        d2 = dlat * dlat + dlng * dlng
        if d2 < best_dist:
            best_dist = d2
            best_rid = rid

    return best_rid


# ─── Permit Filtering ────────────────────────────────────────────────────


def is_new_construction(row, cols):
    """Check if this permit represents new construction."""
    work_class = (row.get(cols.get("work_class", ""), "") or "").strip().lower()
    return work_class == "new"


def is_building_permit(row, cols):
    """Check if this is a building permit (BP), not electrical/mechanical/plumbing."""
    ptype = (row.get(cols.get("permit_type", ""), "") or "").strip().upper()
    # BP = Building Permit. Exclude: MP (Mechanical), EP (Electrical),
    # PP (Plumbing), DS (Driveway/Sidewalk)
    if ptype == "BP":
        return True
    # Also check Permit Type Desc as fallback
    desc = (row.get(cols.get("permit_type_desc", ""), "") or "").lower()
    return "building permit" in desc


def is_commercial(row, cols):
    """Check if this permit is for commercial construction using Permit Class Mapped."""
    pclass = (row.get(cols.get("permit_class", ""), "") or "").strip().lower()
    if pclass == "commercial":
        return True
    # Fallback: check raw permit class and description
    pclass_raw = (row.get(cols.get("permit_class_raw", ""), "") or "").lower()
    if any(kw in pclass_raw for kw in ["commercial", "office", "retail", "mercantile",
                                        "business", "assembly", "hotel", "industrial",
                                        "warehouse", "mixed use"]):
        return True
    desc = (row.get(cols.get("description", ""), "") or "").lower()
    if any(kw in desc for kw in ["commercial", "office", "retail", "restaurant",
                                  "hotel", "warehouse", "mixed use", "mixed-use"]):
        return True
    return False


def get_year(row, cols):
    """Extract year from the permit."""
    # Calendar Year Issued is a clean integer string like "2026"
    if "calendar_year" in cols:
        yr = (row.get(cols["calendar_year"], "") or "").strip()
        if yr:
            try:
                y = int(float(yr))
                if 1980 <= y <= 2030:
                    return y
            except (ValueError, TypeError):
                pass

    # Fallback: parse Issued Date (format: "2026/03/21")
    if "issued_date" in cols:
        date_str = (row.get(cols["issued_date"], "") or "").strip()
        if date_str:
            m = re.search(r'(\d{4})', date_str)
            if m:
                yr = int(m.group(1))
                if 1980 <= yr <= 2030:
                    return yr
    return None


def get_lat_lng(row, cols):
    """Extract lat/lng from the permit."""
    lat = lng = None

    if "latitude" in cols and "longitude" in cols:
        try:
            lat = float(row.get(cols["latitude"], ""))
            lng = float(row.get(cols["longitude"], ""))
        except (ValueError, TypeError):
            lat = lng = None

    if (lat is None or lng is None) and "location" in cols:
        lat, lng = parse_location_point(row.get(cols["location"], ""))

    # Sanity check for Austin area
    if lat and lng:
        if not (29.5 < lat < 31.0 and -98.5 < lng < -96.5):
            return None, None

    return lat, lng


def parse_number(val):
    """Parse a number that may have commas, dollar signs, or whitespace."""
    if not val:
        return 0
    cleaned = val.strip().replace(",", "").replace("$", "").replace(" ", "")
    if not cleaned:
        return 0
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return 0


def get_sqft(row, cols):
    """Extract new construction square footage."""
    if "new_sqft" in cols:
        sf = parse_number(row.get(cols["new_sqft"], ""))
        if sf > 0:
            return sf
    if "existing_sqft" in cols:
        sf = parse_number(row.get(cols["existing_sqft"], ""))
        if sf > 0:
            return sf
    return 0


# ─── Main Pipeline ──────────────────────────────────────────────────────

def run(args):
    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        print(f"ERROR: File not found: {csv_path}")
        sys.exit(1)

    print(f"Processing: {csv_path} ({csv_path.stat().st_size / 1e9:.1f} GB)")

    # Load region centroids
    print("Loading region centroids...")
    centroids = build_region_centroids(args.region_index)

    # ── Phase 1: Read header and detect columns ──────────────────────
    print("Reading header...")
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)

    print(f"  {len(header)} columns found")
    cols = detect_columns(header)
    print(f"  Detected mappings:")
    for canonical, actual in sorted(cols.items()):
        print(f"    {canonical} → '{actual}'")

    missing_critical = []
    if "latitude" not in cols and "location" not in cols:
        missing_critical.append("latitude/longitude or location")
    if "issued_date" not in cols and "calendar_year" not in cols:
        missing_critical.append("issued_date or calendar_year")

    if missing_critical:
        print(f"\n  WARNING: Missing critical columns: {', '.join(missing_critical)}")
        print(f"  Available columns: {header}")
        print(f"  The script will still run but may produce incomplete results.")

    # ── Phase 2: Stream CSV and filter ───────────────────────────────
    print("\nStreaming CSV (this may take a few minutes for 1.5GB)...")

    # Aggregation buckets
    permits_count = defaultdict(int)        # (region_id, year) → count
    commercial_sqft = defaultdict(float)    # (region_id, year) → total sqft
    total_valuation = defaultdict(float)    # (region_id, year) → total $

    stats = {
        "total_rows": 0,
        "building_permits": 0,
        "new_construction": 0,
        "commercial_new": 0,
        "geocoded": 0,
        "assigned_to_region": 0,
        "no_location": 0,
        "no_year": 0,
    }

    CHUNK_SIZE = 100_000
    t0 = time.time()

    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)

        for row in reader:
            stats["total_rows"] += 1

            if stats["total_rows"] % CHUNK_SIZE == 0:
                elapsed = time.time() - t0
                rate = stats["total_rows"] / elapsed
                print(f"  {stats['total_rows']:,} rows ({rate:,.0f}/sec) — "
                      f"{stats['new_construction']} new construction found")

            # Filter: building permits only
            if not is_building_permit(row, cols):
                continue
            stats["building_permits"] += 1

            # Filter: new construction only
            if not is_new_construction(row, cols):
                continue
            stats["new_construction"] += 1

            # Extract year
            year = get_year(row, cols)
            if year is None:
                stats["no_year"] += 1
                continue

            # Snap to our target years (aggregate to 5-year windows)
            # 2008-2012 → 2010, 2013-2017 → 2015, 2018-2022 → 2020, 2023+ → 2023
            if year <= 2007:
                snap_year = 2005
            elif year <= 2012:
                snap_year = 2010
            elif year <= 2017:
                snap_year = 2015
            elif year <= 2022:
                snap_year = 2020
            else:
                snap_year = 2023

            # Extract location
            lat, lng = get_lat_lng(row, cols)
            if lat is None or lng is None:
                stats["no_location"] += 1
                continue
            stats["geocoded"] += 1

            # Assign to region
            if not centroids:
                continue
            region_id = find_nearest_region(lat, lng, centroids)
            if region_id is None:
                continue
            stats["assigned_to_region"] += 1

            # Count the permit
            key = (region_id, snap_year)
            permits_count[key] += 1

            # Track commercial sqft
            if is_commercial(row, cols):
                stats["commercial_new"] += 1
                sqft = get_sqft(row, cols)
                if sqft > 0:
                    commercial_sqft[key] += sqft

                # Also grab valuation
                if "valuation" in cols:
                    val = parse_number(row.get(cols["valuation"], ""))
                    if val > 0:
                        total_valuation[key] += val

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.1f}s — {stats['total_rows']:,} rows processed")
    print(f"\nStats:")
    for k, v in stats.items():
        print(f"  {k}: {v:,}")

    # ── Phase 3: Build output ────────────────────────────────────────
    output = {}
    all_keys = set(permits_count.keys()) | set(commercial_sqft.keys())

    for region_id, year in sorted(all_keys):
        key_str = f"{region_id}_{year}"
        output[key_str] = {
            "region_id": region_id,
            "year": year,
            "new_construction_permits": permits_count.get((region_id, year), 0),
            "commercial_sqft": round(commercial_sqft.get((region_id, year), 0)),
            "total_valuation": round(total_valuation.get((region_id, year), 0)),
        }

    output_path = Path(args.output or "permits_by_region_year.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nOutput: {output_path}")
    print(f"  {len(output)} (region, year) pairs")
    print(f"  Covers {len(set(k[0] for k in all_keys))} regions")
    print(f"  Years: {sorted(set(k[1] for k in all_keys))}")

    # ── Phase 4: Show how to merge ───────────────────────────────────
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  To merge into your property JSON, run:                      ║
║                                                              ║
║  python merge_permits.py \\                                   ║
║    --permits {output_path} \\                            ║
║    --property data/phase1_output/audited_property_normalized.json ║
║                                                              ║
║  Or use this snippet in Python:                              ║
║                                                              ║
║    import json                                               ║
║    permits = json.load(open('{output_path}'))           ║
║    prop = json.load(open('audited_property_normalized.json'))║
║    for row in prop:                                          ║
║      key = f"{{row['region_id']}}_{{row['year']}}"           ║
║      p = permits.get(key)                                    ║
║      if p:                                                   ║
║        row['new_construction_permits'] = p['new_construction_permits']║
║        row['commercial_sqft'] = p['commercial_sqft']         ║
║    json.dump(prop, open('patched.json','w'), indent=2)       ║
╚══════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract construction permit data for Austin Cultural Map"
    )
    parser.add_argument("csv_path", help="Path to the Issued Construction Permits CSV")
    parser.add_argument("--region-index", default="./data/regionIndex.js",
                        help="Path to regionIndex.js for region assignment")
    parser.add_argument("--output", default=None,
                        help="Output JSON path (default: permits_by_region_year.json)")
    args = parser.parse_args()
    run(args)
