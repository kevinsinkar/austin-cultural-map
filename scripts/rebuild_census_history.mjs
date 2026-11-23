// Rebuilds the 2000, 2010 and 2015 population, race, tenure and rent-burden
// figures in the demographics file from the Census Bureau's own tables,
// allocated onto today's (2020) tract boundaries.
//
//   node scripts/rebuild_census_history.mjs        (or: npm run build:history)
//   node scripts/rebuild_census_history.mjs --dry  (report only, write nothing)
//
// Why this exists (found November 2026):
//   * 2000 and 2010 "owner-occupied" was read from census table H003
//     (occupancy: occupied vs vacant) instead of H004 (tenure: owner vs
//     renter), or from the mortgaged-owner cell alone. Renter share was
//     wrong in most tracts for both years.
//   * Tracts that were split after 2000 or 2010 carried their parent tract's
//     whole population, and 177 of the 2000 rows carried estimated rather
//     than counted non-Hispanic race figures.
//   * 2015 rent burden mixed two definitions (30%+ and 50%+ of income).
//
// What it writes, for rows that already exist in the file:
//   2000  population, race shares, owner share      Census 2000 SF1 (P004, H004)
//   2010  population, race shares, owner share      Census 2010 SF1 (P005, H004)
//         rent burden, where the row already had one  ACS 2006-2010 (B25070)
//   2015  population, race shares, owner share,
//         rent burden                                ACS 2011-2015 (B03002, B25003, B25070)
//   2005  the same fields, re-interpolated between 2000 and 2010
// Nothing else in a row is touched. The other census figures in the 2010 and
// 2015 rows (income, home value, rent, poverty and the rest) are rebuilt by
// scripts/rebuild_acs_history.mjs, which "npm run build:history" runs next.
// 2020 and the latest survey already match the census tables (checked) and
// are left alone. A run that changes nothing leaves every timestamp alone.
//
// Definitions:
//   owner share   owner-occupied units / occupied units
//   rent burden   renters paying 50% or more of income on rent / all renters
//                 (the definition the 2020 and 2023 rows already use)
//
// Old tracts are mapped to 2020 tracts with the Census Bureau's tract
// relationship files: 2000->2010 by the share of the 2000 tract's population
// (people) or housing units (homes) in each piece, 2010->2020 by land area
// (the only measure that file carries). Counts are allocated and summed,
// then shares are taken, so a split tract gets its part of the parent's
// population, not all of it.
//
// Raw pulls and trimmed crosswalks are cached in data/_cache/census_history/
// so the rebuild runs offline. Fetching them again needs a Census API key in
// CENSUS_API_KEY (or CENSUS_DATA_API).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT, loadTractTable, loadRelationship,
  REL_2000_2010_URL, REL_2010_2020_URL, parseRel2000, parseRel2010,
  forwardWeights, sourcesOf, allocate,
} from "./lib/census.mjs";

const DEMO_PATH = join(ROOT, "data", "phase1_output", "audited_demographics_normalized.json");
const ROSETTA = JSON.parse(readFileSync(join(ROOT, "data", "region_tract_rosetta.json"), "utf8"));
const DRY = process.argv.includes("--dry");
const COUNTIES = [...new Set(ROSETTA.map((r) => r.geoid22.slice(2, 5)))].sort();
const IN_AREA = (geoid) => geoid.startsWith("48") && COUNTIES.includes(geoid.slice(2, 5));

// ── Raw tables and tract relationship files (cached; see scripts/lib/census.mjs) ──

const TABLES = {
  sf1_2000: ["2000/dec/sf1", ["P001001", "P004002", "P004005", "P004006", "P004008", "H004001", "H004002"]],
  sf1_2010: ["2010/dec/sf1", ["P001001", "P005010", "P005003", "P005004", "P005006", "H004001", "H004002", "H004003"]],
  acs_2010: ["2010/acs/acs5", ["B25070_001E", "B25070_010E"]],
  acs_2015: ["2015/acs/acs5", ["B03002_001E", "B03002_012E", "B03002_003E", "B03002_004E", "B03002_006E", "B25003_001E", "B25003_002E", "B25070_001E", "B25070_010E"]],
};
const loadTable = (name) => loadTractTable(name, TABLES[name][0], TABLES[name][1], COUNTIES);
// [geoid2000, geoid2010, share of the 2000 tract's people, share of its homes]
const REL_2000_2010 = () => loadRelationship("rel_2000_2010", REL_2000_2010_URL, parseRel2000(IN_AREA));
// [geoid2010, geoid2020, share of the 2010 tract's land]
const REL_2010_2020 = () => loadRelationship("rel_2010_2020", REL_2010_2020_URL, parseRel2010(IN_AREA));

// ── Allocation helpers ──────────────────────────────────────────────────

