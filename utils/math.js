import _ from "lodash";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi.js";
import { AUDITED_SOCIO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID } from "../data/auditedData.js";
import { LEGACY_OPERATING, LEGACY_CLOSED, SOCIOECONOMIC } from "../data";
import { NAME_TO_ID } from "../data/regionLookup";
import { LATEST_YEAR, CENSUS_YEARS } from "../data/constants";

// ── DVI interpolation ──

export function lerp(pts, yr) {
  if (!pts || !pts.length) return 0;
  if (yr <= pts[0].year) return pts[0].dvi;
  if (yr >= pts[pts.length - 1].year) return pts[pts.length - 1].dvi;
  for (let i = 0; i < pts.length - 1; i++) {
    if (yr >= pts[i].year && yr <= pts[i + 1].year) {
      const t = (yr - pts[i].year) / (pts[i + 1].year - pts[i].year);
      return pts[i].dvi + t * (pts[i + 1].dvi - pts[i].dvi);
    }
  }
  return 0;
}

/**
 * Look up the interpolated DVI for a region at a given year.
 * Supports fractional years (e.g. 2023.5) for bi-yearly / 6-month reporting,
 * allowing the UI to surface "Market Shocks" between standard ACS yearly snapshots.
 *
 * @param {number|string} regionId – numeric region_id (preferred) or region_name fallback
 * @param {number} yr – target year; may be fractional (e.g. 2022.5)
 * @returns {number} interpolated DVI rounded to one decimal place
 */
export function interpolateDvi(regionId, yr) {
  const series = AUDITED_DVI_LOOKUP[regionId];
  if (!series || !series.length) return 0;

  // Find the two surrounding data-points for the target year
  const prior = _.findLast(series, (p) => p.year <= yr);
  const next = _.find(series, (p) => p.year > yr);

  if (!next) return prior ? prior.dvi : 0;
  if (!prior) return next.dvi;

  // Linear interpolation (works for both integer and fractional years)
  const t = (yr - prior.year) / (next.year - prior.year);
  return parseFloat((prior.dvi + t * (next.dvi - prior.dvi)).toFixed(1));
}

// ── Pressure score bands (presenter tools only) ──
// The 0–100 score describes present-day conditions: rent burden, renter
// share, poverty, rent against income, home-value appreciation. It follows
// poverty far more closely than measured displacement (checked November
// 2026), so it is NOT what colors the map. The map's displacement stages
// come from utils/stages.js. Here the score is cut into plain quarters, not
// stages: the cut points are the quartiles of scored tracts pooled over
// 2015, 2020 and the 2019-2023 survey under the default weights (set
// November 2026, before the site moved to the 2020-2024 survey; not
// recomputed). A cool one-hue ramp keeps it visually apart from the stage
// colors.
//   fill — swatch  ·  text — darker tone readable on light backgrounds
//   ·  on — number color readable ON the fill.
export const DVI_BINS = [
  { min: 0,    max: 37.4,     band: "Lowest quarter",       short: "Lowest",       stage: "Lowest quarter",       range: "under 37", fill: "#d5dde6", text: "#4a5a6b", on: "#1a1a1a" },
  { min: 37.4, max: 46.2,     band: "Lower-middle quarter", short: "Lower-middle", stage: "Lower-middle quarter", range: "37–46",    fill: "#a9b9c9", text: "#44586c", on: "#1a1a1a" },
  { min: 46.2, max: 56.2,     band: "Upper-middle quarter", short: "Upper-middle", stage: "Upper-middle quarter", range: "46–56",    fill: "#6f8aa3", text: "#3b566f", on: "#1a1a1a" },
  { min: 56.2, max: Infinity, band: "Highest quarter",      short: "Highest",      stage: "Highest quarter",      range: "56+",      fill: "#3b5a78", text: "#2c4a66", on: "#fffffe" },
];

