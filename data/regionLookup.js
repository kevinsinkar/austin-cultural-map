/**
 * regionLookup.js
 * ---------------
 * Central region-lookup utilities derived from the source of truth
 * (final_updated_regions.js / REGIONS_GEOJSON).
 *
 * Every file that needs to translate between region_name and region_id,
 * or quickly retrieve demographic / property / socioeconomic rows for a
 * region should import helpers from here.
 */

import { REGIONS_GEOJSON } from "./final_updated_regions";
import { DEMOGRAPHICS } from "./interim_demographics";
import { PROPERTY_DATA } from "./interim_property";
import { SOCIOECONOMIC } from "./interim_socioeconomic";

// ── Name ↔ ID maps ──────────────────────────────────────────────────────

/** Map<region_name, region_id> */
export const NAME_TO_ID = new Map(
  REGIONS_GEOJSON.features.map((f) => [
    f.properties.region_name,
    f.properties.region_id,
  ])
);

/** Map<region_id, region_name> */
export const ID_TO_NAME = new Map(
  REGIONS_GEOJSON.features.map((f) => [
    f.properties.region_id,
    f.properties.region_name,
  ])
);

// ── Pre-indexed caches (region_id → rows[]) ──────────────────────────────

function buildIdIndex(rows) {
  const idx = new Map();
  for (const row of rows) {
    const id = row.region_id;
    if (id == null) continue;
    if (!idx.has(id)) idx.set(id, []);
    idx.get(id).push(row);
  }
  return idx;
}

/** Map<region_id, demographicRow[]> */
export const DEMO_BY_ID = buildIdIndex(DEMOGRAPHICS);

/** Map<region_id, propertyRow[]> */
export const PROP_BY_ID = buildIdIndex(PROPERTY_DATA);

/** Map<region_id, socioeconomicRow[]> */
export const SOCIO_BY_ID = buildIdIndex(SOCIOECONOMIC);

// ── Convenience helpers ──────────────────────────────────────────────────

/** Resolve a region_name to a region_id (returns undefined on miss). */
export function toId(regionName) {
  return NAME_TO_ID.get(regionName);
}

/** Resolve a region_id to a region_name (returns undefined on miss). */
export function toName(regionId) {
  return ID_TO_NAME.get(regionId);
}
