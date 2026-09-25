import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  HISTORY_EVENTS,
  HISTORY_META,
  EVENT_BY_ID,
  GEO_CITY_LIMITS,
  GEO_ZONES,
  GEO_NEIGHBORHOODS,
  GEO_CORRIDORS,
  HOLC_1935,
  HOLC_ATTRIBUTION,
  HOLC_GRADES,
  ERA_ORDER,
  timeWarp,
  UNDATED_COLOR,
  ERA_GRADIENT_CSS,
  allFlags,
  FLAG_OPTIONS,
  communityLabel,
  TYPE_GROUP_LABELS,
  ZONE_COLORS,
  ZONE_LEGEND,
} from "../data/history";

// ── Marker styling driven by documentation flags (data spec §2.4.9) ──
function markerStyle(ev, isSelected) {
  const g = ev.timeline_granularity;
  const style = {
    radius: g === "major" ? 8 : g === "micro" ? 4.5 : 6,
    fillColor: ev.era_color_gradient || UNDATED_COLOR,
    color: "#1a1a1a",
    weight: 1,
    fillOpacity: 0.9,
  };
  const flags = allFlags(ev);
  if (ev.documentation_validity_flag === "Partially Documented") style.fillOpacity = 0.55;
  if (flags.includes("Under-Researched")) style.dashArray = "3 3";
  if (flags.includes("Intentionally Erased")) {
    // Outline only: the place or symbol was removed
    style.fillOpacity = 0.12;
    style.weight = 2.5;
    style.color = "#b91c1c";
  }
  if (isSelected) {
    style.radius += 3;
    style.weight = 3;
    style.color = "#0f766e";
  }
  return style;
}

function fmtDates(ev) {
  const end = ev.ongoing ? "ongoing" : ev.date_end;
  return end && end !== ev.date_start ? `${ev.date_start} – ${end}` : ev.date_start;
}

const selStyle = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #d6d3cd",
  background: "#fffffe",
  color: "#1a1a1a",
  fontSize: 11,
  minHeight: 32,
  maxWidth: 200,
};

const chip = (bg, color = "#fff") => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 10,
  background: bg,
  color,
  fontSize: 11,
  fontWeight: 600,
  marginRight: 4,
  marginBottom: 4,
});

// ── Timeline dot layout: warped-time x position + row stacking to avoid overlap ──
function layoutTimeline(events, width) {
  const placed = [];
  const rowEnds = [];
  const minGap = 9; // px between dot centers in a row
  events.forEach((ev) => {
    if (ev.date_start_sort == null) return;
    const x = timeWarp(ev.date_start_sort) * width;
    let row = 0;
    while (row < rowEnds.length && x - rowEnds[row] < minGap) row++;
    rowEnds[row] = x;
    placed.push({ ev, x, row });
  });
  return { placed, rows: rowEnds.length };
}

const AXIS_TICKS = [
  { y: 1000, label: "≤1000" },
  { y: 1400, label: "1400" },
  { y: 1700, label: "1700" },
  { y: 1800, label: "1800" },
  { y: 1850, label: "1850" },
  { y: 1900, label: "1900" },
  { y: 1950, label: "1950" },
  { y: 2000, label: "2000" },
  { y: 2026, label: "2026" },
];

