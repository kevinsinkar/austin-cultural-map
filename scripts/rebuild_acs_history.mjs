// Rebuilds the survey figures in the 2010 and 2015 rows of the three census
// files from the American Community Survey tables themselves, and checks the
// 2020 rows against theirs.
//
//   node scripts/rebuild_acs_history.mjs            (second half of: npm run build:history)
//   node scripts/rebuild_acs_history.mjs --dry      (compare and report, write nothing)
//   node scripts/rebuild_acs_history.mjs --verbose  (also list examples of what changed; --all lists every one)
//
// Run it after scripts/rebuild_census_history.mjs, which owns population,
// race, owner share and rent burden. This script owns every other census
// figure in those rows and leaves those four alone.
//
// Why this exists (found November 2026):
//   * The first backfill gave a tract that was split after 2010 its parent
//     tract's figures. A share or a median carries over that way, but a count
//     does not: a split tract was shown with all of its parent's homes, and
//     its eviction rate, which divides by those homes, came out too low.
//   * A handful of tracts held the figures of a tract they were not cut from.
//   * SNAP participation had no figure in some tracts and a figure that did
//     not match census table B22003 in others.
//   * In 2010, 158 tracts had no survey figures in the demographics file.
//
// Survey and boundaries:
//   2010  ACS 2006-2010, published on 2010 tract boundaries   rebuilt
//   2015  ACS 2011-2015, published on 2010 tract boundaries   rebuilt
//   2020  ACS 2016-2020, published on today's (2020) boundaries
//         checked: a figure is written only where the file's differs
// 2010 tracts are carried to today's boundaries with the Census Bureau's
// 2010-2020 tract relationship file, by land area (the only measure that file
// carries), exactly as rebuild_census_history.mjs does.
//
// What each field is (the same definitions build_latest_acs.mjs uses):
//   shares    counts allocated to today's tract and summed, then divided.
//             foreign-born B05002_013 / B01003_001; bachelor's or higher,
//             adults 25+ (B15002); aged 65 and over (B01001) / B01003_001;
//             vacant homes B25002_003 / B25002_001; poverty B17001_002 /
//             B17001_001; unemployment B23025_005 / B23025_002 (the 2006-2010
//             survey does not publish that table); SNAP households
//             B22003_002 / B22003_001.
//   counts    homes B25002_001, allocated and summed.
//   medians   median age B01002, home value B25077, rent B25064, household
//             income B19013, and the Gini index B19083. A median cannot be
//             allocated. A tract cut from one earlier tract keeps that
//             tract's figure. A tract drawn from several takes their average,
//             weighted by the people, owner homes, renter homes or households
//             each contributes (the weighting scripts/build_stages.mjs uses;
//             DATA_METHODOLOGY.md section 12.4).
//   yearly change in home value   change in the median since the survey five
//             years earlier, divided by five. A simple rate, not compounded.
//             2010 has no earlier survey and no figure.
//   evictions   BASTA filings per 100 renter households per year: 2014-2015
//             for the 2015 row, 2016-2020 for the 2020 row. Left empty under
//             30 renter households. Needs data/BASTA/ (not in git); without
//             it the figures in the file are kept.
//             2020: renter households = homes x (1 - vacancy) x (1 - owner
//             share), from the row itself.
//             2015: the filings are on today's boundaries but the survey
//             counted renter households (B25003_003) on 2010 boundaries. A
//             tract's renter households then are estimated: those of the
//             earlier tract(s) it was cut from, shared among today's tracts
//             cut from them in proportion to the renter households each had
//             in the 2016-2020 survey. A tract whose boundary did not change
//             uses its own count. This is target-density weighting (Schroeder
//             2007). Sharing by land area, and giving every piece its
//             parent's rate, were both tested and tracked later years worse
//             (DATA_METHODOLOGY.md section 12.4).
//
// Not touched: new_construction_permits and commercial_sqft (City permits),
// pct_uninsured (first backfill, 2015 only; no view shows it).
//
// Raw pulls are cached in data/_cache/census_history/ so the rebuild runs
// offline. Fetching them again needs a Census API key in CENSUS_API_KEY (or
// CENSUS_DATA_API).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT, acsSpan, loadTractTable, loadRelationship,
  REL_2010_2020_URL, parseRel2010, forwardWeights, sourcesOf, allocate, weightedMedian,
} from "./lib/census.mjs";

