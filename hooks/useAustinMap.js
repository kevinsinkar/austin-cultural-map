import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { REGIONS_GEOJSON, LEGACY_OPERATING, LEGACY_CLOSED, MUSIC_NIGHTLIFE, PROJECT_CONNECT_LINES, PROPERTY_DATA } from "../data";
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
  const geoJsonLayerRef = useRef(null);

  // ── Initialize Leaflet map ──
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current).setView([30.27, -97.74], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
      minZoom: 10,
    }).addTo(map);

    // Layer groups for overlays
    const operatingLayer = L.layerGroup().addTo(map);
    const closedLayer = L.layerGroup().addTo(map);
    const musicLayer = L.layerGroup().addTo(map);
    const pcLayer = L.layerGroup().addTo(map);
    const pressureLayer = L.layerGroup().addTo(map);

    map.scrollWheelZoom.enable();

    const geoJsonLayer = L.geoJSON(REGIONS_GEOJSON, {
      style: (feature) => {
        const nd = feature.properties.region_name === "The Domain / North Burnet";
        const dvi = interpolateDvi(feature.properties.region_name, year);
        const fill = year < 1993 ? "#e0ddd7" : getDviColor(dvi, nd);
        const isActive = activeRegionId === feature.properties.region_id;
        return {
          fillColor: fill,
          color: isActive ? "#1a1a1a" : "#a8a49c",
          weight: isActive ? 2.5 : 1,
          opacity: activeRegionId && activeRegionId !== feature.properties.region_id ? 0.5 : 1,
          fillOpacity: 0.7,
        };
      },
      onEachFeature: (feature, layer) => {
        layer.on("click", () => {
          setActiveRegionId(feature.properties.region_id);
          setSelectedRegion(feature.properties.region_id);
          setActiveFeature(feature);
        });
        layer.on("mouseover", () => {
          setHoveredRegion(feature.properties.region_id);
          setActiveFeature(feature);
        });
        layer.on("mouseout", () => {
          setHoveredRegion(null);
        });
      },
    }).addTo(map);

    try {
      const b = geoJsonLayer.getBounds();
      if (b.isValid()) map.fitBounds(b.pad(0.1));
    } catch (e) {
      /* ignore */
    }

    leafletMapRef.current = map;
    geoJsonLayerRef.current = geoJsonLayer;
    leafletMapRef.current._overlayLayers = {
      operatingLayer,
      closedLayer,
      musicLayer,
      pcLayer,
      pressureLayer,
    };

    return () => {
      map.remove();
      leafletMapRef.current = null;
      geoJsonLayerRef.current = null;
    };
  }, []);

  // ── Update region colors when year/activeRegion changes ──
  useEffect(() => {
    if (!geoJsonLayerRef.current) return;
    geoJsonLayerRef.current.eachLayer((layer) => {
      const feature = layer.feature;
      const nd = feature.properties.region_name === "The Domain / North Burnet";
      const dvi = interpolateDvi(feature.properties.region_name, year);
      const fill = year < 1993 ? "#e0ddd7" : getDviColor(dvi, nd);
      const isActive = activeRegionId === feature.properties.region_id;
      layer.setStyle({
        fillColor: fill,
        color: isActive ? "#1a1a1a" : "#a8a49c",
        weight: isActive ? 2.5 : 1,
        opacity: activeRegionId && activeRegionId !== feature.properties.region_id ? 0.5 : 1,
        fillOpacity: 0.7,
      });
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

    // Music venues per region (centroid labels)
    if (showMusicVenues && musicLayer) {
      REGIONS_GEOJSON.features.forEach((f) => {
        const rows = MUSIC_NIGHTLIFE.filter((m) => m.region === f.properties.region_name);
        if (!rows.length) return;
        const best = rows.reduce(
          (a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a),
          rows[0]
        );
        const geo = L.geoJSON(f);
        const c = geo.getBounds().getCenter();
        const txt = `${best.independent + (best.corporate || 0)} venues`;
        L.circleMarker(c, {
          radius: Math.min(16, 4 + (best.independent || 0)),
          fillColor: "rgba(124,58,237,0.15)",
          color: "#7c3aed",
          weight: 1,
        }).addTo(musicLayer);
        L.marker(c, { interactive: false, opacity: 0.9 })
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
    if (showDevPressure && pressureLayer) {
      REGIONS_GEOJSON.features.forEach((f) => {
        const props = PROPERTY_DATA.filter((p) => p.region === f.properties.region_name);
        if (!props.length) return;
        const closest = props.reduce(
          (a, b) => (Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a),
          props[0]
        );
        if (!closest || !closest.yoy || closest.yoy < 0.05) return;
        const strokeW = Math.max(1.5, closest.yoy * 18);
        L.geoJSON(f, {
          style: {
            color: getDevPressureColor(f.properties.region_name, year),
            weight: strokeW,
            fill: false,
            opacity: 0.6,
          },
        }).addTo(pressureLayer);
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

  return { leafletMapRef, geoJsonLayerRef };
}
