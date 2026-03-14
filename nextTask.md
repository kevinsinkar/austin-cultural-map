## Task: Disambiguate Duplicate Region Names

### Problem

The 269 regions in `data/regionIndex.js` are census tracts mapped to neighborhood names, but **44 neighborhood names are shared by multiple tracts** (165 unique names out of 269 regions). This causes real UX problems:

- **Compare tab** (`components/ComparisonView.jsx`): The region selector dropdowns list names from `REGION_NAMES` (defined in `data/constants.js` as `REGION_INDEX.map(r => r.region_name).sort()`). Duplicate names appear multiple times with no way to tell them apart. Selecting "Zilker" could be any of 5 different tracts with DVI scores ranging from 4.9 to 85.7.
- **Triage tab** (`components/TriageView.jsx`): The sortable table shows `region_name` for each of the 269 rows. Seven rows all say "Circle C Ranch" with different DVI scores — confusing for grant decisions.
- **Timeline tab** (`components/TimelineView.jsx`): The DVI heatmap table at the bottom iterates over all 269 `REGION_INDEX` entries, producing duplicate row labels.

### Duplicate inventory (44 names, sorted by frequency)

| Name | Count | DVI range | Notes |
|------|-------|-----------|-------|
| Circle C Ranch | 7 | 4.9–4.9 | All identical DVI — strong merge candidate |
| Northwood | 7 | 4.9–69.5 | Wide DVI spread — tracts are diverse |
| Montopolis | 7 | 0–70.3 | Wide spread |
| North Shoal Creek | 6 | 17.8–72.4 | Wide spread |
| Great Hills | 6 | 4.9–61.1 | |
| River Place | 6 | 4.9–4.9 | All identical DVI — strong merge candidate |
| Steiner Ranch | 6 | 4.9–12.4 | Low spread — merge candidate |
| Zilker | 5 | 4.9–85.7 | Very wide spread |
| Milwood | 5 | 4.9–4.9 | All identical DVI — strong merge candidate |
| Oak Hill | 5 | 4.9–29.2 | |
| Wells Branch | 5 | 4.9–53.5 | |
| Cherrywood | 4 | 21.1–70.3 | |
| The Arboretum | 4 | 4.9–23.8 | |
| Shady Hollow | 4 | 4.9–17.8 | |
| Southwood | 4 | 4.9–63.2 | |
| Jollyville | 4 | 4.9–4.9 | All identical DVI — strong merge candidate |
| + 28 more names | 2–3 each | various | |

### Approach options (pick one or combine)

#### Option A: Merge contiguous tracts with the same name into a single region

If multiple tracts share a name AND their GeoJSON polygons are adjacent (share a border), merge them into one region by:
1. Combining their GeoJSON geometries into a `MultiPolygon` in `data/final_updated_regions.js`
2. Averaging or population-weighting their demographic/property/socioeconomic rows in the phase1_output JSON files (or keeping per-tract rows and aggregating at display time)
3. Assigning the merged region a single `region_id` and updating `regionIndex.js`
4. This is the cleanest long-term fix but the most work

To check adjacency, you can use the GeoJSON polygons in `data/final_updated_regions.js` — tracts sharing the same name that share a polygon edge are merge candidates.

#### Option B: Append a disambiguator to non-unique names

For each duplicated name, modify `region_name` (or add a `display_name` field) in `data/regionIndex.js` to include a differentiator. Options:
- **Tract ID**: "Zilker (Tract 15)" — technical but unambiguous
- **Cardinal direction from centroid cluster**: "Zilker — South", "Zilker — Central" — user-friendly, computed from lat/lng centroids relative to the group mean
- **DVI tier suffix**: "Montopolis (High DVI)", "Montopolis (Low DVI)" — directly meaningful for this tool's purpose

#### Option C: Hybrid — merge where DVI is identical, disambiguate where it diverges

- If all tracts sharing a name have the same DVI score (Circle C Ranch: all 4.9, Milwood: all 4.9, Jollyville: all 4.9, River Place: all 4.9), merge them — they're effectively one region for this tool's purposes
- If tracts sharing a name have divergent DVI scores (Zilker: 4.9–85.7, Montopolis: 0–70.3), disambiguate with a suffix since they tell different displacement stories

### Files to modify

| File | What changes |
|------|-------------|
| `data/regionIndex.js` | Add `display_name` field (or update `region_name`) for all 269 entries. If merging, remove merged duplicates and assign new IDs. |
| `data/final_updated_regions.js` | If merging: combine GeoJSON polygons into MultiPolygons. If disambiguating: update `region_name` in feature properties. |
| `data/constants.js` | `REGION_NAMES` derives from `REGION_INDEX` — will auto-update if `region_name` changes. If using `display_name`, update to use that field instead. |
| `data/regionLookup.js` | `NAME_TO_ID` and `ID_TO_NAME` maps — must reflect new names or merged IDs. |
| `components/ComparisonView.jsx` | Uses `REGION_NAMES` for dropdown options and `NAME_TO_ID` for lookups. If using `display_name`, update the `<option>` rendering. |
| `components/TriageView.jsx` | Displays `region_name` in the table. Update to use `display_name` or the new merged names. |
| `components/TimelineView.jsx` | DVI heatmap iterates `REGION_INDEX` and shows `short_name`. Update to use `display_name` or short variant. |
| `hooks/useAustinMap.js` | Tooltip on hover shows `region_name` from GeoJSON feature properties. |
| `data/auditedData.js` | If merging: the `AUDITED_*_BY_ID` Maps need to reflect merged region IDs. |
| `data/auditedDvi.js` | `AUDITED_DVI_LOOKUP` keyed by `region_id` — needs merged IDs if merging. |

### Constraints

- The map choropleth (`hooks/useAustinMap.js`) renders GeoJSON features directly — each polygon must retain a unique `region_id` in its properties regardless of approach
- Business data in `data/businesses.js` references `region_id` — must stay consistent
- The three phase1_output JSON files use `region_id` as the join key — if merging, decide whether to aggregate data or keep per-tract rows
- `REGION_NAMES` is currently sorted alphabetically (just changed) — maintain that

### Acceptance criteria

- No two entries in the Compare dropdowns have identical display text
- No two rows in the Triage table have identical display text
- No two rows in the Timeline DVI heatmap have identical display text
- Map tooltips show the disambiguated name
- All data lookups (DVI, demographics, property, socio, businesses) still work correctly
- The total region count may decrease if merging, but no data should be lost