const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");
const VERBOSE = ALL || process.argv.includes("--verbose");
const YEARS = [2010, 2015, 2020];
const NATIVE_FROM = 2020;       // surveys from this end year on are published on today's boundaries
const SURVEY_GAP = 5;           // years between one survey on the site and the next
const REAL_PIECE = 0.02;        // a piece under 2% of an earlier tract is a sliver, not a source
const MIN_RENTER_HH = 30;       // no eviction rate on fewer renter households than this
const BASTA_CSV = join(ROOT, "data", "BASTA", "2014-2025_geography_table_2026-06-02.csv");
const BASTA_YEARS = [2014, 2025];
const OUTCOME_COLS = ["Default judgment", "Dismissed", "Ruling for defendant", "Ruling for plaintiff", "Unclear or Other Case Outcome"];

const FILES = {
  demo: join(ROOT, "data", "phase1_output", "audited_demographics_normalized.json"),
  prop: join(ROOT, "data", "phase1_output", "audited_property_normalized.json"),
  socio: join(ROOT, "data", "phase1_output", "audited_socioeconomic_normalized.json"),
};
const ROSETTA = JSON.parse(readFileSync(join(ROOT, "data", "region_tract_rosetta.json"), "utf8"));
const COUNTIES = [...new Set(ROSETTA.map((r) => r.geoid22.slice(2, 5)))].sort();
const IN_AREA = (geoid) => geoid.startsWith("48") && COUNTIES.includes(geoid.slice(2, 5));

