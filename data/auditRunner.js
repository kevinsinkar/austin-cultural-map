/**
 * auditRunner.js
 * ──────────────
 * Iterates through all 269 regions one at a time, sends each to
 * Gemini for audit, collects results, and writes enriched JSON files.
 *
 * Usage:
 *   GEMINI_API_KEY=your_key node auditRunner.js
 *
 * Optional env vars:
 *   START_REGION_ID  — resume from a specific region (default: 1)
 *   MODEL            — Gemini model (default: gemini-2.5-pro)
 *   OUTPUT_DIR       — where to write results (default: ./audit_output)
 *   RATE_LIMIT_MS    — ms between API calls (default: 4000)
 *   RETRY_FAILED     — "true" to only re-process failed + empty regions
 *   DRY_RUN          — "true" to list targets without calling the API
 */

import fs from "fs";
import path from "path";

// ── Config ─────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;

const MODEL = process.env.MODEL || "gemini-2.5-pro";
const START_ID = parseInt(process.env.START_REGION_ID || "1", 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./audit_output";
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS || "4000", 10);
const RETRY_FAILED = process.env.RETRY_FAILED === "true";
const DRY_RUN = process.env.DRY_RUN === "true";

if (!API_KEY && !DRY_RUN) throw new Error("Set GEMINI_API_KEY env var");

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ── Load source data ───────────────────────────────────────────────────
// Paths are relative to where the script lives (same folder as the JSON files)
const demographics = JSON.parse(
  fs.readFileSync("./interim_demographics.json", "utf-8")
);
const property = JSON.parse(
  fs.readFileSync("./interim_property.json", "utf-8")
);
const socioeconomic = JSON.parse(
  fs.readFileSync("./interim_socioeconomic.json", "utf-8")
);

