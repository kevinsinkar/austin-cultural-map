// ── DVI weight persistence & helpers ──
// Custom weights survive reloads via localStorage so the committee can set
// a house methodology once and keep it. Everything degrades silently to
// the defaults when storage is unavailable.

import { DEFAULT_DVI_WEIGHTS } from "../data/auditedDvi";

const STORE_KEY = "pa-dvi-weights-v1";

/** Deep-clone the default weights object. */
export function cloneDefaultWeights() {
  return JSON.parse(JSON.stringify(DEFAULT_DVI_WEIGHTS));
}

/** Merge a possibly-partial stored object onto the defaults (schema drift safe). */
function mergeOntoDefaults(stored) {
  const base = cloneDefaultWeights();
  if (!stored || typeof stored !== "object") return base;
  for (const group of ["sub", "demographic", "market", "socio", "options"]) {
    if (stored[group] && typeof stored[group] === "object") {
      for (const k of Object.keys(base[group])) {
        const v = stored[group][k];
        if (group === "options") {
          if (typeof v === "boolean") base[group][k] = v;
        } else if (typeof v === "number" && isFinite(v)) {
          base[group][k] = Math.max(0, Math.min(100, v));
        }
      }
    }
  }
  return base;
}

export function loadDviWeights() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? mergeOntoDefaults(JSON.parse(raw)) : cloneDefaultWeights();
  } catch {
    return cloneDefaultWeights();
  }
}

export function saveDviWeights(weights) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(weights));
  } catch { /* private mode etc. — weights just won't persist */ }
}

export function clearDviWeights() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
}

export function isDefaultWeights(weights) {
  return JSON.stringify(weights) === JSON.stringify(DEFAULT_DVI_WEIGHTS);
}

/** Normalized share (0–100) of one weight within its group, for display. */
export function groupShare(group, key) {
  const total = Object.values(group).reduce((a, b) => a + b, 0);
  return total > 0 ? (group[key] / total) * 100 : 0;
}
