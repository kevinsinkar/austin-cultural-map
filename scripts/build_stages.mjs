// Builds the displacement stage of every census tract and neighborhood on
// the site, for each census year, from Census Bureau tables.
//
//   node scripts/build_stages.mjs            (or: npm run build:stages)
//   node scripts/build_stages.mjs --report   (also print the checks against the City's map)
//   node scripts/build_stages.mjs --dry      (compute and report, write nothing)
//
// Method: the three-part test in Appendix 3 of "Uprooted: Residential
// Displacement in Austin's Gentrifying Neighborhoods, and What Can Be Done
// About It" (Way, Mueller, Wegmann; University of Texas, 2018), itself an
// adaptation of Lisa Bates's 2013 study for Portland. The City of Austin
// publishes its own updates of the same test ("Displacement Risk Areas").
//
//   1. Vulnerable residents. Five shares, each compared with the five-county
//      region (Bastrop, Caldwell, Hays, Travis, Williamson): renters, people
//      of color, households under 80% of the region's median family income,
//      children in poverty, adults 25+ without a bachelor's degree. A tract
//      is vulnerable when at least 3 of the 5 are more than half a standard
//      deviation above the regional figure.
//   2. Demographic change since 2000. Change in owner share, white
//      non-Hispanic share and bachelor's share (percentage points) and in
//      median family income (percent), each compared with the region's own
//      change. Change is "yes" when at least 2 of the 4 are more than half a
//      standard deviation above the regional change AND the four average at
//      least half a standard deviation above it.
//   3. Housing market. Median home value (median rent where a tract has too
//      few owner homes), ranked among the tracts on this site. "High" is the
//      top two fifths.
//        accelerating  value today not high, rise since 2000 high
//        appreciated   value in 2000 not high, value today high, rise high
//        adjacent      value in 2000 not high, rise not high, and touching
//                      a tract whose value or rise is high
//
//   Stage            vulnerable  demographic change       housing
//   Susceptible      yes         no                       adjacent
//   Early: Type 1    yes         no                       accelerating
//   Early: Type 2    yes         yes                      adjacent
//   Dynamic          yes         yes                      accelerating
//   Late             yes         yes                      appreciated
//   Continued loss   no          yes, or white share and  appreciated
//                                bachelor's share both up
//
// The six rows are Table 1 of Bates (2013), which the UT study says it
// follows precisely. The sources word the continued-loss condition three
// ways: Bates's table says "% white and % with BA increasing" and defines
// both against the citywide change; the UT project page says "an above
// average increase"; Appendix 3 says only "increasing". The City's 2022 file
// shows the reading in use: all 14 of its not-vulnerable, appreciated tracts
// with demographic change are Continued Loss, and of the 13 without, the 5 it
// calls Continued Loss are the ones whose white share did not fall. This
// build uses that reading. (DATA_METHODOLOGY.md, section 12.2.)
//
// Where this departs from Appendix 3, and why:
//   * Low-income households are counted from the census income brackets
//     (households under 80% of the region's median family income), not from
//     HUD's CHAS tables, so the line is not adjusted for household size.
//   * "Appreciated" compares today with 2000, as the appendix's own formula
//     does. Its summary text says 1990; this site holds no 1990 figures.
//   * 2010 tracts are carried to 2020 boundaries by land area and 2000 tracts
//     by population or housing units (Census Bureau relationship files); the
//     study used Brown University's Longitudinal Tract Database.
//   * Tracts are left unscored by rule rather than by a hand-picked list:
//     fewer than MIN_POP residents, or half or more of residents enrolled in
//     college or living in group quarters (dormitories, jails, barracks).
//   * The test is run for every census year on the site (2010, 2015, 2020
//     and the latest release, LATEST_ACS in scripts/lib/census.mjs), each
//     time against 2000. For 2000 itself only step 1 exists.
//
// Output: data/stages.js (generated; do not edit).
//
// Also written: data/stageLenses.js, the extra figures the presenter-only
// Triage view needs for the latest survey (see "Lens figures" below). It is a
// separate file so the public bundle does not carry it.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT, LATEST_ACS, acsSpan, loadTractTable, loadGeoValues, loadRelationship, readCache, writeCache, readExport,
  REL_2000_2010_URL, REL_2010_2020_URL, parseRel2000, parseRel2010,
  forwardWeights, sourcesOf, allocate, weightedMedian,
} from "./lib/census.mjs";

const REPORT = process.argv.includes("--report");
const DRY = process.argv.includes("--dry");

const MSA = ["021", "055", "209", "453", "491"]; // Bastrop, Caldwell, Hays, Travis, Williamson
const IN_MSA = (geoid) => geoid.startsWith("48") && MSA.includes(geoid.slice(2, 5));
const BASE = 2000;
const LATEST = LATEST_ACS;                    // the latest survey, by its end year
const ACS_YEARS = [2010, 2015, 2020, LATEST]; // American Community Survey 5-year releases
const YEARS = [BASE, ...ACS_YEARS];
const ACS_LABEL = Object.fromEntries(ACS_YEARS.map((y) => [y, acsSpan(y)]));

const Z_LINE = 0.5;        // "well above the region": half a standard deviation
const MIN_UNIVERSE = 50;   // a share is not computed on fewer people or homes than this
const MIN_POP = 500;       // tracts smaller than this are not scored
const MAJORITY = 50;       // percent of residents in college / in group quarters
const TOUCH = 0.00015;     // degrees (about 15 m): two tracts closer than this share a boundary

// ── Tables ──────────────────────────────────────────────────────────────

