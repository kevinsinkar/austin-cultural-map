// ── Minimal planar geometry helpers ──
// Good enough at city scale; used to assign tract centroids and event
// pins to council districts.

/** Ray-casting point-in-ring test. ring: [[lng,lat],...], point: (lat,lng). */
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point-in-(Multi)Polygon for a GeoJSON feature; holes respected. */
export function pointInFeature(lat, lng, feature) {
  const g = feature.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    if (!pointInRing(lat, lng, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lat, lng, poly[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * Which council district contains (lat,lng)? Returns the district number
 * or null. `geojson.features[*].properties.district` must be set.
 */
export function findDistrict(lat, lng, geojson) {
  if (lat == null || lng == null) return null;
  for (const f of geojson.features) {
    if (pointInFeature(lat, lng, f)) return f.properties.district;
  }
  return null;
}
