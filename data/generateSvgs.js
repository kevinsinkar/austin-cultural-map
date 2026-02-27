import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read final_updated_regions.js
const filePath = path.join(__dirname, 'final_updated_regions.js');
const code = fs.readFileSync(filePath, 'utf8');

const match = code.match(/export const REGIONS_GEOJSON = ({[\s\S]*});/);
if (!match) {
  console.log('Failed to parse final_updated_regions.js');
  process.exit(1);
}

const data = eval('(' + match[1] + ')');

// Convert GeoJSON coordinates to SVG path
function geoJsonToSvgPath(coordinates, type) {
  const paths = [];
  
  if (type === 'MultiPolygon') {
    for (const polygon of coordinates) {
      for (const ring of polygon) {
        const pathStr = ring.map((coord, i) => {
          const cmd = i === 0 ? 'M' : 'L';
          return `${cmd}${coord[0]},${coord[1]}`;
        }).join(' ') + 'Z';
        paths.push(pathStr);
      }
    }
  } else if (type === 'Polygon') {
    for (const ring of coordinates) {
      const pathStr = ring.map((coord, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${coord[0]},${coord[1]}`;
      }).join(' ') + 'Z';
      paths.push(pathStr);
    }
  }
  
  return paths.join(' ');
}

// Get bounding box for viewBox
function getBounds(geometry) {
  const coords = [];
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) {
        coords.push(...ring);
      }
    }
  } else if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      coords.push(...ring);
    }
  }
  
  const lats = coords.map(c => c[1]);
  const lons = coords.map(c => c[0]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  
  return { minLat, maxLat, minLon, maxLon };
}

// Create SVG data for each region
const regionSvgs = data.features.map(f => {
  const geom = f.geometry;
  const props = f.properties;
  const bounds = getBounds(geom);
  const pathData = geoJsonToSvgPath(geom.coordinates, geom.type);
  
  // Calculate viewBox with some padding
  const width = bounds.maxLon - bounds.minLon;
  const height = bounds.maxLat - bounds.minLat;
  const padding = 0.0005; // Small padding around edges
  
  return {
    region_id: props.region_id,
    region_name: props.region_name,
    short_name: props.short_name,
    pathData,
    viewBox: `${bounds.minLon - padding} ${bounds.minLat - padding} ${width + padding * 2} ${height + padding * 2}`,
    bounds: {
      north: bounds.maxLat,
      south: bounds.minLat,
      east: bounds.maxLon,
      west: bounds.minLon,
    },
  };
});

// Generate regionSvgs.js
const output = `// SVG paths for each region, generated from final_updated_regions.js
// Used to render lightweight SVG overlays on the map

export const REGION_SVGS = ${JSON.stringify(regionSvgs, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'regionSvgs.js'), output);
console.log(`✓ Generated regionSvgs.js with ${regionSvgs.length} regions`);
