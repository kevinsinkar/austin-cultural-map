// Builds the area-name layer: the names that appear on the map and change
// with zoom, each backed by a City of Austin boundary that can be outlined.
//
//   node scripts/build_area_names.mjs        (or: npm run build:areas)
//
// Input:  data/_cached_npa_boundaries.geojson — City of Austin Neighborhood
//         Planning Areas (not in the repo; keep a copy beside the data).
//         data/final_updated_regions.js       — census-tract shapes.
//         data/neighborhoods.js               — the site's tract-built neighborhoods.
// Output: data/shapes/areas.min.json (generated — re-run this script, do not edit).
//
// Three levels, all taken from the City file, none invented here:
//   1  combined planning areas ("East MLK": MLK, MLK-183, Pecan Springs-
//      Springdale) plus planning areas that belong to no combined area
//   2  planning areas ("Holly", "Chestnut", "Rosewood")
//   3  named sub-districts inside a planning area ("Blackland",
//      "Rogers-Washington-Holy Cross"). Sub-districts that are zoning
//      corridors rather than places (a lane, an avenue, an exclusion zone)
//      are left out.
//
// Every area also lists the census tracts it overlaps, because the numbers
// on the site are counted by tract and tracts do not follow these lines.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import * as turf from "@turf/turf";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "_cached_npa_boundaries.geojson");
const OUT_DIR = join(ROOT, "data", "shapes");
const OUT = join(OUT_DIR, "areas.min.json");
const TOLERANCE = 0.00004; // about 4 m: invisible at any zoom the map allows
const DECIMALS = 5;

if (!existsSync(SRC)) {
  console.error("Missing data/_cached_npa_boundaries.geojson (City of Austin Neighborhood Planning Areas).");
  process.exit(2);
}
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
// The data modules import each other without file extensions (Vite resolves
// them); load the three we need by reading the files directly instead.
const readExport = (rel, name) => {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const body = src.replace(/^import\s.*$/gm, "").replace(/^export\s+const\s+/gm, "const ").replace(/^export\s+\{[^}]*\};?\s*$/gm, "").replace(/^export\s+default\s+/gm, "const _default_ = ");
  return new Function(`${body}\nreturn ${name};`)();
};
void load;
const REGIONS_GEOJSON = readExport("data/final_updated_regions.js", "REGIONS_GEOJSON");
const REGION_INDEX = readExport("data/regionIndex.js", "REGION_INDEX");
const NEIGHBORHOODS = readExport("data/neighborhoods.js", "NEIGHBORHOODS");
const npa = JSON.parse(readFileSync(SRC, "utf8"));

// ── Names ───────────────────────────────────────────────────────────────

const KEEP_UPPER = new Set(["UT", "RMMA", "MLK", "I", "II", "III"]);
const SMALL = new Set(["of", "the", "and"]);
const FIXES = [[/\bMckinney\b/g, "McKinney"]];
function displayName(raw) {
  const cap = (part, first) => {
    const up = part.toUpperCase();
    if (KEEP_UPPER.has(up) || /^\d/.test(part)) return up;
    const low = part.toLowerCase();
    if (!first && SMALL.has(low)) return low;
    return low.charAt(0).toUpperCase() + low.slice(1);
  };
  // Capitalize each piece of a hyphenated or slashed name ("Riverside/Oltorf").
  let s = String(raw).trim().split(/\s+/).map((word, i) =>
    word.split("/").map((piece) => piece.split("-").map((part) => cap(part, i === 0)).join("-")).join("/")
  ).join(" ");
  for (const [re, to] of FIXES) s = s.replace(re, to);
  return s;
}
// Two City names are initials. Spell them out on the label; the card keeps
// the City's own name beside it.
const SPELLED_OUT = { RMMA: "Mueller (RMMA)", UT: "University of Texas" };
const CITY_NOTE = {
  RMMA: "The City's name for this planning area is RMMA, for the former Robert Mueller Municipal Airport.",
  UT: "The City's name for this planning area is UT.",
};
// Two combined names run their member areas together with no separator.
const groupName = (raw) => displayName(raw.replace(/\s+Combined\s+NPA$/i, ""))
  .replace(/\s*\/\s*/g, " / ")
  .replace(/^Heritage Hills Windsor Hills$/, "Heritage Hills / Windsor Hills")
  .replace(/^St\. John Coronado Hills$/, "St. John / Coronado Hills");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Sub-districts that name a road or a zoning device, not a place.
