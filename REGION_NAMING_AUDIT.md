# Region Naming Audit

> Systematic identification and renaming of 154 tracts still showing "Tract XXX" format
>
> **Status:** ✅ COMPLETE | **Date:** 2026-08-30

---

## Completion Summary

All phases executed on 2026-08-30:

1. **regionIndex.js**: 154 `region_name` fields promoted from "Tract XXX" → `short_name` value; 154 `display_name` fields updated to match (preserving merge suffixes)
2. **Duplicate disambiguation**: 87 display_names in duplicate groups (e.g., 8× "Southwood", 7× "Circle C") suffixed with `[region_id]` per existing convention. Verified: **zero originally-named regions were altered** — all hardcoded name references (tipping points, businesses, music data) remain valid
3. **phase1_output JSONs**: `region` field synced by region_id — demographics (858 rows), property (592 rows), socioeconomic (592 rows)
4. **Neighborhoods rebuilt**: 136 neighborhoods, 232/232 visible tracts assigned, 0 polygon failures. Contiguity audit: 4 flagged (>4km spread), 3 orphans — same as pre-rename baseline
5. **UI display fixes**:
   - `MapView.jsx`: panel header now prefers community name over tract label
   - `RegionDetailPanel.jsx`: header suffix shows tract label (e.g., "Windsor Hills [Tract 419.0]") instead of internal id
   - `useAustinMap.js`: map hover tooltips show "Community Name (Tract XXX)"
6. **Build**: passes clean; lint errors in touched files are all pre-existing

---

## Overview

- **Total regions**: 269
- **Unnamed (Tract format)**: 154 (57%)
- **Already named**: 115 (43%)

**Goal**: Replace all `region_name: "Tract XXX"` with recognizable community/neighborhood names

---

## Current State

### Problem
Many tracts outside City of Austin NPA coverage have:
- ✗ `region_name: "Tract 22.14"` (in phase1_output JSONs)
- ✓ `short_name: "Blackland"` (in regionIndex.js)
- ✓ `display_name: "Blackland"` (used in UI)

This creates inconsistency: data files say "Tract 22.14" but UI shows "Blackland".

### Solution Path
1. Update `region_name` in regionIndex.js from "Tract XXX" → short_name value
2. Regenerate phase1_output JSONs with updated region names (via merge script)
3. Rebuild neighborhoods
4. Verify UI shows consistent names everywhere

---

## Tracts by Geographic Area

### NORTH AUSTIN (30.38–30.40°N, -97.68 to -97.62°W)
High-suburban cluster; most already have community names assigned

```
ID    Tract          Short Name                Lat       Lng      Status
5     Tract 419.0    Windsor Hills            30.3928   -97.6904  → Rename
6     Tract 411.0    North Shoal Creek        30.3861   -97.6795  → Rename
8     Tract 440.0    St. John's               30.3977   -97.6631  → Rename
9     Tract 437.0    Windsor Park             30.3934   -97.6663  → Rename
11    Tract 415.0    Georgian Acres           30.3804   -97.6684  → Rename
13    Tract 449.0    Dessau                   30.3876   -97.6274  → Rename
...
```

### EAST AUSTIN (30.25–30.30°N, -97.62 to -97.72°W)
Mixed urban/suburban; many core tracts already named, some periphery unnamed

```
ID    Tract          Short Name                Lat       Lng      Status
4     Tract 22.14    Blackland                30.2823   -97.6520  → Rename
12    Tract 22.13    Springdale               30.2881   -97.6389  → Rename
...
```

### SOUTH AUSTIN (30.17–30.26°N, -97.80 to -97.58°W)
Includes Creedmoor, Cedar Park periphery; suburban sprawl with cluster names

```
ID    Tract          Short Name                Lat       Lng      Status
18    Tract 24.53    Creedmoor                30.1774   -97.5914  → Rename
19    Tract 24.XX    [varies]                 [varies]  [varies]  → Review
```

### WEST AUSTIN (30.19–30.26°N, -97.84 to -97.90°W)
Hill Country periphery; low-density suburban and rural areas

```
ID    Tract          Short Name                Lat       Lng      Status
7     Tract 367.0    Barton Creek             30.1955   -97.9026  → Rename
10    Tract 368.0    Circle C                 30.1854   -97.8793  → Rename
```

---

## Action Items

### Phase 1: Update regionIndex.js
For each tract where `region_name.startsWith('Tract')`:
- [ ] Replace `region_name` with `short_name` value
- [ ] Preserve all other fields unchanged
- [ ] Example:
  ```javascript
  // Before
  { region_id: 5, region_name: "Tract 419.0", short_name: "Windsor Hills", ... }
  
  // After
  { region_id: 5, region_name: "Windsor Hills", short_name: "Windsor Hills", ... }
  ```

### Phase 2: Regenerate phase1_output JSONs
- [ ] Run merge script to propagate regionIndex changes into demographic/property/socioeconomic JSONs
- [ ] Verify all 154 entries updated in all 3 files
- [ ] Commit: "refactor(data): normalize region names — 154 tracts Tract XXX → community names"

### Phase 3: Rebuild & Verify
- [ ] Run `node scripts/build_neighborhoods.cjs` to incorporate updated names
- [ ] Run `node scripts/audit_neighborhoods.cjs` to verify contiguity
- [ ] Spot-check UI: MapView, RegionDetailPanel, TriageView show consistent names
- [ ] Test search/filtering by region name

### Phase 4: Commit & Document
- [ ] Create detailed changelog of all 154 renames (for reference)
- [ ] Update ISSUES.md to mark region naming audit complete
- [ ] Close out region naming todo items

---

## Notes

- **Short names are authoritative**: All 154 tracts already have `short_name` assigned (likely from prior Google Maps geocoding or manual review)
- **No manual naming needed**: We're not inventing new names; just surfacing existing `short_name` values to `region_name`
- **Preserves data integrity**: Changes are cosmetic (display names); numeric region_ids and tract codes unchanged

---

## Estimated Effort

- **Phase 1** (regionIndex.js update): 30 min (script-assisted replace)
- **Phase 2** (regenerate JSONs): 10 min (run merge script)
- **Phase 3** (rebuild & verify): 20 min (run scripts + spot check)
- **Phase 4** (commit): 10 min

**Total**: ~70 minutes for full audit completion

---

## Blockers

None identified. All information is already available in regionIndex.js; this is a harmonization/standardization pass.
