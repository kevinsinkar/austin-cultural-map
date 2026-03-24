#!/usr/bin/env python3
"""
merge_permits_and_evictions.py
══════════════════════════════
Merges construction permit data and eviction data into your phase1_output JSONs.

PERMITS: Straightforward merge by (region_id, year) key.

EVICTIONS: Austin eviction data is by ZIP code, but your regions are census tracts.
This script uses the HUD USPS ZIP-to-Tract crosswalk to distribute ZIP-level
eviction rates across tracts proportionally by residential address count.

USAGE:
  # Permits only (fix for the broken merge_permits.py):
  python merge_permits_and_evictions.py \
    --permits permits_by_region_year.json \
    --property data/phase1_output/audited_property_normalized.json

  # Evictions only:
  python merge_permits_and_evictions.py \
    --evictions eviction_data.csv \
    --socio data/phase1_output/audited_socioeconomic_normalized.json \
    --crosswalk ZIP_TRACT_032025.xlsx \
    --region-index data/regionIndex.js

  # Both at once:
  python merge_permits_and_evictions.py \
    --permits permits_by_region_year.json \
    --property data/phase1_output/audited_property_normalized.json \
    --evictions eviction_data.csv \
    --socio data/phase1_output/audited_socioeconomic_normalized.json \
    --crosswalk ZIP_TRACT_032025.xlsx \
    --region-index data/regionIndex.js

CROSSWALK FILE:
  Download from https://www.huduser.gov/portal/datasets/usps_crosswalk.html
  Select: "ZIP → TRACT", Year: 2024 Q4 (or latest), State: Texas
  Save the Excel file and pass it via --crosswalk

EVICTION DATA:
  Your eviction CSV should have at minimum: zip code, year, and a rate or count.
  The script auto-detects columns. Supported formats:
    - Eviction Lab bulk data (evictionlab.org)
    - Custom CSV with columns like: zip, year, eviction_filing_rate
    - Custom CSV with columns like: zip, year, filings, renter_households
"""

import json
import csv
import os
import re
import sys
import argparse
from collections import defaultdict
from pathlib import Path

# ─── Permit Merge ────────────────────────────────────────────────────────

def merge_permits(permits_path, property_path, output_path=None):
    """Merge permits_by_region_year.json into audited_property_normalized.json."""
    print("=" * 60)
    print("MERGING PERMITS")
    print("=" * 60)

    with open(permits_path) as f:
        permits = json.load(f)
    with open(property_path) as f:
        prop = json.load(f)

    print(f"  Permits: {len(permits)} (region, year) pairs")
    print(f"  Property: {len(prop)} rows")

    matched = 0
    new_permits_added = 0
    new_sqft_added = 0

    for row in prop:
        rid = row.get("region_id")
        yr = row.get("year")
        if rid is None or yr is None:
            continue

        key = f"{rid}_{yr}"
        p = permits.get(key)
        if p:
            matched += 1
            if p.get("new_construction_permits", 0) > 0:
                row["new_construction_permits"] = p["new_construction_permits"]
                new_permits_added += 1
            if p.get("commercial_sqft", 0) > 0:
                row["commercial_sqft"] = p["commercial_sqft"]
                new_sqft_added += 1

    out = output_path or property_path
    with open(out, "w") as f:
        json.dump(prop, f, indent=2)

    print(f"  Matched: {matched} rows")
    print(f"  new_construction_permits filled: {new_permits_added}")
    print(f"  commercial_sqft filled: {new_sqft_added}")
    print(f"  Written to: {out}")
    return prop


# ─── ZIP → Tract Crosswalk ──────────────────────────────────────────────

