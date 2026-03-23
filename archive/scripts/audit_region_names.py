"""
Audit region names against the City of Austin Open Data Portal
official neighborhood boundaries.

Downloads the official GeoJSON, parses regionIndex.js, performs
point-in-polygon tests, and outputs a JSON report.

Dependencies: requests (+ Python standard library)
"""

import json
import os
import re
import sys
import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GEOJSON_URL = (
    "https://data.austintexas.gov/resource/inrm-c3ee.geojson"
    "?$limit=9999"
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
REGION_INDEX_PATH = os.path.join(REPO_ROOT, "data", "regionIndex.js")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "gemini_output")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "neighborhood_audit.json")

# ---------------------------------------------------------------------------
# Ray-casting point-in-polygon
# ---------------------------------------------------------------------------

def point_in_polygon(px, py, polygon):
    """
    Ray-casting algorithm. *polygon* is a list of [lng, lat] coordinate pairs
    forming a closed ring (GeoJSON winding order: first == last).
    px = longitude, py = latitude.
    Returns True if the point is inside the polygon.
    """
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        # Check if a horizontal ray from (px, py) going rightward
        # crosses the edge (xi,yi)-(xj,yj)
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_multipolygon(lng, lat, geometry):
    """
    Test whether (lng, lat) falls inside a GeoJSON Polygon or MultiPolygon
    geometry.  For Polygons the first ring is the exterior; subsequent rings
    are holes.  For MultiPolygons each element is a Polygon.
    """
    geom_type = geometry["type"]
    coords = geometry["coordinates"]

    if geom_type == "Polygon":
        # coords is [ exterior_ring, *hole_rings ]
        if not point_in_polygon(lng, lat, coords[0]):
            return False
        # Subtract holes
        for hole in coords[1:]:
            if point_in_polygon(lng, lat, hole):
                return False
        return True

    elif geom_type == "MultiPolygon":
        for poly_coords in coords:
            if not point_in_polygon(lng, lat, poly_coords[0]):
                continue
            in_hole = False
            for hole in poly_coords[1:]:
                if point_in_polygon(lng, lat, hole):
                    in_hole = True
                    break
            if not in_hole:
                return True
        return False

    return False

# ---------------------------------------------------------------------------
# Parse regionIndex.js
# ---------------------------------------------------------------------------

def parse_region_index(path):
    """
    Read the JS file, extract the JSON array between the first '[' and its
    matching ']', and return the parsed list.
    """
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    # Find the start of the array
    start = text.index("[")
    # Walk forward to find the matching ']'
    depth = 0
    end = None
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end is None:
        raise ValueError("Could not find matching ']' in regionIndex.js")

    array_text = text[start : end + 1]

    # The JS file uses standard JSON inside the array, so json.loads works
    # directly (keys are quoted, values are JSON-compatible).
    return json.loads(array_text)

# ---------------------------------------------------------------------------
# Name comparison helpers
# ---------------------------------------------------------------------------

def normalize(name):
    """Lowercase, strip whitespace, collapse multiple spaces."""
    return re.sub(r"\s+", " ", name.strip().lower())


def base_display_name(display_name):
    """
    Return the part of the display_name before any em-dash suffix.
    E.g. 'Cherrywood -- Inner South' -> 'Cherrywood'
    The separator is U+2014 (em dash).
    """
    parts = display_name.split("\u2014")
    return parts[0].strip()