// Affluent tracts whose score is capped (isExcluded): high income and
// mostly owner-occupied.
export const DVI_EXCLUDED = {
  band: "Affluent, score capped",
  range: "DVI capped",
  fill: "#1565C0",
  text: "#1565C0",
  on: "#fffffe",
  stroke: "#455A64",
};

export const DVI_ND_COLOR = "#c4b5a4";      // New Development — no DVI
export const DVI_NO_DATA_COLOR = "#e8e5e0"; // DVI ≤ 0 / missing

export function getDviBin(dvi) {
  return DVI_BINS.find((b) => dvi <= b.max) || DVI_BINS[DVI_BINS.length - 1];
}

export function getDviColor(dvi, nd = false) {
  if (nd) return DVI_ND_COLOR;
  if (dvi <= 0) return DVI_NO_DATA_COLOR;
  return getDviBin(dvi).fill;
}

export function getDviBand(d) {
  return getDviBin(d).band;
}

/** The stage name as the map, panel and story card word it (sentence case). */
export function getDviStage(d) {
  return getDviBin(d).stage;
}

export function getDviBandColor(d) {
  return getDviBin(d).text;
}

/**
 * Data confidence for a region's DVI at a year — the single source for
 * the ConfidenceChip system. Starts High; each independent uncertainty
 * source (interpolated/nearest-year value, pre-2010 boundary crosswalk)
 * downgrades one step. Returns { level, interpolated, reasons }.
 */
export function getDviConfidence(regionId, year) {
  const series = AUDITED_DVI_LOOKUP[regionId];
  if (!series || !series.length) {
    return { level: "Low", interpolated: false, reasons: ["No DVI data exists for this tract."] };
  }
  const reasons = [];
  let steps = 0;
  let interpolated = false;
  if (!series.some((p) => p.year === year)) {
    const prior = _.findLast(series, (p) => p.year < year);
    const next = _.find(series, (p) => p.year > year);
    if (prior && next) {
      interpolated = true;
      reasons.push(`No measurement for ${year} — value linearly interpolated between the ${prior.year} and ${next.year} data points.`);
    } else {
      reasons.push(`No measurement for ${year} — showing the nearest data point (${(prior || next).year}).`);
    }
    steps += 1;
  }
  if (year < 2010) {
    reasons.push("Pre-2010 census boundaries were crosswalked to modern tract geometry — values are approximate.");
    steps += 1;
  }
  return { level: steps === 0 ? "High" : steps === 1 ? "Medium" : "Low", interpolated, reasons };
}

/**
 * Whether a region is flagged Affluent/Excluded (DVI capped) at the data
 * point closest to the given year. Used to render these tracts as a
 * distinct category instead of on the displacement ramp.
 */
export function isRegionExcluded(regionId, year) {
  const series = AUDITED_DVI_LOOKUP[regionId];
  if (!series || !series.length) return false;
  const pt = series.reduce(
    (best, p) => (Math.abs(p.year - year) < Math.abs(best.year - year) ? p : best),
    series[0]
  );
  return !!pt?.isExcluded;
}

export function getDviTimeSeries(regionId) {
  return [1990, 1995, ...CENSUS_YEARS].map((yr) => ({
    year: yr,
    dvi: interpolateDvi(regionId, yr),
  }));
}

// ── Socioeconomic interpolation (O(1) Map lookup per region) ──

/**
 * Build a SOCIOECONOMIC-like row from the pre-indexed Maps for a given
 * region_id and year. Joins socio + property + demo on the fly.
 */
function buildSocioRow(rid, yr) {
  const socioRows = AUDITED_SOCIO_BY_ID.get(rid);
  const propRows = AUDITED_PROP_BY_ID.get(rid);
  const demoRows = AUDITED_DEMO_BY_ID.get(rid);
  const s = socioRows?.find((r) => r.year === yr) || {};
  const p = propRows?.find((r) => r.year === yr) || {};
  const d = demoRows?.find((r) => r.year === yr) || {};
  return {
    region_id: rid,
    year: yr,
    region: s.region || p.region || d.region || "",
    incomeAdj: s.median_household_income ?? 0,
    homeValue: p.median_home_value ?? 0,
    pctBachelors: (d.pct_bachelors_degree_or_higher ?? 0) / 100,
    pctCostBurdened: (d.rent_burden_pct ?? 0) / 100,
    confidence: "Medium",
  };
}