const share = (part, whole) => (part != null && whole > 0 ? +((part / whole) * 100).toFixed(1) : null);
const describe = (sources) => {
  const real = [...(sources || [])].filter(([, w]) => w >= 0.02);
  const direct = real.length === 1 && real[0][1] >= 0.98;
  return { count: real.length, direct };
};

// ── Main ────────────────────────────────────────────────────────────────

const [sf1_2000, sf1_2010, acs_2010, acs_2015, rel0010, rel1020] = await Promise.all([
  loadTable("sf1_2000"), loadTable("sf1_2010"), loadTable("acs_2010"), loadTable("acs_2015"),
  REL_2000_2010(), REL_2010_2020(),
]);

const step1020 = forwardWeights(rel1020, 2);
const from2010 = sourcesOf(step1020);
const from2000people = sourcesOf(forwardWeights(rel0010, 2), step1020);
const from2000homes = sourcesOf(forwardWeights(rel0010, 3), step1020);

const SPECS = {
  2000: {
    label: "2000 Census SF1 (tables P004 and H004)",
    people: (g) => from2000people.get(g), homes: (g) => from2000homes.get(g), table: sf1_2000,
    pop: (r) => r.P001001, hispanic: (r) => r.P004002, white: (r) => r.P004005, black: (r) => r.P004006, asian: (r) => r.P004008,
    occupied: (r) => r.H004001, owner: (r) => r.H004002,
  },
  2010: {
    label: "2010 Census SF1 (tables P005 and H004)",
    people: (g) => from2010.get(g), homes: (g) => from2010.get(g), table: sf1_2010,
    pop: (r) => r.P001001, hispanic: (r) => r.P005010, white: (r) => r.P005003, black: (r) => r.P005004, asian: (r) => r.P005006,
    occupied: (r) => r.H004001, owner: (r) => (r.H004002 == null || r.H004003 == null ? null : r.H004002 + r.H004003),
    rentTable: acs_2010, rentOnlyWhereSet: true,
  },
  2015: {
    label: "ACS 2011-2015 (tables B03002, B25003 and B25070)",
    people: (g) => from2010.get(g), homes: (g) => from2010.get(g), table: acs_2015,
    pop: (r) => r.B03002_001E, hispanic: (r) => r.B03002_012E, white: (r) => r.B03002_003E, black: (r) => r.B03002_004E, asian: (r) => r.B03002_006E,
    occupied: (r) => r.B25003_001E, owner: (r) => r.B25003_002E,
    rentTable: acs_2015,
  },
};

const demo = JSON.parse(readFileSync(DEMO_PATH, "utf8"));
const geoidOf = new Map(ROSETTA.map((r) => [r.region_id, r.geoid22]));
const STALE_FLAGS = ["RACE_NOT_NH_ADJUSTED", "NH_ESTIMATED", "COMPUTED_FROM_PARENT_TRACT", "ALLOCATED_FROM_EARLIER_TRACTS", "NO_TENURE_SOURCE", "NO_SOURCE_TRACT"];
const stamp = new Date().toISOString();
const SURVEY_NOTE = "Survey figures: "; // the sentence rebuild_acs_history.mjs adds to a row's note
/** Everything in a row except its timestamp, to tell whether a run changed it. */
const fingerprint = (row) => JSON.stringify({ ...row, audit_timestamp: null });
const report = {};
const note = (year, key) => { report[year] ??= {}; report[year][key] = (report[year][key] || 0) + 1; };

