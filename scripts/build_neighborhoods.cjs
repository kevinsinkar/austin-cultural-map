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

// ── Suburban community reference table ──────────────────────────────────────
// For tracts outside COA NPA coverage, assign to recognizable community names
// based on centroid proximity. Ordered from most specific to most general.
const SUBURBAN_COMMUNITIES = [
  // Northwest Austin
  { name: "Anderson Mill", center: [30.429, -97.793], radius: 3.0 },
  { name: "The Arboretum", center: [30.400, -97.745], radius: 2.5 },
  { name: "Great Hills", center: [30.425, -97.755], radius: 3.0 },
  { name: "Balcones Woods", center: [30.418, -97.756], radius: 2.0 },
  { name: "Northwest Hills", center: [30.355, -97.775], radius: 2.5 },
  { name: "Jester Estates", center: [30.406, -97.779], radius: 2.0 },
  { name: "River Place", center: [30.343, -97.869], radius: 3.0 },
  { name: "Steiner Ranch", center: [30.455, -97.816], radius: 3.0 },
  { name: "Four Points", center: [30.477, -97.809], radius: 3.0 },
  { name: "Cat Mountain", center: [30.398, -97.762], radius: 2.0 },
  { name: "Rob Roy", center: [30.324, -97.813], radius: 2.5 },
  // North Austin
  { name: "Wells Branch", center: [30.440, -97.665], radius: 3.5 },
  { name: "Scofield Farms", center: [30.445, -97.745], radius: 3.0 },
  { name: "Gracywoods", center: [30.430, -97.700], radius: 3.0 },
  { name: "Tech Ridge", center: [30.434, -97.690], radius: 2.5 },
  { name: "Canyon Creek", center: [30.458, -97.795], radius: 3.0 },
  { name: "Avery Ranch", center: [30.446, -97.777], radius: 2.5 },
  { name: "Lakeline", center: [30.475, -97.765], radius: 3.0 },
  // Northeast
  { name: "Harris Ridge", center: [30.465, -97.680], radius: 3.5 },
  { name: "Harris Branch", center: [30.383, -97.658], radius: 3.0 },
  { name: "Springdale", center: [30.288, -97.639], radius: 2.5 },
  { name: "Wildhorse Ranch", center: [30.274, -97.598], radius: 3.0 },
  // East
  { name: "ShadowGlen", center: [30.303, -97.578], radius: 3.0 },
  { name: "Del Valle", center: [30.177, -97.591], radius: 5.0 },
  { name: "Pilot Knob", center: [30.159, -97.680], radius: 3.0 },
  // Southwest
  { name: "Oak Hill", center: [30.195, -97.850], radius: 4.0 },
  { name: "Circle C Ranch", center: [30.185, -97.879], radius: 3.0 },
  { name: "Shady Hollow", center: [30.170, -97.830], radius: 3.5 },
  { name: "Cherry Creek", center: [30.155, -97.815], radius: 3.0 },
  { name: "Barton Creek West", center: [30.206, -97.849], radius: 2.5 },
  { name: "Westlake Hills", center: [30.275, -97.900], radius: 3.0 },
  // South
  { name: "Onion Creek", center: [30.172, -97.755], radius: 3.0 },
  { name: "Southpark Meadows", center: [30.087, -97.799], radius: 4.0 },
  { name: "South Manchaca", center: [30.130, -97.800], radius: 4.0 },
  // Surrounding cities
  { name: "Pflugerville", center: [30.460, -97.688], radius: 5.0 },
  { name: "Round Rock", center: [30.495, -97.785], radius: 5.0 },
  { name: "Cedar Park", center: [30.445, -97.825], radius: 4.0 },
  { name: "Bee Cave", center: [30.165, -97.906], radius: 4.0 },
  { name: "Manor", center: [30.350, -97.590], radius: 5.0 },
];

