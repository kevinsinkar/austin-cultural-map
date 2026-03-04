import * as d3 from "d3";
import _ from "lodash";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi.js";
import { AUDITED_SOCIO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID } from "../data/auditedData.js";
import { LEGACY_OPERATING, LEGACY_CLOSED } from "../data";
import { NAME_TO_ID } from "../data/regionLookup";

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

export function getDviColor(dvi, nd = false) {
  if (nd) return "#c4b5a4";
  if (dvi <= 0) return "#e8e5e0";
  if (dvi <= 20) return d3.interpolateRgb("#b8e6c8", "#4ade80")(dvi / 20);
  if (dvi <= 35) return d3.interpolateRgb("#4ade80", "#facc15")((dvi - 20) / 15);
  if (dvi <= 55) return d3.interpolateRgb("#facc15", "#fb923c")((dvi - 35) / 20);
  return d3.interpolateRgb("#fb923c", "#ef4444")(Math.min((dvi - 55) / 30, 1));
}

export function getDviBand(d) {
  if (d <= 20) return "Stable";
  if (d <= 35) return "Early Pressure";
  if (d <= 55) return "Active Displacement";
  return "Historic Displacement";
}

export function getDviBandColor(d) {
  if (d <= 20) return "#16a34a";
  if (d <= 35) return "#ca8a04";
  if (d <= 55) return "#ea580c";
  return "#dc2626";
}

export function getDviTimeSeries(regionId) {
  return [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023].map((yr) => ({
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
 * Compute the anchor pressure score for a region.
 * pressure_score = (high_pressure_count * 2 + moderate_pressure_count) / surviving_count.
 * Higher = more businesses under threat. Returns null if no surviving businesses.
 */
export function calcAnchorPressureScore(regionId) {
  const open = LEGACY_OPERATING.filter((b) => b.region_id === regionId);
  if (open.length === 0) return null;
  const high = open.filter((b) => b.pressure === "High" || b.pressure === "Critical").length;
  const moderate = open.filter((b) => b.pressure === "Moderate").length;
  return (high * 2 + moderate) / open.length;
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
