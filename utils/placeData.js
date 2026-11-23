// ── Everything a place's summary panel and story card show ──
//
// Pure data, no React. A "place" is { kind: "tract" | "neighborhood", id }.
// Both kinds go through the same two builders, so a census tract and a
// neighborhood get the same panel and the same story card.
//
// Neighborhood figures are population-weighted combinations of their tracts.
// A year is only reported for a neighborhood when every one of its tracts
// that carries the measure has a value that year, so a trend never reflects
// a different set of tracts at each end.

import { LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL, REGION_INDEX, TIPPING_POINTS } from "../data";
import {
  toDemoChartData,
  AUDITED_SOCIO_BY_ID,
  AUDITED_PROP_BY_ID,
  AUDITED_DEMO_BY_ID,
  closestRow,
} from "../data/auditedData";
import { getMergedIds } from "../data/regionLookup";
import { LATEST_YEAR } from "../data/constants";
import { calcDirectDisplacement, calcGroupDisplacement, computeTippingStats } from "./math";
import { stageFor, stageSeriesFor, cityRiskFor } from "./stages";
import { aggregateNeighborhood } from "./aggregation";
import { tractPlace, neighborhoodPlace } from "./places";

const NEAR_DEG = 0.012; // about 1.3 km — the radius used for "nearby" PA items
// Listings with no place of their own ("Citywide", "N/A") are pinned to a
// generic downtown point in the source data. They are not near anything.
const HAS_PLACE = (item) => !/^\s*(citywide|n\/a)/i.test(item.address || "");
/** Preservation Austin listings that name a place (an address or an area). */
export const PA_PLACED = PA_ALL.filter((i) => i.lat && i.lng && HAS_PLACE(i));

