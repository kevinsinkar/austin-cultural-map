#!/usr/bin/env python3
"""
fill_demographic_history.py
═══════════════════════════
Fills remaining gaps in the demographic composition chart by:

1. Chaining 2000→2010→2020 crosswalks to get Decennial 2000 data for
   regions that are missing it (tracts created after 2000)
2. Interpolating 2005 data from 2000 and 2010 for all regions that
   have both endpoints
3. Adding audit flags so the UI can show "computed from parent tract"
   or "interpolated" indicators

USAGE:
  python fill_demographic_history.py --data-dir data/phase1_output

  Reads audited_demographics_normalized.json, patches it, writes back.
  Uses the cached crosswalk from fill_census_gaps_v2.py if available.
"""

import json
import os
import sys
import time
import argparse
import logging
from pathlib import Path
from collections import defaultdict

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library required. Run: pip install requests")
    sys.exit(1)

CENSUS_API_KEY = "e0d5d0e847730ccb12949d9b18449b2180124203"
STATE_FIPS = "48"
COUNTY_FIPS = "453"
FULL_COUNTY = "48453"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("fill_history")

# ─── Crosswalk Loading ───────────────────────────────────────────────────

def load_crosswalk_2010_2020(cache_dir):
    """Load the cached 2010→2020 crosswalk from fill_census_gaps_v2.py."""
    cache_path = os.path.join(cache_dir, "crosswalk_2010_2020_v2.json")
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            data = json.load(f)
        if data.get("fwd") and data.get("rev"):
            log.info(f"Loaded 2010→2020 crosswalk: {len(data['fwd'])} fwd, {len(data['rev'])} rev")
            return data["fwd"], data["rev"]
    
    log.error(f"No cached crosswalk found at {cache_path}")
    log.error("Run fill_census_gaps_v2.py first to generate the crosswalk cache.")
    sys.exit(1)


def download_crosswalk_2000_2010(cache_dir):
    """
    Download the Census 2000→2010 tract relationship file for Texas.
    Returns: { geoid_2000: [(geoid_2010, weight), ...] }
    """
    cache_path = os.path.join(cache_dir, "crosswalk_2000_2010_tx.json")
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            data = json.load(f)
        if data:
            log.info(f"Loaded 2000→2010 crosswalk: {len(data)} entries")
            return data

    # Census 2010 relationship files: tract-level for Texas
    # Format varies from the 2020 file — need to check
    url = "https://www2.census.gov/geo/docs/maps-data/data/rel/trf_txt/tx48trf.txt"
    log.info("Downloading 2000→2010 tract relationship file for Texas...")
    
    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
    except Exception as e:
        log.error(f"Failed to download 2000→2010 crosswalk: {e}")
        log.info("Falling back to proportional estimation from 2010 data only.")
        return {}

    text = resp.text
    if text.startswith('\ufeff'):
        text = text[1:]

    lines = text.strip().split("\n")
    log.info(f"  File has {len(lines)} lines")
    log.info(f"  First line: {lines[0][:150]}")

    fwd = defaultdict(list)  # 2000_geoid → [(2010_geoid, weight)]

    # The tx48trf.txt file has NO HEADER ROW. It's comma-delimited with this layout:
    # [0]  state_fips_00      e.g. "48"
    # [1]  county_fips_00     e.g. "453"
    # [2]  tract_ce_00        e.g. "001304"
    # [3]  geoid_00           e.g. "48453001304"
    # [4]  pop_00
    # [5]  hu_00              (housing units 2000)
    # [6]  part_flag          "P" = partial, "W" = whole
    # [7]  area_land_00
    # [8]  area_water_00
    # [9]  state_fips_10      e.g. "48"
    # [10] county_fips_10     e.g. "453"
    # [11] tract_ce_10        e.g. "001309"
    # [12] geoid_10           e.g. "48453001309"
    # [13] pop_10
    # [14] hu_10
    # [15] part_flag_10
    # [16] area_land_10
    # [17] area_water_10
    # [18] area_land_part     (intersection area)
    # [19] area_water_part
    # [20+] various percentage columns

    GEOID00_IDX = 3
    GEOID10_IDX = 12
    AREA_LAND_00_IDX = 7
    AREA_LAND_PART_IDX = 18
    HU_00_IDX = 5    # Housing units — better weight for demographic crosswalk
    POP_00_IDX = 4

    # Process ALL lines (no header to skip)
    for line in lines:
        parts = line.split(",")
        if len(parts) < 20:
            continue

        geoid_00 = parts[GEOID00_IDX].strip()
        geoid_10 = parts[GEOID10_IDX].strip()

        # Filter to Travis County (48453)
        if not geoid_00.startswith(FULL_COUNTY):
            continue

        # Use area-based weight: area_land_part / area_land_00
        try:
            area_part = float(parts[AREA_LAND_PART_IDX].strip())
            area_00 = float(parts[AREA_LAND_00_IDX].strip())
            weight = area_part / area_00 if area_00 > 0 else 0
        except (ValueError, IndexError):
            weight = 0

        if weight > 0.001:
            fwd[geoid_00].append((geoid_10, weight))
    
    # Normalize
    for k in fwd:
        total = sum(w for _, w in fwd[k])
        if total > 0:
            fwd[k] = [(g, w/total) for g, w in fwd[k]]
    
    result = dict(fwd)
    log.info(f"  Parsed {len(result)} 2000 tracts for Travis County")
    
    with open(cache_path, "w") as f:
        json.dump(result, f)
    
    return result