/**
 * Get sorted SOCIOECONOMIC-like rows for a region, built from pre-indexed Maps.
 */
function getSocioSeries(rid) {
  // Collect all years that have socio or property data for this region
  const years = new Set();
  (AUDITED_SOCIO_BY_ID.get(rid) || []).forEach((r) => years.add(r.year));
  (AUDITED_PROP_BY_ID.get(rid) || []).forEach((r) => years.add(r.year));
  if (years.size === 0) return [];
  return Array.from(years)
    .sort((a, b) => a - b)
    .map((yr) => buildSocioRow(rid, yr));
}

export function interpolateSocio(rn, ty) {
  const rid = typeof rn === "number" ? rn : NAME_TO_ID.get(rn);
  if (rid == null) return null;
  const sorted = getSocioSeries(rid);
  if (!sorted.length) return null;
  const ex = sorted.find((r) => r.year === ty);
  if (ex) return ex;
  if (ty <= sorted[0].year) return sorted[0];
  if (ty >= sorted[sorted.length - 1].year) return sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (ty >= sorted[i].year && ty <= sorted[i + 1].year) {
      const t = (ty - sorted[i].year) / (sorted[i + 1].year - sorted[i].year);
      const a = sorted[i];
      const b = sorted[i + 1];
      return {
        region: rn,
        year: ty,
        incomeAdj: Math.round(a.incomeAdj + t * (b.incomeAdj - a.incomeAdj)),
        homeValue: Math.round(a.homeValue + t * (b.homeValue - a.homeValue)),
        pctBachelors: +(a.pctBachelors + t * (b.pctBachelors - a.pctBachelors)).toFixed(3),
        pctCostBurdened: +(a.pctCostBurdened + t * (b.pctCostBurdened - a.pctCostBurdened)).toFixed(3),
        confidence: a.confidence === "High" && b.confidence === "High" ? "High" : "Medium",
      };
    }
  }
  return sorted[sorted.length - 1];
}

export function findPriorSocio(rn, ty) {
  const rid = typeof rn === "number" ? rn : NAME_TO_ID.get(rn);
  if (rid == null) return null;
  const sorted = getSocioSeries(rid);
  const prior = sorted.filter((r) => r.year < ty);
  return prior.length ? prior[prior.length - 1] : null;
}

// ── Cultural Anchor Density ──

/**
 * Compute the cultural anchor density for a region.
 * anchor_density = surviving / (surviving + closed).
 * Returns a value between 0 and 1, or null if no businesses tracked.
 */
export function calcAnchorDensity(regionId) {
  const surviving = LEGACY_OPERATING.filter((b) => b.region_id === regionId).length;
  const closed = LEGACY_CLOSED.filter((b) => b.region_id === regionId).length;
  const total = surviving + closed;
  if (total === 0) return null;
  return surviving / total;
}

/**
 * Get the anchor density badge info: label, color, background.
 */
export function getAnchorBadge(density) {
  if (density == null) return { label: "No Data", color: "#7c6f5e", bg: "#f5f0ea" };
  if (density > 0.7) return { label: "Strong anchor base", color: "#16a34a", bg: "#dcfce7" };
  if (density >= 0.4) return { label: "Eroding anchor base", color: "#ca8a04", bg: "#fef9c3" };
  return { label: "Critical anchor loss", color: "#dc2626", bg: "#fee2e2" };
}