export const fmtMoney = (v) => (v >= 10000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v).toLocaleString()}`);
export const fmtPct = (v) => `${v.toFixed(1)}%`;

/** Resolve a place reference to its display identity, or null. */
export function resolvePlace(ref) {
  if (!ref || ref.id == null) return null;
  return ref.kind === "neighborhood" ? neighborhoodPlace(ref.id) : tractPlace(ref.id);
}

/** The census tracts behind a place (a tract is a group of one). */
function tractIdsOf(place) {
  return place.kind === "neighborhood" ? place.tractIds : [place.id];
}

/** Tract ids including merged secondaries, for joining businesses. */
function idsWithMerges(ids) {
  return [...new Set(ids.flatMap((id) => getMergedIds(id)))];
}

const tractPop = (id, year) => closestRow(AUDITED_DEMO_BY_ID.get(id), year)?.total_population ?? 0;

// ── Time series ──

const SOURCES = {
  socio: AUDITED_SOCIO_BY_ID,
  prop: AUDITED_PROP_BY_ID,
  demo: AUDITED_DEMO_BY_ID,
};

/** [{year, value}] for one tract and field, measured years only. */
function tractSeries(id, source, field) {
  return (SOURCES[source].get(id) || [])
    .filter((r) => r[field] != null && isFinite(r[field]))
    .map((r) => ({ year: r.year, value: r[field] }));
}

/** Population-weighted series across tracts; years need full coverage. */
function groupSeries(ids, source, field) {
  if (ids.length === 1) return tractSeries(ids[0], source, field);
  const perTract = ids
    .map((id) => ({ id, byYear: new Map(tractSeries(id, source, field).map((p) => [p.year, p.value])) }))
    .filter((t) => t.byYear.size > 0);
  if (!perTract.length) return [];
  const years = [...perTract[0].byYear.keys()].filter((y) => perTract.every((t) => t.byYear.has(y)));
  return years.sort((a, b) => a - b).map((year) => {
    let sum = 0, pop = 0;
    for (const t of perTract) {
      const w = tractPop(t.id, year) || 1;
      sum += t.byYear.get(year) * w;
      pop += w;
    }
    return { year, value: sum / pop };
  });
}

const ECON_DEFS = [
  { label: "Median household income", source: "socio", field: "median_household_income", fmt: fmtMoney, deltaKind: "pct" },
  { label: "Median home value", source: "prop", field: "median_home_value", fmt: fmtMoney, deltaKind: "pct" },
  { label: "Median rent per month", source: "prop", field: "median_rent_monthly", fmt: (v) => `$${Math.round(v).toLocaleString()}`, deltaKind: "pct" },
  { label: "Renters paying half or more of income on rent", source: "demo", field: "rent_burden_pct", fmt: fmtPct, deltaKind: "pts" },
  { label: "Poverty rate", source: "socio", field: "poverty_rate", fmt: fmtPct, deltaKind: "pts" },
  { label: "Unemployment", source: "socio", field: "unemployment_rate", fmt: fmtPct, deltaKind: "pts" },
  { label: "Eviction filing rate", source: "socio", field: "eviction_filing_rate", fmt: fmtPct, deltaKind: "pts" },
  { label: "SNAP participation", source: "socio", field: "snap_participation_rate", fmt: fmtPct, deltaKind: "pts" },
];

/** Latest value per measure, with change since its earliest measured year. */
function econStatsFor(ids) {
  return ECON_DEFS.map((d) => {
    const series = groupSeries(ids, d.source, d.field);
    if (!series.length) return null;
    const from = series[0];
    const to = series[series.length - 1];
    let delta = null;
    if (from.year !== to.year) {
      if (d.deltaKind === "pct") {
        if (from.value > 0) {
          const pct = ((to.value - from.value) / from.value) * 100;
          delta = `${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% since ${from.year}`;
        }
      } else {
        const pts = to.value - from.value;
        delta = `${pts >= 0 ? "up" : "down"} ${Math.abs(pts).toFixed(1)} points since ${from.year}`;
      }
    }
    return { label: d.label, value: d.fmt(to.value), year: to.year, delta, series, fmtFn: d.fmt };
  }).filter(Boolean);
}

/**
 * Preservation Austin listings within about 1.3 km of the center of any of
 * the given tracts, newest first. Citywide listings are never "nearby".
 */
export function paNearTracts(ids) {
  const centers = ids.map((id) => REGION_INDEX.find((r) => r.region_id === id)).filter(Boolean);
  return PA_PLACED
    .filter((i) => centers.some((c) => Math.hypot(i.lat - c.lat, i.lng - c.lng) < NEAR_DEG))
    .sort((a, b) => b.year - a.year);
}

/** Tracked legacy businesses in the given tracts: { open, closed }. */
export function businessesIn(ids) {
  const all = idsWithMerges(ids);
  return {
    open: LEGACY_OPERATING.filter((b) => all.includes(b.region_id)),
    closed: LEGACY_CLOSED.filter((b) => all.includes(b.region_id)),
  };
}

const tippingPointFor = (ids) =>
  TIPPING_POINTS.find((t) => t.region_ids?.some((id) => ids.includes(id))) || null;

// ── Builders ──

/**
 * The compact right-hand summary for a place at the slider year.
 * Returns null for an unknown place.
 */
export function buildPlaceSummary(ref, year) {
  const place = resolvePlace(ref);
  if (!place) return null;
  const ids = tractIdsOf(place);
  const single = ids.length === 1;

  let income = null, homeValue = null;
  if (single) {
    const s = closestRow(AUDITED_SOCIO_BY_ID.get(ids[0]), year);
    const p = closestRow(AUDITED_PROP_BY_ID.get(ids[0]), year);
    if (s?.median_household_income != null) income = { value: s.median_household_income, year: s.year };
    if (p?.median_home_value != null) homeValue = { value: p.median_home_value, year: p.year };
  } else {
    const agg = aggregateNeighborhood(place.id, year);
    if (agg?.socioNow?.median_household_income != null) {
      income = { value: agg.socioNow.median_household_income, year: agg.socioNow.year };
    }
    if (agg?.propertyNow?.median_home_value != null) {
      homeValue = { value: agg.propertyNow.median_home_value, year: agg.propertyNow.year };
    }
  }

  const { open, closed } = businessesIn(ids);
  return {
    place,
    tractCount: ids.length,
    // Displacement stage at the slider year (null before 2000), and what the
    // City's own 2022 map says about the same tracts.
    stage: stageFor(ref, year),
    cityRisk: cityRiskFor(ref),
    change: single ? calcDirectDisplacement(ids[0]) : calcGroupDisplacement(ids),
    income,
    homeValue,
    openCount: open.length,
    closedCount: closed.length,
    paNearCount: paNearTracts(ids).length,
    tippingPoint: tippingPointFor(ids),
  };
}

/** The full story card for a place. Returns null for an unknown place. */
export function buildStoryCard(ref) {
  const place = resolvePlace(ref);
  if (!place) return null;
  const ids = tractIdsOf(place);
  const single = ids.length === 1;

  const { open, closed } = businessesIn(ids);
  const tp = tippingPointFor(ids);

  // Charts use only years that actually carry data — no padded nulls.
  const demoData = single
    ? toDemoChartData(ids[0]).filter((r) => r.White != null)
    : (aggregateNeighborhood(place.id, LATEST_YEAR)?.demoChartData || []);

  return {
    place,
    tractCount: ids.length,
    stage: stageFor(ref, LATEST_YEAR),
    stageSeries: stageSeriesFor(ref),
    cityRisk: cityRiskFor(ref),
    change: single ? calcDirectDisplacement(ids[0]) : calcGroupDisplacement(ids),
    open,
    closed,
    paNear: paNearTracts(ids),
    tp,
    tpStats: tp ? computeTippingStats(tp) : null,
    demoData,
    econStats: econStatsFor(ids),
  };
}

/** One plain sentence for the measured change, or null. */
export function changeSentence(change) {
  if (!change) return null;
  const dir = change.bhDelta < 0 ? "down" : "up";
  const pts = Math.abs(change.bhDelta).toFixed(0);
  let s = `Black and Hispanic residents were ${change.bhFrom.toFixed(0)}% of the population here in ${change.fromYear} ` +
    `and ${change.bhTo.toFixed(0)}% in ${change.toYear}`;
  s += Math.abs(change.bhDelta) < 0.5 ? " (little change)." : ` (${dir} ${pts} percentage points).`;
  if (change.renterDelta != null) {
    s += ` Renters went from ${change.renterFrom.toFixed(0)}% to ${change.renterTo.toFixed(0)}% of households.`;
  }
  return s;
}
