// ── Displacement stages: the one place the app reads them from ──
//
// The stage of every tract and multi-tract neighborhood is computed ahead of
// time by scripts/build_stages.mjs (the three-part test from Appendix 3 of
// the UT "Uprooted" study) and stored in data/stages.js. This module turns
// those packed rows into what the map, legend, panel and story card show.
//
// A stage is a category, not a score: it is never averaged or interpolated.
// A year on the slider shows the latest census year at or before it.

import {
  STAGE_YEARS, STAGE_BASE_YEAR, STAGE_FIELDS, STAGE_REGION, STAGE_CHECK,
  TRACT_STAGE_ROWS, NEIGHBORHOOD_STAGE_ROWS, CITY_RISK_2022,
} from "../data/stages";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";

export { STAGE_YEARS, STAGE_BASE_YEAR, STAGE_CHECK };

// ── What the map draws ──
// One hue, light to dark, so the order reads without a key and holds under
// color-vision deficiency (checked: monotone lightness, every step apart).
//   fill: polygon and swatch  ·  on: text placed on the fill
export const STAGE_CLASSES = [
  {
    key: "vulnerable", label: "Vulnerable", fill: "#eba259", on: "#1a1a1a",
    meaning: "Many residents here are more exposed to rising housing costs than the region as a whole: renters, lower incomes, children in poverty, fewer college degrees. The measures do not yet show the area changing.",
  },
  {
    key: "early", label: "Early", fill: "#de7b2e", on: "#1a1a1a",
    meaning: "Vulnerable residents live here and one sign of change has appeared: home values are rising fast, or the population has started to shift.",
  },
  {
    key: "dynamic", label: "Dynamic", fill: "#c9550a", on: "#1a1a1a",
    meaning: "Vulnerable residents live here while both signs of change are present: home values are rising fast and the population is shifting.",
  },
  {
    key: "late", label: "Late", fill: "#a7320c", on: "#fffffe",
    meaning: "Home values are now among the highest on this map and the population has shifted, but vulnerable residents still live here.",
  },
  {
    key: "loss", label: "Continued loss", fill: "#75201a", on: "#fffffe",
    meaning: "By these measures residents here are no longer vulnerable. The population has shifted and home values have risen. Most of the change has already happened.",
  },
];
export const STAGE_NONE = {
  key: "none", label: "No stage", fill: "#dedbd5", on: "#1a1a1a",
  meaning: "Residents here are not vulnerable by these measures, or none of the patterns applies. It does not mean no one here is at risk.",
};
export const STAGE_UNSCORED = {
  key: "unscored", label: "Not scored", fill: "#b9b4ab", on: "#1a1a1a",
  meaning: "Too few residents, or most are college students or live in group quarters such as dormitories or a jail, so the measures would mislead.",
};
export const STAGE_NO_DATA = { key: "nodata", label: "No census figures", fill: "#e0ddd7", on: "#1a1a1a", meaning: "" };

const CLASS_BY_KEY = Object.fromEntries([...STAGE_CLASSES, STAGE_NONE, STAGE_UNSCORED, STAGE_NO_DATA].map((c) => [c.key, c]));

