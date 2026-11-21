import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import _ from "lodash";
import { REGION_INDEX } from "../data";
import { regionLookupMap } from "../data/regionIndex";
import { loadTractShapes, loadNeighborhoodShapes } from "../data/shapes";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import { LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES } from "../data";
import { AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID, closestRow } from "../data/auditedData";
import { interpolateDvi, getDviColor, getDviStage, getDviConfidence, isRegionExcluded, DVI_EXCLUDED } from "../utils/math";
import { getDevPressureColor } from "../utils/mapHelpers";

// Leaflet's tooltip support gives every shape a focus listener, and browsers
// then treat each one as a tab stop: hundreds of them between the search box
// and the year slider. Shapes stay clickable and hoverable; keyboard users
// choose a place from the search box instead.
function keepOutOfTabOrder(layer) {
  layer.on("add", () => {
    const el = typeof layer.getElement === "function" ? layer.getElement() : null;
    if (el) el.setAttribute("tabindex", "-1");
  });
}
import { PA_ALL, PA_COLORS } from "../data";
import { AISD_CLOSED_SCHOOLS, AISD_COLORS } from "../data/aisdSchools";
import { HOLC_1935 } from "../data/history/holc";
import { tractPlace, neighborhoodPlace } from "../utils/places";
import { pointInFeature } from "../utils/geo";
import { OUTREACH_EVENTS, OUTREACH_STATUS, OUTREACH_KINDS, isPast, eventSortTime, formatEventDate } from "../data/outreachEvents";
import { COUNCIL_DISTRICTS_GEOJSON, DISTRICT_STYLE, districtLabelPoint } from "../data/councilDistricts";

// Hover tooltip HTML: name, DVI + band, and a one-line confidence note —
// point-of-reading disclosure from the unified ConfidenceChip system.
function placeHeadHtml(place) {
  return `<strong>${place.title}</strong>` +
    (place.subtitle ? `<br/><span style="color:#64615b;font-size:12px;">${place.subtitle}</span>` : "");
}

function tractTooltipHtml(place, regionId, yr) {
  if (yr < 1993) return placeHeadHtml(place);
  const excluded = isRegionExcluded(regionId, yr);
  const dvi = interpolateDvi(regionId, yr);
  const bandTxt = excluded
    ? `<span style="color:${DVI_EXCLUDED.text};font-weight:600;">Affluent, not scored</span>`
    : `Index ${dvi.toFixed(0)}: ${getDviStage(dvi)}`;
  const conf = getDviConfidence(regionId, yr);
  return `${placeHeadHtml(place)}<br/>${bandTxt}` +
    `<br/><span style="color:#7c6f5e;font-size:12px;">${conf.level} confidence` +
    `${conf.interpolated ? " · interpolated" : ""}${yr < 2010 ? " · pre-2010 crosswalk" : ""}</span>`;
}

// Polygon look. The basemap is muted to gray (styles.css), so the index
// colors are the only color on the map and can sit a little lighter.
const OUTLINE = "#fffffe";
const FILL_OPACITY = 0.5;

// Compute the full Leaflet style for a tract polygon: binned DVI fill,
// categorical blue for capped Affluent/Excluded tracts, neutral pre-1993.
function tractStyle(regionId, yr, isActive) {
  const excluded = isRegionExcluded(regionId, yr);
  let fill;
  let opacity = FILL_OPACITY;
  if (yr < 1993) {
    fill = "#e0ddd7";
    opacity = 0.25;
  } else if (excluded) {
    fill = DVI_EXCLUDED.fill;
    opacity = 0.35;
  } else {
    fill = getDviColor(interpolateDvi(regionId, yr), false);
  }
  return {
    fillColor: fill,
    fillOpacity: opacity,
    color: isActive ? "#1a1a1a" : (excluded ? DVI_EXCLUDED.stroke : OUTLINE),
    weight: isActive ? 3 : 1,
  };
}

// Shared look of a neighborhood polygon (same ramp as tracts).
function neighborhoodStyle(aggDvi, yr, isActive) {
  return {
    fillColor: yr < 1993 ? "#e0ddd7" : getDviColor(aggDvi),
    fillOpacity: yr < 1993 ? 0.25 : FILL_OPACITY,
    color: isActive ? "#1a1a1a" : OUTLINE,
    weight: isActive ? 3 : 1,
  };
}

