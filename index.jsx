import { useState, useEffect, useRef, useMemo, useCallback, useReducer } from "react";
import _ from "lodash";
import "./styles.css";

// Data
import {
  REGION_INDEX,
  LEGACY_OPERATING,
  LEGACY_CLOSED,
  DEMOGRAPHICS,
  SOCIOECONOMIC,
  TIPPING_POINTS,
} from "./data";

// agenda markdown will be fetched at runtime
// the files live in public/ so fetch('/ISSUES.md') works
import { PLAY_YEARS } from "./data/constants";
import { ID_TO_NAME } from "./data/regionLookup";
import { REGIONS_GEOJSON } from "./data/final_updated_regions";

// Utils
import { interpolateDvi, interpolateSocio, findPriorSocio } from "./utils/math";
import { aggregateNeighborhood } from "./utils/aggregation";
import { DEFAULT_VIEW_STATE, parseViewState, serializeViewState } from "./utils/urlState";

// Components
import Header from "./components/Header";
import AboutModal from "./components/AboutModal";
import AgendaModal from "./components/AgendaModal";
import MapView from "./components/MapView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ComparisonView from "./components/ComparisonView";
import TriageView from "./components/TriageView";
import TimelineView from "./components/TimelineView";
import HistoryView from "./components/HistoryView";

// ── Consolidated, URL-serializable view state ──
// One object holds everything a shareable link must reproduce:
// { viewMode, year, boundaryMode, layers, activeRegionId,
//   activeNeighborhoodId, compA, compB, triageLens }.
// Ephemeral UI state (hover, modals, panel tabs, playback) stays in useState.
function viewReducer(state, action) {
  switch (action.type) {
    case "set":
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };
    case "setLayer":
      if (state.layers[action.key] === action.value) return state;
      return { ...state, layers: { ...state.layers, [action.key]: action.value } };
    default:
      return state;
  }
}

