import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { COUNCIL_DISTRICTS_GEOJSON } from "../data/councilDistricts";
import { findDistrict } from "../utils/geo";
import { LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL, PA_LABELS, REGION_INDEX, TIPPING_POINTS } from "../data";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi";
import {
  toDemoChartData,
  AUDITED_SOCIO_BY_ID,
  AUDITED_PROP_BY_ID,
  AUDITED_DEMO_BY_ID,
} from "../data/auditedData";
import { DEMO_COLORS } from "../data/constants";
import { ID_TO_NAME, getMergedIds } from "../data/regionLookup";
import { regionLookupMap } from "../data/regionIndex";
import {
  interpolateDvi, getDviBand, getDviColor, isRegionExcluded,
  calcDirectDisplacement, computeTippingStats,
} from "../utils/math";

/**
 * StoryCardModal — a printable one-pager that arms a tabler with the
 * locally specific story for one neighborhood: what the data shows, the
 * cultural anchors still standing, what has been lost, and what
 * Preservation Austin has already done nearby. Supports the plan's
 * "Tell a Clear, Consistent Story" and "Preserve the Whole Story of
 * Austin" objectives.
 *
 * Printing uses a body class + visibility rules in styles.css so only
 * the card sheet prints.
 */

const NEAR_DEG = 0.012; // ~1.3 km, same radius utils/math.js uses for PA counts

// Every row that actually carries a value for `field`, as a time series.
function fieldSeries(rows, field) {
  return (rows || [])
    .filter((r) => r[field] != null && isFinite(r[field]))
    .map((r) => ({ year: r.year, value: r[field] }));
}

