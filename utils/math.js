import * as d3 from "d3";
import _ from "lodash";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi.js";
import {
  AUDITED_SOCIO_BY_ID, AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID,
  DEMO_BY_RY, SOCIO_BY_RY, PROP_BY_RY, closestRow,
} from "../data/auditedData.js";
import { LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL, REGION_INDEX } from "../data";
import { NAME_TO_ID, getMergedIds } from "../data/regionLookup";

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

// ── Helper: closest demo/socio/prop row for a region ──

function closestDemo(regionId, year) {
  return DEMO_BY_RY.get(`${regionId}_${year}`)
    || closestRow(AUDITED_DEMO_BY_ID.get(regionId), year);
}

function closestSocio(regionId, year) {
  return SOCIO_BY_RY.get(`${regionId}_${year}`)
    || closestRow(AUDITED_SOCIO_BY_ID.get(regionId), year);
}

function closestProp(regionId, year) {
  return PROP_BY_RY.get(`${regionId}_${year}`)
    || closestRow(AUDITED_PROP_BY_ID.get(regionId), year);
}

function paCountNear(regionId) {
  const regionEntry = REGION_INDEX.find(r => r.region_id === regionId);
  if (!regionEntry) return 0;
  return PA_ALL.filter(item => {
    if (!item.lat || !item.lng) return false;
    const dlat = item.lat - regionEntry.lat;
    const dlng = item.lng - regionEntry.lng;
    return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
  }).length;
}

// ── Lens 1: Displacement Trajectory ──

export function calcTrajectory(regionId) {
  const series = AUDITED_DVI_LOOKUP[regionId];
  if (!series || series.length === 0) return null;

  const dvi2023 = interpolateDvi(regionId, 2023);
  const dvi2010 = interpolateDvi(regionId, 2010);
  const dvi2000 = interpolateDvi(regionId, 2000);

  const dviPoint = series.find(p => p.year >= 2020) || series[series.length - 1];
  const isExcluded = dviPoint?.isExcluded ?? false;
  if (isExcluded) {
    return {
      velocity: 0, acceleration: 0, interventionWindow: 0,
      priority: 0, dvi2023, dvi2010, dvi2000,
      category: "Affluent / Appreciated",
    };
  }

  const velocityRecent = (dvi2023 - dvi2010) / 13;
  const velocityPrior = (dvi2010 - dvi2000) / 10;

  const MAX_VELOCITY = 3.0;
  const velocity = Math.max(0, Math.min(velocityRecent / MAX_VELOCITY * 100, 100));

  const accelRaw = velocityRecent - velocityPrior;
  const MAX_ACCEL = 2.0;
  const acceleration = Math.max(0, Math.min(accelRaw / MAX_ACCEL * 100, 100));

  const d = closestDemo(regionId, 2023);
  const s = closestSocio(regionId, 2023);
  const renterShare = d ? (100 - (d.pct_owner_occupied ?? 50)) / 75 : 0.5;
  const povertyNorm = s ? (s.poverty_rate ?? 0) / 30 : 0;
  const bipocShare = d ? ((d.pct_hispanic ?? 0) + (d.pct_black_non_hispanic ?? 0)) / 100 : 0;
  const rentBurdenNorm = d ? (d.rent_burden_pct ?? 0) / 55 : 0;
  const foreignBornNorm = d ? (d.pct_foreign_born ?? 0) / 40 : 0;

  const remainingVuln = Math.min(100,
    (0.30 * renterShare + 0.25 * povertyNorm + 0.20 * bipocShare
     + 0.15 * rentBurdenNorm + 0.10 * foreignBornNorm) * 100
  );

  let windowMultiplier;
  if (dvi2023 < 20)      windowMultiplier = dvi2023 / 20 * 0.3;
  else if (dvi2023 <= 55) windowMultiplier = 0.3 + 0.7 * ((dvi2023 - 20) / 35);
  else if (dvi2023 <= 70) windowMultiplier = 0.7;
  else                    windowMultiplier = 0.3;

  const interventionWindow = Math.min(100,
    windowMultiplier * (0.5 * velocity + 0.5 * remainingVuln)
  );

  const priority = +(
    0.35 * interventionWindow +
    0.30 * velocity +
    0.20 * Math.min(dvi2023 / 80 * 100, 100) +
    0.15 * acceleration
  ).toFixed(1);

  let category;
  if (priority >= 75)      category = "Urgent — Active Window";
  else if (priority >= 55) category = "High Priority — Accelerating";
  else if (priority >= 35) category = "Emerging — Monitor Closely";
  else if (priority >= 15) category = "Stable — Low Priority";
  else                     category = "Post-Displacement or Stable";

  return {
    velocity: +velocity.toFixed(1),
    acceleration: +acceleration.toFixed(1),
    interventionWindow: +interventionWindow.toFixed(1),
    priority,
    dvi2023: +dvi2023.toFixed(1),
    dvi2010: +dvi2010.toFixed(1),
    dvi2000: +dvi2000.toFixed(1),
    category,
  };
}

