import { useRef, useMemo } from "react";
import useAustinMap from "../hooks/useAustinMap";
import RegionDetailPanel from "./RegionDetailPanel";
import LegislationTrack from "./LegislationTrack";
import LayersPopover from "./LayersPopover";
import { SNAP_YEARS, PLAY_YEARS, TIMELINE_EVENTS } from "../data/constants";
import { ID_TO_NAME } from "../data/regionLookup";
import { regionLookupMap } from "../data/regionIndex";
import {
  AUDITED_PROP_BY_ID,
  AUDITED_SOCIO_BY_ID,
  closestRow,
  priorRow,
  toDemoChartData,
} from "../data/auditedData";
import { HOLC_GRADES, HOLC_ATTRIBUTION } from "../data/history";
import { DVI_BINS, DVI_EXCLUDED, DVI_ND_COLOR } from "../utils/math";
import ConfidenceChip from "./ConfidenceChip";

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
  showRegions,
  setShowRegions,
  showPreservationAustin,
  setShowPreservationAustin,
  showAisdSchools,
  setShowAisdSchools,
  showHolc,
  setShowHolc,
  paFilter,
  setPaFilter,
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
  panelTab,
  setPanelTab,
  selectedPA,
  setSelectedPA,
  // Derived data
  currentDvi,
  regionBizOpen,
  regionBizClosed,
  tippingPoint,
  narrativeCallouts,
  // Boundary mode
  boundaryMode,
  setBoundaryMode,
  activeNeighborhoodId,
  setActiveNeighborhoodId,
  neighborhoodAgg,
}) {
  const mapRef = useRef(null);

  const { leafletMapRef, bizMarkersRef, paMarkersRef } = useAustinMap({
    mapRef,
    year,
    activeRegionId,
    showPins,
    showMusicVenues,
    showProjectConnect,
    showDevPressure,
    showRegions,
    showPreservationAustin,
    showAisdSchools,
    showHolc,
    paFilter,
    selectedRegion,
    setActiveRegionId,
    setSelectedRegion,
    setActiveFeature,
    setHoveredRegion,
    setSelectedBiz,
    setPanelTab,
    setBizTab,
    setSelectedPA,
    boundaryMode,
    activeNeighborhoodId,
    setActiveNeighborhoodId,
  });

  const activeRegionName = activeFeature?.properties?.region_name;
  // Census identity is primary in tracts mode; neighborhood names appear
  // only in neighborhoods mode
  const activeDisplayName = activeRegionId != null
    ? (regionLookupMap.get(activeRegionId)?.tract_label || ID_TO_NAME.get(activeRegionId) || activeRegionName)
    : activeRegionName;

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

  // Grouped layer model for the Layers popover — the grouping teaches the
  // data model: Boundaries / Cultural assets / Pressure / Historical.
  const layerGroups = [
    {
      title: "Boundaries",
      items: [
        { on: showRegions, toggle: () => setShowRegions(!showRegions), label: "Boundary fills (DVI)", icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: DVI_BINS[2].fill, border: "1px solid rgba(0,0,0,.15)" }} aria-hidden="true" /> },
      ],
    },
    {
      title: "Cultural assets",
      items: [
        { on: showPins, toggle: () => setShowPins(!showPins), label: "Legacy businesses", icon: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", border: "1.5px solid #64615b" }} aria-hidden="true" /> },
        { on: showMusicVenues, toggle: () => setShowMusicVenues(!showMusicVenues), label: "Music venues", icon: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(124,58,237,.2)", border: "1.5px solid #7c3aed" }} aria-hidden="true" /> },
        { on: showPreservationAustin, toggle: () => setShowPreservationAustin(!showPreservationAustin), label: "Preservation Austin", icon: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed" }} aria-hidden="true" /> },
      ],
    },
    {
      title: "Pressure",
      items: [
        { on: showProjectConnect, toggle: () => setShowProjectConnect(!showProjectConnect), label: "Project Connect transit", icon: <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path d="M1 9L6 1L11 9" stroke="#2563eb" strokeWidth="1.5" fill="none" /></svg> },
        { on: showDevPressure, toggle: () => setShowDevPressure(!showDevPressure), label: "Development pressure", icon: <span style={{ width: 9, height: 9, borderRadius: 2, border: "2px solid #fb923c" }} aria-hidden="true" /> },
      ],
    },
    {
      title: "Historical",
      items: [
        { on: showHolc, toggle: () => setShowHolc(!showHolc), label: "1935 Redlining (HOLC)", icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: "#d9838d" }} aria-hidden="true" /> },
        { on: showAisdSchools, toggle: () => setShowAisdSchools(!showAisdSchools), label: "AISD school closures", icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: "#b91c1c" }} aria-hidden="true" /> },
      ],
    },
  ];

  return (
    <section aria-label="Map view" style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexDirection: "row" }}>
        {/* ═══ LEFT: MAP ═══ */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {/* Toolbar: grouped Layers popover */}
          <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }} role="toolbar" aria-label="Map controls">
            <LayersPopover boundaryMode={boundaryMode} setBoundaryMode={setBoundaryMode} groups={layerGroups} />
            {boundaryMode === "neighborhoods" && (
              <div style={{ fontSize: 11, color: "#a8a49c", fontStyle: "italic", lineHeight: 1.4, maxWidth: 520 }}>
                Neighborhood boundaries follow City of Austin planning areas; data is aggregated from census tracts. For precise tract-level data, switch to Census Tracts.
              </div>
            )}
          </div>

          {/* MAP — fills the viewport; legend and time bar float on it */}
          <div style={{ position: "relative", height: "calc(100vh - 210px)", minHeight: 500, background: "#f5f3f0", borderRadius: 10, overflow: "hidden", border: "1px solid #d6d3cd", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
            <div ref={mapRef} id="map-container" style={{ position: "absolute", inset: 0 }} />

            {/* Floating legend card (top-right, on the map) */}
            <div
              style={{
                position: "absolute", top: 12, right: 12, zIndex: 1000, width: 236,
                background: "rgba(255,255,254,.95)", backdropFilter: "blur(4px)",
                borderRadius: 10, border: "1px solid #d6d3cd", boxShadow: "0 2px 10px rgba(0,0,0,.1)",
                padding: "10px 12px", maxHeight: "calc(100% - 150px)", overflowY: "auto",
              }}
              role="region"
              aria-label="Map legend"
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                Displacement Index
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {[
                  ...DVI_BINS.map((b) => ({ l: b.short, s: b.range, c: b.fill })),
                  { l: "Exclusive / Appreciated", s: "capped", c: DVI_EXCLUDED.fill },
                  { l: "New Dev.", s: "N/A", c: DVI_ND_COLOR },
                ].map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: b.c, border: "1px solid rgba(0,0,0,.15)", flexShrink: 0 }} aria-hidden="true" />
                    <span style={{ fontSize: 11, color: "#1a1a1a", fontWeight: 500, flex: 1 }}>{b.l}</span>
                    <span style={{ fontSize: 11, color: "#a8a49c" }}>{b.s}</span>
                  </div>
                ))}
              </div>
              {showPins && (
                <div style={{ display: "flex", gap: 10, paddingTop: 6, marginTop: 6, borderTop: "1px solid #e8e5e0", flexWrap: "wrap" }}>
                  {[
                    { l: "Operating", c: "#4ade80" },
                    { l: "High pressure", c: "#f59e0b" },
                    { l: "Closed", c: "#a8a49c" },
                  ].map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.c, border: "1.5px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.1)" }} aria-hidden="true" />
                      <span style={{ fontSize: 11, color: "#64615b" }}>{p.l}</span>
                    </div>
                  ))}
                </div>
              )}
              {showProjectConnect && (
                <div style={{ paddingTop: 6, marginTop: 6, borderTop: "1px solid #e8e5e0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2.5px dashed #2563eb" }} aria-hidden="true" /><span style={{ fontSize: 11, color: "#64615b" }}>Transit</span></div>
                </div>
              )}
              {showHolc && (
                <div style={{ paddingTop: 6, marginTop: 6, borderTop: "1px solid #e8e5e0" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {HOLC_GRADES.map((g) => (
                      <div key={g.grade} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: g.fill, border: "1px solid rgba(0,0,0,.15)" }} aria-hidden="true" />
                        <span style={{ fontSize: 11, color: "#64615b" }}>{g.grade} — {g.category}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: "#a8a49c", margin: "4px 0 0", lineHeight: 1.35 }}>{HOLC_ATTRIBUTION}</p>
                </div>
              )}
              {showPreservationAustin && (
                <div style={{ paddingTop: 6, marginTop: 6, borderTop: "1px solid #e8e5e0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { l: "PA Grant", c: "#7c3aed", k: "grant" },
                    { l: "Merit Award", c: "#2563eb", k: "merit_award" },
                    { l: "Legacy Business", c: "#d97706", k: "legacy_business" },
                    { l: "Advocacy", c: "#059669", k: "advocacy" },
                  ].map((p) => (
                    <button key={p.k} onClick={() => setPaFilter(prev => ({ ...prev, [p.k]: !prev[p.k] }))} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "2px 0", opacity: paFilter[p.k] ? 1 : 0.35 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.c }} aria-hidden="true" />
                      <span style={{ fontSize: 11, color: "#64615b" }}>{p.l}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* One-line DVI formula — the choropleth is the DVI's primary display */}
              <div style={{ borderTop: "1px solid #e8e5e0", marginTop: 8, paddingTop: 6, fontSize: 11, color: "#a8a49c", lineHeight: 1.4 }}>
                DVI = 0.35·demographic + 0.35·market + 0.30·socioeconomic (0–100)
              </div>
            </div>

            {/* Docked time bar (bottom edge of the map) */}
            <div
              style={{
                position: "absolute", left: 12, right: 12, bottom: 12, zIndex: 1000,
                background: "rgba(255,255,254,.95)", backdropFilter: "blur(4px)",
                borderRadius: 10, border: "1px solid #d6d3cd", boxShadow: "0 2px 10px rgba(0,0,0,.12)",
                padding: "8px 16px",
              }}
              role="region"
              aria-label="Time slider controls"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 32, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-.03em", lineHeight: 1 }}>{year}</span>
                  {year >= 2020 && <span style={{ fontSize: 11, color: "#a8a49c", fontStyle: "italic" }}>ACS 2019–2023 est.</span>}
                  {year < 2010 && (
                    <ConfidenceChip
                      level="Medium"
                      suffix="confidence"
                      reasons={["Pre-2010 census boundaries were crosswalked to modern tract geometry — tract values before 2010 are approximate."]}
                    />
                  )}
                </div>
                <button
                  onClick={() => {
                    if (isPlaying) setIsPlaying(false);
                    else {
                      if (year >= 2025) setYear(1990);
                      setIsPlaying(true);
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, border: "1.5px solid #0f766e", background: isPlaying ? "#0f766e" : "rgba(255,255,254,.8)", color: isPlaying ? "#fff" : "#0f766e", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 36 }}
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
              <div style={{ position: "relative", height: 22, marginTop: 2 }}>
                {SNAP_YEARS.map((sy) => (
                  <button key={sy} onClick={() => { setYear(sy); setIsPlaying(false); }} style={{ position: "absolute", left: `${((sy - 1990) / 35) * 100}%`, transform: "translateX(-50%)", fontSize: 11, color: year === sy ? "#0f766e" : "#a8a49c", fontWeight: year === sy ? 700 : 400, background: "none", border: "none", cursor: "pointer", padding: "1px 4px", minHeight: 22 }} aria-label={`Jump to ${sy}`}>{sy}</button>
                ))}
              </div>
              {/* Event tick marks — clickable popover cards arrive in Phase 5 */}
              <div style={{ position: "relative", height: 8 }} aria-hidden="true">
                {TIMELINE_EVENTS.map((evt, i) => (
                  <div key={i} title={`${evt.year} — ${evt.label}`} style={{ position: "absolute", left: `${((evt.year - 1990) / 35) * 100}%`, top: 0, transform: "translateX(-50%)", width: 2, height: 7, background: "#a8a49c", opacity: Math.abs(evt.year - year) <= 5 ? 1 : 0.35, borderRadius: 1 }} />
                ))}
              </div>
            </div>
          </div>

          {/* Deep historical context below the map */}
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "10px 16px 12px", marginTop: 12 }}>
            <LegislationTrack year={year} setYear={(y) => { setYear(y); setIsPlaying(false); }} />
          </div>
        </div>

        {/* ═══ RIGHT: DETAIL PANEL ═══ */}
        <RegionDetailPanel
          activeFeature={boundaryMode === "tracts" ? activeFeature : null}
          activeRegionName={boundaryMode === "tracts" ? activeDisplayName : neighborhoodAgg?.name}
          year={year}
          currentDvi={currentDvi}
          regionBizOpen={boundaryMode === "tracts" ? regionBizOpen : neighborhoodAgg?.bizOpen ?? []}
          regionBizClosed={boundaryMode === "tracts" ? regionBizClosed : neighborhoodAgg?.bizClosed ?? []}
          demoChartData={boundaryMode === "tracts" ? demoChartData : neighborhoodAgg?.demoChartData ?? []}
          propertyNow={boundaryMode === "tracts" ? propertyNow : neighborhoodAgg?.propertyNow}
          propertyPrev={boundaryMode === "tracts" ? propertyPrev : neighborhoodAgg?.propertyPrev}
          socioNow={boundaryMode === "tracts" ? socioNow : neighborhoodAgg?.socioNow}
          socioPrev={boundaryMode === "tracts" ? socioPrev : neighborhoodAgg?.socioPrev}
          tippingPoint={boundaryMode === "tracts" ? tippingPoint : neighborhoodAgg?.tippingPoints?.[0] ?? null}
          narrativeCallouts={boundaryMode === "tracts" ? narrativeCallouts : neighborhoodAgg?.narrativeCallouts ?? []}
          selectedBiz={selectedBiz}
          setSelectedBiz={setSelectedBiz}
          bizTab={bizTab}
          setBizTab={setBizTab}
          setSelectedRegion={setSelectedRegion}
          setHoveredRegion={setHoveredRegion}
          showPreservationAustin={showPreservationAustin}
          activeRegionId={activeRegionId}
          leafletMapRef={leafletMapRef}
          bizMarkersRef={bizMarkersRef}
          paMarkersRef={paMarkersRef}
          panelTab={panelTab}
          setPanelTab={setPanelTab}
          selectedPA={selectedPA}
          boundaryMode={boundaryMode}
          neighborhoodAgg={neighborhoodAgg}
        />
      </div>
    </section>
  );
}
