import * as d3 from "d3";
import _ from "lodash";
import { DVI_LOOKUP } from "../data/dvi";
import { SOCIOECONOMIC } from "../data/socioeconomic";

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

export function interpolateDvi(n, yr) {
  return lerp(DVI_LOOKUP[n], yr);
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

export function getDviTimeSeries(regionName) {
  return [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023].map((yr) => ({
    year: yr,
    dvi: interpolateDvi(regionName, yr),
  }));
}

// ── Socioeconomic interpolation ──

export function interpolateSocio(rn, ty) {
  const rows = SOCIOECONOMIC.filter((s) => s.region === rn);
  if (!rows.length) return null;
  const sorted = _.sortBy(rows, "year");
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
  const rows = SOCIOECONOMIC.filter((s) => s.region === rn && s.year < ty);
  return rows.length ? _.maxBy(rows, "year") : null;
}
