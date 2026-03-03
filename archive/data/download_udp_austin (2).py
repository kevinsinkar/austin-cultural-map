#!/usr/bin/env python3
"""
download_udp_austin.py
======================
Downloads the Urban Displacement Project census-tract data for Austin, TX
from the City of Austin Open Data Portal.  This is the sole data source
for the DVI pipeline — no separate regions file is needed.

Two sources are attempted (the first that succeeds is used):

  1. City of Austin Displacement Risk Areas 2022  (GeoJSON)
     Source: https://data.austintexas.gov/Locations-and-Maps/
             City-of-Austin-Displacement-Risk-Areas-2022/t8nv-zcp9

  2. UDP Displacement Typologies CSV from GitHub
     Source: https://github.com/urban-displacement/displacement-typologies

Usage:
    pip install requests
    python download_udp_austin.py

Output (saved to ./data/):
    • udp_austin.geojson                – Displacement Risk Areas 2022
    • udp_austin.geojson.columns.txt    – Column inventory for quick reference
"""

from __future__ import annotations

import json
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OUTPUT_DIR = Path("data")

# ---- Source 1: City of Austin Open Data Portal (Socrata) ----
COA_GEOJSON_URL = (
    "https://data.austintexas.gov/api/geospatial/t8nv-zcp9"
    "?method=export&type=GeoJSON"
)

# ---- Source 1b: 2020 version (fallback) ----
COA_2020_URL = (
    "https://data.austintexas.gov/api/geospatial/g9wh-kemg"
    "?method=export&type=GeoJSON"
)

# ---- Source 2: UDP GitHub — displacement-typologies data ----
UDP_GITHUB_RAW_BASE = (
    "https://raw.githubusercontent.com/urban-displacement/"
    "displacement-typologies/main/data"
)
UDP_GITHUB_CANDIDATES = [
    "outputs/typologies/Austin_typology_output.csv",
    "outputs/typologies/austin_typology_output.csv",
    "outputs/Austin_typology_output.csv",
    "outputs/downloads/typology_output.csv",
]

# Primary output — the pipeline script expects this filename
OUTPUT_GEOJSON = OUTPUT_DIR / "udp_austin.geojson"
OUTPUT_CSV     = OUTPUT_DIR / "udp_typologies_austin.csv"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def download(url: str, dest: Path, description: str) -> bool:
    """Download a URL to a local file.  Returns True on success."""
    print(f"\n{'='*60}")
    print(f"Downloading: {description}")
    print(f"  URL:  {url}")
    print(f"  Dest: {dest}")
    print("=" * 60)

    try:
        resp = requests.get(url, timeout=120, stream=True)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"  ✗ FAILED: {exc}")
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1 << 16):
            f.write(chunk)

    size_kb = dest.stat().st_size / 1024
    print(f"  ✓ Saved ({size_kb:,.0f} KB)")
    return True


def inspect_geojson(path: Path) -> None:
    """Print a summary of a GeoJSON file's properties (column names)."""
    print(f"\nInspecting {path.name} …")
    with open(path) as f:
        gj = json.load(f)

    features = gj.get("features", [])
    print(f"  Features: {len(features)}")

    if features:
        props = features[0].get("properties", {})
        print(f"  Properties ({len(props)} columns):")
        for key, val in props.items():
            print(f"    • {key:30s}  (example: {repr(val)[:60]})")

        # Write column inventory to text file for reference
        cols_file = path.parent / (path.stem + ".columns.txt")
        with open(cols_file, "w") as f:
            f.write(f"Column inventory for {path.name}\n")
            f.write(f"{'='*60}\n")
            f.write(f"Total features: {len(features)}\n\n")
            for key, val in props.items():
                f.write(f"{key:30s}  example: {repr(val)}\n")
        print(f"  Column inventory written to {cols_file}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("UDP Austin Data Downloader")
    print("=" * 60)
    print("Only the UDP GeoJSON is needed — no separate regions file.\n")

    # --- Attempt 1: City of Austin 2022 Displacement Risk Areas ---
    ok = download(
        COA_GEOJSON_URL,
        OUTPUT_GEOJSON,
        "City of Austin — Displacement Risk Areas 2022 (GeoJSON)",
    )

    # --- Attempt 1b: fallback to 2020 version ---
    if not ok:
        print("\n2022 dataset unavailable — trying 2020 version …")
        ok = download(
            COA_2020_URL,
            OUTPUT_GEOJSON,
            "City of Austin — Displacement Risk Areas 2020 (GeoJSON)",
        )

    if ok:
        inspect_geojson(OUTPUT_GEOJSON)

    # --- Attempt 2: UDP GitHub CSV (supplementary) ---
    ok_csv = False
    for candidate in UDP_GITHUB_CANDIDATES:
        url = f"{UDP_GITHUB_RAW_BASE}/{candidate}"
        ok_csv = download(
            url,
            OUTPUT_CSV,
            f"UDP GitHub — {candidate}",
        )
        if ok_csv:
            break

    if not ok_csv:
        print("\n⚠  Could not find Austin typology CSV on GitHub.")
        print("   (This is optional — the GeoJSON is the primary source.)")
        print("   Browse manually: https://github.com/urban-displacement/"
              "displacement-typologies/tree/main/data")

    # --- Summary ---
    print(f"\n{'='*60}")
    print("SUMMARY")
    print("=" * 60)
    print(f"  UDP GeoJSON (primary):   {'✓' if ok else '✗'}  → {OUTPUT_GEOJSON}")
    print(f"  UDP CSV (supplementary): {'✓' if ok_csv else '✗'}  → {OUTPUT_CSV}")
    print()

    if ok:
        print("Next step — run the DVI pipeline:")
        print(f"  cp {OUTPUT_GEOJSON} udp_austin.geojson")
        print("  python udp_austin_dvi_pipeline.py")
    else:
        print("If the Socrata API is down, download manually:")
        print("  1. Go to https://data.austintexas.gov/Locations-and-Maps/"
              "City-of-Austin-Displacement-Risk-Areas-2022/t8nv-zcp9")
        print("  2. Click Export → GeoJSON")
        print("  3. Save as udp_austin.geojson")

    print()


if __name__ == "__main__":
    main()
