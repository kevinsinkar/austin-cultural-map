/**
 * aggregation.js
 * ──────────────
 * Aggregate tract-level data for neighborhoods.
 *
 * METHOD: Centroid-assignment — each tract belongs to exactly one
 * neighborhood. No double-counting. Population-weighted averages
 * for rates and percentages. Sums for absolute counts.
 */

import _ from "lodash";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import {
  DEMO_BY_RY,
  PROP_BY_RY,
  SOCIO_BY_RY,
  AUDITED_DEMO_BY_ID,
} from "../data/auditedData";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi";
import { REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL } from "../data";
import { interpolateDvi } from "./math";

/**
 * Aggregate tract-level data for a neighborhood at a given year.
 */
export function aggregateNeighborhood(neighborhoodId, year) {
  const hood = NEIGHBORHOOD_BY_ID.get(neighborhoodId);
  if (!hood) return null;
  const { tract_ids } = hood;

  // ── Demographics (population-weighted averages) ──
  const demoRows = tract_ids
    .map(id => DEMO_BY_RY.get(`${id}_${year}`))
    .filter(Boolean);

  if (demoRows.length === 0) return null;

  const totalPop = _.sumBy(demoRows, "total_population");

  function popWeightedAvg(field) {
    if (totalPop === 0) return 0;
    return (
      _.sumBy(demoRows, r => (r[field] || 0) * (r.total_population || 0)) /
      totalPop
    );
  }

  const demographics = {
    total_population: totalPop,
    pct_hispanic: popWeightedAvg("pct_hispanic"),
    pct_white: popWeightedAvg("pct_white_non_hispanic"),
    pct_black: popWeightedAvg("pct_black_non_hispanic"),
    pct_asian: popWeightedAvg("pct_asian"),
    pct_owner_occupied: popWeightedAvg("pct_owner_occupied"),
    median_age: popWeightedAvg("median_age"),
  };

  // ── DVI (population-weighted average) ──
  const dviEntries = tract_ids
    .map(id => {
      const dvi = interpolateDvi(id, year);
      const pop =
        DEMO_BY_RY.get(`${id}_${year}`)?.total_population || 0;
      return { dvi, pop };
    })
    .filter(e => e.dvi != null);

  const totalDviPop = _.sumBy(dviEntries, "pop");
  const aggDvi =
    totalDviPop > 0
      ? _.sumBy(dviEntries, e => e.dvi * e.pop) / totalDviPop
      : 0;

  // ── Property (population-weighted averages) ──
  const propRows = tract_ids
    .map(id => PROP_BY_RY.get(`${id}_${year}`))
    .filter(Boolean);

  const property =
    propRows.length > 0
      ? {
          median_home_value: popWeightedAvgFrom(
            propRows,
            demoRows,
            "median_home_value"
          ),
          median_rent: popWeightedAvgFrom(
            propRows,
            demoRows,
            "median_rent_monthly"
          ),
        }
      : null;

  // ── Socioeconomic (population-weighted averages) ──
  const socioRows = tract_ids
    .map(id => SOCIO_BY_RY.get(`${id}_${year}`))
    .filter(Boolean);

  const socioeconomic =
    socioRows.length > 0
      ? {
          median_household_income: popWeightedAvgFrom(
            socioRows,
            demoRows,
            "median_household_income"
          ),
          poverty_rate: popWeightedAvgFrom(
            socioRows,
            demoRows,
            "poverty_rate"
          ),
        }
      : null;

  // ── Businesses (union — no double counting since tracts are exclusive) ──
  const bizOpen = LEGACY_OPERATING.filter(b =>
    tract_ids.includes(b.region_id)
  );
  const bizClosed = LEGACY_CLOSED.filter(b =>
    tract_ids.includes(b.region_id)
  );

  // ── Preservation Austin items (matched to constituent tracts) ──
  const paItems = PA_ALL.filter(p =>
    tract_ids.some(tid => {
      const tract = REGION_INDEX.find(r => r.region_id === tid);
      if (!tract) return false;
      const dlat = p.lat - tract.lat;
      const dlng = p.lng - tract.lng;
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
    })
  );

  // ── Demographic chart data (combined across tracts) ──
  const chartYears = [1990, 2000, 2010, 2020, 2023];
  const demoChartData = chartYears
    .map(yr => {
      const rows = tract_ids
        .map(id => DEMO_BY_RY.get(`${id}_${yr}`))
        .filter(Boolean);
      const pop = _.sumBy(rows, "total_population");
      if (pop === 0) return null;

      const pW =
        _.sumBy(
          rows,
          r => (r.pct_white_non_hispanic || 0) * r.total_population
        ) / pop;
      const pB =
        _.sumBy(
          rows,
          r => (r.pct_black_non_hispanic || 0) * r.total_population
        ) / pop;
      const pH =
        _.sumBy(rows, r => (r.pct_hispanic || 0) * r.total_population) / pop;
      const pA =
        _.sumBy(rows, r => (r.pct_asian || 0) * r.total_population) / pop;
      const pO = Math.max(0, 100 - pW - pB - pH - pA);

      return {
        year: yr,
        White: pW / 100,
        Black: pB / 100,
        Hispanic: pH / 100,
        Asian: pA / 100,
        Other: pO / 100,
        total: pop,
        popWhite: Math.round((pop * pW) / 100),
        popBlack: Math.round((pop * pB) / 100),
        popHispanic: Math.round((pop * pH) / 100),
      };
    })
    .filter(Boolean);

  return {
    id: hood.id,
    name: hood.name,
    tractCount: tract_ids.length,
    tract_ids,
    totalPopulation: totalPop,
    aggDvi,
    demographics,
    property,
    socioeconomic,
    bizOpen,
    bizClosed,
    paItems,
    demoChartData,
  };
}

/**
 * Population-weighted average where data and population come from
 * different row sets (e.g., property rows weighted by demo populations).
 */
function popWeightedAvgFrom(dataRows, demoRows, field) {
  const popMap = new Map();
  demoRows.forEach(r => {
    if (r.region_id) popMap.set(r.region_id, r.total_population || 0);
  });

  let totalWeight = 0;
  let weightedSum = 0;
  dataRows.forEach(r => {
    const pop = popMap.get(r.region_id) || 0;
    const val = r[field];
    if (val != null && pop > 0) {
      weightedSum += val * pop;
      totalWeight += pop;
    }
  });
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