const seq = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(3, "0")}E`);
const AGE_65 = [...seq("B01001_", 20, 25), ...seq("B01001_", 44, 49)];
const BACHELORS = [...seq("B15002_", 15, 18), ...seq("B15002_", 32, 35)];
const HAS_UNEMPLOYMENT = (year) => year >= 2011; // table B23025 starts with the 2007-2011 survey
const VARS = (year) => [
  "B01003_001E", "B01002_001E",                                   // population, median age
  "B05002_013E",                                                  // foreign born
  "B15002_001E", ...BACHELORS,                                    // adults 25+, bachelor's and above
  ...AGE_65,
  "B25003_001E", "B25003_002E", "B25003_003E",                    // occupied homes, owner, renter
  "B25077_001E", "B25064_001E", "B25002_001E", "B25002_003E",     // median value, median rent, homes, vacant homes
  "B19013_001E", "B17001_001E", "B17001_002E", "B19083_001E",     // household income, poverty, Gini index
  "B22003_001E", "B22003_002E",                                   // households, households receiving SNAP
  ...(HAS_UNEMPLOYMENT(year) ? ["B23025_002E", "B23025_005E"] : []), // labor force, unemployed
];

const round = (v, places) => +v.toFixed(places);
const pct = (part, whole, places = 1) => (part != null && whole > 0 ? round((part / whole) * 100, places) : null);
const one = (k) => (r) => r[k];
const total = (keys) => (r) => { let t = 0; for (const k of keys) { if (r[k] == null) return null; t += r[k]; } return t; };
const positive = (v) => (v != null && v > 0 ? v : null); // a median of 0 means "none reported"

// ── Tables and boundaries ───────────────────────────────────────────────

const tables = {};
for (const y of YEARS) tables[y] = await loadTractTable(`history_acs_${y}`, `${y}/acs/acs5`, VARS(y), COUNTIES);
const rel1020 = await loadRelationship("rel_2010_2020", REL_2010_2020_URL, parseRel2010(IN_AREA));
const step1020 = forwardWeights(rel1020, 2);
const from2010 = sourcesOf(step1020);

/** Today's tract -> Map(source tract -> weight) for a survey year. */
const sourcesFor = (year, geoid) => (year >= NATIVE_FROM ? new Map([[geoid, 1]]) : from2010.get(geoid));
const realSources = (sources) => [...sources].filter(([, w]) => w >= REAL_PIECE);
const describe = (sources) => {
  const real = realSources(sources);
  return { count: real.length, direct: real.length === 1 && real[0][1] >= 1 - REAL_PIECE };
};

/**
 * Today's tract -> { old: [2010 tracts], now: [today's tracts] }: every tract
 * joined to it by a real piece of an earlier tract. A tract whose boundary
 * did not change is a group of one and one.
 */
const groups = (() => {
  const root = new Map();
  const add = (x) => { if (!root.has(x)) root.set(x, x); return x; };
  const find = (x) => { let r = x; while (root.get(r) !== r) r = root.get(r); root.set(x, r); return r; };
  for (const [from, list] of step1020) for (const [to, w] of list) {
    if (w >= REAL_PIECE) root.set(find(add(`o${from}`)), find(add(`n${to}`)));
  }
  const byRoot = new Map();
  for (const x of root.keys()) {
    const r = find(x);
    if (!byRoot.has(r)) byRoot.set(r, { old: [], now: [] });
    byRoot.get(r)[x[0] === "o" ? "old" : "now"].push(x.slice(1));
  }
  const out = new Map();
  for (const g of byRoot.values()) for (const n of g.now) out.set(n, g);
  return out;
})();

/** Every census figure this script owns, for one of today's tracts in one survey. */
function figures(year, geoid) {
  const src = sourcesFor(year, geoid);
  const t = tables[year];
  if (!src || ![...src.keys()].some((g) => t[g])) return null;
  const real = realSources(src);
  const count = (pick) => allocate(src, t, pick);
  // One source: its own median. Several: their weighted average.
  const median = (k, universe) => (real.length === 1
    ? positive(t[real[0][0]]?.[k])
    : weightedMedian(src, t, (r) => positive(r[k]), one(universe)));
  const pop = count(one("B01003_001E"));
  const homes = count(one("B25002_001E"));
  const m = {
    age: median("B01002_001E", "B01003_001E"),
    value: median("B25077_001E", "B25003_002E"),
    rent: median("B25064_001E", "B25003_003E"),
    income: median("B19013_001E", "B25003_001E"),
    gini: median("B19083_001E", "B25003_001E"),
  };
  return {
    demo: {
      median_age: m.age != null ? round(m.age, 1) : null,
      pct_foreign_born: pct(count(one("B05002_013E")), pop),
      pct_bachelors_degree_or_higher: pct(count(total(BACHELORS)), count(one("B15002_001E"))),
      pct_65_and_over: pct(count(total(AGE_65)), pop),
    },
    prop: {
      median_home_value: m.value != null ? Math.round(m.value) : null,
      median_rent_monthly: m.rent != null ? Math.round(m.rent) : null,
      total_housing_units: homes != null ? Math.round(homes) : null,
      vacancy_rate: pct(count(one("B25002_003E")), homes),
    },
    socio: {
      median_household_income: m.income != null ? Math.round(m.income) : null,
      poverty_rate: pct(count(one("B17001_002E")), count(one("B17001_001E"))),
      ...(HAS_UNEMPLOYMENT(year) ? { unemployment_rate: pct(count(one("B23025_005E")), count(one("B23025_002E"))) } : {}),
      gini_coefficient: m.gini != null ? round(m.gini, 4) : null,
      snap_participation_rate: pct(count(one("B22003_002E")), count(one("B22003_001E")), 2),
    },
    source: describe(src),
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

/** The years of filings a survey's rate covers, or null when the extract starts later. */
function filingYears(year) {
  const from = Math.max(year - 4, BASTA_YEARS[0]);
  const to = Math.min(year, BASTA_YEARS[1]);
  return to < from ? null : Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
const yearlyFilings = (filings, geoid, years) => years.reduce((a, y) => a + (filings[`${geoid}_${y}`] || 0), 0) / years.length;

/** Filings per 100 renter households per year over the survey's own years. */
function evictionRate(filings, geoid, year, prop, demo) {
  const years = filingYears(year);
  if (!years || !years.some((y) => `${geoid}_${y}` in filings)) return null; // the extract has nothing for this tract
  if (year >= NATIVE_FROM) {
    // The survey is on today's boundaries: the row's own figures give the renter households.
    const units = prop?.total_housing_units;
    const owner = demo?.pct_owner_occupied;
    if (units == null || owner == null) return null;
    const renters = units * (1 - (prop.vacancy_rate || 0) / 100) * (1 - owner / 100);
    if (renters < MIN_RENTER_HH) return null;
    return round((yearlyFilings(filings, geoid, years) / renters) * 100, 2);
  }
  // The survey is on 2010 boundaries, so this tract's renter households then
  // are estimated: the group's renter households in this survey, shared among
  // today's tracts in the group in proportion to the renter households each
  // had in the first survey published on today's boundaries.
  const group = groups.get(geoid);
  if (!group) return null;
  const then = tables[year];
  const later = tables[NATIVE_FROM];
  let groupThen = 0;
  for (const old of group.old) {
    if (then[old]?.B25003_003E == null) return null;
    groupThen += then[old].B25003_003E;
  }
  let groupLater = 0;
  for (const now of group.now) {
    if (later[now]?.B25003_003E == null) return null;
    groupLater += later[now].B25003_003E;
  }
  if (!(groupLater > 0)) return null;
  const renters = groupThen * (later[geoid].B25003_003E / groupLater);
  if (renters < MIN_RENTER_HH) return null;
  return round((yearlyFilings(filings, geoid, years) / renters) * 100, 2);
}

// ── Main ────────────────────────────────────────────────────────────────

const data = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, JSON.parse(readFileSync(f, "utf8"))]));
const index = (rows) => new Map(rows.map((r) => [`${r.region_id}_${r.year}`, r]));
const at = { demo: index(data.demo), prop: index(data.prop), socio: index(data.socio) };
const filings = loadFilings();
const stamp = new Date().toISOString();

// A rebuilt figure counts as "changed" in the report when it sits further
// from the file's than this: 2% for dollars and counts, one point for
// shares. Smaller moves are rounding and are counted as the same.
const RELATIVE = new Set(["median_home_value", "median_rent_monthly", "total_housing_units", "median_household_income"]);
const LINE = { median_age: 0.5, gini_coefficient: 0.01, pct_home_value_change_yoy: 0.25, eviction_filing_rate: 0.25 };
const moved = (field, a, b) => (RELATIVE.has(field) ? Math.abs(a - b) / Math.max(Math.abs(a), 1) > 0.02 : Math.abs(a - b) > (LINE[field] ?? 1));
const sameToRounding = (a, b) => Math.abs(a - b) < 0.011;

const report = {};          // year -> field -> counts
const written = new Map();  // row -> the fields written into it
const tallyFor = (year, field) => ((report[year] ??= {})[field] ??= { same: 0, changed: 0, changedDirect: 0, filled: 0, emptied: 0, examples: [] });

/**
 * Put one rebuilt figure into a row and count what happened to it. In a
 * checked year (2020) the file's figure stays unless it really differs.
 */
function put(row, field, next, { year, id, direct, checkOnly }) {
  const t = tallyFor(year, field);
  const prev = row[field] ?? null;
  if (prev == null && next == null) return;
  if (prev != null && next != null && checkOnly && sameToRounding(prev, next)) { t.same++; return; }
  const mark = `${id}${direct ? "" : "*"}`;
  if (prev == null) t.filled++;
  else if (next == null) { t.emptied++; t.examples.push(`${mark}: ${prev} -> none`); }
  else if (moved(field, prev, next)) {
    t.changed++;
    if (direct) t.changedDirect++;
    t.examples.push(`${mark}: ${prev} -> ${next}`);
  } else t.same++;
  if (prev !== next) {
    row[field] = next;
    if (!written.has(row)) written.set(row, []);
    written.get(row).push(field);
  }
}

const WHAT = (kind, year) => ({
  demo: "Median age, foreign-born, bachelor's and 65-and-over",
  prop: "Home value, rent, homes and vacancy",
  socio: `Income, poverty, ${HAS_UNEMPLOYMENT(year) ? "unemployment, " : ""}Gini index and SNAP`,
}[kind]);
// What to say on a checked (2020) row when one of its figures was written.
const CORRECTED = {
  snap_participation_rate: (year) => `SNAP participation taken from ACS ${acsSpan(year)} table B22003.`,
  pct_home_value_change_yoy: (year) => `Yearly change in home value measured again from the rebuilt ${acsSpan(year - SURVEY_GAP)} median.`,
};
const MARK = "Survey figures: ";
const auditOf = (row) => JSON.stringify([row.audit_notes, row.audit_source, row.audit_flags]);
/** The row's note with this script's sentence replaced or added. */
function withNote(row, sentence) {
  const kept = String(row.audit_notes || "").split(" | ")
    .map((s) => s.replace(/ Other fields are as first compiled\.$/, ""))
    .filter((s) => s && !s.startsWith(MARK) && !/^Backfilled by /.test(s));
  return [...kept, `${MARK}${sentence}`].join(" | ");
}

const boundaries = {};
const directAt = new Map(); // "id_year" -> is the tract's boundary the same as today's?
const noRows = {};
for (const year of YEARS) {
  const label = `ACS ${acsSpan(year)}`;
  const checkOnly = year >= NATIVE_FROM;
  boundaries[year] = { direct: 0, allocated: 0, none: 0 };
  noRows[year] = [];
  for (const region of ROSETTA) {
    const id = region.region_id;
    const rows = { demo: at.demo.get(`${id}_${year}`), prop: at.prop.get(`${id}_${year}`), socio: at.socio.get(`${id}_${year}`) };
    const f = figures(year, region.geoid22);
    if (!rows.demo && !rows.prop && !rows.socio) { noRows[year].push(`${id}${f ? "" : " (no source tract)"}`); continue; }
    if (!f) { boundaries[year].none++; continue; }
    boundaries[year][f.source.direct ? "direct" : "allocated"]++;
    directAt.set(`${id}_${year}`, f.source.direct);
    const ctx = { year, id, direct: f.source.direct, checkOnly };
    for (const kind of ["demo", "prop", "socio"]) {
      const row = rows[kind];
      if (!row) continue;
      for (const [field, value] of Object.entries(f[kind])) put(row, field, value, ctx);
      if (checkOnly) continue; // a checked row is annotated below, and only if something was written
      const before = auditOf(row);
      const how = f.source.direct
        ? "same tract boundary as today"
        : `carried to today's tract boundary from ${f.source.count} earlier tract${f.source.count === 1 ? " (a part of it)" : "s"}`;
      row.audit_notes = withNote(row, `${WHAT(kind, year)}: ${label}, ${how}.`);
      if (kind === "demo") row.audit_source = year === 2010 ? "Decennial 2010 SF1 + ACS 2006-2010" : label;
      else {
        row.audit_source = label;
        const flags = (row.audit_flags || []).filter((x) => x !== "ALLOCATED_FROM_EARLIER_TRACTS");
        if (!f.source.direct) flags.push("ALLOCATED_FROM_EARLIER_TRACTS");
        row.audit_flags = flags;
      }
      // A row whose figures and notes already say this is left as it is, timestamp included.
      if (auditOf(row) !== before && !written.has(row)) written.set(row, []);
    }
  }
}

