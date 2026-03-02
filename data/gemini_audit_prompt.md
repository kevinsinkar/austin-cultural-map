# Gemini Data Audit — Prompt & Orchestration Guide

## Overview

This document contains:
1. **The system prompt** to send to Gemini for each region audit
2. **The user message template** (parameterized per region)
3. **The orchestration script** (`auditRunner.js`) that iterates through all 269 regions
4. **Output schema** showing the enriched JSON format

---

## 1. System Prompt

Send this as the `systemInstruction` on every API call.

```
You are a municipal data auditor specializing in Austin, Texas neighborhood-level
demographic, property, and socioeconomic data. Your job is to verify data accuracy
for a Displacement Vulnerability Index (DVI) project that tracks gentrification
and cultural displacement across Austin neighborhoods from 1990 to 2025.

CONTEXT:
This data powers a visualization tool designed to support data-driven decisions
about preserving cultural anchor spaces for displaced communities — particularly
African American, Mexican American/Latino, immigrant, and LGBTQ+ communities
in Austin. Accuracy matters because policy recommendations, community investment
decisions, and cultural preservation strategies depend on this data.

YOUR TASK:
For each region + year row provided, you will:

1. VERIFY each numeric value against your knowledge of the most authoritative
   source for that data type and geography (see SOURCE HIERARCHY below).

2. ASSIGN a confidence level to each field:
   - "high"    — Value aligns with known government/institutional data for this
                  census tract or neighborhood in this year (within ±5%).
   - "medium"  — Value is plausible and directionally correct but cannot be
                  precisely confirmed (within ±15%), OR the year falls between
                  census/ACS releases and the value appears reasonably interpolated.
   - "low"     — Value appears fabricated, implausible, contradicts known data,
                  or deviates >15% from the best available reference.

3. REPLACE any value where confidence is "low" with your best estimate from
   authoritative sources, and explain the correction in the "audit_notes" field.

4. ADD the following new fields to every row (see NEW FIELDS below).

5. FLAG any anomalies — sudden jumps, impossible values (e.g., pct fields
   summing to >100), or values that contradict known Austin history.

SOURCE HIERARCHY (prefer in this order):
  Demographics:
    1. U.S. Census Bureau Decennial Census (1990, 2000, 2010, 2020)
    2. American Community Survey 5-Year Estimates (annual from ~2005)
    3. ACS 1-Year Estimates (larger geographies only)
    4. City of Austin demographic reports
    5. Texas Demographic Center projections

  Property:
    1. Travis Central Appraisal District (TCAD) — median appraised values
    2. Zillow Home Value Index (ZHVI) — median home values
    3. U.S. Census / ACS — median home value, median gross rent
    4. Austin Board of Realtors (ABoR) — median sale prices
    5. CoStar / commercial real estate databases — commercial sqft
    6. City of Austin permit data — residential unit counts

  Socioeconomic:
    1. ACS 5-Year Estimates — income, poverty
    2. Bureau of Labor Statistics (BLS) — industry/employment
    3. Texas Workforce Commission — regional industry data
    4. City of Austin economic development reports

CENSUS TRACT MAPPING:
Region names often include a census tract number in parentheses,
e.g., "Cherrywood (Tract 3.09)". Use this tract number to look up
precise census/ACS data. For regions without tract numbers, use your
best knowledge of which tracts overlap that Austin neighborhood.

INTERPOLATION RULES:
- For years between decennial censuses (e.g., 1993, 1997), values should
  reflect reasonable linear or weighted interpolation.
- Mark interpolated values as confidence "medium" unless they contradict
  bracketing census data, in which case mark "low" and correct.

NEW FIELDS TO ADD:

  Demographics — add to each row:
    "pct_black_non_hispanic": number,       // African American population %
    "pct_asian": number,                     // Asian population %
    "pct_foreign_born": number,              // % foreign-born residents
    "pct_owner_occupied": number,            // homeownership rate
    "rent_burden_pct": number,               // % of renter households paying >30% income on rent
    "pct_65_and_over": number                // senior population %

  Property — add to each row:
    "median_property_tax": number,           // annual property tax in dollars
    "pct_home_value_change_yoy": number,     // year-over-year % change in median home value
    "vacancy_rate": number,                  // residential vacancy rate %
    "new_construction_permits": number       // residential building permits issued that year

  Socioeconomic — add to each row:
    "unemployment_rate": number,             // unemployment rate %
    "gini_coefficient": number,              // income inequality (0-1)
    "pct_uninsured": number,                 // % without health insurance
    "eviction_filing_rate": number,          // eviction filings per 100 renter households
    "snap_participation_rate": number        // % of households receiving SNAP benefits

  All three datasets — add these audit metadata fields to EVERY row:
    "audit_source": {                        // one entry per audited field
      "<field_name>": string                 // e.g., "ACS 5-Year 2006-2010", "TCAD 2015", "Zillow ZHVI Dec 2020"
    },
    "audit_confidence": {                    // one entry per audited field
      "<field_name>": "high" | "medium" | "low"
    },
    "audit_notes": string | null,            // free-text explanation of corrections, anomalies, or concerns
    "audit_flags": string[],                 // array of flag codes (see below)
    "audit_timestamp": string                // ISO 8601 timestamp of when this audit was performed

AUDIT FLAG CODES:
  "CORRECTED"           — A value was replaced during audit
  "INTERPOLATED"        — Value falls between census years; estimated
  "ANOMALY_SPIKE"       — Suspicious year-over-year jump (>25% change)
  "ANOMALY_SUM"         — Percentage fields don't sum correctly
  "LOW_CONFIDENCE"      — Multiple fields have low confidence
  "TRACT_MISMATCH"      — Region name doesn't cleanly map to one tract
  "PRE_ACS"             — Year is before ACS coverage (pre-2005); less precise
  "NEW_FIELD_ESTIMATED" — A newly added field was estimated, not sourced

OUTPUT FORMAT:
Return ONLY valid JSON — no markdown fences, no commentary outside the JSON.
Return three top-level keys: "demographics", "property", "socioeconomic",
each containing an array of the audited row objects for this region.

IMPORTANT:
- Preserve ALL original fields exactly as provided (including region, region_id, year).
- Add new fields and audit metadata alongside original fields.
- If you cannot estimate a new field with any confidence, use null and flag it.
- Be conservative with corrections — only replace when you have clear evidence.
- For the DVI project's mission, erring toward catching undercounts of
  displacement indicators is preferable to missing them.
```