// ── Build region index ─────────────────────────────────────────────────
function groupByRegionId(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = row.region_id;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

const demoByRegion = groupByRegionId(demographics);
const propByRegion = groupByRegionId(property);
const socioByRegion = groupByRegionId(socioeconomic);

// Collect all unique region_ids with their names
const regionIndex = new Map();
for (const row of demographics) {
  if (!regionIndex.has(row.region_id)) {
    regionIndex.set(row.region_id, row.region);
  }
}

// ── Extract tract hint from region name ────────────────────────────────
function extractTractHint(regionName) {
  const match = regionName.match(/\(Tract\s+([\d.]+)\)/);
  return match
    ? match[1]
    : "Not specified — use best neighborhood-to-tract mapping";
}

// ── System prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = fs.readFileSync("./gemini_system_prompt.txt", "utf-8");

// ── Build user message for one region ──────────────────────────────────
function buildUserMessage(regionId, regionName) {
  const demoRows = demoByRegion.get(regionId) || [];
  const propRows = propByRegion.get(regionId) || [];
  const socioRows = socioByRegion.get(regionId) || [];
  const tract = extractTractHint(regionName);

  return [
    `Audit the following data for region_id: ${regionId} ("${regionName}").`,
    ``,
    `This region maps to Austin census tract(s): ${tract}`,
    ``,
    `== DEMOGRAPHICS ==`,
    JSON.stringify(demoRows, null, 2),
    ``,
    `== PROPERTY ==`,
    JSON.stringify(propRows, null, 2),
    ``,
    `== SOCIOECONOMIC ==`,
    JSON.stringify(socioRows, null, 2),
    ``,
    `Return the audited JSON with all original fields preserved, new fields added,`,
    `and audit metadata attached to every row.`,
  ].join("\n");
}

// ── Call Gemini API ────────────────────────────────────────────────────
async function callGemini(regionId, regionName) {
  const userMessage = buildUserMessage(regionId, regionName);

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
      temperature: 0.2, // low creativity — we want factual accuracy
      topP: 0.8,
      maxOutputTokens: 65536, // large output for full JSON
      responseMimeType: "application/json", // force JSON output
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

  // Extract text from response
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

  // Parse JSON (strip markdown fences if present despite mime type setting)
  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return JSON.parse(cleaned);
}

// ── Rate limiter ───────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main loop ──────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allDemographics = [];
  const allProperty = [];
  const allSocioeconomic = [];
  const auditLog = [];

  const sortedRegions = [...regionIndex.entries()].sort((a, b) => a[0] - b[0]);

  // ── Retry-failed mode: find failed + empty regions ───────────────────
  let retrySet = null; // null = normal mode, Set = retry mode

  if (RETRY_FAILED) {
    retrySet = new Set();

    // 1) Collect IDs that failed in the audit log
    const logPath = path.join(OUTPUT_DIR, "audit_log.json");
    if (fs.existsSync(logPath)) {
      const log = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      for (const entry of log) {
        if (entry.status === "FAILED") {
          // Only retry if the file doesn't exist yet or is empty/corrupt
          const regionFile = path.join(
            OUTPUT_DIR,
            `region_${entry.region_id}.json`
          );
          if (!fs.existsSync(regionFile)) {
            retrySet.add(entry.region_id);
          } else {
            try {
              const data = JSON.parse(fs.readFileSync(regionFile, "utf-8"));
              const totalRows =
                (data.demographics || []).length +
                (data.property || []).length +
                (data.socioeconomic || []).length;
              if (totalRows === 0) retrySet.add(entry.region_id);
              // else: file exists with data — skip (already recovered)
            } catch {
              retrySet.add(entry.region_id); // corrupt → retry
            }
          }
        }
      }
    }

    // 2) Collect IDs whose files exist but are empty (0 data rows)
    for (const [regionId] of sortedRegions) {
      const regionFile = path.join(OUTPUT_DIR, `region_${regionId}.json`);
      if (fs.existsSync(regionFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(regionFile, "utf-8"));
          const totalRows =
            (data.demographics || []).length +
            (data.property || []).length +
            (data.socioeconomic || []).length;
          if (totalRows === 0) retrySet.add(regionId);
        } catch {
          retrySet.add(regionId); // corrupt JSON → retry
        }
      }
    }

    // 3) Delete the empty/corrupt files so they get regenerated
    for (const id of retrySet) {
      const regionFile = path.join(OUTPUT_DIR, `region_${id}.json`);
      if (fs.existsSync(regionFile)) {
        fs.unlinkSync(regionFile);
        console.log(`  🗑  Deleted empty/corrupt file: region_${id}.json`);
      }
    }

    console.log(
      `\nRETRY_FAILED mode — targeting ${retrySet.size} regions: ${[...retrySet].sort((a, b) => a - b).join(", ")}\n`
    );

    if (DRY_RUN) {
      console.log("DRY_RUN=true — listing targets only, no API calls.");
      for (const id of [...retrySet].sort((a, b) => a - b)) {
        const name = regionIndex.get(id) || "unknown";
        console.log(`  → Region ${id}: "${name}"`);
      }
      return;
    }
  }

  const regionsToProcess =
    retrySet !== null
      ? sortedRegions.filter(([id]) => retrySet.has(id))
      : sortedRegions.filter(([id]) => id >= START_ID);

  console.log(
    `Starting audit of ${regionsToProcess.length} regions${retrySet ? " (retry-failed mode)" : ` (from id ${START_ID})`}...`
  );
  console.log(
    `Model: ${MODEL} | Rate limit: ${RATE_LIMIT_MS}ms between calls\n`
  );

  for (const [regionId, regionName] of regionsToProcess) {
   try {
    const regionFile = path.join(OUTPUT_DIR, `region_${regionId}.json`);

    // Skip if already audited (resume support)
    if (fs.existsSync(regionFile)) {
      console.log(
        `  ⏭  Region ${regionId} ("${regionName}") — already audited, skipping`
      );
      const existing = JSON.parse(fs.readFileSync(regionFile, "utf-8"));
      allDemographics.push(...(existing.demographics || []));
      allProperty.push(...(existing.property || []));
      allSocioeconomic.push(...(existing.socioeconomic || []));
      continue;
    }

    console.log(
      `  🔍 Region ${regionId}/${sortedRegions.length}: "${regionName}"...`
    );

    let result;
    let attempts = 0;
    const MAX_RETRIES = 5;

    while (attempts < MAX_RETRIES) {
      try {
        result = await callGemini(regionId, regionName);
        break;
      } catch (err) {
        attempts++;
        console.error(`     ⚠ Attempt ${attempts} failed: ${err.message}`);
        if (attempts >= MAX_RETRIES) {
          auditLog.push({
            region_id: regionId,
            region: regionName,
            status: "FAILED",
            error: err.message,
          });
          console.error(
            `     ❌ Skipping region ${regionId} after ${MAX_RETRIES} failures`
          );
          result = null;
        } else {
          await sleep(RATE_LIMIT_MS * 3 * attempts); // exponential backoff
        }
      }
    }

    if (result) {
      // Write individual region file (for resume support)
      fs.writeFileSync(regionFile, JSON.stringify(result, null, 2));

      // Accumulate
      allDemographics.push(...(result.demographics || []));
      allProperty.push(...(result.property || []));
      allSocioeconomic.push(...(result.socioeconomic || []));

      // Count corrections
      const allRows = [
        ...(result.demographics || []),
        ...(result.property || []),
        ...(result.socioeconomic || []),
      ];
      const corrections = allRows.filter((r) =>
        r.audit_flags?.includes("CORRECTED")
      ).length;
      const lowConf = allRows.filter((r) =>
        r.audit_flags?.includes("LOW_CONFIDENCE")
      ).length;

      auditLog.push({
        region_id: regionId,
        region: regionName,
        status: "OK",
        corrections,
        low_confidence_rows: lowConf,
      });

      console.log(
        `     ✅ Done — ${corrections} corrections, ${lowConf} low-confidence rows`
      );
    }

    // Rate limit
    await sleep(RATE_LIMIT_MS);
   } catch (outerErr) {
    console.error(
      `     💥 Unexpected error on region ${regionId}: ${outerErr.message}`
    );
    auditLog.push({
      region_id: regionId,
      region: regionName,
      status: "FAILED",
      error: `Unexpected: ${outerErr.message}`,
    });
   }
  }

  // ── Write combined output files ──────────────────────────────────────
  const outDemo = path.join(OUTPUT_DIR, "audited_demographics.json");
  const outProp = path.join(OUTPUT_DIR, "audited_property.json");
  const outSocio = path.join(OUTPUT_DIR, "audited_socioeconomic.json");
  const outLog = path.join(OUTPUT_DIR, "audit_log.json");

  // In retry mode, merge new results with existing data from all region files
  if (retrySet !== null) {
    // Re-read all region files to build complete combined output
    const mergedDemo = [];
    const mergedProp = [];
    const mergedSocio = [];

    for (const [regionId] of sortedRegions) {
      const regionFile = path.join(OUTPUT_DIR, `region_${regionId}.json`);
      if (fs.existsSync(regionFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(regionFile, "utf-8"));
          mergedDemo.push(...(data.demographics || []));
          mergedProp.push(...(data.property || []));
          mergedSocio.push(...(data.socioeconomic || []));
        } catch {
          /* skip corrupt files */
        }
      }
    }

    // Merge audit log: keep existing non-retried entries, add new ones
    const logPath = path.join(OUTPUT_DIR, "audit_log.json");
    let existingLog = [];
    if (fs.existsSync(logPath)) {
      existingLog = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    }
    const retriedIds = new Set(auditLog.map((e) => e.region_id));
    const keptEntries = existingLog.filter(
      (e) => !retriedIds.has(e.region_id)
    );
    const mergedLog = [...keptEntries, ...auditLog].sort(
      (a, b) => a.region_id - b.region_id
    );

    fs.writeFileSync(outDemo, JSON.stringify(mergedDemo, null, 2));
    fs.writeFileSync(outProp, JSON.stringify(mergedProp, null, 2));
    fs.writeFileSync(outSocio, JSON.stringify(mergedSocio, null, 2));
    fs.writeFileSync(outLog, JSON.stringify(mergedLog, null, 2));

    const stillFailed = mergedLog.filter((l) => l.status === "FAILED").length;
    const retryOk = auditLog.filter((l) => l.status === "OK").length;
    const retryFailed = auditLog.filter((l) => l.status === "FAILED").length;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`RETRY COMPLETE`);
    console.log(`  Retried:         ${auditLog.length} regions`);
    console.log(`  Succeeded:       ${retryOk}`);
    console.log(`  Still failing:   ${retryFailed}`);
    console.log(`  Total failures:  ${stillFailed} (across all regions)`);
    console.log(`  Output:          ${OUTPUT_DIR}/`);
    console.log(`${"═".repeat(60)}`);
  } else {
    fs.writeFileSync(outDemo, JSON.stringify(allDemographics, null, 2));
    fs.writeFileSync(outProp, JSON.stringify(allProperty, null, 2));
    fs.writeFileSync(outSocio, JSON.stringify(allSocioeconomic, null, 2));
    fs.writeFileSync(outLog, JSON.stringify(auditLog, null, 2));

    // ── Summary ──────────────────────────────────────────────────────────
    const failed = auditLog.filter((l) => l.status === "FAILED").length;
    const totalCorrections = auditLog
      .filter((l) => l.status === "OK")
      .reduce((sum, l) => sum + l.corrections, 0);

    console.log(`\n${"═".repeat(60)}`);
    console.log(`AUDIT COMPLETE`);
    console.log(`  Regions processed: ${auditLog.length}`);
    console.log(`  Failures:          ${failed}`);
    console.log(`  Total corrections: ${totalCorrections}`);
    console.log(`  Output:            ${OUTPUT_DIR}/`);
    console.log(`${"═".repeat(60)}`);
  }
}

main().catch(console.error);