// ── Tipping-point statistics (computed, not hard-coded) ──
// The narrative tipping points in data/tippingPoints.js name a corridor,
// a decade, and the policy events; the numbers are computed HERE from the
// audited census data for the corridor's tracts, so a stat shown in the
// panel can never drift from the data underneath it.
const TIPPING_DATA_YEARS = CENSUS_YEARS;
const MIN_GROUP_BASE = 100; // people; % change on smaller bases is noise

function nearestTippingYear(y) {
  return TIPPING_DATA_YEARS.reduce(
    (best, yr) => (Math.abs(yr - y) < Math.abs(best - y) ? yr : best),
    TIPPING_DATA_YEARS[0]
  );
}

function aggDemoAt(regionIds, yr) {
  let pop = 0, black = 0, hispanic = 0, white = 0, tracts = 0;
  for (const id of regionIds) {
    const r = (AUDITED_DEMO_BY_ID.get(id) || []).find((x) => x.year === yr);
    if (!r || r.total_population == null) continue;
    tracts++;
    pop += r.total_population;
    if (r.pct_black_non_hispanic != null) black += (r.pct_black_non_hispanic / 100) * r.total_population;
    if (r.pct_hispanic != null) hispanic += (r.pct_hispanic / 100) * r.total_population;
    if (r.pct_white_non_hispanic != null) white += (r.pct_white_non_hispanic / 100) * r.total_population;
  }
  return tracts ? { pop, black, hispanic, white, tracts } : null;
}