---

## 2. User Message Template

For each region, construct the user message by injecting the filtered rows:

```
Audit the following data for region_id: {{REGION_ID}} ("{{REGION_NAME}}").

This region maps to Austin census tract(s): {{TRACT_HINT}}

== DEMOGRAPHICS ==
{{DEMOGRAPHICS_JSON}}

== PROPERTY ==
{{PROPERTY_JSON}}

== SOCIOECONOMIC ==
{{SOCIOECONOMIC_JSON}}

Return the audited JSON with all original fields preserved, new fields added,
and audit metadata attached to every row.
```

---

## 3. Orchestration Script — `auditRunner.js`

```javascript
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
 *   CONCURRENCY      — parallel requests (default: 1, be kind to rate limits)
 *   MODEL            — Gemini model (default: gemini-2.5-pro)
 *   OUTPUT_DIR       — where to write results (default: ./audit_output)
 */

import fs from "fs";
import path from "path";

// ── Config ─────────────────────────────────────────────────────────────
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("Set GEMINI_API_KEY env var");

const MODEL = process.env.MODEL || "gemini-2.5-pro";
const START_ID = parseInt(process.env.START_REGION_ID || "1", 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./audit_output";
const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT_MS || "4000", 10);

const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ── Load source data ───────────────────────────────────────────────────
const demographics = JSON.parse(fs.readFileSync("./data/interim_demographics.json", "utf-8"));
const property     = JSON.parse(fs.readFileSync("./data/interim_property.json", "utf-8"));
const socioeconomic = JSON.parse(fs.readFileSync("./data/interim_socioeconomic.json", "utf-8"));

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

const demoByRegion   = groupByRegionId(demographics);
const propByRegion   = groupByRegionId(property);
const socioByRegion  = groupByRegionId(socioeconomic);

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
  return match ? match[1] : "Not specified — use best neighborhood-to-tract mapping";
}

// ── System prompt (loaded from file or inline) ─────────────────────────
const SYSTEM_PROMPT = fs.readFileSync("./gemini_system_prompt.txt", "utf-8");

// ── Build user message for one region ──────────────────────────────────
function buildUserMessage(regionId, regionName) {
  const demoRows  = demoByRegion.get(regionId)  || [];
  const propRows  = propByRegion.get(regionId)  || [];
  const socioRows = socioByRegion.get(regionId) || [];
  const tract     = extractTractHint(regionName);

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
      temperature: 0.2,        // low creativity — we want factual accuracy
      topP: 0.8,
      maxOutputTokens: 65536,  // large output for full JSON
      responseMimeType: "application/json",  // force JSON output
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
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .join("") || "";

  // Parse JSON (strip markdown fences if present despite our mime type setting)
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
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
  const regionsToProcess = sortedRegions.filter(([id]) => id >= START_ID);

  console.log(`Starting audit of ${regionsToProcess.length} regions (from id ${START_ID})...`);
  console.log(`Model: ${MODEL} | Rate limit: ${RATE_LIMIT_MS}ms between calls\n`);

  for (const [regionId, regionName] of regionsToProcess) {
    const regionFile = path.join(OUTPUT_DIR, `region_${regionId}.json`);

    // Skip if already audited (resume support)
    if (fs.existsSync(regionFile)) {
      console.log(`  ⏭  Region ${regionId} ("${regionName}") — already audited, skipping`);
      const existing = JSON.parse(fs.readFileSync(regionFile, "utf-8"));
      allDemographics.push(...(existing.demographics || []));
      allProperty.push(...(existing.property || []));
      allSocioeconomic.push(...(existing.socioeconomic || []));
      continue;
    }

    console.log(`  🔍 Region ${regionId}/${sortedRegions.length}: "${regionName}"...`);

    let result;
    let attempts = 0;
    const MAX_RETRIES = 3;

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
          console.error(`     ❌ Skipping region ${regionId} after ${MAX_RETRIES} failures`);
          result = null;
        } else {
          await sleep(RATE_LIMIT_MS * 2 * attempts); // exponential backoff
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
      const corrections = [
        ...(result.demographics || []),
        ...(result.property || []),
        ...(result.socioeconomic || []),
      ].filter((r) => r.audit_flags?.includes("CORRECTED")).length;

      const lowConf = [
        ...(result.demographics || []),
        ...(result.property || []),
        ...(result.socioeconomic || []),
      ].filter((r) => r.audit_flags?.includes("LOW_CONFIDENCE")).length;

      auditLog.push({
        region_id: regionId,
        region: regionName,
        status: "OK",
        corrections,
        low_confidence_rows: lowConf,
      });

      console.log(`     ✅ Done — ${corrections} corrections, ${lowConf} low-confidence rows`);
    }

    // Rate limit
    await sleep(RATE_LIMIT_MS);
  }

  // ── Write combined output files ──────────────────────────────────────
  const outDemo  = path.join(OUTPUT_DIR, "audited_demographics.json");
  const outProp  = path.join(OUTPUT_DIR, "audited_property.json");
  const outSocio = path.join(OUTPUT_DIR, "audited_socioeconomic.json");
  const outLog   = path.join(OUTPUT_DIR, "audit_log.json");

  fs.writeFileSync(outDemo,  JSON.stringify(allDemographics, null, 2));
  fs.writeFileSync(outProp,  JSON.stringify(allProperty, null, 2));
  fs.writeFileSync(outSocio, JSON.stringify(allSocioeconomic, null, 2));
  fs.writeFileSync(outLog,   JSON.stringify(auditLog, null, 2));

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

main().catch(console.error);
```

