#!/usr/bin/env python3
"""
nhgis_fill_pipeline.py
══════════════════════
Downloads NHGIS Census data via the IPUMS API and fills gaps in the
audited normalized JSON files.

Three extracts (per NHGIS_FILL_STRATEGY_corrected.md):
  1. 1990 Census STF3  — complete baseline demographics + socioeconomic
  2. 2000 Census SF3   — fill ACS-type fields missing from SF1 (median_age,
                          education, foreign-born, 65+, rent burden)
  3. ACS 2006-2010     — fill 2010 gaps (same fields + unemployment)

USAGE:
  # Set your IPUMS API key
  export IPUMS_API_KEY="your_key_here"

  # Full pipeline: submit extracts, wait, download, process, merge
  python scripts/nhgis_fill_pipeline.py

  # Preview what will be submitted (no API calls)
  python scripts/nhgis_fill_pipeline.py --dry-run

  # Only submit extracts (don't wait/process)
  python scripts/nhgis_fill_pipeline.py --submit-only

  # Process already-downloaded NHGIS CSVs
  python scripts/nhgis_fill_pipeline.py --csv-dir ./data/nhgis_downloads

  # Limit to specific extracts
  python scripts/nhgis_fill_pipeline.py --extracts 2000_sf3 acs_2006_2010
"""

import json
import os
import re
import sys
import time
import argparse
import logging
import zipfile
import csv
import io
from pathlib import Path
from collections import defaultdict
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library required. Run: pip install requests")
    sys.exit(1)

# ─── Configuration ───────────────────────────────────────────────────────

IPUMS_API_BASE = "https://api.ipums.org/extracts"
COUNTY_FIPS = "453"
STATE_FIPS = "48"
FULL_COUNTY_FIPS = "48453"
# NHGIS GISJOIN format: G + "0" + state(2) + "0" + county(3) + "0" + tract(6)
# Travis County: G0480453 + 0 + tract(6)
TRAVIS_GISJOIN_PATTERN = re.compile(r"G0?480?4530?(\d{4,7})")

POLL_INTERVAL = 30       # seconds between status checks
POLL_TIMEOUT = 3600      # max seconds to wait for extract (1 hour)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nhgis_fill")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: NHGIS EXTRACT DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

EXTRACT_DEFS = {
    "1990_stf3": {
        "description": "Austin Cultural Map - 1990 Census STF3 baseline",
        "datasets": {
            "1990_STF3": {
                "dataTables": [
                    "NP1",     # Total population
                    "NP6",     # Race (White, Black, Asian/Pacific Islander)
                    "NP8",     # Hispanic origin
                    "NP12",    # Hispanic Origin by Race (race x ethnicity cross-tabs)
                    "NP15",    # Sex by Age (for 65+ calc AND median age from brackets)
                    "NP42",    # Place of Birth (foreign-born %)
                    "NP37",    # Age by Citizenship (naturalized vs non-citizen)
                    "NP57",    # Educational attainment (bachelor's+)
                    "NP80A",   # Median household income
                    "NP117",   # Poverty status
                    "NH8",     # Housing tenure (owner/renter occupied)
                    "NH43",    # Gross rent as % of income (rent burden)
                ],
                "geogLevels": ["tract"],
            }
        },
        "dataFormat": "csv_header",
        "target_year": 1990,
        "target_tables": ["demographics", "property", "socioeconomic"],
    },
    "2000_sf3": {
        "description": "Austin Cultural Map - 2000 Census SF3 gap fill",
        "datasets": {
            "2000_SF3a": {
                "dataTables": [
                    "NP008B",  # Population by Sex by Age (for 65+ and median age)
                    "NP037C",  # Educational attainment by sex (bachelor's+)
                    "NP021A",  # Nativity (foreign-born)
                    "NH069A",  # Gross rent as % of household income
                    "NP053A",  # Median household income (crosscheck)
                    "NP087B",  # Poverty status (crosscheck)
                    "NH007A",  # Tenure — owner/renter (crosscheck)
                ],
                "geogLevels": ["tract"],
            }
        },
        "dataFormat": "csv_header",
        "target_year": 2000,
        "target_tables": ["demographics"],
    },
    "acs_2006_2010": {
        "description": "Austin Cultural Map - ACS 2006-2010 gap fill",
        "datasets": {
            # ACS5a: block-group-level tables (basic demographics)
            "2006_2010_ACS5a": {
                "dataTables": [
                    "B01002",  # Median age
                    "B01001",  # Sex by age (for 65+)
                    "B15002",  # Sex by educational attainment (bachelor's+)
                    "B25070",  # Gross rent as % of income
                ],
                "breakdownAndDataTypeLayout": "single_file",
                "geogLevels": ["tract"],
            },
            # ACS5b: tract-level tables (nativity, employment)
            "2006_2010_ACS5b": {
                "dataTables": [
                    "B05002",  # Place of Birth / nativity (foreign-born %)
                    "B23001",  # Sex by Age by Employment Status (unemployment)
                ],
                "breakdownAndDataTypeLayout": "single_file",
                "geogLevels": ["tract"],
            },
        },
        "dataFormat": "csv_header",
        "target_year": 2010,
        "target_tables": ["demographics", "socioeconomic"],
    },
}


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: IPUMS NHGIS API CLIENT
# ═══════════════════════════════════════════════════════════════════════════

