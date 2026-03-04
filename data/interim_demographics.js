import { NORMALIZED_DEMO } from "./auditedData";

/**
 * Enrich normalized demographics with derived fields expected by the UI:
 * pctBlack, pctHispanic, pctWhite, pctAsian, pctOther (0–1 fractions),
 * popBlack, popHispanic, popWhite (absolute counts).
 *
 * Uses pre-normalized data from auditedData.js (single import
 * of the raw JSON, single normalization pass).
 */
export const DEMOGRAPHICS = NORMALIZED_DEMO.map((r) => {
  const pW = r.pct_white_non_hispanic ?? 0;
  const pB = r.pct_black_non_hispanic ?? 0;
  const pH = r.pct_hispanic ?? 0;
  const pA = r.pct_asian ?? 0;
  const pO = Math.max(0, 100 - pW - pB - pH - pA);
  const tot = r.total_population ?? 0;
  return {
    ...r,
    // 0–1 fractions for chart/comparison use
    pctWhite: pW / 100,
    pctBlack: pB / 100,
    pctHispanic: pH / 100,
    pctAsian: pA / 100,
    pctOther: pO / 100,
    // Absolute counts
    total: tot,
    popWhite: Math.round(tot * pW / 100),
    popBlack: Math.round(tot * pB / 100),
    popHispanic: Math.round(tot * pH / 100),
  };
});