def chain_crosswalk_2000_to_2020(xw_2000_2010, fwd_2010_2020):
    """
    Chain: 2000_tract → 2010_tract(s) → 2020_tract(s)
    Returns: { geoid_2020: [(geoid_2000, combined_weight), ...] }
    """
    # First invert fwd_2010_2020 to get 2020→2010
    # (we already have rev_2020_2010, but let's build 2000→2020 directly)
    
    # 2000→2020: for each 2000 tract, follow through 2010, then to 2020
    fwd_2000_2020 = defaultdict(list)
    
    for geoid_2000, mappings_to_2010 in xw_2000_2010.items():
        for geoid_2010, w1 in mappings_to_2010:
            # Now find where this 2010 tract went in 2020
            mappings_to_2020 = fwd_2010_2020.get(geoid_2010, [])
            if not mappings_to_2020:
                # Tract unchanged — use same GEOID
                # (2010 tract that maps 1:1 to 2020)
                fwd_2000_2020[geoid_2010].append((geoid_2000, w1))
            else:
                for geoid_2020, w2 in mappings_to_2020:
                    combined = w1 * w2
                    if combined > 0.001:
                        fwd_2000_2020[geoid_2020].append((geoid_2000, combined))
    
    # Invert to get rev: 2020 → [(2000, weight)]
    rev_2020_2000 = defaultdict(list)
    for geoid_2020, sources in fwd_2000_2020.items():
        for geoid_2000, w in sources:
            rev_2020_2000[geoid_2020].append((geoid_2000, w))
    
    # Normalize
    for k in rev_2020_2000:
        total = sum(w for _, w in rev_2020_2000[k])
        if total > 0:
            rev_2020_2000[k] = [(g, w/total) for g, w in rev_2020_2000[k]]
    
    log.info(f"  Chained crosswalk: {len(rev_2020_2000)} 2020 tracts ← 2000 sources")
    return dict(rev_2020_2000)


# ─── Census API ──────────────────────────────────────────────────────────

DECENNIAL_2000_VARS = ["P001001", "P004005", "P004006", "P004008", "P004002", "H004001", "H004002"]

