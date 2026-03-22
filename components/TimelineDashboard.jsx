import { useMemo, useState, useRef, useCallback } from "react";
import _ from "lodash";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
} from "recharts";
import { DEMOGRAPHICS } from "../data";
import { VISIBLE_REGIONS } from "../data/regionLookup";
import { DEMO_COLORS } from "../data/constants";
import { interpolateDvi, getDviColor } from "../utils/math";
import { catColor } from "../utils/formatters";
import { cultureColor, cultureSort, closeYear } from "./TimelineView";

// ── Non-linear time axis ──
const TIME_SEGMENTS = [
  { start: 1925, end: 1970, widthPct: 0.12 },
  { start: 1970, end: 1997, widthPct: 0.18 },
  { start: 1997, end: 2010, widthPct: 0.28 },
  { start: 2010, end: 2026, widthPct: 0.42 },
];

function buildTimeScale(totalWidth) {
  let px = 0;
  const segments = TIME_SEGMENTS.map(seg => {
    const segWidth = seg.widthPct * totalWidth;
    const pxStart = px;
    const scale = (yr) => pxStart + ((yr - seg.start) / (seg.end - seg.start)) * segWidth;
    const result = { ...seg, pxStart, pxEnd: px + segWidth, scale };
    px += segWidth;
    return result;
  });

  const forward = (yr) => {
    const seg = segments.find(s => yr >= s.start && yr < s.end) || segments[segments.length - 1];
    return seg.scale(Math.min(yr, seg.end));
  };

  const inverse = (pxVal) => {
    const seg = segments.find(s => pxVal >= s.pxStart && pxVal < s.pxEnd) || segments[segments.length - 1];
    const segWidth = seg.pxEnd - seg.pxStart;
    const frac = (pxVal - seg.pxStart) / segWidth;
    return seg.start + frac * (seg.end - seg.start);
  };

  return { forward, inverse };
}

const BAR_H = 6;
const BAR_GAP = 1.5;
const STRATA_GAP = 8;
const DAM_REACH = 5;

const AXIS_TICKS = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 1997, 2000, 2005, 2010, 2015, 2020, 2025];