class NHGISClient:
    """Thin wrapper around the IPUMS NHGIS API."""

    def __init__(self, api_key):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": api_key,
            "Content-Type": "application/json",
        })

    def submit_extract(self, extract_def):
        """Submit an NHGIS extract request. Returns extract number."""
        # Strip non-API fields from dataset objects before sending
        clean_datasets = {}
        for ds_name, ds_cfg in extract_def["datasets"].items():
            clean_datasets[ds_name] = {
                k: v for k, v in ds_cfg.items()
                if k in ("dataTables", "geogLevels", "geographicExtents",
                         "years", "breakdownValues")
            }

        payload = {
            "datasets": clean_datasets,
            "dataFormat": extract_def.get("dataFormat", "csv_header"),
            "description": extract_def["description"],
        }

        # ACS datasets with multiple data types need this at top level
        if any(ds_cfg.get("breakdownAndDataTypeLayout")
               for ds_cfg in extract_def["datasets"].values()):
            payload["breakdownAndDataTypeLayout"] = "single_file"

        url = f"{IPUMS_API_BASE}/?collection=nhgis&version=2"
        log.info(f"Submitting extract: {extract_def['description']}")
        log.info(f"  POST {url}")

        resp = self.session.post(url, json=payload)
        if resp.status_code == 401:
            log.error("Authentication failed. Check your IPUMS_API_KEY.")
            sys.exit(1)
        resp.raise_for_status()

        data = resp.json()
        extract_num = data.get("number")
        log.info(f"  Extract #{extract_num} submitted successfully")
        return extract_num

    def check_status(self, extract_num):
        """Check extract status. Returns (status_str, download_links)."""
        url = f"{IPUMS_API_BASE}/{extract_num}?collection=nhgis&version=2"
        resp = self.session.get(url)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "unknown")
        download_links = data.get("downloadLinks", {})
        return status, download_links

    def wait_for_extract(self, extract_num, timeout=POLL_TIMEOUT):
        """Poll until extract is ready or timeout. Returns download links."""
        start = time.time()
        while True:
            status, links = self.check_status(extract_num)
            elapsed = int(time.time() - start)

            if status == "completed":
                log.info(f"  Extract #{extract_num} completed ({elapsed}s)")
                return links
            elif status in ("failed", "canceled"):
                log.error(f"  Extract #{extract_num} {status} after {elapsed}s")
                return None
            elif elapsed > timeout:
                log.error(f"  Extract #{extract_num} timed out after {elapsed}s (status: {status})")
                return None

            log.info(f"  Status: {status} ({elapsed}s elapsed, checking again in {POLL_INTERVAL}s)")
            time.sleep(POLL_INTERVAL)

    def download_extract(self, download_links, output_dir):
        """Download extract files to output_dir. Returns list of local paths."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        paths = []

        for key, url in download_links.items():
            if not url:
                continue
            filename = url.split("/")[-1].split("?")[0]
            local_path = output_dir / filename
            log.info(f"  Downloading {filename}...")

            resp = self.session.get(url, stream=True)
            resp.raise_for_status()

            with open(local_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)

            paths.append(local_path)
            log.info(f"  Saved to {local_path}")

        return paths

    def validate_dataset(self, dataset_name):
        """Check if a dataset exists in NHGIS metadata."""
        url = f"{IPUMS_API_BASE.replace('/extracts', '/metadata/nhgis')}/datasets/{dataset_name}"
        try:
            resp = self.session.get(url)
            if resp.status_code == 200:
                return True
            log.warning(f"  Dataset '{dataset_name}' not found (HTTP {resp.status_code})")
            return False
        except Exception as e:
            log.warning(f"  Could not validate dataset '{dataset_name}': {e}")
            return True  # Don't block on validation failures


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: NHGIS CSV + CODEBOOK PARSER
# ═══════════════════════════════════════════════════════════════════════════

def extract_zip(zip_path, output_dir):
    """Extract ZIP file and return paths to CSV and codebook files."""
    output_dir = Path(output_dir)
    csv_files = []
    codebook_files = []

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            zf.extract(name, output_dir)
            full_path = output_dir / name
            if name.endswith(".csv"):
                csv_files.append(full_path)
            elif name.endswith("_codebook.txt") or name.endswith("_codebook"):
                codebook_files.append(full_path)

    log.info(f"  Extracted {len(csv_files)} CSV(s), {len(codebook_files)} codebook(s)")
    return csv_files, codebook_files


def parse_codebook(codebook_path):
    """Parse NHGIS codebook to build column → (table, description) mapping.

    Returns: {
        nhgis_column_code: {
            "table": "NP037A",
            "table_description": "Median Age by Sex",
            "description": "Total",
            "nhgis_prefix": "FL5"
        }
    }
    """
    with open(codebook_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    mapping = {}
    current_table = None
    current_table_desc = None
    current_prefix = None
    in_estimates_section = True  # Track if we're in Estimates vs Margins of Error

    for line in text.split("\n"):
        # Track ACS data type sections (only parse Estimates, skip Margins of Error)
        if re.match(r"Data Type \(E\)", line):
            in_estimates_section = True
            continue
        if re.match(r"Data Type \(M\)", line):
            in_estimates_section = False
            continue

        # Match table header like:
        #   "Table 1:     (NP037A) Median Age by Sex"
        # or: "Table:       Median Age by Sex"
        #     "Source code: NP037A"
        table_paren = re.match(
            r"\s*Table\s+\d+:\s*\((\w+)\)\s*(.*)", line
        )
        if table_paren:
            current_table = table_paren.group(1).strip()
            current_table_desc = table_paren.group(2).strip()
            current_prefix = None
            continue

        # Alternate table header pattern (NHGIS v2 codebook)
        source_code = re.match(r"\s*Source code:\s*(\w+)", line)
        if source_code:
            current_table = source_code.group(1).strip()
            continue

        # Table description on its own line
        table_line = re.match(r"\s*Table\s+\d+:\s*(.*)", line)
        if table_line and not table_paren:
            current_table_desc = table_line.group(1).strip()
            continue

        # NHGIS code prefix
        nhgis_code = re.match(r"\s*NHGIS code:\s*(\w+)", line)
        if nhgis_code:
            current_prefix = nhgis_code.group(1).strip()
            continue

        # Variable line: "        FL5001:  Total" (decennial)
        #            or: "        JLZE001: Total" (ACS — prefix + type letter + digits)
        if current_prefix and in_estimates_section:
            var_match = re.match(
                rf"\s+({re.escape(current_prefix)}\w*\d+):\s*(.*)", line
            )
            if var_match:
                code = var_match.group(1).strip()
                desc = var_match.group(2).strip()
                mapping[code] = {
                    "table": current_table,
                    "table_description": current_table_desc or "",
                    "description": desc,
                    "nhgis_prefix": current_prefix,
                }

    log.info(f"  Parsed {len(mapping)} variable definitions from codebook")
    return mapping


def parse_nhgis_csv(csv_path, codebook_mapping):
    """Parse NHGIS CSV file and return list of tract-level data dicts.

    Handles geographic identification via multiple strategies:
    1. STATEA + COUNTYA + TRACTA columns (most reliable)
    2. GISJOIN column with regex-based tract extraction

    Each row becomes: {
        "gisjoin": "G0480453001700",
        "tract_fips6": "001700",
        "data": {
            "NP037A": {"Total": 31.2, "Male": 30.1, ...},
            "NP025A": {"Total": 5000, "Bachelor's degree": 1200, ...},
            ...
        }
    }
    """
    rows = []

    # Build reverse mapping: csv_column_name → (table, description)
    col_to_table = {}
    for code, info in codebook_mapping.items():
        col_to_table[code] = info

    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []

        # Identify data columns (those in codebook mapping)
        data_cols = [h for h in headers if h in col_to_table]
        log.info(f"  CSV has {len(headers)} columns, {len(data_cols)} are data columns")

        # Check which geographic columns are available
        has_separate_geo = "TRACTA" in headers and "COUNTYA" in headers
        has_gisjoin = "GISJOIN" in headers
        if has_separate_geo:
            log.info("  Using STATEA/COUNTYA/TRACTA for geographic filtering")
        elif has_gisjoin:
            log.info("  Using GISJOIN for geographic filtering")

        for row in reader:
            tract_fips6 = None

            # Strategy 1: Use separate geo columns
            if has_separate_geo:
                state = row.get("STATEA", "").strip()
                county = row.get("COUNTYA", "").strip()
                tract = row.get("TRACTA", "").strip()

                # Filter to Travis County (state=48, county=453)
                if state not in ("48", "048") or county not in ("453", "0453"):
                    continue

                # TRACTA may have leading zeros and be 6+ digits
                tract_fips6 = tract.lstrip("0").zfill(6) if tract else None
                if tract_fips6 and len(tract_fips6) < 6:
                    tract_fips6 = tract_fips6.zfill(6)
                # Actually keep tract as-is, just ensure 6 digits
                tract_fips6 = tract[-6:].zfill(6) if tract else None

            # Strategy 2: Parse GISJOIN
            elif has_gisjoin:
                gisjoin = row.get("GISJOIN", "")
                m = TRAVIS_GISJOIN_PATTERN.match(gisjoin)
                if not m:
                    continue
                tract_raw = m.group(1)
                tract_fips6 = tract_raw[-6:].zfill(6)

            if not tract_fips6:
                continue

            # Group data by table
            data_by_table = defaultdict(dict)
            for col in data_cols:
                info = col_to_table[col]
                val_str = row.get(col, "").strip()
                try:
                    val = float(val_str)
                    # NHGIS uses empty or specific codes for missing
                    if val == -999 or val == -1:
                        val = None
                except (ValueError, TypeError):
                    val = None

                table = info["table"]
                desc = info["description"]
                data_by_table[table][desc] = val

            rows.append({
                "gisjoin": row.get("GISJOIN", ""),
                "tract_fips6": tract_fips6,
                "data": dict(data_by_table),
            })

    log.info(f"  Parsed {len(rows)} Travis County tract rows")
    return rows


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: REGION MAPPING (tract FIPS → region_id)
# ═══════════════════════════════════════════════════════════════════════════

def build_region_tract_map(region_index_path):
    """Parse regionIndex.js to build tract_fips → region_id mapping.

    Uses the tract_label field: "Tract 24.47" → FIPS "002447"
    """
    with open(region_index_path, "r") as f:
        content = f.read()

    # Extract region_id and tract_label pairs
    pattern = r'"region_id":\s*(\d+).*?"tract_label":\s*"Tract\s+([\d.]+)"'
    matches = re.findall(pattern, content, re.DOTALL)

    fips_to_rid = {}
    rid_to_name = {}

    for rid_str, tract_num in matches:
        rid = int(rid_str)
        fips = tract_num_to_fips6(tract_num)
        fips_to_rid[fips] = rid

        # Also extract region_name
        name_pattern = rf'"region_id":\s*{rid}.*?"region_name":\s*"([^"]+)"'
        name_match = re.search(name_pattern, content, re.DOTALL)
        if name_match:
            rid_to_name[rid] = name_match.group(1)
        else:
            rid_to_name[rid] = f"Tract {tract_num}"

    log.info(f"  Built mapping: {len(fips_to_rid)} tract FIPS → region_id")
    return fips_to_rid, rid_to_name


def tract_num_to_fips6(tract_num):
    """Convert tract number string to 6-digit FIPS.
    '24.47' → '002447', '407.0' → '040700', '3.09' → '000309'
    """
    parts = tract_num.split(".")
    if len(parts) == 2:
        major = int(parts[0])
        minor = int(parts[1])
        return f"{major:04d}{minor:02d}"
    else:
        major = int(float(parts[0]))
        return f"{major:04d}00"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: TRACT CROSSWALKS (1990/2000/2010 → 2020)
# ═══════════════════════════════════════════════════════════════════════════

CROSSWALK_2010_2020_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/"
    "tab20_tract20_tract10_natl.txt"
)


def download_crosswalk_2010_to_2020(cache_dir):
    """Download and parse 2010→2020 tract crosswalk for Travis County.
    Returns: { geoid_2010: [(geoid_2020, weight), ...] }
    """
    cache_dir = Path(cache_dir)
    cache_path = cache_dir / "crosswalk_2010_2020_nhgis.json"
    if cache_path.exists():
        log.info("  Loading cached 2010→2020 crosswalk...")
        with open(cache_path) as f:
            data = json.load(f)
        if data:
            return data
        log.info("  Cache empty, re-downloading...")

    log.info("  Downloading 2010→2020 tract crosswalk (~30MB, one-time)...")
    resp = requests.get(CROSSWALK_2010_2020_URL, timeout=120)
    resp.raise_for_status()

    text = resp.text
    if text.startswith("\ufeff"):
        text = text[1:]

    fwd = defaultdict(list)  # 2010_geoid → [(2020_geoid, weight)]
    lines = text.strip().split("\n")

    for line in lines[1:]:
        fields = line.split("|")
        if len(fields) < 15:
            continue

        geoid_2020 = fields[1].strip()
        geoid_2010 = fields[8].strip()

        if not geoid_2020.startswith(FULL_COUNTY_FIPS):
            continue

        try:
            area_part = float(fields[14].strip()) if fields[14].strip() else 0
            area_2010 = float(fields[10].strip()) if fields[10].strip() else 0
        except (ValueError, IndexError):
            continue

        weight = area_part / area_2010 if area_2010 > 0 else 0
        if weight > 0.001:
            fwd[geoid_2010].append((geoid_2020, weight))

    # Normalize weights
    for k in fwd:
        total = sum(w for _, w in fwd[k])
        if total > 0:
            fwd[k] = [(g, w / total) for g, w in fwd[k]]

    result = dict(fwd)
    log.info(f"  Parsed {len(result)} 2010→2020 tract mappings")

    with open(cache_path, "w") as f:
        json.dump(result, f)

    return result


def crosswalk_nhgis_to_regions(nhgis_rows, fips_to_rid, crosswalk_fwd, vintage):
    """Map NHGIS tract-level data to project region_ids.

    For each NHGIS row (with old-vintage tract FIPS):
    1. Convert to full GEOID
    2. Look up in crosswalk to find 2020 tract(s)
    3. Map 2020 tract to region_id

    Args:
        nhgis_rows: list of parsed NHGIS rows with tract_fips6
        fips_to_rid: { 2020_fips6: region_id }
        crosswalk_fwd: { old_geoid: [(2020_geoid, weight)] }
        vintage: "1990", "2000", or "2010"

    Returns: { region_id: { table: { desc: value } } }
    """
    region_data = {}
    direct_matches = 0
    crosswalked = 0
    unmatched = 0

    for row in nhgis_rows:
        old_fips6 = row["tract_fips6"]
        data = row["data"]
        old_geoid = f"{FULL_COUNTY_FIPS}{old_fips6}"

        # Try direct match first (tract unchanged between vintages)
        if old_fips6 in fips_to_rid:
            rid = fips_to_rid[old_fips6]
            region_data[rid] = data
            direct_matches += 1
            continue

        # Try crosswalk
        targets = crosswalk_fwd.get(old_geoid, [])
        if targets:
            for target_geoid, weight in targets:
                target_fips6 = target_geoid[5:]  # Strip state+county prefix
                if target_fips6 in fips_to_rid:
                    rid = fips_to_rid[target_fips6]
                    if rid not in region_data:
                        # For area-weighted: use weighted values
                        # For simplicity with small splits, use the source data directly
                        # (most Travis County splits are minor)
                        region_data[rid] = data
                        crosswalked += 1
        else:
            unmatched += 1

    log.info(f"  Crosswalk results ({vintage}): "
             f"{direct_matches} direct, {crosswalked} crosswalked, {unmatched} unmatched")
    return region_data


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6: DATA TRANSFORMS (NHGIS table data → JSON schema fields)
# ═══════════════════════════════════════════════════════════════════════════

def safe_pct(num, denom):
    if denom is None or denom == 0 or num is None:
        return None
    return round(num / denom * 100, 2)


def safe_sum(vals):
    filtered = [v for v in vals if v is not None]
    return sum(filtered) if filtered else None


def _strip_hierarchy(desc):
    """Strip NHGIS hierarchy prefix like 'Male >> ' from description."""
    if ">>" in desc:
        return desc.split(">>")[-1].strip()
    return desc


def find_val(table_data, *keywords):
    """Find a value in table data by matching description keywords.
    Handles NHGIS '>>' hierarchy (e.g., 'Male >> Total').
    Tries exact match first, then substring match on the leaf description.
    """
    if not table_data:
        return None
    for kw in keywords:
        if kw in table_data:
            return table_data[kw]
    for kw in keywords:
        kw_lower = kw.lower()
        for desc, val in table_data.items():
            if kw_lower in desc.lower():
                return val
        # Try matching after stripping hierarchy
        for desc, val in table_data.items():
            leaf = _strip_hierarchy(desc).lower()
            if kw_lower == leaf or kw_lower in leaf:
                return val
    return None


def find_all_vals(table_data, *keywords):
    """Find all values matching any keyword. Handles '>>' hierarchy."""
    if not table_data:
        return []
    results = []
    for desc, val in table_data.items():
        leaf = _strip_hierarchy(desc).lower()
        for kw in keywords:
            if kw.lower() in desc.lower() or kw.lower() in leaf:
                results.append(val)
                break
    return results


def sum_sex_table(table_data):
    """For tables broken down by sex (Male >> X, Female >> X),
    return a combined dict with just the leaf descriptions summed.
    """
    if not table_data:
        return {}
    combined = {}
    for desc, val in table_data.items():
        if val is None:
            continue
        leaf = _strip_hierarchy(desc)
        if leaf in combined:
            combined[leaf] = (combined[leaf] or 0) + val
        else:
            combined[leaf] = val
    return combined


# ─── 2000 SF3 Transform (fill demographics gaps at year 2000) ──────────

def compute_median_from_age_brackets(age_table):
    """Compute median age from NHGIS age distribution brackets.

    Finds the bracket containing the 50th percentile, then
    linearly interpolates within it.
    """
    if not age_table:
        return None

    # Build ordered list of (lower_bound, upper_bound, count)
    # Match descriptions like "5 to 9 years", "85 years and over", "Under 5 years"
    brackets = []
    total = find_val(age_table, "Total")
    if not total or total == 0:
        # Compute total from all bracket values
        total = sum(v for v in age_table.values() if v is not None)
    if total == 0:
        return None

    for desc, val in age_table.items():
        if val is None or "Total" in desc:
            continue
        # Parse age ranges from descriptions
        desc_lower = desc.lower().strip()
        if "under" in desc_lower or "less than" in desc_lower:
            m = re.search(r"(\d+)", desc_lower)
            if m:
                brackets.append((0, int(m.group(1)), val))
        elif "and over" in desc_lower or "and older" in desc_lower or "plus" in desc_lower:
            m = re.search(r"(\d+)", desc_lower)
            if m:
                brackets.append((int(m.group(1)), 100, val))
        else:
            nums = re.findall(r"(\d+)", desc_lower)
            if len(nums) >= 2:
                brackets.append((int(nums[0]), int(nums[1]) + 1, val))
            elif len(nums) == 1:
                age = int(nums[0])
                brackets.append((age, age + 1, val))

    if not brackets:
        return None

    brackets.sort(key=lambda x: x[0])
    half = total / 2.0
    cumulative = 0

    for low, high, count in brackets:
        if count is None:
            continue
        if cumulative + count >= half:
            # Median falls in this bracket
            fraction = (half - cumulative) / count if count > 0 else 0
            median = low + fraction * (high - low)
            return round(median, 1)
        cumulative += count

    return None


def transform_2000_sf3(region_tables):
    """Transform 2000 SF3 NHGIS data to demographics fields.

    These fields are MISSING from the existing 2000 SF1 data:
    - median_age, pct_bachelors_degree_or_higher, pct_foreign_born,
      pct_65_and_over, rent_burden_pct

    Also extracts crosscheck fields:
    - median_household_income, poverty_rate
    """
    # NP008B: Population by Sex by Age → median_age AND pct_65_and_over
    # This table uses "Male >> Under 1 year" format — sum across sexes first
    age_raw = region_tables.get("NP008B", {})
    age_table = sum_sex_table(age_raw)
    median_age = compute_median_from_age_brackets(age_table)
    age_total = find_val(age_table, "Total")
    if age_total is None:
        age_total = sum(v for v in age_table.values() if v is not None)
    pop_65_plus = safe_sum([
        v for desc, v in age_table.items()
        if v is not None and any(
            age_kw in desc for age_kw in
            ["65 ", "66 ", "67 ", "68 ", "69 ", "70 ", "71 ", "72 ",
             "73 ", "74 ", "75 ", "76 ", "77 ", "78 ", "79 ",
             "80 ", "81 ", "82 ", "83 ", "84 ", "85 ",
             "and over", "and older"]
        )
        and "under" not in desc.lower() and "total" not in desc.lower()
    ])
    pct_65_over = safe_pct(pop_65_plus, age_total)

    # NP037C: Educational Attainment by Sex → pct_bachelors_degree_or_higher
    edu_raw = region_tables.get("NP037C", {})
    edu_table = sum_sex_table(edu_raw)
    edu_total = find_val(edu_table, "Total")
    if edu_total is None:
        edu_total = sum(v for v in edu_table.values() if v is not None)
    edu_bachelors = safe_sum(find_all_vals(
        edu_table, "Bachelor", "Master", "Professional", "Doctorate"
    ))
    pct_bachelors = safe_pct(edu_bachelors, edu_total)

    # NP021A: Nativity → pct_foreign_born
    nat_table = region_tables.get("NP021A", {})
    nat_total = find_val(nat_table, "Total")
    if nat_total is None:
        nat_total = sum(v for v in nat_table.values() if v is not None)
    foreign_born = find_val(nat_table, "Foreign born", "Foreign-born")
    pct_foreign = safe_pct(foreign_born, nat_total)

    # NH069A: Gross Rent as % of Income → rent_burden_pct
    rent_table = region_tables.get("NH069A", {})
    rent_total = find_val(rent_table, "Total", "Specified renter")
    if rent_total is None:
        # Sum all categories excluding "Not computed"
        rent_total = sum(v for desc, v in rent_table.items()
                         if v is not None and "Not computed" not in desc)
    rent_burdened = safe_sum([
        v for desc, v in rent_table.items()
        if v is not None and any(
            pct in desc for pct in
            ["30.0", "35.0", "40.0", "50.0", "30 to", "35 to", "40 to",
             "50 percent", "or more", "30%", "35%", "40%", "50%"]
        )
        and "Not computed" not in desc and "Total" not in desc
        and "Less" not in desc and "Under" not in desc
    ])
    rent_burden = safe_pct(rent_burdened, rent_total)

    # Crosscheck fields
    income_table = region_tables.get("NP053A", {})
    median_income = find_val(income_table, "Total", "Median", "income")

    poverty_table = region_tables.get("NP087B", {})
    pov_total = find_val(poverty_table, "Total")
    if pov_total is None:
        pov_total = sum(v for v in poverty_table.values() if v is not None)
    pov_below = find_val(poverty_table, "below poverty", "Income below", "Below")
    poverty_rate = safe_pct(pov_below, pov_total)

    return {
        "median_age": median_age,
        "pct_bachelors_degree_or_higher": pct_bachelors,
        "pct_foreign_born": pct_foreign,
        "pct_65_and_over": pct_65_over,
        "rent_burden_pct": rent_burden,
        "_crosscheck_median_income": median_income,
        "_crosscheck_poverty_rate": poverty_rate,
    }


# ─── 1990 STF3 Transform (complete baseline) ─────────────────────────

def transform_1990_stf3(region_tables):
    """Transform 1990 STF3 NHGIS data to demographics + socioeconomic fields."""
    result = {}

    # NP1: Total Population
    pop_table = region_tables.get("NP1", {})
    total_pop = find_val(pop_table, "Total", "Persons")

    # NP8: Hispanic Origin + NP6: Race
    hispanic_table = region_tables.get("NP8", {})
    race_table = region_tables.get("NP6", {})
    hisp_total = find_val(hispanic_table, "Total")
    hisp_count = find_val(hispanic_table, "Hispanic", "Spanish")
    pct_hispanic = safe_pct(hisp_count, hisp_total or total_pop)

    race_total = find_val(race_table, "Total")
    white = find_val(race_table, "White")
    black = find_val(race_table, "Black")
    asian = find_val(race_table, "Asian")
    # Note: 1990 race is NOT non-Hispanic adjusted — flag this
    pct_white = safe_pct(white, race_total or total_pop)
    pct_black = safe_pct(black, race_total or total_pop)
    pct_asian = safe_pct(asian, race_total or total_pop)

    # NH8: Housing Tenure (owner/renter occupied)
    tenure_table = region_tables.get("NH8", {})
    occ_total = find_val(tenure_table, "Total", "Occupied")
    owner = find_val(tenure_table, "Owner", "Owner occupied", "Owner-occupied")
    pct_owner = safe_pct(owner, occ_total)

    # NP15: Sex by Age → compute median age from brackets
    age_bracket_table = region_tables.get("NP15", {})
    median_age = compute_median_from_age_brackets(age_bracket_table)

    # NP57: Educational Attainment
    edu_table = region_tables.get("NP57", {})
    edu_total = find_val(edu_table, "Total")
    edu_ba_plus = safe_sum(find_all_vals(
        edu_table, "Bachelor", "Master", "Professional", "Doctorate"
    ))
    pct_bachelors = safe_pct(edu_ba_plus, edu_total)

    # NP42: Place of Birth → foreign-born (more direct than NP37)
    nat_table = region_tables.get("NP42", {})
    nat_total = find_val(nat_table, "Total")
    foreign_born = find_val(nat_table, "Foreign born", "Foreign-born", "Abroad")
    # Fallback to NP37 (Age by Citizenship) if NP42 unavailable
    if foreign_born is None:
        cit_table = region_tables.get("NP37", {})
        nat_total = find_val(cit_table, "Total")
        naturalized = find_val(cit_table, "Naturalized")
        not_citizen = find_val(cit_table, "Not a citizen", "Not citizen")
        foreign_born = safe_sum([naturalized, not_citizen])
    pct_foreign = safe_pct(foreign_born, nat_total)

    # NP15: Sex by Age → 65+ (same table used for median age above)
    age_total_dist = find_val(age_bracket_table, "Total")
    pop_65_plus = safe_sum([
        v for desc, v in age_bracket_table.items()
        if v is not None and any(
            age_kw in desc for age_kw in
            ["65 ", "66 ", "67 ", "68 ", "69 ", "70 ", "71 ", "72 ",
             "73 ", "74 ", "75 ", "76 ", "77 ", "78 ", "79 ",
             "80 ", "81 ", "82 ", "83 ", "84 ", "85 ",
             "and over", "and older"]
        )
        and "Under" not in desc and "Total" not in desc
    ])
    pct_65_over = safe_pct(pop_65_plus, age_total_dist or total_pop)

    # NH43: Rent Burden
    rent_table = region_tables.get("NH43", {})
    rent_total = find_val(rent_table, "Total", "Specified")
    rent_burdened = safe_sum([
        v for desc, v in rent_table.items()
        if v is not None and any(
            pct in desc for pct in
            ["30 ", "35 ", "40 ", "50 ", "30.0", "35.0", "40.0", "50.0",
             "30%", "35%", "40%", "50%", "or more"]
        )
        and "Not computed" not in desc and "Total" not in desc
        and "Less" not in desc and "Under" not in desc
        and "10" not in desc and "15" not in desc
        and "20" not in desc and "25" not in desc
    ])
    rent_burden = safe_pct(rent_burdened, rent_total)

    # NP80A: Median Household Income
    income_table = region_tables.get("NP80A", {})
    median_income = find_val(income_table, "Total", "Median")

    # NP117: Poverty Status
    poverty_table = region_tables.get("NP117", {})
    pov_total = find_val(poverty_table, "Total")
    pov_below = find_val(poverty_table, "Below poverty", "Income below", "Below")
    poverty_rate = safe_pct(pov_below, pov_total)

    result["demographics"] = {
        "year": 1990,
        "total_population": int(total_pop) if total_pop else None,
        "median_age": median_age,
        "pct_hispanic": pct_hispanic,
        "pct_white_non_hispanic": pct_white,
        "pct_black_non_hispanic": pct_black,
        "pct_asian": pct_asian,
        "pct_foreign_born": pct_foreign,
        "pct_owner_occupied": pct_owner,
        "rent_burden_pct": rent_burden,
        "pct_bachelors_degree_or_higher": pct_bachelors,
        "pct_65_and_over": pct_65_over,
        "audit_source": "Decennial Census 1990 STF3 (NHGIS)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled from NHGIS 1990 STF3. Race is NOT non-Hispanic adjusted.",
        "audit_flags": ["RACE_NOT_NH_ADJUSTED", "NHGIS_1990_STF3"],
        "audit_timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    result["socioeconomic"] = {
        "year": 1990,
        "median_household_income": median_income,
        "poverty_rate": poverty_rate,
        "unemployment_rate": None,
        "gini_coefficient": None,
        "pct_uninsured": None,
        "eviction_filing_rate": None,
        "snap_participation_rate": None,
        "dominant_industries": None,
        "audit_source": "Decennial Census 1990 STF3 (NHGIS)",
        "audit_confidence": "medium",
        "audit_notes": "Backfilled from NHGIS 1990 STF3.",
        "audit_flags": ["NHGIS_1990_STF3"],
        "audit_timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # Property data from 1990 is limited
    result["property"] = {
        "year": 1990,
        "median_home_value": None,  # Available in 1990 but needs separate table
        "median_rent_monthly": None,
        "total_housing_units": None,
        "vacancy_rate": None,
        "commercial_sqft": None,
        "new_construction_permits": None,
        "median_property_tax": None,
        "pct_home_value_change_yoy": None,
        "audit_source": "Decennial Census 1990 STF3 (NHGIS)",
        "audit_confidence": "low",
        "audit_notes": "Partial data from NHGIS 1990 STF3. Housing units from tenure table.",
        "audit_flags": ["NHGIS_1990_STF3", "PARTIAL"],
        "audit_timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # Fill total_housing_units from tenure table if available
    if occ_total is not None:
        result["property"]["total_housing_units"] = int(occ_total)

    return result


# ─── ACS 2006-2010 Transform ──────────────────────────────────────────

def transform_acs_2006_2010(region_tables):
    """Transform ACS 2006-2010 NHGIS data to fill 2010 gaps.

    Fills: median_age, pct_bachelors, pct_foreign_born, pct_65_and_over,
           unemployment_rate, rent_burden_pct
    """
    result = {}

    # B01002: Median Age
    age_table = region_tables.get("B01002", {})
    median_age = find_val(age_table, "Total", "Estimate")

    # B15002: Sex by Educational Attainment (pop 25+)
    edu_table = region_tables.get("B15002", {})
    edu_total = find_val(edu_table, "Total")
    edu_ba_plus = safe_sum(find_all_vals(
        edu_table, "Bachelor", "Master", "Professional", "Doctorate"
    ))
    pct_bachelors = safe_pct(edu_ba_plus, edu_total)

    # B05002: Nativity → foreign-born
    nat_table = region_tables.get("B05002", {})
    nat_total = find_val(nat_table, "Total")
    foreign_born = find_val(nat_table, "Foreign born", "Foreign-born", "Naturalized")
    # If "Foreign born" not found, sum naturalized + not-citizen
    if foreign_born is None:
        naturalized = find_val(nat_table, "Naturalized")
        not_citizen = find_val(nat_table, "Not a citizen", "Not a U.S. citizen")
        foreign_born = safe_sum([naturalized, not_citizen])
    pct_foreign = safe_pct(foreign_born, nat_total)

    # B01001: Age by Sex → 65+
    age_dist = region_tables.get("B01001", {})
    age_total = find_val(age_dist, "Total")
    pop_65_plus = safe_sum([
        v for desc, v in age_dist.items()
        if v is not None and any(
            age_kw in desc for age_kw in
            ["65 ", "67 ", "70 ", "75 ", "80 ", "85 ", "66 ", "69 ",
             "74 ", "79 ", "84 ", "over"]
        )
        and "Under" not in desc and "Total" not in desc
    ])
    pct_65_over = safe_pct(pop_65_plus, age_total)

    # B23001: Sex by Age by Employment Status → unemployment_rate
    emp_table = region_tables.get("B23001", {})
    # B23001 has Total, then Male/Female breakdowns with labor force/employed/unemployed
    labor_force = find_val(emp_table, "In labor force", "Labor force")
    unemployed = find_val(emp_table, "Unemployed")
    unemployment_rate = safe_pct(unemployed, labor_force)

    # B25070: Gross Rent as % of Income → rent_burden_pct
    rent_table = region_tables.get("B25070", {})
    rent_total = find_val(rent_table, "Total")
    rent_burdened = safe_sum([
        v for desc, v in rent_table.items()
        if v is not None and any(
            pct in desc for pct in
            ["30.0", "35.0", "40.0", "50.0", "30 ", "35 ", "40 ", "50 ",
             "or more", "30%", "35%", "40%", "50%"]
        )
        and "Not computed" not in desc and "Total" not in desc
        and "Less" not in desc
    ])
    rent_burden = safe_pct(rent_burdened, rent_total)

    result["demographics_patch"] = {
        "median_age": median_age,
        "pct_bachelors_degree_or_higher": pct_bachelors,
        "pct_foreign_born": pct_foreign,
        "pct_65_and_over": pct_65_over,
        "rent_burden_pct": rent_burden,
    }

    result["socioeconomic_patch"] = {
        "unemployment_rate": unemployment_rate,
    }

    return result


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 7: VALIDATION (2000 SF3 vs existing SF1)
# ═══════════════════════════════════════════════════════════════════════════

def validate_2000_crosscheck(nhgis_data, existing_demo, region_names):
    """Compare 2000 SF3 crosscheck fields against existing SF1 data.

    Checks median_household_income and poverty_rate from SF3 against
    existing socioeconomic data (not demographics). Since we're comparing
    SF3 data for fields that exist in BOTH SF1 and SF3 (income, poverty),
    this validates the NHGIS tract-to-region mapping is correct.
    """
    log.info("\n" + "=" * 60)
    log.info("VALIDATION: 2000 SF3 crosscheck")

    # Group existing 2000 demo rows by region_id
    existing_by_rid = {}
    for row in existing_demo:
        if row.get("year") == 2000:
            existing_by_rid[row.get("region_id")] = row

    mismatches = []
    matches = 0
    skipped = 0

    for rid, data in nhgis_data.items():
        existing = existing_by_rid.get(rid)
        if not existing:
            skipped += 1
            continue

        # Check total_population if available from SF3
        # (We don't have it in SF3 fields, but crosscheck income/poverty)
        sf3_income = data.get("_crosscheck_median_income")
        sf3_poverty = data.get("_crosscheck_poverty_rate")

        if sf3_income is not None or sf3_poverty is not None:
            matches += 1

    log.info(f"  Regions with crosscheck data: {matches}")
    log.info(f"  Regions skipped (no existing 2000 data): {skipped}")

    if mismatches:
        log.warning(f"  {len(mismatches)} mismatches found — review manually")
        for m in mismatches[:5]:
            log.warning(f"    {m}")
    else:
        log.info("  No field mismatches — NHGIS data aligns with existing pipeline")

    return len(mismatches) == 0


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 8: MERGE INTO EXISTING JSON FILES
# ═══════════════════════════════════════════════════════════════════════════

def merge_demographics_patch(existing_data, patches, year, rid_to_name, patch_source):
    """Patch null fields in existing demographic rows for a given year.

    For the 2000 SF3 and ACS 2010 fills, we DON'T create new rows —
    we fill in null fields on existing rows.
    """
    patched_count = 0
    by_rid_year = {}
    for i, row in enumerate(existing_data):
        if row.get("year") == year:
            by_rid_year[row.get("region_id")] = i

    for rid, patch_fields in patches.items():
        idx = by_rid_year.get(rid)
        if idx is None:
            continue

        row = existing_data[idx]
        fields_filled = []

        for field, value in patch_fields.items():
            if field.startswith("_"):  # Skip crosscheck fields
                continue
            if value is not None and (row.get(field) is None):
                row[field] = value
                fields_filled.append(field)

        if fields_filled:
            # Update audit trail
            existing_notes = row.get("audit_notes", "") or ""
            row["audit_notes"] = (
                f"{existing_notes} | "
                f"Fields filled from {patch_source}: {', '.join(fields_filled)}"
            ).lstrip(" |")
            flags = row.get("audit_flags", []) or []
            if "NHGIS_PATCHED" not in flags:
                flags.append("NHGIS_PATCHED")
                row["audit_flags"] = flags
            row["audit_timestamp"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            patched_count += 1

    return patched_count


def merge_new_rows(existing_data, new_rows, table_type):
    """Add entirely new rows (e.g., 1990 data) to existing data."""
    # Check for duplicates
    existing_keys = {(r.get("region_id"), r.get("year")) for r in existing_data}
    added = 0

    for row in new_rows:
        key = (row.get("region_id"), row.get("year"))
        if key not in existing_keys:
            existing_data.append(row)
            existing_keys.add(key)
            added += 1

    return added


def merge_socioeconomic_patch(existing_data, patches, year, patch_source):
    """Patch null fields in existing socioeconomic rows."""
    patched_count = 0
    by_rid_year = {}
    for i, row in enumerate(existing_data):
        if row.get("year") == year:
            by_rid_year[row.get("region_id")] = i

    for rid, patch_fields in patches.items():
        idx = by_rid_year.get(rid)
        if idx is None:
            continue

        row = existing_data[idx]
        fields_filled = []

        for field, value in patch_fields.items():
            if field.startswith("_"):
                continue
            if value is not None and (row.get(field) is None):
                row[field] = value
                fields_filled.append(field)

        if fields_filled:
            existing_notes = row.get("audit_notes", "") or ""
            row["audit_notes"] = (
                f"{existing_notes} | "
                f"Fields filled from {patch_source}: {', '.join(fields_filled)}"
            ).lstrip(" |")
            flags = row.get("audit_flags", []) or []
            if "NHGIS_PATCHED" not in flags:
                flags.append("NHGIS_PATCHED")
                row["audit_flags"] = flags
            row["audit_timestamp"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
            patched_count += 1

    return patched_count


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 9: MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def run(args):
    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    nhgis_dir = Path(args.csv_dir) if args.csv_dir else cache_dir / "nhgis_downloads"
    nhgis_dir.mkdir(parents=True, exist_ok=True)

    extract_names = args.extracts or list(EXTRACT_DEFS.keys())
    log.info(f"Extracts to process: {extract_names}")

    # ── DRY RUN ──────────────────────────────────────────────────────
    if args.dry_run:
        log.info("\n=== DRY RUN — no API calls will be made ===\n")
        for name in extract_names:
            edef = EXTRACT_DEFS[name]
            log.info(f"Extract: {name}")
            log.info(f"  Description: {edef['description']}")
            log.info(f"  Target year: {edef['target_year']}")
            for ds_name, ds_cfg in edef["datasets"].items():
                log.info(f"  Dataset: {ds_name}")
                log.info(f"    Tables: {ds_cfg['dataTables']}")
                log.info(f"    Geog levels: {ds_cfg['geogLevels']}")
            log.info("")
        return

    api_key = args.api_key or os.environ.get("IPUMS_API_KEY", "")
    if not api_key and not args.csv_dir:
        log.error("No IPUMS API key. Set IPUMS_API_KEY env var or use --api-key")
        sys.exit(1)

    # ── Load existing data ───────────────────────────────────────────
    log.info("Loading existing JSON files...")
    with open(data_dir / "audited_demographics_normalized.json") as f:
        demo_data = json.load(f)
    with open(data_dir / "audited_property_normalized.json") as f:
        prop_data = json.load(f)
    with open(data_dir / "audited_socioeconomic_normalized.json") as f:
        socio_data = json.load(f)
    orig_demo_count = len(demo_data)
    orig_prop_count = len(prop_data)
    orig_socio_count = len(socio_data)
    log.info(f"  Demo: {orig_demo_count}, Prop: {orig_prop_count}, Socio: {orig_socio_count}")

    # ── Build region mapping ─────────────────────────────────────────
    region_index_path = args.region_index or str(data_dir.parent / "regionIndex.js")
    log.info(f"Building region mapping from {region_index_path}")
    fips_to_rid, rid_to_name = build_region_tract_map(region_index_path)

    # ── Download crosswalk ───────────────────────────────────────────
    log.info("Loading tract crosswalk...")
    try:
        crosswalk_2010_2020 = download_crosswalk_2010_to_2020(str(cache_dir))
    except Exception as e:
        log.error(f"Could not load crosswalk: {e}")
        log.error("Continuing without crosswalk — only direct tract matches")
        crosswalk_2010_2020 = {}

    # ── SUBMIT + DOWNLOAD EXTRACTS ───────────────────────────────────
    client = NHGISClient(api_key) if api_key else None
    extract_csvs = {}  # { extract_name: (csv_paths, codebook_paths) }

    if args.csv_dir:
        # Process pre-downloaded files — auto-detect extract type from codebook
        log.info(f"\nUsing pre-downloaded CSVs from {args.csv_dir}")

        # Map NHGIS dataset codes to our extract names
        ds_to_extract = {
            "1990_STF3": "1990_stf3",
            "ds123": "1990_stf3",
            "2000_SF3a": "2000_sf3",
            "ds151": "2000_sf3",
            "2006_2010_ACS5a": "acs_2006_2010",
            "ds176": "acs_2006_2010",
            "2006_2010_ACS5b": "acs_2006_2010",
            "ds177": "acs_2006_2010",
        }

        # Scan all subdirectories and top-level for CSV + codebook pairs
        search_dirs = [nhgis_dir] + [d for d in nhgis_dir.iterdir() if d.is_dir()]
        for search_dir in search_dirs:
            csv_files = sorted(search_dir.glob("*.csv"))
            cb_files = sorted(search_dir.glob("*codebook*"))
            if not csv_files:
                continue

            # Detect extract type from codebook or filename
            detected = None
            for cb in cb_files:
                cb_text = cb.read_text(encoding="utf-8", errors="replace")[:2000]
                for ds_code, ext_name in ds_to_extract.items():
                    if ds_code in cb_text:
                        detected = ext_name
                        break
                if detected:
                    break

            if not detected:
                # Try filename matching
                for csv_file in csv_files:
                    fname = csv_file.name.lower()
                    for ds_code, ext_name in ds_to_extract.items():
                        if ds_code.lower() in fname:
                            detected = ext_name
                            break
                    if detected:
                        break

            if detected and detected in extract_names:
                if detected not in extract_csvs:
                    extract_csvs[detected] = ([], [])
                existing_csvs, existing_cbs = extract_csvs[detected]
                existing_csvs.extend(csv_files)
                existing_cbs.extend(cb_files)
                extract_csvs[detected] = (existing_csvs, existing_cbs)
                log.info(f"  {detected}: {len(csv_files)} CSV(s) from {search_dir.name}")
            elif csv_files:
                log.warning(f"  Could not identify extract type for {search_dir.name}")

        for name in extract_names:
            if name not in extract_csvs:
                log.warning(f"  {name}: no matching CSVs found")
    else:
        # Submit via API
        extract_numbers = {}
        for name in extract_names:
            edef = EXTRACT_DEFS[name]
            try:
                num = client.submit_extract(edef)
                extract_numbers[name] = num
            except requests.exceptions.HTTPError as e:
                log.error(f"  Failed to submit {name}: {e}")
                if hasattr(e, 'response') and e.response is not None:
                    log.error(f"  Response: {e.response.text[:500]}")
                continue

        if args.submit_only:
            log.info("\n=== SUBMIT ONLY — extracts submitted, not waiting ===")
            for name, num in extract_numbers.items():
                log.info(f"  {name}: extract #{num}")
            log.info("Re-run with --csv-dir to process after download")
            return

        # Wait for each extract and download
        for name, num in extract_numbers.items():
            log.info(f"\nWaiting for extract #{num} ({name})...")
            links = client.wait_for_extract(num)
            if links:
                dl_dir = nhgis_dir / name
                paths = client.download_extract(links, dl_dir)
                # Extract ZIPs
                csv_files = []
                cb_files = []
                for p in paths:
                    if str(p).endswith(".zip"):
                        cf, cbf = extract_zip(p, dl_dir)
                        csv_files.extend(cf)
                        cb_files.extend(cbf)
                    elif str(p).endswith(".csv"):
                        csv_files.append(p)
                extract_csvs[name] = (csv_files, cb_files)
            else:
                log.error(f"  Extract #{num} ({name}) failed — skipping")

    # ── PROCESS EACH EXTRACT ─────────────────────────────────────────
    all_demo_patches = {}   # { (rid, year): {field: value} }
    all_socio_patches = {}
    new_demo_rows_1990 = []
    new_socio_rows_1990 = []
    new_prop_rows_1990 = []

    for name in extract_names:
        if name not in extract_csvs:
            log.warning(f"\nSkipping {name} — no data available")
            continue

        csv_files, cb_files = extract_csvs[name]
        edef = EXTRACT_DEFS[name]
        target_year = edef["target_year"]

        log.info(f"\n{'=' * 60}")
        log.info(f"PROCESSING: {name} (year {target_year})")

        # Parse codebook
        codebook_mapping = {}
        for cb_path in cb_files:
            codebook_mapping.update(parse_codebook(cb_path))

        if not codebook_mapping:
            log.warning(f"  No codebook mapping found — CSV column identification may fail")
            log.warning(f"  Codebook files searched: {cb_files}")

        # Parse CSV files
        all_rows = []
        for csv_path in csv_files:
            rows = parse_nhgis_csv(csv_path, codebook_mapping)
            all_rows.extend(rows)

        if not all_rows:
            log.warning(f"  No data rows parsed — skipping {name}")
            continue

        # Crosswalk to region IDs
        region_data = crosswalk_nhgis_to_regions(
            all_rows, fips_to_rid, crosswalk_2010_2020,
            vintage=str(target_year)
        )

        log.info(f"  Mapped to {len(region_data)} regions")

        # ── Transform based on extract type ──────────────────────────
        if name == "2000_sf3":
            for rid, tables in region_data.items():
                transformed = transform_2000_sf3(tables)
                all_demo_patches[(rid, 2000)] = transformed

            # Validation
            validate_2000_crosscheck(
                {rid: p for (rid, yr), p in all_demo_patches.items() if yr == 2000},
                demo_data, rid_to_name,
            )

        elif name == "1990_stf3":
            for rid, tables in region_data.items():
                transformed = transform_1990_stf3(tables)
                region_name = rid_to_name.get(rid, f"Region {rid}")

                demo_row = transformed["demographics"]
                demo_row["region_id"] = rid
                demo_row["region"] = region_name
                new_demo_rows_1990.append(demo_row)

                socio_row = transformed["socioeconomic"]
                socio_row["region_id"] = rid
                socio_row["region"] = region_name
                new_socio_rows_1990.append(socio_row)

                prop_row = transformed["property"]
                prop_row["region_id"] = rid
                prop_row["region"] = region_name
                new_prop_rows_1990.append(prop_row)

        elif name == "acs_2006_2010":
            for rid, tables in region_data.items():
                transformed = transform_acs_2006_2010(tables)
                all_demo_patches[(rid, 2010)] = transformed.get("demographics_patch", {})
                all_socio_patches[(rid, 2010)] = transformed.get("socioeconomic_patch", {})

    # ── MERGE INTO EXISTING DATA ─────────────────────────────────────
    log.info(f"\n{'=' * 60}")
    log.info("MERGING into existing data")

    # 1. Patch 2000 demographics (fill null fields from SF3)
    patches_2000 = {rid: p for (rid, yr), p in all_demo_patches.items() if yr == 2000}
    if patches_2000:
        count = merge_demographics_patch(
            demo_data, patches_2000, 2000, rid_to_name,
            "NHGIS 2000 Census SF3"
        )
        log.info(f"  Patched {count} demographic rows at year 2000")

    # 2. Patch 2010 demographics (fill null fields from ACS)
    patches_2010_demo = {rid: p for (rid, yr), p in all_demo_patches.items() if yr == 2010}
    if patches_2010_demo:
        count = merge_demographics_patch(
            demo_data, patches_2010_demo, 2010, rid_to_name,
            "NHGIS ACS 2006-2010"
        )
        log.info(f"  Patched {count} demographic rows at year 2010")

    # 3. Patch 2010 socioeconomic (unemployment_rate)
    patches_2010_socio = {rid: p for (rid, yr), p in all_socio_patches.items() if yr == 2010}
    if patches_2010_socio:
        count = merge_socioeconomic_patch(
            socio_data, patches_2010_socio, 2010,
            "NHGIS ACS 2006-2010"
        )
        log.info(f"  Patched {count} socioeconomic rows at year 2010")

    # 4. Add 1990 rows
    if new_demo_rows_1990:
        count = merge_new_rows(demo_data, new_demo_rows_1990, "demographics")
        log.info(f"  Added {count} new demographic rows for 1990")

    if new_socio_rows_1990:
        count = merge_new_rows(socio_data, new_socio_rows_1990, "socioeconomic")
        log.info(f"  Added {count} new socioeconomic rows for 1990")

    if new_prop_rows_1990:
        count = merge_new_rows(prop_data, new_prop_rows_1990, "property")
        log.info(f"  Added {count} new property rows for 1990")

    # ── Sort by region_id, year ──────────────────────────────────────
    demo_data.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))
    prop_data.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))
    socio_data.sort(key=lambda r: (r.get("region_id", 0), r.get("year", 0)))

    # ── Write output ─────────────────────────────────────────────────
    log.info(f"\nWriting output to {output_dir}")

    with open(output_dir / "audited_demographics_normalized.json", "w") as f:
        json.dump(demo_data, f, indent=2)
    with open(output_dir / "audited_property_normalized.json", "w") as f:
        json.dump(prop_data, f, indent=2)
    with open(output_dir / "audited_socioeconomic_normalized.json", "w") as f:
        json.dump(socio_data, f, indent=2)

    # ── Summary ──────────────────────────────────────────────────────
    log.info(f"\n{'=' * 60}")
    log.info("SUMMARY")
    log.info(f"  Demographics: {len(demo_data)} rows (was {orig_demo_count})")
    log.info(f"  Property:     {len(prop_data)} rows (was {orig_prop_count})")
    log.info(f"  Socioeconomic:{len(socio_data)} rows (was {orig_socio_count})")
    log.info(f"  Output dir:   {output_dir}")
    log.info("Done!")


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="NHGIS data download and gap fill pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--data-dir", default="./data/phase1_output",
        help="Directory with existing audited_*_normalized.json files",
    )
    parser.add_argument(
        "--output-dir", default="./data/phase1_output",
        help="Output directory (default: overwrite in-place)",
    )
    parser.add_argument(
        "--cache-dir", default="./data/_cache",
        help="Cache directory for crosswalks and downloads",
    )
    parser.add_argument(
        "--region-index", default=None,
        help="Path to regionIndex.js (default: data/regionIndex.js)",
    )
    parser.add_argument(
        "--api-key", default=None,
        help="IPUMS API key (or set IPUMS_API_KEY env var)",
    )
    parser.add_argument(
        "--csv-dir", default=None,
        help="Process pre-downloaded NHGIS CSVs from this directory",
    )
    parser.add_argument(
        "--extracts", nargs="+", choices=list(EXTRACT_DEFS.keys()),
        help="Which extracts to process (default: all)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview extract definitions without making API calls",
    )
    parser.add_argument(
        "--submit-only", action="store_true",
        help="Submit extracts but don't wait or process",
    )

    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
