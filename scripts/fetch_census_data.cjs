/**
 * fetch_census_data.cjs
 * ─────────────────────
 * Fetches real Census Bureau data for all 269 tracts and writes
 * replacement Phase 1 JSON files.
 *
 * Usage: CENSUS_API_KEY=xxx node scripts/fetch_census_data.cjs
 *
 * Outputs (backs up existing files first):
 *   data/phase1_output/audited_demographics_normalized.json
 *   data/phase1_output/audited_property_normalized.json
 *   data/phase1_output/audited_socioeconomic_normalized.json
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.CENSUS_API_KEY || process.env.CENSUS_DATA_API;
if (!API_KEY) {
  console.error("Set CENSUS_API_KEY or CENSUS_DATA_API environment variable");
  process.exit(1);
}

// ── Load rosetta stone ──
const ROSETTA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "region_tract_rosetta.json"), "utf-8")
);

// Group tracts by county (state FIPS + county FIPS)
const COUNTIES = {};
ROSETTA.forEach(r => {
  const state = r.geoid22.slice(0, 2);
  const county = r.geoid22.slice(2, 5);
  const key = `${state}_${county}`;
  if (!COUNTIES[key]) COUNTIES[key] = { state, county, tracts: [] };
  COUNTIES[key].tracts.push(r);
});

console.log("Counties:", Object.entries(COUNTIES).map(([k, v]) => `${k} (${v.tracts.length} tracts)`).join(", "));

// ── Rate limiting ──
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── Census API fetch ──
async function fetchCountyTracts(dataset, variables, state, county) {
  const varsStr = variables.join(",");
  const url = `https://api.census.gov/data/${dataset}`
    + `?get=${varsStr}`
    + `&for=tract:*`
    + `&in=state:${state}&in=county:${county}`
    + `&key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  API error ${res.status} for ${dataset} state:${state} county:${county}`);
    const text = await res.text();
    console.warn(`  ${text.slice(0, 200)}`);
    return new Map();
  }

  const data = await res.json();
  const headers = data[0];
  const tractIdx = headers.indexOf("tract");
  const results = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const tractCode = row[tractIdx];
    const obj = {};
    headers.forEach((h, j) => {
      if (h !== "state" && h !== "county" && h !== "tract") {
        const val = row[j];
        // Census uses -666666666 for "not available"
        obj[h] = (val === null || val === "" || val === "-666666666" || Number(val) === -666666666)
          ? null : Number(val);
      }
    });
    results.set(tractCode.padStart(6, "0"), obj);
  }
  return results;
}

async function fetchAllTracts(dataset, variables) {
  console.log(`  Fetching ${dataset}...`);
  const merged = new Map();

  for (const [key, { state, county }] of Object.entries(COUNTIES)) {
    try {
      const data = await fetchCountyTracts(dataset, variables, state, county);
      for (const [tract, vals] of data) merged.set(tract, vals);
      await delay(250);
    } catch (e) {
      console.warn(`  Error fetching ${key}: ${e.message}`);
    }
  }

  console.log(`  Got ${merged.size} tracts`);
  return merged;
}

// ── Variable definitions ──

const DEMO_VARS_ACS = [
  "B01003_001E", "B01002_001E",
  "B03002_003E", "B03002_004E", "B03002_006E", "B03002_012E",
  "B05002_013E",
  "B25003_001E", "B25003_002E",
  "B25070_010E", "B25070_001E",
  "B15003_001E", "B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E",
  // 65+ age brackets (male)
  "B01001_020E", "B01001_021E", "B01001_022E", "B01001_023E", "B01001_024E", "B01001_025E",
  // 65+ age brackets (female)
  "B01001_044E", "B01001_045E", "B01001_046E", "B01001_047E", "B01001_048E", "B01001_049E",
];

const PROP_VARS_ACS = [
  "B25077_001E", "B25064_001E", "B25002_001E", "B25002_003E",
];

const SOCIO_VARS_ACS = [
  "B19013_001E", "B17001_001E", "B17001_002E",
  "B23025_002E", "B23025_005E", "B19083_001E",
];

// Decennial 2020 PL variables — use P2 table for non-Hispanic breakdowns
// P2_005N = White alone, Not Hispanic/Latino
// P2_006N = Black alone, Not Hispanic/Latino
// P2_008N = Asian alone, Not Hispanic/Latino
const DEMO_VARS_DEC2020 = [
  "P1_001N", "P2_002N", "P2_005N", "P2_006N", "P2_008N",
];

// Decennial 2010 SF1 variables — use P005 (Not Hispanic by Race)
const DEMO_VARS_DEC2010 = [
  "P001001", "P005003", "P005004", "P005006", "P004003",
];

// Decennial 2000 SF1 variables — use P007 (Not Hispanic by Race)
const DEMO_VARS_DEC2000 = [
  "P001001", "P007003", "P007004", "P007006", "P004002",
];

// ── Row builders ──

function buildDemoRow(regionId, tractce, data, year, source) {
  const d = data.get(tractce);
  if (!d) return null;

  const r = ROSETTA.find(x => x.region_id === regionId);
  const totalPop = d.B01003_001E;
  if (!totalPop || totalPop <= 0) return null;

  const white = d.B03002_003E || 0;
  const black = d.B03002_004E || 0;
  const asian = d.B03002_006E || 0;
  const hispanic = d.B03002_012E || 0;
  const foreignBorn = d.B05002_013E;

  const totalOccupied = d.B25003_001E;
  const ownerOccupied = d.B25003_002E;
  const pctOwnerOcc = totalOccupied > 0 ? +((ownerOccupied / totalOccupied) * 100).toFixed(1) : null;

  const rentBurdened = d.B25070_010E;
  const totalRenters = d.B25070_001E;
  const rentBurdenPct = totalRenters > 0 ? +((rentBurdened / totalRenters) * 100).toFixed(1) : null;

  const bach = (d.B15003_022E || 0) + (d.B15003_023E || 0) + (d.B15003_024E || 0) + (d.B15003_025E || 0);
  const pop25 = d.B15003_001E;
  const pctBach = pop25 > 0 ? +((bach / pop25) * 100).toFixed(1) : null;

  // 65+ = sum of male 65+ brackets + female 65+ brackets
  const male65 = (d.B01001_020E || 0) + (d.B01001_021E || 0) + (d.B01001_022E || 0)
    + (d.B01001_023E || 0) + (d.B01001_024E || 0) + (d.B01001_025E || 0);
  const female65 = (d.B01001_044E || 0) + (d.B01001_045E || 0) + (d.B01001_046E || 0)
    + (d.B01001_047E || 0) + (d.B01001_048E || 0) + (d.B01001_049E || 0);
  const pct65 = totalPop > 0 ? +(((male65 + female65) / totalPop) * 100).toFixed(1) : null;

  return {
    year,
    region_id: regionId,
    region: r?.region_name || "",
    total_population: totalPop,
    median_age: d.B01002_001E,
    pct_hispanic: +((hispanic / totalPop) * 100).toFixed(1),
    pct_white_non_hispanic: +((white / totalPop) * 100).toFixed(1),
    pct_black_non_hispanic: +((black / totalPop) * 100).toFixed(1),
    pct_asian: +((asian / totalPop) * 100).toFixed(1),
    pct_foreign_born: foreignBorn != null ? +((foreignBorn / totalPop) * 100).toFixed(1) : null,
    pct_owner_occupied: pctOwnerOcc,
    rent_burden_pct: rentBurdenPct,
    pct_bachelors_degree_or_higher: pctBach,
    pct_65_and_over: pct65,
    audit_source: source,
    audit_confidence: { total: "high", median_age: "high", pct_white: "high", pct_hispanic: "high", pct_black: "high", pct_asian: "high" },
    audit_notes: `Fetched from Census Bureau API - ${source}`,
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

function buildDecennialDemoRow(regionId, tractce, data, year, varMap, source) {
  const d = data.get(tractce);
  if (!d) return null;

  const r = ROSETTA.find(x => x.region_id === regionId);
  const totalPop = d[varMap.pop];
  if (!totalPop || totalPop <= 0) return null;

  const white = d[varMap.white] || 0;
  const black = d[varMap.black] || 0;
  const asian = d[varMap.asian] || 0;
  const hispanic = d[varMap.hispanic] || 0;

  return {
    year,
    region_id: regionId,
    region: r?.region_name || "",
    total_population: totalPop,
    median_age: null,
    pct_hispanic: +((hispanic / totalPop) * 100).toFixed(1),
    pct_white_non_hispanic: +((white / totalPop) * 100).toFixed(1),
    pct_black_non_hispanic: +((black / totalPop) * 100).toFixed(1),
    pct_asian: +((asian / totalPop) * 100).toFixed(1),
    pct_foreign_born: null,
    pct_owner_occupied: null,
    rent_burden_pct: null,
    pct_bachelors_degree_or_higher: null,
    pct_65_and_over: null,
    audit_source: source,
    audit_confidence: { total: "high", pct_white: "high", pct_hispanic: "high", pct_black: "high", pct_asian: "high" },
    audit_notes: `Decennial Census ${year} - population and race counts only`,
    audit_flags: year < 2005 ? ["PRE_ACS"] : [],
    audit_timestamp: new Date().toISOString(),
  };
}

function buildPropRow(regionId, tractce, data, year, source) {
  const d = data.get(tractce);
  if (!d) return null;
  const r = ROSETTA.find(x => x.region_id === regionId);

  const totalUnits = d.B25002_001E;
  const vacantUnits = d.B25002_003E;

  return {
    year,
    region_id: regionId,
    region: r?.region_name || "",
    median_home_value: d.B25077_001E,
    median_rent_monthly: d.B25064_001E,
    total_housing_units: totalUnits,
    vacancy_rate: totalUnits > 0 ? +((vacantUnits / totalUnits) * 100).toFixed(1) : null,
    audit_source: source,
    audit_confidence: { median_home_value: "high", median_rent_monthly: "high" },
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

function buildSocioRow(regionId, tractce, data, year, source) {
  const d = data.get(tractce);
  if (!d) return null;
  const r = ROSETTA.find(x => x.region_id === regionId);

  const povPop = d.B17001_001E;
  const povBelow = d.B17001_002E;
  const laborForce = d.B23025_002E;
  const unemployed = d.B23025_005E;

  return {
    year,
    region_id: regionId,
    region: r?.region_name || "",
    median_household_income: d.B19013_001E,
    poverty_rate: povPop > 0 ? +((povBelow / povPop) * 100).toFixed(1) : null,
    unemployment_rate: laborForce > 0 ? +((unemployed / laborForce) * 100).toFixed(1) : null,
    gini_coefficient: d.B19083_001E != null ? +(d.B19083_001E).toFixed(4) : null,
    eviction_filing_rate: null, // Not in Census — separate data source
    snap_participation_rate: null, // Requires subject table endpoint
    audit_source: source,
    audit_confidence: { median_household_income: "high", poverty_rate: "high", unemployment_rate: "high" },
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

// ── Interpolation ──

function interpolateRow(rowA, rowB, targetYear) {
  const t = (targetYear - rowA.year) / (rowB.year - rowA.year);
  const result = { ...rowA, year: targetYear };

  const numericFields = [
    "total_population", "median_age", "pct_hispanic",
    "pct_white_non_hispanic", "pct_black_non_hispanic", "pct_asian",
    "pct_foreign_born", "pct_owner_occupied", "rent_burden_pct",
    "pct_bachelors_degree_or_higher", "pct_65_and_over",
    "median_home_value", "median_rent_monthly", "total_housing_units", "vacancy_rate",
    "median_household_income", "poverty_rate", "unemployment_rate", "gini_coefficient",
  ];

  for (const field of numericFields) {
    const a = rowA[field];
    const b = rowB[field];
    if (a != null && b != null) {
      result[field] = +(a + t * (b - a)).toFixed(2);
    } else {
      result[field] = a ?? b ?? null;
    }
  }

  result.audit_source = `Interpolated from ${rowA.year} and ${rowB.year}`;
  result.audit_confidence = "medium";
  result.audit_flags = ["INTERPOLATED"];
  return result;
}

function interpolateGaps(rows, targetYears) {
  const byRegion = new Map();
  rows.forEach(r => {
    if (!byRegion.has(r.region_id)) byRegion.set(r.region_id, []);
    byRegion.get(r.region_id).push(r);
  });

  const interpolated = [];
  for (const [, regionRows] of byRegion) {
    regionRows.sort((a, b) => a.year - b.year);
    for (const ty of targetYears) {
      if (regionRows.some(r => r.year === ty)) continue;
      const before = regionRows.filter(r => r.year < ty).pop();
      const after = regionRows.find(r => r.year > ty);
      if (before && after) {
        interpolated.push(interpolateRow(before, after, ty));
      }
    }
  }
  return interpolated;
}

// ── Main pipeline ──

async function main() {
  console.log("\n=== Census Data Fetch Pipeline ===\n");
  console.log(`Rosetta: ${ROSETTA.length} tracts`);

  const allDemo = [];
  const allProp = [];
  const allSocio = [];

  // ── Decennial 2020 ──
  console.log("\n--- Decennial 2020 ---");
  try {
    const dec2020 = await fetchAllTracts("2020/dec/pl", DEMO_VARS_DEC2020);
    for (const r of ROSETTA) {
      const row = buildDecennialDemoRow(r.region_id, r.tractce22, dec2020, 2020,
        { pop: "P1_001N", white: "P2_005N", black: "P2_006N", asian: "P2_008N", hispanic: "P2_002N" },
        "Decennial Census 2020 PL");
      if (row) allDemo.push(row);
    }
    console.log(`  Built ${allDemo.length} decennial 2020 demo rows`);
  } catch (e) { console.warn("  Decennial 2020 failed:", e.message); }

  // ── Decennial 2010 ──
  console.log("\n--- Decennial 2010 ---");
  try {
    const dec2010 = await fetchAllTracts("2010/dec/sf1", DEMO_VARS_DEC2010);
    const before = allDemo.length;
    for (const r of ROSETTA) {
      const row = buildDecennialDemoRow(r.region_id, r.tractce22, dec2010, 2010,
        { pop: "P001001", white: "P005003", black: "P005004", asian: "P005006", hispanic: "P004003" },
        "Decennial Census 2010 SF1");
      if (row) allDemo.push(row);
    }
    console.log(`  Built ${allDemo.length - before} decennial 2010 demo rows`);
  } catch (e) { console.warn("  Decennial 2010 failed:", e.message); }

  // ── Decennial 2000 ──
  console.log("\n--- Decennial 2000 ---");
  try {
    const dec2000 = await fetchAllTracts("2000/dec/sf1", DEMO_VARS_DEC2000);
    const before = allDemo.length;
    for (const r of ROSETTA) {
      const row = buildDecennialDemoRow(r.region_id, r.tractce22, dec2000, 2000,
        { pop: "P001001", white: "P007003", black: "P007004", asian: "P007006", hispanic: "P004002" },
        "Decennial Census 2000 SF1");
      if (row) allDemo.push(row);
    }
    console.log(`  Built ${allDemo.length - before} decennial 2000 demo rows`);
  } catch (e) { console.warn("  Decennial 2000 failed:", e.message); }

  // ── ACS 5-Year vintages ──
  const ACS_VINTAGES = [
    { apiYear: "2010", vintage: "2006-2010", dataYear: 2010 },
    { apiYear: "2015", vintage: "2011-2015", dataYear: 2015 },
    { apiYear: "2020", vintage: "2016-2020", dataYear: 2020 },
    { apiYear: "2023", vintage: "2019-2023", dataYear: 2023 },
  ];

  for (const v of ACS_VINTAGES) {
    console.log(`\n--- ACS ${v.vintage} ---`);

    const demoData = await fetchAllTracts(`${v.apiYear}/acs/acs5`, DEMO_VARS_ACS);
    const propData = await fetchAllTracts(`${v.apiYear}/acs/acs5`, PROP_VARS_ACS);
    const socioData = await fetchAllTracts(`${v.apiYear}/acs/acs5`, SOCIO_VARS_ACS);

    let dCount = 0, pCount = 0, sCount = 0;
    for (const r of ROSETTA) {
      const dRow = buildDemoRow(r.region_id, r.tractce22, demoData, v.dataYear, `ACS ${v.vintage}`);
      if (dRow) { allDemo.push(dRow); dCount++; }

      const pRow = buildPropRow(r.region_id, r.tractce22, propData, v.dataYear, `ACS ${v.vintage}`);
      if (pRow) { allProp.push(pRow); pCount++; }

      const sRow = buildSocioRow(r.region_id, r.tractce22, socioData, v.dataYear, `ACS ${v.vintage}`);
      if (sRow) { allSocio.push(sRow); sCount++; }
    }
    console.log(`  Built demo:${dCount} prop:${pCount} socio:${sCount}`);
  }

  // ── Merge ACS into decennial rows (ACS has more fields for same year) ──
  // For years where we have both decennial and ACS (2010, 2020),
  // merge ACS fields into the decennial row
  console.log("\n--- Merging ACS fields into decennial rows ---");
  const byKey = new Map();
  allDemo.forEach(r => {
    const key = `${r.region_id}_${r.year}`;
    if (!byKey.has(key)) {
      byKey.set(key, r);
    } else {
      // Merge: prefer ACS values for fields the decennial doesn't have
      const existing = byKey.get(key);
      const isExistingDecennial = existing.audit_source?.includes("Decennial");
      const isNewACS = r.audit_source?.includes("ACS");
      if (isExistingDecennial && isNewACS) {
        // ACS has more fields — merge ACS into decennial
        for (const [k, v] of Object.entries(r)) {
          if (v != null && existing[k] == null) existing[k] = v;
        }
        existing.audit_source = `${existing.audit_source} + ${r.audit_source}`;
      } else if (!isExistingDecennial) {
        // Keep newer/ACS row
        byKey.set(key, r);
      }
    }
  });

  const mergedDemo = [...byKey.values()];

  // ── Interpolation ──
  console.log("\n--- Interpolating intermediate years ---");
  const demoInterp = interpolateGaps(mergedDemo, [1995, 2005]);
  const propInterp = interpolateGaps(allProp, [2005]);
  const socioInterp = interpolateGaps(allSocio, [2005]);

  mergedDemo.push(...demoInterp);
  allProp.push(...propInterp);
  allSocio.push(...socioInterp);

  // Sort
  mergedDemo.sort((a, b) => a.region_id - b.region_id || a.year - b.year);
  allProp.sort((a, b) => a.region_id - b.region_id || a.year - b.year);
  allSocio.sort((a, b) => a.region_id - b.region_id || a.year - b.year);

  // ── Summary ──
  console.log("\n=== Summary ===");
  console.log(`Demographics: ${mergedDemo.length} rows`);
  console.log(`Property: ${allProp.length} rows`);
  console.log(`Socioeconomic: ${allSocio.length} rows`);

  const demoRegions = new Set(mergedDemo.map(r => r.region_id));
  const propRegions = new Set(allProp.map(r => r.region_id));
  const socioRegions = new Set(allSocio.map(r => r.region_id));
  console.log(`Regions: demo=${demoRegions.size} prop=${propRegions.size} socio=${socioRegions.size}`);

  const demoYears = [...new Set(mergedDemo.map(r => r.year))].sort((a, b) => a - b);
  console.log(`Demo years: ${demoYears.join(", ")}`);

  // ── Back up and write ──
  const DEMO_PATH = path.join(__dirname, "..", "data", "phase1_output", "audited_demographics_normalized.json");
  const PROP_PATH = path.join(__dirname, "..", "data", "phase1_output", "audited_property_normalized.json");
  const SOCIO_PATH = path.join(__dirname, "..", "data", "phase1_output", "audited_socioeconomic_normalized.json");

  [DEMO_PATH, PROP_PATH, SOCIO_PATH].forEach(p => {
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, p + ".bak");
      console.log(`Backed up ${path.basename(p)}`);
    }
  });

  fs.writeFileSync(DEMO_PATH, JSON.stringify(mergedDemo, null, 2));
  fs.writeFileSync(PROP_PATH, JSON.stringify(allProp, null, 2));
  fs.writeFileSync(SOCIO_PATH, JSON.stringify(allSocio, null, 2));

  console.log("\n=== Done ===");
  console.log("Run: npx vite build  to verify the app compiles with the new data.");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