const seq = (prefix, from, to, suffix = "") =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(3, "0")}${suffix}`);

const SF1_VARS = ["P001001", "P004005", "H004001", "H004002", "H004003", "P027024"];
const SF3_VARS = [
  "P037001", ...seq("P037", 15, 18), ...seq("P037", 32, 35),   // adults 25+, bachelor's and above
  ...seq("P052", 1, 17),                                        // household income brackets
  "P077001", "P076001",                                         // median family income, families
  ...seq("P087", 3, 6), ...seq("P087", 11, 14),                 // children below / at or above poverty
  "H085001", "H063001",                                         // median home value, median gross rent
  "P036018", "P036021", "P036041", "P036044",                   // enrolled in college or graduate school
];
const ACS_VARS = [
  "B03002_001E", "B03002_003E",
  "B25003_001E", "B25003_002E", "B25003_003E",
  "B15002_001E", ...seq("B15002_", 15, 18, "E"), ...seq("B15002_", 32, 35, "E"),
  ...seq("B19001_", 1, 17, "E"),
  "B19113_001E", "B19101_001E",
  ...seq("B17001_", 4, 9, "E"), ...seq("B17001_", 18, 23, "E"), ...seq("B17001_", 33, 38, "E"), ...seq("B17001_", 47, 52, "E"),
  "B25077_001E", "B25064_001E",
  "B14001_008E", "B14001_009E", "B26001_001E",
];

const [sf1, sf3, counties2000, rel0010, rel1020, ...acsTables] = await Promise.all([
  loadTractTable("stage_sf1_2000", "2000/dec/sf1", SF1_VARS, MSA),
  loadTractTable("stage_sf3_2000", "2000/dec/sf3", SF3_VARS, MSA),
  loadGeoValues("stage_counties_2000", "2000/dec/sf3", ["P077001", "P076001"], `county:${MSA.join(",")}&in=state:48`),
  loadRelationship("stage_rel_2000_2010", REL_2000_2010_URL, parseRel2000(IN_MSA)),
  loadRelationship("stage_rel_2010_2020", REL_2010_2020_URL, parseRel2010(IN_MSA)),
  ...ACS_YEARS.map((y) => loadTractTable(`stage_acs_${y}`, `${y}/acs/acs5`, ACS_VARS, MSA)),
]);
const ACS = Object.fromEntries(ACS_YEARS.map((y, i) => [y, acsTables[i]]));

// The region's median family income. The 2000 API has no figure for the
// metropolitan area, so 2000 is the five counties' medians weighted by their
// number of families (the fallback Appendix 3 itself suggests).
const regionMfi = {
  2000: Math.round(counties2000.reduce((a, c) => a + c.P077001 * c.P076001, 0) / counties2000.reduce((a, c) => a + c.P076001, 0)),
};
for (const y of ACS_YEARS) {
  const rows = await loadGeoValues(`stage_msa_${y}`, `${y}/acs/acs5`, ["B19113_001E"], "metropolitan%20statistical%20area/micropolitan%20statistical%20area:12420");
  regionMfi[y] = rows[0].B19113_001E;
}

// ── One record per tract and year, in that year's own boundaries ─────────

const PEOPLE = ["pop", "white", "gq", "p25", "ba", "kidsPoor", "kids", "students"];
const HOMES = ["occ", "owner", "renter", "hh", "lowHH", "fam"];
const MEDIANS = { mfi: "fam", value: "owner", rent: "renter" }; // median -> the universe that weights it

const sum = (row, keys) => {
  let total = 0;
  for (const k of keys) { if (row[k] == null) return null; total += row[k]; }
  return total;
};
const positive = (v) => (v != null && v > 0 ? v : null); // a median of 0 means "none reported"

const BRACKET_EDGES = [0, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 60000, 75000, 100000, 125000, 150000, 200000, Infinity];
/** Households with income under `line`, splitting the bracket the line falls in evenly. */
function householdsBelow(counts, line) {
  let n = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] == null) return null;
    const lo = BRACKET_EDGES[i];
    const hi = BRACKET_EDGES[i + 1];
    if (line >= hi) n += counts[i];
    else if (line > lo && hi !== Infinity) n += counts[i] * ((line - lo) / (hi - lo));
  }
  return n;
}

function record2000(a, b, line) {
  if (!a || !b) return null;
  return {
    pop: a.P001001, white: a.P004005, gq: a.P027024,
    occ: a.H004001, owner: a.H004002, renter: a.H004003,
    p25: b.P037001, ba: sum(b, [...seq("P037", 15, 18), ...seq("P037", 32, 35)]),
    hh: b.P052001, lowHH: householdsBelow(seq("P052", 2, 17).map((k) => b[k]), line),
    kidsPoor: sum(b, seq("P087", 3, 6)), kids: sum(b, [...seq("P087", 3, 6), ...seq("P087", 11, 14)]),
    students: sum(b, ["P036018", "P036021", "P036041", "P036044"]),
    fam: b.P076001, mfi: positive(b.P077001), value: positive(b.H085001), rent: positive(b.H063001),
  };
}
function recordAcs(r, line) {
  if (!r) return null;
  const poor = [...seq("B17001_", 4, 9, "E"), ...seq("B17001_", 18, 23, "E")];
  const notPoor = [...seq("B17001_", 33, 38, "E"), ...seq("B17001_", 47, 52, "E")];
  return {
    pop: r.B03002_001E, white: r.B03002_003E, gq: r.B26001_001E,
    occ: r.B25003_001E, owner: r.B25003_002E, renter: r.B25003_003E,
    p25: r.B15002_001E, ba: sum(r, [...seq("B15002_", 15, 18, "E"), ...seq("B15002_", 32, 35, "E")]),
    hh: r.B19001_001E, lowHH: householdsBelow(seq("B19001_", 2, 17, "E").map((k) => r[k]), line),
    kidsPoor: sum(r, poor), kids: sum(r, [...poor, ...notPoor]),
    students: sum(r, ["B14001_008E", "B14001_009E"]),
    fam: r.B19101_001E, mfi: positive(r.B19113_001E), value: positive(r.B25077_001E), rent: positive(r.B25064_001E),
  };
}

const lowIncomeLine = Object.fromEntries(YEARS.map((y) => [y, 0.8 * regionMfi[y]]));
const native = { 2000: {} };
for (const geoid of Object.keys(sf1)) native[2000][geoid] = record2000(sf1[geoid], sf3[geoid], lowIncomeLine[2000]);
for (const y of ACS_YEARS) {
  native[y] = {};
  for (const [geoid, row] of Object.entries(ACS[y])) native[y][geoid] = recordAcs(row, lowIncomeLine[y]);
}

// ── Carry every year onto 2020 tract boundaries ─────────────────────────

const step1020 = forwardWeights(rel1020, 2);
const SOURCES = {
  2000: { people: sourcesOf(forwardWeights(rel0010, 2), step1020), homes: sourcesOf(forwardWeights(rel0010, 3), step1020) },
  2010: { people: sourcesOf(step1020), homes: sourcesOf(step1020) },
};
SOURCES[2015] = SOURCES[2010];

function carry(year, geoid) {
  if (year >= 2020) return native[year][geoid] || null;
  const people = SOURCES[year].people.get(geoid);
  const homes = SOURCES[year].homes.get(geoid);
  if (!people || !homes) return null;
  const table = native[year];
  const out = {};
  for (const k of PEOPLE) out[k] = allocate(people, table, (r) => r[k]);
  for (const k of HOMES) out[k] = allocate(homes, table, (r) => r[k]);
  for (const [k, universe] of Object.entries(MEDIANS)) out[k] = weightedMedian(homes, table, (r) => r[k], (r) => r[universe]);
  return out;
}

const TRACTS_2020 = Object.keys(native[LATEST]).sort();
const recs = {}; // geoid -> { year -> record }
for (const geoid of TRACTS_2020) {
  recs[geoid] = {};
  for (const y of YEARS) recs[geoid][y] = carry(y, geoid);
}

/** Add up records (a neighborhood, or the whole region). */
function merge(list, strict = true) {
  const rows = list.filter(Boolean);
  if (!rows.length || (strict && rows.length !== list.length)) return null;
  const out = {};
  for (const k of [...PEOPLE, ...HOMES]) {
    let total = 0;
    let ok = true;
    for (const r of rows) {
      if (r[k] == null) { if (strict) { ok = false; break; } continue; }
      total += r[k];
    }
    out[k] = ok ? total : null;
  }
  // Medians of a group are averaged by population, the weighting the rest
  // of the site uses for a neighborhood's figures.
  for (const k of Object.keys(MEDIANS)) {
    let s = 0;
    let w = 0;
    for (const r of rows) if (r[k] > 0 && r.pop > 0) { s += r[k] * r.pop; w += r.pop; }
    out[k] = w > 0 ? s / w : null;
  }
  return out;
}

// ── Indicators ──────────────────────────────────────────────────────────

const pct = (part, whole) => (part != null && whole != null && whole >= MIN_UNIVERSE ? (part / whole) * 100 : null);
function indicators(r) {
  if (!r) return null;
  return {
    pop: r.pop,
    poc: pct(r.pop != null && r.white != null ? r.pop - r.white : null, r.pop),
    renter: pct(r.renter, r.occ),
    lowInc: pct(r.lowHH, r.hh),
    childPov: pct(r.kidsPoor, r.kids),
    noBA: pct(r.p25 != null && r.ba != null ? r.p25 - r.ba : null, r.p25),
    owner: pct(r.owner, r.occ),
    white: pct(r.white, r.pop),
    ba: pct(r.ba, r.p25),
    mfi: r.fam >= MIN_UNIVERSE ? r.mfi : null,
    value: r.owner >= MIN_UNIVERSE ? r.value : null,
    rent: r.renter >= MIN_UNIVERSE ? r.rent : null,
    students: pct(r.students, r.pop),
    gq: pct(r.gq, r.pop),
  };
}

const V_FACTORS = [
  { key: "poc", weight: "pop", label: "people of color" },
  { key: "renter", weight: "occ", label: "renters" },
  { key: "lowInc", weight: "hh", label: "low-income households" },
  { key: "childPov", weight: "kids", label: "children in poverty" },
  { key: "noBA", weight: "p25", label: "adults without a bachelor's" },
];
const D_FACTORS = [
  { key: "owner", weight: "occ", label: "owner share" },
  { key: "white", weight: "pop", label: "white non-Hispanic share" },
  { key: "ba", weight: "p25", label: "bachelor's share" },
  { key: "mfi", weight: "fam", label: "median family income" },
];

function changeOf(now, base) {
  if (!now || !base) return null;
  const diff = (k) => (now[k] != null && base[k] != null ? now[k] - base[k] : null);
  return {
    owner: diff("owner"), white: diff("white"), ba: diff("ba"),
    mfi: now.mfi != null && base.mfi > 0 ? ((now.mfi - base.mfi) / base.mfi) * 100 : null,
  };
}

/** Weighted standard deviation around a given center (Appendix 3, step 3). */
function spread(items, center) {
  const valid = items.filter((i) => i.x != null && i.w > 0);
  const n = valid.length;
  const sw = valid.reduce((a, i) => a + i.w, 0);
  const ss = valid.reduce((a, i) => a + i.w * (i.x - center) ** 2, 0);
  return { center, sd: Math.sqrt(ss / (((n - 1) / n) * sw)), n };
}

// The region, each year: its own figures, and how far tracts spread around them.
const region = {};
for (const y of YEARS) {
  const total = merge(Object.values(native[y]), false);
  const ind = indicators(total);
  ind.mfi = regionMfi[y];
  region[y] = { ind, v: {}, d: {} };
}
const tractInd = {}; // geoid -> year -> indicators (all region tracts, 2020 boundaries)
for (const geoid of TRACTS_2020) {
  tractInd[geoid] = {};
  for (const y of YEARS) tractInd[geoid][y] = indicators(recs[geoid][y]);
}
for (const y of YEARS) {
  for (const f of V_FACTORS) {
    region[y].v[f.key] = spread(TRACTS_2020.map((g) => ({ x: tractInd[g][y]?.[f.key], w: recs[g][y]?.[f.weight] })), region[y].ind[f.key]);
  }
  if (y === BASE) continue;
  const regionChange = changeOf(region[y].ind, region[BASE].ind);
  for (const f of D_FACTORS) {
    region[y].d[f.key] = spread(
      TRACTS_2020.map((g) => ({ x: changeOf(tractInd[g][y], tractInd[g][BASE])?.[f.key], w: recs[g][y]?.[f.weight] })),
      regionChange[f.key]
    );
  }
}

// ── The units this site shows: 269 tracts and the named neighborhoods ────

const TRACT_ROWS = JSON.parse(readFileSync(join(ROOT, "data", "region_tract_rosetta.json"), "utf8"));
const NEIGHBORHOODS = readExport("data/neighborhoods.js", "NEIGHBORHOODS");
const geoidOf = new Map(TRACT_ROWS.map((r) => [r.region_id, r.geoid22]));

// Which tracts touch which (for "adjacent").
const neighbors = (() => {
  const cached = readCache("stage_tract_neighbors");
  if (cached) return new Map(Object.entries(cached).map(([k, v]) => [+k, v]));
  const REGIONS = readExport("data/final_updated_regions.js", "REGIONS_GEOJSON");
  const shapes = REGIONS.features.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = polys.flat();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { id: f.properties.region_id, rings, box: [minX, minY, maxX, maxY] };
  });
  const near = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
    return ex * ex + ey * ey <= TOUCH * TOUCH;
  };
  const touches = (A, B) => {
    for (const ra of A.rings) for (const p of ra) {
      if (p[0] < B.box[0] - TOUCH || p[0] > B.box[2] + TOUCH || p[1] < B.box[1] - TOUCH || p[1] > B.box[3] + TOUCH) continue;
      for (const rb of B.rings) for (let i = 0; i < rb.length - 1; i++) if (near(p, rb[i], rb[i + 1])) return true;
    }
    return false;
  };
  const out = new Map(shapes.map((s) => [s.id, []]));
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const A = shapes[i], B = shapes[j];
    if (A.box[0] > B.box[2] + TOUCH || B.box[0] > A.box[2] + TOUCH || A.box[1] > B.box[3] + TOUCH || B.box[1] > A.box[3] + TOUCH) continue;
    if (touches(A, B) || touches(B, A)) { out.get(A.id).push(B.id); out.get(B.id).push(A.id); }
  }
  writeCache("stage_tract_neighbors", Object.fromEntries(out));
  return out;
})();

const units = [
  ...TRACT_ROWS.map((r) => ({
    kind: "tract", id: r.region_id, label: `${r.region_name} (tract ${r.name22})`,
    recs: recs[r.geoid22] || {}, near: neighbors.get(r.region_id) || [],
  })),
  ...NEIGHBORHOODS.filter((n) => n.tract_ids.length > 1).map((n) => ({
    kind: "neighborhood", id: n.id, label: n.name, members: n.tract_ids,
    recs: Object.fromEntries(YEARS.map((y) => [y, merge(n.tract_ids.map((t) => recs[geoidOf.get(t)]?.[y]))])),
    near: [...new Set(n.tract_ids.flatMap((t) => neighbors.get(t) || []))].filter((t) => !n.tract_ids.includes(t)),
  })),
];

// ── Classify ────────────────────────────────────────────────────────────

/** Why a unit is not scored in a year, or null when it is. */
function unscored(ind) {
  if (!ind || ind.pop == null) return "nodata";
  if (ind.pop < MIN_POP) return "few";
  if (ind.students != null && ind.students >= MAJORITY) return "students";
  if (ind.gq != null && ind.gq >= MAJORITY) return "quarters";
  return null;
}

const results = new Map(); // `${kind}:${id}` -> { year -> result }
const keyOf = (u) => `${u.kind}:${u.id}`;
for (const u of units) {
  const byYear = {};
  for (const y of YEARS) {
    const ind = indicators(u.recs[y]);
    const out = { ind, reason: unscored(ind) };
    if (!out.reason) {
      const z = V_FACTORS.map((f) => (ind[f.key] == null ? null : (ind[f.key] - region[y].v[f.key].center) / region[y].v[f.key].sd));
      out.vz = z;
      out.vHits = z.map((x) => x != null && x > Z_LINE);
      const known = z.filter((x) => x != null);
      if (known.length < 3) out.reason = "nodata";
      else out.vulnerable = out.vHits.filter(Boolean).length >= 3;
    }
    byYear[y] = out;
  }
  // Demographic change, each year against 2000.
  for (const y of YEARS) {
    const out = byYear[y];
    if (y === BASE || out.reason) continue;
    const ch = changeOf(out.ind, byYear[BASE].ind);
    if (!ch || byYear[BASE].reason) continue; // no usable 2000 figures to measure change from
    const z = D_FACTORS.map((f) => (ch[f.key] == null ? null : (ch[f.key] - region[y].d[f.key].center) / region[y].d[f.key].sd));
    const known = z.filter((x) => x != null);
    out.change = ch;
    out.dz = z;
    out.dHits = z.map((x) => x != null && x > Z_LINE);
    if (known.length >= 3) {
      const avg = known.reduce((a, b) => a + b, 0) / known.length;
      out.dAvg = avg;
      out.changed = out.dHits.filter(Boolean).length >= 2 && avg >= Z_LINE;
    }
  }
  results.set(keyOf(u), byYear);
}

// Housing market: quintile breaks among the scored tracts, then each unit.
function percentileInc(values, p) {
  const v = values.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (v.length - 1) * p;
  const lo = Math.floor(at);
  return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (at - lo);
}
const housingBreaks = {};
for (const y of YEARS) {
  if (y === BASE) continue;
  const scored = units.filter((u) => u.kind === "tract" && !results.get(keyOf(u))[y].reason);
  const pairs = (k) => scored.map((u) => {
    const r = results.get(keyOf(u));
    const b = r[BASE].ind?.[k], n = r[y].ind?.[k];
    return { base: b ?? null, now: n ?? null, rise: b > 0 && n > 0 ? ((n - b) / b) * 100 : null };
  });
  housingBreaks[y] = {};
  for (const k of ["value", "rent"]) {
    const rows = pairs(k);
    housingBreaks[y][k] = {
      base: percentileInc(rows.map((r) => r.base), 0.6),
      now: percentileInc(rows.map((r) => r.now), 0.6),
      rise: percentileInc(rows.map((r) => r.rise), 0.6),
    };
  }
  // First pass: where each unit sits.
  for (const u of units) {
    const r = results.get(keyOf(u));
    const out = r[y];
    if (out.reason) continue;
    const track = ["value", "rent"].find((k) => r[BASE].ind?.[k] > 0 && out.ind?.[k] > 0);
    if (!track) continue;
    const base = r[BASE].ind[track], now = out.ind[track];
    const rise = ((now - base) / base) * 100;
    const brk = housingBreaks[y][track];
    out.housing = { track, base, now, rise, baseLow: base <= brk.base, nowHigh: now > brk.now, riseHigh: rise > brk.rise };
  }
  // Second pass: the type, which for "adjacent" depends on the neighbors.
  for (const u of units) {
    const out = results.get(keyOf(u))[y];
    const h = out.housing;
    if (!h) continue;
    if (!h.nowHigh && h.riseHigh) h.type = "ACC";
    else if (h.baseLow && h.nowHigh && h.riseHigh) h.type = "APP";
    else if (h.baseLow && !h.riseHigh) {
      const hot = u.near.some((t) => {
        const n = results.get(`tract:${t}`)?.[y]?.housing;
        return n && (n.nowHigh || n.riseHigh);
      });
      h.type = hot ? "ADJ" : "NO";
    } else h.type = "NO";
  }
}

// ── Lens figures (presenter-only Triage view) ───────────────────────────
// The Triage lenses ask where change is moving now. They compare the latest
// survey with the newest one on the site that shares no interview years with
// it. For 2020-2024 that is 2011-2015: the 2016-2020 survey shares 2020.
// Same four measures and same rule as test 2, with the region's change and
// the spread of tracts taken over that period.
const RECENT = { from: Math.max(...ACS_YEARS.filter((y) => y <= LATEST - 5)), to: LATEST };
const recentRegion = {};
{
  const regionChange = changeOf(region[RECENT.to].ind, region[RECENT.from].ind);
  for (const f of D_FACTORS) {
    recentRegion[f.key] = spread(
      TRACTS_2020.map((g) => ({ x: changeOf(tractInd[g][RECENT.to], tractInd[g][RECENT.from])?.[f.key], w: recs[g][RECENT.to]?.[f.weight] })),
      regionChange[f.key]
    );
  }
}
for (const u of units) {
  const r = results.get(keyOf(u));
  const now = r[RECENT.to];
  const then = r[RECENT.from];
  if (now.reason || then.reason) continue;
  const ch = changeOf(now.ind, then.ind);
  const z = D_FACTORS.map((f) => (ch?.[f.key] == null ? null : (ch[f.key] - recentRegion[f.key].center) / recentRegion[f.key].sd));
  const known = z.filter((x) => x != null);
  const rec = { change: ch, z, hits: z.map((x) => x != null && x > Z_LINE) };
  if (known.length >= 3) {
    rec.avg = known.reduce((a, b) => a + b, 0) / known.length;
    rec.changed = rec.hits.filter(Boolean).length >= 2 && rec.avg >= Z_LINE;
  }
  now.recent = rec;
}

// Where a value sits among sorted values, 0 (lowest) to 100 (highest). The
// counterpart of percentileInc: a value above the 60th percentile ranks above 60.
function rankAmong(sorted, x) {
  if (x == null || sorted.length < 2) return null;
  let i = 0;
  while (i < sorted.length && sorted[i] < x) i++;
  if (i >= sorted.length) return 100;
  if (sorted[i] === x || i === 0) return (i / (sorted.length - 1)) * 100;
  return ((i - 1 + (x - sorted[i - 1]) / (sorted[i] - sorted[i - 1])) / (sorted.length - 1)) * 100;
}
const recentRiseLine = {};
{
  const y = RECENT.to;
  const scored = units.filter((u) => u.kind === "tract" && !results.get(keyOf(u))[y].reason);
  const riseFrom = (from, k) => scored.map((u) => {
    const r = results.get(keyOf(u));
    const b = r[from].ind?.[k], n = r[y].ind?.[k];
    return b > 0 && n > 0 ? ((n - b) / b) * 100 : null;
  }).filter((v) => v != null).sort((a, b) => a - b);
  const sinceBase = { value: riseFrom(BASE, "value"), rent: riseFrom(BASE, "rent") };
  for (const k of ["value", "rent"]) recentRiseLine[k] = percentileInc(riseFrom(RECENT.from, k), 0.6);
  for (const u of units) {
    const r = results.get(keyOf(u));
    const h = r[y].housing;
    if (!h) continue;
    h.risePct = rankAmong(sinceBase[h.track], h.rise);
    const then = r[RECENT.from].reason ? null : r[RECENT.from].ind?.[h.track];
    if (then > 0) {
      h.recentRise = ((h.now - then) / then) * 100;
      h.recentHigh = h.recentRise > recentRiseLine[h.track];
    }
  }
}
// A tract whose 2010 boundary differs from today's carries 2011-2015 figures
// allocated from the earlier tract(s): estimates, not counts. A survey on
// 2020 boundaries (2016-2020 onwards) needs no carrying.
const carried2015 = (geoid) => {
  if (!SOURCES[RECENT.from]) return false;
  const src = SOURCES[RECENT.from].people.get(geoid);
  return !src || [...src.values()].some((w) => w < 0.99);
};

function stageOf(out, year, wasVulnerable) {
  if (out.reason) return "NA";
  if (year === BASE) return out.vulnerable ? "V0" : "N0";
  const h = out.housing?.type;
  const d = out.changed;
  if (out.vulnerable) {
    if (d === false && h === "ADJ") return "SUS";
    if (d === false && h === "ACC") return "E1";
    if (d === true && h === "ADJ") return "E2";
    if (d === true && h === "ACC") return "DYN";
    if (d === true && h === "APP") return "LATE";
    return "VUL"; // vulnerable residents, but none of the published combinations
  }
  // Continued loss: demographic change, or white share and bachelor's share
  // both up. This is the reading the City's own results show in use.
  const whiterAndMoreDegrees = out.change && out.change.white > 0 && out.change.ba > 0;
  if (h === "APP" && (d === true || whiterAndMoreDegrees)) return "CL";
  // Not in the UT table: vulnerable in 2000, not vulnerable now, demographic
  // change, values rising fast but not yet high. The City's updates call
  // this "rapid loss" and group it with continued loss ("chronic").
  if (h === "ACC" && d === true && wasVulnerable) return "RL";
  return "NONE";
}
for (const u of units) {
  const r = results.get(keyOf(u));
  for (const y of YEARS) r[y].stage = stageOf(r[y], y, r[BASE].vulnerable === true);
}

// ── Report ──────────────────────────────────────────────────────────────

const tally = (list) => {
  const m = new Map();
  for (const k of list) m.set(k, (m.get(k) || 0) + 1);
  return Object.fromEntries([...m].sort());
};
const tractUnits = units.filter((u) => u.kind === "tract");
console.log(`Region tracts (2020 boundaries): ${TRACTS_2020.length} | site tracts: ${tractUnits.length} | neighborhoods: ${units.length - tractUnits.length}`);
console.log(`Regional median family income: ${YEARS.map((y) => `${y} $${regionMfi[y].toLocaleString()}`).join(" | ")}`);
for (const y of YEARS) console.log(`${y}  ${JSON.stringify(tally(tractUnits.map((u) => results.get(keyOf(u))[y].stage)))}`);

// The City's own 2022 classification of the same tracts, for comparison.
async function cityRisk() {
  const cached = readCache("city_displacement_risk_2022");
  if (cached) return cached;
  const res = await fetch("https://data.austintexas.gov/resource/t8nv-zcp9.json?$select=geoid22,gentrifica,vulnerabil,demographi,housing_ma,displaceme&$limit=1000");
  if (!res.ok) throw new Error(`City of Austin open data returned ${res.status}`);
  const rows = (await res.json()).map((r) => ({
    geoid: String(Math.round(+r.geoid22)), type: r.gentrifica, vulnerable: r.vulnerabil, change: r.demographi, housing: r.housing_ma, risk: r.displaceme,
  }));
  writeCache("city_displacement_risk_2022", rows);
  console.log(`  downloaded city_displacement_risk_2022: ${rows.length} tracts`);
  return rows;
}
const city = new Map((await cityRisk()).map((r) => [r.geoid, r]));
const CITY_TYPE = { Susceptible: "SUS", "Early: Type 1": "E1", "Early: Type 2": "E2", Dynamic: "DYN", Late: "LATE", "Continued Loss": "CL", "Rapid Loss": "RL", Stable: "none" };
const CITY_HOUSING = { Accelerating: "ACC", Appreciated: "APP", Adjacent: "ADJ", Stable: "NO" };

const check = { year: LATEST };
{
  const y = LATEST;
  let vBoth = 0, vAgree = 0, dBoth = 0, dAgree = 0, hBoth = 0, hAgree = 0, sBoth = 0, sAgree = 0, gBoth = 0, gAgree = 0;
  const cross = new Map();
  const group = (s) => (s === "SUS" || s === "VUL" ? "Vulnerable" : ["E1", "E2", "DYN", "LATE"].includes(s) ? "Active" : s === "CL" || s === "RL" ? "Chronic" : "None");
  const cityGroup = (c) => (c.risk === "Vulnerable" ? "Vulnerable" : c.risk === "Active Displacement Risk" ? "Active" : c.risk === "Chronic Displacement Risk" ? "Chronic" : "None");
  for (const u of tractUnits) {
    const out = results.get(keyOf(u))[y];
    const c = city.get(geoidOf.get(u.id));
    if (!c || out.reason) continue;
    if (c.vulnerable === "YES" || c.vulnerable === "NO") { vBoth++; if ((c.vulnerable === "YES") === out.vulnerable) vAgree++; }
    if ((c.change === "YES" || c.change === "NO") && out.changed != null) { dBoth++; if ((c.change === "YES") === out.changed) dAgree++; }
    if (CITY_HOUSING[c.housing] && out.housing) { hBoth++; if (CITY_HOUSING[c.housing] === out.housing.type) hAgree++; }
    // "Historical Displacement" is carried over from the City's earlier maps,
    // not produced by the test, so it has no counterpart here.
    if (c.type !== "N/A") {
      const k = `${c.type.padEnd(24)} -> ${out.stage}`;
      cross.set(k, (cross.get(k) || 0) + 1);
      gBoth++; if (group(out.stage) === cityGroup(c)) gAgree++;
    }
    if (CITY_TYPE[c.type]) {
      const mine = ["VUL", "NONE"].includes(out.stage) ? "none" : out.stage;
      sBoth++; if (mine === CITY_TYPE[c.type]) sAgree++;
    }
  }
  Object.assign(check, { vBoth, vAgree, dBoth, dAgree, hBoth, hAgree, sBoth, sAgree, gBoth, gAgree });
  console.log(`\nAgainst the City's 2022 map (same tracts; the City used earlier survey years):`);
  console.log(`  vulnerable yes/no        ${vAgree} of ${vBoth} agree (${Math.round(vAgree / vBoth * 100)}%)`);
  console.log(`  demographic change       ${dAgree} of ${dBoth} agree (${Math.round(dAgree / dBoth * 100)}%)`);
  console.log(`  housing market type      ${hAgree} of ${hBoth} agree (${Math.round(hAgree / hBoth * 100)}%)`);
  console.log(`  stage                    ${sAgree} of ${sBoth} agree (${Math.round(sAgree / sBoth * 100)}%)`);
  console.log(`  vulnerable/active/chronic ${gAgree} of ${gBoth} agree (${Math.round(gAgree / gBoth * 100)}%)`);
  if (REPORT) {
    console.log(`\n  City type                -> this build (${LATEST})`);
    for (const [k, n] of [...cross].sort()) console.log(`    ${k}: ${n}`);
  }
}

