// Replaces the latest-survey rows in the three census files with the figures
// of one American Community Survey 5-year release.
//
//   node scripts/build_latest_acs.mjs            (or: npm run build:latest)
//   node scripts/build_latest_acs.mjs --dry      (report only, write nothing)
//   node scripts/build_latest_acs.mjs --check    (recompute the rows the files
//                                                 already hold from their own
//                                                 release and list differences;
//                                                 writes nothing)
//
// The release is LATEST_ACS in scripts/lib/census.mjs (2024 = the 2020-2024
// survey). To move the site to a newer release: change that one number, run
// this script, then "npm run build:stages". The app reads the year from the
// generated data, so no component needs editing.
//
// Why replace rather than add: two 5-year surveys that share interview years
// are not independent readings, so the site keeps one row per survey period.
// The rows of the release being replaced stay in git history.
//
// What each field is (the same definitions the earlier rows use):
//   demographics   population B03002_001... see FIELDS below. Shares are
//                  counts divided by the table's own universe.
//   rent burden    renters paying 50% or more of income / all renters (B25070)
//   yearly change  pct_home_value_change_yoy: change in median home value
//                  since the 2016-2020 survey, divided by the years between
//                  the two surveys' end years. A simple rate, not compounded.
//   evictions      eviction_filing_rate: BASTA filings in the survey's own
//                  five years, per 100 renter households per year. Renter
//                  households = housing units x (1 - vacancy) x (1 - owner
//                  share), from this release. Left empty under 30 renter
//                  households. Needs data/BASTA/ (not in git); without it the
//                  earlier figure is kept and flagged.
//   permits        new_construction_permits and commercial_sqft are not
//                  census figures. They are carried over unchanged from the
//                  row being replaced (City of Austin permits). No view on
//                  the site shows them.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, LATEST_ACS, acsSpan, loadTractTable } from "./lib/census.mjs";

const DRY = process.argv.includes("--dry");
const CHECK = process.argv.includes("--check");
const PREVIOUS_SURVEY = 2020;   // the 2016-2020 survey: the base for the yearly change in home value
const MIN_RENTER_HH = 30;       // no eviction rate on fewer renter households than this
const BASTA_CSV = join(ROOT, "data", "BASTA", "2014-2025_geography_table_2026-06-02.csv");
const BASTA_YEARS = [2014, 2025]; // what the extract covers
const OUTCOME_COLS = ["Default judgment", "Dismissed", "Ruling for defendant", "Ruling for plaintiff", "Unclear or Other Case Outcome"];

const FILES = {
  demo: join(ROOT, "data", "phase1_output", "audited_demographics_normalized.json"),
  prop: join(ROOT, "data", "phase1_output", "audited_property_normalized.json"),
  socio: join(ROOT, "data", "phase1_output", "audited_socioeconomic_normalized.json"),
};
const ROSETTA = JSON.parse(readFileSync(join(ROOT, "data", "region_tract_rosetta.json"), "utf8"));
const COUNTIES = [...new Set(ROSETTA.map((r) => r.geoid22.slice(2, 5)))].sort();

