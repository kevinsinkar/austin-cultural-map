// Builds the slim map-shape files the site actually ships.
//
//   node scripts/build_map_shapes.mjs        (or: npm run build:shapes)
//
// Sources of truth (never edited by this script):
//   data/final_updated_regions.js   census-tract polygons, full precision
//   data/neighborhoods_geojson.js   neighborhood polygons (unions of tracts)
//
// Outputs (generated — do not edit by hand, re-run this script instead):
//   data/shapes/tracts.min.json
//   data/shapes/neighborhoods.min.json
//
// Why: the source files are pretty-printed with 15-digit coordinates and
// carry descriptive properties the map never reads. Shipping them inside the
// main script made the first load about 10 MB. Here each polygon is lightly
// simplified (a few metres at most), coordinates are rounded to 5 decimals
// (about 1 m), and only the id the app joins on is kept. The app loads these
// files separately from the main script, after the page has painted.
//
// Re-run after any change to tract or neighborhood geometry.

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { simplify } from "@turf/turf";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "shapes");

// Douglas-Peucker tolerance in degrees. 0.00002° is roughly 2 m in Austin:
// invisible at every zoom level the map allows, and small enough that
// neighbouring tracts do not visibly pull apart along shared edges.
const TOLERANCE = 0.00002;
const DECIMALS = 5;

const load = async (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const round = (n) => Number(n.toFixed(DECIMALS));

function countVertices(geojson) {
  let n = 0;
  const walk = (c) => { if (typeof c[0] === "number") n++; else c.forEach(walk); };
  geojson.features.forEach((f) => walk(f.geometry.coordinates));
  return n;
}

// Round a ring, drop consecutive duplicates, keep it closed.
function cleanRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [round(x), round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push([...out[0]]);
  }
  return out.length >= 4 ? out : null; // a ring needs 3 distinct points + closure
}

function cleanGeometry(geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const cleaned = polys
    .map((poly) => {
      const rings = poly.map(cleanRing);
      if (!rings[0]) return null;      // outer ring collapsed — drop the part
      return rings.filter(Boolean);    // collapsed holes are simply dropped
    })
    .filter(Boolean);
  return { type: "MultiPolygon", coordinates: cleaned };
}

function slim(source, pickProps) {
  const features = source.features.map((f) => {
    const simplified = simplify(
      { type: "Feature", properties: {}, geometry: JSON.parse(JSON.stringify(f.geometry)) },
      { tolerance: TOLERANCE, highQuality: true, mutate: true }
    );
    const geometry = cleanGeometry(simplified.geometry);
    if (!geometry.coordinates.length) {
      throw new Error(`Geometry collapsed for ${JSON.stringify(pickProps(f.properties))}`);
    }
    return { type: "Feature", properties: pickProps(f.properties), geometry };
  });
  return { type: "FeatureCollection", features };
}

function write(name, source, slimmed) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(slimmed));
  const kb = (statSync(path).size / 1024).toFixed(0);
  console.log(
    `${name}: ${slimmed.features.length} features, ` +
    `${countVertices(source).toLocaleString()} -> ${countVertices(slimmed).toLocaleString()} vertices, ${kb} KB`
  );
}

const { REGIONS_GEOJSON } = await load("data/final_updated_regions.js");
const { NEIGHBORHOODS_GEOJSON } = await load("data/neighborhoods_geojson.js");

mkdirSync(OUT_DIR, { recursive: true });

write(
  "tracts.min.json",
  REGIONS_GEOJSON,
  slim(REGIONS_GEOJSON, (p) => ({ region_id: p.region_id }))
);
write(
  "neighborhoods.min.json",
  NEIGHBORHOODS_GEOJSON,
  slim(NEIGHBORHOODS_GEOJSON, (p) => ({
    neighborhood_id: p.neighborhood_id,
    neighborhood_name: p.neighborhood_name,
  }))
);
