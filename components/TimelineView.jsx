import { useMemo, useState } from "react";
import _ from "lodash";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { REGIONS_GEOJSON, LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, TIMELINE_INFRA } from "../data";
import { DEMO_COLORS } from "../data/constants";
import { interpolateDvi, getDviColor } from "../utils/math";
import { catColor } from "../utils/formatters";
// placeholder/detail card will be rendered inline


export default function TimelineView({ tlFilter, setTlFilter, isMobile }) {
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [hoveredBusiness, setHoveredBusiness] = useState(null);
  const [hoveredInfra, setHoveredInfra] = useState(null);
  const [bizActionFilter, setBizActionFilter] = useState("all");

  // Business Timeline
  const timelineBiz = useMemo(() => {
    const items = [];
    // copy full business info into each event so detail panel can show all keys
    LEGACY_OPERATING.forEach((b) =>
      items.push({ year: b.est, action: "opened", ...b })
    );
    LEGACY_CLOSED.forEach((b) => {
      items.push({ year: b.est, action: "opened", ...b });
      items.push({ year: b.closed, action: "closed", cause: b.cause, replacedBy: b.replacedBy, ...b });
    });
    return _.sortBy(items, "year");
  }, []);

  return (
    <section aria-label="Timeline view">
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        {/* ═══ LEFT: TIMELINE CONTENT ═══ */}
        <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "calc(100% - 360px)", minWidth: 0 }}>
          {/* Filter buttons for Infrastructure & Policy */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64615b" }}>Filter:</span>
        {[
          { key: "all", label: "All" },
          { key: "displacement", label: "Displacement" },
          { key: "policy", label: "Policy" },
          { key: "development", label: "Development" },
          { key: "cultural", label: "Cultural" },
          { key: "economic", label: "Economic" },
        ].map((f) => (
          <button key={f.key} onClick={() => setTlFilter(f.key)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: tlFilter === f.key ? 600 : 400, border: tlFilter === f.key ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd", background: tlFilter === f.key ? "#f0fdfa" : "#fffffe", color: tlFilter === f.key ? "#0f766e" : "#64615b", cursor: "pointer", minHeight: 28 }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Infrastructure Events Track */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginBottom: 12 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="#64615b" strokeWidth="1.5" fill="none" /><path d="M7 4v4l2.5 1.5" stroke="#64615b" strokeWidth="1.2" strokeLinecap="round" /></svg>
          Infrastructure & Policy Timeline
        </h3>
        <div style={{ position: "relative", overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ display: "flex", minWidth: Math.max(1400, TIMELINE_INFRA.length * 40), position: "relative", height: 120 }}>
            <div style={{ position: "absolute", top: 50, left: 0, right: 0, height: 2, background: "#e8e5e0" }} />
            {TIMELINE_INFRA
              .filter((e) => tlFilter === "all" || e.cat === tlFilter)
              .map((evt, i) => {
                const pct = ((evt.year - 1925) / 101) * 100;
                return (
                  <div
                    key={i}
                    onMouseEnter={() => setHoveredInfra(evt)}
                    onMouseLeave={() => setHoveredInfra(null)}
                    style={{ position: "absolute", left: `${pct}%`, top: 0, transform: "translateX(-50%)", width: 20, textAlign: "center" }}
                    role="listitem"
                  >
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: catColor(evt.cat), margin: "0 auto", border: "2px solid #fffffe", boxShadow: "0 0 0 1.5px " + catColor(evt.cat) }} />
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Business Openings & Closures Track */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginBottom: 12 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="4" width="10" height="7" rx="1" stroke="#64615b" strokeWidth="1.3" fill="none" /><path d="M5 4V3a2 2 0 014 0v1" stroke="#64615b" strokeWidth="1.3" fill="none" /></svg>
          Legacy Business Timeline
        </h3>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "All" },
            { key: "opened", label: "Openings" },
            { key: "closed", label: "Closures" },
          ].map((f) => (
            <button key={f.key} onClick={() => setBizActionFilter(f.key)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: bizActionFilter === f.key ? 600 : 400, border: bizActionFilter === f.key ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd", background: bizActionFilter === f.key ? "#f0fdfa" : "#ffffte", color: bizActionFilter === f.key ? "#0f766e" : "#64615b", cursor: "pointer", minHeight: 28 }}>
              {f.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 10, color: "#a8a49c", margin: "0 0 12px" }}>Green = opened · Gray = closed/displaced</p>
        <div style={{ position: "relative", overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ position: "relative", minWidth: 1200, height: Math.max(180, timelineBiz.filter((b) => (bizActionFilter === "all" || b.action === bizActionFilter) && (tlFilter === "all" || (tlFilter === "displacement" && b.action === "closed") || (tlFilter === "cultural" && (b.culture === "African American" || b.culture === "Mexican American/Latino")) || (tlFilter === "economic" && b.culture === "General Austin"))).length * 4 + 40) }}>
            {[1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((yr) => {
              const pct = ((yr - 1925) / 101) * 100;
              return (
                <div key={yr} style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 1, background: "#e8e5e0" }}>
                  <span style={{ position: "absolute", top: -2, left: 4, fontSize: 9, color: "#a8a49c", fontWeight: 600 }}>{yr}</span>
                </div>
              );
            })}
            {timelineBiz
              .filter((b) => (bizActionFilter === "all" || b.action === bizActionFilter) && (tlFilter === "all" || (tlFilter === "displacement" && b.action === "closed") || (tlFilter === "cultural" && (b.culture === "African American" || b.culture === "Mexican American/Latino")) || (tlFilter === "economic" && b.culture === "General Austin")))
              .map((b, i) => {
                const x = ((b.year - 1925) / 101) * 100;
                const isClose = b.action === "closed";
                const isHovered = hoveredBusiness === b;
                const isSelected = selectedBusiness && selectedBusiness.name === b.name && selectedBusiness.year === b.year && selectedBusiness.action === b.action;
                
                return (
                  <div 
                    key={`${b.name}-${b.year}-${b.action}-${i}`} 
                    style={{ 
                      position: "absolute", 
                      left: `${x}%`, 
                      top: 20 + i * 3.5, 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 4 
                    }}
                    onMouseEnter={() => setHoveredBusiness(b)}
                    onMouseLeave={() => setHoveredBusiness(null)}
                  >
                    <div 
                      onClick={() => setSelectedBusiness(b)}
                      style={{ 
                        width: isHovered || isSelected ? 10 : 7, 
                        height: isHovered || isSelected ? 10 : 7, 
                        borderRadius: "50%", 
                        background: isClose ? "#a8a49c" : "#4ade80", 
                        border: isClose ? "1.5px solid #78716c" : "1.5px solid #16a34a", 
                        flexShrink: 0,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: (isHovered || isSelected) ? "0 0 0 4px " + (isClose ? "#a8a49c" : "#4ade80") + "40" : "none",
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedBusiness(b);
                        }
                      }}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Aggregate Demographic Track */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginBottom: 12 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>Aggregate Demographics Across All 15 Regions</h3>
        <div style={{ height: 180 }} role="img" aria-label="Aggregate demographic chart showing combined population shares across all regions from 1990 to 2023">
          <ResponsiveContainer>
            <LineChart
              data={[1990, 2000, 2010, 2020, 2023].map((yr) => {
                const rows = DEMOGRAPHICS.filter((dd) => dd.year === yr);
                const t = _.sumBy(rows, "total");
                return { year: yr, Black: _.sumBy(rows, "popBlack") / t, Hispanic: _.sumBy(rows, "popHispanic") / t, White: _.sumBy(rows, "popWhite") / t, total: t };
              })}
              margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d6d3cd" }} />
              <Line type="monotone" dataKey="White" stroke={DEMO_COLORS.White} strokeWidth={2.5} dot={{ r: 3 }} name="White non-Hispanic" />
              <Line type="monotone" dataKey="Black" stroke={DEMO_COLORS.Black} strokeWidth={2.5} dot={{ r: 3 }} name="Black" />
              <Line type="monotone" dataKey="Hispanic" stroke={DEMO_COLORS.Hispanic} strokeWidth={2.5} dot={{ r: 3 }} name="Hispanic/Latino" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
          {[["White", "White"], ["Black", "Black"], ["Hispanic", "Hispanic"]].map(([l, k]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 3, borderRadius: 1, background: DEMO_COLORS[k] }} />
              <span style={{ fontSize: 10, color: "#64615b" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* DVI Heatmap */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>DVI Heatmap by Region & Period</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 500 }} role="table" aria-label="Displacement Velocity Index heatmap">
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600, color: "#64615b", borderBottom: "2px solid #e8e5e0", position: "sticky", left: 0, background: "#fffffe", zIndex: 2 }}>Region</th>
                {["2000–10", "2010–20", "2020–23"].map((p) => (
                  <th key={p} style={{ textAlign: "center", padding: "4px 8px", fontWeight: 600, color: "#64615b", borderBottom: "2px solid #e8e5e0" }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REGIONS_GEOJSON.features.map((f) => {
                const n = f.properties.region_name;
                const nd = n === "The Domain / North Burnet";
                const vals = [interpolateDvi(n, 2010), interpolateDvi(n, 2020), interpolateDvi(n, 2023)];
                return (
                  <tr key={n} style={{ borderBottom: "1px solid #f0ede8" }}>
                    <td style={{ padding: "5px 8px", fontWeight: 500, color: "#1a1a1a", whiteSpace: "nowrap", position: "sticky", left: 0, background: "#fffffe", zIndex: 1 }}>{f.properties.short_name}</td>
                    {vals.map((v, i) => (
                      <td key={i} style={{ padding: "4px 8px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, background: nd ? "#f5f0ea" : getDviColor(v), color: v > 45 ? "#fff" : "#1a1a1a", fontWeight: 600, fontSize: 11, minWidth: 36 }}>
                          {nd ? "—" : v.toFixed(0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.5, padding: "12px 4px" }}>
        Infrastructure events compiled from City of Austin records, news sources, and community timelines. Business dates from community inventories. Aggregate demographics sum all 15 tracked regions.
      </div>
        </div>

        {/* ═══ RIGHT: DETAIL CARD AREA ═══ */}
        <div
            className="detail-panel"
            style={{ flex: "1 1 0", minWidth: isMobile ? 0 : 320, maxHeight: isMobile ? "none" : "calc(100vh - 100px)", overflowY: "auto", position: isMobile ? "static" : "sticky", top: 16 }}
            role="region"
            aria-label="Detail card"
        >
            {hoveredInfra ? (
              <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "20px", lineHeight: 1.4 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{hoveredInfra.year}</div>
                <div style={{ fontSize: 14, color: "#44403c", marginBottom: 8 }}>{hoveredInfra.label}</div>
                <div style={{ display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 3, background: catColor(hoveredInfra.cat) + "18", color: catColor(hoveredInfra.cat), fontWeight: 600, textTransform: "capitalize", marginBottom: 8 }}>{hoveredInfra.cat}</div>
                <div style={{ fontSize: 12, color: "#64615b" }}>{hoveredInfra.summary}</div>
              </div>
            ) : ((hoveredBusiness || selectedBusiness) ? (
              (() => {
                const biz = hoveredBusiness || selectedBusiness;
                return (
                  <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "20px", lineHeight: 1.4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>{biz.name}</h2>
                    <div style={{ fontSize: 14, color: "#64615b", marginBottom: 8 }}>
                      {biz.action === "closed" ? "Closed" : "Opened"} {biz.year}
                    </div>
                    {biz.region && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Region:</strong> {biz.region}</div>}
                    {biz.address && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Address:</strong> {biz.address}</div>}
                    {biz.type && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Type:</strong> {biz.type}</div>}
                    {biz.culture && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Culture:</strong> {biz.culture}</div>}
                    {biz.ownership && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Ownership:</strong> {biz.ownership}</div>}
                    {biz.cause && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Cause:</strong> {biz.cause}</div>}
                    {biz.notes && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Notes:</strong> {biz.notes}</div>}
                    {selectedBusiness && (
                      <button onClick={() => setSelectedBusiness(null)} style={{ marginTop: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid #d6d3cd", background: "#fff", cursor: "pointer" }}>Close</button>
                    )}
                  </div>
                );
              })()
            ) : (
              <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} aria-hidden="true">📅</div>
                <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Select a timeline item</div>
                <div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>Hover or click a dot on either timeline to view its details here.</div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