def classify_match(display_name, official_name):
    """
    Compare the base portion of display_name against the official
    neighborhood name.  Returns 'exact', 'partial', or 'mismatch'.
    """
    base = normalize(base_display_name(display_name))
    official = normalize(official_name)

    if base == official:
        return "exact"

    # Partial: one is a substring of the other, or they share a long common
    # prefix, or Levenshtein-style similarity is high.
    if base in official or official in base:
        return "partial"

    # Check token overlap (at least half the tokens match)
    base_tokens = set(base.split())
    official_tokens = set(official.split())
    if base_tokens and official_tokens:
        overlap = base_tokens & official_tokens
        min_len = min(len(base_tokens), len(official_tokens))
        if len(overlap) >= max(1, min_len * 0.5):
            return "partial"

    return "mismatch"

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # 1. Download official neighborhood GeoJSON
    print("Downloading official Austin neighborhood boundaries...")
    resp = requests.get(GEOJSON_URL, timeout=60)
    resp.raise_for_status()
    neighborhoods_geojson = resp.json()
    features = neighborhoods_geojson.get("features", [])
    print(f"  Downloaded {len(features)} neighborhood polygons.")

    # Build a list of (name, geometry) tuples
    neighborhoods = []
    for feat in features:
        props = feat.get("properties", {})
        # The name field varies; try common keys
        name = (
            props.get("planning_area_name")
            or props.get("neighname")
            or props.get("NEIGHNAME")
            or props.get("name")
            or props.get("NAME")
            or props.get("Neighborhood")
            or props.get("neighborhood")
            or ""
        )
        geom = feat.get("geometry")
        if geom and name:
            neighborhoods.append((name, geom))
    print(f"  Parsed {len(neighborhoods)} named neighborhoods.")

    # 2. Load region data
    print("Parsing regionIndex.js...")
    regions = parse_region_index(REGION_INDEX_PATH)
    print(f"  Found {len(regions)} regions.")

    # 3. Point-in-polygon tests
    print("Running point-in-polygon tests...")
    matches = []
    summary = {"total": len(regions), "exact_matches": 0, "partial_matches": 0,
               "mismatches": 0, "no_coverage": 0}

    for region in regions:
        rid = region["region_id"]
        display = region.get("display_name", region.get("region_name", ""))
        lat = region["lat"]
        lng = region["lng"]

        # Find all official neighborhoods containing this centroid
        containing = []
        for nname, geom in neighborhoods:
            if point_in_multipolygon(lng, lat, geom):
                containing.append(nname)

        if not containing:
            match_type = "no_coverage"
            official = None
        else:
            # If multiple matches, pick the best classification
            best_type = "mismatch"
            best_name = containing[0]
            for nname in containing:
                mt = classify_match(display, nname)
                if mt == "exact":
                    best_type = "exact"
                    best_name = nname
                    break
                elif mt == "partial" and best_type != "exact":
                    best_type = "partial"
                    best_name = nname
            match_type = best_type
            official = best_name

        summary[{
            "exact": "exact_matches",
            "partial": "partial_matches",
            "mismatch": "mismatches",
            "no_coverage": "no_coverage",
        }[match_type]] += 1

        entry = {
            "region_id": rid,
            "current_display_name": display,
            "centroid": [round(lat, 6), round(lng, 6)],
            "official_neighborhood": official,
            "match_type": match_type,
        }
        if containing and len(containing) > 1:
            entry["all_official_matches"] = containing
        matches.append(entry)

    # 4. Write JSON report
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    report = {"matches": matches, "summary": summary}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nReport written to: {OUTPUT_PATH}")

    # 5. Print summary to stdout
    print("\n=== AUDIT SUMMARY ===")
    print(f"  Total regions:    {summary['total']}")
    print(f"  Exact matches:    {summary['exact_matches']}")
    print(f"  Partial matches:  {summary['partial_matches']}")
    print(f"  Mismatches:       {summary['mismatches']}")
    print(f"  No coverage:      {summary['no_coverage']}")

    # Print mismatches sorted by region_id
    mismatches = [m for m in matches if m["match_type"] == "mismatch"]
    mismatches.sort(key=lambda m: m["region_id"])
    if mismatches:
        print(f"\n=== MISMATCHES ({len(mismatches)}) ===")
        print(f"{'ID':>4}  {'Current Name':<40}  {'Official Neighborhood':<40}")
        print(f"{'--':>4}  {'----------':<40}  {'----------------------':<40}")
        for m in mismatches:
            rid = m["region_id"]
            cur = m["current_display_name"][:40]
            off = (m["official_neighborhood"] or "")[:40]
            print(f"{rid:>4}  {cur:<40}  {off:<40}")
    else:
        print("\nNo mismatches found.")

    # Also print no_coverage entries
    no_cov = [m for m in matches if m["match_type"] == "no_coverage"]
    no_cov.sort(key=lambda m: m["region_id"])
    if no_cov:
        print(f"\n=== NO COVERAGE ({len(no_cov)}) ===")
        for m in no_cov:
            print(f"  ID {m['region_id']:>4}: {m['current_display_name']}")


if __name__ == "__main__":
    main()