export default function TimelineDashboard({
  eras, events, opBars, clBars, focusEra,
  hoveredItem, setHoveredItem, selectedItem, setSelectedItem,
}) {
  const containerRef = useRef(null);
  const [crosshairYear, setCrosshairYear] = useState(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [dviRegion, setDviRegion] = useState(84); // Default: Chestnut (East Austin)

  // Measure container
  const measuredRef = useCallback(node => {
    if (node) {
      containerRef.current = node;
      setContainerWidth(node.clientWidth);
      const obs = new ResizeObserver(entries => {
        setContainerWidth(entries[0].contentRect.width);
      });
      obs.observe(node);
    }
  }, []);

  const { forward: timeScale, inverse: inverseTimeScale } = useMemo(
    () => buildTimeScale(containerWidth), [containerWidth]
  );

  // Stack all business bars
  const { allBars, bizTrackHeight } = useMemo(() => {
    const all = [...opBars, ...clBars].sort(
      (a, b) => cultureSort(a.culture) - cultureSort(b.culture) || a.est - b.est
    );
    let y = 0, prevCulture = null;
    const items = all.map(b => {
      if (prevCulture && b.culture !== prevCulture) y += STRATA_GAP;
      const ry = y;
      y += BAR_H + BAR_GAP;
      prevCulture = b.culture;
      return { ...b, barY: ry };
    });
    return { allBars: items, bizTrackHeight: Math.max(y, 40) };
  }, [opBars, clBars]);

  // Aggregate demographics
  const demoData = useMemo(() => {
    const years = [...new Set(DEMOGRAPHICS.map(d => d.year))].sort((a, b) => a - b);
    return years.map(yr => {
      const rows = DEMOGRAPHICS.filter(d => d.year === yr);
      const t = _.sumBy(rows, "total");
      if (t === 0) return null;
      const Black = _.sumBy(rows, "popBlack") / t;
      const Hispanic = _.sumBy(rows, "popHispanic") / t;
      const White = _.sumBy(rows, "popWhite") / t;
      const Asian = _.sumBy(rows, r => (r.pctAsian || 0) * r.total) / t;
      return { year: yr, Black, Hispanic, White, Asian, Other: Math.max(0, 1 - Black - Hispanic - White - Asian) };
    }).filter(Boolean);
  }, []);

  // Track heights
  const policyH = 60;
  const demoH = 100;
  const dviH = 30;
  const axisH = 30;
  const gap = 8;
  const totalH = policyH + gap + bizTrackHeight + gap + demoH + gap + dviH + axisH;

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const yr = inverseTimeScale(px);
    setCrosshairYear(Math.round(Math.min(Math.max(yr, 1925), 2026)));
  };

  // Hovered event impact zone
  const hoveredEventYear = hoveredItem?.cat ? hoveredItem.year : null;

  // Region options for DVI strip
  const regionOptions = useMemo(() => {
    return [
      { id: 84, name: "East Austin (Chestnut)" },
      { id: 85, name: "Central East Austin" },
      { id: 2, name: "North Loop" },
      { id: 129, name: "South Lamar" },
      { id: 100, name: "Barton Hills" },
    ];
  }, []);

  return (
    <div ref={measuredRef} style={{ position: "relative" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCrosshairYear(null)}
    >
      {/* Non-linear axis note */}
      <div style={{ fontSize: 9, color: "#a8a49c", fontStyle: "italic", marginBottom: 8 }}>
        Time axis is non-linear \u2014 recent decades are expanded to show more detail.
      </div>

      <svg width={containerWidth} height={totalH} style={{ overflow: "visible" }}>
        {/* Era background bands */}
        {eras.map(era => {
          const x0 = timeScale(era.years[0]);
          const x1 = timeScale(era.years[1]);
          const isFocused = focusEra?.id === era.id;
          return (
            <rect key={era.id}
              x={x0} y={0} width={x1 - x0} height={totalH - axisH}
              fill={isFocused ? "#0f766e" : "#000"}
              fillOpacity={isFocused ? 0.06 : 0.02}
              stroke="#e8e5e0" strokeWidth={0.5}
            />
          );
        })}

        {/* Hovered event impact zone */}
        {hoveredEventYear && (
          <rect
            x={timeScale(hoveredEventYear)} y={0}
            width={timeScale(hoveredEventYear + DAM_REACH) - timeScale(hoveredEventYear)}
            height={totalH - axisH}
            fill="#dc2626" fillOpacity={0.06}
          />
        )}

        {/* Crosshair */}
        {crosshairYear && (
          <>
            <line
              x1={timeScale(crosshairYear)} y1={0}
              x2={timeScale(crosshairYear)} y2={totalH - axisH}
              stroke="#0f766e" strokeWidth={1} strokeOpacity={0.5}
              strokeDasharray="4 3" pointerEvents="none"
            />
            <text x={timeScale(crosshairYear)} y={-4} textAnchor="middle"
              style={{ fontSize: 10, fill: "#0f766e", fontWeight: 600 }}>{crosshairYear}</text>
          </>
        )}

        {/* ── Track 1: Policy ── */}
        <g transform={`translate(0, 0)`}>
          <text x={4} y={10} style={{ fontSize: 8, fill: "#a8a49c", fontWeight: 600, textTransform: "uppercase" }}>Policy</text>
          {events.map((ev, i) => {
            const px = timeScale(ev.year);
            const isHovered = hoveredItem === ev || selectedItem === ev;
            return (
              <g key={i}
                onMouseEnter={() => setHoveredItem(ev)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => setSelectedItem(selectedItem === ev ? null : ev)}
                style={{ cursor: "pointer" }}>
                <polygon
                  points={`${px - 5},18 ${px + 5},18 ${px},28`}
                  fill={catColor(ev.cat)}
                  fillOpacity={isHovered ? 1 : 0.7}
                />
                <text x={px} y={40} textAnchor="middle"
                  style={{ fontSize: 7, fill: "#64615b", fontWeight: 500 }}>
                  {ev.label.length > 22 ? ev.label.slice(0, 20) + "\u2026" : ev.label}
                </text>
                <text x={px} y={50} textAnchor="middle"
                  style={{ fontSize: 6.5, fill: "#a8a49c" }}>{ev.year}</text>
              </g>
            );
          })}
        </g>

        {/* ── Track 2: Business Lifespans ── */}
        <g transform={`translate(0, ${policyH + gap})`}>
          <text x={4} y={-2} style={{ fontSize: 8, fill: "#a8a49c", fontWeight: 600, textTransform: "uppercase" }}>Businesses</text>
          {allBars.map((b, i) => {
            const bx0 = timeScale(b.x0);
            const bx1 = timeScale(Math.min(b.x1, 2026));
            const isHovered = hoveredItem === b || selectedItem === b;
            const isClosed = b.stream === "closed";
            return (
              <g key={b.id || i}
                onMouseEnter={() => setHoveredItem(b)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => setSelectedItem(selectedItem === b ? null : b)}
                style={{ cursor: "pointer" }}>
                <rect
                  x={bx0} y={b.barY} width={Math.max(bx1 - bx0, 2)} height={BAR_H}
                  rx={1.5} fill={b.clr}
                  fillOpacity={isHovered ? 1 : 0.7}
                  stroke={isHovered ? "#1a1a1a" : "none"}
                  strokeWidth={isHovered ? 1 : 0}
                />
                {!isClosed && (
                  <circle cx={bx1} cy={b.barY + BAR_H / 2} r={2.5} fill="#16a34a" />
                )}
                {isClosed && b.closedYear && (
                  <text x={bx1 + 1} y={b.barY + BAR_H / 2 + 3} style={{ fontSize: 7, fill: "#dc2626", fontWeight: 700 }}>{"\u2715"}</text>
                )}
              </g>
            );
          })}
        </g>

        {/* ── Track 3: Demographics (rendered outside SVG as Recharts) — placeholder rect ── */}
        <g transform={`translate(0, ${policyH + gap + bizTrackHeight + gap})`}>
          <text x={4} y={-2} style={{ fontSize: 8, fill: "#a8a49c", fontWeight: 600, textTransform: "uppercase" }}>Demographics (city-wide)</text>
        </g>

        {/* ── Track 4: DVI Heatstrip ── */}
        <g transform={`translate(0, ${policyH + gap + bizTrackHeight + gap + demoH + gap})`}>
          <text x={4} y={-2} style={{ fontSize: 8, fill: "#a8a49c", fontWeight: 600, textTransform: "uppercase" }}>DVI</text>
          {_.range(1990, 2024).map(yr => {
            const dvi = interpolateDvi(dviRegion, yr);
            const px = timeScale(yr);
            const nextPx = timeScale(yr + 1);
            return (
              <rect key={yr}
                x={px} y={0} width={Math.max(nextPx - px, 1)} height={dviH}
                fill={getDviColor(dvi)} fillOpacity={0.85}
              />
            );
          })}
        </g>

        {/* ── Time axis ── */}
        <g transform={`translate(0, ${totalH - axisH + 5})`}>
          <line x1={0} y1={0} x2={containerWidth} y2={0} stroke="#e8e5e0" strokeWidth={1} />
          {AXIS_TICKS.map(yr => (
            <g key={yr}>
              <line x1={timeScale(yr)} y1={0} x2={timeScale(yr)} y2={5} stroke="#a8a49c" strokeWidth={0.5} />
              <text x={timeScale(yr)} y={16} textAnchor="middle"
                style={{ fontSize: yr % 10 === 0 ? 9 : 7.5, fontWeight: yr % 10 === 0 ? 600 : 400, fill: "#a8a49c" }}>
                {yr}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Demographics track (Recharts overlay positioned absolutely) */}
      <div style={{
        position: "absolute",
        top: policyH + gap + bizTrackHeight + gap + 10,
        left: 0, right: 0, height: demoH - 10,
        pointerEvents: "none",
      }}>
        <ResponsiveContainer>
          <AreaChart data={demoData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="year" hide />
            <YAxis hide domain={[0, 1]} />
            <Area type="monotone" dataKey="Other" stackId="1" stroke="none" fill={DEMO_COLORS.Other} fillOpacity={0.8} />
            <Area type="monotone" dataKey="Asian" stackId="1" stroke="none" fill={DEMO_COLORS.Asian} fillOpacity={0.8} />
            <Area type="monotone" dataKey="Hispanic" stackId="1" stroke="none" fill={DEMO_COLORS.Hispanic} fillOpacity={0.8} />
            <Area type="monotone" dataKey="Black" stackId="1" stroke="none" fill={DEMO_COLORS.Black} fillOpacity={0.8} />
            <Area type="monotone" dataKey="White" stackId="1" stroke="none" fill={DEMO_COLORS.White} fillOpacity={0.8} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* DVI region selector */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "#a8a49c" }}>DVI region:</span>
        <select
          value={dviRegion}
          onChange={(e) => setDviRegion(+e.target.value)}
          style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid #d6d3cd", background: "#fffffe", color: "#1a1a1a", cursor: "pointer" }}
        >
          {regionOptions.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
