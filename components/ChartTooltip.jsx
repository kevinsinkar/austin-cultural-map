export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fffffe",
        border: "1px solid #d6d3cd",
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
        {label}
        {label >= 2020 ? " (ACS est.)" : ""}
      </div>
      {payload
        .filter((p) => p.value > 0)
        .reverse()
        .map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }}
            />
            <span style={{ color: "#64615b" }}>{p.name}:</span>
            <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
              {(p.value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
    </div>
  );
}
