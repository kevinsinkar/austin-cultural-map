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
 *
 * Uses pre-normalized data from auditedData.js so the raw JSONs are
 * imported and normalized exactly once across the entire app.
 */

import {
  AUDITED_DEMO_BY_ID,
  AUDITED_PROP_BY_ID,
  AUDITED_SOCIO_BY_ID,
  DEMO_BY_RY,
  PROP_BY_RY,
  SOCIO_BY_RY,
} from "./auditedData";

// ── Constants ────────────────────────────────────────────────────────────

/** Citywide median household income (Austin ~$86k in 2024 ACS). */
const CITY_MEDIAN_INCOME = 86000;

// ── Helpers ──────────────────────────────────────────────────────────────

/** Safely retrieve a numeric value, defaulting to `fb` when missing. */
function num(v, fb = 0) {
  return v != null && isFinite(v) ? v : fb;
}

/** Clamp a value between 0 and cap. */
function clamp(v, cap = 100) {
  return Math.max(0, Math.min(v, cap));
}

// ── Collect distinct (region_id, year) pairs from the pre-built Maps ─────

const regionYears = new Map(); // region_id → Set<year>
for (const [id, rows] of AUDITED_DEMO_BY_ID) {
  if (!regionYears.has(id)) regionYears.set(id, new Set());
  for (const r of rows) regionYears.get(id).add(r.year);
}
for (const [id, rows] of AUDITED_PROP_BY_ID) {
  if (!regionYears.has(id)) regionYears.set(id, new Set());
  for (const r of rows) regionYears.get(id).add(r.year);
}
for (const [id, rows] of AUDITED_SOCIO_BY_ID) {
  if (!regionYears.has(id)) regionYears.set(id, new Set());
  for (const r of rows) regionYears.get(id).add(r.year);
}

// ── Sub-index scorers ────────────────────────────────────────────────────

/**
 * Demographic Vulnerability sub-index (0–100).
 * Higher = more vulnerable to displacement.
 * Fields are already normalized by auditedData.js.
 */
function demScore(d) {
  if (!d) return null;
  const rentBurden = clamp(num(d.rent_burden_pct) / 55 * 100);
  const renterShare = clamp(
    (100 - num(d.pct_owner_occupied, 50)) / 75 * 100
  );
  const foreignBorn = clamp(num(d.pct_foreign_born) / 40 * 100);
  return 0.50 * rentBurden + 0.30 * renterShare + 0.20 * foreignBorn;
}

/**
 * Market Pressure sub-index (0–100).
 * Higher = stronger displacement-driving market forces.
 * Fields are already normalized by auditedData.js.
 */
function propScore(p, s) {
  if (!p) return null;
  const appreciation = clamp(num(p.pct_home_value_change_yoy) / 15 * 100);
  const rent = num(p.median_rent_monthly);
  const income = s ? num(s.median_household_income, 30000) : 30000;
  const rentIncomeRatio = clamp((rent * 12 / Math.max(income, 1)) / 0.50 * 100);
  return 0.50 * appreciation + 0.50 * rentIncomeRatio;
}

/**
 * Socioeconomic Stress sub-index (0–100).
 * Higher = greater stress on residents.
 * Fields are already normalized by auditedData.js.
 */
function socioScore(s) {
  if (!s) return null;
  const poverty = clamp(num(s.poverty_rate) / 30 * 100);
  const unemp = clamp(num(s.unemployment_rate) / 15 * 100);
  const eviction = clamp(num(s.eviction_filing_rate) / 10 * 100);
  return 0.40 * poverty + 0.30 * unemp + 0.30 * eviction;
}

// ── Build AUDITED_DVI_LOOKUP ─────────────────────────────────────────────

export const AUDITED_DVI_LOOKUP = {};

for (const [regionId, years] of regionYears) {
  const pts = [];
  for (const yr of years) {
    const key = `${regionId}_${yr}`;
    const d = DEMO_BY_RY.get(key);
    const p = PROP_BY_RY.get(key);
    const s = SOCIO_BY_RY.get(key);

    const V = demScore(d);
    const P = propScore(p, s);
    const S = socioScore(s);

    // Data Confidence Score: average audit_confidence across available sources.
    // If confidence is low, boost Socioeconomic Stress weight because it tracks
    // displacement more reliably than property appreciation in "data deserts."
    const confParts = [
      d?.audit_confidence,
      p?.audit_confidence,
      s?.audit_confidence,
    ].filter((c) => c != null);
    const confidence =
      confParts.length > 0
        ? confParts.reduce((a, b) => a + b, 0) / confParts.length
        : 0;

    // Re-weight across available sub-indices when data is missing,
    // instead of treating absent sub-indices as zero.
    const parts = [];
    if (V != null) parts.push({ score: V, weight: 0.35 });
    if (P != null) parts.push({ score: P, weight: 0.35 });
    if (S != null) parts.push({ score: S, weight: 0.30 });

    // Low-confidence boost: shift +0.10 weight toward Socioeconomic Stress
    // when audit confidence is below 50%, as S better captures displacement
    // signals from "data ghosts" (neighborhoods with high demographic
    // vulnerability but sparse business/property records).
    if (confidence < 0.5 && S != null) {
      const sPart = parts.find((pt) => pt.score === S);
      if (sPart) sPart.weight += 0.10;
    }

    let dvi = 0;
    if (parts.length > 0) {
      const totalW = parts.reduce((s, p) => s + p.weight, 0);
      dvi = parts.reduce((s, p) => s + (p.weight / totalW) * p.score, 0);
    }

    // ── Vulnerability Gate ────────────────────────────────────────────
    // If a region is affluent (income > 150% city median) AND has high
    // owner-occupancy (>75%), it is not "vulnerable" to displacement in
    // the same way as low-income renter tracts. Cap the DVI at a
    // "Stable" ceiling (20) and flag it so MapView can use a distinct
    // color ramp.
    const isAffluent =
      s && s.median_household_income > CITY_MEDIAN_INCOME * 1.5;
    const isHighOwnership = d && d.pct_owner_occupied > 75;
    const isExcluded = !!(isAffluent && isHighOwnership);

    if (isExcluded) {
      dvi = Math.min(dvi, 20);
    }

    dvi = +dvi.toFixed(1);
    pts.push({ year: yr, dvi, isExcluded });
  }
  // Sort by year for correct interpolation
  pts.sort((a, b) => a.year - b.year);
  AUDITED_DVI_LOOKUP[regionId] = pts;
}
