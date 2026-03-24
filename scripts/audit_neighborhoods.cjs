// audit_neighborhoods.cjs
// Audits neighborhood assignments for non-contiguous tracts.
// Usage: node scripts/audit_neighborhoods.cjs
//
// Outputs: neighborhood_audit.txt

const fs = require("fs");
const path = require("path");

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

// ── Haversine ────────────────────────────────────────────────────────────

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

// ── Build region lookup ──────────────────────────────────────────────────

const regionById = new Map(REGION_INDEX.map(r => [r.region_id, r]));

// ── Audit each neighborhood ─────────────────────────────────────────────

const SPREAD_THRESHOLD = 4; // km — flag if max spread exceeds this
const ORPHAN_THRESHOLD = 2; // km — a tract is an orphan if its nearest neighbor in the same hood is > this

const lines = [];
const flagged = [];

lines.push("NEIGHBORHOOD CONTIGUITY AUDIT");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Spread threshold: ${SPREAD_THRESHOLD} km`);
lines.push(`Orphan threshold: ${ORPHAN_THRESHOLD} km`);
lines.push(`Total neighborhoods: ${NEIGHBORHOODS.length}`);
lines.push(`Total tracts: ${REGION_INDEX.filter(r => !r.merge_into).length}`);
lines.push("");
lines.push("=".repeat(80));
lines.push("");

for (const hood of NEIGHBORHOODS) {
  const tracts = hood.tract_ids
    .map(id => regionById.get(id))
    .filter(Boolean);

  if (tracts.length < 2) continue; // Single-tract neighborhoods can't be non-contiguous

  // Compute max spread (max pairwise distance)
  let maxDist = 0;
  let maxPair = [null, null];
  for (let i = 0; i < tracts.length; i++) {
    for (let j = i + 1; j < tracts.length; j++) {
      const d = haversineKm(tracts[i].lat, tracts[i].lng, tracts[j].lat, tracts[j].lng);
      if (d > maxDist) {
        maxDist = d;
        maxPair = [tracts[i], tracts[j]];
      }
    }
  }

  if (maxDist <= SPREAD_THRESHOLD) continue; // Not flagged

  // Find orphan tracts: tracts whose nearest neighbor in the same hood is > ORPHAN_THRESHOLD
  const orphans = [];
  for (const tract of tracts) {
    let nearestDist = Infinity;
    let nearestTract = null;
    for (const other of tracts) {
      if (other.region_id === tract.region_id) continue;
      const d = haversineKm(tract.lat, tract.lng, other.lat, other.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestTract = other;
      }
    }
    if (nearestDist > ORPHAN_THRESHOLD) {
      orphans.push({
        tract,
        nearestDist,
        nearestTract,
      });
    }
  }

  const entry = {
    name: hood.name,
    id: hood.id,
    source: hood.source,
    tractCount: tracts.length,
    maxSpread: maxDist,
    maxPair,
    orphans,
  };
  flagged.push(entry);

  lines.push(`FLAGGED: ${hood.name}`);
  lines.push(`  ID: ${hood.id}`);
  lines.push(`  Source: ${hood.source}`);
  lines.push(`  Tracts: ${tracts.length}`);
  lines.push(`  Max spread: ${maxDist.toFixed(2)} km`);
  lines.push(`  Max pair: ${maxPair[0].display_name} (id ${maxPair[0].region_id}) <-> ${maxPair[1].display_name} (id ${maxPair[1].region_id})`);

  // List all tracts with coordinates
  lines.push(`  All tracts:`);
  for (const t of tracts) {
    const isOrphan = orphans.some(o => o.tract.region_id === t.region_id);
    lines.push(`    ${isOrphan ? "*** " : "    "}id ${t.region_id}: ${t.display_name} (${t.lat.toFixed(4)}, ${t.lng.toFixed(4)})${isOrphan ? " ← ORPHAN" : ""}`);
  }

  if (orphans.length > 0) {
    lines.push(`  Orphan tracts (nearest neighbor > ${ORPHAN_THRESHOLD} km):`);
    for (const o of orphans) {
      lines.push(`    id ${o.tract.region_id}: ${o.tract.display_name}`);
      lines.push(`      Nearest in hood: ${o.nearestTract.display_name} (id ${o.nearestTract.region_id}) at ${o.nearestDist.toFixed(2)} km`);
    }
  } else {
    lines.push(`  No orphan tracts (all within ${ORPHAN_THRESHOLD} km of at least one neighbor)`);
  }

  lines.push("");
}

// ── Summary ──────────────────────────────────────────────────────────────

lines.push("=".repeat(80));
lines.push("");
lines.push("SUMMARY");
lines.push(`  Neighborhoods audited: ${NEIGHBORHOODS.length}`);
lines.push(`  Flagged (spread > ${SPREAD_THRESHOLD} km): ${flagged.length}`);
lines.push(`  Total orphan tracts: ${flagged.reduce((s, f) => s + f.orphans.length, 0)}`);
lines.push("");
lines.push("FLAGGED NEIGHBORHOODS (sorted by max spread):");
flagged.sort((a, b) => b.maxSpread - a.maxSpread);
for (const f of flagged) {
  lines.push(`  ${f.maxSpread.toFixed(1).padStart(6)} km | ${f.tractCount.toString().padStart(3)} tracts | ${f.orphans.length.toString().padStart(2)} orphans | ${f.name} [${f.source}]`);
}

// ── Write ────────────────────────────────────────────────────────────────

const report = lines.join("\n");
const outPath = path.join(__dirname, "..", "neighborhood_audit.txt");
fs.writeFileSync(outPath, report, "utf-8");
console.log(report);
console.log(`\nReport saved to: ${outPath}`);