// Yearly change in home value: from the survey five years earlier.
for (const year of YEARS) {
  for (const region of ROSETTA) {
    const row = at.prop.get(`${region.region_id}_${year}`);
    if (!row) continue;
    const base = at.prop.get(`${region.region_id}_${year - SURVEY_GAP}`);
    const next = row.median_home_value != null && base?.median_home_value > 0
      ? round(((row.median_home_value - base.median_home_value) / base.median_home_value / SURVEY_GAP) * 100, 2)
      : null;
    put(row, "pct_home_value_change_yoy", next, { year, id: region.region_id, direct: directAt.get(`${region.region_id}_${year - SURVEY_GAP}`) !== false, checkOnly: year >= NATIVE_FROM });
  }
}

// Eviction rates rest on renter households, so they follow.
if (filings) {
  for (const year of YEARS) {
    for (const region of ROSETTA) {
      const key = `${region.region_id}_${year}`;
      const row = at.socio.get(key);
      if (!row) continue;
      const next = evictionRate(filings, region.geoid22, year, at.prop.get(key), at.demo.get(key));
      put(row, "eviction_filing_rate", next, { year, id: region.region_id, direct: directAt.get(key) !== false, checkOnly: year >= NATIVE_FROM });
    }
  }
}

// A checked (2020) row is annotated only where a figure was written.
for (const [row, fields] of written) {
  if (row.year >= NATIVE_FROM && fields.length) {
    row.audit_notes = withNote(row, fields.map((f) => (CORRECTED[f] ? CORRECTED[f](row.year) : `${f} recomputed.`)).join(" "));
  }
  row.audit_timestamp = stamp;
}

