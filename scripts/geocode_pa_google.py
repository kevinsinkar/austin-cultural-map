#!/usr/bin/env python3
"""
geocode_pa_google.py
════════════════════
Geocodes Preservation Austin data to rooftop precision, respecting privacy:
  - Public buildings, businesses, churches, parks → geocode to building level
  - Designated landmarks (even if residential) → geocode to building level
  - Private residences (non-landmark) → SKIP, keep neighborhood centroid
  - Vague/citywide addresses → SKIP

USAGE:
  python geocode_pa_google.py --input data/preservationAustin.js
"""

import os
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

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

# ─── Privacy Classification ─────────────────────────────────────────────

# Addresses that indicate private residences (keep at centroid)
PRIVATE_PATTERNS = [
    "private residence",
    "private, neighborhood",
    "neighborhood-level",
    "(private)",
]

# Addresses too vague to geocode meaningfully
VAGUE_PATTERNS = [
    "citywide", "n/a", "east austin", "district 8", "i-35 corridor",
    "multiple", "various", "east austin / chinatown",
]

# Categories/descriptions that indicate landmarks (geocode even if residential)
LANDMARK_INDICATORS = [
    "landmark", "historic designation", "city landmark", "national register",
    "lhd", "nr hd", "historic district",
]

# Public/institutional types that should always be geocoded
PUBLIC_TYPES = [
    "theatre", "theater", "church", "museum", "university", "school",
    "park", "cemetery", "library", "restaurant", "bar", "cafe", "grill",
    "pub", "club", "hotel", "grocery", "market", "shop", "store",
    "records", "toys", "cabaret", "follies", "nightclub", "saloon",
    "skate", "golf", "boat rental", "farm", "chapel", "auditorium",
    "opera house", "hall", "building", "clinic", "conservancy",
]


def should_geocode(entry):
    """
    Determine if this PA entry should be geocoded or kept at centroid.
    Returns (should_geocode: bool, reason: str)
    """
    address = (entry.get("address", "") or "").lower().strip()
    name = (entry.get("name", "") or "").lower()
    desc = (entry.get("description", "") or "").lower()
    category = (entry.get("category", "") or "").lower()

    # Skip vague addresses
    for pattern in VAGUE_PATTERNS:
        if address == pattern or address.startswith(pattern):
            return False, "vague_address"

    # Skip if address explicitly says private/neighborhood-level
    for pattern in PRIVATE_PATTERNS:
        if pattern in address:
            # BUT check if it's a landmark — landmarks get geocoded regardless
            combined = f"{name} {desc} {category}"
            if any(ind in combined for ind in LANDMARK_INDICATORS):
                return True, "landmark_override"
            return False, "private_residence"

    # Skip neighborhood-only addresses (no street number)
    if re.match(r'^[a-z\s]+ neighborhood$', address):
        return False, "neighborhood_only"
    if re.match(r'^[a-z\s]+ area$', address):
        return False, "area_only"

    # Check if it has a street number — strong signal it's geocodable
    has_street_number = bool(re.search(r'\d+\s+\w', address))

    # Check if it's a known public/institutional type
    combined = f"{name} {desc}"
    is_public = any(t in combined for t in PUBLIC_TYPES)

    if has_street_number:
        return True, "has_street_address"
    elif is_public:
        return True, "public_institution"
    else:
        return False, "no_street_address"


def geocode_google(address, city="Austin", state="TX"):
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
            return round(loc["lat"], 6), round(loc["lng"], 6), loc_type, formatted
    except Exception as e:
        print(f"    ERROR: {e}")
    return None, None, None, None


def dist_meters(lat1, lng1, lat2, lng2):
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1) * cos(radians(lat1))
    return sqrt(dlat ** 2 + dlng ** 2) * 6371000


