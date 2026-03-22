import { useMemo } from "react";
import _ from "lodash";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
} from "recharts";
import { DEMOGRAPHICS } from "../data";
import { DEMO_COLORS } from "../data/constants";
import { interpolateDvi, getDviColor } from "../utils/math";
import { catColor } from "../utils/formatters";
import { cultureColor, cultureSort, closeYear } from "./TimelineView";

const BAR_H = 8;
const BAR_GAP = 2;
const STRATA_GAP = 10;
const DAM_REACH = 5;

function nearestYear(yr, available) {
  return available.reduce((best, y) => Math.abs(y - yr) < Math.abs(best - yr) ? y : best, available[0]);
}

function generateEraSummary(era, opBars, clBars, events) {
  const eraClosures = clBars.filter(b => {
    const cy = closeYear(b);
    return cy && cy >= era.years[0] && cy < era.years[1];
  });
  const eraOpenings = [...opBars, ...clBars].filter(b =>
    b.est >= era.years[0] && b.est < era.years[1]
  );
  const eraEvents = events.filter(e =>
    e.year >= era.years[0] && e.year < era.years[1]
  );

  const parts = [];
  if (eraOpenings.length > 0) parts.push(`${eraOpenings.length} tracked businesses opened`);
  if (eraClosures.length > 0) parts.push(`${eraClosures.length} closed`);
  if (eraEvents.length > 0) parts.push(`${eraEvents.length} policy/infrastructure events occurred`);

  // Dominant closure causes
  if (eraClosures.length > 0) {
    const causes = _.countBy(eraClosures.filter(b => b.cause), "cause");
    const top = Object.entries(causes).sort((a, b) => b[1] - a[1])[0];
    if (top) parts.push(`top closure cause: ${top[0].toLowerCase()}`);
  }

  if (parts.length === 0) return `${era.years[0]}\u2013${era.years[1]}: limited tracked business activity in this era.`;
  return `Between ${era.years[0]} and ${era.years[1]}, ${parts.join(". ")}.`;
}

export default function TimelineEras({
  eras, events, opBars, clBars,
  hoveredItem, setHoveredItem, selectedItem, setSelectedItem,
  onViewInDashboard,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {eras.map(era => (
        <EraCard
          key={era.id}
          era={era}
          events={events.filter(e => e.year >= era.years[0] && e.year < era.years[1])}
          opBars={opBars}
          clBars={clBars}
          allEvents={events}
          hoveredItem={hoveredItem}
          setHoveredItem={setHoveredItem}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
          onViewInDashboard={onViewInDashboard}
        />
      ))}
    </div>
  );
}

