import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { REGION_INDEX, REGIONS_GEOJSON } from "../data";
import { LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES, PROPERTY_DATA } from "../data";
// TODO: Remove LEGACY_OPERATING and LEGACY_CLOSED usage once all components are migrated to interim data
// PROPERTY_DATA now points to interim_property.js via data/index.js
import { interpolateDvi, getDviColor } from "../utils/math";
import { getDevPressureColor } from "../utils/mapHelpers";

export default function useAustinMap({
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
}) {
  const leafletMapRef = useRef(null);
  const geojsonLayerRef = useRef(null); // Leaflet layer for regions
  const musicLayer = useRef(null);
  const businessLayerRef = useRef({ operating: null, closed: null });


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
        fillOpacity: 0.7,
        fillColor: "#e0ddd7",
      }),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.region_name, { direction: "auto", sticky: true });
        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ weight: 3, color: "#666", fillOpacity: 0.7 });
            l.bringToFront();
            setHoveredRegion(feature.properties.region_id);
            l.openTooltip();
          },
          mouseout: (e) => {
            geojsonLayer.resetStyle(e.target);
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

    // Layer groups for overlays
    const operatingLayer = L.layerGroup().addTo(map);
    const closedLayer = L.layerGroup().addTo(map);
    const musicLayerGroup = L.layerGroup().addTo(map);
    const pcLayer = L.layerGroup().addTo(map);
    const pressureLayer = L.layerGroup().addTo(map);

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
    };

    return () => {
      map.remove();
      leafletMapRef.current = null;
      geojsonLayerRef.current = null;
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
      const fill = year < 1993 ? "#e0ddd7" : getDviColor(dvi, false);
      const isActive = activeRegionId === regionId;

      return {
        fillColor: fill,
        fillOpacity: isActive ? 0.95 : 0.7,
        color: isActive ? "#1a1a1a" : "#a8a49c",
        weight: isActive ? 3 : 1,
      };
    });
  }, [year, activeRegionId]);

  // ── Update overlays (business markers, music venues, PC lines, dev pressure) ──
  useEffect(() => {
    const mapObj = leafletMapRef.current;
    if (!mapObj) return;
    const { operatingLayer, closedLayer, musicLayer, pcLayer, pressureLayer } =
      mapObj._overlayLayers || {};

    operatingLayer && operatingLayer.clearLayers();
    closedLayer && closedLayer.clearLayers();
    musicLayer && musicLayer.clearLayers();
    pcLayer && pcLayer.clearLayers();
    pressureLayer && pressureLayer.clearLayers();

    // Build lookup caches keyed by region_id for consistent joins
    const musicByRegion = new Map();
    const propertyByRegion = new Map();
    MUSIC_NIGHTLIFE.forEach(m => {
      const key = m.region_id ?? m.region;           // fallback to name if no id yet
      if (!musicByRegion.has(key)) musicByRegion.set(key, []);
      musicByRegion.get(key).push(m);
    });
    PROPERTY_DATA.forEach(p => {
      const key = p.region_id ?? p.region;
      if (!propertyByRegion.has(key)) propertyByRegion.set(key, []);
      propertyByRegion.get(key).push(p);
    });

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
        m.on("click", () => setSelectedBiz(b));
        m.bindPopup(`<strong>${b.name}</strong><br/>Est. ${b.est}<br/>${b.address}`);
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
        m.on("click", () => setSelectedBiz({ ...b, _closed: true }));
        m.bindPopup(`<strong>${b.name}</strong><br/>Closed ${b.closed}<br/>${b.relocated || ""}`);
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
        const rows = propertyByRegion.get(props.region_id) || propertyByRegion.get(region?.region_name) || [];
        if (!rows.length) return;
        const closest = rows.reduce(
          (a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a),
          rows[0]
        );
        if (!closest || !closest.yoy || closest.yoy < 0.05) return;

        const strokeW = Math.max(0.0002, closest.yoy * 0.0001);
        layer.setStyle({ weight: strokeW, color: getDevPressureColor(region.region_name, year) });
      });
    } else if (geojsonLayerRef.current) {
      // clear any previously-applied dev-pressure styling
      geojsonLayerRef.current.eachLayer((layer) => {
        geojsonLayerRef.current.resetStyle(layer);
      });
    }
  }, [year, showPins, showMusicVenues, showProjectConnect, showDevPressure]);

  // ── Clear active feature when selectedRegion is cleared ──
  useEffect(() => {
    if (selectedRegion === null) {
      setActiveRegionId(null);
      setActiveFeature(null);
    }
  }, [selectedRegion]);

  return { leafletMapRef };
}