export default function AustinCulturalMap() {
  // ── Core view state (reducer + URL hydration) ──
  const urlInit = useMemo(() => parseViewState(window.location.hash), []);
  const [view, dispatch] = useReducer(viewReducer, null, () => ({
    ...DEFAULT_VIEW_STATE,
    ...(urlInit || {}),
    layers: { ...DEFAULT_VIEW_STATE.layers, ...(urlInit?.layers || {}) },
  }));
  const {
    viewMode, year, boundaryMode, layers,
    activeRegionId, activeNeighborhoodId, compA, compB, triageLens,
  } = view;

  const setViewMode = useCallback((v) => dispatch({ type: "set", key: "viewMode", value: v }), []);
  const setYear = useCallback((v) => dispatch({ type: "set", key: "year", value: v }), []);
  const setBoundaryMode = useCallback((v) => dispatch({ type: "set", key: "boundaryMode", value: v }), []);
  const setActiveRegionId = useCallback((v) => dispatch({ type: "set", key: "activeRegionId", value: v }), []);
  const setActiveNeighborhoodId = useCallback((v) => dispatch({ type: "set", key: "activeNeighborhoodId", value: v }), []);
  const setCompA = useCallback((v) => dispatch({ type: "set", key: "compA", value: v }), []);
  const setCompB = useCallback((v) => dispatch({ type: "set", key: "compB", value: v }), []);
  const setTriageLens = useCallback((v) => dispatch({ type: "set", key: "triageLens", value: v }), []);
  const setShowPins = useCallback((v) => dispatch({ type: "setLayer", key: "pins", value: v }), []);
  const setShowProjectConnect = useCallback((v) => dispatch({ type: "setLayer", key: "projectConnect", value: v }), []);
  const setShowMusicVenues = useCallback((v) => dispatch({ type: "setLayer", key: "musicVenues", value: v }), []);
  const setShowDevPressure = useCallback((v) => dispatch({ type: "setLayer", key: "devPressure", value: v }), []);
  const setShowRegions = useCallback((v) => dispatch({ type: "setLayer", key: "regions", value: v }), []);
  const setShowPreservationAustin = useCallback((v) => dispatch({ type: "setLayer", key: "preservationAustin", value: v }), []);
  const setShowAisdSchools = useCallback((v) => dispatch({ type: "setLayer", key: "aisdSchools", value: v }), []);
  const setShowHolc = useCallback((v) => dispatch({ type: "setLayer", key: "holc", value: v }), []);
  const {
    pins: showPins, projectConnect: showProjectConnect, musicVenues: showMusicVenues,
    devPressure: showDevPressure, regions: showRegions,
    preservationAustin: showPreservationAustin, aisdSchools: showAisdSchools, holc: showHolc,
  } = layers;

  // ── Ephemeral UI state ──
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(urlInit?.activeRegionId ?? null);
  const [selectedBiz, setSelectedBiz] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHeritage, setShowHeritage] = useState(true);
  const [paFilter, setPaFilter] = useState({ grant: true, merit_award: true, legacy_business: true, advocacy: true });
  const [bizTab, setBizTab] = useState("open");
  const [panelTab, setPanelTab] = useState("demographics");
  const [selectedPA, setSelectedPA] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [tlFilter, setTlFilter] = useState("all");
  const [activeFeature, setActiveFeature] = useState(() =>
    urlInit?.activeRegionId != null
      ? REGIONS_GEOJSON.features.find((f) => f.properties.region_id === urlInit.activeRegionId) || null
      : null
  );

  // ── URL sync (debounced replaceState — no history spam) ──
  useEffect(() => {
    const t = setTimeout(() => {
      const hash = serializeViewState(view);
      if (window.location.hash !== hash) {
        window.history.replaceState(null, "", hash);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [view]);

  const playRef = useRef(null);
  const activeRegionName = activeFeature?.properties?.region_name;
  const activeDisplayName = activeRegionId ? (ID_TO_NAME.get(activeRegionId) || activeRegionName) : null;

  // ── Playback animation ──
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) clearInterval(playRef.current);
      return;
    }
    let idx = PLAY_YEARS.findIndex((y) => y >= year);
    if (idx < 0 || idx >= PLAY_YEARS.length - 1) idx = 0;
    playRef.current = setInterval(() => {
      idx++;
      if (idx >= PLAY_YEARS.length) {
        setIsPlaying(false);
        return;
      }
      setYear(PLAY_YEARS[idx]);
    }, 1800);
    return () => clearInterval(playRef.current);
  }, [isPlaying]);

  // ── Derived data ──
  const currentDvi = useMemo(() => {
    const m = {};
    REGION_INDEX.forEach((r) => {
      m[r.region_id] = interpolateDvi(r.region_id, year);
    });
    return m;
  }, [year]);

  const regionBizOpen = useMemo(
    () => (activeRegionId ? LEGACY_OPERATING.filter((b) => b.region_id === activeRegionId) : []),
    [activeRegionId]
  );
  const regionBizClosed = useMemo(
    () => (activeRegionId ? LEGACY_CLOSED.filter((b) => b.region_id === activeRegionId) : []),
    [activeRegionId]
  );

  const socioNow = useMemo(
    () => (activeRegionId ? interpolateSocio(activeRegionId, year) : null),
    [activeRegionId, year]
  );
  const socioPrev = useMemo(
    () => (activeRegionId ? findPriorSocio(activeRegionId, year) : null),
    [activeRegionId, year]
  );
  const tippingPoint = useMemo(
    () => (activeRegionName ? TIPPING_POINTS.find((t) => t.region === activeRegionName) : null),
    [activeRegionName]
  );

  // Neighborhood aggregation (full panel data for neighborhood mode)
  const neighborhoodAgg = useMemo(() => {
    if (boundaryMode !== "neighborhoods" || !activeNeighborhoodId) return null;
    return aggregateNeighborhood(activeNeighborhoodId, year);
  }, [boundaryMode, activeNeighborhoodId, year]);

  // Agenda parsing
  const [issuesText, setIssuesText] = useState("");

  useEffect(() => {
    fetch("/ISSUES.md")
      .then((r) => r.text())
      .then(setIssuesText)
      .catch(() => setIssuesText("") );
  }, []);

  const agendaItems = useMemo(() => {
    if (!issuesText) return [];
    const lines = issuesText.split("\n");
    const start = lines.findIndex((l) => l.startsWith("| Priority"));
    if (start < 0) return [];
    const items = [];
    for (let i = start + 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || !line.startsWith("|")) break;
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length >= 3) {
        items.push(`${cols[0]} ${cols[1]} – ${cols[2]}`);
      }
    }
    return items;
  }, [issuesText]);

  const lastUpdate = useMemo(() => new Date().toLocaleString(), []);

  // Narrative callouts
  const narrativeCallouts = useMemo(() => {
    if (!activeRegionId) return [];
    const out = [];
    const rd = DEMOGRAPHICS.filter((d) => d.region_id === activeRegionId);
    for (let i = 1; i < rd.length; i++) {
      const p = rd[i - 1];
      const c = rd[i];
      if (p.popBlack > 0) {
        const drop = (p.popBlack - c.popBlack) / p.popBlack;
        if (drop > 0.25)
          out.push({
            type: "pop_loss",
            text: `${activeDisplayName} lost ${(drop * 100).toFixed(0)}% of its Black population between ${p.year} and ${c.year} — a decline of ${(p.popBlack - c.popBlack).toLocaleString()} residents. ${c.popBlack.toLocaleString()} remained.`,
          });
      }
    }
    const rs = SOCIOECONOMIC.filter((s) => s.region_id === activeRegionId);
    for (let i = 1; i < rs.length; i++) {
      const p = rs[i - 1];
      const c = rs[i];
      if (p.homeValue > 0) {
        const inc = (c.homeValue - p.homeValue) / p.homeValue;
        if (inc > 1)
          out.push({
            type: "home_value",
            text: `Median home values rose ${(inc * 100).toFixed(0)}%, from $${(p.homeValue / 1000).toFixed(0)}k to $${(c.homeValue / 1000).toFixed(0)}k, between ${p.year} and ${c.year}.`,
          });
      }
    }
    return out;
  }, [activeRegionId, activeDisplayName, activeRegionName]);

  // Navigate from triage/compare to map, selecting a specific tract
  const handleLocateOnMap = useCallback((regionId) => {
    const feature = REGIONS_GEOJSON.features.find(
      (f) => f.properties.region_id === regionId
    );
    setBoundaryMode("tracts");
    setActiveRegionId(regionId);
    setSelectedRegion(regionId);
    setActiveFeature(feature || null);
    setViewMode("map");
  }, []);

  return (
    <div
      style={{
        background: "#f8f7f4",
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        fontFamily: "'Libre Franklin','Source Sans 3',system-ui,sans-serif",
      }}
    >
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Mobile notice — shown only on small screens via CSS */}
      <div className="mobile-notice" aria-label="Device notice">
        <h2>Desktop or Tablet Recommended</h2>
        <p>This interactive map is designed for screens 900 px or wider. Please visit on a laptop, desktop, or tablet in landscape orientation for the best experience.</p>
      </div>

      {/* Live region for screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
      >
        {activeDisplayName
          ? `Viewing ${activeDisplayName}, DVI ${(currentDvi[activeRegionId] || 0).toFixed(0)} at year ${year}`
          : `${viewMode} view, year ${year}`}
      </div>

      {/* Header */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        setShowAbout={setShowAbout}
        setShowAgenda={setShowAgenda}
      />

      {/* About Modal */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {/* Agenda Modal */}
      {showAgenda && (
        <AgendaModal
          items={agendaItems}
          lastUpdate={lastUpdate}
          onClose={() => setShowAgenda(false)}
        />
      )}

      {/* Main Content */}
      <main id="main-content" style={{ width: "100%", padding: "16px 28px 40px" }}>
        {viewMode === "timeline" && (
          <TimelineView tlFilter={tlFilter} setTlFilter={setTlFilter} />
        )}

        {viewMode === "history" && (
          <ErrorBoundary>
            <HistoryView />
          </ErrorBoundary>
        )}

        {viewMode === "compare" && (
          <ComparisonView
            compA={compA}
            setCompA={setCompA}
            compB={compB}
            setCompB={setCompB}
            boundaryMode={boundaryMode}
          />
        )}

        {viewMode === "triage" && (
          <TriageView
            boundaryMode={boundaryMode}
            onLocateOnMap={handleLocateOnMap}
            lens={triageLens}
            setLens={setTriageLens}
          />
        )}

        {viewMode === "map" && (
          <ErrorBoundary>
            <MapView
              year={year}
              setYear={setYear}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              showHeritage={showHeritage}
              setShowHeritage={setShowHeritage}
              showPins={showPins}
              setShowPins={setShowPins}
              showProjectConnect={showProjectConnect}
              setShowProjectConnect={setShowProjectConnect}
              showMusicVenues={showMusicVenues}
              setShowMusicVenues={setShowMusicVenues}
              showDevPressure={showDevPressure}
              setShowDevPressure={setShowDevPressure}
              showRegions={showRegions}
              setShowRegions={setShowRegions}
              showPreservationAustin={showPreservationAustin}
              setShowPreservationAustin={setShowPreservationAustin}
              showAisdSchools={showAisdSchools}
              setShowAisdSchools={setShowAisdSchools}
              showHolc={showHolc}
              setShowHolc={setShowHolc}
              paFilter={paFilter}
              setPaFilter={setPaFilter}
              activeRegionId={activeRegionId}
              setActiveRegionId={setActiveRegionId}
              activeFeature={activeFeature}
              setActiveFeature={setActiveFeature}
              selectedRegion={selectedRegion}
              setSelectedRegion={setSelectedRegion}
              hoveredRegion={hoveredRegion}
              setHoveredRegion={setHoveredRegion}
              selectedBiz={selectedBiz}
              setSelectedBiz={setSelectedBiz}
              bizTab={bizTab}
              setBizTab={setBizTab}
              panelTab={panelTab}
              setPanelTab={setPanelTab}
              selectedPA={selectedPA}
              setSelectedPA={setSelectedPA}
              currentDvi={currentDvi}
              regionBizOpen={regionBizOpen}
              regionBizClosed={regionBizClosed}
              tippingPoint={tippingPoint}
              narrativeCallouts={narrativeCallouts}
              boundaryMode={boundaryMode}
              setBoundaryMode={setBoundaryMode}
              activeNeighborhoodId={activeNeighborhoodId}
              setActiveNeighborhoodId={setActiveNeighborhoodId}
              neighborhoodAgg={neighborhoodAgg}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e8e5e0", padding: "16px 28px", textAlign: "center" }} role="contentinfo">
        <p style={{ fontSize: 11, color: "#a8a49c", margin: 0, lineHeight: 1.5 }}>
          Austin Cultural Displacement Map · Data compiled February 2026 · Sources: U.S. Census, ACS, TCAD, City of Austin, UT "Uprooted," community inventories
        </p>
        <p style={{ fontSize: 11, color: "#a8a49c", margin: "4px 0 0", lineHeight: 1.4 }}>
          Last update: {lastUpdate}
        </p>
      </footer>
    </div>
  );
}
