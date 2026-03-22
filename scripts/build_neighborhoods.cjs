// build_neighborhoods.cjs
// Fetches City of Austin NPA boundaries and builds tract→neighborhood mapping.
// Usage: node scripts/build_neighborhoods.cjs
//
// Outputs:
//   data/neighborhoods.js       — tract→neighborhood mapping + lookups
//   data/neighborhoods_geojson.js — merged polygon GeoJSON for Leaflet

const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

// ── Paths ──────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "data");
const CACHE_PATH = path.join(DATA_DIR, "_cached_npa_boundaries.geojson");
const NEIGHBORHOODS_OUT = path.join(DATA_DIR, "neighborhoods.js");
const NEIGHBORHOODS_GEOJSON_OUT = path.join(DATA_DIR, "neighborhoods_geojson.js");

// ── Load project data (ESM files → read + eval) ───────────────────────────

function loadESM(filePath, exportNames) {
  let src = fs.readFileSync(filePath, "utf-8");
  // Strip import/export to make it evaluable in CJS
  src = src.replace(/^import\s+.*?;\s*$/gm, "");
  src = src.replace(/^export\s+const\s+/gm, "const ");
  src = src.replace(/^export\s+\{[^}]*\};\s*$/gm, "");
  src = src.replace(/^export\s+default\s+/gm, "const _default_ = ");
  // Wrap and extract requested exports
  const names = Array.isArray(exportNames) ? exportNames : [exportNames];
  const returnObj = names.map(n => `"${n}": typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ");
  const fn = new Function(src + `\nreturn { ${returnObj} };`);
  return fn();
}

const { REGION_INDEX } = loadESM(
  path.join(DATA_DIR, "regionIndex.js"),
  ["REGION_INDEX"]
);

// Build VISIBLE_REGIONS + MERGE_LOOKUP from REGION_INDEX
const MERGE_LOOKUP = new Map(
  REGION_INDEX.filter(r => r.merge_into).map(r => [r.region_id, r.merge_into])
);
const VISIBLE_REGIONS = REGION_INDEX.filter(r => !r.merge_into);

console.log(`Loaded REGION_INDEX: ${REGION_INDEX.length} total, ${VISIBLE_REGIONS.length} visible`);

// ── Step 0: Fetch NPA boundaries ───────────────────────────────────────────

const NPA_ENDPOINTS = [
  "https://data.austintexas.gov/resource/inrm-c3ee.geojson?$limit=5000",
  "https://data.austintexas.gov/api/v3/views/inrm-c3ee/export.geojson",
  "https://data.austintexas.gov/api/v3/views/inrm-c3ee/query.geojson",
];

async function fetchNPABoundaries() {
  const appToken = process.env.COA_APP_TOKEN;

  for (const url of NPA_ENDPOINTS) {
    try {
      const headers = { Accept: "application/json" };
      if (appToken) headers["X-App-Token"] = appToken;

      console.log(`  Trying: ${url}`);
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn(`  → HTTP ${res.status}, trying next...`);
        continue;
      }
      const data = await res.json();
      if (data.type === "FeatureCollection" && data.features?.length > 0) {
        console.log(`✓ Fetched ${data.features.length} NPA boundaries from:`);
        console.log(`  ${url}`);
        return data;
      }
      console.warn(`  → Not a valid FeatureCollection, trying next...`);
    } catch (e) {
      console.warn(`  → ${e.message}, trying next...`);
    }
  }

  // Fallback: local files
  const localPaths = [
    path.join(DATA_DIR, "_cached_npa_boundaries.geojson"),
    path.join(DATA_DIR, "coa_neighborhoods.geojson"),
    path.join(DATA_DIR, "Boundaries__City_of_Austin_Neighborhoods.geojson"),
    path.join(DATA_DIR, "inrm-c3ee.geojson"),
  ];
  for (const p of localPaths) {
    if (fs.existsSync(p)) {
      console.log(`✓ Using local file: ${p}`);
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  }

  throw new Error(
    "Could not fetch NPA boundaries from API or find a local file.\n" +
    "Either set COA_APP_TOKEN env var, or download the GeoJSON from:\n" +
    "https://data.austintexas.gov/City-Government/Boundaries-City-of-Austin-Neighborhoods/inrm-c3ee\n" +
    "and save it to data/coa_neighborhoods.geojson"
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(str) {
  // Convert "EAST CESAR CHAVEZ" → "East Cesar Chavez"
  // Preserve small words in the middle
  const small = new Set(["of", "the", "and", "in", "at", "de", "del", "la", "las", "los"]);
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Step 1: Build tract→neighborhood mapping ───────────────────────────────

function assignTractToNeighborhood(centroid, npaFeatures, nameField) {
  // centroid is [lat, lng] from REGION_INDEX; turf expects [lng, lat]
  const point = turf.point([centroid[1], centroid[0]]);
  for (const feature of npaFeatures) {
    try {
      if (turf.booleanPointInPolygon(point, feature)) {
        const rawName = feature.properties[nameField];
        const name = titleCase(rawName);
        return { id: slugify(rawName), name };
      }
    } catch (e) {
      // Skip invalid geometries
    }
  }
  return null;
}

function findNearestNPA(centroid, npaFeatures, nameField, maxKm = 2) {
  const point = turf.point([centroid[1], centroid[0]]);
  let bestDist = Infinity;
  let bestFeature = null;
  for (const feature of npaFeatures) {
    try {
      const npaCentroid = turf.centroid(feature);
      const dist = turf.distance(point, npaCentroid, { units: "kilometers" });
      if (dist < bestDist) {
        bestDist = dist;
        bestFeature = feature;
      }
    } catch (e) { /* skip */ }
  }
  if (bestDist <= maxKm && bestFeature) {
    const rawName = bestFeature.properties[nameField];
    const name = titleCase(rawName);
    return { id: slugify(rawName), name, distance: bestDist };
  }
  return null;
}

function determineOutsideCity(lat, lng) {
  // Rough bounding boxes for surrounding cities
  if (lat > 30.44 && lng > -97.74) return "Pflugerville";
  if (lat > 30.48) return "Round Rock";
  if (lat > 30.42 && lng < -97.82) return "Cedar Park";
  if (lat < 30.25 && lng < -97.85) return "Bee Cave";
  if (lat < 30.20 && lng < -97.85) return "Lakeway";
  if (lat < 30.15 && lng > -97.60) return "Del Valle";
  if (lat > 30.35 && lng > -97.60) return "Manor";
  // Far south
  if (lat < 30.15) return "South Austin ETJ";
  // Far north
  if (lat > 30.48) return "North Austin ETJ";
  return null;
}

// Manual neighborhoods for well-known areas
const MANUAL_NEIGHBORHOODS = [
  { name: "Rainey Street Historic District", landmark: [30.257, -97.740], radius: 0.8 },
  { name: "Warehouse District", landmark: [30.267, -97.748], radius: 0.6 },
  { name: "Red River Cultural District", landmark: [30.268, -97.735], radius: 0.6 },
  { name: "Mueller", landmark: [30.298, -97.705], radius: 1.2 },
  { name: "North Loop", landmark: [30.318, -97.724], radius: 1.0 },
  { name: "Cherrywood", landmark: [30.289, -97.717], radius: 0.8 },
];

// ── Step 2: Generate neighborhood GeoJSON ──────────────────────────────────

function loadRegionsGeoJSON() {
  const regionsPath = path.join(DATA_DIR, "final_updated_regions.js");
  let src = fs.readFileSync(regionsPath, "utf-8");
  src = src.replace(/^import\s+.*?;\s*$/gm, "");
  src = src.replace(/^export\s+const\s+/gm, "const ");
  src = src.replace(/^export\s+\{[^}]*\};\s*$/gm, "");
  const fn = new Function(src + "\nreturn REGIONS_GEOJSON;");
  return fn();
}

function buildNeighborhoodPolygon(hood, tractsGeoJSON) {
  const tractFeatures = tractsGeoJSON.features.filter(f =>
    hood.tract_ids.includes(f.properties.region_id)
  );
  if (tractFeatures.length === 0) return null;

  if (tractFeatures.length === 1) {
    const feature = JSON.parse(JSON.stringify(tractFeatures[0]));
    feature.properties = {
      neighborhood_id: hood.id,
      neighborhood_name: hood.name,
      tract_ids: hood.tract_ids,
      tract_count: hood.tract_ids.length,
    };
    return feature;
  }

  let merged = tractFeatures[0];
  for (let i = 1; i < tractFeatures.length; i++) {
    try {
      merged = turf.union(turf.featureCollection([merged, tractFeatures[i]]));
    } catch (e) {
      console.warn(`  Union failed for ${hood.name}, tract index ${i}: ${e.message}`);
    }
  }
  merged.properties = {
    neighborhood_id: hood.id,
    neighborhood_name: hood.name,
    tract_ids: hood.tract_ids,
    tract_count: hood.tract_ids.length,
  };
  return merged;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Build Neighborhoods ===\n");

  // Step 0: Fetch NPA boundaries
  console.log("Step 0: Fetching COA NPA boundaries...");
  const npa = await fetchNPABoundaries();

  // Cache locally
  fs.writeFileSync(CACHE_PATH, JSON.stringify(npa));
  console.log(`  Cached to ${CACHE_PATH}`);

  // Examine schema
  console.log(`\n  Features: ${npa.features.length}`);
  const sampleProps = Object.keys(npa.features[0].properties);
  console.log(`  Property fields: ${sampleProps.join(", ")}`);
  console.log(`  Sample properties:`, JSON.stringify(npa.features[0].properties, null, 2));

  // Prefer planning_area_name > any field with "name" in it (but not "number")
  const nameField = sampleProps.find(k => k === "planning_area_name")
    || sampleProps.find(k =>
      /^(name|neighb|planning_area)/i.test(k) &&
      !/number/i.test(k) &&
      typeof npa.features[0].properties[k] === "string"
    );
  console.log(`  Detected name field: ${nameField}`);

  if (!nameField) {
    console.error("ERROR: Could not detect name field in NPA data!");
    console.log("  All fields:", sampleProps);
    process.exit(1);
  }

  const allNames = npa.features.map(f => f.properties[nameField]).sort();
  console.log(`\n  All neighborhood names (${allNames.length}):`);
  allNames.forEach(n => console.log(`    ${n}`));

  // Step 1: Assign tracts to neighborhoods
  console.log("\n\nStep 1: Assigning tracts to neighborhoods...");

  const neighborhoodMap = {}; // id → { id, name, tract_ids, centroid, source }
  const unassigned = [];

  for (const tract of VISIBLE_REGIONS) {
    const centroid = [tract.lat, tract.lng];
    const assignment = assignTractToNeighborhood(centroid, npa.features, nameField);

    if (assignment) {
      if (!neighborhoodMap[assignment.id]) {
        neighborhoodMap[assignment.id] = {
          id: assignment.id,
          name: assignment.name,
          tract_ids: [],
          source: "City of Austin NPA",
        };
      }
      neighborhoodMap[assignment.id].tract_ids.push(tract.region_id);
    } else {
      unassigned.push(tract);
    }
  }

  console.log(`  Assigned: ${VISIBLE_REGIONS.length - unassigned.length} tracts`);
  console.log(`  Unassigned: ${unassigned.length} tracts`);

  // Secondary assignment for unassigned tracts
  if (unassigned.length > 0) {
    console.log("\n  Attempting secondary assignment...");
    const stillUnassigned = [];

    for (const tract of unassigned) {
      const centroid = [tract.lat, tract.lng];

      // Try nearest NPA within 2km
      const nearest = findNearestNPA(centroid, npa.features, nameField, 2);
      if (nearest) {
        if (!neighborhoodMap[nearest.id]) {
          neighborhoodMap[nearest.id] = {
            id: nearest.id,
            name: nearest.name,
            tract_ids: [],
            source: "City of Austin NPA (nearest)",
          };
        }
        neighborhoodMap[nearest.id].tract_ids.push(tract.region_id);
        continue;
      }

      // Try outside-city assignment
      const city = determineOutsideCity(tract.lat, tract.lng);
      if (city) {
        // Determine directional quadrant within the city
        const cityId = slugify(city);
        if (!neighborhoodMap[cityId]) {
          neighborhoodMap[cityId] = {
            id: cityId,
            name: city,
            tract_ids: [],
            source: "city-lookup",
          };
        }
        neighborhoodMap[cityId].tract_ids.push(tract.region_id);
        continue;
      }

      stillUnassigned.push(tract);
    }

    // Last resort: assign to nearest NPA with no distance limit
    for (const tract of stillUnassigned) {
      const nearest = findNearestNPA([tract.lat, tract.lng], npa.features, nameField, 50);
      if (nearest) {
        const extId = slugify(nearest.name + " area");
        if (!neighborhoodMap[extId]) {
          neighborhoodMap[extId] = {
            id: extId,
            name: nearest.name + " Area",
            tract_ids: [],
            source: "City of Austin NPA (extended)",
          };
        }
        neighborhoodMap[extId].tract_ids.push(tract.region_id);
      } else {
        // Truly unassigned — group as "Unassigned"
        if (!neighborhoodMap["unassigned"]) {
          neighborhoodMap["unassigned"] = {
            id: "unassigned",
            name: "Unassigned",
            tract_ids: [],
            source: "none",
          };
        }
        neighborhoodMap["unassigned"].tract_ids.push(tract.region_id);
      }
    }

    const reassigned = unassigned.length - (neighborhoodMap["unassigned"]?.tract_ids.length || 0);
    console.log(`  Secondary assignment: ${reassigned} tracts assigned`);
    if (neighborhoodMap["unassigned"]) {
      console.log(`  Still unassigned: ${neighborhoodMap["unassigned"].tract_ids.length} tracts`);
    }
  }

  // Check manual neighborhoods
  console.log("\n  Checking manual neighborhoods...");
  let manualAdded = 0;
  for (const manual of MANUAL_NEIGHBORHOODS) {
    const manualId = slugify(manual.name);
    // Check if already in NPA data
    const alreadyExists = Object.values(neighborhoodMap).some(
      n => n.name.toLowerCase() === manual.name.toLowerCase() ||
           n.id === manualId
    );
    if (alreadyExists) {
      console.log(`    ${manual.name}: already exists in NPA data, skipping`);
      continue;
    }

    // Find tracts near the landmark
    const nearbyTracts = VISIBLE_REGIONS.filter(t => {
      const dist = haversineKm(t.lat, t.lng, manual.landmark[0], manual.landmark[1]);
      return dist <= manual.radius;
    });

    if (nearbyTracts.length > 0) {
      // Move tracts from their current neighborhood to the manual one
      const tractIds = nearbyTracts.map(t => t.region_id);
      // Remove these tracts from their current neighborhoods
      for (const hood of Object.values(neighborhoodMap)) {
        hood.tract_ids = hood.tract_ids.filter(id => !tractIds.includes(id));
      }
      neighborhoodMap[manualId] = {
        id: manualId,
        name: manual.name,
        tract_ids: tractIds,
        source: "manual",
      };
      manualAdded++;
      console.log(`    ${manual.name}: added with ${tractIds.length} tracts`);
    } else {
      console.log(`    ${manual.name}: no nearby tracts found`);
    }
  }

  // Remove empty neighborhoods (tracts may have been reassigned to manual ones)
  for (const [id, hood] of Object.entries(neighborhoodMap)) {
    if (hood.tract_ids.length === 0) delete neighborhoodMap[id];
  }

  // Compute centroids for each neighborhood
  const neighborhoods = Object.values(neighborhoodMap).map(hood => {
    const tracts = hood.tract_ids.map(id =>
      REGION_INDEX.find(r => r.region_id === id)
    ).filter(Boolean);
    const avgLat = tracts.reduce((s, t) => s + t.lat, 0) / tracts.length;
    const avgLng = tracts.reduce((s, t) => s + t.lng, 0) / tracts.length;
    return {
      ...hood,
      centroid: [+avgLat.toFixed(4), +avgLng.toFixed(4)],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Print summary
  const totalAssigned = neighborhoods.reduce((s, n) => s + n.tract_ids.length, 0);
  const largest = neighborhoods.reduce((a, b) => a.tract_ids.length > b.tract_ids.length ? a : b);
  const smallest = neighborhoods.filter(n => n.tract_ids.length > 0)
    .reduce((a, b) => a.tract_ids.length < b.tract_ids.length ? a : b);
  const avg = (totalAssigned / neighborhoods.length).toFixed(1);

  console.log("\n\n=== Summary ===");
  console.log(`  Total NPA neighborhoods: ${allNames.length}`);
  console.log(`  Manual neighborhoods added: ${manualAdded}`);
  console.log(`  Total neighborhoods (output): ${neighborhoods.length}`);
  console.log(`  Total tracts assigned: ${totalAssigned} / ${VISIBLE_REGIONS.length} visible`);
  console.log(`  Largest neighborhood: "${largest.name}" (${largest.tract_ids.length} tracts)`);
  console.log(`  Smallest neighborhood: "${smallest.name}" (${smallest.tract_ids.length} tracts)`);
  console.log(`  Average tracts per neighborhood: ${avg}`);

  // ── Output neighborhoods.js ──────────────────────────────────────────────
  console.log("\n\nStep 2: Writing data/neighborhoods.js...");

  const neighborhoodsJS = `// Auto-generated by scripts/build_neighborhoods.cjs
// Source: City of Austin Neighborhood Planning Areas (data.austintexas.gov)
// Assignment method: centroid-in-polygon (each tract -> exactly one neighborhood)
//
// To regenerate: node scripts/build_neighborhoods.cjs

export const NEIGHBORHOODS = ${JSON.stringify(neighborhoods, null, 2)};

// Reverse lookup: tract_id -> neighborhood_id (one-to-one)
export const TRACT_TO_NEIGHBORHOOD = new Map();
NEIGHBORHOODS.forEach(n => {
  n.tract_ids.forEach(tid => {
    TRACT_TO_NEIGHBORHOOD.set(tid, n.id);
  });
});

// Neighborhood lookup by id
export const NEIGHBORHOOD_BY_ID = new Map(
  NEIGHBORHOODS.map(n => [n.id, n])
);

// Sorted name list for dropdowns
export const NEIGHBORHOOD_NAMES = NEIGHBORHOODS
  .map(n => n.name)
  .sort((a, b) => a.localeCompare(b));
`;

  fs.writeFileSync(NEIGHBORHOODS_OUT, neighborhoodsJS, "utf-8");
  console.log(`  ✓ Wrote ${NEIGHBORHOODS_OUT}`);

  // ── Output neighborhoods_geojson.js ──────────────────────────────────────
  console.log("\nStep 3: Building neighborhood GeoJSON polygons...");

  console.log("  Loading REGIONS_GEOJSON (this may take a moment)...");
  const REGIONS_GEOJSON = loadRegionsGeoJSON();
  console.log(`  Loaded ${REGIONS_GEOJSON.features.length} tract features`);

  const neighborhoodFeatures = [];
  let unionFails = 0;

  for (const hood of neighborhoods) {
    const feature = buildNeighborhoodPolygon(hood, REGIONS_GEOJSON);
    if (feature) {
      neighborhoodFeatures.push(feature);
    } else {
      unionFails++;
      console.warn(`  ✗ No polygon for ${hood.name} (${hood.tract_ids.length} tracts)`);
    }
  }

  const neighborhoodsGeoJSON = {
    type: "FeatureCollection",
    features: neighborhoodFeatures,
  };

  const geojsonJS = `// Auto-generated by scripts/build_neighborhoods.cjs
// Polygons are unions of constituent census tract polygons
// Do NOT export from data/index.js — only useAustinMap.js should import this
export const NEIGHBORHOODS_GEOJSON = ${JSON.stringify(neighborhoodsGeoJSON)};
`;

  fs.writeFileSync(NEIGHBORHOODS_GEOJSON_OUT, geojsonJS, "utf-8");
  console.log(`  ✓ Wrote ${NEIGHBORHOODS_GEOJSON_OUT}`);
  console.log(`  ${neighborhoodFeatures.length} neighborhood polygons (${unionFails} failures)`);

  console.log("\n=== Done ===\n");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