// The exact type (the UT study's names) behind each class, and one sentence
// on what put a place there.
const TYPES = {
  V0: { cls: "vulnerable", name: "Vulnerable in 2000", why: "In 2000, residents here were more exposed to rising housing costs than the region as a whole. Change is measured from this year, so no stage is assigned yet." },
  N0: { cls: "none", name: "Not vulnerable in 2000", why: "In 2000, residents here were not vulnerable by these measures. Change is measured from this year, so no stage is assigned yet." },
  SUS: { cls: "vulnerable", name: "Susceptible", why: "Vulnerable residents live here, no demographic change has been measured, and it borders tracts where home values are high or rising fast." },
  VUL: { cls: "vulnerable", name: "Vulnerable", why: "Vulnerable residents live here. The housing market and population do not show any of the patterns the stages are built on." },
  E1: { cls: "early", name: "Early: Type 1", why: "Vulnerable residents live here and home values are rising fast, without demographic change so far." },
  E2: { cls: "early", name: "Early: Type 2", why: "Vulnerable residents live here and the population has started to shift. It borders tracts where home values are high or rising fast." },
  DYN: { cls: "dynamic", name: "Dynamic", why: "Vulnerable residents live here, home values are rising fast, and the population is shifting." },
  LATE: { cls: "late", name: "Late", why: "Home values here started low and are now among the highest on this map, and the population has shifted. Vulnerable residents still live here." },
  CL: { cls: "loss", name: "Continued loss", why: "Residents here are no longer vulnerable by these measures. Home values started low and are now among the highest on this map, and the population has shifted." },
  RL: { cls: "loss", name: "Rapid loss", why: "Residents here were vulnerable in 2000 and no longer are. The population has shifted and home values are rising fast, though they are not yet among the highest. The City of Austin groups this with continued loss." },
  NONE: { cls: "none", name: "No stage", why: STAGE_NONE.meaning },
  NA: { cls: "unscored", name: "Not scored", why: STAGE_UNSCORED.meaning },
};
const UNSCORED_WHY = {
  few: "Fewer than 500 residents, too few for the measures to mean much.",
  students: "Half or more of the residents are enrolled in college, so income and education figures would mislead.",
  quarters: "Half or more of the residents live in group quarters such as dormitories or a jail.",
  nodata: "The census does not report enough figures for this area.",
};

export const V_MEASURES = [
  { key: "poc", label: "People of color" },
  { key: "renter", label: "Households that rent" },
  { key: "lowInc", label: "Lower-income households" },
  { key: "childPov", label: "Children in poverty" },
  { key: "noBA", label: "Adults without a bachelor's degree" },
];
export const D_MEASURES = [
  { key: "owner", label: "Households that own", unit: "pts" },
  { key: "white", label: "White, non-Hispanic residents", unit: "pts" },
  { key: "ba", label: "Adults with a bachelor's degree", unit: "pts" },
  { key: "mfi", label: "Median family income", unit: "%" },
];
const HOUSING_NAMES = {
  ACC: "Accelerating", APP: "Appreciated", ADJ: "Adjacent", NO: "None of the three patterns",
};

const AT = Object.fromEntries(STAGE_FIELDS.map((f, i) => [f, i]));

/** The census year a slider year shows, or null before the data starts. */
export function stageDataYear(year) {
  if (year == null || year < STAGE_BASE_YEAR) return null;
  let best = STAGE_YEARS[0];
  for (const y of STAGE_YEARS) if (y <= year) best = y;
  return best;
}

/** "2019-2023 survey" style label for the source of a census year. */
export function stageSourceLabel(dataYear) {
  const src = STAGE_REGION[dataYear]?.source || "";
  const m = src.match(/(\d{4})-(\d{4})/);
  return m ? `${m[1]}–${m[2]} census survey` : "2000 Census";
}

function rowsFor(ref) {
  if (!ref || ref.id == null) return null;
  if (ref.kind === "neighborhood") {
    const hood = NEIGHBORHOOD_BY_ID.get(ref.id);
    if (!hood) return null;
    return hood.tract_ids.length === 1 ? TRACT_STAGE_ROWS[hood.tract_ids[0]] : NEIGHBORHOOD_STAGE_ROWS[ref.id];
  }
  return TRACT_STAGE_ROWS[ref.id] || null;
}

/** Display class of a tract at a slider year. Used for every polygon, so it stays cheap. */
export function tractStageClass(regionId, year) {
  const dataYear = stageDataYear(year);
  if (dataYear == null) return STAGE_NO_DATA;
  const code = TRACT_STAGE_ROWS[regionId]?.[dataYear]?.[0];
  return CLASS_BY_KEY[TYPES[code]?.cls] || STAGE_NO_DATA;
}

/** Display class of any place at a slider year. */
export function placeStageClass(ref, year) {
  const dataYear = stageDataYear(year);
  if (dataYear == null) return STAGE_NO_DATA;
  const code = rowsFor(ref)?.[dataYear]?.[0];
  return CLASS_BY_KEY[TYPES[code]?.cls] || STAGE_NO_DATA;
}

