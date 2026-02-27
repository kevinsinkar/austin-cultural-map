import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import _ from "lodash";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { REGIONS_GEOJSON, LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, TIMELINE_INFRA } from "../data";
import { DEMO_COLORS } from "../data/constants";
import { interpolateDvi, getDviColor } from "../utils/math";
import { catColor } from "../utils/formatters";

export default function TimelineView({ tlFilter, setTlFilter, isMobile }) {
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [hoveredBusiness, setHoveredBusiness] = useState(null);
  const [hoveredInfra, setHoveredInfra] = useState(null);
  const [bizActionFilter, setBizActionFilter] = useState("all");
  const [zoomLevel, setZoomLevel] = useState(1); // 1=decade, 2=year, 3=quarter
  const [pan, setPan] = useState(0);  // percentage offset of visible range
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const timelineViewportRef = useRef(null);

  // Year range configuration based on zoom level
  const yearRangeConfig = useMemo(() => {
    const configs = [
      { span: 101, label: "1930-2025" }, // Zoom 1: full range
      { span: 20, label: "20 years" },   // Zoom 2: 20 year window
      { span: 5, label: "5 years" }      // Zoom 3: 5 year window
    ];
    return configs[zoomLevel - 1];
  }, [zoomLevel]);

  // Calculate visible year range based on pan position
  const visibleYearRange = useMemo(() => {
    const centerYear = 1977.5; // Middle of dataset
    const halfSpan = yearRangeConfig.span / 2;
    const panOffset = (pan / 100) * yearRangeConfig.span; // Pan as percentage
    const startYear = Math.max(1925, centerYear - halfSpan + panOffset);
    const endYear = Math.min(2026, centerYear + halfSpan + panOffset);
    return { startYear, endYear, span: endYear - startYear };
  }, [pan, yearRangeConfig]);

  // Group infrastructure events by category for swimlanes
  const infraByCategory = useMemo(() => {
    const infraEvents = TIMELINE_INFRA.filter((e) => tlFilter === "all" || e.cat === tlFilter);
    const grouped = {};
    
    ["policy", "economic", "development", "cultural", "transit", "displacement"].forEach((cat) => {
      grouped[cat] = infraEvents.filter((e) => e.cat === cat);
    });
    
    return grouped;
  }, [tlFilter]);

  // Business Timeline (include full business objects)
  const timelineBiz = useMemo(() => {
    const items = [];
    LEGACY_OPERATING.forEach((b) => items.push({ year: b.est, action: "opened", ...b }));
    LEGACY_CLOSED.forEach((b) => {
      items.push({ year: b.est, action: "opened", ...b });
      items.push({ year: b.closed, action: "closed", cause: b.cause, replacedBy: b.replacedBy, ...b });
    });
    return _.sortBy(items, "year");
  }, []);

  // Combined events (infra + businesses) sorted by year
  const combinedEvents = useMemo(() => _.sortBy([
    ...TIMELINE_INFRA.map((e) => ({ ...e, _kind: "infra" })),
    ...timelineBiz.map((b) => ({ ...b, _kind: "business" })),
  ], "year"), [timelineBiz]);



  // Drag-based zoom handler (vertical)
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStart(e.clientY);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || dragStart === null) return;

    const dragDistance = e.clientY - dragStart;
    const sensitivity = 150; // pixels needed to change zoom level

    // Positive drag (down) = zoom out, Negative drag (up) = zoom in
    const dragZoomDelta = Math.round(dragDistance / sensitivity);
    const newZoomLevel = Math.max(1, Math.min(3, zoomLevel - dragZoomDelta));

    setZoomLevel(newZoomLevel);
  }, [isDragging, dragStart, zoomLevel]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setPan(0); // Reset pan on zoom change
  }, []);

  // Keyboard pan handler
  const handleKeyDown = useCallback((e) => {
    if (!timelineViewportRef.current) return;
    const panStep = 5;
    const maxPan = 50;
    
    if (e.key === "ArrowUp") {
      setPan((prev) => Math.max(-maxPan, prev - panStep));
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      setPan((prev) => Math.min(maxPan, prev + panStep));
      e.preventDefault();
    }
  }, []);

  // Attach keyboard listener to viewport
  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    
    viewport.addEventListener("keydown", handleKeyDown);
    return () => viewport.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <section aria-label="Timeline view">
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>
        {/* LEFT: TIMELINE CONTENT */}
        <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "calc(100% - 360px)", minWidth: 0 }}>

          {/* top filters */}
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

          {/* Combined Timeline */}
          <div className="timeline-container">
            <h3 className="timeline-title">
              <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="#64615b" strokeWidth="1.5" fill="none" /></svg>
              Timeline (Infrastructure & Legacy Businesses)
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#a8a49c", fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>
                Drag up/down to zoom (Zoom: {["Decade", "Year", "Quarter"][zoomLevel - 1]})
              </span>
            </h3>

            <div className="timeline-controls">
              {/* business action filters */}
              {[
                { key: "all", label: "All" },
                { key: "opened", label: "Openings" },
                { key: "closed", label: "Closures" },
              ].map((f) => (
                <button key={f.key} onClick={() => setBizActionFilter(f.key)} className={`timeline-action-btn ${bizActionFilter === f.key ? 'active' : ''}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="timeline-viewport" ref={timelineViewportRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} style={{cursor: isDragging ? "grabbing" : "grab"}} tabIndex={0}>
              <div className="timeline-track" style={{ width: "100%", height: "auto", minHeight: 800, display: "flex", flexDirection: "column", gap: 8, padding: "16px 0" }}>
                <div className="timeline-ruler" />

                {zoomLevel === 1 ? (
                  // Decade view - show ticks for full range
                  [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((yr) => {
                    const pct = ((yr - visibleYearRange.startYear) / visibleYearRange.span) * 100;
                    // Only render if within visible range
                    if (pct < -5 || pct > 105) return null;
                    return (
                      <div key={yr} className="timeline-year-tick" style={{ top: `${pct}%` }}>
                        <span className="timeline-year-label">{yr}</span>
                      </div>
                    );
                  })
                ) : zoomLevel === 2 ? (
                  // Year view - show every year
                  Array.from({ length: 96 }, (_, i) => Math.ceil(visibleYearRange.startYear) + i).filter((yr) => yr <= Math.floor(visibleYearRange.endYear)).map((yr) => {
                    if (yr % 5 !== 0) return null; // Show every 5 years
                    const pct = ((yr - visibleYearRange.startYear) / visibleYearRange.span) * 100;
                    if (pct < -5 || pct > 105) return null;
                    return (
                      <div key={yr} className="timeline-year-tick" style={{ top: `${pct}%` }}>
                        <span className="timeline-year-label" style={{ fontSize: 8 }}>{yr}</span>
                      </div>
                    );
                  })
                ) : (
                  // Quarter view - show every year
                  Array.from({ length: 96 }, (_, i) => Math.ceil(visibleYearRange.startYear) + i).filter((yr) => yr <= Math.floor(visibleYearRange.endYear)).map((yr) => {
                    const pct = ((yr - visibleYearRange.startYear) / visibleYearRange.span) * 100;
                    if (pct < -5 || pct > 105) return null;
                    return (
                      <div key={yr} className="timeline-year-tick" style={{ top: `${pct}%` }}>
                        <span className="timeline-year-label" style={{ fontSize: 7 }}>{yr}</span>
                      </div>
                    );
                  })
                )}

                {/* Infrastructure Swimlanes */}
                <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 2 }}>
                  {["policy", "economic", "development", "cultural", "transit", "displacement"].map((cat) => {
                    const events = infraByCategory[cat];
                    if (events.length === 0) return null;

                    return (
                      <div key={`swimlane-${cat}`} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 40, background: "#f9f8f7", borderRadius: 4, paddingRight: 8 }}>
                        {/* Category Label */}
                        <div style={{ minWidth: 100, paddingLeft: 8, fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                          {cat}
                        </div>

                        {/* Track Area */}
                        <div style={{ position: "relative", flex: 1, height: 30, background: "#fff" }}>
                          {events.map((ev, idx) => {
                            const pct = ((ev.year - visibleYearRange.startYear) / visibleYearRange.span) * 100;
                            if (pct < -5 || pct > 105) return null;

                            const isHovered = hoveredInfra === ev;

                            return (
                              <div
                                key={`infra-${cat}-${ev.year}-${idx}`}
                                className="timeline-event timeline-event--infra"
                                style={{ top: "50%", left: `${pct}%`, transform: "translate(-50%, -50%)" }}
                                onMouseEnter={() => { setHoveredInfra(ev); setHoveredBusiness(null); }}
                                onMouseLeave={() => setHoveredInfra(null)}
                              >
                                <div
                                  className="timeline-infra-dot"
                                  style={{
                                    width: isHovered ? 10 : 8,
                                    height: isHovered ? 10 : 8,
                                    background: catColor(ev.cat),
                                    boxShadow: isHovered ? `0 0 0 3px ${catColor(ev.cat)}40` : `0 0 0 1.5px ${catColor(ev.cat)}`,
                                    transition: "all 0.15s ease",
                                    cursor: "pointer",
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Business Events Section */}
                <div style={{ borderTop: "2px solid #e8e5e0", paddingTop: 12, marginTop: 8 }} />
                <div style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>
                  Businesses (Openings ▲ / Closures ▼)
                </div>

                {combinedEvents
                  .filter((ev) => {
                    // Only render business events, skip infra (handled in swimlanes)
                    if (ev._kind === "infra") return false;
                    const bizMatchesAction = bizActionFilter === "all" || ev.action === bizActionFilter;
                    const bizMatchesTl = tlFilter === "all" || (tlFilter === "displacement" && ev.action === "closed") || (tlFilter === "cultural" && (ev.culture === "African American" || ev.culture === "Mexican American/Latino")) || (tlFilter === "economic" && ev.culture === "General Austin");
                    return bizMatchesAction && bizMatchesTl;
                  })
                  .map((ev, idx) => {
                    const pct = ((ev.year - visibleYearRange.startYear) / visibleYearRange.span) * 100;
                    // don't render points outside view
                    if (pct < -5 || pct > 105) return null;
                    const leftOffset = `calc(50% + ${idx * 12}px)`; // stagger horizontally
                    
                    const isClose = ev.action === "closed";
                    const isHovered = hoveredBusiness === ev;
                    const isSelected = selectedBusiness && selectedBusiness.name === ev.name && selectedBusiness.year === ev.year && selectedBusiness.action === ev.action;
                    return (
                      <div key={`biz-${ev.name}-${ev.year}-${idx}`} className="timeline-event timeline-event--biz" style={{ top: `${pct}%`, left: leftOffset }} onMouseEnter={() => { setHoveredBusiness(ev); setHoveredInfra(null); }} onMouseLeave={() => setHoveredBusiness(null)}>
                        <div className="timeline-biz-dot" onClick={() => setSelectedBusiness(ev)} role="button" tabIndex={0} onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedBusiness(ev); }} style={{ width: isHovered || isSelected ? 10 : 8, height: isHovered || isSelected ? 10 : 8, background: isClose ? "#a8a49c" : "#4ade80", border: isClose ? "1.5px solid #78716c" : "1.5px solid #16a34a", boxShadow: (isHovered || isSelected) ? "0 0 0 4px " + (isClose ? "#a8a49c" : "#4ade80") + "40" : "none" }} />
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
              {[ ["White", "White"], ["Black", "Black"], ["Hispanic", "Hispanic"] ].map(([l,k]) => (
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
                    { ["2000–10", "2010–20", "2020–23"].map((p) => (
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

        {/* RIGHT: DETAIL CARD AREA */}
        <div className="detail-panel" style={{ flex: "1 1 0", minWidth: isMobile ? 0 : 320, maxHeight: isMobile ? "none" : "calc(100vh - 100px)", overflowY: "auto", position: isMobile ? "static" : "sticky", top: 16 }} role="region" aria-label="Detail card">
          {hoveredInfra ? (
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "20px", lineHeight: 1.4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{hoveredInfra.year}</div>
              <div style={{ fontSize: 14, color: "#44403c", marginBottom: 8 }}>{hoveredInfra.label}</div>
              <div style={{ display: "inline-block", fontSize: 10, padding: "2px 6px", borderRadius: 3, background: catColor(hoveredInfra.cat) + "18", color: catColor(hoveredInfra.cat), fontWeight: 600, textTransform: "capitalize", marginBottom: 8 }}>{hoveredInfra.cat}</div>
              <div style={{ fontSize: 12, color: "#64615b" }}>{hoveredInfra.summary}</div>
            </div>
          ) : (hoveredBusiness?.isAggregate ? (
            // Aggregate bubble detail
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "20px", lineHeight: 1.4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
                {hoveredBusiness.period}s Era
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ background: "#f0fdfa", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#0f766e", fontWeight: 600, marginBottom: 4 }}>Openings</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{hoveredBusiness.openCount}</div>
                </div>
                <div style={{ background: "#faf8f7", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#78716c", fontWeight: 600, marginBottom: 4 }}>Closures</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#a8a49c" }}>{hoveredBusiness.closeCount}</div>
                </div>
              </div>
              {hoveredBusiness.infraCount > 0 && (
                <div style={{ background: "#f5f0ea", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#92400e", fontWeight: 600, marginBottom: 4 }}>Infrastructure Events</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#b45309" }}>{hoveredBusiness.infraCount}</div>
                </div>
              )}
              <div style={{ fontSize: 12, color: "#64615b", lineHeight: 1.6 }}>
                <strong>Scroll</strong> to zoom in and see individual businesses in this period.
              </div>
            </div>
          ) : (hoveredBusiness || selectedBusiness) ? (
            (() => {
              const biz = hoveredBusiness || selectedBusiness;
              return (
                <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "20px", lineHeight: 1.4 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "#000" }}>{biz.name}</h2>
                  <div style={{ fontSize: 14, color: "#64615b", marginBottom: 8 }}>{biz.action === "closed" ? "Closed" : "Opened"} {biz.year}</div>
                  {biz.region && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Region:</strong> {biz.region}</div>}
                  {biz.address && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Address:</strong> {biz.address}</div>}
                  {biz.type && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Type:</strong> {biz.type}</div>}
                  {biz.culture && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Culture:</strong> {biz.culture}</div>}
                  {biz.ownership && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Ownership:</strong> {biz.ownership}</div>}
                  {biz.cause && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Cause:</strong> {biz.cause}</div>}
                  {biz.notes && <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4 }}><strong>Notes:</strong> {biz.notes}</div>}
                  {selectedBusiness && (
                    <button onClick={() => setSelectedBusiness(null)} style={{ marginTop: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid #d6d3cd", background: "#fff", color: "#000", cursor: "pointer" }}>Close</button>
                  )}
                </div>
              );
            })()
          ) : (
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} aria-hidden="true">📅</div>
              <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Select a timeline item</div>
              <div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>Hover or click a dot to view details. Drag up/down to zoom. Use ↑/↓ arrows to pan.</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
