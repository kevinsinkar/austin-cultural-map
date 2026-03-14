"""
Apply Google Maps Name Overrides to regionIndex.js

Reads the Gemini-generated renames from:
  scripts/gemini_output/google_maps_names.json

Patches data/regionIndex.js by:
  1. Adding a "google_maps_name" field to each renamed region
  2. Updating "display_name" to use the Google Maps name (preserving
     any directional suffix like " — East")
  3. Updating "short_name" to a truncated version of the new name
  4. Propagating the rename to merged secondary entries
  5. Re-disambiguating any collisions created by the renames

The original region_name is always preserved as-is for data integrity.

Usage:
    python scripts/apply_google_maps_names.py [--dry-run] [--min-confidence medium]

Flags:
    --dry-run           Print changes without writing to disk
    --min-confidence    Only apply renames at or above this confidence level
                        (high, medium, low). Default: medium
"""

import sys
import json
import re
import math
import argparse
from pathlib import Path
from collections import defaultdict

REPO = Path(__file__).resolve().parent.parent
REGION_INDEX_PATH = REPO / "data" / "regionIndex.js"
RENAMES_PATH = REPO / "scripts" / "gemini_output" / "master_remap.json"

CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}

# Em-dash used as separator between base name and directional suffix
EM = "\u2014"
SUFFIX_RE = re.compile(r"\s*\u2014\s*.+$")

DIRECTIONS_8 = ["East", "Northeast", "North", "Northwest",
                "West", "Southwest", "South", "Southeast"]


