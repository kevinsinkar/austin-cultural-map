#!/usr/bin/env python3
"""
fill_census_gaps.py
═══════════════════
Fills missing historical data in the Austin Cultural Map's three phase1_output
JSON files by querying the U.S. Census Bureau API.

WHAT IT DOES:
  1. Reads your 3 existing JSON files
  2. Maps each region_id → Census tract GEOID (auto for "Tract xxx" regions,
     centroid-based lookup for named neighborhoods via regionIndex.js)
  3. Queries Census Decennial (2000, 2010) and ACS 5-Year (2010–2023) APIs
  4. Merges new rows into existing data (never overwrites existing rows)
  5. Writes patched JSON files to an output directory

USAGE:
  cd your-project-root/
  pip install requests
  python fill_census_gaps.py

  Or with explicit paths:
  python fill_census_gaps.py --data-dir ./data/phase1_output --region-index ./data/regionIndex.js

PREREQUISITES:
  - Python 3.8+
  - requests library (pip install requests)
  - Your Census API key (set below or via --api-key flag)
"""

import json
import os
import re
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

# ─── Configuration ───────────────────────────────────────────────────────

CENSUS_API_KEY = os.environ.get("CENSUS_API_KEY", "")
COUNTY_FIPS = "453"       # Travis County
STATE_FIPS = "48"         # Texas
BATCH_SIZE = 50           # Tracts per API call (Census limit)
REQUEST_DELAY = 0.6       # Seconds between API calls (stay under rate limit)

# Census API base URLs
DECENNIAL_2000_URL = "https://api.census.gov/data/2000/dec/sf1"
DECENNIAL_2010_URL = "https://api.census.gov/data/2010/dec/sf1"
ACS5_URL_TEMPLATE  = "https://api.census.gov/data/{year}/acs/acs5"

# ─── ACS Table Definitions ──────────────────────────────────────────────
# Each maps a canonical field name → (ACS variable code, optional transform)

DEMO_ACS_VARS = {
    # Population & age
    "total_population":              "B01003_001E",
    "median_age":                    "B01002_001E",
    # Race/ethnicity (from B03002 Hispanic origin by race)
    "_pop_total_b03002":             "B03002_001E",  # denominator
    "_pop_hispanic":                 "B03002_012E",
    "_pop_white_nh":                 "B03002_003E",
    "_pop_black_nh":                 "B03002_004E",
    "_pop_asian_nh":                 "B03002_006E",
    # Foreign-born
    "_pop_foreign_born":             "B05002_013E",
    # Housing tenure
    "_occupied_units":               "B25003_001E",
    "_owner_occupied":               "B25003_002E",
    # Rent burden (B25070: gross rent as % of income)
    "_renters_total":                "B25070_001E",
    "_renters_30_35pct":             "B25070_007E",
    "_renters_35_40pct":             "B25070_008E",
    "_renters_40_50pct":             "B25070_009E",
    "_renters_50plus_pct":           "B25070_010E",
    # Education (B15003: educational attainment 25+)
    "_edu_total":                    "B15003_001E",
    "_edu_bachelors":                "B15003_022E",
    "_edu_masters":                  "B15003_023E",
    "_edu_professional":             "B15003_024E",
    "_edu_doctorate":                "B15003_025E",
    # Age 65+
    "_pop_65_66":                    "B01001_020E",
    "_pop_67_69":                    "B01001_021E",
    "_pop_70_74":                    "B01001_022E",
    "_pop_75_79":                    "B01001_023E",
    "_pop_80_84":                    "B01001_024E",
    "_pop_85_plus":                  "B01001_025E",
    "_pop_f_65_66":                  "B01001_044E",
    "_pop_f_67_69":                  "B01001_045E",
    "_pop_f_70_74":                  "B01001_046E",
    "_pop_f_75_79":                  "B01001_047E",
    "_pop_f_80_84":                  "B01001_048E",
    "_pop_f_85_plus":                "B01001_049E",
}

PROP_ACS_VARS = {
    "median_home_value":             "B25077_001E",
    "median_rent_monthly":           "B25064_001E",
    "total_housing_units":           "B25001_001E",
    "_vacant_units":                 "B25002_003E",
    "_total_units_b25002":           "B25002_001E",
}

SOCIO_ACS_VARS = {
    "median_household_income":       "B19013_001E",
    # Poverty
    "_pov_total":                    "B17001_001E",
    "_pov_below":                    "B17001_002E",
    # Unemployment (B23025: employment status 16+)
    "_labor_force":                  "B23025_002E",
    "_unemployed":                   "B23025_005E",
    # Gini
    "gini_coefficient":              "B19083_001E",
    # SNAP (B22003: receipt of SNAP)
    "_snap_total_hh":                "B22003_001E",  # total households
    "_snap_received":                "B22003_002E",  # households receiving SNAP
    # Insurance (B27001 or S2701 - use B27010 for simplicity)
    "_health_total":                 "B27010_001E",
    "_health_uninsured":             "B27010_017E",
}

