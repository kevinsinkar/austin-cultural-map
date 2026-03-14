/**
 * regionLookup.js
 * ---------------
 * Central region-lookup utilities derived from the source of truth
 * (final_updated_regions.js / REGIONS_GEOJSON).
 *
 * Provides name↔id translation for any module that needs it.
 * Uses REGION_INDEX (lightweight, no geometry) to avoid pulling in
 * the 7.6 MB full GeoJSON just for name/id maps.
 *
 * display_name is the unique, disambiguated name shown in the UI.
 * For merged regions, only the primary entry appears in NAME_TO_ID;
 * secondary region_ids redirect to the primary via MERGE_LOOKUP.
 */

import { REGION_INDEX } from "./regionIndex";

// ── Visible regions (excludes merged secondaries) ───────────────────────

/** Regions that should appear in dropdowns, tables, and heatmaps. */
export const VISIBLE_REGIONS = REGION_INDEX.filter((r) => !r.merge_into);

// ── Merge lookup ────────────────────────────────────────────────────────

/** Map<secondary_region_id, primary_region_id> for merged regions. */
export const MERGE_LOOKUP = new Map(
  REGION_INDEX.filter((r) => r.merge_into).map((r) => [r.region_id, r.merge_into])
);

/** Get the primary region_id (follows merge chain, or returns input). */
export function toPrimaryId(regionId) {
  return MERGE_LOOKUP.get(regionId) ?? regionId;
}

/** Get all region_ids belonging to a merged group (including primary). */
export function getMergedIds(regionId) {
  const entry = REGION_INDEX.find((r) => r.region_id === regionId);
  if (!entry) return [regionId];
  if (entry.merged_ids) return [regionId, ...entry.merged_ids];
  if (entry.merge_into) {
    const primary = REGION_INDEX.find((r) => r.region_id === entry.merge_into);
    return primary?.merged_ids ? [primary.region_id, ...primary.merged_ids] : [regionId];
  }
  return [regionId];
}

// ── Name ↔ ID maps (use display_name for unique lookups) ───────────────

/** Map<display_name, region_id> — only visible (non-merged-secondary) entries. */
export const NAME_TO_ID = new Map(
  VISIBLE_REGIONS.map((r) => [r.display_name, r.region_id])
);

/** Map<region_id, display_name> — all entries (including secondaries). */
export const ID_TO_NAME = new Map(
  REGION_INDEX.map((r) => [r.region_id, r.display_name])
);

// ── Convenience helpers ──────────────────────────────────────────────────

/** Resolve a display_name to a region_id (returns undefined on miss). */
export function toId(regionName) {
  return NAME_TO_ID.get(regionName);
}

/** Resolve a region_id to a display_name (returns undefined on miss). */
export function toName(regionId) {
  return ID_TO_NAME.get(regionId);
}