const seq = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(3, "0")}E`);
const AGE_65_MALE = seq("B01001_", 20, 25);
const AGE_65_FEMALE = seq("B01001_", 44, 49);
const BACHELORS = seq("B15003_", 22, 25);
const VARS = [
  "B01003_001E", "B01002_001E",                                   // population, median age
  "B03002_003E", "B03002_004E", "B03002_006E", "B03002_012E",     // white, Black, Asian (not Hispanic); Hispanic
  "B05002_013E",                                                  // foreign born
  "B25003_001E", "B25003_002E",                                   // occupied homes, owner-occupied
  "B25070_001E", "B25070_010E",                                   // renters, renters paying 50%+ of income
  "B15003_001E", ...BACHELORS,                                    // adults 25+, bachelor's and above
  ...AGE_65_MALE, ...AGE_65_FEMALE,
  "B25077_001E", "B25064_001E", "B25002_001E", "B25002_003E",     // median value, median rent, homes, vacant homes
  "B19013_001E", "B17001_001E", "B17001_002E",                    // median household income, poverty
  "B23025_002E", "B23025_005E", "B19083_001E",                    // labor force, unemployed, Gini index
  "B22003_001E", "B22003_002E",                                   // households, households receiving SNAP
];

const round = (v, places) => +v.toFixed(places);
const pct = (part, whole, places = 1) => (part != null && whole > 0 ? round((part / whole) * 100, places) : null);
const total = (row, keys) => keys.reduce((a, k) => a + (row[k] || 0), 0);

// ── Row builders (one per file) ─────────────────────────────────────────

function demoRow(year, region, d) {
  const pop = d.B01003_001E;
  if (!pop || pop <= 0) return null; // no residents counted: the file carries no row
  const source = `ACS ${acsSpan(year)}`;
  return {
    year,
    region_id: region.region_id,
    region: region.region_name || "",
    total_population: pop,
    median_age: d.B01002_001E,
    pct_hispanic: pct(d.B03002_012E || 0, pop),
    pct_white_non_hispanic: pct(d.B03002_003E || 0, pop),
    pct_black_non_hispanic: pct(d.B03002_004E || 0, pop),
    pct_asian: pct(d.B03002_006E || 0, pop),
    pct_foreign_born: pct(d.B05002_013E, pop),
    pct_owner_occupied: pct(d.B25003_002E, d.B25003_001E),
    rent_burden_pct: pct(d.B25070_010E, d.B25070_001E),
    pct_bachelors_degree_or_higher: pct(total(d, BACHELORS), d.B15003_001E),
    pct_65_and_over: pct(total(d, AGE_65_MALE) + total(d, AGE_65_FEMALE), pop),
    audit_source: source,
    audit_confidence: { total: "high", median_age: "high", pct_white: "high", pct_hispanic: "high", pct_black: "high", pct_asian: "high" },
    audit_notes: `Fetched from Census Bureau API - ${source}`,
    audit_flags: [],
  };
}

function propRow(year, region, d, base, replaced) {
  const value = d.B25077_001E;
  const baseValue = base?.median_home_value;
  const row = {
    year,
    region_id: region.region_id,
    region: region.region_name || "",
    median_home_value: value,
    median_rent_monthly: d.B25064_001E,
    total_housing_units: d.B25002_001E,
    vacancy_rate: pct(d.B25002_003E, d.B25002_001E),
    audit_source: `ACS ${acsSpan(year)}`,
    audit_confidence: { median_home_value: "high", median_rent_monthly: "high" },
    audit_flags: [],
    pct_home_value_change_yoy: value != null && baseValue > 0 ? round(((value - baseValue) / baseValue / (year - base.year)) * 100, 2) : null,
  };
  // Not census figures: carried over as they were.
  for (const k of ["new_construction_permits", "commercial_sqft"]) if (replaced && k in replaced) row[k] = replaced[k];
  return row;
}

function socioRow(year, region, d, eviction) {
  return {
    year,
    region_id: region.region_id,
    region: region.region_name || "",
    median_household_income: d.B19013_001E,
    poverty_rate: pct(d.B17001_002E, d.B17001_001E),
    unemployment_rate: pct(d.B23025_005E, d.B23025_002E),
    gini_coefficient: d.B19083_001E != null ? round(d.B19083_001E, 4) : null,
    eviction_filing_rate: eviction.rate,
    snap_participation_rate: pct(d.B22003_002E, d.B22003_001E, 2),
    audit_source: `ACS ${acsSpan(year)}`,
    audit_confidence: { median_household_income: "high", poverty_rate: "high", unemployment_rate: "high" },
    audit_flags: eviction.flag ? [eviction.flag] : [],
  };
}

// ── Eviction filings (BASTA extract, 2020 tract boundaries) ─────────────

/** { "geoid_year": filings } or null when the extract is not on this machine. */
function loadFilings() {
  if (!existsSync(BASTA_CSV)) return null;
  const lines = readFileSync(BASTA_CSV, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const at = (name) => head.indexOf(name);
  const out = {};
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const geoid = (c[at("Census Tract")] || "").replace(/\D/g, "");
    if (geoid.length !== 11) continue; // "NO GEOGRAPHY" and blanks
    const n = OUTCOME_COLS.reduce((a, k) => a + (parseInt(c[at(k)], 10) || 0), 0);
    const key = `${geoid}_${c[at("Year")]}`;
    out[key] = (out[key] || 0) + n;
  }
  return out;
}

/** Filings per 100 renter households per year over the survey's own years. */
function evictionRate(filings, geoid, year, prop, demo) {
  const from = Math.max(year - 4, BASTA_YEARS[0]);
  const to = Math.min(year, BASTA_YEARS[1]);
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (!years.some((y) => `${geoid}_${y}` in filings)) return null; // the extract has nothing for this tract
  const units = prop?.total_housing_units;
  const owner = demo?.pct_owner_occupied;
  if (units == null || owner == null) return null;
  const renters = units * (1 - (prop.vacancy_rate || 0) / 100) * (1 - owner / 100);
  if (renters < MIN_RENTER_HH) return null;
  const mean = years.reduce((a, y) => a + (filings[`${geoid}_${y}`] || 0), 0) / years.length;
  return round((mean / renters) * 100, 2);
}

// ── Main ────────────────────────────────────────────────────────────────

const data = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, JSON.parse(readFileSync(f, "utf8"))]));
// The release the files hold now: their newest year.
const held = Math.max(...data.prop.map((r) => r.year));
const year = CHECK ? held : LATEST_ACS;
if (year < held) throw new Error(`The files already hold ${held}; LATEST_ACS is ${LATEST_ACS}.`);

const acs = await loadTractTable(`latest_acs_${year}`, `${year}/acs/acs5`, VARS, COUNTIES);
const filings = loadFilings();
const index = (rows) => new Map(rows.map((r) => [`${r.region_id}_${r.year}`, r]));
const before = { demo: index(data.demo), prop: index(data.prop), socio: index(data.socio) };
const stamp = new Date().toISOString();

const built = { demo: [], prop: [], socio: [] };
const notes = { missingTract: [], evictionKept: 0, evictionFromBasta: 0 };
for (const region of ROSETTA) {
  const d = acs[region.geoid22];
  if (!d) { notes.missingTract.push(region.region_id); continue; }
  const demo = demoRow(year, region, d);
  const prop = propRow(year, region, d, before.prop.get(`${region.region_id}_${PREVIOUS_SURVEY}`), before.prop.get(`${region.region_id}_${held}`));
  let eviction;
  if (filings) {
    eviction = { rate: evictionRate(filings, region.geoid22, year, prop, demo) };
    if (eviction.rate != null) notes.evictionFromBasta++;
  } else {
    // No extract on this machine: keep the earlier survey's figure and say so.
    const kept = before.socio.get(`${region.region_id}_${held}`)?.eviction_filing_rate ?? null;
    eviction = { rate: kept, flag: kept != null && held !== year ? "EVICTION_RATE_FROM_EARLIER_SURVEY" : null };
    if (kept != null) notes.evictionKept++;
  }
  if (demo) built.demo.push(demo);
  built.prop.push(prop);
  built.socio.push(socioRow(year, region, d, eviction));
}

console.log(`Release: ACS ${acsSpan(year)} (${year}/acs/acs5) | counties ${COUNTIES.join(", ")} | tracts ${ROSETTA.length}`);
console.log(`Rows built: demographics ${built.demo.length}, property ${built.prop.length}, socioeconomic ${built.socio.length}`);
if (notes.missingTract.length) console.log(`No ACS row for regions: ${notes.missingTract.join(", ")}`);
console.log(filings
  ? `Eviction rates from the BASTA extract, ${Math.max(year - 4, BASTA_YEARS[0])}-${Math.min(year, BASTA_YEARS[1])}: ${notes.evictionFromBasta} tracts`
  : `BASTA extract not found: ${notes.evictionKept} eviction rates kept from the ${held} rows and flagged`);

const SKIP = new Set(["audit_timestamp", "audit_notes", "audit_source", "audit_confidence", "audit_flags", "year", "region_id", "region"]);
const same = (a, b) => (a == null && b == null) || (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.011 : a === b);

if (CHECK) {
  // Do the formulas above reproduce the rows already in the files?
  for (const kind of Object.keys(FILES)) {
    const diffs = {};
    let compared = 0;
    for (const row of built[kind]) {
      const old = before[kind].get(`${row.region_id}_${year}`);
      if (!old) { diffs["(no row in file)"] = (diffs["(no row in file)"] || 0) + 1; continue; }
      compared++;
      for (const k of Object.keys(row)) {
        if (SKIP.has(k) || same(row[k], old[k])) continue;
        (diffs[k] ??= []).push(`${row.region_id}: file ${old[k]} / rebuilt ${row[k]}`);
      }
    }
    const extra = data[kind].filter((r) => r.year === year && !built[kind].some((b) => b.region_id === r.region_id)).length;
    console.log(`\n${kind}: ${compared} rows compared with the file's ${year} rows; ${extra} rows in the file were not rebuilt`);
    const keys = Object.keys(diffs);
    if (!keys.length) console.log("  every field matches");
    for (const k of keys) console.log(`  ${k}: ${Array.isArray(diffs[k]) ? `${diffs[k].length} differ, e.g. ${diffs[k].slice(0, 4).join(" | ")}` : diffs[k]}`);
  }
  console.log("\n--check: nothing written.");
} else {
  for (const kind of Object.keys(FILES)) {
    const fresh = index(built[kind]);
    const out = [];
    let replaced = 0;
    for (const row of data[kind]) {
      if (row.year !== held && row.year !== year) { out.push(row); continue; }
      // A row of the release being replaced: put the new row in its place.
      const next = fresh.get(`${row.region_id}_${year}`);
      if (next) { out.push({ ...next, audit_timestamp: stamp }); fresh.delete(`${row.region_id}_${year}`); replaced++; }
    }
    const added = fresh.size; // tracts that had no row before
    for (const next of fresh.values()) out.push({ ...next, audit_timestamp: stamp });
    const dropped = data[kind].filter((r) => r.year === held || r.year === year).length - replaced;
    console.log(`${kind}: ${replaced} rows replaced (${held} -> ${year}), ${added} added, ${dropped} dropped (no ACS figures)`);
    if (!DRY) writeFileSync(FILES[kind], JSON.stringify(out, null, 2));
  }
  console.log(DRY ? "\n--dry: nothing written." : "\nWrote the three files in data/phase1_output/.");
}
