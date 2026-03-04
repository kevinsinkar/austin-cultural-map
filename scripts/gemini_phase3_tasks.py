"""
Gemini 2.5 Pro — Phase 3 Tasks (3.1, 3.2, 3.3)

Loads relevant source files from the codebase and sends them to
Gemini with task-specific prompts to get implementation guidance for:
  3.1  Enrich comparison auto-narratives with cultural data
  3.2  Add inflation-adjustment labels to property cards

Usage:
    python scripts/gemini_phase3_tasks.py

Requires:
    - GEMINI_API_KEY environment variable
    - google-genai package  (pip install google-genai)
"""

import os
import sys
import json
from pathlib import Path

# ── Gemini client setup ──────────────────────────────────────────────
from google import genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    sys.exit("ERROR: GEMINI_API_KEY environment variable not set.")

client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.5-pro"

# ── Repo root ────────────────────────────────────────────────────────
REPO = Path(__file__).resolve().parent.parent

# ── File loader helper ───────────────────────────────────────────────

def load_file(rel_path: str) -> str:
    """Read a file relative to the repo root and return its contents."""
    full = REPO / rel_path
    if not full.exists():
        return f"[FILE NOT FOUND: {rel_path}]"
    return full.read_text(encoding="utf-8", errors="replace")


def truncate(text: str, max_chars: int = 60_000) -> str:
    """Truncate large files to stay within token limits."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + f"\n\n... [TRUNCATED — {len(text) - max_chars} chars omitted]"


# ── Source files needed per task ─────────────────────────────────────

# Task 3.1: Enrich comparison auto-narratives with cultural data
TASK_3_1_FILES = [
    "components/ComparisonView.jsx",
    "data/businesses.js",
    "data/constants.js",
    "data/regionLookup.js",
    "utils/math.js",
    "utils/formatters.js",
]

# Task 3.2: Add inflation-adjustment labels to property cards
TASK_3_2_FILES = [
    "components/RegionDetailPanel.jsx",
    "data/index.js",
    "data/auditedData.js",
    "utils/math.js",
    "utils/formatters.js",
]



# ── Prompts ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert React/JavaScript developer working on "Austin's Shifting Ground",
a civic data-visualization app that maps cultural displacement across Austin, TX
neighborhoods. The stack is React + Recharts + Leaflet, bundled with Vite.

When you produce code, give complete, drop-in implementations (not pseudo-code).
Use the same coding style visible in the provided source files: inline styles,
functional components, lodash where appropriate.  Keep accessibility attributes.
"""

TASK_3_1_PROMPT = """\
## Task 3.1 — Enrich Comparison Auto-Narratives with Cultural Data

**Current state:** The `compNarrative` useMemo in ComparisonView.jsx generates a
purely mathematical summary ("DVI 62 vs 31", home value differences).

**Goal:** After the existing DVI and home-value sentences, add logic that:
1. Counts closed businesses by `culture` field for each compared region
   (use LEGACY_CLOSED from businesses.js, matched by `region_id`).
2. Identifies the dominant cultural affiliation of losses (e.g., "African American
   heritage businesses").
3. Generates a natural-language sentence like:
   "East Austin lost 8 African American heritage businesses between 2000–2020,
   compared to 2 in [Region B]."
4. If one region has significantly more closed businesses, note it.
5. If one region has more surviving businesses under high/critical pressure,
   flag it as "at greater near-term risk of further cultural loss."

**Acceptance criteria:**
- Narrative includes cultural-affiliation data from the business inventory.
- Reads naturally, not like a data dump.
- Falls back gracefully if business data is sparse for a region.

Please provide the complete updated `compNarrative` useMemo block,
plus any new imports needed.
"""