// Popup HTML for an outreach-event pin — enough to act on without leaving
// the map: date, status, tabling detail, contacts, source confidence.
function outreachPopupHtml(ev) {
  const meta = OUTREACH_STATUS[ev.status] || OUTREACH_STATUS.UNK;
  const contacts = (ev.contacts || [])
    .map((c) => c.includes("@")
      ? `<a href="mailto:${c}">${c}</a>`
      : c)
    .join(" · ");
  return (
    `<div style="max-width:260px;">` +
    `<strong>${ev.name}</strong>` +
    (ev.organizer ? `<br/><span style="color:#64615b;font-size:12px;">${ev.organizer}</span>` : "") +
    `<br/><span style="font-size:12px;">${formatEventDate(ev)}${ev.confidence ? ` · confidence ${ev.confidence}` : ""} · ${OUTREACH_KINDS[ev.kind]}</span>` +
    `<br/><span style="display:inline-block;margin-top:3px;font-size:12px;font-weight:700;color:${meta.color};">■ ${meta.label}</span>` +
    (ev.tablingText ? `<br/><span style="font-size:12px;color:#444;">${ev.tablingText.slice(0, 160)}${ev.tablingText.length > 160 ? "…" : ""}</span>` : "") +
    (ev.audience ? `<br/><span style="font-size:12px;color:#64615b;">Audience: ${ev.audience}</span>` : "") +
    (ev.fit ? `<br/><span style="font-size:12px;color:#64615b;">Mission fit: ${ev.fit}</span>` : "") +
    (contacts ? `<br/><span style="font-size:12px;">${contacts}</span>` : "") +
    `</div>`
  );
}

