/**
 * fetch_historical_census.cjs
 * ──────────────────────────
 * Fetches real Census Bureau data for historical years (2000, 2010, 2015)
 * and merges it into the existing audited data files (which have 2020+2023).
 *
 * Coverage: only tracts whose codes match across decades get data.
 * Tracts created after 2010 (suburban expansion, splits) will have no
 * historical data — the app's charts already handle gaps gracefully.
 *
 * Usage:
 *   CENSUS_API_KEY=your_key node scripts/fetch_historical_census.cjs
 */

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.CENSUS_API_KEY;
if (!API_KEY) {
  console.error("Set CENSUS_API_KEY environment variable");
  process.exit(1);
}

const ROSETTA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/region_tract_rosetta.json"), "utf-8")
);

const DEMO_PATH = path.join(__dirname, "../data/phase1_output/audited_demographics_normalized.json");
const PROP_PATH = path.join(__dirname, "../data/phase1_output/audited_property_normalized.json");
const SOCIO_PATH = path.join(__dirname, "../data/phase1_output/audited_socioeconomic_normalized.json");

// Counties in the dataset
const COUNTIES = [
  { state: "48", county: "453", name: "Travis" },
  { state: "48", county: "491", name: "Williamson" },
];

// Rate limiting
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Census API fetch ────────────────────────────────────────────────────

async function fetchTracts(dataset, variables, state, county) {
  const varsStr = variables.join(",");
  const url =
    `https://api.census.gov/data/${dataset}` +
    `?get=${varsStr}` +
    `&for=tract:*` +
    `&in=state:${state}&in=county:${county}` +
    `&key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  API error ${res.status} for ${dataset} county ${county}: ${text.slice(0, 100)}`);
    return new Map();
  }

  // 204 = No Content
  if (res.status === 204) {
    console.warn(`  No data (204) for ${dataset} county ${county}`);
    return new Map();
  }

  const data = await res.json();
  if (!data || !data.length) return new Map();

  const headers = data[0];
  const tractIdx = headers.indexOf("tract");
  const results = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const tractCode = row[tractIdx].padStart(6, "0");
    const obj = {};
    headers.forEach((h, j) => {
      if (h !== "state" && h !== "county" && h !== "tract") {
        const val = row[j];
        // Census uses -666666666 for "not available"
        if (val === null || val === "" || val === "-666666666") {
          obj[h] = null;
        } else {
          const n = Number(val);
          obj[h] = isNaN(n) ? null : n;
        }
      }
    });
    results.set(tractCode, obj);
  }
  return results;
}

async function fetchAllTracts(dataset, variables) {
  console.log(`  Fetching ${dataset} ...`);
  const merged = new Map();
  for (const c of COUNTIES) {
    const data = await fetchTracts(dataset, variables, c.state, c.county);
    for (const [tract, obj] of data) {
      merged.set(`${c.state}${c.county}${tract}`, { ...obj, _tractce: tract, _county: c.county });
    }
    await delay(300);
  }
  return merged;
}

// ── Build rosetta lookup by GEOID (state+county+tract) ──────────────────

// Map GEOID prefix (state+county) + tractce to region_id
const GEOID_TO_REGION = new Map();
const REGION_INFO = new Map();
ROSETTA.forEach((r) => {
  GEOID_TO_REGION.set(r.geoid22, r.region_id);
  REGION_INFO.set(r.region_id, r);
});

// For older decades, tract codes may differ. Build lookup by tractce for each county.
function buildTractLookup(countyFips) {
  const lookup = new Map();
  ROSETTA.forEach((r) => {
    if (r.geoid22.startsWith("48" + countyFips)) {
      lookup.set(r.tractce22, r);
    }
  });
  return lookup;
}

const TRAVIS_LOOKUP = buildTractLookup("453");
const WILLIAMSON_LOOKUP = buildTractLookup("491");

function findRegion(tractce, countyFips) {
  const lookup = countyFips === "453" ? TRAVIS_LOOKUP : WILLIAMSON_LOOKUP;
  return lookup.get(tractce) || null;
}

// ── ACS variable lists ──────────────────────────────────────────────────