def query_decennial_2000(api_key):
    """Get all Travis County tract data from Decennial 2000."""
    url = "https://api.census.gov/data/2000/dec/sf1"
    params = {
        "get": ",".join(DECENNIAL_2000_VARS),
        "for": "tract:*",
        "in": f"state:{STATE_FIPS} county:{COUNTY_FIPS}",
        "key": api_key,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    
    results = {}
    headers = data[0]
    for row in data[1:]:
        d = dict(zip(headers, row))
        tract = d.get("tract", "")
        parsed = {}
        for var in DECENNIAL_2000_VARS:
            try:
                parsed[var] = float(d.get(var, 0))
            except (ValueError, TypeError):
                parsed[var] = None
        results[f"{FULL_COUNTY}{tract}"] = parsed  # Key by full GEOID
    
    log.info(f"  Decennial 2000: {len(results)} tracts")
    return results


def safe_pct(num, denom):
    if denom is None or denom == 0 or num is None:
        return None
    return round(num / denom * 100, 2)


def transform_2000(raw, from_parent=False):
    """Transform Decennial 2000 variables to canonical format."""
    total_pop = raw.get("P001001")
    if total_pop is None or total_pop == 0:
        return None
    
    occ = raw.get("H004001")
    own = raw.get("H004002")
    
    flags = []
    notes = "Backfilled from Decennial Census 2000 (P004 Not-Hispanic-by-Race)"
    if from_parent:
        flags.append("COMPUTED_FROM_PARENT_TRACT")
        notes += ". *Computed from parent tract — this tract did not exist in 2000. Demographics are proportionally estimated from the larger tract it was later split from."

    return {
        "year": 2000,
        "total_population": int(round(total_pop)),
        "median_age": None,
        "pct_hispanic": safe_pct(raw.get("P004002"), total_pop),
        "pct_white_non_hispanic": safe_pct(raw.get("P004005"), total_pop),
        "pct_black_non_hispanic": safe_pct(raw.get("P004006"), total_pop),
        "pct_asian": safe_pct(raw.get("P004008"), total_pop),
        "pct_foreign_born": None,
        "pct_owner_occupied": safe_pct(own, occ),
        "rent_burden_pct": None,
        "pct_bachelors_degree_or_higher": None,
        "pct_65_and_over": None,
        "audit_source": "Decennial Census 2000 SF1",
        "audit_confidence": "medium" if from_parent else "high",
        "audit_notes": notes,
        "audit_flags": flags,
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─── Interpolation ──────────────────────────────────────────────────────

def interpolate_year(row_before, row_after, target_year):
    """
    Linearly interpolate between two demographic rows.
    Percentages are interpolated directly (not population-weighted).
    Population is interpolated.
    """
    y1 = row_before["year"]
    y2 = row_after["year"]
    if y1 == y2:
        return None
    
    t = (target_year - y1) / (y2 - y1)
    
    def lerp(a, b):
        if a is None or b is None:
            return a if a is not None else b
        return round(a + (b - a) * t, 2)
    
    def lerp_int(a, b):
        if a is None or b is None:
            return a if a is not None else b
        return int(round(a + (b - a) * t))
    
    return {
        "year": target_year,
        "total_population": lerp_int(row_before.get("total_population"), row_after.get("total_population")),
        "median_age": lerp(row_before.get("median_age"), row_after.get("median_age")),
        "pct_hispanic": lerp(row_before.get("pct_hispanic"), row_after.get("pct_hispanic")),
        "pct_white_non_hispanic": lerp(row_before.get("pct_white_non_hispanic"), row_after.get("pct_white_non_hispanic")),
        "pct_black_non_hispanic": lerp(row_before.get("pct_black_non_hispanic"), row_after.get("pct_black_non_hispanic")),
        "pct_asian": lerp(row_before.get("pct_asian"), row_after.get("pct_asian")),
        "pct_foreign_born": lerp(row_before.get("pct_foreign_born"), row_after.get("pct_foreign_born")),
        "pct_owner_occupied": lerp(row_before.get("pct_owner_occupied"), row_after.get("pct_owner_occupied")),
        "rent_burden_pct": lerp(row_before.get("rent_burden_pct"), row_after.get("rent_burden_pct")),
        "pct_bachelors_degree_or_higher": lerp(row_before.get("pct_bachelors_degree_or_higher"), row_after.get("pct_bachelors_degree_or_higher")),
        "pct_65_and_over": lerp(row_before.get("pct_65_and_over"), row_after.get("pct_65_and_over")),
        "audit_source": f"Interpolated from {y1} and {y2}",
        "audit_confidence": "low",
        "audit_notes": f"Linearly interpolated between {y1} and {y2} data. Not observed Census data.",
        "audit_flags": ["INTERPOLATED"],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─── Main ────────────────────────────────────────────────────────────────

def run(args):
    data_dir = Path(args.data_dir)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    api_key = args.api_key or CENSUS_API_KEY

    # Load existing demographics
    demo_path = data_dir / "audited_demographics_normalized.json"
    with open(demo_path) as f:
        demo_data = json.load(f)
    log.info(f"Loaded {len(demo_data)} demographic rows")

    # Build existing (region_id, year) set and region info
    existing = set()
    regions = {}  # region_id → name
    region_rows = defaultdict(list)  # region_id → [rows sorted by year]
    
    for r in demo_data:
        rid = r.get("region_id")
        yr = r.get("year")
        if rid is not None and yr is not None:
            existing.add((rid, yr))
            regions[rid] = r.get("region", "")
            region_rows[rid].append(r)
    
    for rid in region_rows:
        region_rows[rid].sort(key=lambda x: x.get("year", 0))

    # Build region_id → GEOID mapping from ALL available sources
    rid_to_geoid = {}
    
    # Source 1: "Tract xxx" names in the data
    for r in demo_data:
        rid = r.get("region_id")
        name = r.get("region", "")
        if rid and name.startswith("Tract "):
            tnum = name.replace("Tract ", "").strip()
            parts = tnum.split(".")
            if len(parts) == 2:
                fips = f"{int(parts[0]):04d}{int(parts[1]):02d}"
            else:
                fips = f"{int(float(parts[0])):04d}00"
            rid_to_geoid[rid] = f"{FULL_COUNTY}{fips}"

    # Source 2: manual mapping file (generated by fill_census_gaps_v2.py)
    manual_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "region_geoid_manual.json")
    if os.path.exists(manual_path):
        with open(manual_path) as f:
            manual = json.load(f)
        for rid_str, geoid in manual.items():
            rid = int(rid_str)
            if geoid != "48453XXXXXX" and rid not in rid_to_geoid:
                rid_to_geoid[rid] = geoid
    
    # Source 3: Use regionIndex.js centroids + FCC geocoder for remaining
    region_index_path = args.region_index if hasattr(args, 'region_index') and args.region_index else str(data_dir.parent / "regionIndex.js")
    if os.path.exists(region_index_path):
        import re as _re
        with open(region_index_path) as f:
            content = f.read()
        centroids = {}
        pattern = r'\{[^}]*?"?id"?\s*:\s*(\d+)[^}]*?"?lat"?\s*:\s*([-\d.]+)[^}]*?"?lng"?\s*:\s*([-\d.]+)'
        for m in _re.finditer(pattern, content):
            centroids[int(m.group(1))] = (float(m.group(2)), float(m.group(3)))
        
        missing_geoid = [rid for rid in regions if rid not in rid_to_geoid and rid in centroids]
        if missing_geoid:
            log.info(f"  Geocoding {len(missing_geoid)} regions via FCC API...")
            for i, rid in enumerate(missing_geoid):
                lat, lng = centroids[rid]
                try:
                    url = (f"https://geo.fcc.gov/api/census/block/find"
                           f"?latitude={lat}&longitude={lng}&censusYear=2020&format=json")
                    resp_fcc = requests.get(url, timeout=10)
                    resp_fcc.raise_for_status()
                    fips_full = resp_fcc.json().get("Block", {}).get("FIPS", "")
                    if len(fips_full) >= 11:
                        rid_to_geoid[rid] = fips_full[:11]
                except Exception:
                    pass
                if (i + 1) % 20 == 0:
                    log.info(f"    Geocoded {i+1}/{len(missing_geoid)}...")
                time.sleep(0.3)

    log.info(f"GEOID mapping: {len(rid_to_geoid)} regions")
    
    geoid_to_rid = {v: k for k, v in rid_to_geoid.items()}

    new_rows = []

    # ── PHASE 1: Fill missing 2000 data via chained crosswalk ────────
    missing_2000 = [rid for rid in regions if (rid, 2000) not in existing and rid in rid_to_geoid]
    log.info(f"\n{'='*60}")
    log.info(f"PHASE 1: {len(missing_2000)} regions missing year 2000")

    if missing_2000:
        # Load crosswalks
        fwd_2010_2020, rev_2020_2010 = load_crosswalk_2010_2020(str(cache_dir))
        xw_2000_2010 = download_crosswalk_2000_2010(str(cache_dir))
        
        if xw_2000_2010:
            rev_2020_2000 = chain_crosswalk_2000_to_2020(xw_2000_2010, fwd_2010_2020)
        else:
            # Fallback: use 2010→2020 crosswalk as proxy (less accurate but better than nothing)
            log.info("  Using 2010→2020 crosswalk as proxy for 2000→2020")
            rev_2020_2000 = rev_2020_2010
        
        # Query Decennial 2000
        log.info("  Querying Decennial 2000...")
        raw_2000 = query_decennial_2000(api_key)
        
        count = 0
        for rid in missing_2000:
            geoid_2020 = rid_to_geoid[rid]
            
            # Find 2000 source tracts via crosswalk
            sources = rev_2020_2000.get(geoid_2020, [])
            
            if not sources:
                # Direct match (tract unchanged since 2000)
                if geoid_2020 in raw_2000:
                    row = transform_2000(raw_2000[geoid_2020], from_parent=False)
                    if row:
                        row["region_id"] = rid
                        row["region"] = regions[rid]
                        new_rows.append(row)
                        count += 1
                continue
            
            # Area-weighted aggregation from parent tracts
            weighted = {}
            total_weight = 0
            
            for source_geoid, weight in sources:
                source_data = raw_2000.get(source_geoid)
                if source_data is None:
                    continue
                total_weight += weight
                for var, val in source_data.items():
                    if val is None:
                        continue
                    if var not in weighted:
                        weighted[var] = 0
                    weighted[var] += val * weight
            
            if total_weight > 0 and weighted:
                final = {var: val / total_weight for var, val in weighted.items()}
                row = transform_2000(final, from_parent=True)
                if row:
                    row["region_id"] = rid
                    row["region"] = regions[rid]
                    new_rows.append(row)
                    count += 1
        
        log.info(f"  Added {count} rows for 2000")

    # ── PHASE 2: Interpolate 2005 from 2000 + 2010 ──────────────────
    # Combine existing + new rows for lookup
    all_rows_by_rid = defaultdict(dict)
    for r in demo_data + new_rows:
        rid = r.get("region_id")
        yr = r.get("year")
        if rid is not None and yr is not None:
            all_rows_by_rid[rid][yr] = r

    missing_2005 = [rid for rid in regions if (rid, 2005) not in existing]
    log.info(f"\n{'='*60}")
    log.info(f"PHASE 2: {len(missing_2005)} regions missing year 2005")

    count_2005 = 0
    for rid in missing_2005:
        yr_data = all_rows_by_rid.get(rid, {})
        row_2000 = yr_data.get(2000)
        row_2010 = yr_data.get(2010)
        
        if row_2000 and row_2010:
            interpolated = interpolate_year(row_2000, row_2010, 2005)
            if interpolated:
                interpolated["region_id"] = rid
                interpolated["region"] = regions[rid]
                new_rows.append(interpolated)
                count_2005 += 1
    
    log.info(f"  Interpolated {count_2005} rows for 2005")

    # ── PHASE 3: Also interpolate any other gaps (1995 if desired) ───
    # For now, skip 1995 — the chart starts at 2000 effectively

    # ── Write output ─────────────────────────────────────────────────
    final = demo_data + new_rows
    final.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))

    output_path = demo_path if args.in_place else str(demo_path).replace(".json", "_history.json")
    with open(output_path, "w") as f:
        json.dump(final, f, indent=2)

    log.info(f"\n{'='*60}")
    log.info(f"OUTPUT: {output_path}")
    log.info(f"  Before: {len(demo_data)} rows")
    log.info(f"  After:  {len(final)} rows (+{len(new_rows)})")

    # Coverage summary
    by_year = defaultdict(int)
    for r in final:
        yr = r.get("year")
        if yr:
            by_year[yr] += 1
    log.info(f"  Coverage: {dict(sorted(by_year.items()))}")
    
    # Count flagged rows
    parent_count = sum(1 for r in new_rows if "COMPUTED_FROM_PARENT_TRACT" in (r.get("audit_flags") or []))
    interp_count = sum(1 for r in new_rows if "INTERPOLATED" in (r.get("audit_flags") or []))
    log.info(f"  Computed from parent tract: {parent_count}")
    log.info(f"  Interpolated: {interp_count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fill demographic history gaps")
    parser.add_argument("--data-dir", default="./data/phase1_output")
    parser.add_argument("--cache-dir", default="./.census_cache")
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--region-index", default=None,
                        help="Path to regionIndex.js (default: data_dir/../regionIndex.js)")
    parser.add_argument("--in-place", action="store_true",
                        help="Overwrite the demographics JSON directly")
    args = parser.parse_args()
    run(args)