export default function HistoryView({ initialEventId = null, onShowOnMap = null }) {
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const eventsLayerRef = useRef(null);
  const overlayRef = useRef({});
  const markerByIdRef = useRef(new Map());

  const [selectedId, setSelectedId] = useState(null);
  const [community, setCommunity] = useState("all");
  const [typeGroup, setTypeGroup] = useState("all");
  const [flag, setFlag] = useState("all");
  const [era, setEra] = useState("all");
  const [query, setQuery] = useState("");
  const [showHolc, setShowHolc] = useState(false);
  const [showCityLimits, setShowCityLimits] = useState(false);
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [showCorridors, setShowCorridors] = useState(false);

  const selected = selectedId ? EVENT_BY_ID.get(selectedId) : null;

  // ── Filtering ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HISTORY_EVENTS.filter((ev) => {
      if (community !== "all" && !(ev.community_tags || []).includes(community)) return false;
      if (typeGroup !== "all" && !(ev.event_type_tags || []).some((t) => t.startsWith(typeGroup + "."))) return false;
      if (flag !== "all" && !allFlags(ev).includes(flag)) return false;
      if (era !== "all" && ev.era_classification !== era) return false;
      if (q) {
        const hay = `${ev.event_title} ${(ev.searchable_keywords || []).join(" ")} ${ev.primary_location_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [community, typeGroup, flag, era, query]);

  const filteredIds = useMemo(() => new Set(filtered.map((e) => e.event_id)), [filtered]);
  const unmappedCount = useMemo(() => filtered.filter((e) => !e.coordinates).length, [filtered]);
  const undatedEvents = useMemo(() => HISTORY_EVENTS.filter((e) => e.date_start_sort == null), []);

  const communityOptions = useMemo(() => {
    const counts = new Map();
    HISTORY_EVENTS.forEach((ev) => (ev.community_tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const selectEvent = useCallback((id) => {
    setSelectedId(id);
    const ev = EVENT_BY_ID.get(id);
    const map = leafletRef.current;
    if (map && ev?.coordinates) map.panTo([ev.coordinates.lat, ev.coordinates.lon]);
  }, []);

  // Arriving from a map timeline tick's "Read more" → pre-select that event.
  // Deferred a tick so the Leaflet init effect (declared below) has run and
  // selectEvent can pan the history map to the event.
  useEffect(() => {
    if (!initialEventId || !EVENT_BY_ID.has(initialEventId)) return;
    const t = setTimeout(() => selectEvent(initialEventId), 0);
    return () => clearTimeout(t);
  }, [initialEventId, selectEvent]);

  // ── Leaflet init (once) ──
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    const map = L.map(mapRef.current).setView([30.27, -97.74], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
      minZoom: 6,
    }).addTo(map);

    // HOLC 1935 (CC BY-NC, Mapping Inequality) — non-interactive backdrop
    const holcLayer = L.geoJSON(HOLC_1935, {
      style: (f) => ({ fillColor: f.properties.fill, fillOpacity: 0.4, color: f.properties.fill, weight: 1 }),
      onEachFeature: (f, l) => l.bindTooltip(`HOLC grade ${f.properties.grade} — ${f.properties.category} (1935)`, { sticky: true }),
    });

    // Historic city limits: census polygons faint, proxies dashed "scale only"
    const cityLayer = L.geoJSON({ type: "FeatureCollection", features: GEO_CITY_LIMITS }, {
      style: (f) => {
        const p = f.properties;
        if (p.geometry_status === "area_proxy") return { color: "#7c6f5e", weight: 1.2, dashArray: "5 4", fill: false };
        if (p.feature_id === "CITY_1839") return { color: "#1a1a1a", weight: 1.6, fill: false };
        return { color: "#7c6f5e", weight: 0.8, fillColor: "#7c6f5e", fillOpacity: 0.05 };
      },
      onEachFeature: (f, l) => {
        const p = f.properties;
        const note = p.geometry_status === "area_proxy" ? " (scale only — circle of equal area)" : "";
        l.bindTooltip(`${p.name || p.feature_id}${note}`, { sticky: true });
      },
    });

    // Historic neighborhoods & districts
    const nbhdLayer = L.geoJSON({ type: "FeatureCollection", features: GEO_NEIGHBORHOODS }, {
      style: () => ({ color: "#b45309", weight: 1.3, dashArray: "4 3", fillColor: "#b45309", fillOpacity: 0.06 }),
      onEachFeature: (f, l) => {
        const p = f.properties;
        l.bindTooltip(`<strong>${p.name}</strong>${p.significance ? "<br/>" + p.significance : ""}<br/><em>${p.precision_note?.split(".")[0] || ""}</em>`, { sticky: true });
      },
    });

    // Indigenous presence zones — soft fills, no hard boundaries (spec §2.4.1–2)
    const zonesLayer = L.geoJSON({ type: "FeatureCollection", features: GEO_ZONES }, {
      style: (f) => ({
        stroke: false,
        fillColor: ZONE_COLORS[f.properties.feature_id] || "#57534e",
        fillOpacity: 0.16,
      }),
      onEachFeature: (f, l) => {
        const p = f.properties;
        l.bindTooltip(`<strong>${p.name}</strong><br/><em>As described by: ${p.source?.split(";")[0] || "see source"}</em><br/>Schematic — not a surveyed or tribally approved boundary`, { sticky: true });
      },
    });

    // I-35 Capital Express corridor + 1884–85 Tonkawa removal route
    const corridorLayer = L.geoJSON({ type: "FeatureCollection", features: GEO_CORRIDORS }, {
      style: (f) =>
        f.properties.feature_id === "CORRIDOR_I35_CAPEX_CENTRAL"
          ? { color: "#b91c1c", weight: 3, opacity: 0.75 }
          : { color: "#a16207", weight: 2, dashArray: "6 5", opacity: 0.8 },
      onEachFeature: (f, l) => l.bindTooltip(f.properties.name || f.properties.feature_id, { sticky: true }),
    });

    const eventsLayer = L.layerGroup().addTo(map);

    overlayRef.current = { holcLayer, cityLayer, nbhdLayer, zonesLayer, corridorLayer };
    eventsLayerRef.current = eventsLayer;
    leafletRef.current = map;

    return () => {
      map.remove();
      leafletRef.current = null;
      eventsLayerRef.current = null;
    };
  }, []);

  // ── Overlay visibility ──
  useEffect(() => {
    const map = leafletRef.current;
    const o = overlayRef.current;
    if (!map || !o.holcLayer) return;
    const sync = (layer, on) => {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    };
    sync(o.holcLayer, showHolc);
    sync(o.cityLayer, showCityLimits);
    sync(o.nbhdLayer, showNeighborhoods);
    sync(o.zonesLayer, showZones);
    sync(o.corridorLayer, showCorridors);
  }, [showHolc, showCityLimits, showNeighborhoods, showZones, showCorridors]);

  // ── Event markers ──
  useEffect(() => {
    const layer = eventsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markerByIdRef.current.clear();
    filtered.forEach((ev) => {
      if (!ev.coordinates) return;
      const m = L.circleMarker([ev.coordinates.lat, ev.coordinates.lon], markerStyle(ev, false));
      m.bindTooltip(`<strong>${ev.event_title}</strong><br/>${fmtDates(ev)}`, { direction: "top", sticky: true });
      m.on("click", () => selectEvent(ev.event_id));
      m.addTo(layer);
      markerByIdRef.current.set(ev.event_id, m);
    });
  }, [filtered, selectEvent]);

  // Restyle on selection change (and after marker rebuilds) without recreating markers
  useEffect(() => {
    markerByIdRef.current.forEach((m, id) => {
      const ev = EVENT_BY_ID.get(id);
      m.setStyle(markerStyle(ev, id === selectedId));
      if (id === selectedId) m.bringToFront();
    });
  }, [selectedId, filtered]);

  // ── Timeline layout ──
  const TL_WIDTH = 1000; // viewBox units; scales to container
  const { placed, rows } = useMemo(() => layoutTimeline(HISTORY_EVENTS, TL_WIDTH), []);
  const tlHeight = Math.max(3, rows) * 11 + 30;

  return (
    <section aria-label="History view" style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* ═══ LEFT: MAP + TIMELINE ═══ */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }} role="toolbar" aria-label="Event filters">
            <select value={community} onChange={(e) => setCommunity(e.target.value)} style={selStyle} aria-label="Filter by community">
              <option value="all">All communities</option>
              {communityOptions.map(([tag, n]) => (
                <option key={tag} value={tag}>{communityLabel(tag)} ({n})</option>
              ))}
            </select>
            <select value={typeGroup} onChange={(e) => setTypeGroup(e.target.value)} style={selStyle} aria-label="Filter by event type">
              <option value="all">All event types</option>
              {Object.entries(TYPE_GROUP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={era} onChange={(e) => setEra(e.target.value)} style={selStyle} aria-label="Filter by era">
              <option value="all">All eras</option>
              {ERA_ORDER.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <select value={flag} onChange={(e) => setFlag(e.target.value)} style={selStyle} aria-label="Filter by documentation flag">
              <option value="all">All documentation flags</option>
              {FLAG_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events…"
              style={{ ...selStyle, width: 140 }}
              aria-label="Search events"
            />
            {(community !== "all" || typeGroup !== "all" || flag !== "all" || era !== "all" || query) && (
              <button
                onClick={() => { setCommunity("all"); setTypeGroup("all"); setFlag("all"); setEra("all"); setQuery(""); }}
                style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d6d3cd", background: "#fffffe", color: "#64615b", fontSize: 11, cursor: "pointer", minHeight: 32 }}
              >
                Clear
              </button>
            )}
            <span style={{ fontSize: 11, color: "#64615b", marginLeft: "auto" }}>
              {filtered.length} of {HISTORY_META.counts.total} events
              {unmappedCount > 0 && ` · ${unmappedCount} regional or unlocated (timeline only)`}
            </span>
          </div>

          {/* Overlay toggles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }} role="toolbar" aria-label="Map overlays">
            {[
              { on: showHolc, toggle: () => setShowHolc(!showHolc), label: "1935 Redlining (HOLC)" },
              { on: showCityLimits, toggle: () => setShowCityLimits(!showCityLimits), label: "City limits 1839–2022" },
              { on: showNeighborhoods, toggle: () => setShowNeighborhoods(!showNeighborhoods), label: "Historic districts" },
              { on: showZones, toggle: () => setShowZones(!showZones), label: "Indigenous presence" },
              { on: showCorridors, toggle: () => setShowCorridors(!showCorridors), label: "I-35 / removal route" },
            ].map((btn, i) => (
              <button key={i} onClick={btn.toggle} aria-pressed={btn.on} style={{ padding: "4px 10px", borderRadius: 6, border: btn.on ? "1.5px solid #0f766e" : "1.5px solid #c4c0b8", background: btn.on ? "#f0fdfa" : "#fff", color: btn.on ? "#0f766e" : "#64615b", fontSize: 11, fontWeight: 500, cursor: "pointer", minHeight: 32 }}>
                {btn.label}
              </button>
            ))}
          </div>

          {/* MAP */}
          <div ref={mapRef} style={{ position: "relative", background: "#f5f3f0", borderRadius: 10, overflow: "hidden", border: "1px solid #d6d3cd", boxShadow: "0 1px 3px rgba(0,0,0,.06)", height: 520 }} />

          {/* TIMELINE */}
          <div style={{ marginTop: 14 }} role="region" aria-label="Event timeline">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64615b" }}>Timeline · c. 11,600 BCE – 2026</span>
              <span style={{ fontSize: 11, color: "#a8a49c", fontStyle: "italic" }}>Axis is warped: three-quarters of it covers 1800–2026</span>
            </div>
            <svg viewBox={`0 0 ${TL_WIDTH} ${tlHeight}`} style={{ width: "100%", height: "auto", display: "block", background: "#fffffe", borderRadius: 8, border: "1px solid #e8e5e0" }}>
              {/* era gradient axis */}
              <defs>
                <linearGradient id="eraGrad" x1="0" x2="1">
                  {["#440154", "#46327E", "#365C8D", "#277F8E", "#1FA187", "#4AC16D", "#A0DA39"].map((c, i) => (
                    <stop key={i} offset={`${(i / 6) * 100}%`} stopColor={c} />
                  ))}
                </linearGradient>
              </defs>
              <rect x={0} y={tlHeight - 22} width={TL_WIDTH} height={4} fill="url(#eraGrad)" rx={2} />
              {AXIS_TICKS.map((t) => {
                const x = timeWarp(t.y) * TL_WIDTH;
                return (
                  <g key={t.y}>
                    <line x1={x} y1={tlHeight - 24} x2={x} y2={tlHeight - 14} stroke="#a8a49c" strokeWidth={0.7} />
                    <text x={x} y={tlHeight - 4} textAnchor={t.y === 2026 ? "end" : t.y === 1000 ? "start" : "middle"} fontSize={9} fill="#7c6f5e">{t.label}</text>
                  </g>
                );
              })}
              {placed.map(({ ev, x, row }) => {
                const inFilter = filteredIds.has(ev.event_id);
                const isSel = ev.event_id === selectedId;
                const y = tlHeight - 32 - row * 11;
                return (
                  <circle
                    key={ev.event_id}
                    cx={x}
                    cy={y}
                    r={isSel ? 6 : ev.timeline_granularity === "major" ? 4.5 : 3.5}
                    fill={ev.era_color_gradient || UNDATED_COLOR}
                    stroke={isSel ? "#0f766e" : "#1a1a1a"}
                    strokeWidth={isSel ? 2 : 0.4}
                    opacity={inFilter ? 1 : 0.12}
                    style={{ cursor: "pointer" }}
                    onClick={() => selectEvent(ev.event_id)}
                  >
                    <title>{`${ev.event_title} (${fmtDates(ev)})`}</title>
                  </circle>
                );
              })}
            </svg>
            {undatedEvents.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#7c6f5e", fontWeight: 600 }}>Undated:</span>
                {undatedEvents.map((ev) => (
                  <button key={ev.event_id} onClick={() => selectEvent(ev.event_id)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, border: `1px solid ${ev.event_id === selectedId ? "#0f766e" : "#d6d3cd"}`, background: UNDATED_COLOR + "22", color: "#4b4844", cursor: "pointer" }}>
                    {ev.event_title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 16px", marginTop: 14 }} role="region" aria-label="History legend">
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 70, height: 8, borderRadius: 4, background: ERA_GRADIENT_CSS, border: "1px solid rgba(0,0,0,.1)" }} />
                <span style={{ fontSize: 11, color: "#64615b" }}>Color = date (deep past → 2026)</span>
              </div>
              {[
                { style: { background: "#365C8D", opacity: 1 }, label: "Well-documented" },
                { style: { background: "#365C8D", opacity: 0.5 }, label: "Partially documented" },
                { style: { background: "transparent", border: "1.5px dashed #365C8D" }, label: "Under-researched" },
                { style: { background: "rgba(185,28,28,.12)", border: "2px solid #b91c1c" }, label: "Intentionally erased" },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", border: "1px solid #1a1a1a", ...s.style }} />
                  <span style={{ fontSize: 11, color: "#64615b" }}>{s.label}</span>
                </div>
              ))}
              <span style={{ fontSize: 11, color: "#64615b" }}>Large dot = major event</span>
            </div>
            {showHolc && (
              <div style={{ paddingTop: 8, marginTop: 8, borderTop: "1px solid #e8e5e0" }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {HOLC_GRADES.map((g) => (
                    <div key={g.grade} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: g.fill, border: "1px solid rgba(0,0,0,.15)" }} />
                      <span style={{ fontSize: 11, color: "#64615b" }}>{g.grade} — {g.category}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "#a8a49c", margin: "4px 0 0" }}>{HOLC_ATTRIBUTION}</p>
              </div>
            )}
            {showZones && (
              <div style={{ paddingTop: 8, marginTop: 8, borderTop: "1px solid #e8e5e0" }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {ZONE_LEGEND.map((z) => (
                    <div key={z.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: z.color, opacity: 0.4 }} />
                      <span style={{ fontSize: 11, color: "#64615b" }}>{z.label}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "#a8a49c", margin: "4px 0 0", lineHeight: 1.4 }}>
                  Presence zones are schematic sketches from written descriptions — one shape per source account, not surveyed or tribally approved boundaries. Peoples overlapped and moved seasonally; overlapping fills are the point, not an error.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: EVENT DETAIL PANEL ═══ */}
        <aside style={{ width: 400, flexShrink: 0, background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 18px", maxHeight: 900, overflowY: "auto" }} aria-label="Event details">
          {!selected ? (
            <div>
              <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 19, fontWeight: 600, color: "#1a1a1a", margin: "0 0 8px" }}>
                112 events, 13,600 years
              </h2>
              <p style={{ fontSize: 12.5, color: "#4b4844", lineHeight: 1.55, margin: "0 0 10px" }}>
                A documented timeline of who shaped — and who was displaced from — the land that became Austin, from Clovis-era occupation to the 2026 rainbow crosswalk removal. Compiled from the Preservation Austin historical data package (Sept 2026).
              </p>
              <p style={{ fontSize: 12.5, color: "#4b4844", lineHeight: 1.55, margin: "0 0 10px" }}>
                Click any dot on the map or the timeline to read the event: what happened, who it affected, how well the record supports it, and — where they exist — accounts from multiple perspectives, side by side.
              </p>
              <p style={{ fontSize: 11.5, color: "#64615b", lineHeight: 1.5, margin: "0 0 6px" }}>
                Every event carries a documentation flag. A missing record is not missing history: gaps in the archive are flagged, not smoothed over. {HISTORY_META.counts.full} events carry full multi-perspective accounts; {HISTORY_META.counts.index} are index-level records awaiting enrichment.
              </p>
              <p style={{ fontSize: 11, color: "#a8a49c", fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
                Locations are approximations at stated precision; schematic shapes are drawn from text descriptions, not surveys.
              </p>
            </div>
          ) : (
            <div>
              <button onClick={() => setSelectedId(null)} style={{ float: "right", border: "none", background: "none", color: "#a8a49c", fontSize: 16, cursor: "pointer", padding: 2, lineHeight: 1 }} aria-label="Close event details">✕</button>
              <div style={{ marginBottom: 6 }}>
                <span style={chip(selected.era_color_gradient || UNDATED_COLOR)}>{selected.era_classification}</span>
                <span style={chip("#edeae4", "#4b4844")}>{fmtDates(selected)}</span>
                {selected.timeline_granularity === "major" && <span style={chip("#0f766e")}>Major event</span>}
              </div>
              <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px", lineHeight: 1.25 }}>
                {selected.event_title}
              </h2>
              {selected.primary_location_name && (
                <p style={{ fontSize: 11, color: "#7c6f5e", margin: "0 0 8px" }}>
                  📍 {selected.primary_location_name}
                  {selected.coordinates?.precision ? ` · precision: ${selected.coordinates.precision}` : selected.coordinates ? "" : " · not mapped"}
                </p>
              )}
              {/* Cross-link: spatial stories belong on the main map too */}
              {onShowOnMap && selected.coordinates && (
                <button
                  onClick={() => onShowOnMap(selected)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 10, padding: "4px 12px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor" />
                  </svg>
                  Show on main map
                </button>
              )}
              <p style={{ fontSize: 12.5, color: "#1a1a1a", lineHeight: 1.55, margin: "0 0 10px" }}>{selected.event_description_neutral}</p>

              {/* Documentation flags */}
              <div style={{ background: "#f8f7f4", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7c6f5e", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Documentation</div>
                <div style={{ marginBottom: 4 }}>
                  <span style={chip("#4b4844")}>{selected.documentation_validity_flag}</span>
                  {(selected.documentation_validity_secondary || []).map((s, i) => (
                    <span key={i} style={chip("#b45309")} title={s.applies_to}>{s.flag}{s.applies_to ? ` — ${s.applies_to}` : ""}</span>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "#4b4844", lineHeight: 1.45, margin: 0 }}>{selected.documentation_validity_evidence}</p>
                {selected.conflict_summary && (
                  <p style={{ fontSize: 11, color: "#4b4844", lineHeight: 1.45, margin: "6px 0 0" }}>
                    <strong>Accounts conflict:</strong> {selected.conflict_summary}
                  </p>
                )}
                {selected.erasure_mechanism && (
                  <p style={{ fontSize: 11, color: "#b91c1c", lineHeight: 1.45, margin: "6px 0 0" }}>
                    <strong>Erasure mechanism:</strong> {selected.erasure_mechanism.replace(/_/g, " ")}
                    {selected.erasure_mechanism_note ? ` — ${selected.erasure_mechanism_note}` : ""}
                  </p>
                )}
                {selected.documentation_gaps && (
                  <p style={{ fontSize: 11, color: "#4b4844", lineHeight: 1.45, margin: "6px 0 0" }}>
                    <strong>Gaps:</strong> {selected.documentation_gaps}
                  </p>
                )}
              </div>

              {/* Communities & impacts */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7c6f5e", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Communities & impact</div>
                <div>
                  {(selected.community_tags || []).map((t) => (
                    <span key={t} style={chip("#edeae4", "#4b4844")}>{communityLabel(t)}</span>
                  ))}
                </div>
                <div style={{ marginTop: 2 }}>
                  {(selected.impact_type_tags || []).map((t) => (
                    <span key={t} style={chip(t === "Displacement" || t === "Erasure" || t === "Violence" ? "#b91c1c" : t === "Positive" || t === "Recognition" ? "#0f766e" : "#7c6f5e")}>{t}</span>
                  ))}
                </div>
                {(selected.impact_by_community || []).length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                    {selected.impact_by_community.map((r, i) => (
                      <li key={i} style={{ fontSize: 11, color: "#4b4844", lineHeight: 1.45, marginBottom: 2 }}>
                        <strong>{communityLabel(r.community_tag)}:</strong> {r.impact}{r.note ? ` — ${r.note}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Perspective accounts */}
              {(selected.perspective_accounts || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7c6f5e", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                    Perspectives ({selected.perspective_accounts.length})
                  </div>
                  {selected.perspective_accounts.map((a, i) => (
                    <div key={a.account_id || i} style={{ borderLeft: "3px solid #d6d3cd", padding: "4px 0 4px 10px", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>{a.perspective_origin}</div>
                      <p style={{ fontSize: 11.5, color: "#4b4844", lineHeight: 1.5, margin: "2px 0 3px" }}>{a.perspective_text}</p>
                      <div style={{ fontSize: 11, color: "#a8a49c" }}>
                        {a.source_name}{a.source_date ? ` (${a.source_date})` : ""}
                        {a.source_url && <> · <a href={a.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0f766e" }}>source ↗</a></>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Unverified claims */}
              {(selected.unverified_claims || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7c6f5e", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                    Awaiting verification ({selected.unverified_claims.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {selected.unverified_claims.map((c, i) => (
                      <li key={i} style={{ fontSize: 11, color: "#4b4844", lineHeight: 1.45, marginBottom: 4 }}>
                        {c.claim}
                        {c.resolving_record && <span style={{ color: "#a8a49c" }}> — would be settled by: {c.resolving_record}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Related events */}
              {(selected.related_events || []).length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7c6f5e", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Related events</div>
                  {selected.related_events.map((r, i) => {
                    const target = EVENT_BY_ID.get(r.event_id);
                    if (!target) return null;
                    const documented = r.causality_evidence === "documented";
                    return (
                      <button
                        key={i}
                        onClick={() => selectEvent(r.event_id)}
                        style={{ display: "block", width: "100%", textAlign: "left", background: "#f8f7f4", border: "1px solid #e8e5e0", borderRadius: 6, padding: "5px 8px", marginBottom: 4, cursor: "pointer" }}
                        title={r.note || ""}
                      >
                        <span style={{ fontSize: 11, color: documented ? "#0f766e" : "#a8a49c", fontWeight: 700, textTransform: "uppercase" }}>
                          {r.causality_type.replace(/_/g, " ")}{documented ? "" : " (sequence only)"}
                        </span>
                        <span style={{ display: "block", fontSize: 11, color: "#1a1a1a", lineHeight: 1.35 }}>{target.event_title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <p style={{ fontSize: 11, color: "#a8a49c", margin: "8px 0 0" }}>Source ref: {selected.context_source_ref}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
