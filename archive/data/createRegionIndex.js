// Utility script to generate regionIndex.js from final_updated_regions.js
// Run this once to create the lightweight index, then commit it

import { REGIONS_GEOJSON } from './final_updated_regions.js';

function getBounds(geometry) {
  const coords = [];
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        coords.push(...ring);
      }
    }
  } else if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      coords.push(...ring);
    }
  }
  
  if (!coords.length) return null;
  
  const lats = coords.map(c => c[1]);
  const lons = coords.map(c => c[0]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  
  return {
    center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2],
    bounds: [[minLat, minLon], [maxLat, maxLon]]
  };
}

const index = REGIONS_GEOJSON.features.map(feature => {
  const props = feature.properties;
  const bounds = getBounds(feature.geometry);
  
  return {
    region_id: props.region_id,
    region_name: props.region_name,
    short_name: props.short_name,
    lat: bounds?.center[0],
    lng: bounds?.center[1],
    dvi_score: props.dvi_score,
    gentrification_status: props.gentrification_status,
    heritage: props.heritage,
  };
});

// Output as JS file
const output = `// Lightweight region index for fast rendering
// Generated from final_updated_regions.js

export const REGION_INDEX = ${JSON.stringify(index, null, 2)};

// Quick lookup map
export const regionLookupMap = new Map(
  REGION_INDEX.map(r => [r.region_id, r])
);
`;

console.log(output);
console.log(`\n// ${index.length} regions indexed`);