def load_region_index_raw():
    """Load regionIndex.js and return (preamble, regions_list, postamble)."""
    text = REGION_INDEX_PATH.read_text(encoding="utf-8")
    start = text.index("[")
    depth = 0
    end = start
    for i, ch in enumerate(text[start:], start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    preamble = text[:start]
    json_str = text[start : end + 1]
    postamble = text[end + 1 :]
    regions = json.loads(json_str)
    return preamble, regions, postamble


def get_cardinal(dlat, dlng):
    """Return 8-point cardinal direction from centroid offset."""
    angle = math.atan2(dlat, dlng) * 180 / math.pi
    idx = round(((angle + 360) % 360) / 45) % 8
    return DIRECTIONS_8[idx]


def truncate_short_name(name, max_len=15):
    """Create a short_name from a display name."""
    base = SUFFIX_RE.split(name)[0].strip()
    if len(base) <= max_len:
        return base
    abbrevs = [
        ("North ", "N "), ("South ", "S "), ("East ", "E "), ("West ", "W "),
        ("Northwest ", "NW "), ("Northeast ", "NE "),
        ("Southwest ", "SW "), ("Southeast ", "SE "),
        ("Saint ", "St. "), ("Mount ", "Mt. "),
    ]
    short = base
    for long, abbr in abbrevs:
        short = short.replace(long, abbr)
    if len(short) <= max_len:
        return short
    return base[:max_len]


def disambiguate_collisions(regions):
    """
    Find display_name collisions among visible (non-merged) regions
    and add cardinal-direction suffixes to resolve them.
    """
    visible = [r for r in regions if not r.get("merge_into")]

    # Group by display_name
    groups = defaultdict(list)
    for r in visible:
        groups[r["display_name"]].append(r)

    collisions = {k: v for k, v in groups.items() if len(v) > 1}
    if not collisions:
        return 0

    fixes = 0
    for name, dupes in collisions.items():
        # Extract base name (strip any existing suffix)
        base_match = SUFFIX_RE.search(name)
        base_name = name[:base_match.start()] if base_match else name

        # Compute group centroid
        mean_lat = sum(r["lat"] for r in dupes) / len(dupes)
        mean_lng = sum(r["lng"] for r in dupes) / len(dupes)

        # Assign cardinal directions
        assignments = []
        for r in dupes:
            dlat = r["lat"] - mean_lat
            dlng = r["lng"] - mean_lng
            direction = get_cardinal(dlat, dlng)
            assignments.append((r, direction, dlat, dlng))

        # Check for direction collisions within this group
        dir_groups = defaultdict(list)
        for item in assignments:
            dir_groups[item[1]].append(item)

        for direction, colliders in dir_groups.items():
            if len(colliders) <= 1:
                continue
            # Resolve with DVI tier or Inner/Outer
            dvis_differ = len(set(c[0]["dvi_score"] for c in colliders)) > 1
            if dvis_differ:
                for r, _, _, _ in colliders:
                    dvi = r["dvi_score"]
                    if dvi >= 60:
                        tier = "High Risk"
                    elif dvi >= 30:
                        tier = "Moderate"
                    else:
                        tier = "Low Risk"
                    for i, (ar, ad, adlat, adlng) in enumerate(assignments):
                        if ar["region_id"] == r["region_id"]:
                            assignments[i] = (ar, f"{direction} ({tier})", adlat, adlng)
            elif len(colliders) == 2:
                d0 = math.sqrt(colliders[0][2]**2 + colliders[0][3]**2)
                d1 = math.sqrt(colliders[1][2]**2 + colliders[1][3]**2)
                labels = ("Inner", "Outer") if d0 < d1 else ("Outer", "Inner")
                for j, (r, _, dl, dn) in enumerate(colliders):
                    for i, (ar, ad, adlat, adlng) in enumerate(assignments):
                        if ar["region_id"] == r["region_id"]:
                            assignments[i] = (ar, f"{labels[j]} {direction}", adlat, adlng)

        # Apply the disambiguated names
        for r, direction, _, _ in assignments:
            new_display = f"{base_name} {EM} {direction}"
            if r["display_name"] != new_display:
                r["display_name"] = new_display
                r["short_name"] = truncate_short_name(new_display)
                fixes += 1

    # Second pass: if any collisions remain, append region_id as last resort
    visible = [r for r in regions if not r.get("merge_into")]
    name_count = defaultdict(list)
    for r in visible:
        name_count[r["display_name"]].append(r)
    for name, dupes in name_count.items():
        if len(dupes) <= 1:
            continue
        for r in dupes:
            old = r["display_name"]
            r["display_name"] = f"{old} #{r['region_id']}"
            r["short_name"] = truncate_short_name(r["display_name"])
            fixes += 1

    return fixes


def main():
    parser = argparse.ArgumentParser(description="Apply Google Maps name overrides")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    parser.add_argument("--min-confidence", default="medium",
                        choices=["high", "medium", "low"],
                        help="Minimum confidence level to apply (default: medium)")
    args = parser.parse_args()

    min_rank = CONFIDENCE_RANK[args.min_confidence]

    # Load renames
    if not RENAMES_PATH.exists():
        sys.exit(f"ERROR: {RENAMES_PATH} not found.\n"
                 f"Run gemini_google_maps_names.py first.")

    renames_data = json.loads(RENAMES_PATH.read_text(encoding="utf-8"))
    renames = renames_data.get("renames", [])
    print(f"Loaded {len(renames)} proposed renames from Gemini output.")

    # Filter by confidence
    filtered = [r for r in renames
                if CONFIDENCE_RANK.get(r.get("confidence", "low"), 0) >= min_rank]
    print(f"Applying {len(filtered)} renames (min confidence: {args.min_confidence}).")

    if not filtered:
        print("Nothing to apply.")
        return

    # Build rename map: region_id -> google_maps_name
    rename_map = {r["region_id"]: r["google_maps_name"] for r in filtered}

    # Load and patch regions
    preamble, regions, postamble = load_region_index_raw()
    changes = 0

    for region in regions:
        rid = region["region_id"]
        new_name = rename_map.get(rid)

        if not new_name:
            # Check if this is a merged secondary whose primary was renamed
            merge_into = region.get("merge_into")
            if merge_into and merge_into in rename_map:
                new_name = rename_map[merge_into]
            else:
                continue

        old_display = region.get("display_name", region["region_name"])

        # Preserve directional suffix if present on old name
        suffix_match = SUFFIX_RE.search(old_display)
        suffix = suffix_match.group(0) if suffix_match else ""

        # Check if the new name already has a suffix (from Gemini)
        new_suffix_match = SUFFIX_RE.search(new_name)
        if new_suffix_match:
            final_display = new_name
        else:
            final_display = new_name + suffix

        # Apply changes
        base = SUFFIX_RE.split(new_name)[0].strip()
        region["google_maps_name"] = base
        region["display_name"] = final_display
        region["short_name"] = truncate_short_name(final_display)
        changes += 1

        if args.dry_run:
            print(f"  id={rid:>3}: \"{old_display}\" -> \"{final_display}\"")

    print(f"\n{changes} regions renamed.")

    # Re-disambiguate any collisions
    fixes = disambiguate_collisions(regions)
    if fixes:
        print(f"{fixes} collision(s) resolved with cardinal-direction suffixes.")

    # Final uniqueness check
    visible = [r for r in regions if not r.get("merge_into")]
    names = [r["display_name"] for r in visible]
    unique = set(names)
    if len(names) != len(unique):
        dupes = [n for n in names if names.count(n) > 1]
        print(f"\nWARNING: {len(set(dupes))} duplicate names remain after disambiguation:")
        for d in sorted(set(dupes)):
            ids = [r["region_id"] for r in visible if r["display_name"] == d]
            print(f"  \"{d}\" -> ids {ids}")
    else:
        print(f"All {len(unique)} visible display names are unique.")

    if args.dry_run:
        print("\n(Dry run -- no files written.)")
        return

    # Write back
    json_str = json.dumps(regions, indent=2, ensure_ascii=False)
    output = preamble + json_str + postamble
    REGION_INDEX_PATH.write_text(output, encoding="utf-8")
    print(f"Written to {REGION_INDEX_PATH}")
    print("\nIMPORTANT: After applying, run `npm run build` to verify,")
    print("then check the app in the browser to confirm names look correct.")
    print("The original census-tract region_name field is preserved for data integrity.")


if __name__ == "__main__":
    main()
