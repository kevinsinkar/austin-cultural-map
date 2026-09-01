// audit_neighborhoods.cjs
// Audits neighborhood assignments for true contiguity: every neighborhood
// must form a single connected component by POLYGON ADJACENCY (tract
// boundaries touching), not just centroid proximity.
// Usage: node scripts/audit_neighborhoods.cjs
//
// Outputs: neighborhood_audit.txt

const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

const DATA_DIR = path.join(__dirname, "..", "data");

// ── Load ESM modules in CJS ──────────────────────────────────────────────

function loadESM(filePath, exportNames) {
  let src = fs.readFileSync(filePath, "utf-8");
  src = src.replace(/^import\s+.*?;\s*$/gm, "");
  src = src.replace(/^export\s+const\s+/gm, "const ");
  src = src.replace(/^export\s+\{[^}]*\};\s*$/gm, "");
  src = src.replace(/^export\s+default\s+/gm, "const _default_ = ");
  const names = Array.isArray(exportNames) ? exportNames : [exportNames];
  const returnObj = names.map(n => `"${n}": typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ");
  const fn = new Function(src + `\nreturn { ${returnObj} };`);
  return fn();
}

const { REGION_INDEX } = loadESM(
  path.join(DATA_DIR, "regionIndex.js"),
  ["REGION_INDEX"]
);

const { NEIGHBORHOODS } = loadESM(
  path.join(DATA_DIR, "neighborhoods.js"),
  ["NEIGHBORHOODS"]
);

console.log("Loading REGIONS_GEOJSON (this may take a moment)...");
const { REGIONS_GEOJSON } = loadESM(
  path.join(DATA_DIR, "final_updated_regions.js"),
  ["REGIONS_GEOJSON"]
);
console.log(`Loaded ${REGIONS_GEOJSON.features.length} tract features\n`);

// ── Helpers ──────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const regionById = new Map(REGION_INDEX.map(r => [r.region_id, r]));
const featureById = new Map(
  REGIONS_GEOJSON.features.map(f => [f.properties.region_id, f])
);

// primary_id → [secondary_ids] for merged tracts
const mergedSecondaries = new Map();
REGION_INDEX.filter(r => r.merge_into).forEach(r => {
  if (!mergedSecondaries.has(r.merge_into)) mergedSecondaries.set(r.merge_into, []);
  mergedSecondaries.get(r.merge_into).push(r.region_id);
});

function footprintFeatures(regionId) {
  const ids = [regionId, ...(mergedSecondaries.get(regionId) || [])];
  return ids.map(id => featureById.get(id)).filter(Boolean);
}

// Must match GAP_TOLERANCE_KM in build_neighborhoods.cjs
const GAP_TOLERANCE_KM = 0.05;
const adjacencyCache = new Map();

function tractsAdjacent(idA, idB) {
  const key = idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  if (adjacencyCache.has(key)) return adjacencyCache.get(key);

  const a = regionById.get(idA);
  const b = regionById.get(idB);
  if (a && b && haversineKm(a.lat, a.lng, b.lat, b.lng) > 15) {
    adjacencyCache.set(key, false);
    return false;
  }

  const featsA = footprintFeatures(idA);
  const featsB = footprintFeatures(idB);
  let touching = false;
  outer:
  for (const fa of featsA) {
    for (const fb of featsB) {
      try {
        if (turf.booleanIntersects(fa, fb)) { touching = true; break outer; }
        const buffered = turf.buffer(fa, GAP_TOLERANCE_KM, { units: "kilometers" });
        if (buffered && turf.booleanIntersects(buffered, fb)) { touching = true; break outer; }
      } catch (e) { /* invalid geometry — treat as not touching */ }
    }
  }
  adjacencyCache.set(key, touching);
  return touching;
}

function connectedComponents(tractIds) {
  const remaining = new Set(tractIds);
  const components = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value;
    const comp = [seed];
    remaining.delete(seed);
    const queue = [seed];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const other of [...remaining]) {
        if (tractsAdjacent(cur, other)) {
          remaining.delete(other);
          comp.push(other);
          queue.push(other);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

// ── Audit each neighborhood ─────────────────────────────────────────────

const lines = [];
const flagged = [];
let missingGeometry = 0;

lines.push("NEIGHBORHOOD CONTIGUITY AUDIT (polygon adjacency)");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Adjacency test: turf.booleanIntersects with ${GAP_TOLERANCE_KM * 1000} m gap tolerance`);
lines.push(`Total neighborhoods: ${NEIGHBORHOODS.length}`);
lines.push(`Total tracts: ${REGION_INDEX.filter(r => !r.merge_into).length}`);
lines.push("");
lines.push("=".repeat(80));
lines.push("");

