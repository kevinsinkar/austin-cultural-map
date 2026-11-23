import { useState, useEffect, useRef, useMemo, useCallback, useReducer, lazy, Suspense } from "react";
import "./styles.css";

// Data
import { PLAY_YEARS, YEAR_MIN, YEAR_MAX, LATEST_SURVEY } from "./data/constants";

// Utils
import { DEFAULT_VIEW_STATE, parseViewState, serializeViewState } from "./utils/urlState";
import { PRESENTER_MODE, isViewAllowed } from "./appConfig";
import { recomputeDvi } from "./data/auditedDvi";
import { loadDviWeights, saveDviWeights, isDefaultWeights, cloneDefaultWeights } from "./utils/dviWeights";
import { OUTREACH_STATUS } from "./data/outreachEvents";
import { tractPlace, neighborhoodPlace } from "./utils/places";

// Components
import Header from "./components/Header";
import MapView from "./components/MapView";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Loaded on demand, so the first paint does not wait for the charting
// library (story card) or the methodology text and its renderer (About).
const StoryCardPage = lazy(() => import("./components/StoryCardPage"));
const AboutModal = lazy(() => import("./components/AboutModal"));

// Presenter-only views. Each is imported on demand, and only in a presenter
// build: PRESENTER_MODE is fixed when the bundle is built, so in a public
// build every line below is simply `null` and the bundler never includes
// these modules or the data files they read (outreach events, the History
// event research, the strategic plan). Keep the `PRESENTER_MODE ? ... : null`
// written out on each line — that is what lets the bundler drop them.
const OutreachView = PRESENTER_MODE ? lazy(() => import("./components/OutreachView")) : null;
const StrategicPlanView = PRESENTER_MODE ? lazy(() => import("./components/StrategicPlanView")) : null;
const HistoryView = PRESENTER_MODE ? lazy(() => import("./components/HistoryView")) : null;
const ComparisonView = PRESENTER_MODE ? lazy(() => import("./components/ComparisonView")) : null;
const TriageView = PRESENTER_MODE ? lazy(() => import("./components/TriageView")) : null;
const TimelineView = PRESENTER_MODE ? lazy(() => import("./components/TimelineView")) : null;
const GuidedTour = PRESENTER_MODE ? lazy(() => import("./components/GuidedTour")) : null;
const AgendaModal = PRESENTER_MODE ? lazy(() => import("./components/AgendaModal")) : null;

const viewLoading = (
  <p className="page-loading" role="status"><span className="spinner" aria-hidden="true" /> Loading…</p>
);

// ── Consolidated, URL-serializable view state ──
// One object holds everything a shareable link must reproduce:
// { viewMode, year, boundaryMode, layers, activeRegionId,
//   activeNeighborhoodId, compA, compB, triageLens }.
// Ephemeral UI state (hover, modals, playback) stays in useState.
function viewReducer(state, action) {
  switch (action.type) {
    case "set":
      if (state[action.key] === action.value) return state;
      return { ...state, [action.key]: action.value };
    case "setLayer":
      if (state.layers[action.key] === action.value) return state;
      return { ...state, layers: { ...state.layers, [action.key]: action.value } };
    case "hydrate":
      // Browser Back / Forward: adopt whatever the address now says.
      return {
        ...state,
        ...action.value,
        layers: action.value.layers ? { ...state.layers, ...action.value.layers } : state.layers,
      };
    default:
      return state;
  }
}

// The map hook and panels only ever read a feature's region id.
const featureStub = (regionId) => (regionId == null ? null : { properties: { region_id: regionId } });

