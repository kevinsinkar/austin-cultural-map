import { useState, useRef, useEffect } from "react";

/**
 * Grouped "Layers" popover — collapses the growing toggle row into four
 * groups that teach the data model: Boundaries / Cultural assets /
 * Pressure / Historical. Boundary mode (tracts vs. neighborhoods) rides
 * along as a radio pair in the Boundaries group.
 */
export default function LayersPopover({ boundaryMode, setBoundaryMode, groups }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount = groups.reduce(
    (n, g) => n + g.items.filter((it) => it.on).length,
    0
  );

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
          borderRadius: 8, border: "1.5px solid #0f766e", background: open ? "#0f766e" : "#fffffe",
          color: open ? "#fffffe" : "#0f766e", fontSize: 12, fontWeight: 600,
          cursor: "pointer", minHeight: 34,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1L15 5L8 9L1 5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M1 8.5L8 12.5L15 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.6" />
        </svg>
        Layers
        <span style={{
          fontSize: 11, fontWeight: 600, minWidth: 18, height: 18, borderRadius: 9,
          background: open ? "rgba(255,255,254,.25)" : "#f0fdfa",
          display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
        }}>
          {activeCount}
        </span>
        <span aria-hidden="true" style={{ fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>

      {open && (
        <div
          role="group"
          aria-label="Map layers"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 1300,
            width: 268, background: "#fffffe", border: "1px solid #d6d3cd",
            borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: "12px 14px",
          }}
        >
          {/* Boundaries group: mode radio + fill toggle */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
              Boundaries
            </div>
            <div style={{ display: "flex", background: "#edeae4", borderRadius: 8, padding: 3, marginBottom: 6 }}>
              {[
                { key: "tracts", label: "Census Tracts" },
                { key: "neighborhoods", label: "Neighborhoods" },
              ].map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => setBoundaryMode(mode.key)}
                  aria-current={boundaryMode === mode.key ? "page" : undefined}
                  style={{
                    flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 11,
                    fontWeight: boundaryMode === mode.key ? 600 : 400,
                    background: boundaryMode === mode.key ? "#fffffe" : "transparent",
                    color: boundaryMode === mode.key ? "#0f766e" : "#7c6f5e",
                    border: "none", cursor: "pointer", minHeight: 28,
                    boxShadow: boundaryMode === mode.key ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {groups.find((g) => g.title === "Boundaries")?.items.map((it) => (
              <LayerRow key={it.label} item={it} />
            ))}
          </div>

          {groups.filter((g) => g.title !== "Boundaries").map((g) => (
            <div key={g.title} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                {g.title}
              </div>
              {g.items.map((it) => (
                <LayerRow key={it.label} item={it} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LayerRow({ item }) {
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "4px 2px",
        fontSize: 12, color: "#1a1a1a", cursor: "pointer", borderRadius: 4,
      }}
    >
      <input
        type="checkbox"
        checked={item.on}
        onChange={item.toggle}
        style={{ accentColor: "#0f766e", width: 14, height: 14, cursor: "pointer" }}
      />
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
    </label>
  );
}
