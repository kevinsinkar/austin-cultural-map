import { useEffect, useMemo, useRef, useState } from "react";
import useAustinMap from "../hooks/useAustinMap";
import PlaceSummaryPanel from "./PlaceSummaryPanel";
import AreaCard from "./AreaCard";
import { loadAreaShapes } from "../data/shapes";
import StartHere from "./StartHere";
import PlaceSearch from "./PlaceSearch";
import MapLegend from "./MapLegend";
import TimeBar from "./TimeBar";
import LegislationTrack from "./LegislationTrack";
import LayersPopover from "./LayersPopover";
import { STAGE_CLASSES, STAGE_BASE_YEAR } from "../utils/stages";
import DviWeightsPanel from "./DviWeightsPanel";
import { OUTREACH_STATUS } from "../data/outreachEvents";
import { tractPlace } from "../utils/places";
import { PRESENTER_MODE } from "../appConfig";
import { DEFAULT_YEAR, YEAR_MAX } from "../data/constants";
import { UNVERIFIED_NOTE } from "../data/businesses";

/**
 * MapView — the map page.
 *
 * Reading order, top to bottom: find a place (search, layers), the color
 * key, the map, the year controls, then the place panel. On wide screens
 * the place panel sits beside the map; on tablets and phones it follows the
 * year controls (the layout rules are in styles.css under "Map page").
 *
 * Nothing floats on top of the map any more: the legend is a strip above it
 * and the year controls are docked below it.
 */
