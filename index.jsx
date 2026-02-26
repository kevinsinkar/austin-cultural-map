import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import _ from "lodash";
import "./styles.css";

// Data
import {
  REGIONS_GEOJSON,
  LEGACY_OPERATING,
  LEGACY_CLOSED,
  DEMOGRAPHICS,
  SOCIOECONOMIC,
  TIPPING_POINTS,
} from "./data";
import { PLAY_YEARS } from "./data/constants";

// Utils
import { interpolateDvi, interpolateSocio, findPriorSocio } from "./utils/math";

// Components
import Header from "./components/Header";
import AboutModal from "./components/AboutModal";
import MapView from "./components/MapView";
import ComparisonView from "./components/ComparisonView";
import TimelineView from "./components/TimelineView";

export default function AustinCulturalMap() {
  // ── Core state ──
  const [viewMode, setViewMode] = useState("map");
  const [year, setYear] = useState(2010);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedBiz, setSelectedBiz] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHeritage, setShowHeritage] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [showProjectConnect, setShowProjectConnect] = useState(false);
  const [showMusicVenues, setShowMusicVenues] = useState(false);
  const [showDevPressure, setShowDevPressure] = useState(false);
  const [bizTab, setBizTab] = useState("open");
  const [compA, setCompA] = useState("East 11th/12th Street Corridor");
  const [compB, setCompB] = useState("Holly / Rainey Street");
  const [showAbout, setShowAbout] = useState(false);
  const [tlFilter, setTlFilter] = useState("all");
  const [isMobile, setIsMobile] = useState(false);
  const [activeRegionId, setActiveRegionId] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);

  const playRef = useRef(null);
  const activeRegionName = activeFeature?.properties?.region_name;

  // ── Responsive check ──
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
    REGIONS_GEOJSON.features.forEach((f) => {
      m[f.properties.region_name] = interpolateDvi(f.properties.region_name, year);
    });
    return m;
  }, [year]);

  const regionBizOpen = useMemo(
    () => (activeRegionName ? LEGACY_OPERATING.filter((b) => b.region === activeRegionName) : []),
    [activeRegionName]
  );
  const regionBizClosed = useMemo(
    () => (activeRegionName ? LEGACY_CLOSED.filter((b) => b.region === activeRegionName) : []),
    [activeRegionName]
  );

  const demoChartData = useMemo(
    () =>
      !activeRegionName
        ? []
        : DEMOGRAPHICS.filter((d) => d.region === activeRegionName).map((d) => ({
            year: d.year,
            White: d.pctWhite,
            Black: d.pctBlack,
            Hispanic: d.pctHispanic,
            Asian: d.pctAsian,
            Other: d.pctOther,
            total: d.total,
            popBlack: d.popBlack,
            popHispanic: d.popHispanic,
            popWhite: d.popWhite,
          })),
    [activeRegionName]
  );

  const socioNow = useMemo(
    () => (activeRegionName ? interpolateSocio(activeRegionName, year) : null),
    [activeRegionName, year]
  );
  const socioPrev = useMemo(
    () => (activeRegionName ? findPriorSocio(activeRegionName, year) : null),
    [activeRegionName, year]
  );
  const tippingPoint = useMemo(
    () => (activeRegionName ? TIPPING_POINTS.find((t) => t.region === activeRegionName) : null),
    [activeRegionName]
  );

  // Narrative callouts
  const narrativeCallouts = useMemo(() => {
    if (!activeRegionName) return [];
    const out = [];
    const rd = DEMOGRAPHICS.filter((d) => d.region === activeRegionName);
    const isDove = activeRegionName === "Dove Springs";
    for (let i = 1; i < rd.length; i++) {
      const p = rd[i - 1];
      const c = rd[i];
      if (!isDove && p.popBlack > 0) {
        const drop = (p.popBlack - c.popBlack) / p.popBlack;
        if (drop > 0.25)
          out.push({
            type: "pop_loss",
            text: `${activeRegionName} lost ${(drop * 100).toFixed(0)}% of its Black population between ${p.year} and ${c.year} — a decline of ${(p.popBlack - c.popBlack).toLocaleString()} residents. ${c.popBlack.toLocaleString()} remained.`,
          });
      }
    }
    const rs = SOCIOECONOMIC.filter((s) => s.region === activeRegionName);
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
  }, [activeRegionName]);

  return (
    <div
      style={{
        background: "#f8f7f4",
        minHeight: "100vh",
        fontFamily: "'Libre Franklin','Source Sans 3',system-ui,sans-serif",
      }}
    >
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Live region for screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
      >
        {activeRegionName
          ? `Viewing ${activeRegionName}, DVI ${(currentDvi[activeRegionName] || 0).toFixed(0)} at year ${year}`
          : `${viewMode} view, year ${year}`}
      </div>

      {/* Header */}
      <Header
        viewMode={viewMode}
        setViewMode={setViewMode}
        setShowAbout={setShowAbout}
        isMobile={isMobile}
      />

      {/* About Modal */}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* Main Content */}
      <main id="main-content" style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "12px 16px 40px" : "16px 28px 40px" }}>
        {viewMode === "timeline" && (
          <TimelineView tlFilter={tlFilter} setTlFilter={setTlFilter} />
        )}

        {viewMode === "compare" && (
          <ComparisonView
            compA={compA}
            setCompA={setCompA}
            compB={compB}
            setCompB={setCompB}
            isMobile={isMobile}
          />
        )}

        {viewMode === "map" && (
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
            isMobile={isMobile}
            currentDvi={currentDvi}
            regionBizOpen={regionBizOpen}
            regionBizClosed={regionBizClosed}
            demoChartData={demoChartData}
            socioNow={socioNow}
            socioPrev={socioPrev}
            tippingPoint={tippingPoint}
            narrativeCallouts={narrativeCallouts}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e8e5e0", padding: "16px 28px", textAlign: "center" }} role="contentinfo">
        <p style={{ fontSize: 11, color: "#a8a49c", margin: 0, lineHeight: 1.5 }}>
          Austin Cultural Displacement Map · Data compiled February 2026 · Sources: U.S. Census, ACS, TCAD, City of Austin, UT "Uprooted," community inventories
        </p>
      </footer>
    </div>
  );
}
