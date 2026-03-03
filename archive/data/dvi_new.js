


import _ from "lodash";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROPERTY_DATA = JSON.parse(readFileSync(path.join(__dirname, "./interim_property.json"), "utf-8"));
const { REGIONS_GEOJSON } = await import("./final_updated_regions.js");

// Example DVI calculation: weighted sum of property value and rent growth
function computeDVI(region, year) {
  // Get all property records for this region
  const props = PROPERTY_DATA.filter(p => p.region === region).sort((a, b) => a.year - b.year);
  if (!props.length) return 0;
  // Find current and previous (5 years ago) records
  const now = props.reduce((a, b) => Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a, props[0]);
  const prev = props.filter(p => p.year < year).reduce((a, b) => Math.abs(b.year - (year - 5)) < Math.abs(a.year - (year - 5)) ? b : a, props[0]);
  if (!now || !prev || now.year === prev.year) return 0;
  // Calculate percent changes
  const homeValueGrowth = (now.median_home_value - prev.median_home_value) / prev.median_home_value;
  const rentGrowth = (now.median_rent_monthly - prev.median_rent_monthly) / prev.median_rent_monthly;
  // Example: 70% weight to home value, 30% to rent
  const dvi = (homeValueGrowth * 0.7 + rentGrowth * 0.3) * 100;
  return Math.max(0, Math.round(dvi * 100) / 100);
}

// Generate DVI for all regions and years
export function generateAllDVI() {
  const results = [];
  const years = _.uniq(PROPERTY_DATA.map(p => p.year)).sort((a, b) => a - b);
  REGIONS_GEOJSON.features.forEach(f => {
    const region = f.properties.region_name;
    years.forEach(year => {
      const dvi = computeDVI(region, year);
      results.push({ region, year, dvi });
    });
  });
  return results;
}

// If run directly, output to console
if (typeof window === "undefined") {
  const allDVI = generateAllDVI();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(allDVI, null, 2));
}