# Decennial 2000 SF1 variables
DECENNIAL_2000_VARS = {
    "total_population":  "P001001",
    "_pop_white":        "P003003",
    "_pop_black":        "P003004",
    "_pop_asian":        "P003006",
    "_pop_hispanic":     "P004002",
    "_occupied_units":   "H004001",
    "_owner_occupied":   "H004002",
}

# Decennial 2010 SF1 variables
DECENNIAL_2010_VARS = {
    "total_population":  "P001001",  # Note: 2010 uses P0 prefix format
    "_pop_white_nh":     "P005003",
    "_pop_black_nh":     "P005004",
    "_pop_asian_nh":     "P005006",
    "_pop_hispanic":     "P004003",
    "_occupied_units":   "H004001",
    "_owner_occupied":   "H004002",
}

# ─── Logging ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fill_gaps")

# ─── GEOID Mapping ──────────────────────────────────────────────────────

def tract_name_to_fips(name: str) -> str:
    """Convert 'Tract 22.14' → '002214' (6-digit tract FIPS)."""
    tnum = name.replace("Tract ", "").strip()
    parts = tnum.split(".")
    if len(parts) == 2:
        return f"{int(parts[0]):04d}{int(parts[1]):02d}"
    else:
        return f"{int(float(parts[0])):04d}00"


def build_geoid_mapping(demo_data, region_index_path=None):
    """
    Build region_id → GEOID mapping.
    
    For "Tract xxx" regions: direct conversion.
    For named regions: use centroids from regionIndex.js + FCC geocoder,
    or fall back to a manual mapping file.
    """
    mapping = {}  # region_id (int) → { geoid, tract_fips, name, source }
    named_missing = {}  # region_id → name (needs geocoding)

    # Extract all region names
    regions = {}
    for r in demo_data:
        rid = r.get("region_id")
        name = r.get("region", "")
        if rid is not None and rid not in regions:
            regions[rid] = name

    # Phase 1: Direct mapping from "Tract xxx" names
    for rid, name in regions.items():
        if name.startswith("Tract "):
            fips = tract_name_to_fips(name)
            mapping[rid] = {
                "geoid": f"{STATE_FIPS}{COUNTY_FIPS}{fips}",
                "tract_fips": fips,
                "name": name,
                "source": "tract_name",
            }
        else:
            named_missing[rid] = name

    log.info(f"Phase 1: {len(mapping)} regions mapped from tract names")
    log.info(f"Phase 1: {len(named_missing)} named regions need geocoding")

    # Phase 2: Try regionIndex.js for centroids
    if region_index_path and os.path.exists(region_index_path):
        centroids = parse_region_index(region_index_path)
        if centroids:
            geocoded = geocode_centroids(centroids, named_missing)
            for rid, info in geocoded.items():
                mapping[rid] = info
                named_missing.pop(rid, None)
            log.info(f"Phase 2: {len(geocoded)} regions mapped via centroid geocoding")

    # Phase 3: Check for manual mapping file
    manual_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "region_geoid_manual.json")
    if os.path.exists(manual_path):
        with open(manual_path) as f:
            manual = json.load(f)
        for rid_str, geoid in manual.items():
            rid = int(rid_str)
            if rid in named_missing:
                fips = geoid[-6:]
                mapping[rid] = {
                    "geoid": geoid,
                    "tract_fips": fips,
                    "name": named_missing.pop(rid),
                    "source": "manual",
                }
        log.info(f"Phase 3: {len(manual)} regions from manual mapping file")

    if named_missing:
        log.warning(f"{len(named_missing)} regions still unmapped — will skip these:")
        for rid, name in sorted(named_missing.items()):
            log.warning(f"  region_id={rid}: {name}")

        # Write template for manual completion
        template = {str(rid): "48453XXXXXX" for rid, name in sorted(named_missing.items())}
        template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "region_geoid_manual.json")
        if not os.path.exists(template_path):
            with open(template_path, "w") as f:
                json.dump(template, f, indent=2)
            log.info(f"Wrote template to {template_path} — fill in GEOIDs and re-run")

    return mapping