// ── Lens 2: Equity-Weighted Vulnerability ──

export function calcEquityPriority(regionId) {
  const dvi = interpolateDvi(regionId, 2023);

  const series = AUDITED_DVI_LOOKUP[regionId];
  const dviPoint = series?.find(p => p.year >= 2020) || series?.[series.length - 1];
  const isExcluded = dviPoint?.isExcluded ?? false;
  if (isExcluded) {
    return {
      demoVuln: 0, econPrecarity: 0, equityDeficit: 0, preservationGap: 0,
      priority: 0, dvi, category: "Affluent / Appreciated",
    };
  }

  const d = closestDemo(regionId, 2023);
  const s = closestSocio(regionId, 2023);
  const p = closestProp(regionId, 2023);

  // Demographic Vulnerability
  const rentBurden = d ? Math.min((d.rent_burden_pct ?? 0) / 55 * 100, 100) : 50;
  const renterShare = d ? Math.min((100 - (d.pct_owner_occupied ?? 50)) / 75 * 100, 100) : 50;
  const foreignBorn = d ? Math.min((d.pct_foreign_born ?? 0) / 40 * 100, 100) : 0;
  const elderly = d ? Math.min((d.pct_65_and_over ?? 0) / 25 * 100, 100) : 0;
  const demoVuln = +(0.40 * rentBurden + 0.30 * renterShare + 0.15 * foreignBorn + 0.15 * elderly).toFixed(1);

  // Economic Precarity
  const poverty = s ? Math.min((s.poverty_rate ?? 0) / 30 * 100, 100) : 0;
  const snap = s ? Math.min((s.snap_participation_rate ?? 0) / 25 * 100, 100) : 0;
  const homeValueChange = p ? Math.min((p.pct_home_value_change_yoy ?? 0) / 15 * 100, 100) : 0;
  const incomeGap = s ? Math.min((1 - (s.median_household_income ?? 86000) / 86000) * 100, 100) : 0;
  const econPrecarity = +(0.30 * poverty + 0.25 * Math.max(0, snap) + 0.25 * homeValueChange + 0.20 * Math.max(0, incomeGap)).toFixed(1);

  // Equity Deficit
  const bipocPct = d ? ((d.pct_hispanic ?? 0) + (d.pct_black_non_hispanic ?? 0)) : 0;
  const bipocScore = Math.min(bipocPct / 100 * 100, 100);

  const allIds = getMergedIds(regionId);
  const regionBiz = [...LEGACY_OPERATING, ...LEGACY_CLOSED].filter(
    b => allIds.includes(b.region_id)
  );
  const hasHeritage = regionBiz.some(b =>
    b.heritage && b.heritage !== "None" && b.heritage !== ""
  );
  const heritageScore = hasHeritage ? 80 : 20;

  const regionEntry = REGION_INDEX.find(r => r.region_id === regionId);
  const centroidLng = regionEntry?.lng ?? -97.74;
  const eastOfI35 = centroidLng > -97.735;
  const eastScore = eastOfI35 ? 70 : 30;

  const foreignBornScore = d ? Math.min((d.pct_foreign_born ?? 0) / 40 * 100, 100) : 0;

  const equityDeficit = +(0.35 * bipocScore + 0.25 * heritageScore + 0.20 * eastScore + 0.20 * foreignBornScore).toFixed(1);

  // Preservation Gap
  const paCount = paCountNear(regionId);
  const preservationGap = +Math.max(0, 100 - paCount * 15).toFixed(1);

  // Final priority
  const normalizedDvi = Math.min(dvi / 80 * 100, 100);
  const priority = +(
    0.25 * normalizedDvi +
    0.20 * demoVuln +
    0.20 * econPrecarity +
    0.20 * equityDeficit +
    0.15 * preservationGap
  ).toFixed(1);

  let category;
  if (priority >= 75)      category = "Equity Priority — Underserved";
  else if (priority >= 55) category = "Heritage at Risk";
  else if (priority >= 35) category = "Moderate Need";
  else if (priority >= 15) category = "Lower Priority";
  else                     category = "Affluent / Appreciated";

  return { demoVuln, econPrecarity, equityDeficit, preservationGap, priority, dvi, category };
}

// ── Lens 3: Risk Matrix (Multi-Dimensional) ──

