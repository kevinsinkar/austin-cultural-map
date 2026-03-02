/**
 * auditedDvi.js
 * ─────────────
 * Computes a Displacement Vulnerability Index (DVI) per region_id and year
 * from the three audited datasets (demographics, property, socioeconomic).
 *
 * The DVI combines three sub-indices:
 *   1. Demographic Vulnerability (35%) — rent burden, renter share, foreign-born %
 *   2. Market Pressure (35%)          — home-value appreciation, rent-to-income ratio
 *   3. Socioeconomic Stress (30%)     — poverty, unemployment, eviction filings
 *
 * Output format matches what the rest of the app expects from DVI_LOOKUP:
 *   { [region_id]: [ { year, dvi }, ... ] }   (sorted by year)
 */

import AUDITED_DEMO from "./audit_output/audited_demographics.json";
import AUDITED_PROP from "./audit_output/audited_property.json";
import AUDITED_SOCIO from "./audit_output/audited_socioeconomic.json";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Safely retrieve a numeric value, defaulting to `fb` when missing. */
function num(v, fb = 0) {
  return v != null && isFinite(v) ? v : fb;
}

/** Clamp a value between 0 and cap. */
function clamp(v, cap = 100) {
  return Math.max(0, Math.min(v, cap));
}

/**
 * Return the first non-null/non-undefined value for any of `keys`.
 */
function pick(obj, keys, fallback = 0) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}

// ── Build per-(region_id, year) indexes ──────────────────────────────────

function indexByRegionYear(rows) {
  const m = new Map();
  for (const r of rows) {
    const id = r.region_id;
    const yr = r.year;
    if (id == null || yr == null) continue;
    m.set(`${id}_${yr}`, r);
  }
  return m;
}

const demoIdx = indexByRegionYear(AUDITED_DEMO);
const propIdx = indexByRegionYear(AUDITED_PROP);
const socioIdx = indexByRegionYear(AUDITED_SOCIO);

// Collect the distinct set of (region_id, year) pairs across all datasets
const regionYears = new Map(); // region_id → Set<year>
for (const r of [...AUDITED_DEMO, ...AUDITED_PROP, ...AUDITED_SOCIO]) {
  if (r.region_id == null || r.year == null) continue;
  if (!regionYears.has(r.region_id)) regionYears.set(r.region_id, new Set());
  regionYears.get(r.region_id).add(r.year);
}

// ── Sub-index scorers ────────────────────────────────────────────────────

/**
 * Demographic Vulnerability sub-index (0–100).
 * Higher = more vulnerable to displacement.
 */
function demScore(d) {
  if (!d) return null;
  const rentBurden = clamp(
    num(pick(d, ["rent_burden_pct"])) / 55 * 100
  );          // 55% is severe
  const renterShare = clamp(
    (100 - num(pick(d, ["pct_owner_occupied", "percent_renters"], 50), 50)) / 75 * 100
  ); // 75% renter = max
  const foreignBorn = clamp(
    num(pick(d, ["pct_foreign_born", "foreign_born_percent", "foreign_born_pct"])) / 40 * 100
  );        // 40% = max
  return 0.50 * rentBurden + 0.30 * renterShare + 0.20 * foreignBorn;
}

/**
 * Market Pressure sub-index (0–100).
 * Higher = stronger displacement-driving market forces.
 */
function propScore(p, s) {
  if (!p) return null;
  // Home-value year-over-year appreciation (5%+ is pressure, 15%+ severe)
  const appreciation = clamp(
    num(pick(p, ["pct_home_value_change_yoy"], 0)) / 15 * 100
  );
  // Rent-to-income ratio: (annual rent / household income)
  const rent = num(pick(p, ["median_rent_monthly", "median_rent", "median_rent_usd",
    "average_rent", "average_rent_monthly", "average_rent_usd", "avg_rent",
    "avg_rent_monthly", "rent_median", "average_rent_per_month",
    "median_rental_rate_monthly", "average_rent_per_month_usd"], 0));
  const income = s ? num(pick(s, ["median_household_income", "median_household_income_usd",
    "income_median_household"], 30000)) : 30000;
  const rentIncomeRatio = clamp((rent * 12 / Math.max(income, 1)) / 0.50 * 100); // 50% rent/income = max
  return 0.50 * appreciation + 0.50 * rentIncomeRatio;
}

/**
 * Socioeconomic Stress sub-index (0–100).
 * Higher = greater stress on residents.
 */
function socioScore(s) {
  if (!s) return null;
  const poverty = clamp(num(pick(s, ["poverty_rate", "poverty_rate_pct",
    "poverty_rate_percent", "pct_poverty", "poverty_rate_percentage"], 0)) / 30 * 100);
  const unemp = clamp(num(pick(s, ["unemployment_rate", "unemployment_rate_pct",
    "unemployment_rate_percent", "employment_unemployment_rate",
    "unemployment_rate_percentage"], 0)) / 15 * 100);
  const eviction = clamp(num(pick(s, ["eviction_filing_rate"], 0)) / 10 * 100);
  return 0.40 * poverty + 0.30 * unemp + 0.30 * eviction;
}

// ── Build AUDITED_DVI_LOOKUP ─────────────────────────────────────────────

export const AUDITED_DVI_LOOKUP = {};

for (const [regionId, years] of regionYears) {
  const pts = [];
  for (const yr of years) {
    const key = `${regionId}_${yr}`;
    const d = demoIdx.get(key);
    const p = propIdx.get(key);
    const s = socioIdx.get(key);

    const V = demScore(d);
    const P = propScore(p, s);
    const S = socioScore(s);

    // Re-weight across available sub-indices when data is missing,
    // instead of treating absent sub-indices as zero.
    const parts = [];
    if (V != null) parts.push({ score: V, weight: 0.35 });
    if (P != null) parts.push({ score: P, weight: 0.35 });
    if (S != null) parts.push({ score: S, weight: 0.30 });

    let dvi = 0;
    if (parts.length > 0) {
      const totalW = parts.reduce((s, p) => s + p.weight, 0);
      dvi = parts.reduce((s, p) => s + (p.weight / totalW) * p.score, 0);
    }
    dvi = +dvi.toFixed(1);
    pts.push({ year: yr, dvi });
  }
  // Sort by year for correct interpolation
  pts.sort((a, b) => a.year - b.year);
  AUDITED_DVI_LOOKUP[regionId] = pts;
}