def parse_pa_js(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    entries = []
    pattern = r'\{[^{}]*?id\s*:\s*"([^"]+)"[^{}]*?\}'

    for m in re.finditer(pattern, content):
        obj_text = m.group(0)
        obj_id = m.group(1)

        def extract(field):
            match = re.search(rf'{field}\s*:\s*"([^"]*)"', obj_text)
            return match.group(1) if match else ""

        def extract_num(field):
            match = re.search(rf'{field}\s*:\s*([-\d.]+)', obj_text)
            return float(match.group(1)) if match else None

        entries.append({
            "id": obj_id,
            "name": extract("name"),
            "address": extract("address"),
            "type": extract("type"),
            "category": extract("category"),
            "description": extract("description"),
            "recipient": extract("recipient"),
            "old_lat": extract_num("lat"),
            "old_lng": extract_num("lng"),
            "start": m.start(),
            "end": m.end(),
            "text": obj_text,
        })

    return entries, content


def run(args):
    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path.with_name("preservationAustin.google.js")
    audit_path = output_path.with_suffix(".audit.csv")

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print()

    entries, original_content = parse_pa_js(str(input_path))
    print(f"Found {len(entries)} PA entries\n")

    results = []
    updated = 0
    skipped_private = 0
    skipped_vague = 0
    failed = 0

    for i, entry in enumerate(entries):
        name = entry["name"]
        address = entry["address"]

        should, reason = should_geocode(entry)

        if not should:
            label = "PRIVATE" if "private" in reason else "SKIPPED"
            print(f"  [{i+1}/{len(entries)}] {name} — {label} ({reason}: '{address}')")
            if "private" in reason:
                skipped_private += 1
            else:
                skipped_vague += 1
            results.append({**entry, "new_lat": None, "new_lng": None,
                          "loc_type": reason, "google_addr": "", "action": "kept_centroid"})
            continue

        # Clean address
        clean = re.sub(r'\s*\(.*?\)\s*', ' ', address).strip()
        # Remove trailing neighborhood hints
        clean = re.sub(r',?\s*(East Austin|downtown|Clarksville|North Campus)$', '', clean, flags=re.IGNORECASE).strip()

        lat, lng, loc_type, google_addr = geocode_google(clean)

        if lat is None:
            print(f"  [{i+1}/{len(entries)}] {name} — FAILED ('{clean}')")
            failed += 1
            results.append({**entry, "new_lat": None, "new_lng": None,
                          "loc_type": "failed", "google_addr": "", "action": "kept_original"})
            continue

        # Sanity check
        d_austin = dist_meters(lat, lng, 30.2672, -97.7431)
        if d_austin > 40000:
            print(f"  [{i+1}/{len(entries)}] {name} — REJECTED (too far)")
            failed += 1
            results.append({**entry, "new_lat": lat, "new_lng": lng,
                          "loc_type": "rejected", "google_addr": google_addr, "action": "kept_original"})
            continue

        d_from_old = 0
        if entry["old_lat"] and entry["old_lng"]:
            d_from_old = dist_meters(entry["old_lat"], entry["old_lng"], lat, lng)

        entry["new_lat"] = lat
        entry["new_lng"] = lng
        updated += 1

        print(f"  [{i+1}/{len(entries)}] {name} — {loc_type} ({lat}, {lng})  Δ{d_from_old:.0f}m")

        results.append({**entry, "loc_type": loc_type, "google_addr": google_addr,
                       "distance_m": d_from_old, "action": "updated"})

        time.sleep(0.05)

    print(f"\n{'='*60}")
    print(f"  Updated (public/landmark): {updated}")
    print(f"  Skipped (private home):    {skipped_private}")
    print(f"  Skipped (vague/citywide):  {skipped_vague}")
    print(f"  Failed:                    {failed}")
    print(f"{'='*60}")

    # Patch JS
    patched = original_content
    updates = [(r, r["new_lat"], r["new_lng"]) for r in results if r.get("action") == "updated" and r["new_lat"] is not None]
    updates.sort(key=lambda x: x[0]["start"], reverse=True)

    for entry, new_lat, new_lng in updates:
        old_text = entry["text"]
        new_text = re.sub(r'(lat\s*:\s*)[-\d.]+', f'\\g<1>{new_lat}', old_text)
        new_text = re.sub(r'(lng\s*:\s*)[-\d.]+', f'\\g<1>{new_lng}', new_text)
        patched = patched[:entry["start"]] + new_text + patched[entry["end"]:]

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(patched)

    # Audit CSV
    with open(audit_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "name", "type", "address", "old_lat", "old_lng",
            "new_lat", "new_lng", "distance_m", "loc_type", "action", "google_addr"
        ])
        writer.writeheader()
        for r in results:
            writer.writerow({
                "id": r["id"], "name": r["name"], "type": r.get("type", ""),
                "address": r["address"],
                "old_lat": r["old_lat"], "old_lng": r["old_lng"],
                "new_lat": r.get("new_lat", ""), "new_lng": r.get("new_lng", ""),
                "distance_m": f"{r.get('distance_m', 0):.1f}" if r.get("distance_m") else "",
                "loc_type": r.get("loc_type", ""),
                "action": r.get("action", ""),
                "google_addr": r.get("google_addr", ""),
            })

    print(f"\nPatched: {output_path}")
    print(f"Audit:   {audit_path}")
    print(f"\nReview audit CSV, then:")
    print(f"  copy {output_path} data\\preservationAustin.js")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Geocode PA data via Google Maps (privacy-aware)")
    parser.add_argument("--input", default="./data/preservationAustin.js")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    run(args)