export function calcRiskMatrix(regionId) {
  const dvi = interpolateDvi(regionId, 2023);

  const series = AUDITED_DVI_LOOKUP[regionId];
  const dviPoint = series?.find(p => p.year >= 2020) || series?.[series.length - 1];
  const isExcluded = dviPoint?.isExcluded ?? false;
  if (isExcluded) {
    return {
      marketPressure: 0, communityVuln: 0, culturalSig: 0, feasibility: 0,
      quadrant: "Q3", grantType: "None needed", category: "Affluent / Appreciated",
    };
  }

  const d = closestDemo(regionId, 2023);
  const p = closestProp(regionId, 2023);
  const s = closestSocio(regionId, 2023);

  // Axis 1: Market Displacement Pressure
  const appreciation = p ? Math.min((p.pct_home_value_change_yoy ?? 0) / 15 * 100, 100) : 0;
  const rent = p ? (p.median_rent_monthly ?? 0) : 0;
  const income = s ? (s.median_household_income ?? 30000) : 30000;
  const rentIncomeRatio = Math.min((rent * 12 / Math.max(income, 1)) / 0.50 * 100, 100);
  const giniScore = s ? Math.min((s.gini_coefficient ?? 0) / 0.55 * 100, 100) : 0;
  const permits = p ? Math.min((p.new_construction_permits ?? 0) / 500 * 100, 100) : 0;
  const marketPressure = +(0.35 * appreciation + 0.25 * rentIncomeRatio + 0.20 * permits + 0.20 * giniScore).toFixed(1);

  // Axis 2: Community Vulnerability
  const rentBurden = d ? Math.min((d.rent_burden_pct ?? 0) / 55 * 100, 100) : 50;
  const renterShare = d ? Math.min((100 - (d.pct_owner_occupied ?? 50)) / 75 * 100, 100) : 50;
  const poverty = s ? Math.min((s.poverty_rate ?? 0) / 30 * 100, 100) : 0;
  const foreignBorn = d ? Math.min((d.pct_foreign_born ?? 0) / 40 * 100, 100) : 0;
  const elderly = d ? Math.min((d.pct_65_and_over ?? 0) / 25 * 100, 100) : 0;
  const communityVuln = +(0.30 * rentBurden + 0.25 * renterShare + 0.20 * poverty + 0.15 * foreignBorn + 0.10 * elderly).toFixed(1);

  // Axis 3: Cultural Significance
  const bipocPct = d ? ((d.pct_hispanic ?? 0) + (d.pct_black_non_hispanic ?? 0)) : 0;
  const bipocScore = Math.min(bipocPct / 100 * 100, 100);

  const allIds = getMergedIds(regionId);
  const regionBiz = [...LEGACY_OPERATING, ...LEGACY_CLOSED].filter(
    b => allIds.includes(b.region_id)
  );
  const hasHeritage = regionBiz.some(b => b.heritage && b.heritage !== "None" && b.heritage !== "");
  const heritageScore = hasHeritage ? 80 : (regionBiz.length > 0 ? 40 : 0);

  const anchorDensity = calcAnchorDensity(regionId);
  const anchorScore = anchorDensity != null ? anchorDensity * 100 : 50;

  const paCount = paCountNear(regionId);
  const paScore = Math.min(paCount * 10, 100);

  const totalPop = d?.total_population ?? 0;
  const popScore = Math.min(totalPop / 15000 * 100, 100);

  const culturalSig = +(0.25 * bipocScore + 0.25 * heritageScore + 0.20 * anchorScore + 0.15 * paScore + 0.15 * popScore).toFixed(1);

  // Axis 4: Intervention Feasibility
  let dviWindowScore;
  if (dvi < 15)      dviWindowScore = 10;
  else if (dvi < 25) dviWindowScore = 10 + (dvi - 15) / 10 * 60;
  else if (dvi <= 55) dviWindowScore = 70 + (1 - Math.abs(dvi - 40) / 15) * 30;
  else if (dvi <= 70) dviWindowScore = 50;
  else                dviWindowScore = 25;

  const vacancy = p ? (p.vacancy_rate ?? 5) : 5;
  const vacancyScore = vacancy < 10 ? 80 : 40;
  const ownerOccupied = d ? (d.pct_owner_occupied ?? 50) : 50;
  const tenureMixScore = (ownerOccupied >= 20 && ownerOccupied <= 60) ? 80 : 40;
  const eviction = s ? (s.eviction_filing_rate ?? 0) : 0;
  const evictionScore = eviction < 5 ? 70 : 30;

  const feasibility = +(0.30 * dviWindowScore + 0.25 * vacancyScore + 0.25 * tenureMixScore + 0.20 * evictionScore).toFixed(1);

  // Quadrant assignment
  const marketHigh = marketPressure >= 50;
  const vulnHigh = communityVuln >= 50;
  let quadrant, grantType, category;

  if (marketHigh && vulnHigh) {
    quadrant = "Q1";
    category = feasibility >= 50 ? "Crisis — Fund Now" : "Crisis — Document";
    grantType = feasibility >= 50 ? "Emergency stabilization" : "Oral history & commemoration";
  } else if (marketHigh && !vulnHigh) {
    quadrant = "Q2";
    category = "Urgent — Prevent";
    grantType = "Proactive preservation";
  } else if (!marketHigh && vulnHigh) {
    quadrant = "Q4";
    category = feasibility >= 50 ? "Chronic — Invest" : "Chronic — Systemic";
    grantType = feasibility >= 50 ? "Community capacity building" : "Policy advocacy";
  } else {
    quadrant = "Q3";
    category = "Monitor";
    grantType = "No immediate action";
  }

  return {
    marketPressure, communityVuln, culturalSig, feasibility,
    quadrant, grantType, category, dvi,
  };
}
