"""
Build a master remap table from three sources:
  1. City of Austin official neighborhood audit (highest priority for urban core)
  2. User manual corrections (overrides everything)
  3. Gemini Google Maps suggestions (fills gaps outside official coverage)

Outputs: scripts/gemini_output/master_remap.json
  - A single authoritative rename list ready for apply_google_maps_names.py

Usage:
    python scripts/build_master_remap.py
"""

import json
from pathlib import Path
from collections import defaultdict

REPO = Path(__file__).resolve().parent.parent
AUDIT_PATH = REPO / "scripts" / "gemini_output" / "neighborhood_audit.json"
GEMINI_PATH = REPO / "scripts" / "gemini_output" / "google_maps_names.json"
OUTPUT_PATH = REPO / "scripts" / "gemini_output" / "master_remap.json"

# ---------------------------------------------------------------------------
# User manual corrections (highest priority)
# Format: region_id -> corrected display_name
# Add entries here as the user identifies misnamed regions.
# ---------------------------------------------------------------------------
USER_OVERRIDES = {
    # Add manual corrections here after reviewing the master remap output.
    # Format: region_id: "Corrected Display Name"
    # Example:
    #   176: "The Domain",            # "The Arboretum - East" is actually The Domain
    #   167: "Cherry Creek - East",   # "Shady Hollow - North" is actually Cherry Creek - East
    #   156: "Cherry Creek - West",   # "Circle C Ranch - Southwest" is actually Cherry Creek - West
}


def title_case_official(name):
    """Convert UPPER CASE official names to Title Case, handling special cases."""
    # Common abbreviations/special cases
    special = {
        "UT": "UT",
        "MLK": "MLK",
        "MLK-183": "MLK-183",
        "RMMA": "RMMA",
        "DAWSON": "Dawson",
        "ST.": "St.",
        "ST. JOHN": "St. John",
        "ST. EDWARDS": "St. Edward's",
    }
    if name in special:
        return special[name]

    words = name.split()
    result = []
    for w in words:
        if w in special:
            result.append(special[w])
        elif len(w) <= 2 and w.isalpha():
            result.append(w.upper())  # Keep short abbreviations uppercase
        else:
            result.append(w.capitalize())
    return " ".join(result)


def main():
    # Load audit data
    if not AUDIT_PATH.exists():
        print(f"ERROR: {AUDIT_PATH} not found. Run audit_region_names.py first.")
        return
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    audit_matches = {m["region_id"]: m for m in audit["matches"]}
    print(f"Loaded audit: {len(audit_matches)} regions")

    # Load Gemini suggestions
    gemini_renames = {}
    if GEMINI_PATH.exists():
        gemini_data = json.loads(GEMINI_PATH.read_text(encoding="utf-8"))
        gemini_renames = {r["region_id"]: r for r in gemini_data.get("renames", [])}
        print(f"Loaded Gemini: {len(gemini_renames)} suggestions")
    else:
        print("No Gemini suggestions found, skipping.")

    # Load current region index for reference
    src = (REPO / "data" / "regionIndex.js").read_text(encoding="utf-8")
    start = src.index("[")
    depth = 0
    for i, ch in enumerate(src[start:], start):
        if ch == "[": depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    regions = json.loads(src[start:end+1])
    region_map = {r["region_id"]: r for r in regions}

    # Build master remap
    renames = []
    sources = defaultdict(int)

    for rid, region in region_map.items():
        current = region.get("display_name", region["region_name"])

        # Priority 1: User override
        if rid in USER_OVERRIDES:
            new_name = USER_OVERRIDES[rid]
            renames.append({
                "region_id": rid,
                "current_name": current,
                "google_maps_name": new_name,
                "confidence": "high",
                "source": "user_override",
                "reasoning": "Manual correction by project maintainer",
            })
            sources["user_override"] += 1
            continue

        # Priority 2: Official City of Austin mismatch
        audit_entry = audit_matches.get(rid)
        if audit_entry and audit_entry["match_type"] == "mismatch":
            official = audit_entry.get("official_neighborhood", "")
            if official:
                nice_name = title_case_official(official)
                # Preserve directional suffix from current name if any
                import re
                suffix_match = re.search(r"\s*\u2014\s*.+$", current)
                suffix = suffix_match.group(0) if suffix_match else ""
                new_name = nice_name + suffix

                renames.append({
                    "region_id": rid,
                    "current_name": current,
                    "google_maps_name": new_name,
                    "confidence": "high",
                    "source": "city_of_austin_official",
                    "reasoning": f"Centroid falls within official '{official}' planning area",
                    "official_name_raw": official,
                })
                sources["city_of_austin_official"] += 1
                continue

        # Priority 3: Gemini suggestion (for no_coverage or partial match areas)
        if rid in gemini_renames:
            g = gemini_renames[rid]
            renames.append({
                "region_id": rid,
                "current_name": current,
                "google_maps_name": g["google_maps_name"],
                "confidence": g.get("confidence", "medium"),
                "source": "gemini_google_maps",
                "reasoning": g.get("reasoning", ""),
            })
            sources["gemini_google_maps"] += 1

    # Save
    output = {
        "metadata": {
            "total_renames": len(renames),
            "sources": dict(sources),
            "priority_order": [
                "1. user_override (manual corrections)",
                "2. city_of_austin_official (centroid in official planning area)",
                "3. gemini_google_maps (AI suggestion for areas outside coverage)",
            ],
        },
        "renames": renames,
    }
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"Master remap: {len(renames)} total renames")
    for source, count in sorted(sources.items()):
        print(f"  {source}: {count}")
    print(f"Saved to: {OUTPUT_PATH.relative_to(REPO)}")
    print(f"{'='*60}")

    # Print all renames by source
    for source_name in ["user_override", "city_of_austin_official", "gemini_google_maps"]:
        subset = [r for r in renames if r["source"] == source_name]
        if not subset:
            continue
        print(f"\n--- {source_name} ({len(subset)}) ---")
        for r in sorted(subset, key=lambda x: x["region_id"]):
            print(f"  id={r['region_id']:>3}: \"{r['current_name']}\"")
            print(f"         -> \"{r['google_maps_name']}\"")


if __name__ == "__main__":
    main()
