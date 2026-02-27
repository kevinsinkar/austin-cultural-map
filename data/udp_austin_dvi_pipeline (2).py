#!/usr/bin/env python3
"""
UDP Austin — Displacement Vulnerability Index (DVI) Pipeline
=============================================================
1. Loads the City of Austin Displacement Risk Areas 2022 GeoJSON
2. Fetches ACS 5-year Census data (income, home value, education,
   cost burden) for each tract via the Census API
3. Encodes the categorical displacement fields into ordinal scores
4. Computes a composite DVI (0–100)
5. Exports dvi_raw.json, socioeconomic.json, and enriched GeoJSON

Requirements:  pandas, numpy, requests  (or urllib — no geopandas needed)
Usage:         python udp_austin_dvi_pipeline.py
Input:         udp_austin.geojson
"""

from __future__ import annotations

import copy
import json
import logging
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UDP_PATH = Path("udp_austin.geojson")

DATA_YEAR   = 2022
DATA_PERIOD = "2018-2022"

# Census API — no key required for small queries, but adding one avoids
# rate limits.  Get yours free at https://api.census.gov/data/key_signup.html
CENSUS_API_KEY = ""   # optional: paste your key here

# ACS 5-year vintage (must match DATA_YEAR or be close)
ACS_YEAR = 2022

OUT_DVI_RAW       = Path("dvi_raw.json")
OUT_SOCIOECONOMIC = Path("socioeconomic.json")
OUT_GEOJSON       = Path("udp_austin_dvi.geojson")

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ordinal encodings
# ---------------------------------------------------------------------------

DISPLACEMENT_RISK_SCORES = {
    "Chronic Displacement Risk":  1.00,
    "Active Displacement Risk":   0.75,
    "Vulnerable":                 0.50,
    "N/A":                        0.00,
}

VULNERABILITY_SCORES   = {"YES": 1.0, "NO": 0.0, "N/A": 0.0}
DEMOGRAPHIC_SCORES     = {"YES": 1.0, "NO": 0.0, "N/A": 0.0}

HOUSING_MARKET_SCORES = {
    "Appreciated":  1.00,
    "Accelerating": 0.75,
    "Adjacent":     0.50,
    "Stable":       0.15,
    "N/A":          0.00,
}

GENTRIFICATION_SCORES = {
    "Late":                     1.00,
    "Continued Loss":           0.95,
    "Rapid Loss":               0.90,
    "Historical Displacement":  0.80,
    "Dynamic":                  0.65,
    "Early: Type 2":            0.55,
    "Early: Type 1":            0.50,
    "Susceptible":              0.30,
    "Stable":                   0.10,
    "N/A":                      0.00,
}

DVI_WEIGHTS = {
    "displacement_risk":   0.30,
    "vulnerability":       0.20,
    "demographic_change":  0.15,
    "housing_market":      0.20,
    "gentrification":      0.15,
}


# ===================================================================
# 1  LOAD UDP GeoJSON
# ===================================================================

def load_geojson(path: Path) -> tuple[list[dict], list[dict]]:
    if not path.exists():
        log.error("Not found: %s", path)
        sys.exit(1)
    with open(path) as f:
        gj = json.load(f)
    features = gj.get("features", [])
    props = [feat.get("properties", {}) for feat in features]
    log.info("Loaded %d features from %s", len(features), path)
    return props, features


# ===================================================================
# 2  FETCH ACS CENSUS DATA
# ===================================================================

# Variables we need from ACS 5-year Detailed Tables:
#   B19013_001E  — Median household income
#   B25077_001E  — Median home value (owner-occupied)
#   B15003_001E  — Total population 25+ (education denominator)
#   B15003_022E  — Bachelor's degree
#   B15003_023E  — Master's degree
#   B15003_024E  — Professional school degree
#   B15003_025E  — Doctorate degree
#   B25070_001E  — Total renter households (cost-burden denominator)
#   B25070_007E  — Gross rent 30.0–34.9% of income
#   B25070_008E  — Gross rent 35.0–39.9% of income
#   B25070_009E  — Gross rent 40.0–49.9% of income
#   B25070_010E  — Gross rent 50.0%+ of income

