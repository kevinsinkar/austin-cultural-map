import { useMemo, useState, useRef, useCallback } from "react";
import _ from "lodash";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { REGIONS_GEOJSON, LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, TIMELINE_INFRA } from "../data";
import { DEMO_COLORS } from "../data/constants";
import { interpolateDvi, getDviColor } from "../utils/math";
import { catColor } from "../utils/formatters";

/* ═══════════════════════════════════════════════════════════
   CULTURE PALETTE  —  used for the Gantt bar strata
   ═══════════════════════════════════════════════════════════ */
const CULTURE_COLORS = {
  "African American":               "#7c3aed",
  "African American Heritage":      "#7c3aed",
  "Mexican American/Latino":        "#d97706",
  "General Austin":                 "#78716c",
  "LGBTQ+":                         "#db2777",
  "Immigrant Community (Vietnamese)":"#0891b2",
  "Immigrant Community (Asian)":    "#0891b2",
  "Country/Americana":              "#b45309",
};

const CULTURE_SORT = [
  "African American", "African American Heritage",
  "Mexican American/Latino", "LGBTQ+",
  "Immigrant Community (Vietnamese)", "Immigrant Community (Asian)",
  "Country/Americana", "General Austin",
];

const CULTURE_LABELS = {
  "African American":          "African American",
  "African American Heritage": "African American",
  "Mexican American/Latino":   "Mexican American / Latino",
  "General Austin":            "General Austin",
  "LGBTQ+":                    "LGBTQ+",
  "Immigrant Community (Vietnamese)": "Immigrant Community",
  "Immigrant Community (Asian)":      "Immigrant Community",
  "Country/Americana":         "Country / Americana",
};

function cultureColor(c)  { return CULTURE_COLORS[c] || "#78716c"; }
function cultureSort(c)   { const i = CULTURE_SORT.indexOf(c); return i >= 0 ? i : 99; }
function cultureLabel(c)  { return CULTURE_LABELS[c] || c; }

