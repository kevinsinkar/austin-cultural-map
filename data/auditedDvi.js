/**
 * auditedDvi.js
 * ─────────────
 * Computes a Displacement Vulnerability Index (DVI) per region_id and year
 * from the three audited datasets (demographics, property, socioeconomic).
 *
 * The DVI combines three sub-indices (default weights, all adjustable at
 * runtime through the DVI Weights panel):
 *   1. Demographic Vulnerability (35%) — rent burden, renter share, foreign-born %
 *   2. Market Pressure (35%)          — home-value appreciation, rent-to-income ratio
 *   3. Socioeconomic Stress (30%)     — poverty, unemployment, eviction filings
 *
 * Output format matches what the rest of the app expects from DVI_LOOKUP:
 *   { [region_id]: [ { year, dvi }, ... ] }   (sorted by year)
 *
 * Uses pre-normalized data from auditedData.js so the raw JSONs are
 * imported and normalized exactly once across the entire app.
 *
 * The whole pipeline is wrapped in computeDviLookup(weights) so the UI can
 * rerun it with custom weights (sub-index balance, per-field weights, and
 * the confidence-boost / vulnerability-gate rules) in real time.
 * AUDITED_DVI_LOOKUP is a live object: recomputeDvi(weights) replaces its
 * contents in place, so every consumer that reads it at render time sees
 * the new scores on the next render.
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

/**
 * Default DVI weights — the published methodology. Values are relative
 * (each group is normalized over the fields present for a region-year, so
 * only the ratios matter); they are kept on a 0–100 scale for the sliders.
 */
