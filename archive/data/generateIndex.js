import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the final_updated_regions.js file
const filePath = path.join(__dirname, 'final_updated_regions.js');
const code = fs.readFileSync(filePath, 'utf8');

// Extract the REGIONS_GEOJSON export
const match = code.match(/export const REGIONS_GEOJSON = ({[\s\S]*});/);
if (!match) {
  console.log('Failed to parse final_updated_regions.js');
  process.exit(1);
}

// Parse the GeoJSON object
const data = eval('(' + match[1] + ')');

// Create lightweight index
const index = data.features.map(f => {
  const coords = [];
  const geom = f.geometry;
  
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        coords.push(...ring);
      }
    }
  } else if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) {
      coords.push(...ring);
    }
  }
  
  const lats = coords.map(c => c[1]);
  const lons = coords.map(c => c[0]);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lons) + Math.max(...lons)) / 2;
  
  return {
    region_id: f.properties.region_id,
    region_name: f.properties.region_name,
    short_name: f.properties.short_name,
    lat,
    lng,
    dvi_score: f.properties.dvi_score,
    gentrification_status: f.properties.gentrification_status,
  };
});

// Generate output file
const output = `// Lightweight region index - no geometries, just metadata and centroids
// Generated from final_updated_regions.js

export const REGION_INDEX = ${JSON.stringify(index, null, 2)};

export const regionLookupMap = new Map(
  REGION_INDEX.map(r => [r.region_id, r])
);
`;

fs.writeFileSync(path.join(__dirname, 'regionIndex.js'), output);
console.log(`✓ Generated regionIndex.js with ${index.length} regions`);