for (const row of demo) {
  const spec = SPECS[row.year];
  if (!spec) continue;
  const geoid = geoidOf.get(row.region_id);
  if (!geoid) continue;
  const people = spec.people(geoid);
  const homes = spec.homes(geoid);
  const before = fingerprint(row);
  const flags = (row.audit_flags || []).filter((f) => !STALE_FLAGS.includes(f));
  const parts = [];

  // Population and race
  const pop = allocate(people, spec.table, spec.pop);
  if (pop != null && pop >= 1) {
    const before = { pop: row.total_population, bh: (row.pct_black_non_hispanic ?? 0) + (row.pct_hispanic ?? 0) };
    row.total_population = Math.round(pop);
    row.pct_hispanic = share(allocate(people, spec.table, spec.hispanic), pop);
    row.pct_white_non_hispanic = share(allocate(people, spec.table, spec.white), pop);
    row.pct_black_non_hispanic = share(allocate(people, spec.table, spec.black), pop);
    row.pct_asian = share(allocate(people, spec.table, spec.asian), pop);
    parts.push("population and race");
    note(row.year, "population and race rebuilt");
    if (before.pop && Math.abs(before.pop - row.total_population) / row.total_population > 0.1) note(row.year, "  population changed by more than 10%");
    if (Math.abs(before.bh - (row.pct_black_non_hispanic + row.pct_hispanic)) > 5) note(row.year, "  Black + Hispanic share changed by more than 5 points");
  } else if (row.year === 2000) {
    // A 2000 row holds nothing but population, race and tenure. With no
    // 2000 tract to take them from, the row is a guess: drop it.
    row.__drop = true;
    note(row.year, "row removed (no 2000 tract covers this area)");
    continue;
  } else {
    flags.push("NO_SOURCE_TRACT");
    note(row.year, "population and race left as they were (no source tract)");
  }

  // Tenure
  const occupied = allocate(homes, spec.table, spec.occupied);
  const owner = allocate(homes, spec.table, spec.owner);
  const ownerShare = share(owner, occupied);
  if (ownerShare != null) {
    if (row.pct_owner_occupied != null && Math.abs(row.pct_owner_occupied - ownerShare) > 5) note(row.year, "  owner share changed by more than 5 points");
    row.pct_owner_occupied = ownerShare;
    parts.push("tenure");
    note(row.year, "owner share rebuilt");
  } else if (row.year !== 2015 && (row.pct_owner_occupied != null || (row.audit_flags || []).includes("NO_TENURE_SOURCE"))) {
    // The old 2000/2010 figure came from the wrong table and cannot be confirmed.
    // (A row an earlier run already emptied keeps its flag.)
    row.pct_owner_occupied = null;
    flags.push("NO_TENURE_SOURCE");
    note(row.year, "owner share removed (wrong table, no source to rebuild from)");
  }

  // Rent burden: renters paying half or more of income / all renters
  if (spec.rentTable && !(spec.rentOnlyWhereSet && row.rent_burden_pct == null)) {
    const renters = allocate(homes, spec.rentTable, (r) => r.B25070_001E);
    const burdened = allocate(homes, spec.rentTable, (r) => r.B25070_010E);
    const burden = share(burdened, renters);
    if (burden != null) {
      if (row.rent_burden_pct != null && Math.abs(row.rent_burden_pct - burden) > 5) note(row.year, "  rent burden changed by more than 5 points");
      row.rent_burden_pct = burden;
      parts.push("rent burden (50%+ of income)");
      note(row.year, "rent burden rebuilt");
    }
  }

  if (!parts.length) continue;
  const src = describe(people || homes);
  if (!src.direct) flags.push("ALLOCATED_FROM_EARLIER_TRACTS");
  row.audit_flags = flags;
  // The row's other census figures belong to rebuild_acs_history.mjs, which
  // adds its own sentence to the note; keep that sentence if it is there.
  const surveyNote = String(row.audit_notes || "").split(" | ").filter((s) => s.startsWith(SURVEY_NOTE));
  row.audit_notes = [`${parts.join(", ")}: ${spec.label}, `
    + (src.direct
      ? "same tract boundary as today."
      : `allocated to today's tract boundary from ${src.count} earlier tract${src.count === 1 ? " (a part of it)" : "s"} with Census Bureau relationship files.`),
  ...surveyNote].join(" | ");
  // A row that already says all this keeps its timestamp.
  if (fingerprint(row) !== before) row.audit_timestamp = stamp;
  note(row.year, src.direct ? "same boundary" : "allocated from earlier tracts");
}

// 2005 is a straight line between 2000 and 2010; redo it for the rebuilt fields.
const kept = demo.filter((r) => !r.__drop);
const at = new Map(kept.map((r) => [`${r.region_id}_${r.year}`, r]));
const LERP_FIELDS = ["total_population", "pct_hispanic", "pct_white_non_hispanic", "pct_black_non_hispanic", "pct_asian", "pct_owner_occupied", "rent_burden_pct"];
for (const row of kept) {
  if (row.year !== 2005 || !(row.audit_flags || []).includes("INTERPOLATED")) continue;
  const a = at.get(`${row.region_id}_2000`);
  const b = at.get(`${row.region_id}_2010`);
  if (!a || !b) {
    // Its 2000 end was removed above, so there is nothing to interpolate from.
    row.__drop = true;
    note(2005, "row removed (no 2000 figure to interpolate from)");
    continue;
  }
  const before = fingerprint(row);
  for (const f of LERP_FIELDS) {
    const x = a[f], y = b[f];
    row[f] = x != null && y != null ? +((x + y) / 2).toFixed(2) : x ?? y ?? null;
  }
  row.total_population = row.total_population != null ? Math.round(row.total_population) : null;
  if (fingerprint(row) !== before) row.audit_timestamp = stamp;
  note(2005, "re-interpolated");
}

console.log(`Counties: ${COUNTIES.join(", ")} | regions: ${ROSETTA.length}`);
for (const year of Object.keys(report).sort()) {
  console.log(`\n${year}`);
  for (const [k, v] of Object.entries(report[year])) console.log(`  ${k.padEnd(62)} ${v}`);
}
if (DRY) {
  console.log("\n--dry: nothing written.");
} else {
  writeFileSync(DEMO_PATH, JSON.stringify(demo.filter((r) => !r.__drop), null, 2));
  console.log(`\nWrote ${DEMO_PATH}`);
}