def parse_region_index(path: str) -> dict:
    """Parse regionIndex.js to extract region_id → {lat, lng} centroids."""
    with open(path, "r") as f:
        content = f.read()

    centroids = {}
    # Match patterns like: { id: 15, name: "Bouldin Creek", lat: 30.24, lng: -97.76, ... }
    # Also handles quoted keys
    pattern = r'\{[^}]*?"?id"?\s*:\s*(\d+)[^}]*?"?lat"?\s*:\s*([-\d.]+)[^}]*?"?lng"?\s*:\s*([-\d.]+)'
    for m in re.finditer(pattern, content):
        rid = int(m.group(1))
        lat = float(m.group(2))
        lng = float(m.group(3))
        centroids[rid] = {"lat": lat, "lng": lng}

    log.info(f"Parsed {len(centroids)} centroids from regionIndex.js")
    return centroids


def geocode_centroids(centroids: dict, named_regions: dict) -> dict:
    """Use FCC Census Geocoder API to resolve lat/lng → tract GEOID."""
    results = {}
    to_geocode = {rid: centroids[rid] for rid in named_regions if rid in centroids}

    if not to_geocode:
        return results

    log.info(f"Geocoding {len(to_geocode)} centroids via FCC API...")

    for i, (rid, coord) in enumerate(to_geocode.items()):
        try:
            url = (
                f"https://geo.fcc.gov/api/census/block/find"
                f"?latitude={coord['lat']}&longitude={coord['lng']}"
                f"&censusYear=2020&format=json"
            )
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            tract_fips = data.get("Block", {}).get("FIPS", "")
            if len(tract_fips) >= 11:
                # FIPS block is 15 digits: state(2)+county(3)+tract(6)+block(4)
                geoid = tract_fips[:11]  # state+county+tract
                fips6 = tract_fips[5:11]
                results[rid] = {
                    "geoid": geoid,
                    "tract_fips": fips6,
                    "name": named_regions[rid],
                    "source": "fcc_geocoder",
                }
        except Exception as e:
            log.warning(f"  Geocode failed for region_id={rid} ({named_regions[rid]}): {e}")

        if (i + 1) % 20 == 0:
            log.info(f"  Geocoded {i+1}/{len(to_geocode)}...")
        time.sleep(0.3)  # Be nice to FCC API

    return results


# ─── Census API Queries ─────────────────────────────────────────────────

