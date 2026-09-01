#!/usr/bin/env python3
"""
resolve_tract_names.py
──────────────────────
Resolves neighborhood names for tracts OUTSIDE City of Austin NPA coverage
(and NPA-ambiguous tracts) using two independent sources:

  1. OSM Nominatim reverse geocoding at the tract centroid
     (neighbourhood/suburb level — similar to Google Maps zoom labels)
  2. Gemini (gemini-2.5-flash) asked for the Google-Maps-style area name

Decision rule per tract:
  - If Gemini agrees with OSM (normalized) → confident
  - If Gemini agrees with the NPA plurality or current name → confident
  - Otherwise → flagged for manual review (all candidates listed)

Input:  data/audit_output/tract_npa_overlap.json  (from assign_names_by_area.cjs)
Output: data/audit_output/tract_name_resolution.json

Requires: GEMINI_API_KEY env var, google-genai, requests (or urllib fallback).
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERLAP_PATH = os.path.join(BASE, "data", "audit_output", "tract_npa_overlap.json")
OUT_PATH = os.path.join(BASE, "data", "audit_output", "tract_name_resolution.json")

USER_AGENT = "austin-cultural-map/1.0 (neighborhood naming audit)"


def normalize(name):
    if not name:
        return ""
    n = name.strip().lower()
    n = re.sub(r"^the\s+", "", n)
    n = re.sub(r"\s*\(.*\)$", "", n)
    n = re.sub(r"\s*\[\d+\]$", "", n)
    n = re.sub(r"[^a-z0-9]+", " ", n).strip()
    return n


def osm_reverse(lat, lng):
    """Nominatim reverse geocode at neighborhood zoom. Returns dict of candidates."""
    url = (
        "https://nominatim.openstreetmap.org/reverse?"
        + urllib.parse.urlencode({
            "lat": f"{lat:.6f}", "lon": f"{lng:.6f}",
            "format": "jsonv2", "zoom": 14, "addressdetails": 1,
        })
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    addr = data.get("address", {})
    return {
        "neighbourhood": addr.get("neighbourhood"),
        "suburb": addr.get("suburb"),
        "hamlet": addr.get("hamlet"),
        "town": addr.get("town"),
        "city": addr.get("city"),
        "residential": addr.get("residential"),
    }


def osm_best(osm):
    """Pick the most specific OSM name."""
    for key in ("neighbourhood", "residential", "suburb", "hamlet", "town"):
        if osm.get(key):
            return osm[key]
    # City only useful if it's a suburb city (not Austin itself)
    if osm.get("city") and osm["city"].lower() != "austin":
        return osm["city"]
    return None


def gemini_batch(client, model, tracts):
    """Ask Gemini for Google-Maps-style area names for a batch of tracts."""
    lines = []
    for t in tracts:
        cands = [c for c in [t.get("osm_name"), t.get("npa_plurality"), t["current_name"]] if c]
        lines.append(
            f"- key {t['region_id']}: centroid ({t['lat']:.5f}, {t['lng']:.5f}), "
            f"census {t['tract_label']}, candidate names: {', '.join(sorted(set(cands))) or 'none'}"
        )
    prompt = (
        "You are naming Austin, TX metro area census tracts after the neighborhood/"
        "community that covers the MAJORITY of each tract's area — the name Google Maps "
        "shows when zoomed to neighborhood level at the given centroid (e.g. 'Steiner Ranch', "
        "'Avery Ranch', 'Circle C Ranch', 'Wells Branch', or a suburb city like 'Cedar Park', "
        "'Pflugerville'). Prefer widely recognized names over subdivision micro-names.\n\n"
        "For each tract below, reply with the best area name. If one of the listed candidate "
        "names is correct, reuse it verbatim. Respond ONLY with a JSON array of objects: "
        '[{"key": <region_id>, "name": "<area name>", "confidence": "high|medium|low"}]\n\n'
        + "\n".join(lines)
    )
    resp = client.models.generate_content(
        model=model,
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return {int(o["key"]): o for o in json.loads(resp.text)}


def main():
    with open(OVERLAP_PATH, encoding="utf-8") as f:
        overlap = json.load(f)

    targets = [r for r in overlap if r.get("verdict") in ("outside-npa", "ambiguous")]
    print(f"Tracts to resolve: {len(targets)} "
          f"({sum(1 for t in targets if t['verdict']=='outside-npa')} outside-NPA, "
          f"{sum(1 for t in targets if t['verdict']=='ambiguous')} ambiguous)")

    # ── Pass 1: OSM Nominatim (1 req/sec) ──
    print("\nOSM Nominatim reverse geocoding...")
    for i, t in enumerate(targets):
        try:
            osm = osm_reverse(t["lat"], t["lng"])
            t["osm"] = osm
            t["osm_name"] = osm_best(osm)
        except Exception as e:
            t["osm"] = {"error": str(e)}
            t["osm_name"] = None
        t["npa_plurality"] = t["npa_overlaps"][0]["npa"] if t.get("npa_overlaps") else None
        if (i + 1) % 20 == 0:
            print(f"  ...{i + 1}/{len(targets)}")
        time.sleep(1.1)  # Nominatim usage policy

    # ── Pass 2: Gemini cross-check ──
    print("\nGemini cross-check (gemini-2.5-flash)...")
    try:
        from google import genai
        client = genai.Client()  # uses GEMINI_API_KEY env var
    except Exception as e:
        print(f"ERROR: could not init Gemini client: {e}")
        print("Set GEMINI_API_KEY and install google-genai. Writing OSM-only results.")
        client = None

    gemini_results = {}
    if client:
        BATCH = 25
        for i in range(0, len(targets), BATCH):
            batch = targets[i:i + BATCH]
            try:
                gemini_results.update(gemini_batch(client, "gemini-2.5-flash", batch))
            except Exception as e:
                print(f"  Batch {i // BATCH + 1} failed: {e}")
            print(f"  ...batch {i // BATCH + 1}/{(len(targets) + BATCH - 1) // BATCH}")
            time.sleep(1)

    # ── Decide ──
    results = []
    counts = {"confident": 0, "review": 0}
    for t in targets:
        g = gemini_results.get(t["region_id"], {})
        gem_name = g.get("name")
        gem_conf = g.get("confidence", "low")

        cand = {
            "osm": t.get("osm_name"),
            "gemini": gem_name,
            "npa_plurality": t.get("npa_plurality"),
            "current": t["current_name"],
        }
        ng = normalize(gem_name)
        resolved, basis = None, None
        if ng:
            if ng == normalize(cand["osm"]):
                resolved, basis = gem_name, "gemini+osm"
            elif ng == normalize(cand["npa_plurality"]):
                resolved, basis = gem_name, "gemini+npa"
            elif ng == normalize(cand["current"]):
                resolved, basis = gem_name, "gemini+current"
            elif gem_conf == "high" and cand["osm"] is None:
                resolved, basis = gem_name, "gemini-high-solo"
        if resolved:
            counts["confident"] += 1
        else:
            counts["review"] += 1

        results.append({
            "region_id": t["region_id"],
            "tract_label": t["tract_label"],
            "verdict_npa": t["verdict"],
            "current_name": t["current_name"],
            "candidates": cand,
            "gemini_confidence": gem_conf,
            "resolved_name": resolved,
            "basis": basis,
            "status": "confident" if resolved else "needs-review",
        })

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n=== Results ===")
    print(f"  Confident: {counts['confident']}")
    print(f"  Needs review: {counts['review']}")
    print(f"  Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
