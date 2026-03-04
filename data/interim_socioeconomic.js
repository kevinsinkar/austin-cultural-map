import {
  AUDITED_SOCIO_BY_ID,
  AUDITED_PROP_BY_ID,
  AUDITED_DEMO_BY_ID,
} from "./auditedData";

/**
 * Merge socioeconomic, property, and demographic data into the combined
 * format expected by ComparisonView and interpolateSocio:
 *   incomeAdj, homeValue, pctBachelors, pctCostBurdened, confidence, etc.
 *
 * Uses pre-normalized, pre-indexed Maps from auditedData.js so the
 * raw JSONs are imported and iterated exactly once.
 */

// Collect all (region_id, year) pairs across socio + property
const allKeys = new Set();
for (const [id, rows] of AUDITED_SOCIO_BY_ID) {
  for (const r of rows) allKeys.add(`${id}_${r.year}`);
}
for (const [id, rows] of AUDITED_PROP_BY_ID) {
  for (const r of rows) allKeys.add(`${id}_${r.year}`);
}

// Build local (region_id, year) lookup helpers from the pre-built Maps
function findRow(byIdMap, regionId, year) {
  const rows = byIdMap.get(regionId);
  if (!rows) return null;
  return rows.find((r) => r.year === year) || null;
}

export const SOCIOECONOMIC = Array.from(allKeys).map((key) => {
  const [ridStr, yrStr] = key.split("_");
  const region_id = parseInt(ridStr, 10);
  const year = parseInt(yrStr, 10);

  const s = findRow(AUDITED_SOCIO_BY_ID, region_id, year) || {};
  const p = findRow(AUDITED_PROP_BY_ID, region_id, year) || {};
  const d = findRow(AUDITED_DEMO_BY_ID, region_id, year) || {};

  const income = s.median_household_income ?? 0;
  const homeValue = p.median_home_value ?? 0;
  const bachelorsPct = d.pct_bachelors_degree_or_higher ?? 0;
  const costBurdened = d.rent_burden_pct ?? 0;

  return {
    ...s,
    region_id,
    year,
    region: s.region || p.region || d.region || "",
    incomeAdj: income,
    homeValue,
    pctBachelors: bachelorsPct / 100,
    pctCostBurdened: costBurdened / 100,
    median_household_income: s.median_household_income ?? null,
    poverty_rate: s.poverty_rate ?? null,
    unemployment_rate: s.unemployment_rate ?? null,
    confidence: "Medium",
  };
}).sort((a, b) => a.region_id - b.region_id || a.year - b.year);