// Mean of tract median home values; audited property data first (2010+),
// legacy interim socioeconomic rows as the pre-2010 fallback.
function aggHomeValueAt(regionIds, yr) {
  const vals = [];
  for (const id of regionIds) {
    const p = (AUDITED_PROP_BY_ID.get(id) || []).find((x) => x.year === yr);
    if (p?.median_home_value != null) { vals.push(p.median_home_value); continue; }
    const s = SOCIOECONOMIC.find((x) => x.region_id === id && x.year === yr);
    if (s?.homeValue) vals.push(s.homeValue);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Compute a tipping point's quantitative story from the audited data:
 * group population changes and home-value change across the corridor's
 * tracts over its decade (clamped to available census years).
 * Returns null when the corridor has no usable data.
 */
export function computeTippingStats(tp) {
  const ids = tp?.region_ids || [];
  const nums = String(tp?.decade || "").match(/\d{4}/g);
  if (!ids.length || !nums || nums.length < 2) return null;
  let fromYear = nearestTippingYear(+nums[0]);
  const toYear = nearestTippingYear(+nums[1]);
  if (fromYear >= toYear) return null;

  let a = aggDemoAt(ids, fromYear);
  // Some corridors' data starts later than the narrative decade (e.g.,
  // Holly begins in 2010) — walk forward to the first year with data.
  while (!a) {
    const next = TIPPING_DATA_YEARS[TIPPING_DATA_YEARS.indexOf(fromYear) + 1];
    if (next == null || next >= toYear) break;
    fromYear = next;
    a = aggDemoAt(ids, fromYear);
  }
  const b = aggDemoAt(ids, toYear);
  const group = (k) => {
    if (!a || !b) return null;
    const from = Math.round(a[k]);
    const to = Math.round(b[k]);
    if (from < MIN_GROUP_BASE) return null;
    return { from, to, pct: +(((to - from) / from) * 100).toFixed(0) };
  };
  const hvA = aggHomeValueAt(ids, fromYear);
  const hvB = aggHomeValueAt(ids, toYear);

  const out = {
    fromYear,
    toYear,
    tracts: Math.max(a?.tracts || 0, b?.tracts || 0),
    black: group("black"),
    hispanic: group("hispanic"),
    white: group("white"),
    pop: group("pop"),
    homeValue: hvA != null && hvB != null && hvA > 0
      ? { from: Math.round(hvA), to: Math.round(hvB), pct: +(((hvB - hvA) / hvA) * 100).toFixed(0) }
      : null,
  };
  return [out.black, out.hispanic, out.white, out.pop, out.homeValue].some(Boolean) ? out : null;
}

// ── Direct displacement measures ──
// Measured change, not modeled vulnerability: the shift in Black+Hispanic
// population share and in renter share between the earliest reliable
// census year (2000, else 2010) and the latest (LATEST_YEAR, else 2020).
// Shown beside the displacement stage on the panel, story card and Triage.
export function calcDirectDisplacement(regionId) {
  const rows = AUDITED_DEMO_BY_ID.get(regionId);
  if (!rows || !rows.length) return null;
  const at = (yr) => rows.find((r) => r.year === yr);
  const bh = (r) => (r?.pct_black_non_hispanic != null && r?.pct_hispanic != null)
    ? r.pct_black_non_hispanic + r.pct_hispanic : null;
  const renter = (r) => (r?.pct_owner_occupied != null ? 100 - r.pct_owner_occupied : null);

  const to = [LATEST_YEAR, 2020].map(at).find((r) => bh(r) != null);
  const from = [2000, 2010].map(at).find((r) => bh(r) != null);
  if (!from || !to || from.year >= to.year) return null;

  const bhFrom = bh(from), bhTo = bh(to);
  const rFrom = renter(from), rTo = renter(to);
  return {
    fromYear: from.year,
    toYear: to.year,
    bhFrom: +bhFrom.toFixed(1),
    bhTo: +bhTo.toFixed(1),
    bhDelta: +(bhTo - bhFrom).toFixed(1),
    renterFrom: rFrom != null ? +rFrom.toFixed(1) : null,
    renterTo: rTo != null ? +rTo.toFixed(1) : null,
    renterDelta: rFrom != null && rTo != null ? +(rTo - rFrom).toFixed(1) : null,
  };
}

/**
 * The same measured change for a group of tracts (a neighborhood), using
 * population-weighted shares. Only years in which EVERY tract in the group
 * has a measurement are used, so the comparison never mixes a different
 * set of tracts at each end. Returns null when no such pair of years exists.
 * Renter share is weighted by population as an approximation (household
 * counts are not in the audited data).
 */
export function calcGroupDisplacement(regionIds) {
  const ids = regionIds || [];
  if (!ids.length) return null;
  if (ids.length === 1) return calcDirectDisplacement(ids[0]);
  const rowsAt = (yr) => {
    const rows = ids.map((id) => (AUDITED_DEMO_BY_ID.get(id) || []).find((r) => r.year === yr));
    const ok = rows.every((r) =>
      r && r.total_population > 0 && r.pct_black_non_hispanic != null && r.pct_hispanic != null);
    return ok ? rows : null;
  };
  const weighted = (rows, fn) => {
    let sum = 0, pop = 0;
    for (const r of rows) {
      const v = fn(r);
      if (v == null) return null;
      sum += v * r.total_population;
      pop += r.total_population;
    }
    return pop > 0 ? sum / pop : null;
  };
  const toYear = [LATEST_YEAR, 2020].find(rowsAt);
  const fromYear = [2000, 2010].find(rowsAt);
  if (!fromYear || !toYear || fromYear >= toYear) return null;
  const from = rowsAt(fromYear), to = rowsAt(toYear);
  const bh = (r) => r.pct_black_non_hispanic + r.pct_hispanic;
  const renter = (r) => (r.pct_owner_occupied != null ? 100 - r.pct_owner_occupied : null);
  const bhFrom = weighted(from, bh), bhTo = weighted(to, bh);
  const rFrom = weighted(from, renter), rTo = weighted(to, renter);
  return {
    fromYear,
    toYear,
    bhFrom: +bhFrom.toFixed(1),
    bhTo: +bhTo.toFixed(1),
    bhDelta: +(bhTo - bhFrom).toFixed(1),
    renterFrom: rFrom != null ? +rFrom.toFixed(1) : null,
    renterTo: rTo != null ? +rTo.toFixed(1) : null,
    renterDelta: rFrom != null && rTo != null ? +(rTo - rFrom).toFixed(1) : null,
  };
}
