export function fmtPct(v) {
  return (v * 100).toFixed(0) + "%";
}

export function fmtChange(c, p) {
  if (!p || p === 0) return null;
  const pct = ((c - p) / Math.abs(p)) * 100;
  return { pct: pct.toFixed(0), dir: pct >= 0 ? "up" : "down", raw: pct };
}

export function pressureColor(p) {
  if (p === "Critical") return "#dc2626";
  if (p === "High") return "#f59e0b";
  if (p === "Moderate") return "#a8a49c";
  return "#4ade80";
}

export function pressureDots(p) {
  const levels = { Low: 1, Moderate: 2, High: 3, Critical: 4 };
  const n = levels[p] || 1;
  return Array.from({ length: 4 }, (_, i) => i < n);
}

export function catColor(c) {
  return (
    {
      cultural: "#0f766e",
      economic: "#2563eb",
      policy: "#7c3aed",
      development: "#ea580c",
      displacement: "#dc2626",
      transit: "#0891b2",
    }[c] || "#64615b"
  );
}
