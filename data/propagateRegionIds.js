/**
 * propagateRegionIds.js
 * ---------------------
 * Reads the source of truth (final_updated_regions.js) and propagates
 * region_id into every downstream data file that references regions by name.
 *
 * Usage:  node data/propagateRegionIds.js
 *
 * What it does:
 *   1. Parses final_updated_regions.js to build  region_name → region_id  map
 *   2. Adds / updates  region_id  in:
 *        - data/interim_demographics.json
 *        - data/interim_property.json
 *        - data/interim_socioeconomic.json
 *   3. Re-writes data/businesses.js with  region_id  injected into every
 *      LEGACY_OPERATING and LEGACY_CLOSED entry.
 *
 * Re-run this script any time you change region names or IDs in
 * final_updated_regions.js – downstream files will stay in sync.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;

// ── 1. Build the authoritative  name → id  map ─────────────────────────
const regionsSource = readFileSync(
  resolve(DATA_DIR, "final_updated_regions.js"),
  "utf8"
);

const NAME_TO_ID = new Map();
const idRegex = /"region_id":\s*(\d+),\s*"region_name":\s*"([^"]+)"/g;
let m;
while ((m = idRegex.exec(regionsSource)) !== null) {
  NAME_TO_ID.set(m[2], Number(m[1]));
}

console.log(`[source of truth] ${NAME_TO_ID.size} regions loaded.\n`);

// ── 2. Helper – inject region_id into a JSON array file ─────────────────
function patchJsonFile(relPath) {
  const absPath = resolve(DATA_DIR, relPath);
  const data = JSON.parse(readFileSync(absPath, "utf8"));

  let patched = 0;
  let unmatched = [];

  for (const row of data) {
    const rid = NAME_TO_ID.get(row.region);
    if (rid !== undefined) {
      row.region_id = rid;
      patched++;
    } else {
      unmatched.push(row.region);
    }
  }

  // Write back with 2-space indent
  writeFileSync(absPath, JSON.stringify(data, null, 2) + "\n", "utf8");

  console.log(`  ${relPath}: ${patched} rows patched`);
  if (unmatched.length) {
    const unique = [...new Set(unmatched)];
    console.warn(`    ⚠ ${unique.length} unmatched region names:`, unique);
  }
}

console.log("[patching JSON files]");
patchJsonFile("interim_demographics.json");
patchJsonFile("interim_property.json");
patchJsonFile("interim_socioeconomic.json");

// ── 3. Patch businesses.js ──────────────────────────────────────────────
console.log("\n[patching businesses.js]");

const bizPath = resolve(DATA_DIR, "businesses.js");
let bizSource = readFileSync(bizPath, "utf8");

// Match  region:"SomeName"  and insert  region_id:N,  right after
let bizPatched = 0;
let bizUnmatched = [];

bizSource = bizSource.replace(
  /region:"([^"]+)"/g,
  (match, regionName) => {
    const rid = NAME_TO_ID.get(regionName);
    if (rid !== undefined) {
      bizPatched++;
      return `region:"${regionName}", region_id:${rid}`;
    }
    bizUnmatched.push(regionName);
    return match; // leave unchanged if no match
  }
);

writeFileSync(bizPath, bizSource, "utf8");

console.log(`  businesses.js: ${bizPatched} entries patched`);
if (bizUnmatched.length) {
  const unique = [...new Set(bizUnmatched)];
  console.warn(`    ⚠ ${unique.length} unmatched region names:`, unique);
}

console.log("\n✓ Propagation complete.");
