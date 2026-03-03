#!/usr/bin/env python3
"""
UDP Austin — Displacement Vulnerability Index (DVI) Pipeline
=============================================================
Loads the City of Austin Displacement Risk Areas GeoJSON (census-tract
level data from the Urban Displacement Project) and computes a composite
Displacement Vulnerability Index (DVI) for each tract, normalised to
0–100.  No external regions file is needed — the UDP GeoJSON *is* the
sole data source.

Requirements:
    pip install geopandas pandas numpy

Usage:
    python udp_austin_dvi_pipeline.py

Input:
    • udp_austin.geojson  – City of Austin Displacement Risk Areas
      Download via the Socrata API:
        https://data.austintexas.gov/api/geospatial/t8nv-zcp9
            ?method=export&type=GeoJSON
      Or run download_udp_austin.py first.

Output:
    • dvi_raw.json         – [{ region, period, dvi }, …]
    • socioeconomic.json   – [{ region, year, incomeAdj, homeValue,
                                pctBachelors, pctCostBurdened, confidence }, …]
    • udp_austin_dvi.geojson – enriched GeoJSON with DVI score per tract
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UDP_PATH = Path("udp_austin.geojson")

# Year / period labels stamped onto the output records
DATA_YEAR   = 2022
DATA_PERIOD = "2018-2022"

# Weights for the composite DVI (must sum to 1.0).
# Adjust to change the relative importance of each pillar.
DVI_WEIGHTS = {
    "vulnerability": 0.40,   # presence of vulnerable populations
    "demographic":   0.30,   # demographic change
    "housing":       0.30,   # housing-market appreciation
}

# Output paths
OUT_DVI_RAW       = Path("dvi_raw.json")
OUT_SOCIOECONOMIC = Path("socioeconomic.json")
OUT_GEOJSON       = Path("udp_austin_dvi.geojson")

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


# ===================================================================
# 1  DATA LOADING  &  COLUMN AUTO-DISCOVERY
# ===================================================================

# We don't know the exact column names in advance because the City of
# Austin / UDP schema can change between releases.  The mappings below
# list *candidate* column names for each concept — the loader picks the
# first match it finds.

COLUMN_CANDIDATES = {
    # --- Identifiers ---
    "tract_id": [
        "geoid", "geoid10", "geoid20", "tractce", "tractce20",
        "tract", "fips", "census_tract", "geo_id",
    ],
    "tract_name": [
        "namelsad", "namelsad20", "name", "tract_name", "label",
    ],
    "typology": [
        "typology", "typ_label", "type", "displ_type", "displacement",
        "risk_category", "risk_level", "displacement_risk",
        "displaceme", "gentrification",
    ],

    # --- Z-score pillars (vulnerability / demographic / housing) ---
    "vulnerability": [
        "z_vul", "vulnerability", "vuln_index", "vuln_score",
        "vul_score", "vulnerable", "z_vulnerability",
    ],
    "demographic": [
        "z_dem", "demographic", "demo_change", "dem_score",
        "z_demographic", "demographic_change",
    ],
    "housing": [
        "z_hous", "housing", "housing_change", "hous_score",
        "z_housing", "market_change", "housing_market",
    ],

    # --- Raw socioeconomic metrics ---
    "income": [
        "medhhinc", "med_hh_inc", "median_household_income",
        "median_income", "hh_income", "income", "medincome",
    ],
    "home_value": [
        "medhomeval", "med_home_val", "median_home_value",
        "home_value", "medval", "median_value", "homevalue",
    ],
    "pct_bachelors": [
        "pctbach", "pct_bach", "pct_bachelors", "bachelors",
        "pct_ba", "bach_pct", "pct_college",
    ],
    "pct_cost_burdened": [
        "pctcostburd", "pct_cost_burd", "pct_cost_burdened",
        "cost_burdened", "costburden", "pct_burdened",
    ],
}


def _find_column(columns: list[str], candidates: list[str]) -> str | None:
    """Case-insensitive search for the first matching column name."""
    lower_map = {c.lower(): c for c in columns}
    for candidate in candidates:
        if candidate.lower() in lower_map:
            return lower_map[candidate.lower()]
    return None


def load_udp(path: Path) -> tuple[gpd.GeoDataFrame, dict[str, str]]:
    """
    Load the UDP Austin GeoJSON and auto-discover column mappings.

    Returns:
        gdf      – the GeoDataFrame
        col_map  – dict mapping concept names → actual column names found
    """
    if not path.exists():
        log.error("UDP file not found: %s", path)
        log.error("Run download_udp_austin.py first, or download manually from:")
        log.error("  https://data.austintexas.gov/api/geospatial/t8nv-zcp9"
                  "?method=export&type=GeoJSON")
        sys.exit(1)

    log.info("Loading UDP data from %s", path)
    gdf = gpd.read_file(path)

    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=4326)
    gdf = gdf.to_crs(epsg=4326)

    log.info("  → %d census tracts loaded.", len(gdf))
    log.info("  → Columns: %s", list(gdf.columns))

    # Auto-discover columns
    col_map: dict[str, str] = {}
    for concept, candidates in COLUMN_CANDIDATES.items():
        found = _find_column(list(gdf.columns), candidates)
        if found:
            col_map[concept] = found
            log.info("    %-20s → %s", concept, found)
        else:
            log.warning("    %-20s → NOT FOUND (tried: %s)",
                        concept, candidates[:4])

    return gdf, col_map


# ===================================================================
# 2  BUILD TRACT-LEVEL LABEL  (region name for each tract)
# ===================================================================

def build_tract_labels(gdf: gpd.GeoDataFrame, col_map: dict) -> pd.Series:
    """
    Create a human-readable label for each tract to use as the "region"
    field in the JSON output.

    Priority:
      1. tract_name  (e.g. "Census Tract 18.32")
      2. typology + tract_id  (e.g. "At Risk – 48453001832")
      3. tract_id alone
      4. Row index fallback
    """
    n = len(gdf)

    if "tract_name" in col_map:
        labels = gdf[col_map["tract_name"]].astype(str)
    elif "tract_id" in col_map:
        if "typology" in col_map:
            prefix_series = gdf[col_map["typology"]].fillna("Unknown").astype(str)
            labels = prefix_series + " — Tract " + gdf[col_map["tract_id"]].astype(str)
        else:
            labels = "Tract " + gdf[col_map["tract_id"]].astype(str)
    else:
        labels = pd.Series([f"Tract_{i}" for i in range(n)], index=gdf.index)

    return labels


# ===================================================================
# 3  COMPUTE PILLAR SCORES  (normalise raw metrics if Z-scores missing)
# ===================================================================

def ensure_pillar_scores(
    gdf: gpd.GeoDataFrame,
    col_map: dict,
) -> gpd.GeoDataFrame:
    """
    Ensure we have numeric pillar columns ['vulnerability', 'demographic',
    'housing'] in the GeoDataFrame.

    If the UDP file already contains Z-score columns we use them directly.
    If not, we synthesise them from the raw socioeconomic metrics by
    computing Z-scores ourselves:
        vulnerability  ← zscore(pct_cost_burdened)
        demographic    ← zscore(pct_bachelors) + zscore(income)  (averaged)
        housing        ← zscore(home_value)
    """
    gdf = gdf.copy()

    def _zscore(series: pd.Series) -> pd.Series:
        """Standard Z-score: (x - mean) / std."""
        s = pd.to_numeric(series, errors="coerce")
        mu, sigma = s.mean(), s.std()
        if sigma == 0 or np.isnan(sigma):
            return pd.Series(0.0, index=s.index)
        return (s - mu) / sigma

    # --- Vulnerability ---
    if "vulnerability" in col_map:
        gdf["vulnerability"] = pd.to_numeric(
            gdf[col_map["vulnerability"]], errors="coerce"
        )
        log.info("  Pillar 'vulnerability' ← column '%s' (direct Z-score)",
                 col_map["vulnerability"])
    elif "pct_cost_burdened" in col_map:
        log.info("  Pillar 'vulnerability' ← zscore(%s)",
                 col_map["pct_cost_burdened"])
        gdf["vulnerability"] = _zscore(gdf[col_map["pct_cost_burdened"]])
    else:
        log.warning("  Pillar 'vulnerability' — no data; defaulting to 0")
        gdf["vulnerability"] = 0.0

    # --- Demographic change ---
    if "demographic" in col_map:
        gdf["demographic"] = pd.to_numeric(
            gdf[col_map["demographic"]], errors="coerce"
        )
        log.info("  Pillar 'demographic' ← column '%s' (direct Z-score)",
                 col_map["demographic"])
    else:
        parts = []
        if "pct_bachelors" in col_map:
            log.info("  Pillar 'demographic' component ← zscore(%s)",
                     col_map["pct_bachelors"])
            parts.append(_zscore(gdf[col_map["pct_bachelors"]]))
        if "income" in col_map:
            log.info("  Pillar 'demographic' component ← zscore(%s)",
                     col_map["income"])
            parts.append(_zscore(gdf[col_map["income"]]))
        if parts:
            gdf["demographic"] = sum(parts) / len(parts)
        else:
            log.warning("  Pillar 'demographic' — no data; defaulting to 0")
            gdf["demographic"] = 0.0

    # --- Housing market change ---
    if "housing" in col_map:
        gdf["housing"] = pd.to_numeric(
            gdf[col_map["housing"]], errors="coerce"
        )
        log.info("  Pillar 'housing' ← column '%s' (direct Z-score)",
                 col_map["housing"])
    elif "home_value" in col_map:
        log.info("  Pillar 'housing' ← zscore(%s)", col_map["home_value"])
        gdf["housing"] = _zscore(gdf[col_map["home_value"]])
    else:
        log.warning("  Pillar 'housing' — no data; defaulting to 0")
        gdf["housing"] = 0.0

    return gdf


# ===================================================================
# 4  DVI CALCULATION  &  NORMALISATION  (0–100)
# ===================================================================

def compute_dvi(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Weighted sum of the three pillar Z-scores, then min-max normalised
    to a 0–100 scale.  Higher DVI = higher displacement vulnerability.
    """
    log.info("Computing composite DVI …")
    gdf = gdf.copy()

    pillars = ["vulnerability", "demographic", "housing"]
    weights = np.array([DVI_WEIGHTS[p] for p in pillars])

    z_matrix = gdf[pillars].values.astype(float)

    # Impute NaN with column median so missing data doesn't zero-out a tract
    for j in range(z_matrix.shape[1]):
        col = z_matrix[:, j]
        median = np.nanmedian(col)
        col[np.isnan(col)] = median if not np.isnan(median) else 0.0

    raw_dvi = z_matrix @ weights

    # Min-max normalisation → 0–100
    dvi_min, dvi_max = raw_dvi.min(), raw_dvi.max()
    if dvi_max - dvi_min == 0:
        normalised = np.full_like(raw_dvi, 50.0)
    else:
        normalised = (raw_dvi - dvi_min) / (dvi_max - dvi_min) * 100.0

    gdf["dvi_raw"] = raw_dvi
    gdf["dvi"]     = np.round(normalised, 1)

    log.info("  → DVI range: %.1f – %.1f (n=%d tracts)", normalised.min(),
             normalised.max(), len(gdf))
    return gdf