def load_hud_crosswalk(crosswalk_path):
    """
    Load HUD ZIP-to-Tract crosswalk. Returns:
      { zip_code: [(tract_geoid, res_ratio), ...] }
    
    res_ratio = fraction of the ZIP's residential addresses in that tract.
    """
    ext = Path(crosswalk_path).suffix.lower()
    
    if ext in (".xlsx", ".xls"):
        try:
            import openpyxl
        except ImportError:
            print("ERROR: openpyxl required for Excel files. Run: pip install openpyxl")
            sys.exit(1)
        
        wb = openpyxl.load_workbook(crosswalk_path, read_only=True)
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        header = [str(h).strip().upper() if h else "" for h in next(rows)]
        
        # Find columns
        zip_col = next((i for i, h in enumerate(header) if h in ("ZIP", "ZIPCODE", "ZIP_CODE")), None)
        tract_col = next((i for i, h in enumerate(header) if h in ("TRACT", "GEOID", "TRACT_GEOID")), None)
        ratio_col = next((i for i, h in enumerate(header) if h in ("RES_RATIO", "RESIDENTIAL_RATIO", "RES_RATIO_TRACT")), None)
        
        if zip_col is None or tract_col is None or ratio_col is None:
            print(f"  ERROR: Could not find ZIP/TRACT/RES_RATIO columns in {header}")
            print(f"  Found columns: {header}")
            return {}
        
        crosswalk = defaultdict(list)
        travis_count = 0
        for row in rows:
            if len(row) <= max(zip_col, tract_col, ratio_col):
                continue
            tract = str(row[tract_col] or "").strip()
            # Filter to Travis County (48453)
            if not tract.startswith("48453"):
                continue
            zipcode = str(row[zip_col] or "").strip()
            try:
                ratio = float(row[ratio_col] or 0)
            except (ValueError, TypeError):
                continue
            if ratio > 0:
                crosswalk[zipcode].append((tract, ratio))
                travis_count += 1
        
        wb.close()
        
    elif ext == ".csv":
        crosswalk = defaultdict(list)
        travis_count = 0
        with open(crosswalk_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Try various column names
                tract = (row.get("TRACT") or row.get("tract") or 
                        row.get("GEOID") or row.get("geoid") or "").strip()
                if not tract.startswith("48453"):
                    continue
                zipcode = (row.get("ZIP") or row.get("zip") or 
                          row.get("ZIPCODE") or row.get("zipcode") or "").strip()
                ratio_str = (row.get("RES_RATIO") or row.get("res_ratio") or
                            row.get("RESIDENTIAL_RATIO") or "0")
                try:
                    ratio = float(ratio_str)
                except (ValueError, TypeError):
                    continue
                if ratio > 0:
                    crosswalk[zipcode].append((tract, ratio))
                    travis_count += 1
    else:
        print(f"ERROR: Unsupported crosswalk format: {ext}")
        return {}

    print(f"  Loaded crosswalk: {len(crosswalk)} ZIP codes → {travis_count} Travis County tract mappings")
    return dict(crosswalk)


def build_geoid_to_region_id(region_index_path, demo_data=None):
    """
    Build tract_geoid → region_id mapping.
    Uses regionIndex.js centroids + FCC geocoder, same as the census scripts.
    For speed, also builds from known "Tract xxx" names in the data.
    """
    mapping = {}  # geoid → region_id
    
    # From property data: "Tract xxx" names → GEOID
    if demo_data:
        for r in demo_data:
            name = r.get("region", "")
            rid = r.get("region_id")
            if name.startswith("Tract ") and rid:
                tnum = name.replace("Tract ", "").strip()
                parts = tnum.split(".")
                if len(parts) == 2:
                    fips = f"{int(parts[0]):04d}{int(parts[1]):02d}"
                else:
                    fips = f"{int(float(parts[0])):04d}00"
                geoid = f"48453{fips}"
                mapping[geoid] = rid

    # From regionIndex.js: centroid → GEOID (if manual mapping exists)
    manual_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "region_geoid_manual.json")
    if os.path.exists(manual_path):
        with open(manual_path) as f:
            manual = json.load(f)
        for rid_str, geoid in manual.items():
            if geoid != "48453XXXXXX":
                mapping[geoid] = int(rid_str)
    
    # Also check for the v2 census script's cached mapping
    cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".census_cache", "geoid_mapping.json")
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            cached = json.load(f)
        for rid_str, info in cached.items():
            geoid = info.get("geoid", "")
            if geoid:
                mapping[geoid] = int(rid_str)

    print(f"  GEOID → region_id mapping: {len(mapping)} entries")
    return mapping


# ─── Eviction Data Loading ───────────────────────────────────────────────