function EraCard({
  era, events, opBars, clBars, allEvents,
  hoveredItem, setHoveredItem, selectedItem, setSelectedItem,
  onViewInDashboard,
}) {
  // Filter businesses active during this era
  const eraBiz = useMemo(() => {
    const all = [...opBars, ...clBars].filter(b =>
      b.x0 < era.years[1] && (b.x1 || 2026) > era.years[0]
    );
    return all.sort((a, b) => cultureSort(a.culture) - cultureSort(b.culture) || a.est - b.est);
  }, [opBars, clBars, era]);

  // Stack bars into rows
  const { bars, trackHeight } = useMemo(() => {
    let y = 0, prevCulture = null;
    const items = eraBiz.map(b => {
      if (prevCulture && b.culture !== prevCulture) y += STRATA_GAP;
      const ry = y;
      y += BAR_H + BAR_GAP;
      prevCulture = b.culture;
      return { ...b, barY: ry };
    });
    return { bars: items, trackHeight: Math.max(y, 30) };
  }, [eraBiz]);

  // Demographic context data
  const contextData = useMemo(() => {
    const availableYears = [...new Set(DEMOGRAPHICS.map(d => d.year))].sort((a, b) => a - b);
    const eraYears = availableYears.filter(y => y >= era.years[0] && y <= era.years[1]);
    if (eraYears.length === 0) {
      // Use nearest years
      eraYears.push(nearestYear(era.years[0], availableYears));
      eraYears.push(nearestYear(era.years[1], availableYears));
    }
    return eraYears.map(yr => {
      const rows = DEMOGRAPHICS.filter(d => d.year === yr);
      const t = _.sumBy(rows, "total");
      if (t === 0) return null;
      return {
        year: yr,
        Black: _.sumBy(rows, "popBlack") / t,
        Hispanic: _.sumBy(rows, "popHispanic") / t,
        White: _.sumBy(rows, "popWhite") / t,
        Asian: _.sumBy(rows, r => (r.pctAsian || 0) * r.total) / t,
        Other: 0,
      };
    }).filter(Boolean).map(d => ({
      ...d,
      Other: Math.max(0, 1 - d.Black - d.Hispanic - d.White - d.Asian),
    }));
  }, [era]);

  // DVI annotation
  const dviAnnotation = useMemo(() => {
    const regionId = 84; // Chestnut (East Austin)
    const start = interpolateDvi(regionId, Math.max(era.years[0], 1990));
    const end = interpolateDvi(regionId, Math.min(era.years[1], 2023));
    return { start: start?.toFixed(0), end: end?.toFixed(0) };
  }, [era]);

  // Era summary
  const summary = useMemo(() =>
    generateEraSummary(era, opBars, clBars, allEvents),
    [era, opBars, clBars, allEvents]
  );

  // Policy-to-closure connections
  const connections = useMemo(() => {
    const conns = [];
    events.forEach(ev => {
      bars.forEach(b => {
        const cy = closeYear(b);
        if (cy && cy >= ev.year && cy <= ev.year + DAM_REACH) {
          conns.push({ event: ev, business: b, closedYear: cy });
        }
      });
    });
    return conns;
  }, [events, bars]);

  const xScale = (yr) => {
    const span = era.years[1] - era.years[0];
    return ((yr - era.years[0]) / span) * 100; // percentage
  };

  const MG = { l: 0, r: 10 };
  const policyTrackH = Math.max(events.length * 28 + 10, 50);

  return (
    <div style={{ background: "#fffffe", borderRadius: 12, border: "1px solid #e8e5e0", padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
      {/* Era header */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>{era.title}</h3>
        <div style={{ fontSize: 12, color: "#7c6f5e", marginTop: 2 }}>{era.subtitle}</div>
        <div style={{ fontSize: 11, color: "#a8a49c", marginTop: 2 }}>{era.years[0]}\u2013{era.years[1]}</div>
        <p style={{ fontSize: 12, color: "#44403c", margin: "8px 0 0", lineHeight: 1.6, maxWidth: 700 }}>{era.context}</p>
      </div>

      {/* Time axis labels */}
      <div style={{ position: "relative", height: 20, marginBottom: 4, borderBottom: "1px solid #e8e5e0" }}>
        {_.range(era.years[0], era.years[1] + 1, era.years[1] - era.years[0] > 30 ? 10 : 5).map(yr => (
          <span key={yr} style={{ position: "absolute", left: `${xScale(yr)}%`, transform: "translateX(-50%)", fontSize: 10, color: "#a8a49c", fontWeight: yr % 10 === 0 ? 600 : 400 }}>{yr}</span>
        ))}
      </div>

      {/* Policy track */}
      <div style={{ position: "relative", minHeight: policyTrackH, marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Policy &amp; Infrastructure</div>
        {events.map((ev, i) => {
          const impactCount = clBars.filter(b => {
            const cy = closeYear(b);
            return cy && cy >= ev.year && cy <= ev.year + DAM_REACH;
          }).length;
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredItem(ev)}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={() => setSelectedItem(selectedItem === ev ? null : ev)}
              style={{
                position: "absolute",
                left: `${xScale(ev.year)}%`,
                top: i * 28 + 20,
                transform: "translateX(-50%)",
                cursor: "pointer",
                maxWidth: 180,
                zIndex: hoveredItem === ev ? 10 : 1,
              }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 6,
                background: hoveredItem === ev || selectedItem === ev ? "#f0fdfa" : "#fafaf9",
                border: `1px solid ${hoveredItem === ev || selectedItem === ev ? "#0f766e" : "#e8e5e0"}`,
                whiteSpace: "nowrap",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: catColor(ev.cat), flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#1a1a1a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ev.label.length > 30 ? ev.label.slice(0, 28) + "\u2026" : ev.label}
                </span>
                <span style={{ fontSize: 8, color: "#a8a49c" }}>{ev.year}</span>
                {impactCount > 0 && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#dc2626", background: "#fee2e2", borderRadius: 4, padding: "0 4px" }}>
                    {impactCount}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Business track */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Business Lifespans</div>
        <svg width="100%" height={trackHeight} style={{ overflow: "visible" }}>
          {/* Connection lines from policy events to closures */}
          {connections.map((conn, i) => {
            const evX = xScale(conn.event.year);
            const clX = xScale(conn.closedYear);
            return (
              <line key={i}
                x1={`${evX}%`} y1={-policyTrackH * 0.3}
                x2={`${clX}%`} y2={conn.business.barY + BAR_H / 2}
                stroke="#dc262644" strokeWidth={1} strokeDasharray="3 3"
              />
            );
          })}

          {bars.map((b, i) => {
            const barStart = Math.max(xScale(b.x0), 0);
            const barEnd = Math.min(xScale(Math.min(b.x1, era.years[1])), 100);
            const clampedStart = Math.max(xScale(Math.max(b.x0, era.years[0])), 0);
            const isHovered = hoveredItem === b || selectedItem === b;
            const isClosed = b.stream === "closed";
            return (
              <g key={b.id || i}
                onMouseEnter={() => setHoveredItem(b)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => setSelectedItem(selectedItem === b ? null : b)}
                style={{ cursor: "pointer" }}>
                <rect
                  x={`${clampedStart}%`} y={b.barY}
                  width={`${Math.max(barEnd - clampedStart, 0.5)}%`} height={BAR_H}
                  rx={2}
                  fill={b.clr}
                  fillOpacity={isHovered ? 1 : 0.75}
                  stroke={isHovered ? "#1a1a1a" : "none"}
                  strokeWidth={isHovered ? 1.5 : 0}
                />
                {/* Still operating dot or closed X */}
                {!isClosed && b.x1 >= era.years[1] && (
                  <circle cx={`${barEnd}%`} cy={b.barY + BAR_H / 2} r={3} fill="#16a34a" />
                )}
                {isClosed && b.closedYear >= era.years[0] && b.closedYear < era.years[1] && (
                  <text x={`${xScale(b.closedYear)}%`} y={b.barY + BAR_H / 2 + 3.5} textAnchor="middle" style={{ fontSize: 8, fill: "#dc2626", fontWeight: 700 }}>{"\u2715"}</text>
                )}
                {/* Label */}
                <text
                  x={`${Math.min(barEnd + 0.5, 98)}%`} y={b.barY + BAR_H / 2 + 3}
                  style={{ fontSize: 8, fill: "#64615b", fontWeight: 500 }}
                >
                  {b.name.length > 18 ? b.name.slice(0, 16) + "\u2026" : b.name}
                </text>
              </g>
            );
          })}
        </svg>
        {bars.length === 0 && (
          <div style={{ fontSize: 11, color: "#a8a49c", fontStyle: "italic", padding: "8px 0" }}>No tracked businesses active in this era.</div>
        )}
      </div>

      {/* Context track — demographics */}
      {contextData.length >= 2 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
            Demographic Context (city-wide)
            {dviAnnotation.start && (
              <span style={{ marginLeft: 12, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                DVI (East Austin): {dviAnnotation.start} {"\u2192"} {dviAnnotation.end}
              </span>
            )}
          </div>
          <div style={{ height: 80 }}>
            <ResponsiveContainer>
              <AreaChart data={contextData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 8, fill: "#a8a49c" }} tickLine={false} axisLine={false} />
                <YAxis hide domain={[0, 1]} />
                <Area type="monotone" dataKey="Other" stackId="1" stroke="none" fill={DEMO_COLORS.Other} fillOpacity={0.85} />
                <Area type="monotone" dataKey="Asian" stackId="1" stroke="none" fill={DEMO_COLORS.Asian} fillOpacity={0.85} />
                <Area type="monotone" dataKey="Hispanic" stackId="1" stroke="none" fill={DEMO_COLORS.Hispanic} fillOpacity={0.85} />
                <Area type="monotone" dataKey="Black" stackId="1" stroke="none" fill={DEMO_COLORS.Black} fillOpacity={0.85} />
                <Area type="monotone" dataKey="White" stackId="1" stroke="none" fill={DEMO_COLORS.White} fillOpacity={0.85} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Era summary */}
      <div style={{ background: "#fafaf9", borderRadius: 8, padding: "12px 14px", marginBottom: 8, border: "1px solid #e8e5e0" }}>
        <p style={{ fontSize: 12, color: "#44403c", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>{summary}</p>
      </div>

      {/* View in Dashboard link */}
      <button
        onClick={() => onViewInDashboard(era)}
        style={{ background: "none", border: "none", color: "#0f766e", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
      >
        View this era in Dashboard {"\u2192"}
      </button>
    </div>
  );
}