TASK_3_2_PROMPT = """\
## Task 3.2 — Add Inflation-Adjustment Labels to Property Cards

**Current state:** RegionDetailPanel.jsx shows Median Home Value and Median Rent
with change arrows but doesn't indicate whether values are nominal or inflation-adjusted.

**Goal:**
1. Determine from the data source whether property values are nominal or adjusted
   (the data appears to be nominal based on the pipeline).
2. Add "(nominal $)" subtitle beneath each property metric card.
3. Better: compute inflation-adjusted values using CPI-U Austin MSA deflators.
   The ComparisonView already uses `incomeAdj` for income, so apply the same
   approach to property values.
4. Display both: "Median Home Value: $485k (nominal) / $392k (2023$)".
5. Change arrows should use inflation-adjusted values for directional indicators.

**Acceptance criteria:**
- Every dollar-denominated metric clearly labeled nominal or adjusted.
- Change arrows based on real (inflation-adjusted) values.
- Consistent with ComparisonView's treatment of income.

IMPORTANT: Do NOT rewrite the entire RegionDetailPanel.jsx file. Instead, provide:
1. The complete CPI deflator utility file (utils/cpi.js) with Austin MSA / US Urban
   CPI-U data from 1990-2023 and an `adjustForInflation(value, year, baseYear)` function.
2. The exact NEW import line to add at the top of RegionDetailPanel.jsx.
3. ONLY the changed Property Metrics `.map()` block — the code that replaces the
   existing `{propertyNow && [...]}.map((c, i) => { ... })` section. Show JUST
   that block, not the surrounding component.
4. ONLY the changed Socioeconomic Metrics `.map()` block — same approach, JUST
   the replacement for `{socioNow && [...]}.map((c, i) => { ... })`.
5. A brief note on how the change arrows now use inflation-adjusted values.

Keep each code block focused and minimal — no need to repeat unchanged parts of the file.
"""



# ── Run queries ──────────────────────────────────────────────────────

def build_file_context(file_list: list[str]) -> str:
    """Concatenate file contents into a single context block."""
    parts = []
    for rel in file_list:
        content = load_file(rel)
        content = truncate(content)
        parts.append(f"### {rel}\n```\n{content}\n```\n")
    return "\n".join(parts)


def query_gemini(task_label: str, task_prompt: str, file_list: list[str]) -> str:
    """Send a task prompt + file context to Gemini and return the response."""
    file_context = build_file_context(file_list)

    full_prompt = (
        f"{task_prompt}\n\n"
        f"---\n\n"
        f"## Source Files for Reference\n\n{file_context}"
    )

    print(f"\n{'='*70}")
    print(f"  {task_label}")
    print(f"{'='*70}")
    print(f"  Sending {len(file_list)} files ({len(full_prompt):,} chars) to {MODEL}...")

    response = client.models.generate_content(
        model=MODEL,
        contents=full_prompt,
        config={
            "system_instruction": SYSTEM_PROMPT,
            "temperature": 0.3,
            "max_output_tokens": 16384,
        },
    )

    text = response.text
    print(f"  Response received: {len(text):,} chars")
    return text


def main():
    tasks = [
        # Task 3.1 already completed — skip
        # ("Task 3.1 — Enrich Comparison Auto-Narratives", TASK_3_1_PROMPT, TASK_3_1_FILES),
        ("Task 3.2 — Inflation Labels on Property Cards", TASK_3_2_PROMPT, TASK_3_2_FILES),
    ]

    output_dir = REPO / "scripts" / "gemini_output"
    output_dir.mkdir(exist_ok=True)

    all_results = {}
    for label, prompt, files in tasks:
        result = query_gemini(label, prompt, files)
        all_results[label] = result

        # Save individual task output
        safe_name = label.split("—")[0].strip().replace(" ", "_").lower()
        out_file = output_dir / f"{safe_name}.md"
        out_file.write_text(f"# {label}\n\n{result}", encoding="utf-8")
        print(f"  Saved to: {out_file.relative_to(REPO)}")

    # Save combined output
    combined = output_dir / "phase3_combined.md"
    with open(combined, "w", encoding="utf-8") as f:
        f.write("# Phase 3 — Gemini 2.5 Pro Implementation Guidance\n\n")
        f.write(f"Generated by `scripts/gemini_phase3_tasks.py`\n\n---\n\n")
        for label, text in all_results.items():
            f.write(f"# {label}\n\n{text}\n\n---\n\n")
    print(f"\n  Combined output: {combined.relative_to(REPO)}")
    print(f"\nDone — both tasks processed.")


if __name__ == "__main__":
    main()