def load_eviction_data(eviction_path):
    """
    Load eviction data from CSV. Auto-detects column names.
    Returns: { zip_code: { year: eviction_filing_rate } }
    """
    data = defaultdict(dict)
    
    with open(eviction_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        header_lower = {h.lower().strip(): h for h in header}
        
        print(f"  Eviction CSV columns: {header}")
        
        # Detect columns
        zip_col = None
        for name in ["zip", "zipcode", "zip_code", "zip code", "geoid", "fips"]:
            if name in header_lower:
                zip_col = header_lower[name]
                break
        
        year_col = None
        for name in ["year", "filing_year", "eviction_year"]:
            if name in header_lower:
                year_col = header_lower[name]
                break
        
        rate_col = None
        for name in ["eviction_filing_rate", "filing_rate", "eviction_rate",
                     "eviction filing rate", "filings_rate"]:
            if name in header_lower:
                rate_col = header_lower[name]
                break
        
        filings_col = None
        for name in ["filings", "eviction_filings", "eviction_count",
                     "total_filings", "filing_count"]:
            if name in header_lower:
                filings_col = header_lower[name]
                break
        
        renters_col = None
        for name in ["renter_households", "renter_occupied", "renters",
                     "renter_occupied_households", "total_renters"]:
            if name in header_lower:
                renters_col = header_lower[name]
                break
        
        if zip_col is None:
            print(f"  ERROR: No ZIP column found in {header}")
            return {}
        
        print(f"  Detected: zip={zip_col}, year={year_col}, rate={rate_col}, "
              f"filings={filings_col}, renters={renters_col}")
        
        row_count = 0
        for row in reader:
            zipcode = (row.get(zip_col, "") or "").strip()
            # Clean ZIP to 5 digits
            zipcode = re.sub(r'[^0-9]', '', zipcode)[:5]
            if len(zipcode) != 5:
                continue
            
            # Get year
            if year_col:
                try:
                    year = int(float(row.get(year_col, "")))
                except (ValueError, TypeError):
                    continue
            else:
                year = 2023  # Default if no year column
            
            # Get rate (prefer direct rate, compute from filings/renters if needed)
            rate = None
            if rate_col:
                try:
                    rate = float(row.get(rate_col, ""))
                except (ValueError, TypeError):
                    pass
            
            if rate is None and filings_col and renters_col:
                try:
                    filings = float(row.get(filings_col, ""))
                    renters = float(row.get(renters_col, ""))
                    if renters > 0:
                        rate = (filings / renters) * 100  # per 100 renters
                except (ValueError, TypeError):
                    pass
            
            if rate is not None and rate >= 0:
                # Snap to our target years
                if year <= 2007:
                    snap = 2005
                elif year <= 2012:
                    snap = 2010
                elif year <= 2017:
                    snap = 2015
                elif year <= 2022:
                    snap = 2020
                else:
                    snap = 2023
                
                # Average if we already have this zip+year
                if snap in data[zipcode]:
                    old = data[zipcode][snap]
                    data[zipcode][snap] = (old + rate) / 2
                else:
                    data[zipcode][snap] = rate
                row_count += 1
    
    print(f"  Loaded: {row_count} eviction records across {len(data)} ZIP codes")
    return dict(data)


def distribute_evictions_to_tracts(eviction_data, crosswalk, geoid_to_rid):
    """
    Distribute ZIP-level eviction rates to census tracts using the HUD crosswalk.
    
    For each ZIP, the crosswalk tells us which tracts it covers and what fraction
    of the ZIP's residential addresses are in each tract. Since eviction rates are
    already per-capita (not counts), we assign the ZIP's rate to each constituent
    tract (weighted average if a tract spans multiple ZIPs).
    """
    # tract_geoid → { year: [(rate, weight), ...] }
    tract_rates = defaultdict(lambda: defaultdict(list))
    
    for zipcode, year_rates in eviction_data.items():
        tract_mappings = crosswalk.get(zipcode, [])
        if not tract_mappings:
            continue
        
        for tract_geoid, ratio in tract_mappings:
            for year, rate in year_rates.items():
                tract_rates[tract_geoid][year].append((rate, ratio))
    
    # Compute weighted average rate per tract per year
    result = {}  # (region_id, year) → eviction_filing_rate
    
    for tract_geoid, year_data in tract_rates.items():
        rid = geoid_to_rid.get(tract_geoid)
        if rid is None:
            continue
        
        for year, rate_weights in year_data.items():
            total_weight = sum(w for _, w in rate_weights)
            if total_weight > 0:
                weighted_rate = sum(r * w for r, w in rate_weights) / total_weight
                result[(rid, year)] = round(weighted_rate, 2)
    
    print(f"  Distributed to {len(result)} (region, year) pairs "
          f"across {len(set(k[0] for k in result))} regions")
    return result


def merge_evictions(eviction_rates, socio_path, output_path=None):
    """Merge eviction rates into audited_socioeconomic_normalized.json."""
    with open(socio_path) as f:
        socio = json.load(f)
    
    filled = 0
    for row in socio:
        rid = row.get("region_id")
        yr = row.get("year")
        if rid is None or yr is None:
            continue
        
        rate = eviction_rates.get((rid, yr))
        if rate is not None:
            row["eviction_filing_rate"] = rate
            filled += 1
    
    out = output_path or socio_path
    with open(out, "w") as f:
        json.dump(socio, f, indent=2)
    
    print(f"  Filled eviction_filing_rate in {filled} rows")
    print(f"  Written to: {out}")
    return socio


# ─── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Merge permits and eviction data into phase1_output JSONs"
    )
    
    # Permits
    parser.add_argument("--permits", help="Path to permits_by_region_year.json")
    parser.add_argument("--property", help="Path to audited_property_normalized.json")
    
    # Evictions
    parser.add_argument("--evictions", help="Path to eviction data CSV (by ZIP code)")
    parser.add_argument("--socio", help="Path to audited_socioeconomic_normalized.json")
    parser.add_argument("--crosswalk", help="Path to HUD ZIP-to-Tract crosswalk file (.xlsx or .csv)")
    parser.add_argument("--region-index", help="Path to regionIndex.js")
    
    # Output control
    parser.add_argument("--in-place", action="store_true",
                        help="Overwrite input files (default: write to *_patched.json)")
    
    args = parser.parse_args()
    
    if not args.permits and not args.evictions:
        parser.print_help()
        print("\nERROR: Provide at least --permits or --evictions")
        sys.exit(1)
    
    # ── Permits ──────────────────────────────────────────────────────
    if args.permits:
        if not args.property:
            print("ERROR: --permits requires --property")
            sys.exit(1)
        
        out = args.property if args.in_place else args.property.replace(".json", "_patched.json")
        merge_permits(args.permits, args.property, out)
    
    # ── Evictions ────────────────────────────────────────────────────
    if args.evictions:
        if not args.socio:
            print("ERROR: --evictions requires --socio")
            sys.exit(1)
        if not args.crosswalk:
            print("ERROR: --evictions requires --crosswalk (HUD ZIP-to-Tract file)")
            print("  Download from: https://www.huduser.gov/portal/datasets/usps_crosswalk.html")
            print("  Select: ZIP → TRACT, Year: latest, State: Texas")
            sys.exit(1)
        
        print("\n" + "=" * 60)
        print("MERGING EVICTIONS")
        print("=" * 60)
        
        # Load crosswalk
        print("\nLoading HUD ZIP→Tract crosswalk...")
        crosswalk = load_hud_crosswalk(args.crosswalk)
        if not crosswalk:
            print("ERROR: No crosswalk data loaded")
            sys.exit(1)
        
        # Build GEOID → region_id mapping
        print("\nBuilding GEOID → region_id mapping...")
        # Try to load demo data for tract name mapping
        demo_data = None
        demo_path = None
        if args.property:
            # Same directory as property file likely has demo file
            d = Path(args.property).parent
            demo_path = d / "audited_demographics_normalized.json"
        elif args.socio:
            d = Path(args.socio).parent
            demo_path = d / "audited_demographics_normalized.json"
        
        if demo_path and demo_path.exists():
            with open(demo_path) as f:
                demo_data = json.load(f)
            print(f"  Loaded {len(demo_data)} demo rows for tract name mapping")
        
        geoid_to_rid = build_geoid_to_region_id(args.region_index, demo_data)
        
        # Load eviction data
        print("\nLoading eviction data...")
        eviction_data = load_eviction_data(args.evictions)
        if not eviction_data:
            print("ERROR: No eviction data loaded")
            sys.exit(1)
        
        # Distribute ZIP → tract
        print("\nDistributing eviction rates from ZIPs to census tracts...")
        eviction_rates = distribute_evictions_to_tracts(eviction_data, crosswalk, geoid_to_rid)
        
        # Merge into socio JSON
        print("\nMerging into socioeconomic data...")
        out = args.socio if args.in_place else args.socio.replace(".json", "_patched.json")
        merge_evictions(eviction_rates, args.socio, out)
    
    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    main()
