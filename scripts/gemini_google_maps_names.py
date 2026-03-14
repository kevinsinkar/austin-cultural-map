"""
Gemini 2.5 Pro — Google Maps Region Name Reconciliation

Sends each region's centroid (lat/lng) and current census-tract-based name
to Gemini along with a prompt asking it to:
  1. Reverse-geocode the centroid via its knowledge of Google Maps
  2. Return the commonly-known neighborhood / area name for that location
  3. Flag cases where the census name differs from the Google Maps name

Outputs:
  scripts/gemini_output/google_maps_names.json
    — a JSON object mapping region_id -> { current_name, google_maps_name }
      for every region where the names differ

After reviewing the output, run apply_google_maps_names.py to patch
regionIndex.js with the new names.

Usage:
    python scripts/gemini_google_maps_names.py

Requires:
    - GEMINI_API_KEY environment variable
    - google-genai package  (pip install google-genai)
"""

import os
import sys
import json
import time
from pathlib import Path

# ── Gemini client setup ──────────────────────────────────────────────
from google import genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    sys.exit("ERROR: GEMINI_API_KEY environment variable not set.")

client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.5-flash"

# ── Repo root ────────────────────────────────────────────────────────
REPO = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO / "scripts" / "gemini_output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Load region index ────────────────────────────────────────────────

def load_region_index():
    """Parse REGION_INDEX from regionIndex.js."""
    path = REPO / "data" / "regionIndex.js"
    text = path.read_text(encoding="utf-8")
    # Extract the JSON array between the first [ and the matching ]
    start = text.index("[")
    # Find the matching closing bracket by counting depth
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
    json_str = text[start : end + 1]
    return json.loads(json_str)


# ── Build the prompt ─────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a geographic data reconciliation agent. You have extensive knowledge
of Austin, Texas neighborhoods, subdivisions, and commonly-used area names
as they appear on Google Maps, Apple Maps, and in everyday local usage.

Your task: given a list of census-tract regions with their centroid
coordinates and current names, determine what Google Maps / common local
usage would call each location. Many census tract names are accurate, but
some use obscure planning-region labels that residents would not recognize.

RULES:
1. Use your knowledge of Austin geography to identify the most commonly
   recognized neighborhood or area name for each centroid coordinate.
2. If the current name is already the common name (or close enough that
   a local would recognize it), return it unchanged.
3. If a better, more widely-recognized name exists, return that name.
4. For disambiguated names (containing " — "), preserve the directional
   suffix but update the base name if needed.
   Example: "Northwood — East" -> "Balcones Woods — East" if the centroid
   at (30.416, -97.713) is actually in the Balcones Woods neighborhood.
5. Do NOT invent names. Only use names that appear on Google Maps or are
   in common local usage in Austin.
6. For merged regions (where merged_ids is present), use the most
   commonly-known name for the overall area.
7. Preserve all region_ids exactly as given.

OUTPUT FORMAT:
Return a JSON object (and nothing else) with this structure:
{
  "renames": [
    {
      "region_id": <number>,
      "current_name": "<current display_name>",
      "google_maps_name": "<the commonly-known name>",
      "confidence": "high" | "medium" | "low",
      "reasoning": "<brief explanation>"
    },
    ...
  ]
}

Only include entries where google_maps_name DIFFERS from current_name.
If the current name is fine, omit that region entirely.
"""


def build_region_list(regions):
    """Build a compact text list of regions for the prompt."""
    lines = []
    for r in regions:
        parts = [
            f"id={r['region_id']}",
            f"name=\"{r.get('display_name', r['region_name'])}\"",
            f"lat={r['lat']:.6f}",
            f"lng={r['lng']:.6f}",
        ]
        if r.get("merged_ids"):
            parts.append(f"merged_ids={r['merged_ids']}")
        lines.append("  " + ", ".join(parts))
    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────────

def main():
    regions = load_region_index()
    # Only process visible regions (non-merged secondaries)
    visible = [r for r in regions if "merge_into" not in r or r.get("merge_into") is None]
    print(f"Loaded {len(regions)} total regions, {len(visible)} visible.")

    # Split into batches to stay within token limits
    # ~50 regions per batch is safe for Gemini 2.5 Pro's context window
    BATCH_SIZE = 50
    batches = [visible[i : i + BATCH_SIZE] for i in range(0, len(visible), BATCH_SIZE)]
    print(f"Processing in {len(batches)} batches of ~{BATCH_SIZE}...")

    all_renames = []

    for batch_idx, batch in enumerate(batches):
        print(f"\n-- Batch {batch_idx + 1}/{len(batches)} ({len(batch)} regions) --")

        region_list = build_region_list(batch)
        user_prompt = (
            f"Here are {len(batch)} Austin, TX census-tract regions with their "
            f"centroid coordinates. For each one, determine whether the current "
            f"name matches what Google Maps / common local usage would call that "
            f"location. Return ONLY the ones that should be renamed.\n\n"
            f"REGIONS:\n{region_list}\n\n"
            f"Return the JSON object with the renames array."
        )

        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=[
                    {"role": "user", "parts": [{"text": SYSTEM_PROMPT + "\n\n" + user_prompt}]},
                ],
                config={
                    "temperature": 0.1,  # Low temp for factual accuracy
                    "max_output_tokens": 8192,
                },
            )

            # Extract JSON from response
            text = response.text.strip()
            # Handle markdown code fences
            if text.startswith("```"):
                text = text.split("\n", 1)[1]  # Remove opening fence
                text = text.rsplit("```", 1)[0]  # Remove closing fence
                text = text.strip()

            result = json.loads(text)
            renames = result.get("renames", [])
            print(f"   Found {len(renames)} renames in this batch.")
            all_renames.extend(renames)

        except json.JSONDecodeError as e:
            print(f"   WARNING: Failed to parse JSON from batch {batch_idx + 1}: {e}")
            print(f"   Raw response (first 500 chars): {response.text[:500]}")
            # Save the raw response for debugging
            raw_path = OUTPUT_DIR / f"raw_batch_{batch_idx + 1}.txt"
            raw_path.write_text(response.text, encoding="utf-8")
            print(f"   Saved raw response to {raw_path}")

        except Exception as e:
            print(f"   ERROR in batch {batch_idx + 1}: {e}")

        # Rate limiting between batches
        if batch_idx < len(batches) - 1:
            print("   Waiting 5s before next batch...")
            time.sleep(5)

    # ── Save results ─────────────────────────────────────────────────
    output = {
        "metadata": {
            "total_regions": len(visible),
            "total_renames": len(all_renames),
            "model": MODEL,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "renames": all_renames,
    }

    out_path = OUTPUT_DIR / "google_maps_names.json"
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n{'=' * 60}")
    print(f"Done. {len(all_renames)} renames saved to {out_path.relative_to(REPO)}")
    print(f"{'=' * 60}")

    # ── Print summary ────────────────────────────────────────────────
    if all_renames:
        print("\nProposed renames:")
        for r in sorted(all_renames, key=lambda x: x["region_id"]):
            conf = r.get("confidence", "?")
            print(f"  [{conf:>6}] id={r['region_id']:>3}  "
                  f"\"{r['current_name']}\" -> \"{r['google_maps_name']}\"")
            if r.get("reasoning"):
                print(f"           {r['reasoning']}")
    else:
        print("\nNo renames proposed — all current names match Google Maps usage.")

    print(f"\nNext step: review the output, then run:")
    print(f"  python scripts/apply_google_maps_names.py")


if __name__ == "__main__":
    main()