const NOT_A_PLACE = /(ZONE|DISTRICT|LANE|DRIVE|AVENUE|LOOP|GATEWAY)$|^SUB-DISTRICT|BLUESTEIN/i;

// ── Geometry helpers ────────────────────────────────────────────────────

function dissolve(features) {
  if (features.length === 1) return features[0];
  let merged = features[0];
  for (let i = 1; i < features.length; i++) {
    try { merged = turf.union(turf.featureCollection([merged, features[i]])) || merged; } catch { /* keep what we have */ }
  }
  return merged;
}
const round = (n) => +n.toFixed(DECIMALS);
function slim(feature) {
  const simple = turf.simplify(feature, { tolerance: TOLERANCE, highQuality: true, mutate: false });
  const fix = (ring) => ring.map(([x, y]) => [round(x), round(y)]);
  const g = simple.geometry;
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(fix) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map(fix)) };
}
function anchor(feature) {
  let pt = turf.centerOfMass(feature);
  if (!turf.booleanPointInPolygon(pt, feature)) pt = turf.pointOnFeature(feature);
  return [round(pt.geometry.coordinates[1]), round(pt.geometry.coordinates[0])];
}

// ── Census tracts, for the "tracts in this area" list ───────────────────

const primaryOf = new Map(REGION_INDEX.map((r) => [r.region_id, r.merge_into ?? r.region_id]));
const tracts = REGIONS_GEOJSON.features
  .filter((f) => primaryOf.has(f.properties.region_id))
  .map((f) => ({ id: primaryOf.get(f.properties.region_id), f, bbox: turf.bbox(f), area: turf.area(f) }));
const bboxHit = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** [[region_id, % of this area the tract makes up, % of the tract inside it]], largest first. */
function tractsIn(feature) {
  const area = turf.area(feature);
  const bbox = turf.bbox(feature);
  const byId = new Map();
  for (const t of tracts) {
    if (!bboxHit(bbox, t.bbox)) continue;
    let inter = 0;
    try { const x = turf.intersect(turf.featureCollection([feature, t.f])); if (x) inter = turf.area(x); } catch { /* skip */ }
    if (!inter) continue;
    const cur = byId.get(t.id) || { inter: 0, tractArea: 0 };
    cur.inter += inter; cur.tractArea += t.area;
    byId.set(t.id, cur);
  }
  return [...byId].map(([id, v]) => [id, Math.round(v.inter / area * 100), Math.round(v.inter / v.tractArea * 100)])
    .filter(([, ofArea, ofTract]) => ofArea >= 5 || ofTract >= 50)
    .sort((a, b) => b[1] - a[1]);
}

// ── Assemble ────────────────────────────────────────────────────────────

const byArea = new Map();   // planning-area raw name -> features
const byGroup = new Map();  // combined raw name -> Set of planning-area raw names
for (const f of npa.features) {
  const p = f.properties;
  if (!p.planning_area_name) continue;
  if (!byArea.has(p.planning_area_name)) byArea.set(p.planning_area_name, []);
  byArea.get(p.planning_area_name).push(f);
  if (p.combined === "YES" && /Combined NPA$/i.test(p.combined_npa || "")) {
    if (!byGroup.has(p.combined_npa)) byGroup.set(p.combined_npa, new Set());
    byGroup.get(p.combined_npa).add(p.planning_area_name);
  }
}
const groupOf = new Map();
for (const [g, names] of byGroup) for (const n of names) groupOf.set(n, g);

