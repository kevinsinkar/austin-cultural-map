import _ from "lodash";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { DEMO_COLORS } from "../data/constants";
import { getDviColor, getDviBand, getDviBandColor } from "../utils/math";
import { fmtPct, fmtChange, pressureColor, pressureDots } from "../utils/formatters";
import ChartTooltip from "./ChartTooltip";

export default function RegionDetailPanel({
  activeFeature,
  activeRegionName,
  year,
  currentDvi,
  regionBizOpen,
  regionBizClosed,
  demoChartData,
  socioNow,
  socioPrev,
  tippingPoint,
  narrativeCallouts,
  selectedBiz,
  setSelectedBiz,
  bizTab,
  setBizTab,
  setSelectedRegion,
  setHoveredRegion,
  isMobile,
}) {
  if (!activeFeature) {
    return (
      <div
        className="detail-panel"
        style={{ flex: "1 1 0", minWidth: isMobile ? 0 : 320, maxHeight: isMobile ? "none" : "calc(100vh - 100px)", overflowY: "auto", position: isMobile ? "static" : "sticky", top: 16 }}
        role="region"
        aria-label="Region detail panel"
      >
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} aria-hidden="true">🗺️</div>
          <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Select a neighborhood</div>
          <div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>Click any region on the map to explore its demographic history, displacement metrics, and cultural story.</div>
        </div>
      </div>
    );
  }

  const nd = activeRegionName === "The Domain / North Burnet";
  const d = currentDvi[activeRegionName] || 0;

  return (
    <div
      className="detail-panel"
      style={{ flex: "1 1 0", minWidth: isMobile ? 0 : 320, maxHeight: isMobile ? "none" : "calc(100vh - 100px)", overflowY: "auto", position: isMobile ? "static" : "sticky", top: 16 }}
      role="region"
      aria-label="Region detail panel"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header */}
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 20, fontWeight: 600, color: "#1a1a1a", margin: 0, lineHeight: 1.25 }}>{activeFeature.properties.region_name}</h2>
              {activeFeature.properties.heritage && (
                <span style={{ display: "inline-block", fontSize: 10, color: "#7c6f5e", padding: "2px 8px", background: "#f5f0ea", borderRadius: 3, fontWeight: 500, marginTop: 4 }}>
                  {activeFeature.properties.heritage}
                </span>
              )}
            </div>
            <button
              onClick={() => { setSelectedRegion(null); setHoveredRegion(null); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#a8a49c", padding: 4, lineHeight: 1, minWidth: 32, minHeight: 32 }}
              aria-label="Close detail panel"
            >
              ✕
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: getDviColor(d, nd), border: "1px solid rgba(0,0,0,.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{d.toFixed(0)}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: nd ? "#7c6f5e" : getDviBandColor(d) }}>{nd ? "N/A — New Development" : getDviBand(d)}</div>
              <div style={{ fontSize: 11, color: "#a8a49c" }}>DVI at {year}</div>
            </div>
          </div>
        </div>

        {/* Demo chart */}
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Demographic Composition</h3>
          <p style={{ fontSize: 11, color: "#a8a49c", margin: "0 0 12px" }}>Share of total population, 1990–2023</p>
          {demoChartData.length > 0 && (
            <div style={{ width: "100%", height: 200 }} role="img" aria-label={`Demographic composition chart for ${activeRegionName}`}>
              <ResponsiveContainer>
                <AreaChart data={demoChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} axisLine={{ stroke: "#d6d3cd" }} />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} domain={[0, 1]} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine x={year} stroke="#0f766e" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
                  <Area type="monotone" dataKey="Other" stackId="1" stroke="none" fill={DEMO_COLORS.Other} fillOpacity={0.85} name="Other/Multiracial" />
                  <Area type="monotone" dataKey="Asian" stackId="1" stroke="none" fill={DEMO_COLORS.Asian} fillOpacity={0.85} name="Asian" />
                  <Area type="monotone" dataKey="Hispanic" stackId="1" stroke="none" fill={DEMO_COLORS.Hispanic} fillOpacity={0.85} name="Hispanic/Latino" />
                  <Area type="monotone" dataKey="Black" stackId="1" stroke="none" fill={DEMO_COLORS.Black} fillOpacity={0.85} name="Black" />
                  <Area type="monotone" dataKey="White" stackId="1" stroke="none" fill={DEMO_COLORS.White} fillOpacity={0.85} name="White non-Hispanic" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            {[["White", "White"], ["Black", "Black"], ["Hispanic", "Hispanic"], ["Asian", "Asian"], ["Other", "Other"]].map(([l, k]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: DEMO_COLORS[k] }} aria-hidden="true" />
                <span style={{ fontSize: 10, color: "#64615b" }}>{l}</span>
              </div>
            ))}
          </div>
          {(() => {
            const n = _.minBy(demoChartData, (dd) => Math.abs(dd.year - year));
            if (!n) return null;
            return (
              <div style={{ fontSize: 11, color: "#64615b", marginTop: 8, lineHeight: 1.5, borderTop: "1px solid #e8e5e0", paddingTop: 8 }}>
                In <strong>{n.year}</strong>, total pop. was <strong>{n.total.toLocaleString()}</strong>.
                Black: <strong style={{ color: DEMO_COLORS.Black }}>{n.popBlack.toLocaleString()}</strong>.
                Hispanic: <strong style={{ color: DEMO_COLORS.Hispanic }}>{n.popHispanic.toLocaleString()}</strong>.
                White: <strong style={{ color: DEMO_COLORS.White }}>{n.popWhite.toLocaleString()}</strong>.
              </div>
            );
          })()}
        </div>

        {/* Metrics */}
        {socioNow && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Median Income", value: socioNow.incomeAdj, fmt: (v) => "$" + (v / 1000).toFixed(0) + "k", prevVal: socioPrev?.incomeAdj, sub: "Adj. 2023$" },
              { label: "Home Value", value: socioNow.homeValue, fmt: (v) => "$" + (v / 1000).toFixed(0) + "k", prevVal: socioPrev?.homeValue, sub: "Appraised" },
              { label: "Bachelor's+", value: socioNow.pctBachelors, fmt: fmtPct, prevVal: socioPrev?.pctBachelors, sub: "Adults 25+" },
              { label: "Cost-Burdened", value: socioNow.pctCostBurdened, fmt: fmtPct, prevVal: socioPrev?.pctCostBurdened, sub: "Rent >30%", inv: true },
            ].map((c, i) => {
              const ch = c.prevVal != null ? fmtChange(c.value, c.prevVal) : null;
              const up = ch?.dir === "up";
              const bad = c.inv ? up : !up;
              return (
                <div key={i} style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", lineHeight: 1.3 }}>{c.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-.02em", lineHeight: 1 }}>{c.fmt(c.value)}</span>
                    {ch && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: bad ? "#dc2626" : "#16a34a", display: "flex", alignItems: "center", gap: 2 }} aria-label={`${bad ? "worsened" : "improved"} ${Math.abs(ch.raw).toFixed(0)} percent vs ${socioPrev?.year}`}>
                        <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: up ? "none" : "rotate(180deg)" }} aria-hidden="true"><polygon points="4,0 8,8 0,8" fill="currentColor" /></svg>
                        {Math.abs(ch.raw).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.3 }}>
                    {c.sub}
                    {ch && socioPrev && <span> · vs {socioPrev.year}</span>}
                    {socioNow.confidence === "Medium" && <span title="Derived from secondary source with some boundary approximation" style={{ cursor: "help", marginLeft: 3 }}>ⓘ</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tipping point */}
        {tippingPoint && tippingPoint.magnitude !== "N/A" && (
          <div style={{ background: "#fefbf3", borderRadius: 10, border: "1px solid #e6dfc8", padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" stroke="#b45309" strokeWidth="1.5" fill="none" /><path d="M8 4v5M8 11v1" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>What Happened Here?</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: tippingPoint.magnitude === "Extreme" ? "#fecaca" : tippingPoint.magnitude === "Severe" ? "#fed7aa" : "#fef3c7", color: tippingPoint.magnitude === "Extreme" ? "#991b1b" : tippingPoint.magnitude === "Severe" ? "#9a3412" : "#92400e" }}>{tippingPoint.magnitude}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>The tipping point: {tippingPoint.decade}</div>
            <p style={{ fontSize: 12, color: "#44403c", margin: "0 0 8px", lineHeight: 1.55 }}>{tippingPoint.description}</p>
            <div style={{ fontSize: 11, color: "#78716c", lineHeight: 1.4, borderTop: "1px solid #e6dfc8", paddingTop: 8 }}>
              <strong style={{ color: "#92400e" }}>Catalyst:</strong> {tippingPoint.event} <span style={{ color: "#a8a49c" }}>({tippingPoint.eventYear})</span>
            </div>
            {activeRegionName === "Dove Springs" && <div style={{ fontSize: 11, color: "#7c6f5e", fontStyle: "italic", marginTop: 8 }}>Note: Dove Springs is a receiving community. Changes reflect inflow of displaced families, not gentrification.</div>}
          </div>
        )}
        {activeRegionName === "The Domain / North Burnet" && (
          <div style={{ background: "#f5f0ea", borderRadius: 10, border: "1px solid #e6dfc8", padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#7c6f5e", marginBottom: 4 }}>Greenfield Development</div>
            <p style={{ fontSize: 12, color: "#64615b", margin: 0, lineHeight: 1.5 }}>Developed on non-residential land. DVI not applicable — included as comparison reference.</p>
          </div>
        )}

        {/* Legacy businesses */}
        {(regionBizOpen.length > 0 || regionBizClosed.length > 0) && (
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 10px" }}>Legacy Businesses</h3>
            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "2px solid #e8e5e0" }} role="tablist">
              {[
                { key: "open", label: `Still Here (${regionBizOpen.length})` },
                { key: "closed", label: `What We Lost (${regionBizClosed.length})` },
              ].map((tab) => (
                <button key={tab.key} onClick={() => setBizTab(tab.key)} role="tab" aria-selected={bizTab === tab.key} style={{ padding: "6px 14px", fontSize: 12, fontWeight: bizTab === tab.key ? 600 : 400, color: bizTab === tab.key ? "#0f766e" : "#a8a49c", background: "none", border: "none", cursor: "pointer", borderBottom: bizTab === tab.key ? "2px solid #0f766e" : "2px solid transparent", marginBottom: -2, minHeight: 32 }}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div role="tabpanel">
              {bizTab === "open" && (
                regionBizOpen.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#a8a49c", fontStyle: "italic" }}>No legacy businesses recorded.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {regionBizOpen.map((b) => (
                      <div key={b.id} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e8e5e0", cursor: "pointer", background: selectedBiz?.id === b.id ? "#f0fdfa" : "transparent", minHeight: 44 }} onClick={() => setSelectedBiz(b)} role="button" tabIndex={0} aria-label={`${b.name}, est. ${b.est}, ${b.pressure} pressure`} onKeyDown={(e) => { if (e.key === "Enter") setSelectedBiz(b); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 }}>{b.name}</div>
                          <span style={{ fontSize: 10, color: "#a8a49c", whiteSpace: "nowrap", marginLeft: 8 }}>Est. {b.est}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: "#64615b" }}>{b.type}</span>
                          <span style={{ fontSize: 10, color: "#7c6f5e" }}>·</span>
                          <span style={{ fontSize: 10, color: "#7c6f5e" }}>{b.culture}</span>
                          <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                            {pressureDots(b.pressure).map((on, i) => (
                              <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: on ? pressureColor(b.pressure) : "#e8e5e0" }} aria-hidden="true" />
                            ))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
              {bizTab === "closed" && (
                regionBizClosed.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#a8a49c", fontStyle: "italic" }}>No closed legacy businesses recorded.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {regionBizClosed.map((b) => (
                      <div key={b.id} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e8e5e0", cursor: "pointer", background: selectedBiz?.id === b.id ? "#fef2f2" : "transparent", minHeight: 44 }} onClick={() => setSelectedBiz({ ...b, _closed: true })} role="button" tabIndex={0} aria-label={`${b.name}, closed ${b.closed}`} onKeyDown={(e) => { if (e.key === "Enter") setSelectedBiz({ ...b, _closed: true }); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#64615b", lineHeight: 1.3, textDecoration: "line-through", textDecorationColor: "#d6d3cd" }}>{b.name}</div>
                          <span style={{ fontSize: 10, color: "#a8a49c", whiteSpace: "nowrap", marginLeft: 8 }}>{b.est}–{b.closed}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#7c6f5e", marginTop: 2 }}>{b.culture} · {b.type}</div>
                        <div style={{ fontSize: 10, color: "#991b1b", marginTop: 4, fontWeight: 500 }}>Closed: {b.cause}</div>
                        <div style={{ fontSize: 10, color: "#64615b", marginTop: 2 }}>Now: <span style={{ fontWeight: 500 }}>{b.replacedBy}</span></div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Narrative callouts */}
        {narrativeCallouts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {narrativeCallouts.map((c, i) => (
              <div key={i} style={{ background: c.type === "pop_loss" ? "#faf5ff" : "#fffbeb", borderRadius: 8, padding: "12px 14px", borderLeft: `3px solid ${c.type === "pop_loss" ? "#7c3aed" : "#f59e0b"}` }} role="note">
                <p style={{ fontSize: 12, color: "#1a1a1a", margin: 0, lineHeight: 1.55, fontStyle: "italic" }}>{c.text}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.5, padding: "8px 4px" }}>
          Census 1990–2020; ACS 2019–2023. Pre-2010 boundaries approximate. Values between census years interpolated.
        </div>
      </div>
    </div>
  );
}