function assignToSuburbanCommunity(lat, lng) {
  let bestMatch = null;
  let bestDist = Infinity;
  for (const comm of SUBURBAN_COMMUNITIES) {
    const dist = haversineKm(lat, lng, comm.center[0], comm.center[1]);
    if (dist <= comm.radius && dist < bestDist) {
      bestDist = dist;
      bestMatch = comm;
    }
  }
  return bestMatch;
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

function buildNeighborhoodPolygon(hood, tractsGeoJSON, mergedSecondaries) {
  // Include merged secondary tract polygons alongside primary tracts
  const allIds = new Set(hood.tract_ids);
  hood.tract_ids.forEach(tid => {
    const secondaries = mergedSecondaries.get(tid);
    if (secondaries) secondaries.forEach(sid => allIds.add(sid));
  });
  const tractFeatures = tractsGeoJSON.features.filter(f =>
    allIds.has(f.properties.region_id)
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
      // Try nearest NPA within 1.5km (tight match only)
      const nearest = findNearestNPA([tract.lat, tract.lng], npa.features, nameField, 1.5);
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

      // Try suburban community reference table
      const community = assignToSuburbanCommunity(tract.lat, tract.lng);
      if (community) {
        const commId = slugify(community.name);
        if (!neighborhoodMap[commId]) {
          neighborhoodMap[commId] = {
            id: commId,
            name: community.name,
            tract_ids: [],
            source: "suburban-community",
          };
        }
        neighborhoodMap[commId].tract_ids.push(tract.region_id);
        continue;
      }

      stillUnassigned.push(tract);
    }

    // Last resort: use tract's own display_name as a standalone neighborhood
    for (const tract of stillUnassigned) {
      const name = tract.display_name || `Tract ${tract.region_id}`;
      const id = slugify(name);
      if (!neighborhoodMap[id]) {
        neighborhoodMap[id] = {
          id,
          name,
          tract_ids: [],
          source: "tract-display-name",
        };
      }
      neighborhoodMap[id].tract_ids.push(tract.region_id);
    }

    const reassigned = unassigned.length - stillUnassigned.length;
    console.log(`  Suburban community matches: ${reassigned}`);
    console.log(`  Standalone tract names: ${stillUnassigned.length}`);
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

  // ── Name-based clustering ─────────────────────────────────────────────
  // Find tracts sharing a base name (before " — " directional suffix)
  // that are within 8km of each other, and merge them into one neighborhood.
  console.log("\n  Name-based clustering...");
  let clustersMerged = 0;

  function extractBaseName(displayName) {
    return displayName
      .replace(/\s*[—–-]\s*(North|South|East|West|Northeast|Northwest|Southeast|Southwest|Inner|Outer|Central).*$/i, "")
      .replace(/\s*#\d+$/, "")
      .replace(/\s*\(.*\)$/, "")
      .trim();
  }

  // Group all visible tracts by base name
  const baseNameGroups = {};
  VISIBLE_REGIONS.forEach(r => {
    const base = extractBaseName(r.display_name);
    if (!baseNameGroups[base]) baseNameGroups[base] = [];
    baseNameGroups[base].push(r);
  });

  for (const [base, tracts] of Object.entries(baseNameGroups)) {
    if (tracts.length < 2) continue;

    // Check max spread
    let maxDist = 0;
    for (let i = 0; i < tracts.length; i++) {
      for (let j = i + 1; j < tracts.length; j++) {
        maxDist = Math.max(maxDist, haversineKm(tracts[i].lat, tracts[i].lng, tracts[j].lat, tracts[j].lng));
      }
    }
    if (maxDist > 8) continue; // Too spread out to be one neighborhood

    // Skip if this base name already matches an existing NPA neighborhood
    // (those tracts are already correctly assigned)
    const tractIds = tracts.map(t => t.region_id);

    // Check if all these tracts are already in the SAME neighborhood
    const currentHoods = new Set();
    for (const [, hood] of Object.entries(neighborhoodMap)) {
      for (const tid of tractIds) {
        if (hood.tract_ids.includes(tid)) currentHoods.add(hood.id);
      }
    }
    if (currentHoods.size <= 1) continue; // Already together

    // Merge: create a new neighborhood with this base name, pulling tracts from their current hoods
    const clusterId = slugify(base);
    // Don't overwrite a direct NPA match
    if (neighborhoodMap[clusterId]?.source === "City of Austin NPA") continue;

    // Remove these tracts from their current neighborhoods
    for (const hood of Object.values(neighborhoodMap)) {
      hood.tract_ids = hood.tract_ids.filter(id => !tractIds.includes(id));
    }

    neighborhoodMap[clusterId] = {
      id: clusterId,
      name: base,
      tract_ids: tractIds,
      source: neighborhoodMap[clusterId]?.source || "name-cluster",
    };
    clustersMerged++;
  }

  // Clean up empty neighborhoods after clustering
  for (const [id, hood] of Object.entries(neighborhoodMap)) {
    if (hood.tract_ids.length === 0) delete neighborhoodMap[id];
  }
  console.log(`  Clusters formed: ${clustersMerged}`);

  // Safety net: any unassigned tracts become standalone neighborhoods
  const allAssignedIds = new Set(
    Object.values(neighborhoodMap).flatMap(h => h.tract_ids)
  );
  let unassignedCount = 0;
  for (const tract of VISIBLE_REGIONS) {
    if (!allAssignedIds.has(tract.region_id)) {
      const name = tract.display_name || `Tract ${tract.region_id}`;
      const id = slugify(name) + "-standalone";
      neighborhoodMap[id] = {
        id,
        name,
        tract_ids: [tract.region_id],
        source: "unassigned",
      };
      unassignedCount++;
    }
  }
  if (unassignedCount > 0) console.log(`  Unassigned tracts made standalone: ${unassignedCount}`);

  // ── Contiguity enforcement (true polygon adjacency) ─────────────────
  // A neighborhood must be a single connected component: every tract must
  // share a boundary (directly or transitively) with the others. Uses actual
  // tract polygons, not centroid distances. Non-contiguous components are
  // split off: single tracts become standalones, multi-tract components
  // become their own directional neighborhoods.
  console.log("\n  Contiguity enforcement (polygon adjacency)...");

  console.log("  Loading REGIONS_GEOJSON for adjacency tests...");
  const REGIONS_GEOJSON = loadRegionsGeoJSON();
  console.log(`  Loaded ${REGIONS_GEOJSON.features.length} tract features`);

  // primary_id → [secondary_ids] for merged tracts (a primary's footprint
  // includes its merged secondaries' polygons)
  const mergedSecondaries = new Map();
  REGION_INDEX.filter(r => r.merge_into).forEach(r => {
    if (!mergedSecondaries.has(r.merge_into)) mergedSecondaries.set(r.merge_into, []);
    mergedSecondaries.get(r.merge_into).push(r.region_id);
  });

  const featureById = new Map(
    REGIONS_GEOJSON.features.map(f => [f.properties.region_id, f])
  );

  function footprintFeatures(regionId) {
    const ids = [regionId, ...(mergedSecondaries.get(regionId) || [])];
    return ids.map(id => featureById.get(id)).filter(Boolean);
  }

  // Small buffer (in km) absorbs hairline gaps from coordinate rounding
  const GAP_TOLERANCE_KM = 0.05;
  const adjacencyCache = new Map();

  function tractsAdjacent(idA, idB) {
    const key = idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
    if (adjacencyCache.has(key)) return adjacencyCache.get(key);

    // Cheap reject: centroids > 15 km apart cannot be adjacent tracts
    const a = REGION_INDEX.find(r => r.region_id === idA);
    const b = REGION_INDEX.find(r => r.region_id === idB);
    if (a && b && haversineKm(a.lat, a.lng, b.lat, b.lng) > 15) {
      adjacencyCache.set(key, false);
      return false;
    }

    const featsA = footprintFeatures(idA);
    const featsB = footprintFeatures(idB);
    let touching = false;
    outer:
    for (const fa of featsA) {
      for (const fb of featsB) {
        try {
          if (turf.booleanIntersects(fa, fb)) { touching = true; break outer; }
          // Retry with a tiny buffer to absorb precision gaps
          const buffered = turf.buffer(fa, GAP_TOLERANCE_KM, { units: "kilometers" });
          if (buffered && turf.booleanIntersects(buffered, fb)) { touching = true; break outer; }
        } catch (e) { /* invalid geometry — treat as not touching */ }
      }
    }
    adjacencyCache.set(key, touching);
    return touching;
  }

  function connectedComponents(tractIds) {
    const remaining = new Set(tractIds);
    const components = [];
    while (remaining.size > 0) {
      const seed = remaining.values().next().value;
      const comp = [seed];
      remaining.delete(seed);
      const queue = [seed];
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const other of [...remaining]) {
          if (tractsAdjacent(cur, other)) {
            remaining.delete(other);
            comp.push(other);
            queue.push(other);
          }
        }
      }
      components.push(comp);
    }
    return components;
  }

  function directionLabel(fromLat, fromLng, toLat, toLng) {
    const dLat = toLat - fromLat;
    const dLng = toLng - fromLng;
    const ns = dLat > 0 ? "North" : "South";
    const ew = dLng > 0 ? "East" : "West";
    return Math.abs(dLat) * 1.2 > Math.abs(dLng) ? ns : ew;
  }

  let ejectedTotal = 0;
  let splitTotal = 0;

  for (const hood of Object.values(neighborhoodMap)) {
    if (hood.tract_ids.length < 2) continue;

    const components = connectedComponents(hood.tract_ids);
    if (components.length === 1) continue; // fully contiguous

    // Keep the largest component under the hood's identity
    // (tie-break: component containing the lowest region_id, for determinism)
    components.sort((x, y) => y.length - x.length || Math.min(...x) - Math.min(...y));
    const kept = components[0];
    hood.tract_ids = kept;

    const keptTracts = kept.map(id => REGION_INDEX.find(r => r.region_id === id)).filter(Boolean);
    const keptLat = keptTracts.reduce((s, t) => s + t.lat, 0) / keptTracts.length;
    const keptLng = keptTracts.reduce((s, t) => s + t.lng, 0) / keptTracts.length;

    for (const comp of components.slice(1)) {
      if (comp.length === 1) {
        // Single detached tract → standalone neighborhood
        const tract = REGION_INDEX.find(r => r.region_id === comp[0]);
        const name = tract?.display_name || `Tract ${comp[0]}`;
        const standaloneId = slugify(name) + "-ejected";
        neighborhoodMap[standaloneId] = {
          id: standaloneId,
          name,
          tract_ids: comp,
          source: "ejected-orphan",
        };
        ejectedTotal++;
      } else {
        // Multi-tract detached component → own neighborhood, directional name
        const compTracts = comp.map(id => REGION_INDEX.find(r => r.region_id === id)).filter(Boolean);
        const cLat = compTracts.reduce((s, t) => s + t.lat, 0) / compTracts.length;
        const cLng = compTracts.reduce((s, t) => s + t.lng, 0) / compTracts.length;
        const dir = directionLabel(keptLat, keptLng, cLat, cLng);
        let name = `${hood.name} — ${dir}`;
        let splitId = slugify(name);
        // Avoid id collisions if two components split in the same direction
        while (neighborhoodMap[splitId]) {
          splitId += "-x";
          name += " ";
        }
        neighborhoodMap[splitId] = {
          id: splitId,
          name: name.trim(),
          tract_ids: comp,
          source: "split-noncontiguous",
        };
        splitTotal++;
      }
    }

    console.log(
      `    ${hood.name}: ${components.length} disconnected component(s) — kept ${kept.length} tract(s), ` +
      `split off ${components.slice(1).map(c => `[${c.join(", ")}]`).join(" ")}`
    );
  }

  console.log(`  Detached single tracts made standalone: ${ejectedTotal}`);
  console.log(`  Multi-tract components split off: ${splitTotal}`);

  // After ejecting, convert single-tract suburban-community hoods to standalone
  let suburbanConverted = 0;
  for (const [hoodId, hood] of Object.entries(neighborhoodMap)) {
    if (hood.tract_ids.length === 1 && hood.source === "suburban-community") {
      const tract = REGION_INDEX.find(r => r.region_id === hood.tract_ids[0]);
      const name = tract?.display_name || hood.name;
      hood.name = name;
      hood.source = "ejected-orphan";
      suburbanConverted++;
    }
  }
  if (suburbanConverted > 0) console.log(`    Single-tract suburban communities converted: ${suburbanConverted}`);

  // Warn about remaining high-spread neighborhoods (NPA boundaries are authoritative)
  for (const hood of Object.values(neighborhoodMap)) {
    if (hood.tract_ids.length < 2) continue;
    const tracts = hood.tract_ids.map(id => REGION_INDEX.find(r => r.region_id === id)).filter(Boolean);
    let maxDist = 0;
    for (let i = 0; i < tracts.length; i++) {
      for (let j = i + 1; j < tracts.length; j++) {
        maxDist = Math.max(maxDist, haversineKm(tracts[i].lat, tracts[i].lng, tracts[j].lat, tracts[j].lng));
      }
    }
    if (maxDist > 6) {
      console.warn(`    WARNING: ${hood.name} still has ${maxDist.toFixed(1)} km spread (${hood.tract_ids.length} tracts, source: ${hood.source})`);
    }
  }

  // Clean up empty neighborhoods
  for (const [id, hood] of Object.entries(neighborhoodMap)) {
    if (hood.tract_ids.length === 0) delete neighborhoodMap[id];
  }

  // Mark non-NPA neighborhoods as "(under review)"
  const npaSources = new Set(["City of Austin NPA", "City of Austin NPA (nearest)", "manual"]);
  let underReviewCount = 0;
  for (const hood of Object.values(neighborhoodMap)) {
    if (!npaSources.has(hood.source)) {
      hood.name = hood.name + " (under review)";
      underReviewCount++;
    }
  }
  console.log(`  Neighborhoods marked "(under review)": ${underReviewCount}`);

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
  console.log(`  Reusing REGIONS_GEOJSON loaded during contiguity enforcement`);
  console.log(`  Merged secondary tracts: ${REGION_INDEX.filter(r => r.merge_into).length} (across ${mergedSecondaries.size} primary tracts)`);

  const neighborhoodFeatures = [];
  let unionFails = 0;

  for (const hood of neighborhoods) {
    const feature = buildNeighborhoodPolygon(hood, REGIONS_GEOJSON, mergedSecondaries);
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
