#!/usr/bin/env python3
"""
geocode_businesses.py
═════════════════════
Geocodes all businesses in businesses.js from their address fields
using the Census Bureau geocoder (free, no API key needed) with
Google Maps fallback via the Nominatim/OpenStreetMap API.

Outputs a patched businesses.js with corrected lat/lng at 5 decimal
places (~1m precision), plus an audit CSV showing what changed.

USAGE:
  python geocode_businesses.py --input data/businesses.js

  Or with a specific output path:
  python geocode_businesses.py --input data/businesses.js --output data/businesses_geocoded.js
"""

import re
import sys
import time
import json
import csv
import argparse
from pathlib import Path
from math import radians, cos, sqrt

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library required. Run: pip install requests")
    sys.exit(1)

# ─── Geocoding APIs ─────────────────────────────────────────────────────

def geocode_census(address, city="Austin", state="TX"):
    """
    Geocode via Census Bureau geocoder (free, no key needed).
    Returns (lat, lng) or (None, None).
    """
    url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    params = {
        "address": f"{address}, {city}, {state}",
        "benchmark": "Public_AR_Current",
        "format": "json",
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        matches = data.get("result", {}).get("addressMatches", [])
        if matches:
            coords = matches[0]["coordinates"]
            return round(coords["y"], 5), round(coords["x"], 5)
    except Exception:
        pass
    return None, None


def geocode_nominatim(address, city="Austin", state="TX"):
    """
    Geocode via OpenStreetMap Nominatim (free, rate-limited to 1/sec).
    Returns (lat, lng) or (None, None).
    """
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": f"{address}, {city}, {state}",
        "format": "json",
        "limit": 1,
        "countrycodes": "us",
    }
    headers = {"User-Agent": "AustinCulturalMap/1.0 (preservation research)"}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        results = resp.json()
        if results:
            return round(float(results[0]["lat"]), 5), round(float(results[0]["lon"]), 5)
    except Exception:
        pass
    return None, None


def geocode_address(address, city="Austin", state="TX"):
    """Try Census geocoder first, then Nominatim as fallback."""
    # Skip vague addresses
    if not address or "area" in address.lower() or address.lower() in ("east austin", "various locations"):
        return None, None, "skipped_vague"

    # Clean up address for geocoding
    clean = address.strip()
    # Remove parenthetical notes like "(relocated)" or "(campus area)"
    clean = re.sub(r'\s*\(.*?\)\s*', ' ', clean).strip()
    # Remove leading "Various locations" type entries
    if clean.lower() in ("various", "various locations", "east austin", "south austin"):
        return None, None, "skipped_vague"

    # Try Census Bureau first
    lat, lng = geocode_census(clean, city, state)
    if lat is not None:
        return lat, lng, "census"

    # Fallback to Nominatim
    time.sleep(1.1)  # Nominatim requires 1 request/sec
    lat, lng = geocode_nominatim(clean, city, state)
    if lat is not None:
        return lat, lng, "nominatim"

    return None, None, "failed"


# ─── JS File Parsing ────────────────────────────────────────────────────