// Pull the roadmap table and its date out of docs/ISSUES.md (presenter only).
function parseAgenda(markdown) {
  const lines = (markdown || "").split(/\r?\n/);
  const updated = lines.map((l) => l.match(/\*\*Last updated:\*\*\s*(.+)$/)).find(Boolean)?.[1]?.trim() || null;
  const start = lines.findIndex((l) => l.startsWith("| Priority"));
  const items = [];
  if (start >= 0) {
    for (let i = start + 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || !line.startsWith("|")) break;
      const cols = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 3) items.push(`${cols[0]} ${cols[1]} – ${cols[2]}`);
    }
  }
  return { items, updated };
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

  // Every view change passes through here, so a view this build doesn't
  // allow (see appConfig.js) can never become active.
  const setViewMode = useCallback(
    (v) => dispatch({ type: "set", key: "viewMode", value: isViewAllowed(v) ? v : "map" }),
    []
  );
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
  const setShowOutreach = useCallback((v) => dispatch({ type: "setLayer", key: "outreach", value: v }), []);
  const setShowDistricts = useCallback((v) => dispatch({ type: "setLayer", key: "districts", value: v }), []);
  const setShowAreaNames = useCallback((v) => dispatch({ type: "setLayer", key: "areaNames", value: v }), []);
  const {
    pins: showPins, projectConnect: showProjectConnect, musicVenues: showMusicVenues,
    devPressure: showDevPressure, regions: showRegions,
    preservationAustin: showPreservationAustin, aisdSchools: showAisdSchools, holc: showHolc,
    outreach: showOutreach, districts: showDistricts, areaNames: showAreaNames,
  } = layers;

  // ── Adjustable DVI weights ──
  // Custom weights persist in localStorage; a non-default saved set is
  // applied before the first paint. dviVersion busts every DVI-derived memo
  // and map-style effect after a recalculation.
  const [dviWeights, setDviWeights] = useState(() => {
    // Public builds have no weights panel, so they always show the published
    // default weights — never a custom set left in this browser's storage.
    const w = PRESENTER_MODE ? loadDviWeights() : cloneDefaultWeights();
    if (!isDefaultWeights(w)) recomputeDvi(w);
    return w;
  });
  const [dviVersion, setDviVersion] = useState(0);
  const applyDviWeights = useCallback((w) => {
    recomputeDvi(w);
    saveDviWeights(w);
    setDviWeights(w);
    setDviVersion((v) => v + 1);
  }, []);

  // ── Outreach pin filters (ephemeral UI state) ──
  const [outreachStatusFilter, setOutreachStatusFilter] = useState(() => {
    const init = {};
    Object.keys(OUTREACH_STATUS).forEach((k) => { init[k] = k !== "CLOSED"; });
    return init;
  });
  const [outreachHorizon, setOutreachHorizon] = useState("upcoming");

  // ── Ephemeral UI state ──
  const [, setHoveredRegion] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(urlInit?.activeRegionId ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [paFilter, setPaFilter] = useState({ grant: true, merit_award: true, legacy_business: true, advocacy: true });
  const [showAbout, setShowAbout] = useState(false);
  const [showAgenda, setShowAgenda] = useState(false);
  const [agenda, setAgenda] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tlFilter, setTlFilter] = useState("all");
  // Cross-view history links: event to pre-select when opening the History
  // tab, and a pending main-map flyTo target.
  const [historyFocusId, setHistoryFocusId] = useState(null);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [, setActiveFeature] = useState(() => featureStub(urlInit?.activeRegionId ?? null));

  // ── URL sync ──
  // Moving between views (map to story card, tab to tab) adds a history
  // entry, so the browser's Back button returns to where you were. Changes
  // within a view (year, layers, selection) replace the current entry.
  const lastViewRef = useRef(viewMode);
  useEffect(() => {
    const t = setTimeout(() => {
      const hash = serializeViewState(view);
      if (window.location.hash !== hash) {
        if (lastViewRef.current !== view.viewMode) window.history.pushState(null, "", hash);
        else window.history.replaceState(null, "", hash);
      }
      lastViewRef.current = view.viewMode;
    }, 250);
    return () => clearTimeout(t);
  }, [view]);

  // Back / Forward (or an edited address): adopt the state in the address.
  useEffect(() => {
    const onNavigate = () => {
      const parsed = parseViewState(window.location.hash) || {};
      const next = { viewMode: "map", ...parsed };
      // A full map address with no place in it means "nothing selected";
      // a story-card address always names its place.
      if (next.viewMode !== "card") {
        if (!("activeRegionId" in parsed)) next.activeRegionId = null;
        if (!("activeNeighborhoodId" in parsed)) next.activeNeighborhoodId = null;
      }
      lastViewRef.current = next.viewMode;
      dispatch({ type: "hydrate", value: next });
      if ("activeRegionId" in next) {
        setSelectedRegion(next.activeRegionId);
        setActiveFeature(featureStub(next.activeRegionId));
      }
    };
    window.addEventListener("popstate", onNavigate);
    return () => window.removeEventListener("popstate", onNavigate);
  }, []);

  // ── Selection: one set of handlers for every entry point ──
  // (map click, search, start-here path, Triage "locate", Back/Forward)
  const selectTract = useCallback((regionId) => {
    setBoundaryMode("tracts");
    setActiveNeighborhoodId(null);
    setActiveRegionId(regionId);
    setSelectedRegion(regionId);
    setActiveFeature(featureStub(regionId));
  }, [setBoundaryMode, setActiveNeighborhoodId, setActiveRegionId]);

  const selectNeighborhood = useCallback((neighborhoodId) => {
    setBoundaryMode("neighborhoods");
    setActiveRegionId(null);
    setSelectedRegion(null);
    setActiveFeature(null);
    setActiveNeighborhoodId(neighborhoodId);
  }, [setBoundaryMode, setActiveNeighborhoodId, setActiveRegionId]);

  const clearSelection = useCallback(() => {
    setSelectedRegion(null);
    setActiveRegionId(null);
    setActiveFeature(null);
    setActiveNeighborhoodId(null);
    setHoveredRegion(null);
  }, [setActiveNeighborhoodId, setActiveRegionId]);

  // The selected place, whichever kind it is. Panels and the story card
  // take this one reference (see utils/places.js and utils/placeData.js).
  const placeRef = useMemo(() => {
    if (boundaryMode === "neighborhoods") {
      return activeNeighborhoodId ? { kind: "neighborhood", id: activeNeighborhoodId } : null;
    }
    return activeRegionId != null ? { kind: "tract", id: activeRegionId } : null;
  }, [boundaryMode, activeRegionId, activeNeighborhoodId]);

  const placeTitle = useMemo(() => {
    if (!placeRef) return null;
    const place = placeRef.kind === "neighborhood" ? neighborhoodPlace(placeRef.id) : tractPlace(placeRef.id);
    return place?.title || null;
  }, [placeRef]);

  // A story-card address with no place behind it falls back to the map.
  useEffect(() => {
    if (viewMode === "card" && !placeRef) setViewMode("map");
  }, [viewMode, placeRef, setViewMode]);

  // ── Playback animation ──
  const playRef = useRef(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── Agenda (presenter mode only) ──
  // The roadmap is an internal working list. It is read from docs/ISSUES.md
  // when the dialog is first opened, and is not part of a public build.
  const openAgenda = useCallback(() => {
    setShowAgenda(true);
    if (PRESENTER_MODE) {
      import("./docs/ISSUES.md?raw")
        .then((m) => setAgenda(parseAgenda(m.default)))
        .catch(() => setAgenda({ items: [], updated: null }));
    }
  }, []);

  // Header tabs: a plain tab click should not re-open a stale History event.
  const navigate = useCallback((v) => {
    setHistoryFocusId(null);
    setViewMode(v);
  }, [setViewMode]);

  // Timeline mark "Read more" → History tab, pre-selected on the event
  const handleOpenHistory = useCallback((eventId) => {
    setHistoryFocusId(eventId ?? null);
    setViewMode("history");
  }, [setViewMode]);

  // History event "Show on main map" → set year, fly to the event's
  // location, and enable the relevant overlay
  const handleShowEventOnMap = useCallback((ev) => {
    if (ev?.date_start_sort != null) {
      setYear(Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(ev.date_start_sort))));
    }
    const title = ev?.event_title || "";
    if (/holc|redlin/i.test(title) || ev?.event_id === "EV_1935_HOLC_MAP") setShowHolc(true);
    if (/school|aisd/i.test(title)) setShowAisdSchools(true);
    if (ev?.coordinates) {
      setFlyToTarget({ lat: ev.coordinates.lat, lng: ev.coordinates.lon, zoom: 14 });
    }
    setViewMode("map");
  }, [setYear, setShowHolc, setShowAisdSchools, setViewMode]);

  // Outreach planner "Show on map" → enable the outreach layer and fly to
  // the event's pin.
  const handleLocateEvent = useCallback((ev) => {
    if (ev?.lat == null) return;
    setShowOutreach(true);
    // Carrying the event drops a highlight pin + popup at the location.
    setFlyToTarget({ lat: ev.lat, lng: ev.lng, zoom: 15, event: ev });
    setViewMode("map");
  }, [setShowOutreach, setViewMode]);

  // Triage / Compare / tour "locate" → the map, with that tract selected
  const handleLocateOnMap = useCallback((regionId) => {
    selectTract(regionId);
    setViewMode("map");
  }, [selectTract, setViewMode]);

  return (
    <div className="app-shell">
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Live region for screen readers */}
      <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {viewMode === "card"
          ? `Story card for ${placeTitle || "the selected place"}`
          : placeTitle
            ? `Selected ${placeTitle}, showing ${year}`
            : `${viewMode} view, showing ${year}`}
      </div>

      {/* Header */}
      <Header
        viewMode={viewMode}
        setViewMode={navigate}
        setShowAbout={setShowAbout}
        onOpenAgenda={openAgenda}
        onStartTour={() => setTourOpen(true)}
      />

      {/* Guided tour (~3 min) — drives the app through its three purposes */}
      {PRESENTER_MODE && tourOpen && (
        <Suspense fallback={null}>
          <GuidedTour
            onClose={() => setTourOpen(false)}
            ctx={{
              setViewMode,
              setYear,
              setShowHolc,
              setIsPlaying,
              setTriageLens,
              locate: handleLocateOnMap,
            }}
          />
        </Suspense>
      )}

      {/* About dialog */}
      {showAbout && (
        <Suspense fallback={null}>
          <AboutModal onClose={() => setShowAbout(false)} />
        </Suspense>
      )}
      {/* Agenda dialog (presenter mode only) */}
      {PRESENTER_MODE && showAgenda && (
        <Suspense fallback={null}>
          <AgendaModal
            items={agenda?.items || []}
            updated={agenda?.updated}
            loading={!agenda}
            onClose={() => setShowAgenda(false)}
          />
        </Suspense>
      )}

      {/* Main Content */}
      <main id="main-content" className="app-main">
        {PRESENTER_MODE && viewMode === "outreach" && (
          <ErrorBoundary>
            <Suspense fallback={viewLoading}>
              <OutreachView onLocate={handleLocateEvent} />
            </Suspense>
          </ErrorBoundary>
        )}

        {PRESENTER_MODE && viewMode === "plan" && (
          <ErrorBoundary>
            <Suspense fallback={viewLoading}>
              <StrategicPlanView />
            </Suspense>
          </ErrorBoundary>
        )}

        {PRESENTER_MODE && viewMode === "timeline" && (
          <ErrorBoundary>
            <Suspense fallback={viewLoading}>
              <TimelineView tlFilter={tlFilter} setTlFilter={setTlFilter} />
            </Suspense>
          </ErrorBoundary>
        )}

        {PRESENTER_MODE && viewMode === "history" && (
          <ErrorBoundary>
            <Suspense fallback={viewLoading}>
              <HistoryView initialEventId={historyFocusId} onShowOnMap={handleShowEventOnMap} />
            </Suspense>
          </ErrorBoundary>
        )}

        {PRESENTER_MODE && viewMode === "compare" && (
          <ErrorBoundary>
            <Suspense fallback={viewLoading}>
              <ComparisonView
                compA={compA}
                setCompA={setCompA}
                compB={compB}
                setCompB={setCompB}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {PRESENTER_MODE && viewMode === "triage" && (
          <ErrorBoundary>
            <Suspense fallback={viewLoading}>
              <TriageView
                onLocateOnMap={handleLocateOnMap}
                lens={triageLens}
                setLens={setTriageLens}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {viewMode === "card" && placeRef && (
          <ErrorBoundary>
            <Suspense fallback={<p className="page-loading" role="status"><span className="spinner" aria-hidden="true" /> Loading the story card…</p>}>
              <StoryCardPage placeRef={placeRef} onBack={() => setViewMode("map")} />
            </Suspense>
          </ErrorBoundary>
        )}

        {viewMode === "map" && (
          <ErrorBoundary>
            <MapView
              year={year}
              setYear={setYear}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
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
              showOutreach={showOutreach}
              setShowOutreach={setShowOutreach}
              outreachStatusFilter={outreachStatusFilter}
              setOutreachStatusFilter={setOutreachStatusFilter}
              outreachHorizon={outreachHorizon}
              setOutreachHorizon={setOutreachHorizon}
              showDistricts={showDistricts}
              setShowDistricts={setShowDistricts}
              showAreaNames={showAreaNames}
              setShowAreaNames={setShowAreaNames}
              dviWeights={dviWeights}
              onApplyDviWeights={applyDviWeights}
              dviVersion={dviVersion}
              paFilter={paFilter}
              setPaFilter={setPaFilter}
              activeRegionId={activeRegionId}
              setActiveRegionId={setActiveRegionId}
              setActiveFeature={setActiveFeature}
              selectedRegion={selectedRegion}
              setSelectedRegion={setSelectedRegion}
              setHoveredRegion={setHoveredRegion}
              boundaryMode={boundaryMode}
              setBoundaryMode={setBoundaryMode}
              activeNeighborhoodId={activeNeighborhoodId}
              setActiveNeighborhoodId={setActiveNeighborhoodId}
              placeRef={placeRef}
              onSelectTract={selectTract}
              onSelectNeighborhood={selectNeighborhood}
              onClearSelection={clearSelection}
              onOpenCard={() => setViewMode("card")}
              onOpenHistory={handleOpenHistory}
              flyToTarget={flyToTarget}
              onFlyTo={setFlyToTarget}
              onFlyToHandled={() => setFlyToTarget(null)}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* Footer: the data date, not the time the page happened to load */}
      <footer className="app-footer" role="contentinfo">
        <p>
          Austin's Shifting Ground · Census figures: {LATEST_SURVEY} survey · Other layers updated November 2026 ·
          Sources: U.S. Census Bureau, City of Austin, Austin Transit Partnership, BASTA Austin, UT “Uprooted,”
          community inventories
        </p>
      </footer>
    </div>
  );
}