def census_query(base_url: str, variables: list, tract_fips_list: list,
                 api_key: str, year: int = None) -> dict:
    """
    Query Census API for a batch of tracts. Returns {tract_fips: {var: value}}.
    """
    var_str = ",".join(variables)
    tract_str = ",".join(tract_fips_list)

    params = {
        "get": var_str,
        "for": f"tract:{tract_str}",
        "in": f"state:{STATE_FIPS} county:{COUNTY_FIPS}",
        "key": api_key,
    }

    try:
        resp = requests.get(base_url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        log.error(f"Census API HTTP error: {e}")
        log.error(f"  URL: {resp.url}")
        log.error(f"  Response: {resp.text[:500]}")
        return {}
    except Exception as e:
        log.error(f"Census API error: {e}")
        return {}

    if not data or len(data) < 2:
        return {}

    headers = data[0]
    results = {}
    for row in data[1:]:
        row_dict = dict(zip(headers, row))
        tract = row_dict.get("tract", "")
        parsed = {}
        for var in variables:
            val = row_dict.get(var)
            if val is not None:
                try:
                    parsed[var] = float(val)
                except (ValueError, TypeError):
                    parsed[var] = None
            else:
                parsed[var] = None
        results[tract] = parsed
    return results


def batch_census_query(base_url: str, variables: list, all_tract_fips: list,
                       api_key: str) -> dict:
    """Query Census API in batches, returns {tract_fips: {var: value}}."""
    all_results = {}
    batches = [all_tract_fips[i:i+BATCH_SIZE] for i in range(0, len(all_tract_fips), BATCH_SIZE)]

    for i, batch in enumerate(batches):
        log.info(f"  Batch {i+1}/{len(batches)} ({len(batch)} tracts)...")
        results = census_query(base_url, variables, batch, api_key)
        all_results.update(results)
        time.sleep(REQUEST_DELAY)

    return all_results


# ─── Data Transforms ────────────────────────────────────────────────────

def safe_pct(numerator, denominator):
    """Compute percentage safely, returning None if denominator is 0 or None."""
    if denominator is None or denominator == 0 or numerator is None:
        return None
    return round(numerator / denominator * 100, 2)


def transform_demo_acs(raw: dict, year: int) -> dict:
    """Transform raw ACS variables into canonical demographic fields."""
    total_pop = raw.get("B01003_001E")
    pop_b03002 = raw.get("B03002_001E") or total_pop

    # Race/ethnicity percentages
    pct_hispanic = safe_pct(raw.get("B03002_012E"), pop_b03002)
    pct_white = safe_pct(raw.get("B03002_003E"), pop_b03002)
    pct_black = safe_pct(raw.get("B03002_004E"), pop_b03002)
    pct_asian = safe_pct(raw.get("B03002_006E"), pop_b03002)

    # Foreign-born
    pct_foreign = safe_pct(raw.get("B05002_013E"), total_pop)

    # Owner-occupied
    occ = raw.get("B25003_001E")
    own = raw.get("B25003_002E")
    pct_owner = safe_pct(own, occ)

    # Rent burden (>=30% of income)
    rent_total = raw.get("B25070_001E")
    rent_burdened = sum(filter(None, [
        raw.get("B25070_007E"), raw.get("B25070_008E"),
        raw.get("B25070_009E"), raw.get("B25070_010E"),
    ]))
    rent_burden = safe_pct(rent_burdened, rent_total)

    # Education (bachelor's+)
    edu_total = raw.get("B15003_001E")
    edu_ba_plus = sum(filter(None, [
        raw.get("B15003_022E"), raw.get("B15003_023E"),
        raw.get("B15003_024E"), raw.get("B15003_025E"),
    ]))
    pct_bachelors = safe_pct(edu_ba_plus, edu_total)

    # Age 65+
    pop_65_plus = sum(filter(None, [
        raw.get("B01001_020E"), raw.get("B01001_021E"),
        raw.get("B01001_022E"), raw.get("B01001_023E"),
        raw.get("B01001_024E"), raw.get("B01001_025E"),
        raw.get("B01001_044E"), raw.get("B01001_045E"),
        raw.get("B01001_046E"), raw.get("B01001_047E"),
        raw.get("B01001_048E"), raw.get("B01001_049E"),
    ]))
    pct_65_over = safe_pct(pop_65_plus, total_pop)

    return {
        "year": year,
        "total_population": int(total_pop) if total_pop else None,
        "median_age": raw.get("B01002_001E"),
        "pct_hispanic": pct_hispanic,
        "pct_white_non_hispanic": pct_white,
        "pct_black_non_hispanic": pct_black,
        "pct_asian": pct_asian,
        "pct_foreign_born": pct_foreign,
        "pct_owner_occupied": pct_owner,
        "rent_burden_pct": rent_burden,
        "pct_bachelors_degree_or_higher": pct_bachelors,
        "pct_65_and_over": pct_65_over,
        "audit_source": f"ACS {year-4}-{year} (5-Year Estimates)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled by fill_census_gaps.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_demo_dec2000(raw: dict) -> dict:
    """Transform Decennial 2000 SF1 into canonical demographics."""
    total_pop = raw.get("P001001")
    pct_hispanic = safe_pct(raw.get("P004002"), total_pop)
    # 2000 SF1 P003 is race alone — not exactly NH but close enough for historical
    pct_white = safe_pct(raw.get("P003003"), total_pop)
    pct_black = safe_pct(raw.get("P003004"), total_pop)
    pct_asian = safe_pct(raw.get("P003006"), total_pop)
    occ = raw.get("H004001")
    own = raw.get("H004002")
    pct_owner = safe_pct(own, occ)

    return {
        "year": 2000,
        "total_population": int(total_pop) if total_pop else None,
        "median_age": None,
        "pct_hispanic": pct_hispanic,
        "pct_white_non_hispanic": pct_white,
        "pct_black_non_hispanic": pct_black,
        "pct_asian": pct_asian,
        "pct_foreign_born": None,  # Not in SF1
        "pct_owner_occupied": pct_owner,
        "rent_burden_pct": None,   # Not in SF1
        "pct_bachelors_degree_or_higher": None,  # Not in SF1
        "pct_65_and_over": None,   # Would need detailed age tables
        "audit_source": "Decennial Census 2000 SF1",
        "audit_confidence": "high",
        "audit_notes": "Backfilled by fill_census_gaps.py. Race data is race-alone (not NH-adjusted).",
        "audit_flags": ["RACE_NOT_NH_ADJUSTED"],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_demo_dec2010(raw: dict) -> dict:
    """Transform Decennial 2010 SF1 into canonical demographics."""
    total_pop = raw.get("P001001")
    pct_hispanic = safe_pct(raw.get("P004003"), total_pop)
    pct_white = safe_pct(raw.get("P005003"), total_pop)
    pct_black = safe_pct(raw.get("P005004"), total_pop)
    pct_asian = safe_pct(raw.get("P005006"), total_pop)
    occ = raw.get("H004001")
    own = raw.get("H004002")
    pct_owner = safe_pct(own, occ)

    return {
        "year": 2010,
        "total_population": int(total_pop) if total_pop else None,
        "median_age": None,
        "pct_hispanic": pct_hispanic,
        "pct_white_non_hispanic": pct_white,
        "pct_black_non_hispanic": pct_black,
        "pct_asian": pct_asian,
        "pct_foreign_born": None,
        "pct_owner_occupied": pct_owner,
        "rent_burden_pct": None,
        "pct_bachelors_degree_or_higher": None,
        "pct_65_and_over": None,
        "audit_source": "Decennial Census 2010 SF1",
        "audit_confidence": "high",
        "audit_notes": "Backfilled by fill_census_gaps.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_prop_acs(raw: dict, year: int) -> dict:
    """Transform raw ACS variables into canonical property fields."""
    total_units = raw.get("B25001_001E")
    total_b25002 = raw.get("B25002_001E") or total_units
    vacant = raw.get("B25002_003E")
    vacancy_rate = safe_pct(vacant, total_b25002)

    home_val = raw.get("B25077_001E")
    rent = raw.get("B25064_001E")

    return {
        "year": year,
        "median_home_value": home_val,
        "median_rent_monthly": rent,
        "total_housing_units": int(total_units) if total_units else None,
        "vacancy_rate": vacancy_rate,
        "commercial_sqft": None,  # Not available from Census
        "new_construction_permits": None,  # Not available from Census
        "median_property_tax": None,  # Would need B25103
        "pct_home_value_change_yoy": None,  # Computed post-hoc
        "audit_source": f"ACS {year-4}-{year} (5-Year Estimates)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled by fill_census_gaps.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_socio_acs(raw: dict, year: int) -> dict:
    """Transform raw ACS variables into canonical socioeconomic fields."""
    income = raw.get("B19013_001E")
    gini = raw.get("B19083_001E")

    pov_total = raw.get("B17001_001E")
    pov_below = raw.get("B17001_002E")
    poverty_rate = safe_pct(pov_below, pov_total)

    labor = raw.get("B23025_002E")
    unemp = raw.get("B23025_005E")
    unemployment_rate = safe_pct(unemp, labor)

    snap_hh = raw.get("B22003_001E")
    snap_recv = raw.get("B22003_002E")
    snap_rate = safe_pct(snap_recv, snap_hh)

    health_total = raw.get("B27010_001E")
    health_unins = raw.get("B27010_017E")
    pct_uninsured = safe_pct(health_unins, health_total)

    return {
        "year": year,
        "median_household_income": income,
        "poverty_rate": poverty_rate,
        "unemployment_rate": unemployment_rate,
        "gini_coefficient": gini,
        "pct_uninsured": pct_uninsured,
        "eviction_filing_rate": None,  # Not available from Census (see Eviction Lab)
        "snap_participation_rate": snap_rate,
        "dominant_industries": None,
        "audit_source": f"ACS {year-4}-{year} (5-Year Estimates)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled by fill_census_gaps.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─── Gap Detection ──────────────────────────────────────────────────────

def find_existing_keys(data: list) -> set:
    """Return set of (region_id, year) tuples present in the data."""
    return {(r["region_id"], r["year"]) for r in data if r.get("region_id") and r.get("year")}


# ─── Main Pipeline ──────────────────────────────────────────────────────

def run(args):
    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    api_key = args.api_key or CENSUS_API_KEY

    # ── Load existing data ───────────────────────────────────────────
    log.info("Loading existing JSON files...")

    demo_path = data_dir / "audited_demographics_normalized.json"
    prop_path = data_dir / "audited_property_normalized.json"
    socio_path = data_dir / "audited_socioeconomic_normalized.json"

    with open(demo_path) as f:
        demo_data = json.load(f)
    with open(prop_path) as f:
        prop_data = json.load(f)
    with open(socio_path) as f:
        socio_data = json.load(f)

    log.info(f"  Demographics: {len(demo_data)} rows")
    log.info(f"  Property: {len(prop_data)} rows")
    log.info(f"  Socioeconomic: {len(socio_data)} rows")

    # ── Build GEOID mapping ──────────────────────────────────────────
    log.info("Building region → GEOID mapping...")
    region_index_path = args.region_index or str(data_dir.parent / "regionIndex.js")
    geoid_map = build_geoid_mapping(demo_data, region_index_path)
    log.info(f"Total mapped: {len(geoid_map)} of 269 regions")

    # Build reverse lookup: tract_fips → region_id
    fips_to_rid = {}
    for rid, info in geoid_map.items():
        fips_to_rid[info["tract_fips"]] = rid

    all_tract_fips = list(set(info["tract_fips"] for info in geoid_map.values()))
    log.info(f"Unique tract FIPS codes: {len(all_tract_fips)}")

    # ── Detect gaps ──────────────────────────────────────────────────
    demo_existing = find_existing_keys(demo_data)
    prop_existing = find_existing_keys(prop_data)
    socio_existing = find_existing_keys(socio_data)

    mapped_rids = set(geoid_map.keys())

    new_demo_rows = []
    new_prop_rows = []
    new_socio_rows = []

    # ── Query Decennial 2000 (Demographics only) ─────────────────────
    need_2000 = [rid for rid in mapped_rids if (rid, 2000) not in demo_existing]
    if need_2000:
        log.info(f"\n{'='*60}")
        log.info(f"DECENNIAL 2000: Fetching demographics for {len(need_2000)} regions")
        tracts_2000 = [geoid_map[rid]["tract_fips"] for rid in need_2000]
        # Deduplicate (multiple region_ids might share a tract after merging)
        tracts_2000 = list(set(tracts_2000))
        vars_2000 = list(DECENNIAL_2000_VARS.values())

        raw_2000 = batch_census_query(DECENNIAL_2000_URL, vars_2000, tracts_2000, api_key)
        log.info(f"  Got data for {len(raw_2000)} tracts")

        for tract_fips, raw in raw_2000.items():
            rid = fips_to_rid.get(tract_fips)
            if rid is None:
                continue
            row = transform_demo_dec2000(raw)
            row["region_id"] = rid
            row["region"] = geoid_map[rid]["name"]
            new_demo_rows.append(row)
    else:
        log.info("Decennial 2000: No gaps to fill")

    # ── Query Decennial 2010 (Demographics only) ─────────────────────
    need_2010_demo = [rid for rid in mapped_rids if (rid, 2010) not in demo_existing]
    if need_2010_demo:
        log.info(f"\n{'='*60}")
        log.info(f"DECENNIAL 2010: Fetching demographics for {len(need_2010_demo)} regions")
        tracts_2010 = list(set(geoid_map[rid]["tract_fips"] for rid in need_2010_demo))
        vars_2010 = list(DECENNIAL_2010_VARS.values())

        raw_2010 = batch_census_query(DECENNIAL_2010_URL, vars_2010, tracts_2010, api_key)
        log.info(f"  Got data for {len(raw_2010)} tracts")

        for tract_fips, raw in raw_2010.items():
            rid = fips_to_rid.get(tract_fips)
            if rid is None:
                continue
            row = transform_demo_dec2010(raw)
            row["region_id"] = rid
            row["region"] = geoid_map[rid]["name"]
            new_demo_rows.append(row)
    else:
        log.info("Decennial 2010: No gaps to fill")

    # ── Query ACS 5-Year for each target year ────────────────────────
    # ACS 5-year: 2010 = 2006-2010 estimates, available from data year 2009+
    # We query: 2010, 2015, 2020, 2023
    acs_years = [2010, 2015, 2020, 2023]

    for acs_year in acs_years:
        log.info(f"\n{'='*60}")
        log.info(f"ACS 5-YEAR {acs_year}")

        # Demographics
        need_demo = [rid for rid in mapped_rids if (rid, acs_year) not in demo_existing]
        # But if we just added a decennial row for this year, skip
        already_added = {r["region_id"] for r in new_demo_rows if r["year"] == acs_year}
        need_demo = [rid for rid in need_demo if rid not in already_added]

        if need_demo:
            log.info(f"  Demographics: {len(need_demo)} regions missing")
            tracts = list(set(geoid_map[rid]["tract_fips"] for rid in need_demo))
            acs_url = ACS5_URL_TEMPLATE.format(year=acs_year)
            vars_list = list(DEMO_ACS_VARS.values())

            raw = batch_census_query(acs_url, vars_list, tracts, api_key)
            log.info(f"  Got data for {len(raw)} tracts")

            for tract_fips, raw_row in raw.items():
                rid = fips_to_rid.get(tract_fips)
                if rid is None or rid in already_added:
                    continue
                row = transform_demo_acs(raw_row, acs_year)
                row["region_id"] = rid
                row["region"] = geoid_map[rid]["name"]
                new_demo_rows.append(row)

        # Property
        need_prop = [rid for rid in mapped_rids if (rid, acs_year) not in prop_existing]
        if need_prop:
            log.info(f"  Property: {len(need_prop)} regions missing")
            tracts = list(set(geoid_map[rid]["tract_fips"] for rid in need_prop))
            acs_url = ACS5_URL_TEMPLATE.format(year=acs_year)
            vars_list = list(PROP_ACS_VARS.values())

            raw = batch_census_query(acs_url, vars_list, tracts, api_key)
            log.info(f"  Got data for {len(raw)} tracts")

            for tract_fips, raw_row in raw.items():
                rid = fips_to_rid.get(tract_fips)
                if rid is None:
                    continue
                if (rid, acs_year) in prop_existing:
                    continue
                row = transform_prop_acs(raw_row, acs_year)
                row["region_id"] = rid
                row["region"] = geoid_map[rid]["name"]
                new_prop_rows.append(row)

        # Socioeconomic
        need_socio = [rid for rid in mapped_rids if (rid, acs_year) not in socio_existing]
        if need_socio:
            log.info(f"  Socioeconomic: {len(need_socio)} regions missing")
            tracts = list(set(geoid_map[rid]["tract_fips"] for rid in need_socio))
            acs_url = ACS5_URL_TEMPLATE.format(year=acs_year)
            vars_list = list(SOCIO_ACS_VARS.values())

            raw = batch_census_query(acs_url, vars_list, tracts, api_key)
            log.info(f"  Got data for {len(raw)} tracts")

            for tract_fips, raw_row in raw.items():
                rid = fips_to_rid.get(tract_fips)
                if rid is None:
                    continue
                if (rid, acs_year) in socio_existing:
                    continue
                row = transform_socio_acs(raw_row, acs_year)
                row["region_id"] = rid
                row["region"] = geoid_map[rid]["name"]
                new_socio_rows.append(row)

    # ── Also patch SNAP and eviction gaps in EXISTING rows ───────────
    # Your existing 2020+2023 rows have 0% SNAP and eviction data.
    # We can fill SNAP from ACS for rows that already exist.
    log.info(f"\n{'='*60}")
    log.info("PATCHING: Filling SNAP/unemployment gaps in existing socio rows")

    socio_by_ry = {}
    for r in socio_data:
        key = (r.get("region_id"), r.get("year"))
        socio_by_ry[key] = r

    patch_count = 0
    for acs_year in [2020, 2023]:
        rids_needing_snap = [
            rid for rid in mapped_rids
            if (rid, acs_year) in socio_existing
            and socio_by_ry.get((rid, acs_year), {}).get("snap_participation_rate") is None
        ]
        if not rids_needing_snap:
            continue

        log.info(f"  SNAP patch for {acs_year}: {len(rids_needing_snap)} regions")
        tracts = list(set(geoid_map[rid]["tract_fips"] for rid in rids_needing_snap if rid in geoid_map))
        acs_url = ACS5_URL_TEMPLATE.format(year=acs_year)
        # Just SNAP + unemployment vars
        snap_vars = ["B22003_001E", "B22003_002E", "B23025_002E", "B23025_005E"]

        raw = batch_census_query(acs_url, snap_vars, tracts, api_key)
        for tract_fips, raw_row in raw.items():
            rid = fips_to_rid.get(tract_fips)
            if rid is None:
                continue
            existing_row = socio_by_ry.get((rid, acs_year))
            if existing_row is None:
                continue

            snap_hh = raw_row.get("B22003_001E")
            snap_recv = raw_row.get("B22003_002E")
            snap_rate = safe_pct(snap_recv, snap_hh)
            if snap_rate is not None and existing_row.get("snap_participation_rate") is None:
                existing_row["snap_participation_rate"] = snap_rate
                patch_count += 1

            labor = raw_row.get("B23025_002E")
            unemp = raw_row.get("B23025_005E")
            unemp_rate = safe_pct(unemp, labor)
            if unemp_rate is not None and existing_row.get("unemployment_rate") is None:
                existing_row["unemployment_rate"] = unemp_rate
                patch_count += 1

    log.info(f"  Patched {patch_count} fields in existing rows")

    # ── Compute YoY home value appreciation ──────────────────────────
    log.info(f"\n{'='*60}")
    log.info("COMPUTING: pct_home_value_change_yoy from consecutive years")

    # Combine existing + new property data
    all_prop = prop_data + new_prop_rows
    prop_by_ry = {}
    for r in all_prop:
        key = (r.get("region_id"), r.get("year"))
        prop_by_ry[key] = r

    yoy_count = 0
    for r in all_prop:
        if r.get("pct_home_value_change_yoy") is not None:
            continue
        rid = r.get("region_id")
        yr = r.get("year")
        val = r.get("median_home_value")
        if val is None or yr is None:
            continue

        # Look for prior year's value
        for prior_yr in [yr - 5, yr - 3, yr - 4, yr - 6]:
            prior = prop_by_ry.get((rid, prior_yr))
            if prior and prior.get("median_home_value"):
                prior_val = prior["median_home_value"]
                gap = yr - prior_yr
                total_change = (val - prior_val) / prior_val
                annualized = total_change / gap * 100
                r["pct_home_value_change_yoy"] = round(annualized, 2)
                yoy_count += 1
                break

    log.info(f"  Computed YoY for {yoy_count} rows")

    # ── Merge and write output ───────────────────────────────────────
    log.info(f"\n{'='*60}")
    log.info("MERGING results")
    log.info(f"  New demo rows: {len(new_demo_rows)}")
    log.info(f"  New prop rows: {len(new_prop_rows)}")
    log.info(f"  New socio rows: {len(new_socio_rows)}")

    final_demo = demo_data + new_demo_rows
    final_prop = prop_data + new_prop_rows
    final_socio = socio_data + new_socio_rows

    # Sort by region_id, then year
    final_demo.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))
    final_prop.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))
    final_socio.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))

    # Write
    out_demo = output_dir / "audited_demographics_normalized.json"
    out_prop = output_dir / "audited_property_normalized.json"
    out_socio = output_dir / "audited_socioeconomic_normalized.json"

    with open(out_demo, "w") as f:
        json.dump(final_demo, f, indent=2)
    with open(out_prop, "w") as f:
        json.dump(final_prop, f, indent=2)
    with open(out_socio, "w") as f:
        json.dump(final_socio, f, indent=2)

    log.info(f"\nOutput written to {output_dir}/")
    log.info(f"  Demographics: {len(final_demo)} rows (was {len(demo_data)})")
    log.info(f"  Property: {len(final_prop)} rows (was {len(prop_data)})")
    log.info(f"  Socioeconomic: {len(final_socio)} rows (was {len(socio_data)})")

    # ── Summary report ───────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    for name, orig, final in [
        ("Demographics", demo_data, final_demo),
        ("Property", prop_data, final_prop),
        ("Socioeconomic", socio_data, final_socio),
    ]:
        orig_keys = find_existing_keys(orig)
        final_keys = find_existing_keys(final)
        new_keys = final_keys - orig_keys
        print(f"\n{name}:")
        print(f"  Before: {len(orig)} rows, {len(orig_keys)} (region,year) pairs")
        print(f"  After:  {len(final)} rows, {len(final_keys)} (region,year) pairs")
        print(f"  Added:  {len(new_keys)} new (region,year) pairs")

        # Coverage by year
        final_by_year = defaultdict(int)
        for r in final:
            if r.get("year"):
                final_by_year[r["year"]] += 1
        print(f"  Coverage by year: {dict(sorted(final_by_year.items()))}")

    print(f"\nRemaining gaps (not fillable from Census):")
    print(f"  - eviction_filing_rate: Download from evictionlab.org")
    print(f"  - commercial_sqft: Not available from Census")
    print(f"  - new_construction_permits: Get from City of Austin building permits data")
    print(f"  - median_property_tax: Available from ACS B25103 (add if needed)")
    print(f"  - Pre-2000 data: Census 1990 available but tract boundaries differ significantly")


