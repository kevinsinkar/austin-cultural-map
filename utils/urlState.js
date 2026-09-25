// ── Shareable URL state ──
// Serializes the consolidated view state to the URL hash and hydrates it
// back on load, so a pasted link reproduces the exact view (tab, year,
// layers, selection, compare pair, triage lens). Hash-based on purpose:
// GitHub Pages has no server routing, but "#/map?year=2005" always works.

import { REGION_INDEX } from "../data";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import { NAME_TO_ID } from "../data/regionLookup";

const VIEWS = ["map", "history", "compare", "triage", "timeline"];
const LENSES = ["trajectory", "equity", "matrix"];

// [state key in layers, short URL code]
const LAYER_CODES = [
  ["pins", "biz"],
  ["projectConnect", "pc"],
  ["musicVenues", "music"],
  ["devPressure", "dev"],
  ["regions", "bounds"],
  ["preservationAustin", "pa"],
  ["aisdSchools", "aisd"],
  ["holc", "holc"],
];

export const DEFAULT_VIEW_STATE = {
  viewMode: "map",
  year: 2010,
  boundaryMode: "tracts",
  layers: {
    pins: true,
    projectConnect: false,
    musicVenues: false,
    devPressure: false,
    regions: true,
    preservationAustin: false,
    aisdSchools: false,
    holc: false,
  },
  activeRegionId: null,
  activeNeighborhoodId: null,
  compA: "East 11th Street",
  compB: "East Cesar Chavez -Holly",
  triageLens: "equity",
};

export function serializeViewState(s) {
  const p = new URLSearchParams();
  p.set("year", String(s.year));
  if (s.boundaryMode !== "tracts") p.set("bm", s.boundaryMode);
  // Always serialize the on-list so "all layers off" is representable
  p.set("layers", LAYER_CODES.filter(([k]) => s.layers[k]).map(([, c]) => c).join("."));
  if (s.boundaryMode === "tracts" && s.activeRegionId != null) {
    p.set("tract", String(s.activeRegionId));
  }
  if (s.boundaryMode === "neighborhoods" && s.activeNeighborhoodId != null) {
    p.set("hood", s.activeNeighborhoodId);
  }
  if (s.compA !== DEFAULT_VIEW_STATE.compA) p.set("a", s.compA);
  if (s.compB !== DEFAULT_VIEW_STATE.compB) p.set("b", s.compB);
  if (s.triageLens !== DEFAULT_VIEW_STATE.triageLens) p.set("lens", s.triageLens);
  return `#/${s.viewMode}?${p.toString()}`;
}

/**
 * Parse a location hash into a partial view state. Returns null when the
 * hash carries no state; every field is validated against known values so
 * a mangled link degrades to defaults instead of a broken view.
 */
export function parseViewState(hash) {
  if (!hash || !hash.startsWith("#/")) return null;
  const [path, query = ""] = hash.slice(2).split("?");
  const p = new URLSearchParams(query);
  const out = {};

  if (VIEWS.includes(path)) out.viewMode = path;

  if (p.has("year")) {
    const y = parseInt(p.get("year"), 10);
    if (!Number.isNaN(y)) out.year = Math.min(2025, Math.max(1990, y));
  }

  if (p.get("bm") === "neighborhoods") out.boundaryMode = "neighborhoods";

  if (p.has("layers")) {
    const on = new Set(p.get("layers").split(".").filter(Boolean));
    out.layers = Object.fromEntries(LAYER_CODES.map(([k, c]) => [k, on.has(c)]));
  }

  if (p.has("tract")) {
    const id = parseInt(p.get("tract"), 10);
    if (REGION_INDEX.some((r) => r.region_id === id)) out.activeRegionId = id;
  }

  if (p.has("hood") && NEIGHBORHOOD_BY_ID.has(p.get("hood"))) {
    out.activeNeighborhoodId = p.get("hood");
  }

  if (p.has("a") && NAME_TO_ID.has(p.get("a"))) out.compA = p.get("a");
  if (p.has("b") && NAME_TO_ID.has(p.get("b"))) out.compB = p.get("b");

  if (LENSES.includes(p.get("lens"))) out.triageLens = p.get("lens");

  return out;
}