// ACS variables differ between 2010 and 2015+.
// B15003 (education) and B23025 (employment) don't exist in 2010 ACS.
// Use B15002 (Sex by Educational Attainment) for education in 2010.
const ACS_DEMO_VARS_2015 = [
  "B01003_001E", // total population
  "B01002_001E", // median age
  "B03002_003E", // white non-hispanic
  "B03002_004E", // black non-hispanic
  "B03002_006E", // asian non-hispanic
  "B03002_012E", // hispanic/latino
  "B05002_013E", // foreign-born
  "B25003_001E", // total occupied housing
  "B25003_002E", // owner-occupied
  "B25070_010E", // renters paying 30%+
  "B25070_001E", // total renters (burden denom)
  "B15003_001E", // pop 25+ (education denom)
  "B15003_022E", // bachelor's
  "B15003_023E", // master's
  "B15003_024E", // professional
  "B15003_025E", // doctorate
];

const ACS_DEMO_VARS_2010 = [
  "B01003_001E", // total population
  "B01002_001E", // median age
  "B03002_003E", // white non-hispanic
  "B03002_004E", // black non-hispanic
  "B03002_006E", // asian non-hispanic
  "B03002_012E", // hispanic/latino
  "B05002_013E", // foreign-born
  "B25003_001E", // total occupied housing
  "B25003_002E", // owner-occupied
  "B25070_010E", // renters paying 30%+
  "B25070_001E", // total renters (burden denom)
  "B15002_001E", // pop 25+ by sex (education denom)
  "B15002_015E", // male bachelor's
  "B15002_016E", // male master's
  "B15002_017E", // male professional
  "B15002_018E", // male doctorate
  "B15002_032E", // female bachelor's
  "B15002_033E", // female master's
  "B15002_034E", // female professional
  "B15002_035E", // female doctorate
];

const ACS_PROP_VARS = [
  "B25077_001E", // median home value
  "B25064_001E", // median gross rent
  "B25002_001E", // total housing units
  "B25002_003E", // vacant housing units
];

const ACS_SOCIO_VARS_2015 = [
  "B19013_001E", // median household income
  "B17001_001E", // pop for poverty status
  "B17001_002E", // below poverty
  "B23025_002E", // in labor force
  "B23025_005E", // unemployed
  "B19083_001E", // gini coefficient
];

// B23025 doesn't exist in 2010 ACS — unemployment not available at tract level
const ACS_SOCIO_VARS_2010 = [
  "B19013_001E", // median household income
  "B17001_001E", // pop for poverty status
  "B17001_002E", // below poverty
  "B19083_001E", // gini coefficient
];

// 2000 SF1 uses different variable names
const SF1_2000_VARS = [
  "P001001", // total population
  "P003003", // white alone
  "P003004", // black alone
  "P003006", // asian alone
  "P004002", // hispanic/latino
  "H001001", // total housing units
  "H003001", // total occupied housing
  "H003002", // owner-occupied
];

// 2010 SF1 variables
const SF1_2010_VARS = [
  "P001001", // total population
  "P003002", // white alone
  "P003003", // black alone
  "P003005", // asian alone
  "P004003", // hispanic/latino
  "H001001", // total housing units
  "H003001", // total occupied housing
  "H003002", // owner-occupied
];

// ── Row builders ────────────────────────────────────────────────────────

