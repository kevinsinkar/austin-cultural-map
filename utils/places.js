// ── One naming rule for every place the site shows ──
//
// A "place" is either a census tract or a neighborhood (a named group of
// tracts). Every panel, card, tooltip and search result gets its title from
// here, so a place is called the same thing everywhere.
//
// Titles never show internal ids. A tract gets a neighborhood name only
// where a City of Austin planning-area polygon supports it (see
// scripts/build_place_names.mjs); otherwise it is "Census tract N".

import { PLACE_NAMES } from "../data/placeNames";
import { REGION_INDEX, regionLookupMap } from "../data/regionIndex";
import { MERGE_LOOKUP } from "../data/regionLookup";
import { NEIGHBORHOODS, NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import { COUNCIL_DISTRICTS_GEOJSON } from "../data/councilDistricts";
import { findDistrict } from "./geo";

/** "Tract 407.0" -> "407", "Tract 8.03" -> "8.03". */
export function tractNumber(regionId) {
  const label = regionLookupMap.get(regionId)?.tract_label || "";
  const num = label.replace(/^Tract\s+/i, "").replace(/\.0$/, "");
  return num || null;
}

/** "Census tract 8.03" (falls back to a neutral label if the number is missing). */
export function tractLabel(regionId) {
  const num = tractNumber(regionId);
  return num ? `Census tract ${num}` : "Census tract";
}

function basisNote(entry) {
  if (!entry) {
    return "No City of Austin planning area covers most of this tract, so it is listed by its census tract number.";
  }
  const [[a, aPct], second] = entry.areas;
  if (entry.basis === "named") return `Inside the City of Austin's ${a} planning area.`;
  if (entry.basis === "split") {
    return `This tract straddles two City planning areas: ${a} (${aPct}%) and ${second[0]} (${second[1]}%).`;
  }
  return `About ${aPct}% of this tract lies in the City of Austin's ${a} planning area.`;
}

const districtCache = new Map();
/** Council district containing the tract's center point, or null. */
export function tractDistrict(regionId) {
  if (districtCache.has(regionId)) return districtCache.get(regionId);
  const r = regionLookupMap.get(regionId);
  const d = r ? findDistrict(r.lat, r.lng, COUNCIL_DISTRICTS_GEOJSON) : null;
  districtCache.set(regionId, d);
  return d;
}

/**
 * Display identity of a census tract.
 * @returns {{ kind:"tract", id:number, title:string, subtitle:string, basis:string, note:string, district:number|null }|null}
 */
export function tractPlace(regionId) {
  if (!regionLookupMap.has(regionId)) return null;
  // Merged secondary tracts take the name of the tract they were merged into.
  const entry = PLACE_NAMES[regionId] || PLACE_NAMES[MERGE_LOOKUP.get(regionId)] || null;
  const census = tractLabel(regionId);
  return {
    kind: "tract",
    id: regionId,
    title: entry ? entry.title : census,
    // The census number is always available as the secondary line.
    subtitle: entry ? census : "",
    basis: entry ? entry.basis : "census",
    note: basisNote(entry),
    district: tractDistrict(regionId),
  };
}

/** Display identity of a neighborhood (a group of one or more tracts). */
export function neighborhoodPlace(neighborhoodId) {
  const hood = NEIGHBORHOOD_BY_ID.get(neighborhoodId);
  if (!hood) return null;
  // A "neighborhood" that is really one unnamed tract reads as that tract.
  if (hood.source === "census-tract" && hood.tract_ids.length === 1) {
    return { ...tractPlace(hood.tract_ids[0]), kind: "neighborhood", id: hood.id, tractIds: hood.tract_ids };
  }
  const n = hood.tract_ids.length;
  const districts = [...new Set(hood.tract_ids.map(tractDistrict).filter((d) => d != null))].sort((a, b) => a - b);
  return {
    kind: "neighborhood",
    id: hood.id,
    title: hood.name,
    subtitle: n === 1 ? tractLabel(hood.tract_ids[0]) : `${n} census tracts combined`,
    basis: "named",
    note: n === 1
      ? `Inside the City of Austin's ${hood.name} planning area.`
      : `The ${n} census tracts that sit at least 80% inside the City of Austin's ${hood.name} planning area, combined.`,
    district: districts.length === 1 ? districts[0] : null,
    districts,
    tractIds: hood.tract_ids,
  };
}

/** "Council District 1" / "Council Districts 1 and 3" / "" for a place. */
export function districtText(place) {
  const list = place?.districts?.length ? place.districts : place?.district != null ? [place.district] : [];
  if (!list.length) return "";
  if (list.length === 1) return `Council District ${list[0]}`;
  return `Council Districts ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

// ── Search index: every selectable place, labelled the way it is titled ──

let searchIndexCache = null;
export function placeSearchIndex() {
  if (searchIndexCache) return searchIndexCache;
  const items = [];
  // Named, multi-tract neighborhoods first: they are what people type.
  NEIGHBORHOODS.filter((h) => h.source !== "census-tract").forEach((h) => {
    const p = neighborhoodPlace(h.id);
    items.push({
      key: `hood:${h.id}`, kind: "neighborhood", id: h.id,
      label: p.title, detail: p.subtitle, haystack: p.title.toLowerCase(),
    });
  });
  REGION_INDEX.filter((r) => !r.merge_into).forEach((r) => {
    const p = tractPlace(r.region_id);
    const census = tractLabel(r.region_id);
    items.push({
      key: `tract:${r.region_id}`, kind: "tract", id: r.region_id,
      label: p.title, detail: p.subtitle || districtText(p),
      // "tract 8.03" and "8.03" should both find it
      haystack: `${p.title} ${census} ${tractNumber(r.region_id) || ""}`.toLowerCase(),
    });
  });
  searchIndexCache = items;
  return items;
}
