/**
 * auditedData.js
 * ──────────────
 * Loads the audited output datasets (demographics, property, socioeconomic)
 * and pre-indexes them by region_id for fast lookups when a region is selected.
 *
 * The audited JSON files have inconsistent field names across regions
 * (e.g. median_rent vs average_rent vs median_rent_usd).  We normalise
 * every row on import so the rest of the app can rely on canonical names.
 */

import AUDITED_DEMO from "./phase1_output/audited_demographics_normalized.json";
import AUDITED_PROP from "./phase1_output/audited_property_normalized.json";
import AUDITED_SOCIO from "./phase1_output/audited_socioeconomic_normalized.json";

// ── Field-name normalisation ────────────────────────────────────────────

/**
 * Return the first non-null/non-undefined value found for any of `keys`
 * on the given object, or `fallback` if none found.
 */
function pick(obj, keys, fallback = null) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}

/**
 * Some audited rows store race data inside nested objects such as
 * `racial_composition`, `race_ethnicity`, `ethnic_distribution`, etc.
 * Flatten those into top-level `_pct`-style keys before pick() runs.
 * `ethnic_distribution` sometimes uses 0–1 fractions instead of 0–100.
 */
function flattenNested(r) {
  const obj =
    r.racial_composition || r.race_ethnicity ||
    r.race_ethnicity_distribution || r.ethnic_distribution;
  if (!obj || typeof obj !== "object") return r;

  // ethnic_distribution often stores 0–1 fractions; detect and scale
  const vals = Object.values(obj).filter((v) => typeof v === "number");
  const maxVal = Math.max(...vals, 0);
  const scale = maxVal <= 1 ? 100 : 1; // convert fractions → percentages

  const flat = { ...r };
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "number") continue;
    // Only set if `r` doesn't already have the key
    if (flat[k] == null) flat[k] = v * scale;
  }
  return flat;
}

/** Normalise a raw audited demographic row to canonical field names. */
function normDemo(raw) {
  const r = flattenNested(raw);
  return {
    ...r,
    // canonical race/ethnicity fields — covers all observed field name variants
    pct_white_non_hispanic: pick(r, [
      "pct_white_non_hispanic", "pct_white",
      "percent_white_non_hispanic", "percent_white", "percent_caucasian",
      "white_non_hispanic_pct", "white_pct", "white_percent", "white_percentage",
      "ethnicity_white_pct", "ethnicity_white_percent",
      "population_white_pct", "population_white_percent",
      "race_white_pct", "race_white_percentage",
    ]),
    pct_black_non_hispanic: pick(r, [
      "pct_black_non_hispanic", "pct_black", "pct_african_american",
      "percent_black_non_hispanic", "percent_black", "percent_african_american",
      "black_non_hispanic_pct", "black_pct", "black_percent", "black_percentage",
      "african_american_pct",
      "ethnicity_black_pct", "ethnicity_black_percent",
      "population_black_pct", "population_black_percent",
      "race_black_pct", "race_black_percentage",
    ]),
    pct_hispanic: pick(r, [
      "pct_hispanic",
      "percent_hispanic",
      "hispanic_pct", "hispanic_percent", "hispanic_percentage",
      "hispanic_latino_pct",
      "ethnicity_hispanic_pct", "ethnicity_hispanic_percent",
      "population_hispanic_pct", "population_hispanic_percent",
      "race_hispanic_pct", "race_hispanic_percentage",
    ]),
    pct_asian: pick(r, [
      "pct_asian",
      "percent_asian", "percent_asian_non_hispanic",
      "asian_pct", "asian_percent", "asian_percentage",
      "asian_non_hispanic_pct",
      "ethnicity_asian_pct", "ethnicity_asian_percent",
      "population_asian_pct", "population_asian_percent",
      "race_asian_pct", "race_asian_percentage",
    ]),
    pct_foreign_born: pick(r, [
      "pct_foreign_born", "foreign_born_pct", "foreign_born_percent",
    ]),
    rent_burden_pct: pick(r, [
      "rent_burden_pct",
    ]),
    pct_bachelors_degree_or_higher: pick(r, [
      "pct_bachelors_degree_or_higher", "pct_bachelors_or_higher",
      "bachelors_degree_or_higher_pct",
      "percent_bachelors_degree_or_higher", "percent_with_bachelors_degree_or_higher",
      "percent_with_bachelors_degree", "percent_with_bachelor_degree_or_higher",
      "percent_bachelor_degree_or_higher",
    ]),
    total_population: pick(r, [
      "total_population", "population_total", "population",
    ]),
  };
}

/** Normalise a raw audited property row to canonical field names. */
function normProp(r) {
  return {
    ...r,
    // canonical fields the panel reads
    median_home_value: pick(r, [
      "median_home_value", "median_home_value_usd", "median_home_price", "home_value_median",
    ]),
    median_rent_monthly: pick(r, [
      "median_rent_monthly", "median_rent", "median_rent_usd",
      "median_rental_rate_monthly", "rent_median",
      "average_rent", "average_rent_usd", "average_rent_monthly",
      "average_rent_per_month", "average_rent_per_month_usd",
      "avg_rent", "avg_rent_monthly",
    ]),
    residential_units: pick(r, [
      "residential_units", "housing_units", "total_housing_units",
    ]),
    commercial_sqft: pick(r, [
      "commercial_sqft", "total_office_space_sqft", "total_retail_space_sqft",
    ]),
    vacancy_rate: pick(r, [
      "vacancy_rate", "vacancy_rate_percent",
      "commercial_vacancy_rate", "commercial_vacancy_rate_percent", "commercial_vacancy_rate_pct",
    ]),
    new_construction_permits: pick(r, [
      "new_construction_permits", "new_housing_units_built",
      "new_constructions", "new_constructions_annual", "new_units_built", "units_built",
    ]),
  };
}

