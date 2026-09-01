// assign_names_by_area.cjs
// For each census tract, computes the % of the tract's area covered by each
// City of Austin NPA polygon. The NPA with the MAJORITY of the tract's area
// is the authoritative neighborhood name for that tract.
// Usage: node scripts/assign_names_by_area.cjs
// Output: data/audit_output/tract_npa_overlap.json

const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_DIR = path.join(DATA_DIR, "audit_output");
const OUT_PATH = path.join(OUT_DIR, "tract_npa_overlap.json");

function loadESM(filePath, exportNames) {
  let src = fs.readFileSync(filePath, "utf-8");
  src = src.replace(/^import\s+.*?;\s*$/gm, "");
  src = src.replace(/^export\s+const\s+/gm, "const ");
  src = src.replace(/^export\s+\{[^}]*\};\s*$/gm, "");
  const names = Array.isArray(exportNames) ? exportNames : [exportNames];
  const returnObj = names.map(n => `"${n}": typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ");
  const fn = new Function(src + `\nreturn { ${returnObj} };`);
  return fn();
}

const ACRONYMS = { ut: "UT", rmma: "RMMA", mlk: "MLK", "mlk-183": "MLK-183" };

function titleCase(str) {
  const small = new Set(["of", "the", "and", "in", "at", "de", "del", "la", "las", "los"]);
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (ACRONYMS[w]) return ACRONYMS[w];
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

console.log("Loading data...");
const { REGION_INDEX } = loadESM(path.join(DATA_DIR, "regionIndex.js"), ["REGION_INDEX"]);
const { REGIONS_GEOJSON } = loadESM(path.join(DATA_DIR, "final_updated_regions.js"), ["REGIONS_GEOJSON"]);
const npa = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "_cached_npa_boundaries.geojson"), "utf-8"));
console.log(`  ${REGION_INDEX.length} regions, ${REGIONS_GEOJSON.features.length} tract polygons, ${npa.features.length} NPA polygons`);

const featureById = new Map(REGIONS_GEOJSON.features.map(f => [f.properties.region_id, f]));

// Pre-compute NPA bboxes for cheap rejection
const npaEntries = npa.features.map(f => ({
  name: titleCase(f.properties.planning_area_name),
  feature: f,
  bbox: turf.bbox(f),
})).filter(e => e.name);

function bboxOverlaps(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

const results = [];
let processed = 0;

for (const region of REGION_INDEX) {
  if (region.merge_into) continue; // secondaries follow their primary
  const tract = featureById.get(region.region_id);
  if (!tract) {
    results.push({ region_id: region.region_id, error: "no geometry" });
    continue;
  }

  let tractArea;
  try {
    tractArea = turf.area(tract);
  } catch (e) {
    results.push({ region_id: region.region_id, error: `area failed: ${e.message}` });
    continue;
  }
  const tractBbox = turf.bbox(tract);

  // Sum overlap per NPA NAME — the same planning area can span multiple
  // polygons (subdistricts), which must count as one neighborhood
  const overlapByName = new Map();
  for (const entry of npaEntries) {
    if (!bboxOverlaps(tractBbox, entry.bbox)) continue;
    try {
      const inter = turf.intersect(turf.featureCollection([tract, entry.feature]));
      if (inter) {
        const pct = (turf.area(inter) / tractArea) * 100;
        if (pct > 0.5) overlapByName.set(entry.name, (overlapByName.get(entry.name) || 0) + pct);
      }
    } catch (e) { /* invalid geometry pair — skip */ }
  }
  const overlaps = [...overlapByName.entries()]
    .map(([npa, pct]) => ({ npa, pct: +pct.toFixed(1) }))
    .sort((a, b) => b.pct - a.pct);

  const totalCovered = overlaps.reduce((s, o) => s + o.pct, 0);
  const majority = overlaps.length > 0 && overlaps[0].pct >= 50 ? overlaps[0] : null;

  results.push({
    region_id: region.region_id,
    tract_label: region.tract_label,
    current_name: region.region_name,
    current_display: region.display_name,
    lat: region.lat,
    lng: region.lng,
    npa_overlaps: overlaps.slice(0, 4),
    npa_coverage_pct: +totalCovered.toFixed(1),
    majority_npa: majority ? majority.npa : null,
    majority_pct: majority ? majority.pct : null,
    verdict: majority
      ? (majority.npa.toLowerCase() === region.region_name.toLowerCase() ? "confirmed" : "rename")
      : (totalCovered < 20 ? "outside-npa" : "ambiguous"),
  });

  processed++;
  if (processed % 50 === 0) console.log(`  ...${processed} tracts processed`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2), "utf-8");

const counts = {};
for (const r of results) counts[r.verdict || "error"] = (counts[r.verdict || "error"] || 0) + 1;
console.log("\n=== Verdicts ===");
for (const [v, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v}: ${c}`);
}
console.log(`\nWrote ${OUT_PATH}`);