---

## 4. Output Schema — Audited Demographics Example

```json
{
  "demographics": [
    {
      "year": 2010,
      "total_population": 1850,
      "median_age": 32.5,
      "pct_hispanic": 55.4,
      "pct_white_non_hispanic": 38.2,
      "pct_bachelors_degree_or_higher": 25.4,
      "region": "St. Elmo District",
      "region_id": 1,

      "pct_black_non_hispanic": 3.8,
      "pct_asian": 1.9,
      "pct_foreign_born": 22.1,
      "pct_owner_occupied": 38.5,
      "rent_burden_pct": 52.3,
      "pct_65_and_over": 8.2,

      "audit_source": {
        "total_population": "ACS 5-Year 2008-2012, Table B01003",
        "median_age": "ACS 5-Year 2008-2012, Table B01002",
        "pct_hispanic": "ACS 5-Year 2008-2012, Table B03003",
        "pct_white_non_hispanic": "ACS 5-Year 2008-2012, Table B03002",
        "pct_bachelors_degree_or_higher": "ACS 5-Year 2008-2012, Table B15003",
        "pct_black_non_hispanic": "ACS 5-Year 2008-2012, Table B03002",
        "pct_asian": "ACS 5-Year 2008-2012, Table B03002",
        "pct_foreign_born": "ACS 5-Year 2008-2012, Table B05002",
        "pct_owner_occupied": "ACS 5-Year 2008-2012, Table B25003",
        "rent_burden_pct": "ACS 5-Year 2008-2012, Table B25070",
        "pct_65_and_over": "ACS 5-Year 2008-2012, Table B01001"
      },
      "audit_confidence": {
        "total_population": "high",
        "median_age": "high",
        "pct_hispanic": "high",
        "pct_white_non_hispanic": "high",
        "pct_bachelors_degree_or_higher": "high",
        "pct_black_non_hispanic": "high",
        "pct_asian": "medium",
        "pct_foreign_born": "medium",
        "pct_owner_occupied": "high",
        "rent_burden_pct": "medium",
        "pct_65_and_over": "high"
      },
      "audit_notes": null,
      "audit_flags": [],
      "audit_timestamp": "2026-02-27T14:30:00Z"
    }
  ]
}
```