for (const hood of NEIGHBORHOODS) {
  if (hood.tract_ids.length < 2) continue; // single-tract can't be non-contiguous

  // Sanity: every tract needs geometry
  const noGeom = hood.tract_ids.filter(id => footprintFeatures(id).length === 0);
  if (noGeom.length > 0) {
    missingGeometry += noGeom.length;
    lines.push(`WARNING: ${hood.name} — no geometry for tract(s) ${noGeom.join(", ")}`);
  }

  const components = connectedComponents(hood.tract_ids);
  if (components.length === 1) continue; // contiguous — OK

  // Max spread for context
  const tracts = hood.tract_ids.map(id => regionById.get(id)).filter(Boolean);
  let maxDist = 0;
  for (let i = 0; i < tracts.length; i++) {
    for (let j = i + 1; j < tracts.length; j++) {
      maxDist = Math.max(maxDist, haversineKm(tracts[i].lat, tracts[i].lng, tracts[j].lat, tracts[j].lng));
    }
  }

  flagged.push({
    name: hood.name,
    id: hood.id,
    source: hood.source,
    tractCount: hood.tract_ids.length,
    components,
    maxSpread: maxDist,
  });

  lines.push(`FLAGGED: ${hood.name} — ${components.length} disconnected components`);
  lines.push(`  ID: ${hood.id}`);
  lines.push(`  Source: ${hood.source}`);
  lines.push(`  Tracts: ${hood.tract_ids.length} | Max spread: ${maxDist.toFixed(2)} km`);
  components.forEach((comp, i) => {
    lines.push(`  Component ${i + 1} (${comp.length} tract${comp.length !== 1 ? "s" : ""}):`);
    for (const tid of comp) {
      const t = regionById.get(tid);
      lines.push(`    id ${tid}: ${t?.display_name ?? "?"} (${t?.lat.toFixed(4)}, ${t?.lng.toFixed(4)})`);
    }
  });
  lines.push("");
}

// ── Summary ──────────────────────────────────────────────────────────────

lines.push("=".repeat(80));
lines.push("");
lines.push("SUMMARY");
lines.push(`  Neighborhoods audited: ${NEIGHBORHOODS.length}`);
lines.push(`  Multi-tract neighborhoods: ${NEIGHBORHOODS.filter(n => n.tract_ids.length > 1).length}`);
lines.push(`  NON-CONTIGUOUS (flagged): ${flagged.length}`);
lines.push(`  Tracts with missing geometry: ${missingGeometry}`);
lines.push("");
if (flagged.length === 0) {
  lines.push("  ✓ All multi-tract neighborhoods are contiguous (boundaries touching).");
} else {
  lines.push("FLAGGED NEIGHBORHOODS:");
  flagged.sort((a, b) => b.components.length - a.components.length);
  for (const f of flagged) {
    lines.push(`  ${f.components.length} components | ${f.tractCount.toString().padStart(3)} tracts | ${f.maxSpread.toFixed(1).padStart(5)} km spread | ${f.name} [${f.source}]`);
  }
  lines.push("");
  lines.push("  Run: node scripts/build_neighborhoods.cjs to re-enforce contiguity.");
}

// ── Write ────────────────────────────────────────────────────────────────

const report = lines.join("\n");
const outPath = path.join(__dirname, "..", "neighborhood_audit.txt");
fs.writeFileSync(outPath, report, "utf-8");
console.log(report);
console.log(`\nReport saved to: ${outPath}`);