{
  const rows = tractUnits.map((u) => results.get(keyOf(u))[RECENT.to]).filter((o) => !o.reason);
  const yes = rows.filter((o) => o.recent?.changed === true).length;
  const no = rows.filter((o) => o.recent?.changed === false).length;
  console.log(`\nRecent change (${ACS_LABEL[RECENT.from]} to ${ACS_LABEL[RECENT.to]}): yes ${yes}, no ${no}, not measured ${rows.length - yes - no} of ${rows.length} scored tracts`);
  console.log(`  region and line: ` + D_FACTORS.map((f) => `${f.key} ${recentRegion[f.key].center.toFixed(1)} (+${(recentRegion[f.key].sd * Z_LINE).toFixed(1)})`).join(" | "));
  console.log(`  recent rise, 60th pct: value ${Math.round(recentRiseLine.value)}% | rent ${Math.round(recentRiseLine.rent)}%`);
  console.log(`  tracts whose ${RECENT.from} figures are allocated from earlier boundaries: ${tractUnits.filter((u) => carried2015(geoidOf.get(u.id))).length} of ${tractUnits.length}`);
}

if (REPORT) {
  const f1 = (v) => (v == null ? "  n/a" : v.toFixed(1).padStart(5));
  console.log("\n== The region and the lines, by year ==");
  for (const y of YEARS) {
    console.log(`${y}  ` + V_FACTORS.map((f) => `${f.key} ${f1(region[y].v[f.key].center)} (+${f1(region[y].v[f.key].sd * Z_LINE).trim()})`).join(" | "));
    if (y !== BASE) {
      console.log(`      change: ` + D_FACTORS.map((f) => `${f.key} ${f1(region[y].d[f.key].center)} (+${f1(region[y].d[f.key].sd * Z_LINE).trim()})`).join(" | "));
      console.log(`      housing 60th pct: value 2000 $${Math.round(housingBreaks[y].value.base)}, now $${Math.round(housingBreaks[y].value.now)}, rise ${Math.round(housingBreaks[y].value.rise)}% | rent 2000 $${Math.round(housingBreaks[y].rent.base)}, now $${Math.round(housingBreaks[y].rent.now)}, rise ${Math.round(housingBreaks[y].rent.rise)}%`);
    }
  }
  console.log("\n== Not scored ==");
  for (const u of tractUnits) {
    const r = results.get(keyOf(u));
    const why = YEARS.map((y) => r[y].reason || "-");
    const c = city.get(geoidOf.get(u.id));
    if (why.some((w) => w !== "-") || c?.type === "N/A") {
      const i = r[LATEST].ind;
      console.log(`  ${u.label.padEnd(46)} ${why.join(" ").padEnd(40)} pop ${String(i?.pop ?? "").padStart(6)} students ${f1(i?.students)} quarters ${f1(i?.gq)} | City: ${c?.type}`);
    }
  }
  console.log(`\n== Largest student shares among scored tracts (${LATEST}) ==`);
  tractUnits.map((u) => ({ u, i: results.get(keyOf(u))[LATEST] })).filter((x) => !x.i.reason)
    .sort((a, b) => (b.i.ind.students ?? 0) - (a.i.ind.students ?? 0)).slice(0, 12)
    .forEach((x) => console.log(`  ${x.u.label.padEnd(46)} students ${f1(x.i.ind.students)} quarters ${f1(x.i.ind.gq)} stage ${x.i.stage}`));
  console.log("\n== Stage by year, tracts with the largest fall in people-of-color share since 2000 ==");
  tractUnits.map((u) => { const r = results.get(keyOf(u)); return { u, r, d: r[LATEST].ind?.poc != null && r[2000].ind?.poc != null ? r[LATEST].ind.poc - r[2000].ind.poc : null }; })
    .filter((x) => x.d != null).sort((a, b) => a.d - b.d).slice(0, 25)
    .forEach((x) => console.log(`  ${x.u.label.padEnd(46)} ${f1(x.d)} pts | ${YEARS.map((y) => x.r[y].stage.padEnd(5)).join(" ")} | City: ${city.get(geoidOf.get(x.u.id))?.type}`));
  const explain = (u, y) => {
    const o = results.get(keyOf(u))[y];
    const h = o.housing;
    return `${u.label.slice(0, 40).padEnd(40)} ${String(y)} ${o.stage.padEnd(5)} V ${o.vulnerable ? "yes" : "no "} [${(o.vz || []).map((z) => (z == null ? " n/a" : z.toFixed(1).padStart(4))).join(" ")}]`
      + ` D ${o.changed == null ? "n/a" : o.changed ? "yes" : "no "} [${(o.dz || []).map((z) => (z == null ? " n/a" : z.toFixed(1).padStart(4))).join(" ")}] avg ${o.dAvg == null ? " n/a" : o.dAvg.toFixed(2)}`
      + ` H ${h ? `${h.type} ${h.track} $${Math.round(h.base)}->$${Math.round(h.now)} +${Math.round(h.rise)}% ${h.baseLow ? "baseLow" : "baseHigh"} ${h.nowHigh ? "nowHigh" : "nowLow"} ${h.riseHigh ? "riseHigh" : "riseLow"}` : "n/a"}`;
  };
  console.log(`\n== Vulnerable in 2000, no stage in ${LATEST} ==   z order: V [poc renter lowInc childPov noBA]  D [owner white ba mfi]`);
  for (const u of tractUnits) {
    const r = results.get(keyOf(u));
    if (r[2000].stage === "V0" && r[LATEST].stage === "NONE") console.log("  " + explain(u, LATEST));
  }
  console.log(`\n== Vulnerable, none of the published combinations (${LATEST}) ==`);
  for (const u of tractUnits) if (results.get(keyOf(u))[LATEST].stage === "VUL") console.log("  " + explain(u, LATEST));
  console.log("\n== Selected tracts, every year ==");
  for (const name of ["8.03", "9.01", "8.04", "21.09", "10.0", "23.2", "18.06", "2.03"]) {
    const u = tractUnits.find((x) => x.label.endsWith(`(tract ${name})`));
    if (u) for (const y of YEARS) console.log("  " + explain(u, y));
  }
  // How often does a tract's reading reverse from one year to the next?
  const ORDER = { NONE: 0, VUL: 1, SUS: 1, E1: 2, E2: 2, DYN: 3, LATE: 4, CL: 5, RL: 5 };
  let back = 0, steps = 0;
  for (const u of tractUnits) {
    const r = results.get(keyOf(u));
    const seqs = YEARS.slice(1).map((y) => r[y].stage).filter((s) => s !== "NA");
    for (let i = 1; i < seqs.length; i++) { steps++; if (ORDER[seqs[i]] < ORDER[seqs[i - 1]]) back++; }
  }
  console.log(`\nYear-to-year readings that move backwards: ${back} of ${steps}`);
  console.log("\n== Neighborhoods ==");
  for (const u of units.filter((x) => x.kind === "neighborhood")) {
    const r = results.get(keyOf(u));
    console.log(`  ${u.label.padEnd(34)} ${YEARS.map((y) => r[y].stage.padEnd(5)).join(" ")} | tracts: ${u.members.map((t) => results.get(`tract:${t}`)[LATEST].stage).join(", ")}`);
  }
}

