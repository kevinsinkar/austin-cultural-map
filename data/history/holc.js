// 1935 HOLC "residential security" (redlining) map for Austin.
import holc from "./holc_1935.json";

// HOLC 1935 redlining polygons. CC BY-NC — non-commercial use only, credit
// Mapping Inequality (Digital Scholarship Lab, University of Richmond).
export const HOLC_1935 = holc;
export const HOLC_ATTRIBUTION =
  "HOLC 1935 map: Mapping Inequality, Digital Scholarship Lab, University of Richmond (CC BY-NC). No area descriptions survive for Austin.";
export const HOLC_GRADES = (() => {
  const seen = new Map();
  holc.features.forEach((f) => {
    const { grade, category, fill } = f.properties;
    if (grade && !seen.has(grade)) seen.set(grade, { grade, category, fill });
  });
  return [...seen.values()].sort((a, b) => a.grade.localeCompare(b.grade));
})();
