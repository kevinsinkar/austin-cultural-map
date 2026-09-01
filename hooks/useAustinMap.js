import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import _ from "lodash";
import { REGION_INDEX } from "../data";
import { regionLookupMap } from "../data/regionIndex";
import { REGIONS_GEOJSON } from "../data/final_updated_regions";
import { NEIGHBORHOODS_GEOJSON } from "../data/neighborhoods_geojson";
import { NEIGHBORHOOD_BY_ID } from "../data/neighborhoods";
import { LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES } from "../data";
import { AUDITED_PROP_BY_ID, AUDITED_DEMO_BY_ID, closestRow } from "../data/auditedData";
import { AUDITED_DVI_LOOKUP } from "../data/auditedDvi";
import { interpolateDvi, getDviColor } from "../utils/math";
import { getDevPressureColor } from "../utils/mapHelpers";
import { PA_ALL, PA_COLORS } from "../data";

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
}) {
  const leafletMapRef = useRef(null);
  const geojsonLayerRef = useRef(null); // Leaflet layer for tract regions
  const neighborhoodLayerRef = useRef(null); // Leaflet layer for neighborhoods
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


  // utility: round coordinates in GeoJSON to reduce precision
  function simplifyGeojsonPrecision(geojson, decimals = 6) {
    // clone to avoid mutating original
    const clone = JSON.parse(JSON.stringify(geojson));
    const round = (n) => Number(n.toFixed(decimals));
    const recurse = (coords) => {
      if (typeof coords[0] === "number") {
        return coords.map(round);
      }
      return coords.map(recurse);
    };
    clone.features.forEach(f => {
      f.geometry.coordinates = recurse(f.geometry.coordinates);
    });
    return clone;
  }

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

  // ── Initialize Leaflet map with GeoJSON layer ──
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current).setView([30.27, -97.74], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
      minZoom: 10,
    }).addTo(map);

    // truncate coordinates to 6 decimal places to avoid performance issues
    const simplified = simplifyGeojsonPrecision(REGIONS_GEOJSON, 6);

    const geojsonLayer = L.geoJSON(simplified, {
      style: () => ({
        color: "#a8a49c",
        weight: 1,
        fillOpacity: 0.25,
        fillColor: "#e0ddd7",
      }),
      onEachFeature: (feature, layer) => {
        // Census identity is primary in tracts mode
        const meta = regionLookupMap.get(feature.properties.region_id);
        const tooltipText = meta?.tract_label || meta?.display_name || feature.properties.region_name;
        layer.bindTooltip(tooltipText, { direction: "auto", sticky: true });
        layer.on({
          mouseover: (e) => {
            const l = e.target;
            const rid = feature.properties.region_id;
            const isActive = activeRegionIdRef.current === rid;
            // Hover: outline only, transparent fill, stay behind business markers
            if (!isActive) {
              l.setStyle({ weight: 2.5, color: "#444", fillOpacity: 0 });
            }
            // Do NOT bringToFront — keep regions behind business pins
            setHoveredRegion(rid);
            l.openTooltip();
          },
          mouseout: (e) => {
            // Re-apply the computed style instead of resetStyle so that
            // the active-region highlight is preserved.
            const rid = feature.properties.region_id;
            const yr = yearRef.current;
            const dvi = interpolateDvi(rid, yr);
            const isActive = activeRegionIdRef.current === rid;

            // Respect affluent/excluded flag for fill color
            const dviSeries = AUDITED_DVI_LOOKUP[rid];
            const dviPt = dviSeries?.reduce((best, pt) =>
              Math.abs(pt.year - yr) < Math.abs(best.year - yr) ? pt : best,
              dviSeries[0]
            );

            let fill;
            let opacity = 0.25;
            if (yr < 1993) {
              fill = "#e0ddd7";
            } else if (dviPt?.isExcluded) {
              fill = "#B0BEC5";
              opacity = 0.6;
            } else {
              fill = getDviColor(dvi, false);
            }

            e.target.setStyle({
              fillColor: fill,
              fillOpacity: opacity,
              color: isActive ? "#1a1a1a" : (dviPt?.isExcluded ? "#455A64" : "#a8a49c"),
              weight: isActive ? 3 : 1,
            });
            setHoveredRegion(null);
          },
          click: (e) => {
            const props = feature.properties;
            setActiveRegionId(props.region_id);
            setSelectedRegion(props.region_id);
            setActiveFeature(feature);
            e.target.bringToFront();
          },
        });
      },
    }).addTo(map);

    geojsonLayerRef.current = geojsonLayer;

    // ── Neighborhood layer (not added to map initially) ──
    const neighborhoodLayer = L.geoJSON(NEIGHBORHOODS_GEOJSON, {
      style: (feature) => {
        const hood = NEIGHBORHOOD_BY_ID.get(feature.properties.neighborhood_id);
        const yr = yearRef.current;
        const aggDvi = computeNeighborhoodDvi(hood, yr);
        const isActive = activeNeighborhoodIdRef.current === feature.properties.neighborhood_id;
        return {
          fillColor: yr < 1993 ? "#e0ddd7" : getDviColor(aggDvi),
          fillOpacity: 0.25,
          color: isActive ? "#1a1a1a" : "#a8a49c",
          weight: isActive ? 3 : 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties.neighborhood_name;
        layer.bindTooltip(name, { direction: "auto", sticky: true });
        layer.on({
          mouseover: (e) => {
            const isActive = activeNeighborhoodIdRef.current === feature.properties.neighborhood_id;
            if (!isActive) {
              e.target.setStyle({ weight: 2.5, color: "#444", fillOpacity: 0 });
            }
            e.target.openTooltip();
          },
          mouseout: (e) => {
            const hood = NEIGHBORHOOD_BY_ID.get(feature.properties.neighborhood_id);
            const yr = yearRef.current;
            const aggDvi = computeNeighborhoodDvi(hood, yr);
            const isActive = activeNeighborhoodIdRef.current === feature.properties.neighborhood_id;
            e.target.setStyle({
              fillColor: yr < 1993 ? "#e0ddd7" : getDviColor(aggDvi),
              fillOpacity: 0.25,
              color: isActive ? "#1a1a1a" : "#a8a49c",
              weight: isActive ? 3 : 1,
            });
          },
          click: () => {
            setActiveNeighborhoodId(feature.properties.neighborhood_id);
            setActiveRegionId(null);
            setActiveFeature(null);
          },
        });
      },
    });
    neighborhoodLayerRef.current = neighborhoodLayer;

    // Layer groups for overlays
    const operatingLayer = L.layerGroup().addTo(map);
    const closedLayer = L.layerGroup().addTo(map);
    const musicLayerGroup = L.layerGroup().addTo(map);
    const pcLayer = L.layerGroup().addTo(map);
    const pressureLayer = L.layerGroup().addTo(map);
    const paLayer = L.layerGroup().addTo(map);

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
    };

    return () => {
      map.remove();
      leafletMapRef.current = null;
      geojsonLayerRef.current = null;
      neighborhoodLayerRef.current = null;
    };
  }, []);

  // ── Update region styles when year or active selection changes ──
  useEffect(() => {
    const layer = geojsonLayerRef.current;
    if (!layer) return;

    layer.setStyle((feature) => {
      const regionId = feature.properties.region_id;
      const regionIndex = REGION_INDEX.find(r => r.region_id === regionId);
      if (!regionIndex) return {};

      const dvi = interpolateDvi(regionId, year);
      const isActive = activeRegionId === regionId;

      // Check if this region is flagged as Affluent/Excluded for the
      // closest available year — use a neutral slate color instead of
      // the displacement ramp so the map clearly distinguishes
      // gentrification from affluent appreciation.
      const dviSeries = AUDITED_DVI_LOOKUP[regionId];
      const dviPoint = dviSeries?.reduce((best, pt) =>
        Math.abs(pt.year - year) < Math.abs(best.year - year) ? pt : best,
        dviSeries[0]
      );

      let fill;
      let opacity = 0.25;
      if (year < 1993) {
        fill = "#e0ddd7";
      } else if (dviPoint?.isExcluded) {
        fill = "#B0BEC5"; // Neutral Slate for "Affluent Stability"
        opacity = 0.6;
      } else {
        fill = getDviColor(dvi, false);
      }

      return {
        fillColor: fill,
        fillOpacity: opacity,
        color: isActive ? "#1a1a1a" : (dviPoint?.isExcluded ? "#455A64" : "#a8a49c"),
        weight: isActive ? 3 : 1,
      };
    });
  }, [year, activeRegionId]);

  // ── Switch between tract and neighborhood layers ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const tractLayer = geojsonLayerRef.current;
    const neighborhoodLayer = neighborhoodLayerRef.current;
    if (!map || !tractLayer || !neighborhoodLayer) return;

    if (boundaryMode === "tracts") {
      if (map.hasLayer(neighborhoodLayer)) map.removeLayer(neighborhoodLayer);
      if (showRegions && !map.hasLayer(tractLayer)) tractLayer.addTo(map);
      setActiveNeighborhoodId(null);
    } else {
      if (map.hasLayer(tractLayer)) map.removeLayer(tractLayer);
      if (showRegions && !map.hasLayer(neighborhoodLayer)) neighborhoodLayer.addTo(map);
      setActiveRegionId(null);
      setActiveFeature(null);
    }
  }, [boundaryMode]);

  // ── Update neighborhood styles when year or selection changes ──
  useEffect(() => {
    const layer = neighborhoodLayerRef.current;
    if (!layer || boundaryMode !== "neighborhoods") return;

    layer.setStyle((feature) => {
      const hood = NEIGHBORHOOD_BY_ID.get(feature.properties.neighborhood_id);
      const aggDvi = computeNeighborhoodDvi(hood, year);
      const isActive = activeNeighborhoodId === feature.properties.neighborhood_id;
      return {
        fillColor: year < 1993 ? "#e0ddd7" : getDviColor(aggDvi),
        fillOpacity: 0.25,
        color: isActive ? "#1a1a1a" : "#a8a49c",
        weight: isActive ? 3 : 1,
      };
    });
  }, [year, activeNeighborhoodId, boundaryMode]);

  // ── Toggle region polygon visibility ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const tractLayer = geojsonLayerRef.current;
    const neighborhoodLayer = neighborhoodLayerRef.current;
    if (!map) return;

    if (showRegions) {
      const activeLayer = boundaryMode === "tracts" ? tractLayer : neighborhoodLayer;
      const inactiveLayer = boundaryMode === "tracts" ? neighborhoodLayer : tractLayer;
      if (activeLayer && !map.hasLayer(activeLayer)) activeLayer.addTo(map);
      if (inactiveLayer && map.hasLayer(inactiveLayer)) map.removeLayer(inactiveLayer);
    } else {
      if (tractLayer && map.hasLayer(tractLayer)) map.removeLayer(tractLayer);
      if (neighborhoodLayer && map.hasLayer(neighborhoodLayer)) map.removeLayer(neighborhoodLayer);
    }
  }, [showRegions, boundaryMode]);

  // ── Update overlays (business markers, music venues, PC lines, dev pressure) ──
  useEffect(() => {
    const mapObj = leafletMapRef.current;
    if (!mapObj) return;
    const { operatingLayer, closedLayer, musicLayer, pcLayer, pressureLayer, paLayer } =
      mapObj._overlayLayers || {};

    operatingLayer && operatingLayer.clearLayers();
    closedLayer && closedLayer.clearLayers();
    musicLayer && musicLayer.clearLayers();
    pcLayer && pcLayer.clearLayers();
    pressureLayer && pressureLayer.clearLayers();
    paLayer && paLayer.clearLayers();
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
          radius: 6,
          fillColor: b.pressure === "Critical" || b.pressure === "High" ? "#f59e0b" : "#4ade80",
          color: "#fff",
          weight: 1,
          fillOpacity: 0.95,
        }).addTo(operatingLayer);
        m.on("click", () => { setSelectedBiz(b); setPanelTab("culture"); setBizTab("open"); });
        m.bindPopup(`<strong>${b.name}</strong><br/>Est. ${b.est}<br/>${b.address}`);
        bizMarkersRef.current.set(b.id, m);
      });
      LEGACY_CLOSED.forEach((b) => {
        if (!b.lat || !b.lng) return;
        if (!b.closed || year < b.closed) return;
        const m = L.circleMarker([b.lat, b.lng], {
          radius: 5,
          fillColor: "#a8a29a",
          color: "#fff",
          weight: 1,
          fillOpacity: 0.85,
        }).addTo(closedLayer);
        m.on("click", () => { setSelectedBiz({ ...b, _closed: true }); setPanelTab("culture"); setBizTab("closed"); });
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
          radius: Math.min(16, 4 + (best.independent || 0)),
          fillColor: "rgba(124,58,237,0.15)",
          color: "#7c3aed",
          weight: 1,
        }).addTo(musicLayer);
        L.marker([region.lat, region.lng], { interactive: false, opacity: 0.9 })
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
        const region = REGION_INDEX.find(r => r.region_id === props.region_id);
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
        const dvi = interpolateDvi(regionId, year);
        const isActive = activeRegionId === regionId;

        const dviSeries = AUDITED_DVI_LOOKUP[regionId];
        const dviPt = dviSeries?.reduce((best, pt) =>
          Math.abs(pt.year - year) < Math.abs(best.year - year) ? pt : best,
          dviSeries[0]
        );

        let fill;
        let opacity = 0.25;
        if (year < 1993) {
          fill = "#e0ddd7";
        } else if (dviPt?.isExcluded) {
          fill = "#B0BEC5";
          opacity = 0.6;
        } else {
          fill = getDviColor(dvi, false);
        }

        layer.setStyle({
          fillColor: fill,
          fillOpacity: opacity,
          color: isActive ? "#1a1a1a" : (dviPt?.isExcluded ? "#455A64" : "#a8a49c"),
          weight: isActive ? 3 : 1,
        });
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
          radius,
          fillColor: color,
          color: "#fff",
          weight: 1,
          fillOpacity: 0.9,
        }).addTo(paLayer);
        const label = item.type === "grant" ? "Grant" : item.type === "merit_award" ? "Merit Award" : item.type === "legacy_business" ? "Legacy Business" : "Advocacy";
        const amountStr = item.amount ? `<br/>$${item.amount.toLocaleString()}` : "";
        m.bindPopup(`<strong>${item.name}</strong><br/><em>${label} · ${item.year}</em>${amountStr}<br/>${item.description}`);
        m.on("click", () => { setSelectedPA(item); setPanelTab("culture"); });
        paMarkersRef.current.set(item.id, m);
      });
    }
  }, [year, activeRegionId, showPins, showMusicVenues, showProjectConnect, showDevPressure, showPreservationAustin, paFilter]);

  // ── Auto-zoom to selected region when activeRegionId changes ──
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
  }, [activeRegionId]);

  // ── Clear active feature when selectedRegion is cleared ──
  useEffect(() => {
    if (selectedRegion === null) {
      setActiveRegionId(null);
      setActiveFeature(null);
    }
  }, [selectedRegion]);

  return { leafletMapRef, bizMarkersRef, paMarkersRef };
}
