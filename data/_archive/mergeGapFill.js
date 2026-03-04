/**
 * mergeGapFill.js
 * ────────────────
 * Merges gap-filled property and socioeconomic data into the existing
 * audited_property.json and audited_socioeconomic.json files.
 *
 * Usage:
 *   node data/mergeGapFill.js
 *
 * Optional env vars:
 *   GAP_FILL_DIR  — directory with gap-fill output (default: ./data/gap_fill_output)
 *   DRY_RUN       — if "true", report what would be merged without writing
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAP_FILL_DIR = process.env.GAP_FILL_DIR || path.join(__dirname, "gap_fill_output");
const AUDIT_DIR = path.join(__dirname, "audit_output");
const DRY_RUN = process.env.DRY_RUN === "true";

// ── Load existing audited data ─────────────────────────────────────────
const auditedProp = JSON.parse(
  fs.readFileSync(path.join(AUDIT_DIR, "audited_property.json"), "utf-8")
);
const auditedSocio = JSON.parse(
  fs.readFileSync(path.join(AUDIT_DIR, "audited_socioeconomic.json"), "utf-8")
);

// ── Load gap-fill data ─────────────────────────────────────────────────
const gapPropPath = path.join(GAP_FILL_DIR, "gap_fill_property.json");
const gapSocioPath = path.join(GAP_FILL_DIR, "gap_fill_socioeconomic.json");

if (!fs.existsSync(gapPropPath) || !fs.existsSync(gapSocioPath)) {
  console.error("Gap-fill output files not found. Run gapFillRunner.js first.");
  process.exit(1);
}

const gapProp = JSON.parse(fs.readFileSync(gapPropPath, "utf-8"));
const gapSocio = JSON.parse(fs.readFileSync(gapSocioPath, "utf-8"));

// ── Build existing keys to avoid duplicates ────────────────────────────
function buildKeySet(rows) {
  const keys = new Set();
  for (const r of rows) {
    if (r.region_id != null && r.year != null) {
      keys.add(`${r.region_id}_${r.year}`);
    }
  }
  return keys;
}

const existingPropKeys = buildKeySet(auditedProp);
const existingSocioKeys = buildKeySet(auditedSocio);

// ── Merge: only add rows that don't already exist ──────────────────────
let propAdded = 0;
let propSkipped = 0;
let socioAdded = 0;
let socioSkipped = 0;

const newPropRegions = new Set();
const newSocioRegions = new Set();

for (const row of gapProp) {
  const key = `${row.region_id}_${row.year}`;
  if (existingPropKeys.has(key)) {
    propSkipped++;
  } else {
    auditedProp.push(row);
    existingPropKeys.add(key);
    propAdded++;
    newPropRegions.add(row.region_id);
  }
}

for (const row of gapSocio) {
  const key = `${row.region_id}_${row.year}`;
  if (existingSocioKeys.has(key)) {
    socioSkipped++;
  } else {
    auditedSocio.push(row);
    existingSocioKeys.add(key);
    socioAdded++;
    newSocioRegions.add(row.region_id);
  }
}

// ── Report ─────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(60)}`);
console.log(`  MERGE GAP-FILL DATA${DRY_RUN ? " (DRY RUN)" : ""}`);
console.log(`${"═".repeat(60)}`);
console.log(`\n  Property:`);
console.log(`    Added:   ${propAdded} rows across ${newPropRegions.size} regions`);
console.log(`    Skipped: ${propSkipped} (already existed)`);
console.log(`    Total:   ${auditedProp.length} rows`);
console.log(`\n  Socioeconomic:`);
console.log(`    Added:   ${socioAdded} rows across ${newSocioRegions.size} regions`);
console.log(`    Skipped: ${socioSkipped} (already existed)`);
console.log(`    Total:   ${auditedSocio.length} rows`);

if (DRY_RUN) {
  console.log(`\n  ⚠ DRY RUN — no files were written.`);
  console.log(`  Run without DRY_RUN=true to apply changes.`);
} else {
  // ── Backup existing files ────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = path.join(AUDIT_DIR, "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  fs.copyFileSync(
    path.join(AUDIT_DIR, "audited_property.json"),
    path.join(backupDir, `audited_property_${timestamp}.json`)
  );
  fs.copyFileSync(
    path.join(AUDIT_DIR, "audited_socioeconomic.json"),
    path.join(backupDir, `audited_socioeconomic_${timestamp}.json`)
  );
  console.log(`\n  📦 Backups written to ${backupDir}/`);

  // ── Write merged files ───────────────────────────────────────────────
  fs.writeFileSync(
    path.join(AUDIT_DIR, "audited_property.json"),
    JSON.stringify(auditedProp, null, 2)
  );
  fs.writeFileSync(
    path.join(AUDIT_DIR, "audited_socioeconomic.json"),
    JSON.stringify(auditedSocio, null, 2)
  );
  console.log(`  ✅ Merged data written to ${AUDIT_DIR}/`);
}

// ── Validate ───────────────────────────────────────────────────────────
console.log(`\n  Validation:`);

// Check region coverage
const propRegions = new Set(auditedProp.map((r) => r.region_id));
const socioRegions = new Set(auditedSocio.map((r) => r.region_id));
const demoRegions = new Set(
  JSON.parse(
    fs.readFileSync(path.join(AUDIT_DIR, "audited_demographics.json"), "utf-8")
  ).map((r) => r.region_id)
);

const demoOnlyAfter = [...demoRegions].filter(
  (id) => !propRegions.has(id) && !socioRegions.has(id)
);
const fullyMissing = new Set();
// Check regionIndex for any IDs not in any dataset
try {
  const riContent = fs.readFileSync(path.join(__dirname, "regionIndex.js"), "utf-8");
  const startIdx = riContent.indexOf("[");
  const endIdx = riContent.lastIndexOf("];") + 1;
  const regionIndex = JSON.parse(riContent.substring(startIdx, endIdx));
  for (const r of regionIndex) {
    if (!demoRegions.has(r.region_id) && !propRegions.has(r.region_id) && !socioRegions.has(r.region_id)) {
      fullyMissing.add(r.region_id);
    }
  }
} catch { /* ignore */ }

console.log(`    Property regions: ${propRegions.size}`);
console.log(`    Socioeconomic regions: ${socioRegions.size}`);
console.log(`    Demo-only remaining: ${demoOnlyAfter.length}`);
if (fullyMissing.size > 0) {
  console.log(`    Fully missing (no data at all): ${[...fullyMissing].sort((a, b) => a - b).join(", ")}`);
}

console.log(`\n${"═".repeat(60)}\n`);