export default function useAustinMap({
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
}) {
  const leafletMapRef = useRef(null);
  const geojsonLayerRef = useRef(null); // Leaflet layer for tract regions
  const neighborhoodLayerRef = useRef(null); // Leaflet layer for neighborhoods
  const tractFeaturesRef = useRef([]); // loaded tract features, for point lookups
  // Shapes load after the map (data/shapes). shapesVersion is bumped each
  // time a layer arrives so the styling and visibility effects re-run.
  const [shapesVersion, setShapesVersion] = useState(0);
  const [tractsReady, setTractsReady] = useState(false);
  const [neighborhoodsReady, setNeighborhoodsReady] = useState(false);
  const [shapesError, setShapesError] = useState(false);
  const musicLayer = useRef(null);
  const businessLayerRef = useRef({ operating: null, closed: null });
  const bizMarkersRef = useRef(new Map());
  const paMarkersRef = useRef(new Map());

  // Keep a mutable ref to activeRegionId so GeoJSON event handlers
  // (created once in the init useEffect) always see the latest value.
  const activeRegionIdRef = useRef(activeRegionId);
  activeRegionIdRef.current = activeRegionId;

  // Same for year so mouseout can recompute the correct fill.
  const yearRef = useRef(year);
  yearRef.current = year;

  // Boundary mode ref for event handlers created once in init
  const boundaryModeRef = useRef(boundaryMode);
  boundaryModeRef.current = boundaryMode;

  const activeNeighborhoodIdRef = useRef(activeNeighborhoodId);
  activeNeighborhoodIdRef.current = activeNeighborhoodId;


  // Compute population-weighted DVI for a neighborhood at a given year
  function computeNeighborhoodDvi(hood, yr) {
    if (!hood) return 0;
    const entries = hood.tract_ids.map(id => {
      const dvi = interpolateDvi(id, yr);
      const demoRow = closestRow(AUDITED_DEMO_BY_ID.get(id), yr);
      const pop = demoRow?.total_population || 0;
      return { dvi, pop };
    }).filter(e => e.dvi != null);
    const totalPop = _.sumBy(entries, "pop");
    return totalPop > 0 ? _.sumBy(entries, e => e.dvi * e.pop) / totalPop : 0;
  }

  // ── Initialize the Leaflet map; tract shapes arrive separately ──
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    let cancelled = false;

    const map = L.map(mapRef.current).setView([30.27, -97.74], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 19,
      minZoom: 10,
    }).addTo(map);
    // Attribution stays in Leaflet's default bottom-right corner, the same
    // place as on the History map: the time bar no longer covers it.

    loadTractShapes()
      .then((shapes) => {
        if (cancelled || leafletMapRef.current !== map) return;
        tractFeaturesRef.current = shapes.features;
        geojsonLayerRef.current = L.geoJSON(shapes, {
          style: () => ({ color: OUTLINE, weight: 1, fillOpacity: 0.25, fillColor: "#e0ddd7" }),
          onEachFeature: (feature, layer) => {
            const rid = feature.properties.region_id;
            // Same title as the panel and story card (utils/places.js)
            const place = tractPlace(rid) || { title: "Census tract", subtitle: "" };
            layer.bindTooltip(place.title, { direction: "auto", sticky: true, className: "region-tooltip" });
            keepOutOfTabOrder(layer);
            layer.on({
              mouseover: (e) => {
                const l = e.target;
                const isActive = activeRegionIdRef.current === rid;
                // Hover: outline only, transparent fill, stay behind business markers
                if (!isActive) {
                  l.setStyle({ weight: 2.5, color: "#444", fillOpacity: 0 });
                }
                // Do NOT bringToFront — keep regions behind business pins
                setHoveredRegion(rid);
                l.setTooltipContent(tractTooltipHtml(place, rid, yearRef.current));
                l.openTooltip();
              },
              mouseout: (e) => {
                // Re-apply the computed style instead of resetStyle so that
                // the active-region highlight is preserved.
                e.target.setStyle(tractStyle(rid, yearRef.current, activeRegionIdRef.current === rid));
                setHoveredRegion(null);
              },
              click: (e) => {
                setActiveRegionId(rid);
                setSelectedRegion(rid);
                setActiveFeature(feature);
                e.target.bringToFront();
              },
            });
          },
        });
        setTractsReady(true);
        setShapesVersion((v) => v + 1);
      })
      .catch(() => { if (!cancelled) setShapesError(true); });

    // HOLC 1935 redlining backdrop (CC BY-NC, Mapping Inequality) — rendered in
    // its own pane below the tract polygons so DVI fills and clicks stay on top
    const holcPane = map.createPane("holcPane");
    holcPane.style.zIndex = 350;
    const holcLayer = L.geoJSON(HOLC_1935, {
      pane: "holcPane",
      interactive: false,
      style: (f) => ({
        fillColor: f.properties.fill,
        fillOpacity: 0.45,
        color: f.properties.fill,
        weight: 1,
      }),
    });

    // Point markers draw in their own pane above the shapes, so a selected
    // shape (which is raised to show its outline) never covers the pins.
    const pinsPane = map.createPane("pinsPane");
    pinsPane.style.zIndex = 450;

    // Layer groups for overlays
    const operatingLayer = L.layerGroup().addTo(map);
    const closedLayer = L.layerGroup().addTo(map);
    const musicLayerGroup = L.layerGroup().addTo(map);
    const pcLayer = L.layerGroup().addTo(map);
    const pressureLayer = L.layerGroup().addTo(map);
    const paLayer = L.layerGroup().addTo(map);
    const aisdLayer = L.layerGroup().addTo(map);
    const outreachLayer = L.layerGroup().addTo(map);

    // Council district boundaries: non-interactive dashed outlines with a
    // "D{n}" label at each district's approximate center, in a pane above
    // the tract fills so the dashes stay visible.
    const districtPane = map.createPane("districtPane");
    districtPane.style.zIndex = 430;
    districtPane.style.pointerEvents = "none";
    const districtLayer = L.layerGroup();
    L.geoJSON(COUNCIL_DISTRICTS_GEOJSON, {
      pane: "districtPane",
      interactive: false,
      style: () => DISTRICT_STYLE,
    }).addTo(districtLayer);
    COUNCIL_DISTRICTS_GEOJSON.features.forEach((f) => {
      const [lat, lng] = districtLabelPoint(f);
      L.marker([lat, lng], {
        pane: "districtPane",
        interactive: false,
        keyboard: false, // a label, not a control: keep it out of the tab order
        icon: L.divIcon({
          className: "",
          html: `<div style="font:700 12px 'Libre Franklin',sans-serif;color:#4338ca;background:rgba(255,255,254,.85);border:1.5px solid #4338ca;border-radius:10px;padding:1px 7px;white-space:nowrap;">D${f.properties.district}</div>`,
          iconSize: [34, 20],
          iconAnchor: [17, 10],
        }),
      }).addTo(districtLayer);
    });

    businessLayerRef.current = { operating: operatingLayer, closed: closedLayer };
    musicLayer.current = musicLayerGroup;

    map.scrollWheelZoom.enable();

    leafletMapRef.current = map;
    leafletMapRef.current._overlayLayers = {
      operatingLayer,
      closedLayer,
      musicLayer: musicLayerGroup,
      pcLayer,
      pressureLayer,
      paLayer,
      aisdLayer,
      holcLayer,
      outreachLayer,
      districtLayer,
    };

    return () => {
      cancelled = true;
      map.remove();
      leafletMapRef.current = null;
      geojsonLayerRef.current = null;
      neighborhoodLayerRef.current = null;
      tractFeaturesRef.current = [];
    };
  }, []);

  // ── Neighborhood shapes load the first time that view is used ──
  useEffect(() => {
    if (boundaryMode !== "neighborhoods" || neighborhoodLayerRef.current) return;
    let cancelled = false;
    const map = leafletMapRef.current;
    loadNeighborhoodShapes()
      .then((shapes) => {
        if (cancelled || !map || leafletMapRef.current !== map || neighborhoodLayerRef.current) return;
        neighborhoodLayerRef.current = L.geoJSON(shapes, {
          style: (feature) => {
            const id = feature.properties.neighborhood_id;
            const aggDvi = computeNeighborhoodDvi(NEIGHBORHOOD_BY_ID.get(id), yearRef.current);
            return neighborhoodStyle(aggDvi, yearRef.current, activeNeighborhoodIdRef.current === id);
          },
          onEachFeature: (feature, layer) => {
            const id = feature.properties.neighborhood_id;
            const hood = NEIGHBORHOOD_BY_ID.get(id);
            const place = neighborhoodPlace(id) || { title: feature.properties.neighborhood_name, subtitle: "" };
            layer.bindTooltip(place.title, { direction: "auto", sticky: true, className: "region-tooltip" });
            keepOutOfTabOrder(layer);
            layer.on({
              mouseover: (e) => {
                if (activeNeighborhoodIdRef.current !== id) {
                  e.target.setStyle({ weight: 2.5, color: "#444", fillOpacity: 0 });
                }
                const yr = yearRef.current;
                if (hood && hood.tract_ids.length === 1) {
                  // A one-tract place reads exactly as it does in tract view
                  e.target.setTooltipContent(tractTooltipHtml(place, hood.tract_ids[0], yr));
                } else if (yr >= 1993 && hood) {
                  const aggDvi = computeNeighborhoodDvi(hood, yr);
                  e.target.setTooltipContent(
                    `${placeHeadHtml(place)}<br/>Index ${aggDvi.toFixed(0)}: ${getDviStage(aggDvi)}` +
                    `<br/><span style="color:#64615b;font-size:12px;">Weighted by population` +
                    `${yr < 2010 ? " · approximate before 2010" : ""}</span>`
                  );
                } else {
                  e.target.setTooltipContent(placeHeadHtml(place));
                }
                e.target.openTooltip();
              },
              mouseout: (e) => {
                const aggDvi = computeNeighborhoodDvi(hood, yearRef.current);
                e.target.setStyle(neighborhoodStyle(aggDvi, yearRef.current, activeNeighborhoodIdRef.current === id));
              },
              click: () => {
                setActiveNeighborhoodId(id);
                setActiveRegionId(null);
                setActiveFeature(null);
              },
            });
          },
        });
        setNeighborhoodsReady(true);
        setShapesVersion((v) => v + 1);
      })
      .catch(() => { if (!cancelled) setShapesError(true); });
    return () => { cancelled = true; };
  }, [boundaryMode]);

  // ── Update region styles when year or active selection changes ──
  useEffect(() => {
    const layer = geojsonLayerRef.current;
    if (!layer) return;
    layer.setStyle((feature) => {
      const regionId = feature.properties.region_id;
      if (!regionLookupMap.has(regionId)) return {};
      return tractStyle(regionId, year, activeRegionId === regionId);
    });
  }, [year, activeRegionId, dviVersion, shapesVersion]);

  // ── Tracts and neighborhoods are exclusive: clear the other selection ──
  // (Which layer is on the map is handled by the visibility effect below.)
  useEffect(() => {
    if (boundaryMode === "tracts") {
      setActiveNeighborhoodId(null);
    } else {
      setActiveRegionId(null);
      setActiveFeature(null);
    }
  }, [boundaryMode]);

  // ── Update neighborhood styles when year or selection changes ──
  useEffect(() => {
    const layer = neighborhoodLayerRef.current;
    if (!layer || boundaryMode !== "neighborhoods") return;
    layer.setStyle((feature) => {
      const id = feature.properties.neighborhood_id;
      const aggDvi = computeNeighborhoodDvi(NEIGHBORHOOD_BY_ID.get(id), year);
      return neighborhoodStyle(aggDvi, year, activeNeighborhoodId === id);
    });
  }, [year, activeNeighborhoodId, boundaryMode, dviVersion, shapesVersion]);

  // ── Toggle region polygon visibility ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const tractLayer = geojsonLayerRef.current;
    const neighborhoodLayer = neighborhoodLayerRef.current;
    if (!map) return;

    if (showRegions) {
      const activeLayer = boundaryMode === "tracts" ? tractLayer : neighborhoodLayer;
      const inactiveLayer = boundaryMode === "tracts" ? neighborhoodLayer : tractLayer;
      if (activeLayer && !map.hasLayer(activeLayer)) {
        activeLayer.addTo(map);
        // Shapes can arrive after the pins: keep polygons underneath them
        // so anchors stay visible and clickable.
        activeLayer.bringToBack();
      }
      if (inactiveLayer && map.hasLayer(inactiveLayer)) map.removeLayer(inactiveLayer);
    } else {
      if (tractLayer && map.hasLayer(tractLayer)) map.removeLayer(tractLayer);
      if (neighborhoodLayer && map.hasLayer(neighborhoodLayer)) map.removeLayer(neighborhoodLayer);
    }
  }, [showRegions, boundaryMode, shapesVersion]);

  // ── Update overlays (business markers, music venues, PC lines, dev pressure) ──
  useEffect(() => {
    const mapObj = leafletMapRef.current;
    if (!mapObj) return;
    const { operatingLayer, closedLayer, musicLayer, pcLayer, pressureLayer, paLayer, aisdLayer } =
      mapObj._overlayLayers || {};

    operatingLayer && operatingLayer.clearLayers();
    closedLayer && closedLayer.clearLayers();
    musicLayer && musicLayer.clearLayers();
    pcLayer && pcLayer.clearLayers();
    pressureLayer && pressureLayer.clearLayers();
    paLayer && paLayer.clearLayers();
    aisdLayer && aisdLayer.clearLayers();
    bizMarkersRef.current.clear();
    paMarkersRef.current.clear();

    // Build music lookup cache (only done once per overlay update, not per render)
    const musicByRegion = new Map();
    MUSIC_NIGHTLIFE.forEach(m => {
      const key = m.region_id ?? m.region;           // fallback to name if no id yet
      if (!musicByRegion.has(key)) musicByRegion.set(key, []);
      musicByRegion.get(key).push(m);
    });
    // Use pre-built AUDITED_PROP_BY_ID map (already indexed by region_id)
    // instead of rebuilding from the raw PROPERTY_DATA array each time

    // Businesses
    if (showPins) {
      LEGACY_OPERATING.filter((b) => b.est <= year).forEach((b) => {
        if (!b.lat || !b.lng) return;
        const m = L.circleMarker([b.lat, b.lng], {
          pane: "pinsPane",
          radius: 6,
          fillColor: "#4ade80",
          color: "#fff",
          weight: 1,
          fillOpacity: 0.95,
        }).addTo(operatingLayer);
        m.bindPopup(`<strong>${b.name}</strong><br/>Est. ${b.est}<br/>${b.address}`);
        bizMarkersRef.current.set(b.id, m);
      });
      LEGACY_CLOSED.forEach((b) => {
        if (!b.lat || !b.lng) return;
        if (!b.closed || year < b.closed) return;
        const m = L.circleMarker([b.lat, b.lng], {
          pane: "pinsPane",
          radius: 5,
          fillColor: "#a8a29a",
          color: "#fff",
          weight: 1,
          fillOpacity: 0.85,
        }).addTo(closedLayer);
        m.bindPopup(`<strong>${b.name}</strong><br/>Closed ${b.closed}<br/>${b.relocated || ""}`);
        bizMarkersRef.current.set(b.id, m);
      });
    }

    // Music venues per region (using region center from REGION_INDEX)
    if (showMusicVenues && musicLayer) {
      REGION_INDEX.forEach((region) => {
        const rows = musicByRegion.get(region.region_id) || musicByRegion.get(region.region_name) || [];
        if (!rows.length) return;
        const best = rows.reduce(
          (a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a),
          rows[0]
        );
        const txt = `${best.independent + (best.corporate || 0)} venues`;
        L.circleMarker([region.lat, region.lng], {
          pane: "pinsPane",
          radius: Math.min(16, 4 + (best.independent || 0)),
          fillColor: "rgba(124,58,237,0.15)",
          color: "#7c3aed",
          weight: 1,
        }).addTo(musicLayer);
        L.marker([region.lat, region.lng], { interactive: false, keyboard: false, opacity: 0.9 })
          .bindTooltip(txt, {
            direction: "top",
            permanent: true,
            offset: [0, -10],
            className: "music-tooltip",
          })
          .addTo(musicLayer);
      });
    }

    // Project Connect lines
    if (showProjectConnect && pcLayer) {
      PROJECT_CONNECT_LINES.forEach((l) => {
        const latlngs = l.coords.map((c) => [c[1], c[0]]);
        L.polyline(latlngs, { color: l.color, weight: 3, dashArray: "8 4", opacity: 0.8 }).addTo(
          pcLayer
        );
      });
    }

    // Development pressure outlines
    if (showDevPressure && geojsonLayerRef.current) {
      geojsonLayerRef.current.eachLayer((layer) => {
        const props = layer.feature.properties;
        const rows = AUDITED_PROP_BY_ID.get(props.region_id) || [];
        if (!rows.length) return;
        const closest = rows.reduce(
          (a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a),
          rows[0]
        );
        if (!closest) return;
        const yoy = closest.pct_home_value_change_yoy ?? closest.yoy ?? 0;
        if (!yoy || yoy < 0.05) return;

        const strokeW = Math.max(0.0002, yoy * 0.0001);
        layer.setStyle({ weight: strokeW, color: getDevPressureColor(props.region_id, year) });
      });
    }
    // When dev-pressure is off (or after any overlay update), re-apply the
    // correct DVI + active-region styling so that the highlighting effect
    // and this effect don't fight each other.
    if (!showDevPressure && geojsonLayerRef.current) {
      geojsonLayerRef.current.eachLayer((layer) => {
        const regionId = layer.feature.properties.region_id;
        layer.setStyle(tractStyle(regionId, year, activeRegionId === regionId));
      });
    }
    // Preservation Austin overlay
    if (showPreservationAustin && paLayer) {
      PA_ALL.forEach((item) => {
        if (!item.lat || !item.lng) return;
        if (item.year > year) return;
        if (paFilter && !paFilter[item.type]) return;
        const color = PA_COLORS[item.type] || "#7c3aed";
        const radius = item.type === "grant"
          ? Math.min(7, 3 + (item.amount || 0) / 2000)
          : 4;
        const m = L.circleMarker([item.lat, item.lng], {
          pane: "pinsPane",
          radius,
          fillColor: color,
          color: "#fff",
          weight: 1,
          fillOpacity: 0.9,
        }).addTo(paLayer);
        const label = item.type === "grant" ? "Grant" : item.type === "merit_award" ? "Merit Award" : item.type === "legacy_business" ? "Legacy Business" : "Advocacy";
        const amountStr = item.amount ? `<br/>$${item.amount.toLocaleString()}` : "";
        m.bindPopup(`<strong>${item.name}</strong><br/><em>${label} · ${item.year}</em>${amountStr}<br/>${item.description}`);
        paMarkersRef.current.set(item.id, m);
      });
    }
    // AISD closed/consolidated schools overlay
    if (showAisdSchools && aisdLayer) {
      AISD_CLOSED_SCHOOLS.forEach((school) => {
        if (!school.lat || !school.lng) return;
        const alreadyClosed = school.year_closed <= year;
        const color = alreadyClosed ? AISD_COLORS.closed : AISD_COLORS.futureClosure;
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:13px;height:13px;background:${alreadyClosed ? color : "#fffffe"};border:2px solid ${color};border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${alreadyClosed ? "#fff" : color};line-height:1;">✕</div>`,
          iconSize: [13, 13],
          iconAnchor: [7, 7],
        });
        const m = L.marker([school.lat, school.lng], { icon }).addTo(aisdLayer);
        const enrollStr = school.enrollment_at_closure
          ? `<br/>~${school.enrollment_at_closure.toLocaleString()} students at closure`
          : "";
        const statusStr = alreadyClosed
          ? `Closed ${school.year_closed}`
          : `Closes ${school.year_closed} (open in ${year})`;
        m.bindTooltip(`${school.name} — ${statusStr}`, { direction: "top" });
        m.bindPopup(
          `<strong>${school.name}</strong><br/><em>AISD ${school.level} · ${statusStr}</em>${enrollStr}<br/>${school.fate}` +
          (school.source ? `<br/><a href="${school.source}" target="_blank" rel="noopener">Source ↗</a>` : "")
        );
      });
    }
  }, [year, activeRegionId, showPins, showMusicVenues, showProjectConnect, showDevPressure, showPreservationAustin, paFilter, showAisdSchools, dviVersion, shapesVersion]);

  // ── Outreach / tabling-opportunity pins ──
  // Independent of the history-year slider: these are 2026–27 opportunities
  // overlaid on whatever data layer is underneath. Diamond pins colored by
  // tabling status so they never read as DVI data.
  useEffect(() => {
    const mapObj = leafletMapRef.current;
    const outreachLayer = mapObj?._overlayLayers?.outreachLayer;
    if (!mapObj || !outreachLayer) return;
    outreachLayer.clearLayers();
    if (!showOutreach) return;

    const now = Date.now();
    const in60 = now + 60 * 24 * 3600 * 1000;
    OUTREACH_EVENTS.forEach((ev) => {
      if (ev.lat == null || ev.lng == null) return;
      if (outreachStatusFilter && !outreachStatusFilter[ev.status]) return;
      if (outreachHorizon !== "all" && isPast(ev, now)) return;
      if (outreachHorizon === "60" && ev.kind === "dated") {
        const t = eventSortTime(ev);
        if (t == null || t > in60) return;
      }
      const meta = OUTREACH_STATUS[ev.status] || OUTREACH_STATUS.UNK;
      const recurring = ev.kind !== "dated";
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;background:${meta.color};transform:rotate(45deg);border:1.5px solid #fffffe;border-radius:${recurring ? "50%" : "2px"};box-shadow:0 1px 3px rgba(0,0,0,.35);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const m = L.marker([ev.lat, ev.lng], { icon, zIndexOffset: 500, keyboard: false }).addTo(outreachLayer);
      m.bindTooltip(`${ev.name} — ${formatEventDate(ev)}`, { direction: "top", offset: [0, -6] });
      m.bindPopup(outreachPopupHtml(ev), { maxWidth: 280 });
    });
  }, [showOutreach, outreachStatusFilter, outreachHorizon]);

  // ── Toggle HOLC 1935 redlining layer ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const holcLayer = map?._overlayLayers?.holcLayer;
    if (!map || !holcLayer) return;
    if (showHolc && !map.hasLayer(holcLayer)) holcLayer.addTo(map);
    if (!showHolc && map.hasLayer(holcLayer)) map.removeLayer(holcLayer);
  }, [showHolc]);

  // ── Toggle council district boundaries ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const districtLayer = map?._overlayLayers?.districtLayer;
    if (!map || !districtLayer) return;
    if (showDistricts && !map.hasLayer(districtLayer)) districtLayer.addTo(map);
    if (!showDistricts && map.hasLayer(districtLayer)) map.removeLayer(districtLayer);
  }, [showDistricts]);

  // ── Auto-zoom to the selected tract (also once its shape has loaded) ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = geojsonLayerRef.current;
    if (!map || !layer || !activeRegionId) return;

    let targetLayer = null;
    layer.eachLayer((lyr) => {
      if (lyr.feature?.properties?.region_id === activeRegionId) {
        targetLayer = lyr;
      }
    });

    if (targetLayer) {
      map.fitBounds(targetLayer.getBounds(), { padding: [80, 80], maxZoom: 14 });
      targetLayer.bringToFront();
    }
  }, [activeRegionId, tractsReady]);

  // ── Auto-zoom to the selected neighborhood, the same way ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = neighborhoodLayerRef.current;
    if (!map || !layer || !activeNeighborhoodId || boundaryMode !== "neighborhoods") return;
    layer.eachLayer((lyr) => {
      if (lyr.feature?.properties?.neighborhood_id === activeNeighborhoodId) {
        map.fitBounds(lyr.getBounds(), { padding: [80, 80], maxZoom: 14 });
      }
    });
  }, [activeNeighborhoodId, neighborhoodsReady, boundaryMode]);

  // ── Fly to a pending target (e.g., a History event's location, or an
  // outreach event located from the planner) ──
  const highlightMarkerRef = useRef(null);
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo([flyToTarget.lat, flyToTarget.lng], flyToTarget.zoom || 14, { duration: 0.9 });

    // When the target carries an outreach event, drop a prominent pin at
    // its (approximate) location and open its popup — the flat diamond
    // alone is easy to lose among the other markers.
    if (highlightMarkerRef.current) {
      map.removeLayer(highlightMarkerRef.current);
      highlightMarkerRef.current = null;
    }
    const ev = flyToTarget.event;
    if (ev) {
      const meta = OUTREACH_STATUS[ev.status] || OUTREACH_STATUS.UNK;
      const icon = L.divIcon({
        className: "",
        html:
          `<svg width="34" height="46" viewBox="0 0 34 46" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));">` +
          `<path d="M17 1C8.7 1 2 7.7 2 16c0 10.5 15 29 15 29s15-18.5 15-29C32 7.7 25.3 1 17 1z" fill="${meta.color}" stroke="#fffffe" stroke-width="2"/>` +
          `<circle cx="17" cy="16" r="5.5" fill="#fffffe"/></svg>`,
        iconSize: [34, 46],
        iconAnchor: [17, 45],
        popupAnchor: [0, -42],
      });
      const m = L.marker([flyToTarget.lat, flyToTarget.lng], { icon, zIndexOffset: 2000 }).addTo(map);
      const approxNote = ev.geo === "venue"
        ? `<br/><em style="font-size:12px;color:var(--muted);">Location approximate (geocoded from venue name)</em>` : "";
      m.bindPopup(outreachPopupHtml(ev) + approxNote, { maxWidth: 280 });
      highlightMarkerRef.current = m;
      // Open after the fly animation settles so the popup doesn't jump.
      setTimeout(() => { if (highlightMarkerRef.current === m) m.openPopup(); }, 950);
    }
    // A labelled target without an event (an address from the search box)
    // gets a plain pin so the person can see where the address landed.
    if (!ev && flyToTarget.label) {
      const icon = L.divIcon({
        className: "",
        html:
          `<svg width="30" height="40" viewBox="0 0 34 46" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));">` +
          `<path d="M17 1C8.7 1 2 7.7 2 16c0 10.5 15 29 15 29s15-18.5 15-29C32 7.7 25.3 1 17 1z" fill="#0f766e" stroke="#fffffe" stroke-width="2"/>` +
          `<circle cx="17" cy="16" r="5.5" fill="#fffffe"/></svg>`,
        iconSize: [30, 40],
        iconAnchor: [15, 39],
        popupAnchor: [0, -36],
      });
      const m = L.marker([flyToTarget.lat, flyToTarget.lng], { icon, zIndexOffset: 2000, keyboard: false }).addTo(map);
      const safe = String(flyToTarget.label).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      m.bindPopup(`<strong>${safe}</strong>`, { maxWidth: 240 });
      highlightMarkerRef.current = m;
      setTimeout(() => { if (highlightMarkerRef.current === m) m.openPopup(); }, 950);
    }
    onFlyToHandled?.();
  }, [flyToTarget]);

  // ── Clear active feature when selectedRegion is cleared ──
  useEffect(() => {
    if (selectedRegion === null) {
      setActiveRegionId(null);
      setActiveFeature(null);
    }
  }, [selectedRegion]);

  // Which census tract contains a point (address search). Null when the
  // point is outside every tract or the shapes have not loaded yet.
  const locateTract = useCallback((lat, lng) => {
    for (const f of tractFeaturesRef.current) {
      if (pointInFeature(lat, lng, f)) return f.properties.region_id;
    }
    return null;
  }, []);

  const shapesLoading = !shapesError && (boundaryMode === "tracts" ? !tractsReady : !neighborhoodsReady);

  return { leafletMapRef, bizMarkersRef, paMarkersRef, shapesLoading, shapesError, locateTract };
}