---

## 5. Audited Property Example

```json
{
  "property": [
    {
      "year": 2015,
      "median_home_value": 350000,
      "median_rent_monthly": 1500,
      "residential_units": 1500,
      "commercial_sqft": 2100000,
      "region": "St. Elmo District",
      "region_id": 1,

      "median_property_tax": 7350,
      "pct_home_value_change_yoy": 9.4,
      "vacancy_rate": 5.8,
      "new_construction_permits": 85,

      "audit_source": {
        "median_home_value": "Zillow ZHVI, Dec 2015; cross-ref TCAD 2015 appraisals",
        "median_rent_monthly": "ACS 5-Year 2013-2017, Table B25064",
        "residential_units": "City of Austin permit data + ACS housing units",
        "commercial_sqft": "CoStar Austin submarket estimates",
        "median_property_tax": "TCAD 2015 levy records",
        "pct_home_value_change_yoy": "Derived from Zillow ZHVI 2014 vs 2015",
        "vacancy_rate": "ACS 5-Year 2013-2017, Table B25002",
        "new_construction_permits": "City of Austin Development Services Dept"
      },
      "audit_confidence": {
        "median_home_value": "high",
        "median_rent_monthly": "medium",
        "residential_units": "medium",
        "commercial_sqft": "low",
        "median_property_tax": "medium",
        "pct_home_value_change_yoy": "high",
        "vacancy_rate": "medium",
        "new_construction_permits": "low"
      },
      "audit_notes": "commercial_sqft declining trend is directionally correct for this area as industrial/warehouse space converted to residential, but exact figures are estimated. new_construction_permits estimated from citywide per-tract allocation.",
      "audit_flags": ["NEW_FIELD_ESTIMATED"],
      "audit_timestamp": "2026-02-27T14:30:00Z"
    }
  ]
}
```

---

## 6. File Structure

After running the audit, your project should look like:

```
data/
├── interim_demographics.json        ← original
├── interim_property.json            ← original
├── interim_socioeconomic.json       ← original
├── gemini_system_prompt.txt         ← extracted from Section 1 above
├── auditRunner.js                   ← extracted from Section 3 above
└── audit_output/
    ├── region_1.json                ← individual region results (resume cache)
    ├── region_2.json
    ├── ...
    ├── region_269.json
    ├── audited_demographics.json    ← combined final output
    ├── audited_property.json        ← combined final output
    ├── audited_socioeconomic.json   ← combined final output
    └── audit_log.json               ← summary of corrections per region
```

---

## 7. Integration Notes

The audited JSON files are **drop-in replacements** for your existing `interim_*.json` files.
The schema is additive — all original keys are preserved, so your existing `regionLookup.js`,
`dvi_generated.js`, and `index.js` will continue to work without changes.

To access the new audit fields in your app, update `regionLookup.js`'s `buildIdIndex`
or create a parallel lookup — the rows are still keyed by `region_id`.

### Cost Estimate
- ~269 API calls × ~4K input tokens × ~8K output tokens per call
- At Gemini 2.5 Pro pricing: roughly $5–15 total depending on actual output sizes
- Runtime: ~20-30 minutes at 4-second rate limiting

### Recommended Validation After Audit
Run a post-audit sanity check across the combined output:
- Verify `pct_hispanic + pct_white_non_hispanic + pct_black_non_hispanic + pct_asian` ≤ 100 for each row
- Verify no negative values in any numeric field
- Verify `audit_confidence` exists for every field in `audit_source`
- Spot-check 5-10 "CORRECTED" flags against the original data to confirm improvements
