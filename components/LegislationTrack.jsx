import { useState, useMemo } from "react";
import { TX_LEGISLATION, LEG_DIRECTION_COLORS, LEG_DIRECTION_LABELS, LEG_CATEGORY_LABELS } from "../data/legislation";

const YEAR_MIN = 1990;
const YEAR_MAX = 2025;
const SPAN = YEAR_MAX - YEAR_MIN;

/**
 * Interactive Texas Legislature track under the map time slider.
 * Bills that affected Austin's cost of living, positioned by effective
 * year, colored by cost direction. Click a marker for the full card:
 * what the bill did, its Austin impact, and a source link.
 */
export default function LegislationTrack({ year, setYear }) {
  const [selectedBill, setSelectedBill] = useState(null);
  const [expanded, setExpanded] = useState(true);

  // Group bills by DISPLAY year so same-position markers stack instead of
  // overlap. A bill effective just past the axis (e.g., SB 38, eff. 2026)
  // joins the right-edge stack; its card still shows the true year.
  const byYear = useMemo(() => {
    const m = new Map();
    for (const bill of TX_LEGISLATION) {
      const displayYear = Math.min(bill.year, YEAR_MAX);
      if (!m.has(displayYear)) m.set(displayYear, []);
      m.get(displayYear).push(bill);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, []);

  // Track height grows to fit the tallest same-year stack (e.g., 2025's
  // housing package) plus the year label
  const trackHeight = useMemo(
    () => Math.max(30, Math.max(...byYear.map(([, bills]) => bills.length)) * 12 + 14),
    [byYear]
  );

  if (TX_LEGISLATION.length === 0) return null;

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid #e8e5e0", paddingTop: 8 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button
          onClick={() => { setExpanded(e => !e); setSelectedBill(null); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", padding: 0, display: "flex", alignItems: "center", gap: 5 }}
          aria-expanded={expanded}
        >
          <span style={{ display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s", fontSize: 9 }}>▶</span>
          TX Legislation — Cost of Living ({TX_LEGISLATION.length} bills)
        </button>
        {expanded && (
          <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#7c6f5e" }} aria-hidden="true">
            {Object.entries(LEG_DIRECTION_LABELS).map(([dir, label]) => (
              <span key={dir} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: LEG_DIRECTION_COLORS[dir], display: "inline-block" }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <>
          {/* Marker track */}
          <div style={{ position: "relative", height: trackHeight }} role="list" aria-label="Texas bills affecting Austin cost of living">
            {byYear.map(([billYear, bills]) => {
              const pct = ((billYear - YEAR_MIN) / SPAN) * 100;
              const near = Math.abs(billYear - year) <= 2;
              return (
                <div key={billYear} style={{ position: "absolute", left: `${pct}%`, top: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  {bills.map((bill) => {
                    const isSelected = selectedBill?.bill === bill.bill && selectedBill?.year === bill.year;
                    return (
                      <button
                        key={bill.bill}
                        role="listitem"
                        onClick={() => setSelectedBill(isSelected ? null : bill)}
                        title={`${bill.bill} (${bill.year}): ${bill.title}`}
                        aria-label={`${bill.bill}, ${bill.year}: ${bill.title}`}
                        style={{
                          width: isSelected ? 12 : 9,
                          height: isSelected ? 12 : 9,
                          borderRadius: 2,
                          transform: "rotate(45deg)",
                          background: LEG_DIRECTION_COLORS[bill.direction] || "#9ca3af",
                          border: isSelected ? "2px solid #1a1a1a" : "1px solid #fffffe",
                          cursor: "pointer",
                          padding: 0,
                          opacity: near || isSelected ? 1 : 0.45,
                          transition: "opacity .15s, width .1s, height .1s",
                        }}
                      />
                    );
                  })}
                  <span style={{ fontSize: 7.5, color: near ? "#44403c" : "#a8a49c", fontWeight: near ? 600 : 400 }}>
                    {String(billYear).slice(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Detail card */}
          {selectedBill && (
            <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderLeft: `3px solid ${LEG_DIRECTION_COLORS[selectedBill.direction] || "#9ca3af"}`, borderRadius: 8, padding: "12px 14px", marginTop: 6 }} role="region" aria-label={`${selectedBill.bill} details`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                    {selectedBill.bill} — {selectedBill.title}
                  </span>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, background: "#f5f0ea", color: "#7c6f5e", borderRadius: 3, padding: "2px 7px", fontWeight: 500 }}>
                      {selectedBill.session}
                    </span>
                    <span style={{ fontSize: 9, background: "#f5f0ea", color: "#7c6f5e", borderRadius: 3, padding: "2px 7px", fontWeight: 500 }}>
                      {LEG_CATEGORY_LABELS[selectedBill.category] || selectedBill.category}
                    </span>
                    <span style={{ fontSize: 9, background: `${LEG_DIRECTION_COLORS[selectedBill.direction]}18`, color: LEG_DIRECTION_COLORS[selectedBill.direction], borderRadius: 3, padding: "2px 7px", fontWeight: 600 }}>
                      {LEG_DIRECTION_LABELS[selectedBill.direction] || selectedBill.direction}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedBill(null)} aria-label="Close bill details" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#a8a49c", padding: 2, lineHeight: 1 }}>✕</button>
              </div>
              <p style={{ fontSize: 12, color: "#44403c", margin: "8px 0 0", lineHeight: 1.55 }}>{selectedBill.summary}</p>
              <p style={{ fontSize: 12, color: "#44403c", margin: "6px 0 0", lineHeight: 1.55 }}>
                <strong style={{ color: "#7c6f5e" }}>Austin impact:</strong> {selectedBill.austin_impact}
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
                {setYear && (
                  <button
                    onClick={() => setYear(Math.min(Math.max(selectedBill.year, YEAR_MIN), YEAR_MAX))}
                    style={{ fontSize: 10, fontWeight: 600, color: "#0f766e", background: "none", border: "1px solid #0f766e", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}
                  >
                    View {selectedBill.year} on map
                  </button>
                )}
                {selectedBill.source && (
                  <a href={selectedBill.source} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#7c6f5e" }}>
                    Source ↗
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
