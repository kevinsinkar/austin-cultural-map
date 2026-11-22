// Shared helpers for the scripts that rebuild figures from Census Bureau
// tables: cached API pulls, tract relationship files, and allocation of
// counts from older tract boundaries onto today's (2020) tracts.
//
// Raw pulls and trimmed crosswalks are cached in data/_cache/census_history/
// so the builds run offline. Fetching again needs a Census API key in
// CENSUS_API_KEY (or CENSUS_DATA_API). The key is never written anywhere.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = join(ROOT, "data", "_cache", "census_history");
mkdirSync(CACHE, { recursive: true });

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const MAX_VARS = 45; // the API accepts 50 variables per call

function apiKey(what) {
  const key = process.env.CENSUS_API_KEY || process.env.CENSUS_DATA_API;
  if (!key) throw new Error(`${what} is not cached and no Census API key is set (CENSUS_API_KEY).`);
  return key;
}

/** A Census API cell as a number; the bureau's "no data" codes become null. */
function cell(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return !isFinite(n) || n < -100000000 ? null : n;
}

export function readCache(name) {
  const file = join(CACHE, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
export function writeCache(name, data) {
  writeFileSync(join(CACHE, `${name}.json`), JSON.stringify(data));
}

/**
 * One table of tract rows for a set of Texas counties: { geoid: { var: number|null } }.
 * `dataset` is the API path ("2000/dec/sf3", "2023/acs/acs5").
 */
export async function loadTractTable(name, dataset, vars, counties) {
  const cached = readCache(name);
  if (cached) return cached;
  const key = apiKey(name);
  const rows = {};
  for (const county of counties) {
    for (let i = 0; i < vars.length; i += MAX_VARS) {
      const chunk = vars.slice(i, i + MAX_VARS);
      const res = await fetch(`https://api.census.gov/data/${dataset}?get=${chunk.join(",")}&for=tract:*&in=state:48&in=county:${county}&key=${key}`);
      if (!res.ok) throw new Error(`${name}: Census API returned ${res.status} for county ${county}`);
      const data = await res.json();
      const head = data[0];
      const tractAt = head.indexOf("tract");
      for (const r of data.slice(1)) {
        // The 2000 API returns whole-number tracts as four digits ("0011" is
        // tract 11, i.e. 001100); every other vintage returns six.
        const code = String(r[tractAt]);
        const geoid = `48${county}${code.length === 4 ? `${code}00` : code.padStart(6, "0")}`;
        const o = (rows[geoid] ??= {});
        head.forEach((h, at) => {
          if (h !== "state" && h !== "county" && h !== "tract") o[h] = cell(r[at]);
        });
      }
      await pause(250);
    }
  }
  writeCache(name, rows);
  console.log(`  fetched ${name}: ${Object.keys(rows).length} tracts`);
  return rows;
}

/** One row of values for a single geography ("county:453&in=state:48", an MSA, ...). */
export async function loadGeoValues(name, dataset, vars, forClause) {
  const cached = readCache(name);
  if (cached) return cached;
  const key = apiKey(name);
  const res = await fetch(`https://api.census.gov/data/${dataset}?get=${vars.join(",")}&for=${forClause}&key=${key}`);
  if (!res.ok) throw new Error(`${name}: Census API returned ${res.status}`);
  const data = await res.json();
  const out = data.slice(1).map((r) => Object.fromEntries(data[0].map((h, i) => [h, vars.includes(h) ? cell(r[i]) : r[i]])));
  writeCache(name, out);
  console.log(`  fetched ${name}`);
  return out;
}

/** A public file from www2.census.gov, parsed once and cached (no key needed). */
export async function loadRelationship(name, url, parse) {
  const cached = readCache(name);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${url} returned ${res.status}`);
  const rows = parse((await res.text()).replace(/^﻿/, "").trim().split(/\r?\n/));
  writeCache(name, rows);
  console.log(`  downloaded ${name}: ${rows.length} rows kept`);
  return rows;
}

export const REL_2000_2010_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel/trf_txt/tx48trf.txt";
export const REL_2010_2020_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st48.txt";

/** [geoid2000, geoid2010, share of the 2000 tract's people, share of its homes] */
export const parseRel2000 = (inArea) => (lines) => lines.map((l) => l.split(","))
  .filter((c) => inArea(c[3]) && inArea(c[12]))
  .map((c) => [c[3], c[12], +c[25] / 100, +c[28] / 100]);

/** [geoid2010, geoid2020, share of the 2010 tract's land] (the only measure that file carries) */
export const parseRel2010 = (inArea) => (lines) => lines.slice(1).map((l) => l.split("|"))
  .filter((c) => c[1] && c[8] && inArea(c[1]) && inArea(c[8]) && +c[10] > 0)
  .map((c) => [c[8], c[1], +(+c[14] / +c[10]).toFixed(6)]);

const MIN_PIECE = 0.005; // ignore slivers under 0.5% of the source tract

/** from -> [[to, weight]], slivers dropped and weights re-scaled to sum to 1. */
export function forwardWeights(rows, weightAt) {
  const m = new Map();
  for (const r of rows) {
    const w = r[weightAt];
    if (!(w >= MIN_PIECE)) continue;
    if (!m.has(r[0])) m.set(r[0], []);
    m.get(r[0]).push([r[1], w]);
  }
  for (const [k, list] of m) {
    const total = list.reduce((a, [, w]) => a + w, 0);
    m.set(k, list.map(([g, w]) => [g, w / total]));
  }
  return m;
}

/** Today's tract -> Map(source tract -> share of the source that lands here). */
export function sourcesOf(...steps) {
  const out = new Map();
  const walk = (from, weight, depth, origin) => {
    if (depth === steps.length) {
      if (!out.has(from)) out.set(from, new Map());
      const m = out.get(from);
      m.set(origin, (m.get(origin) || 0) + weight);
      return;
    }
    for (const [to, w] of steps[depth].get(from) || []) walk(to, weight * w, depth + 1, origin);
  };
  for (const origin of steps[0].keys()) walk(origin, 1, 0, origin);
  return out;
}

/** Sum a count over a tract's sources. Null when any real contributor lacks it. */
export function allocate(sources, table, pick) {
  if (!sources || !sources.size) return null;
  let total = 0;
  let used = 0;
  for (const [geoid, w] of sources) {
    const row = table[geoid];
    const v = row ? pick(row) : null;
    if (v == null) {
      if (w >= 0.02) return null; // a real contributor is missing: do not guess
      continue;
    }
    total += v * w;
    used++;
  }
  return used ? total : null;
}

/**
 * A median carried onto today's tract: the average of the source tracts'
 * medians, weighted by how much of the relevant universe (families, owner
 * homes, renter homes) each source contributes. An approximation — a median
 * cannot be allocated exactly — and the one the UT "Uprooted" method uses.
 */
export function weightedMedian(sources, table, pickMedian, pickUniverse) {
  if (!sources || !sources.size) return null;
  let sum = 0;
  let weight = 0;
  for (const [geoid, w] of sources) {
    const row = table[geoid];
    const m = row ? pickMedian(row) : null;
    const u = row ? pickUniverse(row) : null;
    if (m == null || !(m > 0) || !(u > 0)) continue; // a missing median is left out, not counted as zero
    sum += m * u * w;
    weight += u * w;
  }
  return weight > 0 ? sum / weight : null;
}

/** Read one exported constant from a data module without resolving its imports. */
export function readExport(rel, name) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const body = src.replace(/^import\s.*$/gm, "").replace(/^export\s+const\s+/gm, "const ").replace(/^export\s+\{[^}]*\};?\s*$/gm, "").replace(/^export\s+default\s+/gm, "const _default_ = ");
  return new Function(`${body}\nreturn ${name};`)();
}