# ===================================================================
# 5  EXPORT — JSON structures + enriched GeoJSON
# ===================================================================

def _safe_round(val, decimals: int = 2):
    """Round a value, returning None for NaN / None."""
    if val is None:
        return None
    try:
        fval = float(val)
    except (TypeError, ValueError):
        return None
    if np.isnan(fval):
        return None
    return round(fval, decimals)


def _safe_get(row, col_map: dict, concept: str):
    """Safely pull a value from a row using the column map."""
    col = col_map.get(concept)
    if col is None:
        return None
    return row.get(col)


def export_json(gdf: gpd.GeoDataFrame, col_map: dict) -> None:
    """
    Write two JSON files matching the JS front-end schema, plus an
    enriched GeoJSON with the DVI score baked into each tract feature.
    """
    log.info("Exporting JSON …")

    # -- DVI_RAW --
    dvi_records = []
    for _, row in gdf.iterrows():
        dvi_records.append({
            "region":  row["region_name"],
            "period":  DATA_PERIOD,
            "dvi":     float(row["dvi"]),
        })

    with open(OUT_DVI_RAW, "w") as f:
        json.dump(dvi_records, f, indent=2)
    log.info("  → %s written (%d records).", OUT_DVI_RAW, len(dvi_records))

    # -- SOCIOECONOMIC --
    socio_records = []
    for _, row in gdf.iterrows():
        socio_records.append({
            "region":          row["region_name"],
            "year":            DATA_YEAR,
            "incomeAdj":       _safe_round(_safe_get(row, col_map, "income"), 0),
            "homeValue":       _safe_round(_safe_get(row, col_map, "home_value"), 0),
            "pctBachelors":    _safe_round(_safe_get(row, col_map, "pct_bachelors"), 1),
            "pctCostBurdened": _safe_round(_safe_get(row, col_map, "pct_cost_burdened"), 1),
            "confidence":      1.0,  # tract-level data = full confidence
        })

    with open(OUT_SOCIOECONOMIC, "w") as f:
        json.dump(socio_records, f, indent=2)
    log.info("  → %s written (%d records).", OUT_SOCIOECONOMIC, len(socio_records))

    # -- Enriched GeoJSON (for mapping / visualization) --
    out_gdf = gdf.copy()
    keep_cols = ["region_name", "dvi", "dvi_raw",
                 "vulnerability", "demographic", "housing", "geometry"]
    # Also carry forward any raw metrics that exist
    for concept in ("tract_id", "typology", "income", "home_value",
                    "pct_bachelors", "pct_cost_burdened"):
        col = col_map.get(concept)
        if col and col in out_gdf.columns and col not in keep_cols:
            keep_cols.append(col)

    available = [c for c in keep_cols if c in out_gdf.columns]
    out_gdf = out_gdf[available]
    out_gdf.to_file(OUT_GEOJSON, driver="GeoJSON")
    log.info("  → %s written (%d features).", OUT_GEOJSON, len(out_gdf))


