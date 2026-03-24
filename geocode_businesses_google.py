#!/usr/bin/env python3
"""
geocode_businesses_google.py
════════════════════════════
Re-geocodes businesses using Google Maps Geocoding API for rooftop-level
precision (~1m). Reads the already-geocoded businesses.js and upgrades
coordinates from Census/Nominatim street-centerline to Google rooftop.

USAGE:
  python geocode_businesses_google.py --input data/businesses.js
"""

import re
import sys
import time
import csv
import argparse
from pathlib import Path
from math import radians, cos, sqrt

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library required. Run: pip install requests")
    sys.exit(1)

GOOGLE_API_KEY = "AIzaSyA_4xEW0iaGYHLZwWFBqc8zU54QeSX2FCc"


def geocode_google(address, city="Austin", state="TX"):
    """
    Geocode via Google Maps Geocoding API.
    Returns (lat, lng, location_type) or (None, None, None).
    location_type: ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
    """
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": f"{address}, {city}, {state}",
        "key": GOOGLE_API_KEY,
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data["status"] == "OK" and data["results"]:
            result = data["results"][0]
            loc = result["geometry"]["location"]
            loc_type = result["geometry"].get("location_type", "UNKNOWN")
            formatted = result.get("formatted_address", "")
            return (
                round(loc["lat"], 6),
                round(loc["lng"], 6),
                loc_type,
                formatted,
            )
    except Exception as e:
        print(f"    ERROR: {e}")
    return None, None, None, None


def dist_meters(lat1, lng1, lat2, lng2):
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1) * cos(radians(lat1))
    return sqrt(dlat ** 2 + dlng ** 2) * 6371000


def parse_businesses_js(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    businesses = []
    pattern = r'\{[^{}]*?id\s*:\s*"([^"]+)"[^{}]*?\}'

    for m in re.finditer(pattern, content):
        obj_text = m.group(0)
        obj_id = m.group(1)

        name_m = re.search(r'name\s*:\s*"([^"]*)"', obj_text)
        addr_m = re.search(r'address\s*:\s*"([^"]*)"', obj_text)
        lat_m = re.search(r'lat\s*:\s*([-\d.]+)', obj_text)
        lng_m = re.search(r'lng\s*:\s*([-\d.]+)', obj_text)

        if name_m:
            businesses.append({
                "id": obj_id,
                "name": name_m.group(1),
                "address": addr_m.group(1) if addr_m else "",
                "old_lat": float(lat_m.group(1)) if lat_m else None,
                "old_lng": float(lng_m.group(1)) if lng_m else None,
                "start": m.start(),
                "end": m.end(),
                "text": obj_text,
            })

    return businesses, content


def run(args):
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path.with_name("businesses.google.js")
    audit_path = output_path.with_suffix(".audit.csv")

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print()

    businesses, original_content = parse_businesses_js(str(input_path))
    print(f"Found {len(businesses)} businesses\n")

    results = []
    updated = 0
    skipped = 0
    failed = 0

    for i, biz in enumerate(businesses):
        name = biz["name"]
        address = biz["address"]

        # Skip vague addresses
        if not address or "area" in address.lower() or address.lower() in ("east austin", "various locations"):
            print(f"  [{i+1}] {name} — SKIPPED (vague address: '{address}')")
            skipped += 1
            results.append({**biz, "new_lat": None, "new_lng": None,
                          "loc_type": "skipped", "google_addr": "", "distance_m": None})
            continue

        # Clean address
        clean = re.sub(r'\s*\(.*?\)\s*', ' ', address).strip()

        lat, lng, loc_type, google_addr = geocode_google(clean)

        if lat is None:
            print(f"  [{i+1}] {name} — FAILED")
            failed += 1
            results.append({**biz, "new_lat": None, "new_lng": None,
                          "loc_type": "failed", "google_addr": "", "distance_m": None})
            continue

        # Distance from current position
        if biz["old_lat"] and biz["old_lng"]:
            d = dist_meters(biz["old_lat"], biz["old_lng"], lat, lng)
        else:
            d = float("inf")

        # Sanity: reject if >30km from Austin
        d_austin = dist_meters(lat, lng, 30.2672, -97.7431)
        if d_austin > 30000:
            print(f"  [{i+1}] {name} — REJECTED (too far: {d_austin:.0f}m from Austin)")
            failed += 1
            results.append({**biz, "new_lat": lat, "new_lng": lng,
                          "loc_type": "rejected", "google_addr": google_addr, "distance_m": d})
            continue

        biz["new_lat"] = lat
        biz["new_lng"] = lng
        updated += 1

        flag = f"  Δ{d:.0f}m" if d < 10000 else ""
        print(f"  [{i+1}] {name} — {loc_type} ({lat}, {lng}){flag}")
        print(f"         Google: {google_addr}")

        results.append({**biz, "loc_type": loc_type, "google_addr": google_addr, "distance_m": d})

        time.sleep(0.05)  # Light rate limiting

    print(f"\n{'='*60}")
    print(f"  Updated:  {updated}")
    print(f"  Skipped:  {skipped}")
    print(f"  Failed:   {failed}")
    print(f"{'='*60}")

    # Patch JS file (reverse order so positions don't shift)
    patched = original_content
    updates = [(r, r["new_lat"], r["new_lng"]) for r in results if r["new_lat"] is not None]
    updates.sort(key=lambda x: x[0]["start"], reverse=True)

    for biz, new_lat, new_lng in updates:
        old_text = biz["text"]
        new_text = re.sub(r'(lat\s*:\s*)[-\d.]+', f'\\g<1>{new_lat}', old_text)
        new_text = re.sub(r'(lng\s*:\s*)[-\d.]+', f'\\g<1>{new_lng}', new_text)
        patched = patched[:biz["start"]] + new_text + patched[biz["end"]:]

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(patched)

    # Audit CSV
    with open(audit_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "name", "address", "old_lat", "old_lng",
            "new_lat", "new_lng", "distance_m", "loc_type", "google_addr"
        ])
        writer.writeheader()
        for r in results:
            writer.writerow({
                "id": r["id"], "name": r["name"], "address": r["address"],
                "old_lat": r["old_lat"], "old_lng": r["old_lng"],
                "new_lat": r.get("new_lat", ""), "new_lng": r.get("new_lng", ""),
                "distance_m": f"{r['distance_m']:.1f}" if r.get("distance_m") is not None else "",
                "loc_type": r.get("loc_type", ""),
                "google_addr": r.get("google_addr", ""),
            })

    print(f"\nPatched: {output_path}")
    print(f"Audit:   {audit_path}")
    print(f"\nReview the audit CSV, then:")
    print(f"  copy {output_path} data\\businesses.js")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Geocode businesses via Google Maps API")
    parser.add_argument("--input", default="./data/businesses.js")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    run(args)
