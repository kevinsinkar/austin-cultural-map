#!/usr/bin/env node
/**
 * generate_name_candidates.js
 * ---------------------------
 * Identifies unresolved/mislabeled regions in REGION_INDEX and generates
 * neighborhood name candidates via Nominatim reverse-geocoding.
 * Outputs data/region_name_candidates.csv.
 *
 * Usage: node scripts/generate_name_candidates.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── Paths ────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const REGION_INDEX_PATH = path.join(ROOT, "data", "regionIndex.js");
const GEMINI_GOOGLE_PATH = path.join(ROOT, "scripts", "gemini_output", "google_maps_names.json");
const GEMINI_MASTER_PATH = path.join(ROOT, "scripts", "gemini_output", "master_remap.json");
const OUTPUT_CSV = path.join(ROOT, "data", "region_name_candidates.csv");

// ── Parse REGION_INDEX from ES module source ─────────────────────────────
function loadRegionIndex() {
  const src = fs.readFileSync(REGION_INDEX_PATH, "utf-8");
  const m = src.match(/export const REGION_INDEX = (\[[\s\S]*\]);/);
  if (!m) throw new Error("Could not parse REGION_INDEX from regionIndex.js");
  return JSON.parse(m[1]);
}

// ── Load Gemini caches ───────────────────────────────────────────────────
function loadGeminiCache() {
  const cache = new Map(); // region_id -> { name, confidence, reasoning }
  for (const fpath of [GEMINI_GOOGLE_PATH, GEMINI_MASTER_PATH]) {
    if (!fs.existsSync(fpath)) continue;
    const data = JSON.parse(fs.readFileSync(fpath, "utf-8"));
    for (const r of data.renames || []) {
      cache.set(r.region_id, {
        name: r.google_maps_name,
        confidence: r.confidence,
        reasoning: r.reasoning,
        source: path.basename(fpath),
      });
    }
  }
  return cache;
}

// ── Unresolved detection ─────────────────────────────────────────────────
const UNRESOLVED_PATTERNS = [
  /^Tract\b/i,
  /^\d+(\.\d+)?$/,              // purely numeric
  /\d+\.\d+/,                   // tract number like 18.38
  /\bPlanning Area\b/i,
  /\bCensus\b/i,
  /\bMUD\b/i,
  /\bETJ\b/i,
  /\bUnknown\b/i,
  /\bUnnamed\b/i,
  /#\d+/,                       // disambiguation suffix like #21
  /\(Moderate\)/i,              // risk descriptor artifact
  /\(High Risk\)/i,
  /\(Low\)/i,
];

function isUnresolved(displayName) {
  return UNRESOLVED_PATTERNS.some((p) => p.test(displayName));
}

// ── Nominatim reverse-geocode ────────────────────────────────────────────
function reverseGeocode(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
    `&format=jsonv2&zoom=14&addressdetails=1&extratags=1&namedetails=1`;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "AustinShiftingGround/1.0 (region-naming)" } },
      (res) => {
        if (res.statusCode === 429) {
          resolve({ _rateLimit: true });
          return;
        }
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({ _error: "parse error" }); }
        });
      }
    );
    req.on("error", (e) => resolve({ _error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ _error: "timeout" }); });
  });
}

function extractCandidates(data) {
  if (!data || data._error || data._rateLimit) return [];
  const addr = data.address || {};
  const names = data.namedetails || {};
  const candidates = [];
  const fields = [
    ["neighbourhood", addr.neighbourhood],
    ["suburb", addr.suburb],
    ["quarter", addr.quarter],
    ["city_district", addr.city_district],
    ["hamlet", addr.hamlet],
    ["namedetails", names.name],
    ["city", addr.city || addr.town],
  ];
  for (const [src, val] of fields) {
    if (val && !candidates.some((c) => c.name === val)) {
      candidates.push({ name: val, field: src });
    }
  }
  return candidates;
}

// ── Haversine distance (km) ──────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
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

// ── Confidence assignment ────────────────────────────────────────────────
const AUSTIN_BOUNDS = { latMin: 30.22, latMax: 30.52, lngMin: -97.86, lngMax: -97.60 };

function assignConfidence(lat, lng, candidates) {
  const outsideAustin =
    lat < AUSTIN_BOUNDS.latMin || lat > AUSTIN_BOUNDS.latMax ||
    lng < AUSTIN_BOUNDS.lngMin || lng > AUSTIN_BOUNDS.lngMax;

  if (outsideAustin) return "outside-austin";
  if (candidates.length > 0 && candidates[0].field === "neighbourhood") return "high";
  if (candidates.length > 0 && (candidates[0].field === "suburb" || candidates[0].field === "quarter")) return "medium";
  if (candidates.length > 0) return "medium";
  return "low";
}

// ── Determine city for outside-Austin regions ────────────────────────────
function guessCity(lat, lng) {
  if (lat > 30.45 && lng > -97.70) return "Pflugerville";
  if (lat > 30.50) return "Round Rock";
  if (lat > 30.40 && lng < -97.85) return "Cedar Park";
  if (lat < 30.30 && lng < -97.85) return "Bee Cave / Lakeway";
  if (lat < 30.22 && lng > -97.60) return "Manor area";
  if (lat < 30.20 && lng > -97.65 && lng < -97.55) return "Del Valle";
  return null;
}

// ── Sleep helper ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CSV escaping ─────────────────────────────────────────────────────────
function csvField(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("Loading REGION_INDEX...");
  const regions = loadRegionIndex();
  const visible = regions.filter((r) => !r.merge_into);
  const geminiCache = loadGeminiCache();

  console.log(`Total regions: ${regions.length}`);
  console.log(`Merged secondaries: ${regions.length - visible.length}`);
  console.log(`Visible regions: ${visible.length}`);

  // Step 1: Identify unresolved regions
  const unresolved = visible.filter((r) => isUnresolved(r.display_name));

  console.log(`\nUnresolved (by pattern): ${unresolved.length}`);
  for (const r of unresolved) {
    console.log(`  [${r.region_id}] ${r.display_name}`);
  }

  if (unresolved.length === 0) {
    console.log("\nNo unresolved regions found. Nothing to process.");
    return;
  }

  // Step 2: Reverse-geocode each unresolved centroid
  console.log(`\nReverse-geocoding ${unresolved.length} centroids via Nominatim...`);
  const results = [];

  for (let i = 0; i < unresolved.length; i++) {
    const r = unresolved[i];
    const lat = r.lat;
    const lng = r.lng;
    process.stdout.write(`  [${i + 1}/${unresolved.length}] Region ${r.region_id} (${r.display_name})...`);

    let data = await reverseGeocode(lat, lng);

    // Handle rate limiting
    if (data._rateLimit) {
      console.log(" rate-limited, waiting 30s...");
      await sleep(30000);
      data = await reverseGeocode(lat, lng);
    }

    const candidates = extractCandidates(data);
    const confidence = assignConfidence(lat, lng, candidates);

    // Best recommendation
    let recommendedName = "";
    let source = "nominatim";
    let alternatives = [];
    let notes = "";

    if (candidates.length > 0) {
      recommendedName = candidates[0].name;
      alternatives = candidates.slice(1).map((c) => c.name);
    }

    // For outside-Austin, prepend city
    if (confidence === "outside-austin") {
      const city = data?.address?.city || data?.address?.town || guessCity(lat, lng);
      if (city && recommendedName && city !== recommendedName) {
        notes = `Outside Austin — city: ${city}`;
      } else if (city && !recommendedName) {
        recommendedName = city;
        source = "city-lookup";
      }
    }

    // If no Nominatim result, find nearest named region
    if (!recommendedName) {
      let bestDist = Infinity;
      let bestRegion = null;
      for (const vr of visible) {
        if (vr.region_id === r.region_id) continue;
        if (isUnresolved(vr.display_name)) continue;
        const d = haversine(lat, lng, vr.lat, vr.lng);
        if (d < bestDist) { bestDist = d; bestRegion = vr; }
      }
      if (bestRegion && bestDist < 3) {
        recommendedName = `Near ${bestRegion.display_name.split(" — ")[0]}`;
        source = "nearest-region";
        notes = `${bestDist.toFixed(1)}km from ${bestRegion.display_name} centroid`;
      } else {
        source = "manual-heuristic";
        notes = "No Nominatim or nearby region data";
      }
    }

    // Step 5: Cross-reference with Gemini cache
    const gemini = geminiCache.get(r.region_id);
    if (gemini) {
      if (!alternatives.includes(gemini.name) && gemini.name !== recommendedName) {
        alternatives.push(`${gemini.name} (gemini-cache)`);
      }
      if (!recommendedName) {
        recommendedName = gemini.name;
        source = "gemini-cache";
      }
    }

    // For names with artifacts, suggest cleaned version
    const cleanedName = r.display_name
      .replace(/\s*#\d+/, "")
      .replace(/\s*\((Moderate|High Risk|Low)\)/i, "")
      .trim();
    if (cleanedName !== r.display_name && cleanedName !== recommendedName) {
      if (!alternatives.includes(cleanedName)) {
        alternatives.unshift(cleanedName);
      }
      if (!notes) notes = "Current name has artifact suffixes";
    }

    results.push({
      region_id: r.region_id,
      current_name: r.display_name,
      centroid_lat: lat,
      centroid_lng: lng,
      recommended_name: recommendedName,
      confidence,
      alternatives: alternatives.slice(0, 3).join("; "),
      source,
      notes,
    });

    console.log(` → ${recommendedName || "(none)"} [${confidence}]`);

    // Rate limit: 1.1s between requests
    if (i < unresolved.length - 1) await sleep(1100);
  }

  // Step 6: Output CSV
  const header = "region_id,current_name,centroid_lat,centroid_lng,recommended_name,confidence,alternatives,source,notes";
  const rows = results.map((r) =>
    [r.region_id, r.current_name, r.centroid_lat, r.centroid_lng, r.recommended_name, r.confidence, r.alternatives, r.source, r.notes]
      .map(csvField)
      .join(",")
  );
  fs.writeFileSync(OUTPUT_CSV, [header, ...rows].join("\n") + "\n", "utf-8");
  console.log(`\nCSV written to: ${OUTPUT_CSV}`);

  // Console summary
  console.log("\n════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("════════════════════════════════════════");
  console.log(`  Total VISIBLE_REGIONS:       ${visible.length}`);
  console.log(`  Already named (skipped):     ${visible.length - unresolved.length}`);
  console.log(`  Unresolved (processed):      ${unresolved.length}`);

  const conf = { high: 0, medium: 0, low: 0, "outside-austin": 0 };
  for (const r of results) conf[r.confidence] = (conf[r.confidence] || 0) + 1;
  console.log(`  Confidence breakdown:`);
  for (const [k, v] of Object.entries(conf)) console.log(`    ${k}: ${v}`);

  // Top 10 most common recommended names
  const nameCounts = {};
  for (const r of results) {
    if (r.recommended_name) nameCounts[r.recommended_name] = (nameCounts[r.recommended_name] || 0) + 1;
  }
  const topNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`  Top recommended names:`);
  for (const [name, count] of topNames) console.log(`    ${name}: ${count}`);

  // Regions with no data
  const noData = results.filter((r) => !r.recommended_name);
  if (noData.length > 0) {
    console.log(`  Regions with NO data: ${noData.length}`);
    for (const r of noData) console.log(`    [${r.region_id}] ${r.current_name}`);
  } else {
    console.log(`  All regions received at least one candidate.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
