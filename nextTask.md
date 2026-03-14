## Task: Re-Audit Region Names for Better User Interface

### Context

The initial region name disambiguation is complete (44 duplicate groups resolved, 269 -> 232 visible regions). A three-source reconciliation pipeline then renamed 125 regions from census-tract labels to more recognizable neighborhood names. However, many names still need human review.

### Current State

Each region in `data/regionIndex.js` now has:
- `region_name` — original census-tract name (preserved, never changed)
- `display_name` — the name shown in all UI (dropdowns, tables, tooltips, heatmap)
- `google_maps_name` — name from Gemini/official audit (if renamed)
- `short_name` — truncated version for tight UI spaces

### What Needs Review

1. **149 regions outside City of Austin coverage** — These are suburbs, ETJ areas, and unincorporated zones (Circle C, Steiner Ranch, Wells Branch, Del Valle, etc.) that the official neighborhood planning area GeoJSON doesn't cover. Their names come from Gemini's knowledge of Google Maps, which may be inaccurate.

2. **77 official-data renames** — The centroid of each region was tested against City of Austin planning area polygons. When a centroid fell inside a differently-named official area, the name was updated. Some of these may feel wrong to locals (e.g., "Clarksville" -> "Old West Austin", "South Congress" -> "St. Edward's") because planning area names don't always match common usage.

3. **User-identified issues** (not yet applied):
   - "The Arboretum — East" should be "The Domain" (official says NORTH BURNET)
   - "Shady Hollow — North" should be "Cherry Creek — East"
   - "Circle C Ranch — Southwest" should be "Cherry Creek — West"

### How to Fix

#### Step 1: Visual review in the browser
Run the app (`npm run dev`) and check region names in:
- Compare tab dropdowns
- Triage table "Region" column
- Timeline DVI heatmap row labels
- Map tooltips on hover

#### Step 2: Add corrections to USER_OVERRIDES
Edit `scripts/build_master_remap.py` and add entries to the `USER_OVERRIDES` dict:

```python
USER_OVERRIDES = {
    176: "The Domain",              # "The Arboretum - East" -> The Domain
    167: "Cherry Creek — East",     # "Shady Hollow - North"
    156: "Cherry Creek — West",     # "Circle C Ranch - Southwest"
    # Add more as you find them...
}
```

#### Step 3: Re-run the pipeline
```bash
python scripts/build_master_remap.py          # Rebuilds master_remap.json
python scripts/apply_google_maps_names.py     # Patches regionIndex.js
npm run build                                 # Verify
```

User overrides take priority over official data and Gemini suggestions.

#### Step 4 (optional): OSM cross-reference
For the 149 regions outside City of Austin coverage, `remapping_sug.txt` documents how to pull OpenStreetMap neighborhood boundaries via Overpass Turbo. This could fill the coverage gap for suburban areas.

### Pipeline scripts

| Script | Purpose |
|--------|---------|
| `scripts/audit_region_names.py` | Downloads City of Austin neighborhood GeoJSON, point-in-polygon tests all 269 centroids |
| `scripts/gemini_google_maps_names.py` | Sends centroids to Gemini 2.5 Flash for Google Maps name comparison |
| `scripts/build_master_remap.py` | Merges user overrides + official audit + Gemini into one remap table |
| `scripts/apply_google_maps_names.py` | Applies remap to `regionIndex.js` with collision detection |
| `scripts/gemini_retry_failed.py` | Re-runs failed Gemini batches with higher token limit |

### Files involved

| File | Role |
|------|------|
| `data/regionIndex.js` | Source of truth — all 269 entries with `display_name`, `region_name`, `google_maps_name` |
| `data/regionLookup.js` | `VISIBLE_REGIONS`, `NAME_TO_ID`, `ID_TO_NAME` — derived from regionIndex |
| `data/constants.js` | `REGION_NAMES` — sorted list of unique `display_name` values |
| `scripts/gemini_output/neighborhood_audit.json` | Point-in-polygon audit results |
| `scripts/gemini_output/google_maps_names.json` | Gemini rename suggestions |
| `scripts/gemini_output/master_remap.json` | Combined remap table (what was actually applied) |

### Acceptance Criteria

- All 232 visible display names are recognizable to Austin locals
- No two visible regions share the same display name
- Map tooltips, dropdowns, table rows, and heatmap labels all show the corrected names
- Original `region_name` field preserved in every entry for data lineage