/* ── Helper: extract closure year from various field shapes ── */
function closeYear(b) {
  if (typeof b.closed === "number") return b.closed;
  if (b.closureDate) {
    const m = b.closureDate.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════
   LAYOUT CONSTANTS
   ═══════════════════════════════════════════════════════════ */
const YR0       = 1925;
const YR1       = 2026;
const PX_YR     = 48;                            // pixels per year
const MG        = { t: 54, r: 40, b: 44, l: 72 };
const BAR_H     = 3.8;
const BAR_GAP   = 1.2;
const STRATA_GAP= 7;
const RIVER_H   = 14;                            // half-height of center river
const DAM_REACH = 5;                             // years after a dam to highlight closures

const PLOT_W    = (YR1 - YR0) * PX_YR;
const SVG_W     = PLOT_W + MG.l + MG.r;

const x = (yr) => MG.l + (yr - YR0) * PX_YR;    // year → x pixel

/* ═══════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function TimelineView({ tlFilter, setTlFilter, isMobile }) {

  /* ── state ───────────────────────────────────────────── */
  const [hoveredBar,  setHoveredBar]  = useState(null);
  const [selectedBar, setSelectedBar] = useState(null);
  const [hoveredDam,  setHoveredDam]  = useState(null);
  const [actionFilter, setActionFilter] = useState("all");   // all | opened | closed
  const [cultureFilter, setCultureFilter] = useState("all");
  const scrollRef = useRef(null);

  /* ── operating business bar objects ──────────────────── */
  const opBars = useMemo(() =>
    LEGACY_OPERATING
      .map((b) => ({
        ...b, stream: "operating",
        x0: Math.max(b.est, YR0), x1: YR1,
        cs: cultureSort(b.culture), clr: cultureColor(b.culture),
      }))
      .sort((a, b) => a.cs - b.cs || a.est - b.est)
  , []);

  /* ── closed business bar objects ─────────────────────── */
  const clBars = useMemo(() =>
    LEGACY_CLOSED
      .map((b) => {
        const cy = closeYear(b);
        return {
          ...b, stream: "closed",
          x0: Math.max(b.est, YR0), x1: cy || YR1,
          closedYear: cy,
          cs: cultureSort(b.culture), clr: cultureColor(b.culture),
        };
      })
      .filter((b) => b.x1 !== null)
      .sort((a, b) => a.cs - b.cs || a.est - b.est)
  , []);

  /* ── layout: stack bars into strata, compute centerY & SVG height ── */
  const { opLayout, clLayout, centerY, svgH } = useMemo(() => {
    function stack(bars) {
      let y = 0, prev = null;
      return {
        items: bars.map((b) => {
          if (prev && b.culture !== prev) y += STRATA_GAP;
          const ry = y;
          y += BAR_H + BAR_GAP;
          prev = b.culture;
          return { ...b, relY: ry };
        }),
        h: y,
      };
    }
    const op = stack(opBars);
    const cl = stack(clBars);
    const cy = MG.t + op.h + RIVER_H;
    const h  = cy + RIVER_H + cl.h + MG.b;
    return {
      opLayout: op.items.map((b) => ({ ...b, y: cy - RIVER_H - op.h + b.relY })),
      clLayout: cl.items.map((b) => ({ ...b, y: cy + RIVER_H + b.relY })),
      centerY: cy,
      svgH: h,
    };
  }, [opBars, clBars]);

  /* ── infrastructure events (filtered) ────────────────── */
  const dams = useMemo(() =>
    TIMELINE_INFRA.filter((e) => tlFilter === "all" || e.cat === tlFilter)
  , [tlFilter]);

  /* ── river area path (business density over time) ────── */
  const riverD = useMemo(() => {
    const all = [...opBars, ...clBars];
    const pts = _.range(YR0, YR1 + 1).map((yr) => {
      const n = all.filter((b) => b.x0 <= yr && b.x1 >= yr).length;
      return { x: x(yr), n };
    });
    const mx = Math.max(...pts.map((p) => p.n), 1);
    const hw = (p) => (p.n / mx) * RIVER_H;
    const upper = pts.map((p) => `${p.x},${centerY - hw(p)}`).join(" L");
    const lower = [...pts].reverse().map((p) => `${p.x},${centerY + hw(p)}`).join(" L");
    return `M${upper} L${lower} Z`;
  }, [opBars, clBars, centerY]);

  /* ── dam impact set (businesses closing within DAM_REACH years after hovered dam) ── */
  const damImpactIds = useMemo(() => {
    if (!hoveredDam) return new Set();
    const ids = new Set();
    clBars.forEach((b) => {
      if (b.closedYear && b.closedYear >= hoveredDam.year && b.closedYear <= hoveredDam.year + DAM_REACH)
        ids.add(b.id);
    });
    return ids;
  }, [hoveredDam, clBars]);

  /* ── filtered bars for rendering ─────────────────────── */
  const visOp = useMemo(() => {
    if (actionFilter === "closed") return [];
    return opLayout.filter((b) => cultureFilter === "all" || b.culture === cultureFilter);
  }, [opLayout, actionFilter, cultureFilter]);

  const visCl = useMemo(() => {
    if (actionFilter === "opened") return [];
    return clLayout.filter((b) => cultureFilter === "all" || b.culture === cultureFilter);
  }, [clLayout, actionFilter, cultureFilter]);

  /* ── culture legend (de-duped, sorted) ───────────────── */
  const legend = useMemo(() => {
    const seen = new Set();
    const items = [];
    [...opBars, ...clBars].forEach((b) => {
      const c = cultureColor(b.culture);
      if (!seen.has(c)) { seen.add(c); items.push({ culture: b.culture, color: c }); }
    });
    return items.sort((a, b) => cultureSort(a.culture) - cultureSort(b.culture));
  }, [opBars, clBars]);

  /* ── scroll helpers ──────────────────────────────────── */
  const scrollTo = useCallback((yr) => {
    scrollRef.current?.scrollTo({ left: x(yr) - 120, behavior: "smooth" });
  }, []);

  /* ── detail subject ──────────────────────────────────── */
  const detail = hoveredBar || selectedBar;

  /* ═══════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════ */
  return (
    <section aria-label="Timeline view">
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row" }}>

        {/* ─── LEFT: TIMELINE CONTENT ─── */}
        <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "calc(100% - 360px)", minWidth: 0 }}>

          {/* ── Category filters ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64615b" }}>Category:</span>
            {[
              { key: "all", label: "All" },
              { key: "displacement", label: "Displacement" },
              { key: "policy", label: "Policy" },
              { key: "development", label: "Development" },
              { key: "cultural", label: "Cultural" },
              { key: "economic", label: "Economic" },
            ].map((f) => (
              <button key={f.key} onClick={() => setTlFilter(f.key)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", minHeight: 28,
                fontWeight: tlFilter === f.key ? 600 : 400,
                border: tlFilter === f.key ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd",
                background: tlFilter === f.key ? "#f0fdfa" : "#fffffe",
                color: tlFilter === f.key ? "#0f766e" : "#64615b",
              }}>{f.label}</button>
            ))}
          </div>

          {/* ── RIVER TIMELINE CARD ── */}
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginBottom: 12, overflow: "hidden" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h10M7 2v10" stroke="#64615b" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                  River of Time
                </h3>
                <p style={{ fontSize: 11, color: "#a8a49c", margin: 0, maxWidth: 480, lineHeight: 1.4 }}>
                  Horizontal bars show each business's lifespan. <span style={{ color: "#16a34a" }}>▲ Still operating</span> flow above the river; <span style={{ color: "#78716c" }}>▼ closed</span> flow below. Vertical bands mark infrastructure &amp; policy events — <em>hover a band to see businesses that closed within 5 years</em>.
                </p>
              </div>

              {/* Action filter pills */}
              <div style={{ display: "flex", gap: 5 }}>
                {[
                  { key: "all", label: "All" },
                  { key: "opened", label: "Operating" },
                  { key: "closed", label: "Closed" },
                ].map((f) => (
                  <button key={f.key} onClick={() => setActionFilter(f.key)} style={{
                    padding: "3px 10px", borderRadius: 14, fontSize: 10, cursor: "pointer",
                    fontWeight: actionFilter === f.key ? 600 : 400,
                    border: actionFilter === f.key ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd",
                    background: actionFilter === f.key ? "#f0fdfa" : "#fffffe",
                    color: actionFilter === f.key ? "#0f766e" : "#64615b",
                  }}>{f.label}</button>
                ))}
              </div>
            </div>

            {/* ── Decade jump bar ── */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
              {[1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((d) => (
                <button key={d} onClick={() => scrollTo(d)} style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                  border: "1px solid #e8e5e0", background: "#f9f8f7", color: "#64615b",
                  cursor: "pointer", fontFamily: "'Libre Franklin', sans-serif",
                }}>{d}s</button>
              ))}
            </div>

            {/* ── Culture legend ── */}
            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              {legend.map(({ culture, color }) => (
                <button
                  key={color}
                  onClick={() => setCultureFilter(cultureFilter === culture ? "all" : culture)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                    background: "none", border: "none", padding: "2px 4px", borderRadius: 4,
                    opacity: cultureFilter === "all" || cultureFilter === culture ? 1 : 0.35,
                    transition: "opacity .15s",
                  }}
                >
                  <span style={{ width: 10, height: 4, borderRadius: 2, background: color, display: "inline-block" }} />
                  <span style={{ fontSize: 9.5, color: "#44403c", fontWeight: 500 }}>{cultureLabel(culture)}</span>
                </button>
              ))}
            </div>

            {/* ═══ SCROLLABLE SVG ═══ */}
            <div
              ref={scrollRef}
              style={{
                overflowX: "auto", overflowY: "hidden",
                borderRadius: 6, border: "1px solid #f0ede8",
                background: "linear-gradient(180deg, #fafaf9 0%, #fffffe 30%, #fffffe 70%, #fafaf9 100%)",
                scrollbarWidth: "thin", scrollbarColor: "#d6d3cd transparent",
              }}
            >
              <svg
                width={SVG_W}
                height={svgH}
                viewBox={`0 0 ${SVG_W} ${svgH}`}
                style={{ display: "block" }}
                role="img"
                aria-label="River of Time: lifespan bars for Austin legacy businesses with policy event markers"
              >
                {/* ── defs ── */}
                <defs>
                  <linearGradient id="riverGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity="0.08" />
                    <stop offset="50%" stopColor="#0f766e" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="fadeRight" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity="1" />
                    <stop offset="80%" stopColor="#16a34a" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0.15" />
                  </linearGradient>
                  <filter id="damGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* ── year grid lines & labels ── */}
                {_.range(1930, YR1 + 1, 5).map((yr) => {
                  const px = x(yr);
                  const isMajor = yr % 10 === 0;
                  return (
                    <g key={`grid-${yr}`}>
                      <line
                        x1={px} y1={MG.t - 10} x2={px} y2={svgH - MG.b + 10}
                        stroke={isMajor ? "#e0ddd7" : "#f0ede8"}
                        strokeWidth={isMajor ? 1 : 0.5}
                      />
                      {isMajor && (
                        <text
                          x={px} y={svgH - MG.b + 28}
                          textAnchor="middle"
                          style={{ fontSize: 10, fontWeight: 600, fill: "#a8a49c", fontFamily: "'Libre Franklin', sans-serif" }}
                        >
                          {yr}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* ── stream labels (left margin) ── */}
                <text x={MG.l - 8} y={centerY - RIVER_H - 12} textAnchor="end" style={{ fontSize: 9, fontWeight: 600, fill: "#16a34a", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Libre Franklin', sans-serif" }}>
                  ▲ Operating
                </text>
                <text x={MG.l - 8} y={centerY + RIVER_H + 16} textAnchor="end" style={{ fontSize: 9, fontWeight: 600, fill: "#a8a49c", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Libre Franklin', sans-serif" }}>
                  ▼ Closed
                </text>

                {/* ── center river ── */}
                <path d={riverD} fill="url(#riverGrad)" />
                <line x1={MG.l} y1={centerY} x2={SVG_W - MG.r} y2={centerY} stroke="#0f766e" strokeWidth={0.8} strokeOpacity={0.25} />

                {/* ── infrastructure DAMS ── */}
                {dams.map((ev, i) => {
                  const px = x(ev.year);
                  const isHovered = hoveredDam === ev;
                  const cc = catColor(ev.cat);
                  return (
                    <g key={`dam-${i}`}>
                      {/* Impact zone highlight (5-year band after dam) */}
                      {isHovered && (
                        <rect
                          x={px} y={MG.t - 10}
                          width={DAM_REACH * PX_YR}
                          height={svgH - MG.t - MG.b + 20}
                          fill={cc} fillOpacity={0.04}
                          rx={2}
                        />
                      )}
                      {/* Dam line */}
                      <line
                        x1={px} y1={MG.t - 10} x2={px} y2={svgH - MG.b + 10}
                        stroke={cc}
                        strokeWidth={isHovered ? 2 : 1}
                        strokeOpacity={isHovered ? 0.7 : 0.2}
                        strokeDasharray={isHovered ? "none" : "4 3"}
                        filter={isHovered ? "url(#damGlow)" : undefined}
                        style={{ transition: "all .15s ease" }}
                      />
                      {/* Dam label (top) */}
                      <g transform={`translate(${px}, ${MG.t - 14})`}>
                        <text
                          textAnchor="start"
                          transform="rotate(-42)"
                          style={{
                            fontSize: isHovered ? 8.5 : 7.5,
                            fontWeight: isHovered ? 700 : 500,
                            fill: isHovered ? cc : "#a8a49c",
                            fontFamily: "'Libre Franklin', sans-serif",
                            transition: "all .15s ease",
                            pointerEvents: "none",
                          }}
                        >
                          {ev.label.length > 38 ? ev.label.slice(0, 36) + "…" : ev.label}
                        </text>
                      </g>
                      {/* Category dot at river center */}
                      <circle
                        cx={px} cy={centerY} r={isHovered ? 5 : 3.5}
                        fill={cc}
                        fillOpacity={isHovered ? 1 : 0.6}
                        stroke="#fffffe" strokeWidth={1.5}
                        style={{ transition: "all .15s ease" }}
                      />
                      {/* Invisible wider hitbox */}
                      <rect
                        x={px - 8} y={MG.t - 10}
                        width={16} height={svgH - MG.t - MG.b + 20}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => { setHoveredDam(ev); setHoveredBar(null); }}
                        onMouseLeave={() => setHoveredDam(null)}
                      />
                    </g>
                  );
                })}

                {/* ── dam → closure connection lines ── */}
                {hoveredDam && visCl.filter((b) => damImpactIds.has(b.id)).map((b) => {
                  const dx = x(hoveredDam.year);
                  const bx = x(b.x1);
                  const by = b.y + BAR_H / 2;
                  const mx = (dx + bx) / 2;
                  return (
                    <path
                      key={`conn-${b.id}`}
                      d={`M${dx},${centerY} Q${mx},${by} ${bx},${by}`}
                      fill="none"
                      stroke={catColor(hoveredDam.cat)}
                      strokeWidth={1}
                      strokeOpacity={0.35}
                      strokeDasharray="3 2"
                    />
                  );
                })}

                {/* ── OPERATING bars (above river) ── */}
                {visOp.map((b) => {
                  const bx = x(b.x0);
                  const bw = x(b.x1) - bx;
                  const isActive = hoveredBar === b || selectedBar === b;
                  const isDimmed = hoveredDam && !isActive;
                  return (
                    <g key={`op-${b.id}`}>
                      <rect
                        x={bx} y={b.y} width={bw} height={BAR_H}
                        rx={1.5}
                        fill={b.clr}
                        fillOpacity={isDimmed ? 0.12 : isActive ? 1 : 0.65}
                        stroke={isActive ? b.clr : "none"}
                        strokeWidth={isActive ? 1 : 0}
                        style={{ transition: "fill-opacity .15s, stroke-width .15s", cursor: "pointer" }}
                        onMouseEnter={() => { setHoveredBar(b); setHoveredDam(null); }}
                        onMouseLeave={() => setHoveredBar(null)}
                        onClick={() => setSelectedBar(selectedBar === b ? null : b)}
                      />
                      {/* Ongoing indicator: pulsing dot at right end */}
                      {isActive && (
                        <circle cx={x(b.x1)} cy={b.y + BAR_H / 2} r={2.5} fill="#16a34a" fillOpacity={0.8}>
                          <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="fillOpacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  );
                })}

                {/* ── CLOSED bars (below river) ── */}
                {visCl.map((b) => {
                  const bx = x(b.x0);
                  const bw = Math.max(x(b.x1) - bx, 2);  // min 2px width
                  const isActive = hoveredBar === b || selectedBar === b;
                  const isDamImpact = hoveredDam && damImpactIds.has(b.id);
                  const isDimmed = hoveredDam && !isDamImpact && !isActive;
                  return (
                    <g key={`cl-${b.id}`}>
                      <rect
                        x={bx} y={b.y} width={bw} height={BAR_H}
                        rx={1.5}
                        fill={isDamImpact ? catColor(hoveredDam.cat) : b.clr}
                        fillOpacity={isDimmed ? 0.08 : isDamImpact ? 0.9 : isActive ? 1 : 0.45}
                        stroke={isActive ? b.clr : isDamImpact ? catColor(hoveredDam.cat) : "none"}
                        strokeWidth={isActive || isDamImpact ? 1 : 0}
                        style={{ transition: "all .15s ease", cursor: "pointer" }}
                        onMouseEnter={() => { setHoveredBar(b); setHoveredDam(null); }}
                        onMouseLeave={() => setHoveredBar(null)}
                        onClick={() => setSelectedBar(selectedBar === b ? null : b)}
                      />
                      {/* Closure × mark at right end */}
                      {(isActive || isDamImpact) && (
                        <g transform={`translate(${x(b.x1)},${b.y + BAR_H / 2})`}>
                          <line x1={-2} y1={-2} x2={2} y2={2} stroke={isDamImpact ? catColor(hoveredDam.cat) : "#dc2626"} strokeWidth={1.2} />
                          <line x1={2} y1={-2} x2={-2} y2={2} stroke={isDamImpact ? catColor(hoveredDam.cat) : "#dc2626"} strokeWidth={1.2} />
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* ── hover tooltip label inside SVG ── */}
                {hoveredBar && (() => {
                  const bx = x(hoveredBar.x0);
                  const by = hoveredBar.y;
                  const labelX = bx + 4;
                  const labelY = hoveredBar.stream === "operating" ? by - 4 : by + BAR_H + 10;
                  return (
                    <g style={{ pointerEvents: "none" }}>
                      <rect
                        x={labelX - 3} y={labelY - 9}
                        width={Math.min(hoveredBar.name.length * 5.2 + 8, 200)} height={14}
                        rx={3} fill="#1a1a1a" fillOpacity={0.88}
                      />
                      <text x={labelX} y={labelY} style={{ fontSize: 8.5, fill: "#fff", fontWeight: 600, fontFamily: "'Libre Franklin', sans-serif" }}>
                        {hoveredBar.name} ({hoveredBar.est}{hoveredBar.closedYear ? `–${hoveredBar.closedYear}` : "–"})
                      </text>
                    </g>
                  );
                })()}

                {/* ── dam hover count badge ── */}
                {hoveredDam && damImpactIds.size > 0 && (() => {
                  const dx = x(hoveredDam.year);
                  return (
                    <g>
                      <circle cx={dx + DAM_REACH * PX_YR / 2} cy={centerY + RIVER_H + 8} r={10} fill={catColor(hoveredDam.cat)} fillOpacity={0.9} />
                      <text x={dx + DAM_REACH * PX_YR / 2} y={centerY + RIVER_H + 12} textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, fill: "#fff", fontFamily: "'Libre Franklin', sans-serif" }}>
                        {damImpactIds.size}
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>

          {/* ── Aggregate Demographic Track ── */}
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

          {/* ── DVI Heatmap ── */}
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>DVI Heatmap by Region &amp; Period</h3>
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

        {/* ─── RIGHT: DETAIL PANEL ─── */}
        <div className="detail-panel" style={{ flex: "1 1 0", minWidth: isMobile ? 0 : 320, maxHeight: isMobile ? "none" : "calc(100vh - 100px)", overflowY: "auto", position: isMobile ? "static" : "sticky", top: 16 }} role="region" aria-label="Detail card">

          {/* ── Dam (infrastructure) detail ── */}
          {hoveredDam ? (
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: 20, lineHeight: 1.4 }} className="biz-card-enter">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: catColor(hoveredDam.cat) }} />
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: catColor(hoveredDam.cat) }}>{hoveredDam.cat}</span>
              </div>
              <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{hoveredDam.year}</div>
              <div style={{ fontSize: 14, color: "#44403c", marginBottom: 10 }}>{hoveredDam.label}</div>
              <div style={{ fontSize: 12, color: "#64615b", lineHeight: 1.6, marginBottom: 12 }}>{hoveredDam.summary}</div>
              {damImpactIds.size > 0 && (
                <div style={{ background: "#fef2f2", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#991b1b", marginBottom: 6 }}>
                    {damImpactIds.size} business{damImpactIds.size !== 1 ? "es" : ""} closed within {DAM_REACH} years
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {clBars.filter((b) => damImpactIds.has(b.id)).slice(0, 8).map((b) => (
                      <div key={b.id} style={{ fontSize: 11, color: "#64615b", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 6, height: 3, borderRadius: 1, background: b.clr, flexShrink: 0 }} />
                        <span>{b.name}</span>
                        <span style={{ color: "#a8a49c", marginLeft: "auto", fontSize: 10 }}>
                          {b.closedYear}
                        </span>
                      </div>
                    ))}
                    {damImpactIds.size > 8 && (
                      <div style={{ fontSize: 10, color: "#a8a49c", fontStyle: "italic" }}>
                        +{damImpactIds.size - 8} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : detail ? (
            /* ── Business detail ── */
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: 20, lineHeight: 1.4 }} className="biz-card-enter">
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ width: 10, height: 4, borderRadius: 2, background: cultureColor(detail.culture) }} />
                <span style={{ fontSize: 10, fontWeight: 500, color: "#a8a49c" }}>{cultureLabel(detail.culture)}</span>
              </div>
              <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "#1a1a1a" }}>{detail.name}</h2>

              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                  background: detail.stream === "operating" ? "#f0fdf4" : "#faf8f7",
                  color: detail.stream === "operating" ? "#16a34a" : "#78716c",
                }}>
                  Est. {detail.est}
                </span>
                {detail.closedYear && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#fef2f2", color: "#dc2626" }}>
                    Closed {detail.closedYear}
                  </span>
                )}
                {detail.stream === "operating" && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#f0fdf4", color: "#16a34a" }}>
                    Still operating
                  </span>
                )}
              </div>

              {/* Lifespan bar */}
              <div style={{ background: "#f9f8f7", borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: "#a8a49c", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Lifespan</div>
                <div style={{ position: "relative", height: 6, background: "#e8e5e0", borderRadius: 3 }}>
                  <div style={{
                    position: "absolute", left: `${((detail.x0 - YR0) / (YR1 - YR0)) * 100}%`,
                    width: `${(((detail.x1 || YR1) - detail.x0) / (YR1 - YR0)) * 100}%`,
                    height: "100%", borderRadius: 3,
                    background: detail.stream === "operating" ? "#16a34a" : "#a8a49c",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#a8a49c", marginTop: 3 }}>
                  <span>{YR0}</span>
                  <span style={{ fontWeight: 600, color: "#44403c" }}>
                    {detail.closedYear ? `${detail.closedYear - detail.est} years` : `${YR1 - detail.est}+ years`}
                  </span>
                  <span>{YR1}</span>
                </div>
              </div>

              {detail.region && <DetailRow label="Region" value={detail.region} />}
              {detail.address && <DetailRow label="Address" value={detail.address} />}
              {detail.type && <DetailRow label="Type" value={detail.type} />}
              {detail.ownership && <DetailRow label="Ownership" value={detail.ownership} />}
              {detail.cause && <DetailRow label="Cause of closure" value={detail.cause} />}
              {detail.replacedBy && <DetailRow label="Replaced by" value={detail.replacedBy} />}
              {detail.notes && (
                <div style={{ fontSize: 12, color: "#44403c", lineHeight: 1.5, marginTop: 8, padding: "8px 10px", background: "#fafaf9", borderRadius: 6, fontStyle: "italic" }}>
                  {detail.notes}
                </div>
              )}
              {selectedBar && (
                <button onClick={() => setSelectedBar(null)} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 6, border: "1px solid #d6d3cd", background: "#fff", color: "#44403c", cursor: "pointer", fontSize: 11 }}>
                  Deselect
                </button>
              )}
            </div>
          ) : (
            /* ── Empty state ── */
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.15 }} aria-hidden="true">〰️</div>
              <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Explore the River</div>
              <div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>
                Hover a <strong>bar</strong> to see a business's story, or hover a <strong>vertical band</strong> to see how policy events correlate with closures.
              </div>
            </div>
          )}

          {/* ── Summary stats ── */}
          <div style={{ background: "#fafaf9", borderRadius: 10, border: "1px solid #e8e5e0", padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>At a glance</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <StatBox label="Operating" value={LEGACY_OPERATING.length} color="#16a34a" bg="#f0fdf4" />
              <StatBox label="Closed" value={LEGACY_CLOSED.length} color="#78716c" bg="#faf8f7" />
              <StatBox label="Policy Events" value={TIMELINE_INFRA.length} color="#7c3aed" bg="#faf5ff" />
              <StatBox label="Oldest Est." value={Math.min(...LEGACY_OPERATING.map((b) => b.est))} color="#b45309" bg="#fefce8" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Small helper components ── */

function DetailRow({ label, value }) {
  return (
    <div style={{ fontSize: 12, color: "#64615b", marginBottom: 4, lineHeight: 1.4 }}>
      <strong style={{ color: "#44403c" }}>{label}:</strong> {value}
    </div>
  );
}

function StatBox({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}