/**
 * aggregation.js
 * ──────────────
 * Aggregate tract-level data for neighborhoods.
 *
 * METHOD: Centroid-assignment — each tract belongs to exactly one
 * neighborhood. No double-counting. Population-weighted averages
 * for rates and percentages. Sums for absolute counts.
 *
 * The output shape matches what RegionDetailPanel expects, so the
 * panel can render without knowing whether it's showing a single
 * tract or an aggregated neighborhood.
 */

import _ from "lodash";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import {
  DEMO_BY_RY,
  AUDITED_DEMO_BY_ID,
  AUDITED_PROP_BY_ID,
  AUDITED_SOCIO_BY_ID,
  closestRow,
  priorRow,
} from "../data/auditedData";
import {
  REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL, TIPPING_POINTS,
} from "../data";
import { ID_TO_NAME } from "../data/regionLookup";
import { interpolateDvi } from "./math";

// Chart years matching toDemoChartData() output
const CHART_YEARS = [1990, 2000, 2010, 2020, 2023];

// ── Helpers ──

function getClosestProp(tid, yr) {
  return closestRow(AUDITED_PROP_BY_ID.get(tid), yr);
}

function getClosestSocio(tid, yr) {
  return closestRow(AUDITED_SOCIO_BY_ID.get(tid), yr);
}

function getPriorProp(tid, yr) {
  return priorRow(AUDITED_PROP_BY_ID.get(tid), yr);
}

function getPriorSocio(tid, yr) {
  return priorRow(AUDITED_SOCIO_BY_ID.get(tid), yr);
}

function tractPop(tid, yr) {
  const d = DEMO_BY_RY.get(`${tid}_${yr}`)
    || closestRow(AUDITED_DEMO_BY_ID.get(tid), yr);
  return d?.total_population ?? 0;
}

/**
 * Population-weighted average of a field across tracts for a given year.
 * @param {number[]} tracts - tract IDs
 * @param {number} yr - target year
 * @param {function} getRow - (tid, yr) => row
 * @param {string} field - field name to average
 */