export const DEFAULT_DVI_WEIGHTS = {
  sub: { demographic: 35, market: 35, socio: 30 },
  demographic: { rentBurden: 50, renterShare: 30, foreignBorn: 20 },
  market: { appreciation: 50, rentIncome: 50 },
  socio: { poverty: 40, unemployment: 30, eviction: 30 },
  options: { lowConfidenceBoost: true, vulnerabilityGate: true },
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Safely retrieve a numeric value, defaulting to `fb` when missing. */
function num(v, fb = 0) {
  return v != null && isFinite(v) ? v : fb;
}

/** A numeric value, or null when missing/non-finite (no zero-filling). */
function val(v) {
  return v != null && isFinite(v) ? v : null;
}

/** Clamp a value between 0 and cap. */
function clamp(v, cap = 100) {
  return Math.max(0, Math.min(v, cap));
}

/**
 * Combine weighted components, re-normalizing weights over the components
 * that are actually present. Missing components are EXCLUDED, not scored
 * as zero — zero-filling systematically depressed early-year scores (2010
 * has no appreciation/unemployment/eviction data at all) and inflated the
 * apparent 2010→2023 DVI rise to 98% of regions.
 * Returns { score, present, total }; score is null when nothing is present.
 */
function subIndex(parts) {
  const present = parts.filter(([v, w]) => v != null && w > 0);
  if (present.length === 0) return { score: null, present: 0, total: parts.length };
  const tw = present.reduce((a, [, w]) => a + w, 0);
  if (tw <= 0) return { score: null, present: 0, total: parts.length };
  return {
    score: present.reduce((a, [v, w]) => a + v * (w / tw), 0),
    present: present.length,
    total: parts.length,
  };
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
function demScore(d, w) {
  if (!d) return { score: null, present: 0, total: 3 };
  const rentBurden = val(d.rent_burden_pct) != null
    ? clamp(d.rent_burden_pct / 55 * 100) : null;
  const renterShare = val(d.pct_owner_occupied) != null
    ? clamp((100 - d.pct_owner_occupied) / 75 * 100) : null;
  const foreignBorn = val(d.pct_foreign_born) != null
    ? clamp(d.pct_foreign_born / 40 * 100) : null;
  return subIndex([
    [rentBurden, w.demographic.rentBurden],
    [renterShare, w.demographic.renterShare],
    [foreignBorn, w.demographic.foreignBorn],
  ]);
}

/**
 * Market Pressure sub-index (0–100).
 * Higher = stronger displacement-driving market forces.
 * Fields are already normalized by auditedData.js.
 */
function propScore(p, s, w) {
  if (!p) return { score: null, present: 0, total: 2 };
  const appreciation = val(p.pct_home_value_change_yoy) != null
    ? clamp(p.pct_home_value_change_yoy / 15 * 100) : null;
  const rent = val(p.median_rent_monthly);
  const income = s ? num(s.median_household_income, 30000) : 30000;
  const rentIncomeRatio = rent != null
    ? clamp((rent * 12 / Math.max(income, 1)) / 0.50 * 100) : null;
  return subIndex([
    [appreciation, w.market.appreciation],
    [rentIncomeRatio, w.market.rentIncome],
  ]);
}

/**
 * Socioeconomic Stress sub-index (0–100).
 * Higher = greater stress on residents.
 * Fields are already normalized by auditedData.js.
 */
function socioScore(s, w) {
  if (!s) return { score: null, present: 0, total: 3 };
  const poverty = val(s.poverty_rate) != null
    ? clamp(s.poverty_rate / 30 * 100) : null;
  const unemp = val(s.unemployment_rate) != null
    ? clamp(s.unemployment_rate / 15 * 100) : null;
  const eviction = val(s.eviction_filing_rate) != null
    ? clamp(s.eviction_filing_rate / 10 * 100) : null;
  return subIndex([
    [poverty, w.socio.poverty],
    [unemp, w.socio.unemployment],
    [eviction, w.socio.eviction],
  ]);
}

// ── DVI lookup builder ───────────────────────────────────────────────────

/**
 * Build the full { region_id → [{year, dvi, isExcluded, coverage}] } lookup
 * for a given weights object (DEFAULT_DVI_WEIGHTS shape). Pure function —
 * ~269 regions × ≤14 years, cheap enough to run on every slider change.
 */
/**
 * Minimum number of the 8 underlying input fields that must be present
 * for a (region, year) to get a DVI point at all. Below this, re-weighting
 * degenerates into echoing a single field — the 2000 rows carry ONLY
 * owner-occupancy, so every low-ownership tract scored a spurious 100.
 * Matches the ≥3-shared-fields honesty threshold in comparableDviPair.
 */
const MIN_FIELDS_FOR_DVI = 3;

export function computeDviLookup(weights = DEFAULT_DVI_WEIGHTS) {
  const w = weights;
  const lookup = {};

  for (const [regionId, years] of regionYears) {
    const pts = [];
    for (const yr of years) {
      const key = `${regionId}_${yr}`;
      const d = DEMO_BY_RY.get(key);
      const p = PROP_BY_RY.get(key);
      const s = SOCIO_BY_RY.get(key);

      const Vr = demScore(d, w);
      const Pr = propScore(p, s, w);
      const Sr = socioScore(s, w);
      const V = Vr.score;
      const P = Pr.score;
      const S = Sr.score;

      // Too little data for an honest index → no point for this year.
      // Interpolation then skips it and the confidence system reports
      // "showing the nearest data point" instead of a fabricated score.
      if (Vr.present + Pr.present + Sr.present < MIN_FIELDS_FOR_DVI) {
        continue;
      }

      // Fraction of the 8 underlying input fields present for this
      // (region, year). Consumers use it to judge whether two years'
      // DVI values are comparable (e.g., Trajectory velocity).
      const coverage = +(
        (Vr.present + Pr.present + Sr.present) /
        (Vr.total + Pr.total + Sr.total)
      ).toFixed(2);

      // Data Confidence Score: average audit_confidence across available sources.
      // audit_confidence can be a string ("high"/"medium"/"low"), an object of
      // per-field strings, or a number. Normalize to 0–1.
      function confToNum(c) {
        if (typeof c === "number") return c;
        if (typeof c === "string") return c === "high" ? 1 : c === "medium" ? 0.5 : 0.25;
        if (typeof c === "object" && c !== null) {
          const vals = Object.values(c).map(v => v === "high" ? 1 : v === "medium" ? 0.5 : 0.25);
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5;
        }
        return 0.5;
      }
      const confParts = [d?.audit_confidence, p?.audit_confidence, s?.audit_confidence]
        .filter(c => c != null)
        .map(confToNum);
      const confidence = confParts.length > 0
        ? confParts.reduce((a, b) => a + b, 0) / confParts.length
        : 0.5;

      // Re-weight across available sub-indices when data is missing,
      // instead of treating absent sub-indices as zero.
      const parts = [];
      if (V != null) parts.push({ score: V, weight: w.sub.demographic / 100 });
      if (P != null) parts.push({ score: P, weight: w.sub.market / 100 });
      if (S != null) parts.push({ score: S, weight: w.sub.socio / 100 });

      // Low-confidence boost: shift +0.10 weight toward Socioeconomic Stress
      // when audit confidence is below 50%, as S better captures displacement
      // signals from "data ghosts" (neighborhoods with high demographic
      // vulnerability but sparse business/property records).
      if (w.options.lowConfidenceBoost && confidence < 0.5 && S != null) {
        const sPart = parts.find((pt) => pt.score === S);
        if (sPart) sPart.weight += 0.10;
      }

      let dvi = 0;
      if (parts.length > 0) {
        const totalW = parts.reduce((sum, pt) => sum + pt.weight, 0);
        dvi = totalW > 0
          ? parts.reduce((sum, pt) => sum + (pt.weight / totalW) * pt.score, 0)
          : 0;
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
      const isExcluded = !!(w.options.vulnerabilityGate && isAffluent && isHighOwnership);

      if (isExcluded) {
        dvi = Math.min(dvi, 20);
      }

      dvi = +dvi.toFixed(1);
      pts.push({ year: yr, dvi, isExcluded, coverage });
    }
    // Sort by year for correct interpolation
    pts.sort((a, b) => a.year - b.year);
    lookup[regionId] = pts;
  }
  return lookup;
}

// ── Live lookup ──────────────────────────────────────────────────────────
// Exported as a mutable object so every existing consumer keeps working.
// recomputeDvi(weights) swaps the contents in place; callers then bump a
// React state version to trigger re-renders.

export const AUDITED_DVI_LOOKUP = computeDviLookup(DEFAULT_DVI_WEIGHTS);

export function recomputeDvi(weights = DEFAULT_DVI_WEIGHTS) {
  const next = computeDviLookup(weights);
  for (const k of Object.keys(AUDITED_DVI_LOOKUP)) delete AUDITED_DVI_LOOKUP[k];
  Object.assign(AUDITED_DVI_LOOKUP, next);
}