ACS_VARIABLES = (
    "B19013_001E,"  # median HH income
    "B25077_001E,"  # median home value
    "B15003_001E,"  # pop 25+ total
    "B15003_022E,"  # bachelor's
    "B15003_023E,"  # master's
    "B15003_024E,"  # professional
    "B15003_025E,"  # doctorate
    "B25070_001E,"  # renter total
    "B25070_007E,"  # 30-34.9%
    "B25070_008E,"  # 35-39.9%
    "B25070_009E,"  # 40-49.9%
    "B25070_010E"   # 50%+
)


def _census_url(state: str, county: str) -> str:
    """Build ACS 5-year API URL for all tracts in a state+county."""
    base = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5"
    url = f"{base}?get=NAME,{ACS_VARIABLES}&for=tract:*&in=state:{state}&in=county:{county}"
    if CENSUS_API_KEY:
        url += f"&key={CENSUS_API_KEY}"
    return url


def fetch_acs_for_counties(county_fips: set[str]) -> pd.DataFrame:
    """
    Fetch ACS 5-year data for all tracts in the given counties.
    county_fips: set of 5-char FIPS codes like {'48453', '48209', …}

    Returns a DataFrame indexed by 11-digit GEOID with columns:
        median_income, median_home_value, pct_bachelors, pct_cost_burdened
    """
    log.info("Fetching ACS %d data for %d counties …", ACS_YEAR, len(county_fips))

    all_rows = []
    header = None

    for fips in sorted(county_fips):
        state = fips[:2]
        county = fips[2:]
        url = _census_url(state, county)
        log.info("  Querying county %s (state=%s, county=%s) …", fips, state, county)

        try:
            resp = urlopen(url, timeout=30)
            data = json.loads(resp.read().decode())
        except (HTTPError, URLError, Exception) as exc:
            log.warning("  ✗ Census API failed for %s: %s", fips, exc)
            continue

        if not data:
            log.warning("  ✗ Empty response for %s", fips)
            continue

        if header is None:
            header = data[0]
        # Skip header row
        all_rows.extend(data[1:])
        log.info("    → %d tracts", len(data) - 1)
        time.sleep(0.3)  # be polite to the API

    if not all_rows:
        log.warning("No ACS data retrieved.  Socioeconomic fields will be null.")
        return pd.DataFrame()

    df = pd.DataFrame(all_rows, columns=header)

    # Build 11-digit GEOID from state + county + tract
    df["geoid11"] = df["state"] + df["county"] + df["tract"]

    # Convert numeric columns
    numeric_cols = [c for c in df.columns if c.startswith("B")]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # --- Compute derived metrics ---
    # Median household income (direct)
    df["median_income"] = df["B19013_001E"]

    # Median home value (direct)
    df["median_home_value"] = df["B25077_001E"]

    # % with bachelor's degree or higher
    bachelors_plus = (
        df["B15003_022E"].fillna(0)
        + df["B15003_023E"].fillna(0)
        + df["B15003_024E"].fillna(0)
        + df["B15003_025E"].fillna(0)
    )
    pop25 = df["B15003_001E"]
    df["pct_bachelors"] = np.where(pop25 > 0, bachelors_plus / pop25 * 100, np.nan)

    # % cost-burdened renters (paying ≥30% of income on rent)
    cost_burdened = (
        df["B25070_007E"].fillna(0)
        + df["B25070_008E"].fillna(0)
        + df["B25070_009E"].fillna(0)
        + df["B25070_010E"].fillna(0)
    )
    renter_total = df["B25070_001E"]
    df["pct_cost_burdened"] = np.where(
        renter_total > 0, cost_burdened / renter_total * 100, np.nan
    )

    result = df[["geoid11", "median_income", "median_home_value",
                  "pct_bachelors", "pct_cost_burdened"]].copy()
    result = result.set_index("geoid11")

    log.info("  → ACS data ready for %d tracts.", len(result))
    log.info("    Median income:  mean=$%,.0f", result["median_income"].mean())
    log.info("    Home value:     mean=$%,.0f", result["median_home_value"].mean())
    log.info("    %% Bachelors:    mean=%.1f%%", result["pct_bachelors"].mean())
    log.info("    %% Cost burden:  mean=%.1f%%", result["pct_cost_burdened"].mean())

    return result