// ── Report ──────────────────────────────────────────────────────────────

console.log(`Counties: ${COUNTIES.join(", ")} | tracts: ${ROSETTA.length}`);
console.log(filings ? "Eviction rates recomputed from the BASTA extract." : "BASTA extract not found: eviction rates left as they were.");
for (const year of YEARS) {
  const b = boundaries[year];
  console.log(`\n${year}  ACS ${acsSpan(year)}  ${year >= NATIVE_FROM ? "(checked)" : "(rebuilt)"}  same boundary ${b.direct} | carried from earlier tracts ${b.allocated} | no source tract ${b.none}`);
  if (noRows[year].length) console.log(`  tracts with no ${year} row in any file (left out): ${noRows[year].join(", ")}`);
  console.log(`  ${"field".padEnd(32)}${"same".padStart(6)}${"changed".padStart(9)}${"(same boundary)".padStart(17)}${"filled".padStart(8)}${"emptied".padStart(9)}`);
  for (const [field, t] of Object.entries(report[year] || {})) {
    console.log(`  ${field.padEnd(32)}${String(t.same).padStart(6)}${String(t.changed).padStart(9)}${String(t.changedDirect).padStart(17)}${String(t.filled).padStart(8)}${String(t.emptied).padStart(9)}`);
    if (VERBOSE && t.examples.length) console.log(`      ${t.examples.slice(0, ALL ? undefined : 10).join(" | ")}`);
  }
}
console.log('\n"changed" = more than 2% (dollars, counts) or one point (shares) from the file\'s figure. * = a tract carried from earlier boundaries.');

if (DRY) {
  console.log("\n--dry: nothing written.");
} else {
  for (const kind of Object.keys(FILES)) writeFileSync(FILES[kind], JSON.stringify(data[kind], null, 2));
  console.log(`\nWrote the three files in data/phase1_output/ (${written.size} rows).`);
}