// ── Write ───────────────────────────────────────────────────────────────

const r1 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(1));
const bits = (flags) => (flags || []).reduce((a, on, i) => a | (on ? 1 << i : 0), 0);
function pack(out, year) {
  const i = out.ind || {};
  const h = out.housing;
  return [
    out.stage,
    out.reason || "",
    i.pop != null ? Math.round(i.pop) : null,
    ...V_FACTORS.map((f) => r1(i[f.key])),
    bits(out.vHits),
    year === BASE || out.changed == null ? null : out.changed ? 1 : 0,
    ...D_FACTORS.map((f) => r1(out.change?.[f.key])),
    bits(out.dHits),
    h?.type || null,
    h ? (h.track === "value" ? "v" : "r") : null,
    h ? Math.round(h.base) : null,
    h ? Math.round(h.now) : null,
    h ? Math.round(h.rise) : null,
    h ? bits([h.baseLow, h.nowHigh, h.riseHigh]) : 0,
  ];
}
const FIELDS = [
  "stage", "reason", "pop",
  ...V_FACTORS.map((f) => f.key), "vBits",
  "changed", ...D_FACTORS.map((f) => `d_${f.key}`), "dBits",
  "housing", "track", "valueBase", "valueNow", "rise", "hBits",
];
const rowsOf = (kind) => Object.fromEntries(units.filter((u) => u.kind === kind).map((u) => {
  const r = results.get(keyOf(u));
  return [u.id, Object.fromEntries(YEARS.map((y) => [y, pack(r[y], y)]))];
}));
const regionOut = Object.fromEntries(YEARS.map((y) => [y, {
  source: y === BASE ? "2000 Census (SF1, SF3)" : `American Community Survey ${ACS_LABEL[y]}`,
  medianFamilyIncome: regionMfi[y],
  lowIncomeLine: Math.round(lowIncomeLine[y]),
  // [regional figure, the line a tract must pass]
  v: Object.fromEntries(V_FACTORS.map((f) => [f.key, [r1(region[y].v[f.key].center), r1(region[y].v[f.key].center + Z_LINE * region[y].v[f.key].sd)]])),
  d: y === BASE ? null : Object.fromEntries(D_FACTORS.map((f) => [f.key, [r1(region[y].d[f.key].center), r1(region[y].d[f.key].center + Z_LINE * region[y].d[f.key].sd)]])),
  housing: y === BASE ? null : Object.fromEntries(["value", "rent"].map((k) => [k, [Math.round(housingBreaks[y][k].base), Math.round(housingBreaks[y][k].now), Math.round(housingBreaks[y][k].rise)]])),
  counts: tally(tractUnits.map((u) => results.get(keyOf(u))[y].stage)),
}]));
const cityOut = Object.fromEntries(TRACT_ROWS.map((t) => {
  const c = city.get(t.geoid22);
  return [t.region_id, c ? [c.type, c.risk === "N/A" ? "" : c.risk] : null];
}));

