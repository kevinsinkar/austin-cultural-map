// Script to check for duplicate or missing business IDs and duplicate region names in GeoJSON
import { LEGACY_OPERATING, LEGACY_CLOSED } from "./data/businesses.js";
import { REGIONS_GEOJSON } from "./data/final_updated_regions.js";

function checkBusinessIds() {
  const all = [...LEGACY_OPERATING, ...LEGACY_CLOSED];
  const seen = new Set();
  const duplicates = [];
  const missing = [];
  for (const b of all) {
    if (!b.id) missing.push(b);
    else if (seen.has(b.id)) duplicates.push(b.id);
    else seen.add(b.id);
  }
  console.log("Duplicate business IDs:", duplicates);
  console.log("Businesses missing IDs:", missing.map(b => b.name));
}

function checkGeojsonRegionNames() {
  const seen = new Map();
  const duplicates = [];
  for (const f of REGIONS_GEOJSON.features) {
    const name = f.properties.region_name;
    if (!name) continue;
    if (seen.has(name)) {
      duplicates.push(name);
      seen.set(name, seen.get(name) + 1);
    } else {
      seen.set(name, 1);
    }
  }
  const dupNames = Array.from(seen.entries()).filter(([k, v]) => v > 1).map(([k]) => k);
  console.log("Duplicate region_name in GeoJSON:", dupNames);
}

checkBusinessIds();
checkGeojsonRegionNames();