function buildDemoRowFromACS(regionId, regionName, d, dataYear, source) {
  if (!d) return null;
  const totalPop = d.B01003_001E;
  if (!totalPop || totalPop <= 0) return null;

  const white = d.B03002_003E ?? 0;
  const black = d.B03002_004E ?? 0;
  const asian = d.B03002_006E ?? 0;
  const hispanic = d.B03002_012E ?? 0;
  const foreignBorn = d.B05002_013E;

  const totalOccupied = d.B25003_001E;
  const ownerOccupied = d.B25003_002E;
  const pctOwner = totalOccupied > 0 ? +((ownerOccupied / totalOccupied) * 100).toFixed(1) : null;

  const rentBurdened = d.B25070_010E;
  const totalRenters = d.B25070_001E;
  const rentBurden = totalRenters > 0 ? +((rentBurdened / totalRenters) * 100).toFixed(1) : null;

  // Education: B15003 (2015+) or B15002 (2010)
  let pctBach = null;
  if (d.B15003_001E != null) {
    const bach = (d.B15003_022E || 0) + (d.B15003_023E || 0) + (d.B15003_024E || 0) + (d.B15003_025E || 0);
    pctBach = d.B15003_001E > 0 ? +((bach / d.B15003_001E) * 100).toFixed(1) : null;
  } else if (d.B15002_001E != null) {
    const bach = (d.B15002_015E || 0) + (d.B15002_016E || 0) + (d.B15002_017E || 0) + (d.B15002_018E || 0) +
                 (d.B15002_032E || 0) + (d.B15002_033E || 0) + (d.B15002_034E || 0) + (d.B15002_035E || 0);
    pctBach = d.B15002_001E > 0 ? +((bach / d.B15002_001E) * 100).toFixed(1) : null;
  }

  return {
    year: dataYear,
    region_id: regionId,
    region: regionName,
    total_population: totalPop,
    median_age: d.B01002_001E,
    pct_hispanic: +((hispanic / totalPop) * 100).toFixed(1),
    pct_white_non_hispanic: +((white / totalPop) * 100).toFixed(1),
    pct_black_non_hispanic: +((black / totalPop) * 100).toFixed(1),
    pct_asian: +((asian / totalPop) * 100).toFixed(1),
    pct_foreign_born: foreignBorn != null ? +((foreignBorn / totalPop) * 100).toFixed(1) : null,
    pct_owner_occupied: pctOwner,
    rent_burden_pct: rentBurden,
    pct_bachelors_degree_or_higher: pctBach,
    pct_65_and_over: null, // would need age bracket vars
    audit_source: source,
    audit_confidence: { total: "high", pct_white: "high", pct_hispanic: "high", pct_black: "high", pct_asian: "high" },
    audit_notes: `Fetched from Census Bureau API - ${source}`,
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

function buildDemoRowFromSF1_2010(regionId, regionName, d) {
  if (!d) return null;
  const totalPop = d.P001001;
  if (!totalPop || totalPop <= 0) return null;

  const white = d.P003002 ?? 0;
  const black = d.P003003 ?? 0;
  const asian = d.P003005 ?? 0;
  const hispanic = d.P004003 ?? 0;

  const totalOccupied = d.H003001;
  const ownerOccupied = d.H003002;
  const pctOwner = totalOccupied > 0 ? +((ownerOccupied / totalOccupied) * 100).toFixed(1) : null;

  return {
    year: 2010,
    region_id: regionId,
    region: regionName,
    total_population: totalPop,
    median_age: null,
    pct_hispanic: +((hispanic / totalPop) * 100).toFixed(1),
    pct_white_non_hispanic: +((white / totalPop) * 100).toFixed(1),
    pct_black_non_hispanic: +((black / totalPop) * 100).toFixed(1),
    pct_asian: +((asian / totalPop) * 100).toFixed(1),
    pct_foreign_born: null,
    pct_owner_occupied: pctOwner,
    rent_burden_pct: null,
    pct_bachelors_degree_or_higher: null,
    pct_65_and_over: null,
    audit_source: "Decennial Census 2010 SF1",
    audit_confidence: { total: "high", pct_white: "high", pct_hispanic: "high", pct_black: "high", pct_asian: "high" },
    audit_notes: "Decennial Census 2010 - population and race counts only",
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

function buildDemoRowFromSF1_2000(regionId, regionName, d) {
  if (!d) return null;
  const totalPop = d.P001001;
  if (!totalPop || totalPop <= 0) return null;

  const white = d.P003003 ?? 0;
  const black = d.P003004 ?? 0;
  const asian = d.P003006 ?? 0;
  const hispanic = d.P004002 ?? 0;

  const totalOccupied = d.H003001;
  const ownerOccupied = d.H003002;
  const pctOwner = totalOccupied > 0 ? +((ownerOccupied / totalOccupied) * 100).toFixed(1) : null;

  return {
    year: 2000,
    region_id: regionId,
    region: regionName,
    total_population: totalPop,
    median_age: null,
    pct_hispanic: +((hispanic / totalPop) * 100).toFixed(1),
    pct_white_non_hispanic: +((white / totalPop) * 100).toFixed(1),
    pct_black_non_hispanic: +((black / totalPop) * 100).toFixed(1),
    pct_asian: +((asian / totalPop) * 100).toFixed(1),
    pct_foreign_born: null,
    pct_owner_occupied: pctOwner,
    rent_burden_pct: null,
    pct_bachelors_degree_or_higher: null,
    pct_65_and_over: null,
    audit_source: "Decennial Census 2000 SF1",
    audit_confidence: { total: "high", pct_white: "high", pct_hispanic: "high", pct_black: "high", pct_asian: "high" },
    audit_notes: "Decennial Census 2000 - population and race counts only",
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

function buildPropRowFromACS(regionId, regionName, d, dataYear, source) {
  if (!d) return null;
  const homeVal = d.B25077_001E;
  const rent = d.B25064_001E;
  if (homeVal == null && rent == null) return null;

  const totalUnits = d.B25002_001E;
  const vacant = d.B25002_003E;

  return {
    year: dataYear,
    region_id: regionId,
    region: regionName,
    median_home_value: homeVal,
    median_rent_monthly: rent,
    total_housing_units: totalUnits,
    vacancy_rate: totalUnits > 0 ? +((vacant / totalUnits) * 100).toFixed(1) : null,
    audit_source: source,
    audit_confidence: { median_home_value: "high", median_rent_monthly: "high" },
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
    pct_home_value_change_yoy: null,
  };
}

function buildSocioRowFromACS(regionId, regionName, d, dataYear, source) {
  if (!d) return null;
  const income = d.B19013_001E;
  if (income == null) return null;

  const popPov = d.B17001_001E;
  const belowPov = d.B17001_002E;
  const laborForce = d.B23025_002E ?? null;
  const unemployed = d.B23025_005E ?? null;

  return {
    year: dataYear,
    region_id: regionId,
    region: regionName,
    median_household_income: income,
    poverty_rate: popPov > 0 ? +((belowPov / popPov) * 100).toFixed(1) : null,
    unemployment_rate: laborForce > 0 ? +((unemployed / laborForce) * 100).toFixed(1) : null,
    gini_coefficient: d.B19083_001E,
    eviction_filing_rate: null,
    snap_participation_rate: null,
    audit_source: source,
    audit_confidence: { median_household_income: "high", poverty_rate: "high", unemployment_rate: "high" },
    audit_flags: [],
    audit_timestamp: new Date().toISOString(),
  };
}

// ── Main pipeline ───────────────────────────────────────────────────────

async function main() {
  console.log("=== Historical Census Data Fetch ===");
  console.log(`Tracts in rosetta: ${ROSETTA.length}`);

  const newDemo = [];
  const newProp = [];
  const newSocio = [];

  // ── 2000 Decennial SF1 (demographics only) ──
  console.log("\n--- 2000 Decennial Census SF1 ---");
  const sf1_2000 = await fetchAllTracts("2000/dec/sf1", SF1_2000_VARS);
  console.log(`  Got ${sf1_2000.size} tracts`);

  let matched2000 = 0;
  for (const [geoid, d] of sf1_2000) {
    const tractce = d._tractce;
    const county = d._county;
    const region = findRegion(tractce, county);
    if (!region) continue;
    matched2000++;
    const row = buildDemoRowFromSF1_2000(region.region_id, region.region_name, d);
    if (row) newDemo.push(row);
  }
  console.log(`  Matched to rosetta: ${matched2000}`);
  console.log(`  Demo rows created: ${newDemo.length}`);

  // ── 2010 Decennial SF1 (demographics only — higher confidence than ACS for race) ──
  console.log("\n--- 2010 Decennial Census SF1 ---");
  const sf1_2010 = await fetchAllTracts("2010/dec/sf1", SF1_2010_VARS);
  console.log(`  Got ${sf1_2010.size} tracts`);

  let matched2010sf1 = 0;
  const demo2010sf1 = [];
  for (const [geoid, d] of sf1_2010) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    matched2010sf1++;
    const row = buildDemoRowFromSF1_2010(region.region_id, region.region_name, d);
    if (row) demo2010sf1.push(row);
  }
  console.log(`  Matched: ${matched2010sf1}, demo rows: ${demo2010sf1.length}`);

  // ── 2010 ACS 5-year (full data — supplements SF1 with economic data) ──
  console.log("\n--- 2010 ACS 2006-2010 ---");
  const acs2010Demo = await fetchAllTracts("2010/acs/acs5", ACS_DEMO_VARS_2010);
  const acs2010Prop = await fetchAllTracts("2010/acs/acs5", ACS_PROP_VARS);
  const acs2010Socio = await fetchAllTracts("2010/acs/acs5", ACS_SOCIO_VARS_2010);

  let matched2010acs = 0;
  for (const [geoid, d] of acs2010Demo) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    matched2010acs++;

    // Use SF1 for demographics (exact count), ACS for supplemental fields
    const sf1Row = demo2010sf1.find((r) => r.region_id === region.region_id);
    if (sf1Row) {
      // Merge ACS fields into SF1 row
      const acsRow = buildDemoRowFromACS(region.region_id, region.region_name, d, 2010, "Decennial 2010 SF1 + ACS 2006-2010");
      if (acsRow) {
        sf1Row.median_age = acsRow.median_age;
        sf1Row.pct_foreign_born = acsRow.pct_foreign_born;
        sf1Row.rent_burden_pct = acsRow.rent_burden_pct;
        sf1Row.pct_bachelors_degree_or_higher = acsRow.pct_bachelors_degree_or_higher;
        sf1Row.audit_source = "Decennial 2010 SF1 + ACS 2006-2010";
        sf1Row.audit_notes = "Race from Decennial 2010, supplemental from ACS 2006-2010";
      }
    } else {
      // No SF1 match — use ACS-only row
      const row = buildDemoRowFromACS(region.region_id, region.region_name, d, 2010, "ACS 2006-2010");
      if (row) demo2010sf1.push(row);
    }
  }
  newDemo.push(...demo2010sf1);

  // Property and Socio from 2010 ACS
  for (const [geoid, d] of acs2010Prop) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    const row = buildPropRowFromACS(region.region_id, region.region_name, d, 2010, "ACS 2006-2010");
    if (row) newProp.push(row);
  }
  for (const [geoid, d] of acs2010Socio) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    const row = buildSocioRowFromACS(region.region_id, region.region_name, d, 2010, "ACS 2006-2010");
    if (row) newSocio.push(row);
  }
  console.log(`  Matched: ${matched2010acs}, prop: ${newProp.length}, socio: ${newSocio.length}`);

  // ── 2015 ACS 5-year ──
  console.log("\n--- 2015 ACS 2011-2015 ---");
  const acs2015Demo = await fetchAllTracts("2015/acs/acs5", ACS_DEMO_VARS_2015);
  const acs2015Prop = await fetchAllTracts("2015/acs/acs5", ACS_PROP_VARS);
  const acs2015Socio = await fetchAllTracts("2015/acs/acs5", ACS_SOCIO_VARS_2015);

  let matched2015 = 0;
  const propBefore = newProp.length;
  const socioBefore = newSocio.length;
  for (const [geoid, d] of acs2015Demo) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    matched2015++;
    const row = buildDemoRowFromACS(region.region_id, region.region_name, d, 2015, "ACS 2011-2015");
    if (row) newDemo.push(row);
  }
  for (const [geoid, d] of acs2015Prop) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    const row = buildPropRowFromACS(region.region_id, region.region_name, d, 2015, "ACS 2011-2015");
    if (row) newProp.push(row);
  }
  for (const [geoid, d] of acs2015Socio) {
    const region = findRegion(d._tractce, d._county);
    if (!region) continue;
    const row = buildSocioRowFromACS(region.region_id, region.region_name, d, 2015, "ACS 2011-2015");
    if (row) newSocio.push(row);
  }
  console.log(`  Matched: ${matched2015}`);
  console.log(`  Demo: ${newDemo.length - demo2010sf1.length - matched2000}, Prop: ${newProp.length - propBefore}, Socio: ${newSocio.length - socioBefore}`);

  // ── Merge with existing data ──────────────────────────────────────────
  console.log("\n--- Merging with existing data ---");

  const existingDemo = JSON.parse(fs.readFileSync(DEMO_PATH, "utf-8"));
  const existingProp = JSON.parse(fs.readFileSync(PROP_PATH, "utf-8"));
  const existingSocio = JSON.parse(fs.readFileSync(SOCIO_PATH, "utf-8"));

  console.log(`  Existing: demo=${existingDemo.length}, prop=${existingProp.length}, socio=${existingSocio.length}`);
  console.log(`  New:      demo=${newDemo.length}, prop=${newProp.length}, socio=${newSocio.length}`);

  // Remove duplicates: if new data has same region_id+year as existing, skip existing
  function dedup(existing, additions) {
    const newKeys = new Set(additions.map((r) => `${r.region_id}_${r.year}`));
    const kept = existing.filter((r) => !newKeys.has(`${r.region_id}_${r.year}`));
    return [...kept, ...additions];
  }

  const mergedDemo = dedup(existingDemo, newDemo);
  const mergedProp = dedup(existingProp, newProp);
  const mergedSocio = dedup(existingSocio, newSocio);

  // Sort by region_id then year
  const sortFn = (a, b) => a.region_id - b.region_id || a.year - b.year;
  mergedDemo.sort(sortFn);
  mergedProp.sort(sortFn);
  mergedSocio.sort(sortFn);

  console.log(`  Merged:   demo=${mergedDemo.length}, prop=${mergedProp.length}, socio=${mergedSocio.length}`);

  // Compute pct_home_value_change_yoy for property data
  const propByRegion = new Map();
  mergedProp.forEach((r) => {
    if (!propByRegion.has(r.region_id)) propByRegion.set(r.region_id, []);
    propByRegion.get(r.region_id).push(r);
  });
  for (const [, rows] of propByRegion) {
    rows.sort((a, b) => a.year - b.year);
    for (let i = 0; i < rows.length; i++) {
      if (i === 0 || rows[i].median_home_value == null || rows[i - 1].median_home_value == null) {
        rows[i].pct_home_value_change_yoy = null;
      } else {
        const yearGap = rows[i].year - rows[i - 1].year;
        if (yearGap > 0 && rows[i - 1].median_home_value > 0) {
          const totalChange = (rows[i].median_home_value - rows[i - 1].median_home_value) / rows[i - 1].median_home_value;
          rows[i].pct_home_value_change_yoy = +((totalChange / yearGap) * 100).toFixed(2);
        }
      }
    }
  }

  // ── Write output ──────────────────────────────────────────────────────
  console.log("\n--- Writing output ---");

  // Back up existing files
  [DEMO_PATH, PROP_PATH, SOCIO_PATH].forEach((p) => {
    const bak = p + ".pre-historical.bak";
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(p, bak);
      console.log(`  Backed up ${path.basename(p)}`);
    }
  });

  fs.writeFileSync(DEMO_PATH, JSON.stringify(mergedDemo, null, 2));
  fs.writeFileSync(PROP_PATH, JSON.stringify(mergedProp, null, 2));
  fs.writeFileSync(SOCIO_PATH, JSON.stringify(mergedSocio, null, 2));

  console.log("  Files written.");

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n=== Summary ===");
  const years = [2000, 2010, 2015, 2020, 2023];
  for (const yr of years) {
    const dc = mergedDemo.filter((r) => r.year === yr).length;
    const pc = mergedProp.filter((r) => r.year === yr).length;
    const sc = mergedSocio.filter((r) => r.year === yr).length;
    console.log(`  ${yr}: demo=${dc}, prop=${pc}, socio=${sc} (of ${ROSETTA.length} tracts)`);
  }
  console.log("\nDone. Run the app to verify charts now show historical data.");
}

main().catch(console.error);
