import { useRef, useMemo } from "react";
import useAustinMap from "../hooks/useAustinMap";
import RegionDetailPanel from "./RegionDetailPanel";
import { SNAP_YEARS, PLAY_YEARS, TIMELINE_EVENTS } from "../data/constants";
import {
  AUDITED_PROP_BY_ID,
  AUDITED_SOCIO_BY_ID,
  closestRow,
  priorRow,
  toDemoChartData,
} from "../data/auditedData";

export default function MapView({
  year,
  setYear,
  isPlaying,
  setIsPlaying,
  showHeritage,
  setShowHeritage,
  showPins,
  setShowPins,
  showProjectConnect,
  setShowProjectConnect,
  showMusicVenues,
  setShowMusicVenues,
  showDevPressure,
  setShowDevPressure,
  activeRegionId,
  setActiveRegionId,
  activeFeature,
  setActiveFeature,
  selectedRegion,
  setSelectedRegion,
  hoveredRegion,
  setHoveredRegion,
  selectedBiz,
  setSelectedBiz,
  bizTab,
  setBizTab,
  // Derived data
  currentDvi,
  regionBizOpen,
  regionBizClosed,
  tippingPoint,
  narrativeCallouts,
}) {
  const mapRef = useRef(null);

  useAustinMap({
    mapRef,
    year,
    activeRegionId,
    showPins,
    showMusicVenues,
    showProjectConnect,
    showDevPressure,
    selectedRegion,
    setActiveRegionId,
    setSelectedRegion,
    setActiveFeature,
    setHoveredRegion,
    setSelectedBiz,
  });

  const activeRegionName = activeFeature?.properties?.region_name;

  // Compute demoChartData from audited demographics for the selected region
  const demoChartData = useMemo(
    () => (activeRegionId != null ? toDemoChartData(activeRegionId) : []),
    [activeRegionId]
  );

  // Compute property values from audited property data for the selected region and year
  const { propertyNow, propertyPrev } = useMemo(() => {
    if (activeRegionId == null) return { propertyNow: null, propertyPrev: null };
    const rows = AUDITED_PROP_BY_ID.get(activeRegionId);
    return {
      propertyNow: closestRow(rows, year),
      propertyPrev: priorRow(rows, year),
    };
  }, [activeRegionId, year]);

  // Compute socioeconomic values from audited socioeconomic data for the selected region and year
  const { socioNow, socioPrev } = useMemo(() => {
    if (activeRegionId == null) return { socioNow: null, socioPrev: null };
    const rows = AUDITED_SOCIO_BY_ID.get(activeRegionId);
    return {
      socioNow: closestRow(rows, year),
      socioPrev: priorRow(rows, year),
    };
  }, [activeRegionId, year]);

  const handleSliderChange = (e) => setYear(parseInt(e.target.value));

  return (
    <section aria-label="Map view" style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: "row" }}>
        {/* ═══ LEFT: MAP ═══ */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {/* Toggles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }} role="toolbar" aria-label="Map overlays">
            {[
              { on: showHeritage, toggle: () => setShowHeritage(!showHeritage), label: "Heritage", icon: <span style={{ width: 12, height: 0, borderTop: "2px dashed currentColor" }} /> },
              { on: showPins, toggle: () => setShowPins(!showPins), label: "Businesses", icon: <span style={{ width: 7, height: 7, borderRadius: "50%", background: showPins ? "#4ade80" : "#a8a49c", border: "1.5px solid currentColor" }} /> },
              { on: showProjectConnect, toggle: () => setShowProjectConnect(!showProjectConnect), label: "Project Connect", icon: <svg width="12" height="10" viewBox="0 0 12 10"><path d="M1 9L6 1L11 9" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg> },
            ].map((btn, i) => (
              <button key={i} onClick={btn.toggle} aria-pressed={btn.on} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: btn.on ? "1.5px solid #0f766e" : "1.5px solid #c4c0b8", background: btn.on ? "#f0fdfa" : "#fff", color: btn.on ? "#0f766e" : "#64615b", fontSize: 11, fontWeight: 500, cursor: "pointer", minHeight: 32 }}>
                {btn.icon}{btn.label}
              </button>
            ))}
          </div>

          {/* MAP CONTAINER */}
          <div ref={mapRef} style={{ position: "relative", background: "#f5f3f0", borderRadius: 10, overflow: "hidden", border: "1px solid #d6d3cd", boxShadow: "0 1px 3px rgba(0,0,0,.06)", height: "600px" }} id="map-container" />

          {/* TIME SLIDER */}
          <div style={{ marginTop: 16, padding: "0 4px" }} role="region" aria-label="Time slider controls">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 32, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-.03em", lineHeight: 1 }}>{year}</span>
                {year >= 2020 && <span style={{ fontSize: 10, color: "#a8a49c", fontStyle: "italic" }}>ACS 2019–2023 est.</span>}
              </div>
              <button
                onClick={() => {
                  if (isPlaying) setIsPlaying(false);
                  else {
                    if (year >= 2025) setYear(1990);
                    setIsPlaying(true);
                  }
                }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, border: "1.5px solid #0f766e", background: isPlaying ? "#0f766e" : "transparent", color: isPlaying ? "#fff" : "#0f766e", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 36 }}
                aria-label={isPlaying ? "Pause animation" : "Play animation"}
              >
                {isPlaying ? (
                  <><svg width="10" height="12" viewBox="0 0 10 12"><rect x="0" y="0" width="3" height="12" fill="currentColor" rx="1" /><rect x="7" y="0" width="3" height="12" fill="currentColor" rx="1" /></svg>Pause</>
                ) : (
                  <><svg width="10" height="12" viewBox="0 0 10 12"><polygon points="0,0 10,6 0,12" fill="currentColor" /></svg>Play</>
                )}
              </button>
            </div>
            <input type="range" min={1990} max={2025} value={year} onChange={handleSliderChange} className="slider-track" style={{ width: "100%", background: `linear-gradient(to right,#0f766e ${((year - 1990) / 35) * 100}%,#d6d3cd ${((year - 1990) / 35) * 100}%)` }} aria-label="Select year" aria-valuenow={year} aria-valuemin={1990} aria-valuemax={2025} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {SNAP_YEARS.map((sy) => (
                <button key={sy} onClick={() => { setYear(sy); setIsPlaying(false); }} style={{ fontSize: 11, color: year === sy ? "#0f766e" : "#a8a49c", fontWeight: year === sy ? 700 : 400, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", minHeight: 24 }} aria-label={`Jump to ${sy}`}>{sy}</button>
              ))}
            </div>
            <div style={{ position: "relative", height: 36, marginTop: 8, borderTop: "1px solid #e8e5e0" }} aria-hidden="true">
              {TIMELINE_EVENTS.map((evt, i) => {
                const pct = ((evt.year - 1990) / 35) * 100;
                return (
                  <div key={i} style={{ position: "absolute", left: `${pct}%`, top: 4, transform: "translateX(-50%)", opacity: Math.abs(evt.year - year) <= 5 ? 1 : 0.3 }}>
                    <div style={{ width: 1.5, height: 8, background: "#a8a49c", margin: "0 auto 2px" }} />
                    <div style={{ fontSize: 7.5, color: "#7c6f5e", whiteSpace: "nowrap", fontWeight: 500, transform: i % 2 === 0 ? "none" : "translateY(10px)", textAlign: "center" }}>{evt.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 16px", marginTop: 16 }} role="region" aria-label="Map legend">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {[
                { l: "Stable", s: "0–20", c: "#4ade80" },
                { l: "Early Pressure", s: "20–35", c: "#facc15" },
                { l: "Active Displ.", s: "35–55", c: "#fb923c" },
                { l: "Historic Displ.", s: "55+", c: "#ef4444" },
                { l: "New Dev.", s: "N/A", c: "#c4b5a4" },
              ].map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: b.c, border: "1px solid rgba(0,0,0,.1)", flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ fontSize: 10, color: "#1a1a1a", fontWeight: 500 }}>{b.l}</span>
                </div>
              ))}
            </div>
            {showPins && (
              <div style={{ display: "flex", gap: 10, paddingTop: 6, borderTop: "1px solid #e8e5e0", flexWrap: "wrap" }}>
                {[
                  { l: "Operating", c: "#4ade80" },
                  { l: "High pressure", c: "#f59e0b" },
                  { l: "Closed", c: "#a8a49c" },
                ].map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.c, border: "1.5px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.1)" }} aria-hidden="true" />
                    <span style={{ fontSize: 10, color: "#64615b" }}>{p.l}</span>
                  </div>
                ))}
              </div>
            )}
            {showProjectConnect && (
              <div style={{ paddingTop: 6, borderTop: "1px solid #e8e5e0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2.5px dashed #2563eb" }} aria-hidden="true" /><span style={{ fontSize: 10, color: "#64615b" }}>Transit</span></div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: DETAIL PANEL ═══ */}
        <RegionDetailPanel
          activeFeature={activeFeature}
          activeRegionName={activeRegionName}
          year={year}
          currentDvi={currentDvi}
          regionBizOpen={regionBizOpen}
          regionBizClosed={regionBizClosed}
          demoChartData={demoChartData}
          propertyNow={propertyNow}
          propertyPrev={propertyPrev}
          socioNow={socioNow}
          socioPrev={socioPrev}
          tippingPoint={tippingPoint}
          narrativeCallouts={narrativeCallouts}
          selectedBiz={selectedBiz}
          setSelectedBiz={setSelectedBiz}
          bizTab={bizTab}
          setBizTab={setBizTab}
          setSelectedRegion={setSelectedRegion}
          setHoveredRegion={setHoveredRegion}
        />
      </div>
    </section>
  );
}