def parse_businesses_js(filepath):
    """
    Parse businesses.js to extract business objects.
    Returns list of dicts with original line numbers for patching.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    businesses = []

    # Match each { ... } object in LEGACY_OPERATING and LEGACY_CLOSED
    # Capture the full object text and its position
    pattern = r'\{[^{}]*?id\s*:\s*"([^"]+)"[^{}]*?\}'

    for m in re.finditer(pattern, content):
        obj_text = m.group(0)
        obj_id = m.group(1)
        start = m.start()
        end = m.end()

        # Extract fields we need
        name_m = re.search(r'name\s*:\s*"([^"]*)"', obj_text)
        addr_m = re.search(r'address\s*:\s*"([^"]*)"', obj_text)
        lat_m = re.search(r'lat\s*:\s*([-\d.]+)', obj_text)
        lng_m = re.search(r'lng\s*:\s*([-\d.]+)', obj_text)

        if name_m:
            biz = {
                "id": obj_id,
                "name": name_m.group(1),
                "address": addr_m.group(1) if addr_m else "",
                "old_lat": float(lat_m.group(1)) if lat_m else None,
                "old_lng": float(lng_m.group(1)) if lng_m else None,
                "start": start,
                "end": end,
                "text": obj_text,
            }
            businesses.append(biz)

    return businesses, content


def dist_meters(lat1, lng1, lat2, lng2):
    """Approximate distance in meters between two lat/lng points."""
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1) * cos(radians(lat1))
    return sqrt(dlat ** 2 + dlng ** 2) * 6371000


# ─── Main ────────────────────────────────────────────────────────────────

def run(args):
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path.with_suffix(".geocoded.js")
    audit_path = output_path.with_suffix(".audit.csv")

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Audit:  {audit_path}")
    print()

    # Parse businesses
    businesses, original_content = parse_businesses_js(str(input_path))
    print(f"Found {len(businesses)} businesses")
    print()

    # Geocode each business
    results = []
    updated_count = 0
    failed_count = 0
    skipped_count = 0
    unchanged_count = 0

    for i, biz in enumerate(businesses):
        name = biz["name"]
        address = biz["address"]

        print(f"  [{i+1}/{len(businesses)}] {name}")
        print(f"    Address: {address}")

        lat, lng, source = geocode_address(address)

        if source == "skipped_vague":
            print(f"    SKIPPED: vague address")
            skipped_count += 1
            results.append({**biz, "new_lat": None, "new_lng": None,
                          "source": "skipped", "distance_m": None, "action": "kept_original"})
            continue

        if lat is None:
            print(f"    FAILED: could not geocode")
            failed_count += 1
            results.append({**biz, "new_lat": None, "new_lng": None,
                          "source": "failed", "distance_m": None, "action": "kept_original"})
            continue

        # Compare with original
        if biz["old_lat"] is not None and biz["old_lng"] is not None:
            d = dist_meters(biz["old_lat"], biz["old_lng"], lat, lng)
        else:
            d = float("inf")

        # Sanity check: if geocoded location is >10km from Austin center, skip
        d_from_austin = dist_meters(lat, lng, 30.2672, -97.7431)
        if d_from_austin > 50000:  # 50km
            print(f"    REJECTED: geocoded to ({lat}, {lng}) — too far from Austin")
            failed_count += 1
            results.append({**biz, "new_lat": lat, "new_lng": lng,
                          "source": source, "distance_m": d, "action": "rejected_too_far"})
            continue

        action = "updated" if d > 50 else "kept_original"  # Only update if >50m off

        if action == "updated":
            print(f"    UPDATED: ({biz['old_lat']}, {biz['old_lng']}) → ({lat}, {lng})  [{source}]  Δ{d:.0f}m")
            updated_count += 1
            biz["new_lat"] = lat
            biz["new_lng"] = lng
        else:
            print(f"    OK: within {d:.0f}m — keeping original  [{source}]")
            unchanged_count += 1
            biz["new_lat"] = None
            biz["new_lng"] = None

        results.append({**biz, "source": source, "distance_m": d, "action": action})

        # Rate limiting
        time.sleep(0.3)

    print()
    print(f"{'='*60}")
    print(f"RESULTS:")
    print(f"  Updated:   {updated_count}")
    print(f"  Unchanged: {unchanged_count}")
    print(f"  Skipped:   {skipped_count}")
    print(f"  Failed:    {failed_count}")
    print(f"{'='*60}")

    # ── Patch the JS file ────────────────────────────────────────────
    patched = original_content

    # Process replacements in reverse order (so positions don't shift)
    updates = [(r, r["new_lat"], r["new_lng"]) for r in results
               if r["action"] == "updated" and r["new_lat"] is not None]

    # Sort by start position descending
    updates.sort(key=lambda x: x[0]["start"], reverse=True)

    for biz, new_lat, new_lng in updates:
        old_text = biz["text"]

        # Replace lat value
        new_text = re.sub(
            r'(lat\s*:\s*)[-\d.]+',
            f'\\g<1>{new_lat}',
            old_text
        )
        # Replace lng value
        new_text = re.sub(
            r'(lng\s*:\s*)[-\d.]+',
            f'\\g<1>{new_lng}',
            new_text
        )

        patched = patched[:biz["start"]] + new_text + patched[biz["end"]:]

    # Write patched JS
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(patched)

    print(f"\nPatched JS written to: {output_path}")

    # ── Write audit CSV ──────────────────────────────────────────────
    with open(audit_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "name", "address", "old_lat", "old_lng",
            "new_lat", "new_lng", "distance_m", "source", "action"
        ])
        writer.writeheader()
        for r in results:
            writer.writerow({
                "id": r["id"],
                "name": r["name"],
                "address": r["address"],
                "old_lat": r["old_lat"],
                "old_lng": r["old_lng"],
                "new_lat": r.get("new_lat"),
                "new_lng": r.get("new_lng"),
                "distance_m": f"{r['distance_m']:.0f}" if r.get("distance_m") is not None else "",
                "source": r.get("source", ""),
                "action": r.get("action", ""),
            })

    print(f"Audit CSV written to: {audit_path}")
    print(f"\nReview the audit CSV, then copy the geocoded file:")
    print(f"  copy {output_path} {input_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Geocode businesses from addresses")
    parser.add_argument("--input", default="./data/businesses.js",
                        help="Path to businesses.js")
    parser.add_argument("--output", default=None,
                        help="Output path (default: businesses.geocoded.js)")
    args = parser.parse_args()
    run(args)
