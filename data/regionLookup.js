/**
 * regionLookup.js
 * ---------------
 * Central region-lookup utilities derived from the source of truth
 * (final_updated_regions.js / REGIONS_GEOJSON).
 *
 * Provides name↔id translation for any module that needs it.
 * Uses REGION_INDEX (lightweight, no geometry) to avoid pulling in
 * the 7.6 MB full GeoJSON just for name/id maps.
 */

import { REGION_INDEX } from "./regionIndex";

// ── Name ↔ ID maps ──────────────────────────────────────────────────────

/** Map<region_name, region_id> */
export const NAME_TO_ID = new Map(
  REGION_INDEX.map((r) => [r.region_name, r.region_id])
);

/** Map<region_id, region_name> */
export const ID_TO_NAME = new Map(
  REGION_INDEX.map((r) => [r.region_id, r.region_name])
);

// ── Convenience helpers ──────────────────────────────────────────────────

/** Resolve a region_name to a region_id (returns undefined on miss). */
export function toId(regionName) {
  return NAME_TO_ID.get(regionName);
}

/** Resolve a region_id to a region_name (returns undefined on miss). */
export function toName(regionId) {
  return ID_TO_NAME.get(regionId);
}