export default function MapView({
  year,
  setYear,
  isPlaying,
  setIsPlaying,
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
  showOutreach,
  setShowOutreach,
  outreachStatusFilter,
  setOutreachStatusFilter,
  outreachHorizon,
  setOutreachHorizon,
  showDistricts,
  setShowDistricts,
  showAreaNames,
  setShowAreaNames,
  dviWeights,
  onApplyDviWeights,
  dviVersion,
  paFilter,
  setPaFilter,
  activeRegionId,
  setActiveRegionId,
  setActiveFeature,
  selectedRegion,
  setSelectedRegion,
  setHoveredRegion,
  // Boundary mode
  boundaryMode,
  setBoundaryMode,
  activeNeighborhoodId,
  setActiveNeighborhoodId,
  // Selection, routed through index.jsx so every entry point behaves alike
  placeRef,
  onSelectTract,
  onSelectNeighborhood,
  onClearSelection,
  onOpenCard,
  // History cross-links and "show on map" requests
  onOpenHistory,
  flyToTarget,
  onFlyTo,
  onFlyToHandled,
}) {
  const mapRef = useRef(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // ── Area names (City planning areas) ──
  // The shapes are fetched the first time the names are shown or an area is
  // chosen from the search box. areaId is the area outlined on the map.
  const [areaShapes, setAreaShapes] = useState(null);
  const [areaId, setAreaId] = useState(null);
  useEffect(() => {
    if (areaShapes || !(showAreaNames || areaId)) return undefined;
    let cancelled = false;
    loadAreaShapes().then((shapes) => { if (!cancelled) setAreaShapes(shapes); }).catch(() => {});
    return () => { cancelled = true; };
  }, [showAreaNames, areaId, areaShapes]);
  const areaById = useMemo(
    () => new Map((areaShapes?.features || []).map((f) => [f.properties.id, f.properties])),
    [areaShapes]
  );
  const area = areaId ? areaById.get(areaId) : null;
  // Choosing an area puts its card in the side panel, so any selected tract
  // or neighborhood steps aside. Closing a tract later returns to the area.
  const selectArea = (id) => {
    onClearSelection();
    setAreaId(id);
  };

  const { shapesLoading, shapesError, locateTract } = useAustinMap({
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
    showOutreach,
    outreachStatusFilter,
    outreachHorizon,
    showDistricts,
    showAreaNames,
    areaShapes,
    activeAreaId: areaId,
    onSelectArea: selectArea,
    dviVersion,
    paFilter,
    selectedRegion,
    setActiveRegionId,
    setSelectedRegion,
    setActiveFeature,
    setHoveredRegion,
    boundaryMode,
    activeNeighborhoodId,
    setActiveNeighborhoodId,
    flyToTarget,
    onFlyToHandled,
  });

  // ── Search results ──
  const handleAnchor = (business) => {
    setShowPins(true);
    // A closed anchor only has a dot from the year it closed onward.
    if (business.closed && year < business.closed) setYear(Math.min(YEAR_MAX, business.closed));
    if (!business.closed && business.est > year) setYear(DEFAULT_YEAR);
    if (business.region_id != null) onSelectTract(business.region_id);
    onFlyTo({ lat: business.lat, lng: business.lng, zoom: 16, label: business.name, note: business.unverified ? UNVERIFIED_NOTE : null });
  };

  // An address resolves to the tract that contains it. Returns the place
  // title so the search box can say where the address landed.
  const handleAddress = ({ lat, lng, label }) => {
    const regionId = locateTract(lat, lng);
    if (regionId == null) return null;
    onSelectTract(regionId);
    onFlyTo({ lat, lng, zoom: 15, label });
    return tractPlace(regionId);
  };

  // ── "Start here" actions (data/bigIdeas.js) ──
  const handleStartAction = (action) => {
    if (!action) return;
    if (action.key === "holc") {
      setShowHolc(!showHolc);
    } else if (action.key === "example") {
      onSelectTract(action.tractId);
    } else if (action.key === "legend") {
      setShowRegions(true);
      if (year < STAGE_BASE_YEAR) setYear(DEFAULT_YEAR);
      setLegendOpen(true);
    } else if (action.key === "anchors") {
      setShowPins(true);
      setIsPlaying(false);
      setYear(YEAR_MAX);
    }
  };

  // Grouped layer model for the Layers popover — the grouping teaches the
  // data model: Boundaries / Cultural assets / Pressure / Historical.
  const layerGroups = [
    {
      title: "Boundaries",
      items: [
        { on: showRegions, toggle: () => setShowRegions(!showRegions), label: "Displacement stage colors", icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: STAGE_CLASSES[2].fill, border: "1px solid rgba(0,0,0,.15)" }} aria-hidden="true" /> },
        { on: showDistricts, toggle: () => setShowDistricts(!showDistricts), label: "Council districts", icon: <span style={{ width: 9, height: 9, borderRadius: 2, border: "1.5px dashed #4338ca" }} aria-hidden="true" /> },
        { on: showAreaNames, toggle: () => setShowAreaNames(!showAreaNames), label: "Area names", icon: <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, color: "#26231f" }} aria-hidden="true">Aa</span> },
      ],
    },
    // Tabling opportunities are private planning data — presenter mode only.
    ...(PRESENTER_MODE ? [{
      title: "Outreach",
      items: [
        { on: showOutreach, toggle: () => setShowOutreach(!showOutreach), label: "Tabling opportunities", icon: <span style={{ width: 9, height: 9, background: "#15803d", transform: "rotate(45deg)", borderRadius: 2 }} aria-hidden="true" /> },
      ],
    }] : []),
    {
      title: "Cultural assets",
      items: [
        { on: showPins, toggle: () => setShowPins(!showPins), label: "Legacy businesses", icon: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", border: "1.5px solid #64615b" }} aria-hidden="true" /> },
        { on: showMusicVenues, toggle: () => setShowMusicVenues(!showMusicVenues), label: "Music venues", icon: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(124,58,237,.2)", border: "1.5px solid #7c3aed" }} aria-hidden="true" /> },
        { on: showPreservationAustin, toggle: () => setShowPreservationAustin(!showPreservationAustin), label: "Preservation Austin records", icon: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed" }} aria-hidden="true" /> },
      ],
    },
    {
      title: "Pressure",
      items: [
        { on: showProjectConnect, toggle: () => setShowProjectConnect(!showProjectConnect), label: "Planned light rail", icon: <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path d="M1 9L6 1L11 9" stroke="#2563eb" strokeWidth="1.5" fill="none" /></svg> },
        { on: showDevPressure, toggle: () => setShowDevPressure(!showDevPressure), label: "Development pressure", icon: <span style={{ width: 9, height: 9, borderRadius: 2, border: "2px solid #fb923c" }} aria-hidden="true" /> },
      ],
    },
    {
      title: "Historical",
      items: [
        { on: showHolc, toggle: () => setShowHolc(!showHolc), label: "1935 redlining map", icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: "#d9838d" }} aria-hidden="true" /> },
        { on: showAisdSchools, toggle: () => setShowAisdSchools(!showAisdSchools), label: "AISD school closures", icon: <span style={{ width: 9, height: 9, borderRadius: 2, background: "#b91c1c" }} aria-hidden="true" /> },
      ],
    },
  ];

  return (
    <section aria-label="Map" className="map-layout">
      <div className="map-main">
        {/* Find a place, choose layers */}
        <div className="map-toolbar" role="toolbar" aria-label="Map controls">
          <PlaceSearch
            onSelectTract={onSelectTract}
            onSelectNeighborhood={onSelectNeighborhood}
            onSelectAnchor={handleAnchor}
            onSelectArea={selectArea}
            onAddress={handleAddress}
          />
          <LayersPopover boundaryMode={boundaryMode} setBoundaryMode={setBoundaryMode} groups={layerGroups} />
          {PRESENTER_MODE && dviWeights && onApplyDviWeights && (
            <DviWeightsPanel weights={dviWeights} onApply={onApplyDviWeights} />
          )}
          {PRESENTER_MODE && showOutreach && (
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }} role="group" aria-label="Tabling opportunity filters">
              {Object.entries(OUTREACH_STATUS).map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOutreachStatusFilter((f) => ({ ...f, [key]: !f[key] }))}
                  aria-pressed={outreachStatusFilter[key]}
                  title={meta.desc}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", minHeight: 26,
                    borderRadius: 13, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1.5px solid ${outreachStatusFilter[key] ? meta.color : "#d6d3cd"}`,
                    background: outreachStatusFilter[key] ? `${meta.color}14` : "#fffffe",
                    color: outreachStatusFilter[key] ? meta.color : "var(--muted)",
                  }}
                >
                  <span style={{ width: 7, height: 7, background: outreachStatusFilter[key] ? meta.color : "#d6d3cd", transform: "rotate(45deg)", borderRadius: 1.5 }} aria-hidden="true" />
                  {meta.label}
                </button>
              ))}
              <select
                value={outreachHorizon}
                onChange={(e) => setOutreachHorizon(e.target.value)}
                aria-label="Tabling event timeframe"
                style={{ padding: "4px 6px", fontSize: 12, minHeight: 26, border: "1px solid #d6d3cd", borderRadius: 7, background: "#fffffe", color: "#1a1a1a" }}
              >
                <option value="upcoming">Upcoming</option>
                <option value="60">Next 60 days</option>
                <option value="all">All (incl. past)</option>
              </select>
            </div>
          )}
        </div>

        {boundaryMode === "neighborhoods" && (
          <p className="map-mode-note">
            Showing neighborhoods. A neighborhood combines the census tracts that sit inside a
            City of Austin planning area; areas without one are shown as single tracts.
          </p>
        )}

        <MapLegend
          year={year}
          showRegions={showRegions}
          showPins={showPins}
          showProjectConnect={showProjectConnect}
          showHolc={showHolc}
          showPreservationAustin={showPreservationAustin}
          showOutreach={showOutreach}
          paFilter={paFilter}
          setPaFilter={setPaFilter}
          open={legendOpen}
          setOpen={setLegendOpen}
        />

        <div className="map-frame">
          <div
            ref={mapRef}
            id="map-container"
            role="region"
            aria-label="Map of Austin, colored by displacement stage. To choose a place or a named area without a pointer, use the search box above the map."
            style={{ position: "absolute", inset: 0 }}
          />
          {(shapesLoading || shapesError) && (
            <div className="map-loading" role="status">
              {shapesError ? (
                <>The neighborhood shapes could not be loaded. Check your connection and reload the page.</>
              ) : (
                <><span className="spinner" aria-hidden="true" /> Loading neighborhood shapes…</>
              )}
            </div>
          )}
        </div>

        <TimeBar
          year={year}
          setYear={setYear}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          onOpenHistory={onOpenHistory}
        />
      </div>

      {/* Place panel: beside the map on wide screens, after the year
          controls on narrow ones. One panel for tracts and neighborhoods. */}
      <aside className="map-side" aria-label="Selected place">
        {placeRef && area && (
          <p className="area-context">
            Outlined on the map:{" "}
            <button type="button" className="link-button" onClick={onClearSelection}>{area.name}</button>
            <button type="button" className="link-button" onClick={() => setAreaId(null)}>Remove outline</button>
          </p>
        )}
        {placeRef ? (
          <PlaceSummaryPanel
            placeRef={placeRef}
            year={year}
            onClose={onClearSelection}
            onOpenCard={onOpenCard}
          />
        ) : area ? (
          <AreaCard
            area={area}
            areaById={areaById}
            onClose={() => setAreaId(null)}
            onSelectArea={selectArea}
            onSelectTract={onSelectTract}
            onSelectNeighborhood={onSelectNeighborhood}
          />
        ) : (
          <StartHere onAction={handleStartAction} holcOn={showHolc} />
        )}
      </aside>

      {/* State legislation context */}
      <div className="map-extra">
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "10px 16px 12px" }}>
          <LegislationTrack year={year} setYear={(y) => { setYear(y); setIsPlaying(false); }} />
        </div>
      </div>
    </section>
  );
}
