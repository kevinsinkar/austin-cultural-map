// ── Shareable URL state ──
// Serializes the consolidated view state to the URL hash and hydrates it
// back on load, so a pasted link reproduces the exact view (tab, year,
// layers, selection, compare pair, triage lens). Hash-based on purpose:
// GitHub Pages has no server routing, but "#/map?year=2005" always works.

import { REGION_INDEX } from "../data";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import { NAME_TO_ID } from "../data/regionLookup";
import { ALLOWED_VIEWS, PRESENTER_MODE } from "../appConfig";

// Only views this build allows are routable — a public build ignores
// "#/triage" and friends and falls back to the map.
const VIEWS = ALLOWED_VIEWS;
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
  ["outreach", "events"],
  ["districts", "cd"],
];

export const DEFAULT_VIEW_STATE = {
  viewMode: "map",
  // Open on the latest measured year: the present is the way in, and the
  // slider then walks back through how it got here.
  year: 2023,
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
    outreach: true,
    // Council-district outlines are a planning aid. They start on for the
    // presenter and off on the public map, where they compete with the colors.
    districts: PRESENTER_MODE,
  },
  activeRegionId: null,
  activeNeighborhoodId: null,
  // Must be display names that exist in data/regionLookup.js NAME_TO_ID
  // (ComparisonView falls back to these if a saved name ever disappears).
  compA: "Central East Austin",
  compB: "Holly",
  triageLens: "equity",
};

export function serializeViewState(s) {
  // A story card gets a short address that names only its place, so it is
  // easy to share, print or turn into a QR code: "#/card?tract=84".
  if (s.viewMode === "card") {
    if (s.boundaryMode === "neighborhoods" && s.activeNeighborhoodId != null) {
      return `#/card?hood=${encodeURIComponent(s.activeNeighborhoodId)}`;
    }
    if (s.activeRegionId != null) return `#/card?tract=${s.activeRegionId}`;
  }
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

  // A neighborhood in the address implies the neighborhood view, so the
  // short story-card address ("#/card?hood=montopolis") needs no "bm=".
  if (p.has("hood") && NEIGHBORHOOD_BY_ID.has(p.get("hood"))) {
    out.activeNeighborhoodId = p.get("hood");
    out.boundaryMode = "neighborhoods";
  } else if (out.activeRegionId != null && path === "card") {
    out.boundaryMode = "tracts";
  }

  // A story-card address that names no known place opens the map instead.
  if (out.viewMode === "card" && out.activeRegionId == null && out.activeNeighborhoodId == null) {
    out.viewMode = "map";
  }

  if (p.has("a") && NAME_TO_ID.has(p.get("a"))) out.compA = p.get("a");
  if (p.has("b") && NAME_TO_ID.has(p.get("b"))) out.compB = p.get("b");

  if (LENSES.includes(p.get("lens"))) out.triageLens = p.get("lens");

  return out;
}