# ===================================================================
# 3  BUILD DATAFRAME  &  ENCODE
# ===================================================================

def _encode(series: pd.Series, mapping: dict, col_name: str) -> pd.Series:
    lower_map = {k.lower().strip(): v for k, v in mapping.items()}
    def lookup(val):
        s = str(val).strip() if val is not None else "N/A"
        if s in mapping:
            return mapping[s]
        sl = s.lower()
        if sl in lower_map:
            return lower_map[sl]
        log.warning("  Unknown value in '%s': %r → 0", col_name, val)
        return 0.0
    return series.apply(lookup)


def _clean_geoid(g) -> str:
    """Normalise GEOID to 11-char string (strip '.0' from float encoding)."""
    s = str(g)
    if s.endswith(".0"):
        s = s[:-2]
    return s.zfill(11)


def _clean(val):
    """Return None for NaN / None / empty."""
    if val is None:
        return None
    if isinstance(val, float) and np.isnan(val):
        return None
    s = str(val).strip()
    if s in ("", "nan", "None"):
        return None
    return val


def _safe(val, decimals=1):
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    if np.isnan(f):
        return None
    return round(f, decimals)


def build_dataframe(props: list[dict], acs_df: pd.DataFrame) -> pd.DataFrame:
    df = pd.DataFrame(props)

    # Clean GEOIDs
    df["geoid_clean"] = df["geoid22"].apply(_clean_geoid)

    # --- Region labels ---
    def _label(row):
        nbhd  = row.get("neighborho")
        name  = row.get("name22", "")
        geoid = row.get("geoid22", "")
        nbhd_valid = (
            nbhd is not None
            and not (isinstance(nbhd, float) and np.isnan(nbhd))
            and str(nbhd).strip() not in ("", "None", "nan")
        )
        if nbhd_valid:
            return f"{nbhd} (Tract {name})"
        elif name:
            return f"Census Tract {name}"
        else:
            return f"GEOID {geoid}"
    df["region_name"] = df.apply(_label, axis=1)

    # --- Join ACS Census data ---
    if not acs_df.empty:
        log.info("Joining ACS data to UDP tracts by GEOID …")
        df = df.merge(acs_df, left_on="geoid_clean", right_index=True, how="left")
        matched = df["median_income"].notna().sum()
        log.info("  → %d / %d tracts matched ACS data (%.0f%%)",
                 matched, len(df), matched / len(df) * 100)
    else:
        df["median_income"]      = np.nan
        df["median_home_value"]  = np.nan
        df["pct_bachelors"]      = np.nan
        df["pct_cost_burdened"]  = np.nan

    # --- Encode categorical pillars ---
    log.info("Encoding categorical fields …")
    df["s_displacement"]    = _encode(df["displaceme"], DISPLACEMENT_RISK_SCORES, "displaceme")
    df["s_vulnerability"]   = _encode(df["vulnerabil"], VULNERABILITY_SCORES, "vulnerabil")
    df["s_demographic"]     = _encode(df["demographi"], DEMOGRAPHIC_SCORES, "demographi")
    df["s_housing"]         = _encode(df["housing_ma"], HOUSING_MARKET_SCORES, "housing_ma")
    df["s_gentrification"]  = _encode(df["gentrifica"], GENTRIFICATION_SCORES, "gentrifica")

    for col in ["s_displacement", "s_vulnerability", "s_demographic",
                "s_housing", "s_gentrification"]:
        log.info("  %-22s  mean=%.3f  min=%.2f  max=%.2f",
                 col, df[col].mean(), df[col].min(), df[col].max())

    # --- Composite DVI ---
    weight_order = [
        ("s_displacement",   DVI_WEIGHTS["displacement_risk"]),
        ("s_vulnerability",  DVI_WEIGHTS["vulnerability"]),
        ("s_demographic",    DVI_WEIGHTS["demographic_change"]),
        ("s_housing",        DVI_WEIGHTS["housing_market"]),
        ("s_gentrification", DVI_WEIGHTS["gentrification"]),
    ]
    raw = np.zeros(len(df))
    for col, w in weight_order:
        raw += df[col].values * w

    dvi_min, dvi_max = raw.min(), raw.max()
    if dvi_max - dvi_min == 0:
        normed = np.full_like(raw, 50.0)
    else:
        normed = (raw - dvi_min) / (dvi_max - dvi_min) * 100.0

    df["dvi_raw"] = np.round(raw, 4)
    df["dvi"]     = np.round(normed, 1)

    log.info("DVI:  range %.1f–%.1f  mean=%.1f  median=%.1f",
             normed.min(), normed.max(), normed.mean(), np.median(normed))

    return df