# ===================================================================
# MAIN
# ===================================================================

def main() -> None:
    log.info("=" * 60)
    log.info("UDP Austin — DVI Pipeline  (tract-level, no regions file)")
    log.info("=" * 60)

    # 1. Load & auto-discover columns
    gdf, col_map = load_udp(UDP_PATH)

    # 2. Build human-readable tract labels
    gdf["region_name"] = build_tract_labels(gdf, col_map)

    # 3. Ensure we have the three pillar scores
    gdf = ensure_pillar_scores(gdf, col_map)

    # 4. Compute DVI (0–100)
    gdf = compute_dvi(gdf)

    # 5. Export
    export_json(gdf, col_map)

    # Quick summary to stdout
    print("\n" + "=" * 60)
    print("DVI Summary — Top 20 Most Vulnerable Tracts")
    print("=" * 60)
    summary = (
        gdf[["region_name", "dvi", "vulnerability", "demographic", "housing"]]
        .sort_values("dvi", ascending=False)
        .head(20)
    )
    print(summary.to_string(index=False))

    print(f"\n{'='*60}")
    print(f"Total tracts: {len(gdf)}")
    print(f"Mean DVI:     {gdf['dvi'].mean():.1f}")
    print(f"Median DVI:   {gdf['dvi'].median():.1f}")
    print(f"Std DVI:      {gdf['dvi'].std():.1f}")
    print(f"{'='*60}\n")

    log.info("Done.  Output files:")
    log.info("  %s", OUT_DVI_RAW)
    log.info("  %s", OUT_SOCIOECONOMIC)
    log.info("  %s", OUT_GEOJSON)


if __name__ == "__main__":
    main()
