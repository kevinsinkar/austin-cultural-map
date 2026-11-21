export function fmtPct(v) {
  return (v * 100).toFixed(0) + "%";
}

export function fmtChange(c, p) {
  if (!p || p === 0) return null;
  const pct = ((c - p) / Math.abs(p)) * 100;
  return { pct: pct.toFixed(0), dir: pct >= 0 ? "up" : "down", raw: pct };
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