function decode(row, dataYear) {
  const code = row[AT.stage];
  const type = TYPES[code] || TYPES.NONE;
  const regionYear = STAGE_REGION[dataYear];
  const scored = code !== "NA";

  const vBits = row[AT.vBits] || 0;
  const vMeasures = V_MEASURES.map((m, i) => ({
    ...m,
    value: row[AT[m.key]],
    region: regionYear.v[m.key][0],
    line: regionYear.v[m.key][1],
    over: !!(vBits & (1 << i)),
  }));

  const changed = row[AT.changed];
  const dBits = row[AT.dBits] || 0;
  const dMeasures = dataYear === STAGE_BASE_YEAR || !regionYear.d ? [] : D_MEASURES.map((m, i) => ({
    ...m,
    value: row[AT[`d_${m.key}`]],
    region: regionYear.d[m.key][0],
    line: regionYear.d[m.key][1],
    over: !!(dBits & (1 << i)),
  }));

  const housingCode = row[AT.housing];
  const hBits = row[AT.hBits] || 0;
  const housing = housingCode ? {
    code: housingCode,
    name: HOUSING_NAMES[housingCode],
    measure: row[AT.track] === "r" ? "median rent" : "median home value",
    isRent: row[AT.track] === "r",
    base: row[AT.valueBase],
    now: row[AT.valueNow],
    rise: row[AT.rise],
    baseLow: !!(hBits & 1),
    nowHigh: !!(hBits & 2),
    riseHigh: !!(hBits & 4),
  } : null;

  return {
    code,
    cls: CLASS_BY_KEY[type.cls],
    typeName: type.name,
    why: code === "NA" ? (UNSCORED_WHY[row[AT.reason]] || type.why) : type.why,
    dataYear,
    source: stageSourceLabel(dataYear),
    isBaseYear: dataYear === STAGE_BASE_YEAR,
    scored,
    population: row[AT.pop],
    vulnerable: scored ? { yes: vMeasures.filter((m) => m.over).length >= 3, count: vMeasures.filter((m) => m.over).length, measures: vMeasures } : null,
    change: scored && dataYear !== STAGE_BASE_YEAR
      ? { measured: changed != null, yes: changed === 1, count: dMeasures.filter((m) => m.over).length, measures: dMeasures }
      : null,
    housing: scored ? housing : null,
  };
}

/** Everything about a place's stage at a slider year, or null before 2000 / for an unknown place. */
export function stageFor(ref, year) {
  const dataYear = stageDataYear(year);
  const row = dataYear != null ? rowsFor(ref)?.[dataYear] : null;
  return row ? decode(row, dataYear) : null;
}

/** The stage at each census year, oldest first. */
export function stageSeriesFor(ref) {
  const rows = rowsFor(ref);
  if (!rows) return [];
  return STAGE_YEARS.filter((y) => rows[y]).map((y) => decode(rows[y], y));
}

const CITY_GROUP = {
  "Vulnerable": "Vulnerable",
  "Active Displacement Risk": "Active displacement risk",
  "Chronic Displacement Risk": "Chronic displacement risk",
};

/**
 * What the City of Austin's own 2022 displacement risk map says about the
 * same tract(s): [{ label, count }], most common first. "Not listed" covers
 * tracts the City left out of its three risk categories.
 */
export function cityRiskFor(ref) {
  if (!ref || ref.id == null) return [];
  const ids = ref.kind === "neighborhood" ? (NEIGHBORHOOD_BY_ID.get(ref.id)?.tract_ids || []) : [ref.id];
  const counts = new Map();
  for (const id of ids) {
    const entry = CITY_RISK_2022[id];
    if (!entry) continue;
    const label = CITY_GROUP[entry[1]] || "Not in a risk category";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/** How many of the site's tracts sit in each display class in a census year. */
export function stageCounts(dataYear) {
  const raw = STAGE_REGION[dataYear]?.counts || {};
  const out = Object.fromEntries([...STAGE_CLASSES, STAGE_NONE, STAGE_UNSCORED].map((c) => [c.key, 0]));
  for (const [code, n] of Object.entries(raw)) {
    const key = TYPES[code]?.cls;
    if (key) out[key] += n;
  }
  return out;
}

/** Regional figures for a census year (median family income, the low-income line). */
export function stageRegion(dataYear) {
  return STAGE_REGION[dataYear] || null;
}
