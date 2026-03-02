/**
 * auditedData.js
 * ──────────────
 * Loads the audited output datasets (demographics, property, socioeconomic)
 * and pre-indexes them by region_id for fast lookups when a region is selected.
 *
 * These datasets are the authoritative source for the right-panel detail view
 * and react to the year slider.
 */

import AUDITED_DEMO from "./audit_output/audited_demographics.json";
import AUDITED_PROP from "./audit_output/audited_property.json";
import AUDITED_SOCIO from "./audit_output/audited_socioeconomic.json";

// ── Build region_id → rows[] indexes ─────────────────────────────────────

function buildIndex(rows) {
  const idx = new Map();
  for (const row of rows) {
    const id = row.region_id;
    if (id == null) continue;
    if (!idx.has(id)) idx.set(id, []);
    idx.get(id).push(row);
  }
  // Sort each region's rows by year
  for (const [, arr] of idx) {
    arr.sort((a, b) => a.year - b.year);
  }
  return idx;
}

/** Map<region_id, auditedDemographicRow[]> */
export const AUDITED_DEMO_BY_ID = buildIndex(AUDITED_DEMO);

/** Map<region_id, auditedPropertyRow[]> */
export const AUDITED_PROP_BY_ID = buildIndex(AUDITED_PROP);

/** Map<region_id, auditedSocioeconomicRow[]> */
export const AUDITED_SOCIO_BY_ID = buildIndex(AUDITED_SOCIO);

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
      // extra audited fields available for future use
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
