/**
 * gapFillRunner.js
 * ────────────────
 * Sends regions with missing property/socioeconomic data to Gemini
 * for research-based gap-filling. Uses census tracts and coordinates
 * for geographic identification rather than neighborhood names.
 *
 * Usage:
 *   GEMINI_API_KEY=your_key node data/gapFillRunner.js
 *
 * Optional env vars:
 *   START_REGION_ID  — resume from a specific region (default: 0)
 *   MODEL            — Gemini model (default: gemini-2.5-pro)
 *   OUTPUT_DIR       — where to write results (default: ./data/gap_fill_output)
 *   RATE_LIMIT_MS    — ms between API calls (default: 5000)
 *   BATCH_SIZE       — regions per API call (default: 3)
 *   DRY_RUN          — if "true", print prompts without calling API
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ─────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "true";
if (!API_KEY && !DRY_RUN) throw new Error("Set GEMINI_API_KEY env var (or DRY_RUN=true)");

const MODEL = process.env.MODEL || "gemini-2.5-pro";
const START_ID = parseInt(process.env.START_REGION_ID || "0", 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, "gap_fill_output");
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS || "5000", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "3", 10);

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ── Load data ──────────────────────────────────────────────────────────
const DATA_DIR = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "gap_fill_manifest.json"), "utf-8"));
const demographics = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "audit_output", "audited_demographics.json"), "utf-8"));
const SYSTEM_PROMPT = fs.readFileSync(path.join(DATA_DIR, "gemini_gap_fill_prompt.txt"), "utf-8");

// Index demographics by region_id for quick lookup
const demoByRegion = new Map();
for (const row of demographics) {
  if (row.region_id == null) continue;
  if (!demoByRegion.has(row.region_id)) demoByRegion.set(row.region_id, []);
  demoByRegion.get(row.region_id).push(row);
}

// ── Build user message for a batch of regions ──────────────────────────

function buildUserMessage(regions) {
  const parts = [];

  parts.push(`Generate MISSING property and socioeconomic data for the following ${regions.length} region(s).`);
  parts.push(`For each region, produce rows for the years specified.\n`);

  for (const r of regions) {
    parts.push(`${"═".repeat(70)}`);
    parts.push(`REGION ID: ${r.region_id}`);
    parts.push(`REGION NAME: "${r.region_name}"`);

    if (r.census_tract) {
      parts.push(`CENSUS TRACT: ${r.census_tract} (Travis County, TX — FIPS 48453)`);
      parts.push(`  Full GEOID: 48453${String(parseFloat(r.census_tract) * 100).padStart(6, "0")}`);
    } else {
      parts.push(`CENSUS TRACT: Not specified — infer from coordinates and neighborhood name.`);
    }

    if (r.lat && r.lng) {
      parts.push(`CENTROID: ${r.lat}, ${r.lng}`);
    }

    parts.push(`MISSING DATA: ${r.missing.join(", ")}`);
    parts.push(`YEAR RANGE: ${r.year_range[0]} to ${r.year_range[1]}`);

    // Determine which years to generate
    // Use 5-year intervals for efficiency: 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025
    const targetYears = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025].filter(
      (y) => y >= r.year_range[0] && y <= r.year_range[1]
    );
    parts.push(`GENERATE DATA FOR YEARS: ${targetYears.join(", ")}`);

    // Include demographic context if available (compact JSON to save tokens)
    const demoRows = demoByRegion.get(r.region_id) || [];
    if (demoRows.length > 0) {
      const contextYears = [1990, 2000, 2010, 2020];
      const contextRows = contextYears
        .map((y) => demoRows.find((d) => d.year === y))
        .filter(Boolean)
        .map((d) => ({
          y: d.year,
          pop: d.total_population,
          w: d.pct_white,
          b: d.pct_black,
          h: d.pct_hispanic,
          own: d.pct_owner_occupied,
          rb: d.rent_burden_pct,
        }));
      parts.push(`DEMO CONTEXT (y=year,pop=population,w=white%,b=black%,h=hispanic%,own=owner_occ%,rb=rent_burden%): ${JSON.stringify(contextRows)}`);
    }

    parts.push("");
  }

  parts.push(`\nReturn a single JSON object: {"property":[...],"socioeconomic":[...]}`);
  parts.push(`Include ONLY the fields listed in the system prompt. Keep output minimal.`);

  return parts.join("\n");
}

// ── Call Gemini API ────────────────────────────────────────────────────

async function callGemini(userMessage) {
  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

  // Parse JSON — strip markdown fences if present despite mime type
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ── Helpers ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Filter to regions that need gap-filling and haven't been processed
  const toProcess = manifest
    .filter((r) => r.region_id >= START_ID)
    .filter((r) => r.missing.length > 0)
    .filter((r) => {
      const outFile = path.join(OUTPUT_DIR, `region_${r.region_id}.json`);
      return !fs.existsSync(outFile); // skip already processed
    });

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  GAP-FILL RUNNER`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Total regions in manifest: ${manifest.length}`);
  console.log(`  Regions to process: ${toProcess.length}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Rate limit: ${RATE_LIMIT_MS}ms`);
  console.log(`  Output: ${OUTPUT_DIR}/`);
  if (DRY_RUN) console.log(`  ⚠ DRY RUN — no API calls will be made`);
  console.log(`${"═".repeat(60)}\n`);

  const batches = chunkArray(toProcess, BATCH_SIZE);
  const allProperty = [];
  const allSocioeconomic = [];
  const log = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchIds = batch.map((r) => r.region_id);
    console.log(
      `  📦 Batch ${i + 1}/${batches.length}: regions ${batchIds.join(", ")}...`
    );

    const userMessage = buildUserMessage(batch);

    if (DRY_RUN) {
      // Write the prompt to a file for inspection
      const promptFile = path.join(OUTPUT_DIR, `prompt_batch_${i + 1}.txt`);
      fs.writeFileSync(
        promptFile,
        `=== SYSTEM PROMPT ===\n${SYSTEM_PROMPT}\n\n=== USER MESSAGE ===\n${userMessage}`
      );
      console.log(`     📝 Wrote prompt to ${promptFile}`);
      for (const r of batch) {
        log.push({ region_id: r.region_id, region: r.region_name, status: "DRY_RUN" });
      }
      continue;
    }

    let result = null;
    let attempts = 0;
    const MAX_RETRIES = 3;

    while (attempts < MAX_RETRIES) {
      try {
        result = await callGemini(userMessage);
        break;
      } catch (err) {
        attempts++;
        console.error(`     ⚠ Attempt ${attempts} failed: ${err.message}`);
        if (attempts >= MAX_RETRIES) {
          for (const r of batch) {
            log.push({
              region_id: r.region_id,
              region: r.region_name,
              status: "FAILED",
              error: err.message,
            });
          }
          console.error(
            `     ❌ Skipping batch after ${MAX_RETRIES} failures`
          );
          result = null;
        } else {
          await sleep(RATE_LIMIT_MS * 2 * attempts);
        }
      }
    }

    if (result) {
      const propRows = result.property || [];
      const socioRows = result.socioeconomic || [];

      // Write individual region files for resume support
      for (const r of batch) {
        const regionProp = propRows.filter((p) => p.region_id === r.region_id);
        const regionSocio = socioRows.filter(
          (s) => s.region_id === r.region_id
        );
        const regionResult = {
          property: regionProp,
          socioeconomic: regionSocio,
        };
        const outFile = path.join(OUTPUT_DIR, `region_${r.region_id}.json`);
        fs.writeFileSync(outFile, JSON.stringify(regionResult, null, 2));

        log.push({
          region_id: r.region_id,
          region: r.region_name,
          status: "OK",
          property_rows: regionProp.length,
          socioeconomic_rows: regionSocio.length,
        });

        console.log(
          `     ✅ Region ${r.region_id}: ${regionProp.length} property + ${regionSocio.length} socioeconomic rows`
        );
      }

      allProperty.push(...propRows);
      allSocioeconomic.push(...socioRows);
    }

    // Rate limit between batches
    if (i < batches.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // ── If resuming, also load previously-processed region files ──────────
  if (!DRY_RUN) {
    const existingFiles = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => f.startsWith("region_") && f.endsWith(".json"));

    const processedPropIds = new Set(
      allProperty.map((r) => r.region_id)
    );
    const processedSocioIds = new Set(
      allSocioeconomic.map((r) => r.region_id)
    );

    for (const f of existingFiles) {
      const data = JSON.parse(
        fs.readFileSync(path.join(OUTPUT_DIR, f), "utf-8")
      );
      for (const row of data.property || []) {
        if (!processedPropIds.has(row.region_id)) {
          allProperty.push(row);
        }
      }
      if (data.property?.length) processedPropIds.add(data.property[0].region_id);
      for (const row of data.socioeconomic || []) {
        if (!processedSocioIds.has(row.region_id)) {
          allSocioeconomic.push(row);
        }
      }
      if (data.socioeconomic?.length) processedSocioIds.add(data.socioeconomic[0].region_id);
    }
  }

  // ── Write combined output ────────────────────────────────────────────
  const outProp = path.join(OUTPUT_DIR, "gap_fill_property.json");
  const outSocio = path.join(OUTPUT_DIR, "gap_fill_socioeconomic.json");
  const outLog = path.join(OUTPUT_DIR, "gap_fill_log.json");

  if (!DRY_RUN) {
    fs.writeFileSync(outProp, JSON.stringify(allProperty, null, 2));
    fs.writeFileSync(outSocio, JSON.stringify(allSocioeconomic, null, 2));
  }
  fs.writeFileSync(outLog, JSON.stringify(log, null, 2));

  // ── Summary ──────────────────────────────────────────────────────────
  const ok = log.filter((l) => l.status === "OK").length;
  const failed = log.filter((l) => l.status === "FAILED").length;
  const dry = log.filter((l) => l.status === "DRY_RUN").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  GAP-FILL COMPLETE`);
  console.log(`  Regions processed successfully: ${ok}`);
  console.log(`  Regions failed: ${failed}`);
  if (dry) console.log(`  Regions dry-run: ${dry}`);
  console.log(`  Total property rows: ${allProperty.length}`);
  console.log(`  Total socioeconomic rows: ${allSocioeconomic.length}`);
  console.log(`  Output: ${OUTPUT_DIR}/`);
  console.log(`${"═".repeat(60)}`);

  if (!DRY_RUN && allProperty.length > 0) {
    console.log(`\n  Next step: merge gap-fill data into audited datasets:`);
    console.log(`    node data/mergeGapFill.js`);
  }
}

main().catch(console.error);
