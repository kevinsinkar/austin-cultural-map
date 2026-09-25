import { useState, useRef, useEffect } from "react";

// One visual language for data uncertainty across the app.
// A small High / Medium ⓘ / Low ⓘ badge; Medium and Low open a popover
// (hover or click, keyboard-accessible) explaining WHY the value is
// uncertain: crosswalked boundaries, interpolated year, partial coverage.
const LEVELS = {
  High: { dot: "#16a34a", label: "High" },
  Medium: { dot: "#d97706", label: "Medium" },
  Low: { dot: "#dc2626", label: "Low" },
};

export default function ConfidenceChip({ level = "Medium", reasons = [], suffix = "confidence", style }) {
  const [clicked, setClicked] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef(null);
  const open = (clicked || hovered) && reasons.length > 0;
  const cfg = LEVELS[level] || LEVELS.Medium;
  const hasInfo = reasons.length > 0;

  useEffect(() => {
    if (!clicked) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setClicked(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setClicked(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [clicked]);

  return (
    <span
      ref={rootRef}
      style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => hasInfo && setClicked((c) => !c)}
        aria-expanded={hasInfo ? open : undefined}
        aria-label={`${cfg.label} ${suffix}${hasInfo ? " — explain why" : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 10,
          border: "1px solid #d6d3cd",
          background: "#fffffe",
          fontSize: 11,
          fontWeight: 500,
          color: "#64615b",
          cursor: hasInfo ? "pointer" : "default",
          lineHeight: 1.3,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} aria-hidden="true" />
        {cfg.label} {suffix}
        {hasInfo && <span aria-hidden="true" style={{ color: "#a8a49c", fontSize: 11 }}>ⓘ</span>}
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1200,
            width: 250,
            background: "#fffffe",
            border: "1px solid #d6d3cd",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,.12)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
            Why {cfg.label.toLowerCase()} confidence?
          </div>
          <ul style={{ margin: 0, paddingLeft: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            {reasons.map((r, i) => (
              <li key={i} style={{ fontSize: 11, color: "#64615b", lineHeight: 1.45 }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
