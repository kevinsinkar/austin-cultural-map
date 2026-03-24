#!/usr/bin/env python3
"""
fill_census_gaps_v2.py
══════════════════════
V2: Fixes tract-vintage crosswalking and year-specific ACS variable names.

KEY CHANGES FROM V1:
  1. Queries ALL tracts in Travis County per year (tract:*) instead of
     specific FIPS codes — avoids "tract doesn't exist" errors
  2. Downloads Census tract relationship files to crosswalk 2010→2020
     and 2000→2020 tract boundaries
  3. Uses year-appropriate ACS variable codes (they changed between vintages)
  4. Area-weighted aggregation when old tracts split into multiple 2020 tracts

USAGE:
  cd your-project-root/
  pip install requests
  python fill_census_gaps_v2.py
  python fill_census_gaps_v2.py --data-dir ./data/phase1_output --region-index ./data/regionIndex.js
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
COUNTY_FIPS = "453"
STATE_FIPS = "48"
FULL_COUNTY_FIPS = "48453"
REQUEST_DELAY = 0.8

# ─── Year-Specific ACS Variable Definitions ──────────────────────────────
# The Census API uses different table/variable codes across ACS vintages.
# This maps canonical field names → variable codes per year range.

def get_demo_acs_vars(year):
    """Return ACS variable codes for demographics, appropriate for the given year."""
    base = {
        "B01003_001E": "total_population",
        "B01002_001E": "median_age",
        "B03002_001E": "_pop_total_b03002",
        "B03002_012E": "_pop_hispanic",
        "B03002_003E": "_pop_white_nh",
        "B03002_004E": "_pop_black_nh",
        "B03002_006E": "_pop_asian_nh",
        "B05002_013E": "_pop_foreign_born",
        "B25003_001E": "_occupied_units",
        "B25003_002E": "_owner_occupied",
        "B25070_001E": "_renters_total",
        "B25070_007E": "_renters_30_35pct",
        "B25070_008E": "_renters_35_40pct",
        "B25070_009E": "_renters_40_50pct",
        "B25070_010E": "_renters_50plus_pct",
    }
    
    # Age 65+ — B01001 available in ALL ACS years
    base.update({
        "B01001_020E": "_pop_m_65_66",
        "B01001_021E": "_pop_m_67_69",
        "B01001_022E": "_pop_m_70_74",
        "B01001_023E": "_pop_m_75_79",
        "B01001_024E": "_pop_m_80_84",
        "B01001_025E": "_pop_m_85_plus",
        "B01001_044E": "_pop_f_65_66",
        "B01001_045E": "_pop_f_67_69",
        "B01001_046E": "_pop_f_70_74",
        "B01001_047E": "_pop_f_75_79",
        "B01001_048E": "_pop_f_80_84",
        "B01001_049E": "_pop_f_85_plus",
    })

    # Education — B15003 available from 2012+; B15002 available ALL years
    if year >= 2012:
        base.update({
            "B15003_001E": "_edu_total",
            "B15003_022E": "_edu_bachelors",
            "B15003_023E": "_edu_masters",
            "B15003_024E": "_edu_professional",
            "B15003_025E": "_edu_doctorate",
        })
    else:
        # 2010-2011: Use B15002 (sex by educational attainment) for bachelor's+
        base.update({
            "B15002_001E": "_edu_total",
            "B15002_015E": "_edu_m_bachelors",
            "B15002_016E": "_edu_m_masters",
            "B15002_017E": "_edu_m_professional",
            "B15002_018E": "_edu_m_doctorate",
            "B15002_032E": "_edu_f_bachelors",
            "B15002_033E": "_edu_f_masters",
            "B15002_034E": "_edu_f_professional",
            "B15002_035E": "_edu_f_doctorate",
        })
    
    return base


def get_prop_acs_vars(year):
    """Return ACS variable codes for property data."""
    base = {
        "B25077_001E": "median_home_value",
        "B25064_001E": "median_rent_monthly",
        "B25001_001E": "total_housing_units",
        "B25002_001E": "_total_units_b25002",
    }
    # B25002_003E (vacant units) unavailable in 2012 specifically
    if year != 2012:
        base["B25002_003E"] = "_vacant_units"
    return base


def get_socio_acs_vars(year):
    """Return ACS variable codes for socioeconomic data, year-appropriate.
    Based on census_variable_discovery.json results."""
    base = {
        "B19013_001E": "median_household_income",
        "B17001_001E": "_pov_total",
        "B17001_002E": "_pov_below",
        "B19083_001E": "gini_coefficient",
        # B22003 (SNAP) available in ALL tested ACS years including 2010
        "B22003_001E": "_snap_total_hh",
        "B22003_002E": "_snap_received",
    }
    
    # B23025 (employment status) available from 2011+, NOT 2010
    if year >= 2011:
        base["B23025_002E"] = "_labor_force"
        base["B23025_005E"] = "_unemployed"
    
    # B27010 (health insurance) available from 2013+
    if year >= 2013:
        base["B27010_001E"] = "_health_total"
        base["B27010_017E"] = "_health_uninsured"
    
    return base


# ─── Decennial Census Variables ──────────────────────────────────────────

DECENNIAL_2000_VARS = {
    "P001001": "total_population",
    "P004005": "_pop_white_nh",
    "P004006": "_pop_black_nh",
    "P004008": "_pop_asian_nh",
    "P004002": "_pop_hispanic",
    "H004001": "_occupied_units",
    "H004002": "_owner_occupied",
}

DECENNIAL_2010_VARS = {
    "P001001": "total_population",
    "P005003": "_pop_white_nh",
    "P005004": "_pop_black_nh",
    "P005006": "_pop_asian_nh",
    "P004003": "_pop_hispanic",
    "H004001": "_occupied_units",
    "H004002": "_owner_occupied",
}

# ─── Logging ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fill_gaps_v2")

# ─── GEOID Mapping (same as v1) ─────────────────────────────────────────

def tract_name_to_fips(name: str) -> str:
    tnum = name.replace("Tract ", "").strip()
    parts = tnum.split(".")
    if len(parts) == 2:
        return f"{int(parts[0]):04d}{int(parts[1]):02d}"
    else:
        return f"{int(float(parts[0])):04d}00"


def build_geoid_mapping(demo_data, region_index_path=None):
    mapping = {}
    named_missing = {}
    regions = {}
    for r in demo_data:
        rid = r.get("region_id")
        name = r.get("region", "")
        if rid is not None and rid not in regions:
            regions[rid] = name

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

    log.info(f"Direct tract mapping: {len(mapping)} regions")
    log.info(f"Named regions to geocode: {len(named_missing)}")

    if region_index_path and os.path.exists(region_index_path):
        centroids = parse_region_index(region_index_path)
        if centroids:
            geocoded = geocode_centroids(centroids, named_missing)
            for rid, info in geocoded.items():
                mapping[rid] = info
                named_missing.pop(rid, None)
            log.info(f"Geocoded: {len(geocoded)} regions")

    manual_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "region_geoid_manual.json")
    if os.path.exists(manual_path):
        with open(manual_path) as f:
            manual = json.load(f)
        for rid_str, geoid in manual.items():
            rid = int(rid_str)
            if rid in named_missing and geoid != "48453XXXXXX":
                fips = geoid[-6:]
                mapping[rid] = {
                    "geoid": geoid,
                    "tract_fips": fips,
                    "name": named_missing.pop(rid),
                    "source": "manual",
                }

    if named_missing:
        log.warning(f"{len(named_missing)} regions still unmapped")

    return mapping


def parse_region_index(path):
    with open(path, "r") as f:
        content = f.read()
    centroids = {}
    pattern = r'\{[^}]*?"?id"?\s*:\s*(\d+)[^}]*?"?lat"?\s*:\s*([-\d.]+)[^}]*?"?lng"?\s*:\s*([-\d.]+)'
    for m in re.finditer(pattern, content):
        centroids[int(m.group(1))] = {"lat": float(m.group(2)), "lng": float(m.group(3))}
    log.info(f"Parsed {len(centroids)} centroids from regionIndex.js")
    return centroids


def geocode_centroids(centroids, named_regions):
    results = {}
    to_geocode = {rid: centroids[rid] for rid in named_regions if rid in centroids}
    if not to_geocode:
        return results
    log.info(f"Geocoding {len(to_geocode)} centroids via FCC API...")
    for i, (rid, coord) in enumerate(to_geocode.items()):
        try:
            url = (f"https://geo.fcc.gov/api/census/block/find"
                   f"?latitude={coord['lat']}&longitude={coord['lng']}"
                   f"&censusYear=2020&format=json")
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            tract_fips_full = data.get("Block", {}).get("FIPS", "")
            if len(tract_fips_full) >= 11:
                geoid = tract_fips_full[:11]
                fips6 = tract_fips_full[5:11]
                results[rid] = {
                    "geoid": geoid, "tract_fips": fips6,
                    "name": named_regions[rid], "source": "fcc_geocoder",
                }
        except Exception as e:
            log.warning(f"  Geocode failed for rid={rid} ({named_regions[rid]}): {e}")
        if (i + 1) % 20 == 0:
            log.info(f"  Geocoded {i+1}/{len(to_geocode)}...")
        time.sleep(0.3)
    return results


# ─── Tract Crosswalk ────────────────────────────────────────────────────

CROSSWALK_2010_2020_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/"
    "tab20_tract20_tract10_natl.txt"
)

CROSSWALK_2000_2010_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel/trf_txt/"
    "tx48trf.txt"
)


def download_crosswalk_2010_2020(cache_dir):
    """Download and parse the 2010→2020 tract relationship file.
    Returns two dicts:
      tract2010_to_2020: { '48453XXXXXX': [('48453YYYYYY', area_weight), ...] }
      tract2020_to_2010: { '48453YYYYYY': [('48453XXXXXX', area_weight), ...] }
    """
    cache_path = os.path.join(cache_dir, "crosswalk_2010_2020_v2.json")
    if os.path.exists(cache_path):
        log.info("Loading cached 2010→2020 crosswalk...")
        with open(cache_path) as f:
            data = json.load(f)
        if data.get("fwd"):  # Only use cache if it actually has data
            return data["fwd"], data["rev"]
        else:
            log.info("  Cache was empty, re-downloading...")

    log.info("Downloading 2010→2020 tract crosswalk (one-time, ~30MB)...")
    resp = requests.get(CROSSWALK_2010_2020_URL, timeout=120)
    resp.raise_for_status()
    
    # Strip BOM if present
    text = resp.text
    if text.startswith('\ufeff'):
        text = text[1:]

    fwd = defaultdict(list)  # 2010 → [(2020, weight)]
    rev = defaultdict(list)  # 2020 → [(2010, weight)]

    lines = text.strip().split("\n")
    header = lines[0]

    # Actual columns (pipe-delimited):
    # [0]  OID_TRACT_20
    # [1]  GEOID_TRACT_20
    # [2]  NAMELSAD_TRACT_20
    # [3]  AREALAND_TRACT_20
    # [4]  AREAWATER_TRACT_20
    # [5]  MTFCC_TRACT_20
    # [6]  FUNCSTAT_TRACT_20
    # [7]  OID_TRACT_10
    # [8]  GEOID_TRACT_10
    # [9]  NAMELSAD_TRACT_10
    # [10] AREALAND_TRACT_10   ← denominator for weight
    # [11] AREAWATER_TRACT_10
    # [12] MTFCC_TRACT_10
    # [13] FUNCSTAT_TRACT_10
    # [14] AREALAND_PART       ← numerator for weight
    # [15] AREAWATER_PART

    for line in lines[1:]:
        fields = line.split("|")
        if len(fields) < 15:
            continue

        geoid_2020 = fields[1].strip()
        geoid_2010 = fields[8].strip()

        # Only keep Travis County
        if not geoid_2020.startswith(FULL_COUNTY_FIPS):
            continue

        # Area-weighted: weight = area of intersection / area of 2010 tract
        try:
            area_part = float(fields[14].strip()) if fields[14].strip() else 0
            area_2010 = float(fields[10].strip()) if fields[10].strip() else 0
        except (ValueError, IndexError):
            continue

        weight = area_part / area_2010 if area_2010 > 0 else 0

        if weight > 0.001:  # Skip trivial slivers
            fwd[geoid_2010].append((geoid_2020, weight))
            rev[geoid_2020].append((geoid_2010, weight))

    # Normalize weights
    for k in fwd:
        total = sum(w for _, w in fwd[k])
        if total > 0:
            fwd[k] = [(g, w/total) for g, w in fwd[k]]
    for k in rev:
        total = sum(w for _, w in rev[k])
        if total > 0:
            rev[k] = [(g, w/total) for g, w in rev[k]]

    log.info(f"  Parsed {len(fwd)} 2010 tracts → {len(rev)} 2020 tracts (Travis County)")

    with open(cache_path, "w") as f:
        json.dump({"fwd": dict(fwd), "rev": dict(rev)}, f)

    return dict(fwd), dict(rev)


def find_2010_tracts_for_2020(geoid_2020, rev_map):
    """Given a 2020 tract GEOID, return list of (2010_geoid, weight) that compose it."""
    return rev_map.get(geoid_2020, [])


# ─── Census API ──────────────────────────────────────────────────────────

def query_all_county_tracts(base_url, variables, api_key):
    """Query ALL tracts in Travis County at once. Returns {tract_fips_6: {var: value}}."""
    var_str = ",".join(variables)
    params = {
        "get": var_str,
        "for": "tract:*",
        "in": f"state:{STATE_FIPS} county:{COUNTY_FIPS}",
        "key": api_key,
    }
    try:
        resp = requests.get(base_url, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        log.error(f"Census API HTTP error: {e}")
        log.error(f"  Response: {resp.text[:300]}")
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
                    fval = float(val)
                    # Census uses -666666666 for missing
                    parsed[var] = fval if fval > -666666000 else None
                except (ValueError, TypeError):
                    parsed[var] = None
            else:
                parsed[var] = None
        results[tract] = parsed

    log.info(f"  Got data for {len(results)} tracts")
    return results


def query_all_county_tracts_chunked(base_url, variables, api_key, chunk_size=48):
    """
    Some ACS endpoints reject too many variables at once.
    Split into chunks and merge results per tract.
    """
    if len(variables) <= chunk_size:
        return query_all_county_tracts(base_url, variables, api_key)

    chunks = [variables[i:i+chunk_size] for i in range(0, len(variables), chunk_size)]
    merged = {}

    for i, chunk in enumerate(chunks):
        log.info(f"  Variable chunk {i+1}/{len(chunks)} ({len(chunk)} vars)...")
        result = query_all_county_tracts(base_url, chunk, api_key)
        for tract, vals in result.items():
            if tract not in merged:
                merged[tract] = {}
            merged[tract].update(vals)
        time.sleep(REQUEST_DELAY)

    return merged


# ─── Data Transforms ────────────────────────────────────────────────────

def safe_pct(num, denom):
    if denom is None or denom == 0 or num is None:
        return None
    return round(num / denom * 100, 2)


def safe_sum(vals):
    """Sum non-None values, return None if all are None."""
    filtered = [v for v in vals if v is not None]
    return sum(filtered) if filtered else None


def transform_demo_acs(raw, year):
    total_pop = raw.get("B01003_001E")
    pop_b03002 = raw.get("B03002_001E") or total_pop

    pct_hispanic = safe_pct(raw.get("B03002_012E"), pop_b03002)
    pct_white = safe_pct(raw.get("B03002_003E"), pop_b03002)
    pct_black = safe_pct(raw.get("B03002_004E"), pop_b03002)
    pct_asian = safe_pct(raw.get("B03002_006E"), pop_b03002)
    pct_foreign = safe_pct(raw.get("B05002_013E"), total_pop)

    occ = raw.get("B25003_001E")
    own = raw.get("B25003_002E")
    pct_owner = safe_pct(own, occ)

    rent_total = raw.get("B25070_001E")
    rent_burdened = safe_sum([
        raw.get("B25070_007E"), raw.get("B25070_008E"),
        raw.get("B25070_009E"), raw.get("B25070_010E"),
    ])
    rent_burden = safe_pct(rent_burdened, rent_total)

    # Education — handle both B15003 (2015+) and B15002 (2010-2014)
    if raw.get("B15003_001E") is not None:
        edu_total = raw["B15003_001E"]
        edu_ba_plus = safe_sum([
            raw.get("B15003_022E"), raw.get("B15003_023E"),
            raw.get("B15003_024E"), raw.get("B15003_025E"),
        ])
    elif raw.get("B15002_001E") is not None:
        edu_total = raw["B15002_001E"]
        edu_ba_plus = safe_sum([
            raw.get("B15002_015E"), raw.get("B15002_016E"),
            raw.get("B15002_017E"), raw.get("B15002_018E"),
            raw.get("B15002_032E"), raw.get("B15002_033E"),
            raw.get("B15002_034E"), raw.get("B15002_035E"),
        ])
    else:
        edu_total = None
        edu_ba_plus = None
    pct_bachelors = safe_pct(edu_ba_plus, edu_total)

    # Age 65+
    pop_65_plus = safe_sum([
        raw.get("B01001_020E"), raw.get("B01001_021E"),
        raw.get("B01001_022E"), raw.get("B01001_023E"),
        raw.get("B01001_024E"), raw.get("B01001_025E"),
        raw.get("B01001_044E"), raw.get("B01001_045E"),
        raw.get("B01001_046E"), raw.get("B01001_047E"),
        raw.get("B01001_048E"), raw.get("B01001_049E"),
    ])
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
        "audit_source": f"ACS {year-4}-{year} (5-Year)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled by fill_census_gaps_v2.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_demo_decennial(raw, year, is_2000=False):
    total_pop = raw.get("P001001")
    if is_2000:
        pct_hispanic = safe_pct(raw.get("P004002"), total_pop)
        pct_white = safe_pct(raw.get("P004005"), total_pop)
        pct_black = safe_pct(raw.get("P004006"), total_pop)
        pct_asian = safe_pct(raw.get("P004008"), total_pop)
        flags = []
    else:
        pct_hispanic = safe_pct(raw.get("P004003"), total_pop)
        pct_white = safe_pct(raw.get("P005003"), total_pop)
        pct_black = safe_pct(raw.get("P005004"), total_pop)
        pct_asian = safe_pct(raw.get("P005006"), total_pop)
        flags = []

    occ = raw.get("H004001")
    own = raw.get("H004002")

    return {
        "year": year,
        "total_population": int(total_pop) if total_pop else None,
        "median_age": None,
        "pct_hispanic": pct_hispanic,
        "pct_white_non_hispanic": pct_white,
        "pct_black_non_hispanic": pct_black,
        "pct_asian": pct_asian,
        "pct_foreign_born": None,
        "pct_owner_occupied": safe_pct(own, occ),
        "rent_burden_pct": None,
        "pct_bachelors_degree_or_higher": None,
        "pct_65_and_over": None,
        "audit_source": f"Decennial Census {year} SF1",
        "audit_confidence": "high",
        "audit_notes": "Backfilled by fill_census_gaps_v2.py",
        "audit_flags": flags,
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_prop_acs(raw, year):
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
        "commercial_sqft": None,
        "new_construction_permits": None,
        "median_property_tax": None,
        "pct_home_value_change_yoy": None,
        "audit_source": f"ACS {year-4}-{year} (5-Year)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled by fill_census_gaps_v2.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def transform_socio_acs(raw, year):
    income = raw.get("B19013_001E")
    gini = raw.get("B19083_001E")
    poverty_rate = safe_pct(raw.get("B17001_002E"), raw.get("B17001_001E"))

    # Employment — B23025 only requested for 2011+, absent for 2010
    if raw.get("B23025_002E") is not None:
        unemployment_rate = safe_pct(raw.get("B23025_005E"), raw.get("B23025_002E"))
    else:
        unemployment_rate = None

    # SNAP — B22003 available in all ACS years
    snap_rate = safe_pct(raw.get("B22003_002E"), raw.get("B22003_001E"))

    return {
        "year": year,
        "median_household_income": income,
        "poverty_rate": poverty_rate,
        "unemployment_rate": unemployment_rate,
        "gini_coefficient": gini,
        "pct_uninsured": safe_pct(raw.get("B27010_017E"), raw.get("B27010_001E")),
        "eviction_filing_rate": None,
        "snap_participation_rate": snap_rate,
        "dominant_industries": None,
        "audit_source": f"ACS {year-4}-{year} (5-Year)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled by fill_census_gaps_v2.py",
        "audit_flags": [],
        "audit_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ─── Crosswalk Aggregation ──────────────────────────────────────────────

def crosswalk_to_2020(old_vintage_data, rev_map, fips_to_rid, geoid_map):
    """
    Given Census data keyed by old-vintage tract FIPS and a crosswalk,
    produce rows keyed by 2020 region_id with area-weighted values.

    old_vintage_data: { tract_fips_6: { var: value } }
    rev_map: { geoid_2020: [(geoid_old, weight), ...] }
    
    Returns: { region_id: { var: weighted_value } }
    """
    # Build old geoid → data lookup
    old_by_geoid = {}
    for fips6, vals in old_vintage_data.items():
        geoid = f"{FULL_COUNTY_FIPS}{fips6}"
        old_by_geoid[geoid] = vals

    results = {}
    
    for rid, info in geoid_map.items():
        geoid_2020 = info["geoid"]
        old_tracts = rev_map.get(geoid_2020, [])
        
        if not old_tracts:
            # Try direct match (tract existed unchanged)
            fips6 = info["tract_fips"]
            if fips6 in old_vintage_data:
                results[rid] = old_vintage_data[fips6]
            continue

        # Area-weighted aggregation
        weighted = {}
        total_weight = 0
        
        for old_geoid, weight in old_tracts:
            old_data = old_by_geoid.get(old_geoid)
            if old_data is None:
                continue
            total_weight += weight
            for var, val in old_data.items():
                if val is None:
                    continue
                if var not in weighted:
                    weighted[var] = 0
                weighted[var] += val * weight

        if total_weight > 0 and weighted:
            # Normalize by actual weight used (in case some source tracts had no data)
            final = {var: val / total_weight for var, val in weighted.items()}
            results[rid] = final

    return results


# ─── Gap Detection ──────────────────────────────────────────────────────

def find_existing_keys(data):
    return {(r["region_id"], r["year"]) for r in data if r.get("region_id") and r.get("year")}


# ─── Main Pipeline ──────────────────────────────────────────────────────

def run(args):
    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    api_key = args.api_key or CENSUS_API_KEY

    # ── Load existing data ───────────────────────────────────────────
    log.info("Loading existing JSON files...")
    with open(data_dir / "audited_demographics_normalized.json") as f:
        demo_data = json.load(f)
    with open(data_dir / "audited_property_normalized.json") as f:
        prop_data = json.load(f)
    with open(data_dir / "audited_socioeconomic_normalized.json") as f:
        socio_data = json.load(f)

    log.info(f"  Demo: {len(demo_data)}, Prop: {len(prop_data)}, Socio: {len(socio_data)}")

    # ── Build GEOID mapping ──────────────────────────────────────────
    log.info("Building region → GEOID mapping...")
    region_index_path = args.region_index or str(data_dir.parent / "regionIndex.js")
    geoid_map = build_geoid_mapping(demo_data, region_index_path)
    log.info(f"Mapped: {len(geoid_map)} of 269 regions")

    fips_to_rid = {}
    for rid, info in geoid_map.items():
        fips_to_rid[info["tract_fips"]] = rid

    # ── Download crosswalk ───────────────────────────────────────────
    log.info("Loading tract crosswalk files...")
    try:
        fwd_2010_2020, rev_2020_2010 = download_crosswalk_2010_2020(str(cache_dir))
    except Exception as e:
        log.error(f"Could not load crosswalk: {e}")
        log.error("Continuing without crosswalk — only direct tract matches will work")
        fwd_2010_2020, rev_2020_2010 = {}, {}

    demo_existing = find_existing_keys(demo_data)
    prop_existing = find_existing_keys(prop_data)
    socio_existing = find_existing_keys(socio_data)
    mapped_rids = set(geoid_map.keys())

    new_demo_rows = []
    new_prop_rows = []
    new_socio_rows = []

    # ── DECENNIAL 2000 ───────────────────────────────────────────────
    need_2000 = [rid for rid in mapped_rids if (rid, 2000) not in demo_existing]
    if need_2000:
        log.info(f"\n{'='*60}")
        log.info(f"DECENNIAL 2000: {len(need_2000)} regions need data")
        log.info("  Querying all Travis County tracts for 2000...")

        dec_url = "https://api.census.gov/data/2000/dec/sf1"
        vars_2000 = list(DECENNIAL_2000_VARS.keys())
        raw_2000 = query_all_county_tracts(dec_url, vars_2000, api_key)
        time.sleep(REQUEST_DELAY)

        if raw_2000:
            # Crosswalk: 2000 tracts → 2020 tracts (approximate via 2010 crosswalk)
            # Note: proper 2000→2020 requires chaining 2000→2010→2020
            # For now, use direct matching + 2010→2020 as proxy
            crosswalked = crosswalk_to_2020(raw_2000, rev_2020_2010, fips_to_rid, geoid_map)
            
            count = 0
            for rid in need_2000:
                if rid in crosswalked:
                    row = transform_demo_decennial(crosswalked[rid], 2000, is_2000=True)
                    row["region_id"] = rid
                    row["region"] = geoid_map[rid]["name"]
                    if row.get("total_population"):
                        new_demo_rows.append(row)
                        count += 1
            log.info(f"  Added {count} rows for 2000")

    # ── DECENNIAL 2010 ───────────────────────────────────────────────
    need_2010 = [rid for rid in mapped_rids if (rid, 2010) not in demo_existing]
    if need_2010:
        log.info(f"\n{'='*60}")
        log.info(f"DECENNIAL 2010: {len(need_2010)} regions need data")
        log.info("  Querying all Travis County tracts for 2010...")

        dec_url = "https://api.census.gov/data/2010/dec/sf1"
        vars_2010 = list(DECENNIAL_2010_VARS.keys())
        raw_2010 = query_all_county_tracts(dec_url, vars_2010, api_key)
        time.sleep(REQUEST_DELAY)

        if raw_2010:
            crosswalked = crosswalk_to_2020(raw_2010, rev_2020_2010, fips_to_rid, geoid_map)

            count = 0
            for rid in need_2010:
                if rid in crosswalked:
                    row = transform_demo_decennial(crosswalked[rid], 2010, is_2000=False)
                    row["region_id"] = rid
                    row["region"] = geoid_map[rid]["name"]
                    if row.get("total_population"):
                        new_demo_rows.append(row)
                        count += 1
            log.info(f"  Added {count} rows for 2010")

    # ── ACS 5-YEAR (2010, 2015) ──────────────────────────────────────
    for acs_year in [2010, 2015]:
        log.info(f"\n{'='*60}")
        log.info(f"ACS 5-YEAR {acs_year}")

        acs_url = f"https://api.census.gov/data/{acs_year}/acs/acs5"

        # Demographics
        already_added_demo = {r["region_id"] for r in new_demo_rows if r["year"] == acs_year}
        need_demo = [rid for rid in mapped_rids
                     if (rid, acs_year) not in demo_existing and rid not in already_added_demo]

        if need_demo:
            log.info(f"  Demographics: {len(need_demo)} regions missing")
            demo_var_map = get_demo_acs_vars(acs_year)
            vars_list = list(demo_var_map.keys())
            raw = query_all_county_tracts_chunked(acs_url, vars_list, api_key)
            time.sleep(REQUEST_DELAY)

            if raw:
                crosswalked = crosswalk_to_2020(raw, rev_2020_2010, fips_to_rid, geoid_map)
                count = 0
                for rid in need_demo:
                    if rid in crosswalked:
                        row = transform_demo_acs(crosswalked[rid], acs_year)
                        row["region_id"] = rid
                        row["region"] = geoid_map[rid]["name"]
                        if row.get("total_population"):
                            new_demo_rows.append(row)
                            count += 1
                log.info(f"  Added {count} demo rows")

        # Property
        need_prop = [rid for rid in mapped_rids if (rid, acs_year) not in prop_existing]
        if need_prop:
            log.info(f"  Property: {len(need_prop)} regions missing")
            prop_var_map = get_prop_acs_vars(acs_year)
            vars_list = list(prop_var_map.keys())
            raw = query_all_county_tracts(acs_url, vars_list, api_key)
            time.sleep(REQUEST_DELAY)

            if raw:
                crosswalked = crosswalk_to_2020(raw, rev_2020_2010, fips_to_rid, geoid_map)
                count = 0
                for rid in need_prop:
                    if rid in crosswalked:
                        row = transform_prop_acs(crosswalked[rid], acs_year)
                        row["region_id"] = rid
                        row["region"] = geoid_map[rid]["name"]
                        new_prop_rows.append(row)
                        count += 1
                log.info(f"  Added {count} prop rows")

        # Socioeconomic
        need_socio = [rid for rid in mapped_rids if (rid, acs_year) not in socio_existing]
        if need_socio:
            log.info(f"  Socioeconomic: {len(need_socio)} regions missing")
            socio_var_map = get_socio_acs_vars(acs_year)
            vars_list = list(socio_var_map.keys())
            raw = query_all_county_tracts(acs_url, vars_list, api_key)
            time.sleep(REQUEST_DELAY)

            if raw:
                crosswalked = crosswalk_to_2020(raw, rev_2020_2010, fips_to_rid, geoid_map)
                count = 0
                for rid in need_socio:
                    if rid in crosswalked:
                        row = transform_socio_acs(crosswalked[rid], acs_year)
                        row["region_id"] = rid
                        row["region"] = geoid_map[rid]["name"]
                        new_socio_rows.append(row)
                        count += 1
                log.info(f"  Added {count} socio rows")

    # ── PATCH SNAP/unemployment in existing rows (same as v1) ────────
    log.info(f"\n{'='*60}")
    log.info("PATCHING existing rows: SNAP + unemployment")

    socio_by_ry = {}
    for r in socio_data:
        socio_by_ry[(r.get("region_id"), r.get("year"))] = r

    patch_count = 0
    for acs_year in [2020, 2023]:
        rids_need = [
            rid for rid in mapped_rids
            if (rid, acs_year) in socio_existing
            and socio_by_ry.get((rid, acs_year), {}).get("snap_participation_rate") is None
        ]
        if not rids_need:
            continue

        log.info(f"  SNAP/unemp patch for {acs_year}: {len(rids_need)} regions")
        acs_url = f"https://api.census.gov/data/{acs_year}/acs/acs5"
        snap_vars = ["B22003_001E", "B22003_002E", "B23025_002E", "B23025_005E"]
        raw = query_all_county_tracts(acs_url, snap_vars, api_key)
        time.sleep(REQUEST_DELAY)

        for rid in rids_need:
            fips6 = geoid_map.get(rid, {}).get("tract_fips")
            if not fips6 or fips6 not in raw:
                continue
            raw_row = raw[fips6]
            existing = socio_by_ry.get((rid, acs_year))
            if not existing:
                continue

            snap_rate = safe_pct(raw_row.get("B22003_002E"), raw_row.get("B22003_001E"))
            if snap_rate is not None and existing.get("snap_participation_rate") is None:
                existing["snap_participation_rate"] = snap_rate
                patch_count += 1

            unemp = safe_pct(raw_row.get("B23025_005E"), raw_row.get("B23025_002E"))
            if unemp is not None and existing.get("unemployment_rate") is None:
                existing["unemployment_rate"] = unemp
                patch_count += 1

    log.info(f"  Patched {patch_count} fields")

    # ── Compute YoY ──────────────────────────────────────────────────
    log.info(f"\n{'='*60}")
    log.info("COMPUTING pct_home_value_change_yoy")

    all_prop = prop_data + new_prop_rows
    prop_by_ry = {(r.get("region_id"), r.get("year")): r for r in all_prop}

    yoy_count = 0
    for r in all_prop:
        if r.get("pct_home_value_change_yoy") is not None:
            continue
        rid, yr, val = r.get("region_id"), r.get("year"), r.get("median_home_value")
        if val is None or yr is None:
            continue
        for gap in [5, 3, 4, 6, 10]:
            prior = prop_by_ry.get((rid, yr - gap))
            if prior and prior.get("median_home_value"):
                total_change = (val - prior["median_home_value"]) / prior["median_home_value"]
                r["pct_home_value_change_yoy"] = round(total_change / gap * 100, 2)
                yoy_count += 1
                break

    log.info(f"  Computed YoY for {yoy_count} rows")

    # ── Merge and write ──────────────────────────────────────────────
    log.info(f"\n{'='*60}")
    log.info(f"NEW ROWS: demo={len(new_demo_rows)}, prop={len(new_prop_rows)}, socio={len(new_socio_rows)}")

    final_demo = demo_data + new_demo_rows
    final_prop = prop_data + new_prop_rows
    final_socio = socio_data + new_socio_rows

    for ds in [final_demo, final_prop, final_socio]:
        ds.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))

    with open(output_dir / "audited_demographics_normalized.json", "w") as f:
        json.dump(final_demo, f, indent=2)
    with open(output_dir / "audited_property_normalized.json", "w") as f:
        json.dump(final_prop, f, indent=2)
    with open(output_dir / "audited_socioeconomic_normalized.json", "w") as f:
        json.dump(final_socio, f, indent=2)

    log.info(f"\nOutput → {output_dir}/")

    # ── Summary ──────────────────────────────────────────────────────
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
        print(f"\n{name}:")
        print(f"  Before: {len(orig)} rows")
        print(f"  After:  {len(final)} rows (+{len(final)-len(orig)})")
        by_year = defaultdict(int)
        for r in final:
            if r.get("year"): by_year[r["year"]] += 1
        print(f"  Coverage: {dict(sorted(by_year.items()))}")

    print(f"\nStill not fillable from Census:")
    print(f"  - eviction_filing_rate → evictionlab.org")
    print(f"  - commercial_sqft → CoStar / City of Austin")
    print(f"  - new_construction_permits → data.austintexas.gov building permits")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fill census data gaps (v2 with crosswalking)")
    parser.add_argument("--data-dir", default="./data/phase1_output")
    parser.add_argument("--output-dir", default="./data/phase1_output_patched")
    parser.add_argument("--region-index", default=None)
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--cache-dir", default="./.census_cache",
                        help="Directory to cache crosswalk files")
    args = parser.parse_args()
    run(args)