# ===================================================================
# 4  EXPORT
# ===================================================================

def export_all(df: pd.DataFrame, features: list[dict]) -> None:
    log.info("Exporting …")

    # -- DVI_RAW --
    dvi_records = [
        {"region": r["region_name"], "period": DATA_PERIOD, "dvi": float(r["dvi"])}
        for _, r in df.iterrows()
    ]
    with open(OUT_DVI_RAW, "w") as f:
        json.dump(dvi_records, f, indent=2)
    log.info("  → %s  (%d records)", OUT_DVI_RAW, len(dvi_records))

    # -- SOCIOECONOMIC --
    socio_records = []
    for _, r in df.iterrows():
        socio_records.append({
            "region":               r["region_name"],
            "year":                 DATA_YEAR,
            "incomeAdj":            _safe(r.get("median_income"), 0),
            "homeValue":            _safe(r.get("median_home_value"), 0),
            "pctBachelors":         _safe(r.get("pct_bachelors"), 1),
            "pctCostBurdened":      _safe(r.get("pct_cost_burdened"), 1),
            "confidence":           1.0,
            "displacementRisk":     r.get("displaceme", "N/A"),
            "vulnerablePopulation": r.get("vulnerabil", "N/A"),
            "demographicChange":    r.get("demographi", "N/A"),
            "housingMarket":        r.get("housing_ma", "N/A"),
            "gentrificationStage":  r.get("gentrifica", "N/A"),
            "neighborhood":         _clean(r.get("neighborho")),
            "dvi":                  float(r["dvi"]),
        })
    with open(OUT_SOCIOECONOMIC, "w") as f:
        json.dump(socio_records, f, indent=2)
    log.info("  → %s  (%d records)", OUT_SOCIOECONOMIC, len(socio_records))

    # -- Enriched GeoJSON --
    enriched = []
    for i, feat in enumerate(features):
        nf = copy.deepcopy(feat)
        row = df.iloc[i]
        nf["properties"]["region_name"]       = row["region_name"]
        nf["properties"]["dvi"]               = float(row["dvi"])
        nf["properties"]["dvi_raw"]            = float(row["dvi_raw"])
        nf["properties"]["s_displacement"]     = float(row["s_displacement"])
        nf["properties"]["s_vulnerability"]    = float(row["s_vulnerability"])
        nf["properties"]["s_demographic"]      = float(row["s_demographic"])
        nf["properties"]["s_housing"]          = float(row["s_housing"])
        nf["properties"]["s_gentrification"]   = float(row["s_gentrification"])
        nf["properties"]["median_income"]      = _safe(row.get("median_income"), 0)
        nf["properties"]["median_home_value"]  = _safe(row.get("median_home_value"), 0)
        nf["properties"]["pct_bachelors"]      = _safe(row.get("pct_bachelors"), 1)
        nf["properties"]["pct_cost_burdened"]  = _safe(row.get("pct_cost_burdened"), 1)
        enriched.append(nf)
    out = {"type": "FeatureCollection", "features": enriched}
    with open(OUT_GEOJSON, "w") as f:
        json.dump(out, f)
    log.info("  → %s  (%d features)", OUT_GEOJSON, len(enriched))