function popWeightedAvg(tracts, yr, getRow, field) {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const tid of tracts) {
    const row = getRow(tid, yr);
    const pop = tractPop(tid, yr);
    const val = row?.[field];
    if (val != null && pop > 0) {
      weightedSum += val * pop;
      totalWeight += pop;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Aggregate all panel data for a neighborhood at a given year.
 * Returns the same data shapes that RegionDetailPanel expects.
 */
export function aggregateNeighborhood(neighborhoodId, year) {
  const hood = NEIGHBORHOOD_BY_ID.get(neighborhoodId);
  if (!hood) return null;
  const { tract_ids } = hood;

  // ═══ DVI ═══

  const dviEntries = tract_ids.map(tid => ({
    dvi: interpolateDvi(tid, year),
    pop: tractPop(tid, year),
  })).filter(e => e.dvi != null);
  const totalDviPop = _.sumBy(dviEntries, "pop");
  const aggDvi = totalDviPop > 0
    ? +(_.sumBy(dviEntries, e => e.dvi * e.pop) / totalDviPop).toFixed(1)
    : 0;

  // ═══ DEMOGRAPHICS TAB — demoChartData ═══

  const demoChartData = CHART_YEARS.map(yr => {
    const rows = tract_ids
      .map(tid => DEMO_BY_RY.get(`${tid}_${yr}`))
      .filter(Boolean);
    if (rows.length === 0) return null;

    const totalPop = _.sumBy(rows, "total_population");
    if (totalPop === 0) return null;

    const wAvg = (field) => {
      const sum = _.sumBy(rows, r => (r[field] ?? 0) * (r.total_population ?? 0));
      return sum / totalPop / 100;
    };

    const White = wAvg("pct_white_non_hispanic");
    const Black = wAvg("pct_black_non_hispanic");
    const Hispanic = wAvg("pct_hispanic");
    const Asian = wAvg("pct_asian");
    const Other = Math.max(0, 1 - White - Black - Hispanic - Asian);

    const rbSum = _.sumBy(rows, r => (r.rent_burden_pct ?? 0) * (r.total_population ?? 0));
    const rent_burden_pct = rbSum / totalPop;

    return {
      year: yr,
      White, Black, Hispanic, Asian, Other,
      total: totalPop,
      popBlack: Math.round(totalPop * Black),
      popHispanic: Math.round(totalPop * Hispanic),
      popWhite: Math.round(totalPop * White),
      rent_burden_pct,
    };
  }).filter(Boolean);

  // ═══ DEMOGRAPHICS TAB — narrativeCallouts ═══

  const narrativeCallouts = [];
  for (let i = 1; i < demoChartData.length; i++) {
    const prev = demoChartData[i - 1];
    const curr = demoChartData[i];

    if (prev.popBlack > 0) {
      const drop = (prev.popBlack - curr.popBlack) / prev.popBlack;
      if (drop > 0.25) {
        narrativeCallouts.push({
          type: "pop_loss",
          text: `${hood.name} lost ${(drop * 100).toFixed(0)}% of its Black population between ${prev.year} and ${curr.year} \u2014 a decline of ${(prev.popBlack - curr.popBlack).toLocaleString()} residents. ${curr.popBlack.toLocaleString()} remained.`,
        });
      }
    }
  }

  for (const [yrA, yrB] of [[2000, 2010], [2010, 2020], [2020, 2023]]) {
    const hvA = popWeightedAvg(tract_ids, yrA, getClosestProp, "median_home_value");
    const hvB = popWeightedAvg(tract_ids, yrB, getClosestProp, "median_home_value");
    if (hvA > 0 && hvB > 0) {
      const inc = (hvB - hvA) / hvA;
      if (inc > 1) {
        narrativeCallouts.push({
          type: "home_value",
          text: `Median home values rose ${(inc * 100).toFixed(0)}%, from $${(hvA / 1000).toFixed(0)}k to $${(hvB / 1000).toFixed(0)}k, between ${yrA} and ${yrB}.`,
        });
      }
    }
  }

  // ═══ ECONOMICS TAB — propertyNow / propertyPrev ═══

  const propRowsNow = tract_ids
    .map(tid => ({ tid, row: getClosestProp(tid, year) }))
    .filter(r => r.row);

  let propertyNow = null;
  if (propRowsNow.length > 0) {
    const yearCounts = _.countBy(propRowsNow, r => r.row.year);
    const aggPropYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];
    propertyNow = {
      year: aggPropYear,
      median_home_value: popWeightedAvg(tract_ids, aggPropYear, getClosestProp, "median_home_value"),
      median_rent_monthly: popWeightedAvg(tract_ids, aggPropYear, getClosestProp, "median_rent_monthly"),
      region_id: null,
    };
  }

  const propRowsPrev = tract_ids
    .map(tid => ({ tid, row: getPriorProp(tid, year) }))
    .filter(r => r.row);

  let propertyPrev = null;
  if (propRowsPrev.length > 0) {
    const yearCounts = _.countBy(propRowsPrev, r => r.row.year);
    const aggPropPrevYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];
    propertyPrev = {
      year: aggPropPrevYear,
      median_home_value: popWeightedAvg(tract_ids, aggPropPrevYear, getClosestProp, "median_home_value"),
      median_rent_monthly: popWeightedAvg(tract_ids, aggPropPrevYear, getClosestProp, "median_rent_monthly"),
      region_id: null,
    };
  }

  // ═══ ECONOMICS TAB — socioNow / socioPrev ═══

  const socioRowsNow = tract_ids
    .map(tid => ({ tid, row: getClosestSocio(tid, year) }))
    .filter(r => r.row);

  let socioNow = null;
  if (socioRowsNow.length > 0) {
    const yearCounts = _.countBy(socioRowsNow, r => r.row.year);
    const aggSocioYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];
    socioNow = {
      year: aggSocioYear,
      median_household_income: popWeightedAvg(tract_ids, aggSocioYear, getClosestSocio, "median_household_income"),
      poverty_rate: popWeightedAvg(tract_ids, aggSocioYear, getClosestSocio, "poverty_rate"),
      region_id: null,
    };
  }

  const socioRowsPrev = tract_ids
    .map(tid => ({ tid, row: getPriorSocio(tid, year) }))
    .filter(r => r.row);

  let socioPrev = null;
  if (socioRowsPrev.length > 0) {
    const yearCounts = _.countBy(socioRowsPrev, r => r.row.year);
    const aggSocioPrevYear = +Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0][0];
    socioPrev = {
      year: aggSocioPrevYear,
      median_household_income: popWeightedAvg(tract_ids, aggSocioPrevYear, getClosestSocio, "median_household_income"),
      poverty_rate: popWeightedAvg(tract_ids, aggSocioPrevYear, getClosestSocio, "poverty_rate"),
      region_id: null,
    };
  }

  // ═══ CULTURE TAB — businesses ═══

  const bizOpen = LEGACY_OPERATING.filter(b => tract_ids.includes(b.region_id));
  const bizClosed = LEGACY_CLOSED.filter(b => tract_ids.includes(b.region_id));

  const totalSurviving = bizOpen.length;
  const totalClosed = bizClosed.length;
  const anchorDensity = (totalSurviving + totalClosed) > 0
    ? totalSurviving / (totalSurviving + totalClosed)
    : null;

  // ═══ CULTURE TAB — PA items ═══

  const paItems = PA_ALL.filter(item =>
    tract_ids.some(tid => {
      const tract = REGION_INDEX.find(r => r.region_id === tid);
      if (!tract) return false;
      const dlat = item.lat - tract.lat;
      const dlng = item.lng - tract.lng;
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
    })
  );

  // ═══ CULTURE TAB — tipping points ═══

  const tippingPoints = tract_ids
    .map(tid => {
      const name = ID_TO_NAME.get(tid);
      return TIPPING_POINTS.find(t => t.region === name);
    })
    .filter(Boolean);

  // ═══ RETURN ═══

  return {
    id: hood.id,
    name: hood.name,
    tract_ids,
    tractCount: tract_ids.length,
    aggDvi,
    demoChartData,
    narrativeCallouts,
    propertyNow,
    propertyPrev,
    socioNow,
    socioPrev,
    bizOpen,
    bizClosed,
    anchorDensity,
    paItems,
    tippingPoints,
  };
}