const fmtMoney = (v) => (v >= 10000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v).toLocaleString()}`);
const fmtPct = (v) => `${v.toFixed(1)}%`;

/** Compact hover tip shared by every chart on the card. `format` maps a
 * payload entry to its display string. */
function CardTip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1a1a", color: "#fffffe", borderRadius: 6,
      padding: "5px 9px", fontSize: 11, lineHeight: 1.5,
      boxShadow: "0 2px 8px rgba(0,0,0,.25)", pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700 }}>{label ?? payload[0]?.payload?.year}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>{format(p)}</div>
      ))}
    </div>
  );
}

/** Economics stats: latest value + change since the earliest data year. */
function buildEconStats(regionId) {
  const socio = AUDITED_SOCIO_BY_ID.get(regionId) || [];
  const prop = AUDITED_PROP_BY_ID.get(regionId) || [];
  const demo = AUDITED_DEMO_BY_ID.get(regionId) || [];
  const defs = [
    { label: "Median household income", rows: socio, field: "median_household_income", fmt: fmtMoney, deltaKind: "pct" },
    { label: "Median home value", rows: prop, field: "median_home_value", fmt: fmtMoney, deltaKind: "pct" },
    { label: "Median rent / month", rows: prop, field: "median_rent_monthly", fmt: (v) => `$${Math.round(v).toLocaleString()}`, deltaKind: "pct" },
    { label: "Rent-burdened households", rows: demo, field: "rent_burden_pct", fmt: fmtPct, deltaKind: "pts" },
    { label: "Poverty rate", rows: socio, field: "poverty_rate", fmt: fmtPct, deltaKind: "pts" },
    { label: "Unemployment", rows: socio, field: "unemployment_rate", fmt: fmtPct, deltaKind: "pts" },
    { label: "Eviction filing rate", rows: socio, field: "eviction_filing_rate", fmt: fmtPct, deltaKind: "pts" },
    { label: "SNAP participation", rows: socio, field: "snap_participation_rate", fmt: fmtPct, deltaKind: "pts" },
  ];
  return defs.map((d) => {
    const series = fieldSeries(d.rows, d.field);
    if (!series.length) return null;
    const from = series[0];
    const to = series[series.length - 1];
    let delta = null;
    if (from.year !== to.year) {
      delta = d.deltaKind === "pct"
        ? (from.value > 0 ? `${to.value >= from.value ? "+" : ""}${(((to.value - from.value) / from.value) * 100).toFixed(0)}% since ${from.year}` : null)
        : `${to.value >= from.value ? "+" : ""}${(to.value - from.value).toFixed(1)} pts since ${from.year}`;
    }
    return { label: d.label, value: d.fmt(to.value), year: to.year, delta, series, fmtFn: d.fmt };
  }).filter(Boolean);
}

export default function StoryCardModal({ regionId, onClose }) {
  // Print-isolation class while the modal is open
  useEffect(() => {
    document.body.classList.add("story-card-open");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("story-card-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const card = useMemo(() => {
    const meta = regionLookupMap.get(regionId);
    const name = ID_TO_NAME.get(regionId) || meta?.display_name || `Tract ${regionId}`;
    const tractLabel = meta?.tract_label;

    const dviNow = interpolateDvi(regionId, 2023);
    const excluded = isRegionExcluded(regionId, 2023);
    const dd = calcDirectDisplacement(regionId);

    const allIds = getMergedIds(regionId);
    const open = LEGACY_OPERATING.filter((b) => allIds.includes(b.region_id));
    const closed = LEGACY_CLOSED.filter((b) => allIds.includes(b.region_id));

    const region = REGION_INDEX.find((r) => r.region_id === regionId);
    const district = region ? findDistrict(region.lat, region.lng, COUNCIL_DISTRICTS_GEOJSON) : null;
    const paNear = region
      ? PA_ALL.filter((i) => i.lat && i.lng &&
          Math.hypot(i.lat - region.lat, i.lng - region.lng) < NEAR_DEG)
          .sort((a, b) => b.year - a.year)
      : [];

    const tp = TIPPING_POINTS.find((t) => t.region_ids?.includes(regionId)) || null;
    const tpStats = tp ? computeTippingStats(tp) : null;

    // Charts use only the years that actually have data — no padded nulls
    // — and are computed here, so the work happens only when the card is
    // opened, never on ordinary tract selection.
    const demoData = toDemoChartData(regionId).filter((r) => r.White != null);
    const dviSeries = (AUDITED_DVI_LOOKUP[regionId] || []).map((p) => ({ year: p.year, dvi: p.dvi }));
    const econStats = buildEconStats(regionId);

    return { name, tractLabel, district, dviNow, excluded, dd, open, closed, paNear, tp, tpStats, demoData, dviSeries, econStats };
  }, [regionId]);

  const { name, tractLabel, district, dviNow, excluded, dd, open, closed, paNear, tp, tpStats, demoData, dviSeries, econStats } = card;
  const demoYears = demoData.map((r) => r.year);
  const dviYears = dviSeries.map((r) => r.year);

  // Plain-language headline for the data story
  const dataStory = excluded
    ? "This area is affluent and high-ownership — the index treats its rising values as appreciation, not displacement risk."
    : dviNow >= 55
      ? "Displacement here is largely historic: much of the change this map tracks has already happened."
      : dviNow >= 35
        ? "This neighborhood is under active displacement pressure right now — the window to act is open."
        : dviNow >= 20
          ? "Early pressure is visible here; conditions are shifting but community fabric is still intact."
          : "Conditions here are comparatively stable today.";

  // Trend sentence anchors on the FIRST MEASURED point — never a
  // back-filled year the data can't actually support.
  const firstDvi = dviSeries[0];
  const trendTxt = firstDvi && firstDvi.year < 2023 && firstDvi.dvi > 0
    ? `Displacement vulnerability moved from ${firstDvi.dvi.toFixed(0)} (${firstDvi.year}) to ${dviNow.toFixed(0)} (2023) on the 0–100 index.`
    : `Displacement vulnerability stands at ${dviNow.toFixed(0)} (2023) on the 0–100 index.`;

  // Portal to <body>: the detail panel and Leaflet's floating controls
  // create their own stacking contexts, so rendering in place leaves the
  // modal painted behind the map no matter its z-index.
  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 3000, background: "rgba(26,26,26,.5)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "4vh 16px", overflowY: "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Neighborhood story card for ${name}`}
    >
      <div style={{ width: "100%", maxWidth: 660 }}>
        {/* Toolbar (never prints) */}
        <div className="story-card-toolbar" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#0f766e", color: "#fffffe", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
          >
            🖨 Print card
          </button>
          <button
            onClick={onClose}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #d6d3cd", background: "#fffffe", color: "#64615b", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        {/* The printable sheet */}
        <div className="story-card-sheet" style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #d6d3cd", padding: "26px 30px", fontFamily: "'Libre Franklin','Source Sans 3',sans-serif", color: "#1a1a1a" }}>
          <div style={{ borderBottom: "2.5px solid #9a3412", paddingBottom: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "#9a3412", textTransform: "uppercase" }}>
              Preservation Austin · Neighborhood story card
            </div>
            <h1 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 26, fontWeight: 600, margin: "4px 0 0", lineHeight: 1.15 }}>
              {tractLabel || name}
            </h1>
            <div style={{ fontSize: 11.5, color: "#a8a49c", marginTop: 2 }}>
              {district != null ? `Council District ${district} (by tract centroid)` : "Council district unknown"}
            </div>
          </div>

          {/* The data story */}
          <Section title="What the data shows">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 46, height: 46, borderRadius: 8, fontWeight: 700, fontSize: 18,
                background: excluded ? "#1565C0" : getDviColor(dviNow),
                color: excluded || dviNow >= 55 ? "#fffffe" : "#1a1a1a",
                border: "1px solid rgba(0,0,0,.12)",
              }}>
                {dviNow.toFixed(0)}
              </span>
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <strong>{excluded ? "Exclusive / Appreciated" : getDviBand(dviNow)}</strong><br />
                <span style={{ color: "#64615b" }}>{trendTxt}</span>
              </div>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 4px" }}>{dataStory}</p>
            {dd && (
              <p style={{ fontSize: 12, color: "#64615b", lineHeight: 1.5, margin: 0 }}>
                Measured change {dd.fromYear}–{dd.toYear}: the Black + Hispanic share of residents went
                from {dd.bhFrom.toFixed(0)}% to {dd.bhTo.toFixed(0)}%
                ({dd.bhDelta > 0 ? "+" : ""}{dd.bhDelta.toFixed(1)} pts)
                {dd.renterDelta != null && (
                  <> ; renters went from {dd.renterFrom.toFixed(0)}% to {dd.renterTo.toFixed(0)}% of households</>
                )}.
              </p>
            )}
            {dviSeries.length >= 2 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ width: "100%", height: 76 }} role="img" aria-label={`Displacement vulnerability trend for ${name}, measured years ${dviYears[0]} to ${dviYears[dviYears.length - 1]}`}>
                  <ResponsiveContainer>
                    <LineChart data={dviSeries} margin={{ top: 6, right: 8, left: -26, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#edeae4" vertical={false} />
                      <XAxis
                        dataKey="year" type="number" domain={["dataMin", "dataMax"]}
                        ticks={dviYears} tick={{ fontSize: 9.5, fill: "#a8a49c" }}
                        tickLine={false} axisLine={{ stroke: "#d6d3cd" }}
                      />
                      <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 9.5, fill: "#a8a49c" }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CardTip format={(p) => `DVI ${p.value.toFixed(1)} — ${getDviBand(p.value)}`} />} />
                      <Line type="monotone" dataKey="dvi" stroke="#9a3412" strokeWidth={2} dot={{ r: 2.5, fill: "#9a3412" }} activeDot={{ r: 4 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 10, color: "#a8a49c", marginTop: 1 }}>
                  Displacement Vulnerability Index — measured years only ({dviYears.join(", ")})
                </div>
              </div>
            )}
          </Section>

          {/* Population composition over the measured years */}
          {demoData.length >= 2 && (
            <Section title="Who lives here — population share over time">
              <div style={{ width: "100%", height: 150 }} role="img" aria-label={`Demographic composition of ${name} across the years with census data`}>
                <ResponsiveContainer>
                  <AreaChart data={demoData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#edeae4" />
                    <XAxis
                      dataKey="year" type="number" domain={["dataMin", "dataMax"]}
                      ticks={demoYears} tick={{ fontSize: 10, fill: "#7c6f5e" }}
                      tickLine={false} axisLine={{ stroke: "#d6d3cd" }}
                    />
                    <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} ticks={[0, 0.5, 1]} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} domain={[0, 1]} />
                    <Tooltip content={<CardTip format={(p) => `${p.name}: ${(p.value * 100).toFixed(0)}%`} />} />
                    <Area type="monotone" dataKey="Other" stackId="1" stroke="none" fill={DEMO_COLORS.Other} fillOpacity={0.85} activeDot={false} name="Other/Multiracial" isAnimationActive={false} />
                    <Area type="monotone" dataKey="Asian" stackId="1" stroke="none" fill={DEMO_COLORS.Asian} fillOpacity={0.85} activeDot={false} name="Asian" isAnimationActive={false} />
                    <Area type="monotone" dataKey="Hispanic" stackId="1" stroke="none" fill={DEMO_COLORS.Hispanic} fillOpacity={0.85} activeDot={false} name="Hispanic/Latino" isAnimationActive={false} />
                    <Area type="monotone" dataKey="Black" stackId="1" stroke="none" fill={DEMO_COLORS.Black} fillOpacity={0.85} activeDot={false} name="Black" isAnimationActive={false} />
                    <Area type="monotone" dataKey="White" stackId="1" stroke="none" fill={DEMO_COLORS.White} fillOpacity={0.85} activeDot={false} name="White non-Hispanic" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
                {[["White non-Hispanic", "White"], ["Black", "Black"], ["Hispanic/Latino", "Hispanic"], ["Asian", "Asian"], ["Other", "Other"]].map(([label, key]) => (
                  <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#64615b" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: DEMO_COLORS[key] }} aria-hidden="true" />
                    {label}
                  </span>
                ))}
                <span style={{ fontSize: 10, color: "#a8a49c", marginLeft: "auto" }}>
                  Census years with data: {demoYears.join(", ")}
                </span>
              </div>
            </Section>
          )}

          {/* Economics */}
          {econStats.length > 0 && (
            <Section title="The economics">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px 12px" }}>
                {econStats.map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>
                      {s.value} <span style={{ fontSize: 9.5, fontWeight: 400, color: "#a8a49c" }}>'{String(s.year).slice(2)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#64615b", lineHeight: 1.3 }}>{s.label}</div>
                    {s.delta && <div style={{ fontSize: 9.5, color: "#9a3412", fontWeight: 600 }}>{s.delta}</div>}
                    {s.series.length >= 2 && (
                      <div style={{ width: "100%", height: 30, marginTop: 2 }} role="img"
                        aria-label={`${s.label} trend, ${s.series[0].year} to ${s.series[s.series.length - 1].year}`}>
                        <ResponsiveContainer>
                          <LineChart data={s.series} margin={{ top: 3, right: 2, left: 2, bottom: 1 }}>
                            <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} hide />
                            <YAxis domain={["auto", "auto"]} hide />
                            <Tooltip content={<CardTip format={(p) => s.fmtFn(p.value)} />} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 10 }} />
                            <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={1.5}
                              dot={{ r: 1.5, fill: "#0f766e", strokeWidth: 0 }} activeDot={{ r: 3 }} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#a8a49c", marginTop: 5 }}>
                Latest value per metric with change since its earliest data year; each trend line spans only that
                metric's data years, on its own scale. Dollars are nominal (not inflation-adjusted).
              </div>
            </Section>
          )}

          {/* Historic turning point */}
          {tp && (
            <Section title="The turning point">
              <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                <strong>{tp.region}{tp.decade ? ` (${tp.decade})` : ""}:</strong>{" "}
                {tp.context || ""}
                {tpStats?.homeValue && (
                  <> Average home values in this corridor went from ${Math.round(tpStats.homeValue.from / 1000)}k
                  to ${Math.round(tpStats.homeValue.to / 1000)}k ({tpStats.homeValue.pct > 0 ? "+" : ""}{tpStats.homeValue.pct}%)
                  between {tpStats.fromYear} and {tpStats.toYear}.</>
                )}
              </p>
            </Section>
          )}

          {/* Anchors */}
          <Section title={`Cultural anchors still here (${open.length})`}>
            {open.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, columns: open.length > 6 ? 2 : 1 }}>
                {open.slice(0, 12).map((b) => (
                  <li key={b.id}>
                    <strong>{b.name}</strong> (est. {b.est})
                    {(b.pressure === "High" || b.pressure === "Critical") && (
                      <span style={{ color: "#b45309", fontWeight: 700 }}> · under pressure</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12.5, color: "#64615b", margin: 0 }}>No tracked cultural anchors in this area — part of the story may be undocumented. Ask who holds it.</p>
            )}
          </Section>

          {closed.length > 0 && (
            <Section title={`What has been lost (${closed.length})`}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "#64615b" }}>
                {closed.slice(0, 10).map((b) => `${b.name} (${b.closed})`).join(" · ")}
                {closed.length > 10 ? ` · and ${closed.length - 10} more` : ""}
              </p>
            </Section>
          )}

          {/* PA's work nearby */}
          <Section title={`Preservation Austin nearby (${paNear.length})`}>
            {paNear.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55 }}>
                {paNear.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <strong>{i.name}</strong> — {PA_LABELS?.[i.type] || i.type}, {i.year}
                    {i.amount ? ` ($${i.amount.toLocaleString()})` : ""}
                  </li>
                ))}
                {paNear.length > 6 && <li style={{ color: "#a8a49c" }}>and {paNear.length - 6} more</li>}
              </ul>
            ) : (
              <p style={{ fontSize: 12.5, color: "#64615b", margin: 0 }}>
                No PA grants, awards, or advocacy on record near here yet — an honest opening line:
                "we want that to change, starting with listening."
              </p>
            )}
          </Section>

          <div style={{ borderTop: "1px solid #e8e5e0", marginTop: 14, paddingTop: 8, fontSize: 10, color: "#a8a49c", lineHeight: 1.5 }}>
            Sources: U.S. Census / ACS, audited to 2023; Preservation Austin program records; community business inventories.
            DVI = Displacement Vulnerability Index (0–100, current committee weight settings) — a planning signal, not a verdict on any block or household.
            Generated from Austin's Shifting Ground, {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