const banner = `// GENERATED by scripts/build_stages.mjs. Do not edit; run "npm run build:stages".
// Displacement stage of every tract and multi-tract neighborhood, by census
// year, from the three-part test in Appendix 3 of the UT "Uprooted" study.
// Method, departures and limits: DATA_METHODOLOGY.md, section 3.
`;
const body = [
  banner,
  `export const STAGE_YEARS = ${JSON.stringify(YEARS)};`,
  `export const STAGE_BASE_YEAR = ${BASE};`,
  `export const STAGE_FIELDS = ${JSON.stringify(FIELDS)};`,
  `export const STAGE_REGION = ${JSON.stringify(regionOut)};`,
  `export const STAGE_CHECK = ${JSON.stringify(check)};`,
  `export const TRACT_STAGE_ROWS = ${JSON.stringify(rowsOf("tract"))};`,
  `export const NEIGHBORHOOD_STAGE_ROWS = ${JSON.stringify(rowsOf("neighborhood"))};`,
  `export const CITY_RISK_2022 = ${JSON.stringify(cityOut)};`,
  "",
].join("\n");

// Lens figures for the latest survey, tracts only.
const r2 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(2));
const LENS_FIELDS = [
  "dIndex",
  "recent", ...D_FACTORS.map((f) => `r_${f.key}`), "rBits", "rIndex",
  "risePct", "recentRise", "recentHigh", "carried",
];
const lensRows = Object.fromEntries(tractUnits.map((u) => {
  const out = results.get(keyOf(u))[RECENT.to];
  const rec = out.recent;
  const h = out.housing;
  return [u.id, [
    r2(out.dAvg),
    rec?.changed == null ? null : rec.changed ? 1 : 0,
    ...D_FACTORS.map((f) => r1(rec?.change?.[f.key])),
    bits(rec?.hits), r2(rec?.avg),
    r1(h?.risePct),
    h?.recentRise == null ? null : Math.round(h.recentRise),
    h?.recentHigh == null ? null : h.recentHigh ? 1 : 0,
    carried2015(geoidOf.get(u.id)) ? 1 : 0,
  ]];
}));
const lensRegion = {
  from: RECENT.from, to: RECENT.to, base: BASE,
  fromSource: `American Community Survey ${ACS_LABEL[RECENT.from]}`,
  toSource: `American Community Survey ${ACS_LABEL[RECENT.to]}`,
  // [the region's change, the line a tract must pass]
  d: Object.fromEntries(D_FACTORS.map((f) => [f.key, [r1(recentRegion[f.key].center), r1(recentRegion[f.key].center + Z_LINE * recentRegion[f.key].sd)]])),
  recentRiseLine: { value: Math.round(recentRiseLine.value), rent: Math.round(recentRiseLine.rent) },
};
const lensBody = [
  `// GENERATED by scripts/build_stages.mjs. Do not edit; run "npm run build:stages".
// Extra figures for the presenter-only Triage view: index values for the
// latest survey and change between the two latest surveys that do not overlap.
// Method: DATA_METHODOLOGY.md, section 6.
`,
  `export const LENS_FIELDS = ${JSON.stringify(LENS_FIELDS)};`,
  `export const LENS_REGION = ${JSON.stringify(lensRegion)};`,
  `export const TRACT_LENS_ROWS = ${JSON.stringify(lensRows)};`,
  "",
].join("\n");

if (DRY) {
  console.log(`\n--dry: nothing written (${Math.round(body.length / 1024)} KB + ${Math.round(lensBody.length / 1024)} KB).`);
} else {
  writeFileSync(join(ROOT, "data", "stages.js"), body);
  writeFileSync(join(ROOT, "data", "stageLenses.js"), lensBody);
  console.log(`\nWrote data/stages.js (${Math.round(body.length / 1024)} KB) and data/stageLenses.js (${Math.round(lensBody.length / 1024)} KB)`);
}
