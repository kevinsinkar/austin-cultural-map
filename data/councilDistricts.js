// ── Austin 10-1 council district boundaries ──
// Downloaded + simplified from the City of Austin ArcGIS service
// BOUNDARIES_single_member_districts by scripts/fetch_council_districts.py.

import RAW from "./council_districts.json";

export const COUNCIL_DISTRICTS_GEOJSON = RAW;

export const DISTRICT_STYLE = {
  color: "#4338ca",
  weight: 2.5,
  dashArray: "7 5",
  fillOpacity: 0,
  opacity: 0.85,
};

/** Largest outer ring of a (Multi)Polygon feature. */
export function largestRing(feature) {
  const g = feature.geometry;
  if (g.type === "Polygon") return g.coordinates[0];
  let best = g.coordinates[0][0];
  for (const poly of g.coordinates) {
    if (poly[0].length > best.length) best = poly[0];
  }
  return best;
}

/** Approximate label point: vertex-average of the largest ring. */
export function districtLabelPoint(feature) {
  const ring = largestRing(feature);
  let lat = 0, lng = 0;
  for (const [x, y] of ring) { lng += x; lat += y; }
  return [lat / ring.length, lng / ring.length];
}