const hoodByName = new Map(NEIGHBORHOODS.map((h) => [h.name.toLowerCase(), h]));
const features = [];
const make = (id, name, level, shape, extra) => {
  const [lat, lng] = anchor(shape);
  features.push({
    type: "Feature",
    properties: { id, name, level, lat, lng, km2: +(turf.area(shape) / 1e6).toFixed(2), tracts: tractsIn(shape), ...extra },
    geometry: slim(shape),
  });
};

for (const [raw, names] of byGroup) {
  const id = `g-${slug(groupName(raw))}`;
  const shape = dissolve([...names].flatMap((n) => byArea.get(n)));
  make(id, groupName(raw), 1, shape, { kind: "combined", children: [...names].map((n) => `a-${slug(displayName(n))}`).sort() });
}
for (const [raw, parts] of byArea) {
  const plain = displayName(raw);
  const id = `a-${slug(plain)}`;
  const shape = dissolve(parts);
  const group = groupOf.get(raw);
  const subs = parts.filter((f) => f.properties.neighborhood_sub_district && f.properties.neighborhood_sub_district !== "NONE" && !NOT_A_PLACE.test(f.properties.neighborhood_sub_district));
  const hood = hoodByName.get(plain.toLowerCase());
  let hoodInfo = null;
  if (hood) {
    const hoodTracts = new Set(hood.tract_ids);
    let inter = 0;
    for (const t of tracts) {
      if (!hoodTracts.has(t.id)) continue;
      try { const x = turf.intersect(turf.featureCollection([shape, t.f])); if (x) inter += turf.area(x); } catch { /* skip */ }
    }
    hoodInfo = { id: hood.id, tracts: hood.tract_ids.length, covers: Math.round(inter / turf.area(shape) * 100) };
  }
  make(id, SPELLED_OUT[plain] || plain, 2, shape, {
    kind: "area",
    top: !group, // shown with the combined areas when zoomed out
    parent: group ? `g-${slug(groupName(group))}` : null,
    children: subs.map((f) => `s-${slug(displayName(f.properties.neighborhood_sub_district))}`).sort(),
    note: CITY_NOTE[plain] || null,
    hood: hoodInfo,
  });
  for (const f of subs) {
    const subName = displayName(f.properties.neighborhood_sub_district);
    make(`s-${slug(subName)}`, subName, 3, f, { kind: "sub", parent: id });
  }
}

const ids = features.map((f) => f.properties.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) { console.error("Duplicate area ids:", dupes.join(", ")); process.exit(1); }

features.sort((a, b) => a.properties.level - b.properties.level || b.properties.km2 - a.properties.km2);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features }));

// A small name list for the search box, so searching does not need the shapes.
const nameOf = new Map(features.map((f) => [f.properties.id, f.properties.name]));
const detail = (p) => {
  if (p.level === 1) return `Combined planning area: ${p.children.map((id) => nameOf.get(id)).join(", ")}`;
  if (p.level === 3) return `Part of ${nameOf.get(p.parent)}`;
  return "City planning area";
};
const list = features
  .map((f) => f.properties)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((p) => `  ${JSON.stringify({ id: p.id, name: p.name, level: p.level, detail: detail(p) })},`);
writeFileSync(join(ROOT, "data", "areaNames.js"), [
  "// Auto-generated by scripts/build_area_names.mjs — do not edit by hand.",
  "// City of Austin planning areas, combined planning areas and named",
  "// sub-districts: the names the map shows and the search box can find.",
  "// Their boundaries are in data/shapes/areas.min.json.",
  "export const AREA_NAMES = [",
  ...list,
  "];",
  "",
].join("\n"));
const count = (lvl) => features.filter((f) => f.properties.level === lvl).length;
console.log(`data/shapes/areas.min.json: ${count(1)} combined areas, ${count(2)} planning areas (${features.filter((f) => f.properties.top).length} stand alone), ${count(3)} sub-districts, ${(readFileSync(OUT).length / 1024).toFixed(0)} KB`);
console.log("combined:", features.filter((f) => f.properties.level === 1).map((f) => f.properties.name).join(" | "));
console.log("sub-districts:", features.filter((f) => f.properties.level === 3).map((f) => f.properties.name).join(" | "));