# ===================================================================
# MAIN
# ===================================================================

def main() -> None:
    log.info("=" * 60)
    log.info("UDP Austin — DVI Pipeline  (with ACS Census enrichment)")
    log.info("=" * 60)

    # 1. Load UDP
    props, features = load_geojson(UDP_PATH)

    # 2. Determine which counties we need ACS data for
    county_fips = set()
    for p in props:
        g = _clean_geoid(p.get("geoid22", ""))
        if len(g) >= 5:
            county_fips.add(g[:5])  # first 5 chars = state(2) + county(3)
    log.info("Counties in dataset: %s", sorted(county_fips))

    # 3. Fetch ACS Census data
    acs_df = fetch_acs_for_counties(county_fips)

    # 4. Build DataFrame, encode, compute DVI
    df = build_dataframe(props, acs_df)

    # 5. Export
    export_all(df, features)

    # ---- Summaries ----
    print("\n" + "=" * 70)
    print("DVI DISTRIBUTION")
    print("=" * 70)
    bins = [0, 20, 40, 60, 80, 100.1]
    bin_labels = ["0–20 Low", "20–40", "40–60", "60–80", "80–100 High"]
    df["dvi_bin"] = pd.cut(df["dvi"], bins=bins, labels=bin_labels, right=False)
    print(df["dvi_bin"].value_counts().sort_index().to_string())

    print(f"\n{'='*70}")
    print("DVI BY DISPLACEMENT RISK CATEGORY")
    print("=" * 70)
    cat = (
        df.groupby("displaceme")["dvi"]
        .agg(["count", "mean", "min", "max"])
        .round(1)
        .sort_values("mean", ascending=False)
    )
    print(cat.to_string())

    print(f"\n{'='*70}")
    print("TOP 25 MOST VULNERABLE TRACTS")
    print("=" * 70)
    show_cols = ["region_name", "dvi", "displaceme"]
    if "median_income" in df.columns and df["median_income"].notna().any():
        show_cols += ["median_income", "pct_cost_burdened"]
    top = df[show_cols].sort_values("dvi", ascending=False).head(25)
    print(top.to_string(index=False))

    # Socioeconomic summary
    if df["median_income"].notna().any():
        print(f"\n{'='*70}")
        print("SOCIOECONOMIC SUMMARY (ACS data)")
        print("=" * 70)
        for col, label in [
            ("median_income",     "Median HH Income"),
            ("median_home_value", "Median Home Value"),
            ("pct_bachelors",     "% Bachelor's+"),
            ("pct_cost_burdened", "% Cost Burdened"),
        ]:
            s = df[col].dropna()
            if len(s):
                print(f"  {label:22s}  n={len(s):3d}  "
                      f"mean={s.mean():>10,.1f}  median={s.median():>10,.1f}  "
                      f"min={s.min():>10,.1f}  max={s.max():>10,.1f}")

        # Correlation between DVI and socioeconomic metrics
        print(f"\n  Correlation with DVI:")
        for col, label in [
            ("median_income",     "  Income"),
            ("median_home_value", "  Home Value"),
            ("pct_bachelors",     "  % Bachelor's+"),
            ("pct_cost_burdened", "  % Cost Burdened"),
        ]:
            valid = df[["dvi", col]].dropna()
            if len(valid) > 2:
                corr = valid["dvi"].corr(valid[col])
                print(f"    {label:22s}  r = {corr:+.3f}")

    print(f"\n{'='*70}")
    print(f"Total tracts:  {len(df)}")
    print(f"Mean DVI:      {df['dvi'].mean():.1f}")
    print(f"Median DVI:    {df['dvi'].median():.1f}")
    print(f"ACS matched:   {df['median_income'].notna().sum()} / {len(df)}")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