# ─── CLI ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fill gaps in Austin Cultural Map census data from Census Bureau API"
    )
    parser.add_argument(
        "--data-dir",
        default="./data/phase1_output",
        help="Directory containing the 3 audited JSON files (default: ./data/phase1_output)",
    )
    parser.add_argument(
        "--output-dir",
        default="./data/phase1_output_patched",
        help="Output directory for patched JSON files (default: ./data/phase1_output_patched)",
    )
    parser.add_argument(
        "--region-index",
        default=None,
        help="Path to regionIndex.js (for geocoding named regions). Default: data_dir/../regionIndex.js",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Census API key (default: built-in key)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be fetched without making API calls",
    )

    args = parser.parse_args()

    if args.dry_run:
        log.info("DRY RUN — no API calls will be made")
        # Just show gap analysis
        data_dir = Path(args.data_dir)
        with open(data_dir / "audited_demographics_normalized.json") as f:
            demo = json.load(f)
        with open(data_dir / "audited_property_normalized.json") as f:
            prop = json.load(f)
        with open(data_dir / "audited_socioeconomic_normalized.json") as f:
            socio = json.load(f)

        geoid_map = build_geoid_mapping(demo, args.region_index)

        mapped_rids = set(geoid_map.keys())
        for name, data in [("Demo", demo), ("Prop", prop), ("Socio", socio)]:
            existing = find_existing_keys(data)
            for year in [2000, 2005, 2010, 2015, 2020, 2023]:
                need = [rid for rid in mapped_rids if (rid, year) not in existing]
                if need:
                    print(f"  {name} {year}: {len(need)} regions to fill")
    else:
        run(args)