/** Normalise a raw audited socioeconomic row to canonical field names. */
function normSocio(r) {
  return {
    ...r,
    median_household_income: pick(r, [
      "median_household_income", "median_household_income_usd", "income_median_household",
    ]),
    poverty_rate: pick(r, [
      "poverty_rate", "poverty_rate_pct", "poverty_rate_percent",
      "poverty_rate_percentage", "pct_poverty",
    ]),
    unemployment_rate: pick(r, [
      "unemployment_rate", "unemployment_rate_pct", "unemployment_rate_percent",
      "unemployment_rate_percentage", "employment_unemployment_rate",
    ]),
  };
}

// ── Build region_id → rows[] indexes ─────────────────────────────────────

function buildIndex(rows, normFn) {
  const idx = new Map();
  for (const raw of rows) {
    const id = raw.region_id;
    if (id == null) continue;
    const row = normFn ? normFn(raw) : raw;
    if (!idx.has(id)) idx.set(id, []);
    idx.get(id).push(row);
  }
  // Sort each region's rows by year
  for (const [, arr] of idx) {
    arr.sort((a, b) => a.year - b.year);
  }
  return idx;
}

/** Map<region_id, auditedDemographicRow[]>  (normalised) */
export const AUDITED_DEMO_BY_ID = buildIndex(AUDITED_DEMO, normDemo);

/** Map<region_id, auditedPropertyRow[]>  (normalised) */
export const AUDITED_PROP_BY_ID = buildIndex(AUDITED_PROP, normProp);

/** Map<region_id, auditedSocioeconomicRow[]>  (normalised) */
export const AUDITED_SOCIO_BY_ID = buildIndex(AUDITED_SOCIO, normSocio);

// ── Normalized flat arrays (one pass, reused by downstream modules) ──────

/** Flat array of all normalized demographic rows */
export const NORMALIZED_DEMO = Array.from(AUDITED_DEMO_BY_ID.values()).flat();

/** Flat array of all normalized property rows */
export const NORMALIZED_PROP = Array.from(AUDITED_PROP_BY_ID.values()).flat();

/** Flat array of all normalized socioeconomic rows */
export const NORMALIZED_SOCIO = Array.from(AUDITED_SOCIO_BY_ID.values()).flat();

// ── (region_id, year) → row lookup maps (for fast cross-dataset joins) ───

function buildRegionYearIndex(byIdMap) {
  const m = new Map();
  for (const [id, rows] of byIdMap) {
    for (const r of rows) {
      if (r.year != null) m.set(`${id}_${r.year}`, r);
    }
  }
  return m;
}

/** Map<"regionId_year", normalizedDemoRow> */
export const DEMO_BY_RY = buildRegionYearIndex(AUDITED_DEMO_BY_ID);

/** Map<"regionId_year", normalizedPropRow> */
export const PROP_BY_RY = buildRegionYearIndex(AUDITED_PROP_BY_ID);

/** Map<"regionId_year", normalizedSocioRow> */
export const SOCIO_BY_RY = buildRegionYearIndex(AUDITED_SOCIO_BY_ID);

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Find the row closest to `targetYear` from a sorted array of rows.
 */
export function closestRow(rows, targetYear) {
  if (!rows || !rows.length) return null;
  return rows.reduce((best, r) =>
    Math.abs(r.year - targetYear) < Math.abs(best.year - targetYear) ? r : best,
    rows[0]
  );
}

/**
 * Find the row closest to `targetYear` but strictly before it (for comparison).
 * Falls back to ~5 years prior for a meaningful delta.
 */
export function priorRow(rows, targetYear, gapYears = 5) {
  if (!rows || !rows.length) return null;
  const prior = rows.filter((r) => r.year < targetYear);
  if (!prior.length) return null;
  const target = targetYear - gapYears;
  return prior.reduce((best, r) =>
    Math.abs(r.year - target) < Math.abs(best.year - target) ? r : best,
    prior[0]
  );
}

/**
 * Transform audited demographic rows for a region into the chart format
 * expected by RegionDetailPanel's AreaChart.
 *
 * The chart expects keys: year, White, Black, Hispanic, Asian, Other
 * as 0–1 fractions of total population, plus raw counts.
 *
 * Uses the pre-normalized AUDITED_DEMO_BY_ID data — the same source
 * as interim_demographics.js — so the pct→fraction math is done once.
 */
export function toDemoChartData(regionId) {
  const rows = AUDITED_DEMO_BY_ID.get(regionId);
  if (!rows || !rows.length) return [];

  return rows.map((d) => {
    const pW = d.pct_white_non_hispanic ?? 0;
    const pB = d.pct_black_non_hispanic ?? 0;
    const pH = d.pct_hispanic ?? 0;
    const pA = d.pct_asian ?? 0;
    const pO = Math.max(0, 100 - pW - pB - pH - pA);
    const tot = d.total_population ?? 0;

    return {
      year: d.year,
      White: pW / 100,
      Black: pB / 100,
      Hispanic: pH / 100,
      Asian: pA / 100,
      Other: pO / 100,
      total: tot,
      popWhite: Math.round(tot * pW / 100),
      popBlack: Math.round(tot * pB / 100),
      popHispanic: Math.round(tot * pH / 100),
      median_age: d.median_age,
      pct_foreign_born: d.pct_foreign_born,
      pct_owner_occupied: d.pct_owner_occupied,
      rent_burden_pct: d.rent_burden_pct,
      pct_65_and_over: d.pct_65_and_over,
      pct_bachelors: d.pct_bachelors_degree_or_higher,
      audit_confidence: d.audit_confidence,
    };
  });
}
