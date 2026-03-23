"""
Retry failed batches from gemini_google_maps_names.py with higher token limit.
"""

import os
import sys
import json
import time
from pathlib import Path

from google import genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    sys.exit("ERROR: GEMINI_API_KEY environment variable not set.")

client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.5-flash"

REPO = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO / "scripts" / "gemini_output"

# Import helpers from the main script
sys.path.insert(0, str(REPO / "scripts"))
from gemini_google_maps_names import load_region_index, build_region_list, SYSTEM_PROMPT

def main():
    regions = load_region_index()
    visible = [r for r in regions if "merge_into" not in r or r.get("merge_into") is None]

    BATCH_SIZE = 50
    batches = [visible[i : i + BATCH_SIZE] for i in range(0, len(visible), BATCH_SIZE)]

    # Only retry batches 1 and 4 (0-indexed: 0 and 3)
    failed_indices = [0, 3]

    existing = json.loads((OUTPUT_DIR / "google_maps_names.json").read_text(encoding="utf-8"))
    existing_ids = {r["region_id"] for r in existing["renames"]}
    new_renames = []

    for idx in failed_indices:
        batch = batches[idx]
        print(f"Retrying batch {idx + 1} ({len(batch)} regions)...")

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
                    "temperature": 0.1,
                    "max_output_tokens": 16384,
                },
            )

            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0].strip()

            result = json.loads(text)
            renames = result.get("renames", [])
            # Only add renames we don't already have
            for r in renames:
                if r["region_id"] not in existing_ids:
                    new_renames.append(r)
                    existing_ids.add(r["region_id"])
            print(f"  Got {len(renames)} renames, {len([r for r in renames if r['region_id'] not in existing_ids])} new.")

        except json.JSONDecodeError as e:
            print(f"  FAILED again: {e}")
            raw_path = OUTPUT_DIR / f"raw_retry_batch_{idx + 1}.txt"
            raw_path.write_text(response.text, encoding="utf-8")
            print(f"  Saved to {raw_path}")

        except Exception as e:
            print(f"  ERROR: {e}")

        if idx != failed_indices[-1]:
            time.sleep(5)

    # Merge into existing results
    existing["renames"].extend(new_renames)
    existing["metadata"]["total_renames"] = len(existing["renames"])
    (OUTPUT_DIR / "google_maps_names.json").write_text(
        json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nAdded {len(new_renames)} new renames. Total: {len(existing['renames'])}")

if __name__ == "__main__":
    main()
