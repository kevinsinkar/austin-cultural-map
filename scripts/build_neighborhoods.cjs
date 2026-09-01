// build_neighborhoods.cjs
// Builds tract→neighborhood mapping from majority AREA overlap with City of
// Austin NPA polygons.
//
// RULES:
//   1. A tract joins a named neighborhood ONLY if that neighborhood's NPA
//      polygon covers >= 80% of the tract's area (COVERAGE_THRESHOLD).
//   2. Every other tract stands alone, named by its census tract label
//      (e.g., "Tract 419.0") — census identity is primary when no
//      neighborhood decisively contains the tract.
//   3. Multi-tract neighborhoods must be contiguous: tract polygons must
//      touch. Disconnected components are split off.
//
// Prerequisite: node scripts/assign_names_by_area.cjs
//   (produces data/audit_output/tract_npa_overlap.json)
//
// Usage: node scripts/build_neighborhoods.cjs
// Outputs:
//   data/neighborhoods.js         — tract→neighborhood mapping + lookups
//   data/neighborhoods_geojson.js — merged polygon GeoJSON for Leaflet

const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

// ── Paths ──────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "data");
const OVERLAP_PATH = path.join(DATA_DIR, "audit_output", "tract_npa_overlap.json");
const NEIGHBORHOODS_OUT = path.join(DATA_DIR, "neighborhoods.js");
const NEIGHBORHOODS_GEOJSON_OUT = path.join(DATA_DIR, "neighborhoods_geojson.js");

const COVERAGE_THRESHOLD = 80; // % of tract area an NPA must cover to claim it

// ── Load project data (ESM files → read + eval) ───────────────────────────

function loadESM(filePath, exportNames) {
  let src = fs.readFileSync(filePath, "utf-8");
  src = src.replace(/^import\s+.*?;\s*$/gm, "");
  src = src.replace(/^export\s+const\s+/gm, "const ");
  src = src.replace(/^export\s+\{[^}]*\};\s*$/gm, "");
  src = src.replace(/^export\s+default\s+/gm, "const _default_ = ");
  const names = Array.isArray(exportNames) ? exportNames : [exportNames];
  const returnObj = names.map(n => `"${n}": typeof ${n} !== "undefined" ? ${n} : undefined`).join(", ");
  const fn = new Function(src + `\nreturn { ${returnObj} };`);
  return fn();
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

function main() {
  console.log("\n=== Build Neighborhoods (majority-area, >=80% threshold) ===\n");

  const { REGION_INDEX } = loadESM(
    path.join(DATA_DIR, "regionIndex.js"),
    ["REGION_INDEX"]
  );
  const VISIBLE_REGIONS = REGION_INDEX.filter(r => !r.merge_into);
  console.log(`Loaded REGION_INDEX: ${REGION_INDEX.length} total, ${VISIBLE_REGIONS.length} visible`);

  if (!fs.existsSync(OVERLAP_PATH)) {
    console.error(
      `ERROR: ${OVERLAP_PATH} not found.\n` +
      `Run first: node scripts/assign_names_by_area.cjs`
    );
    process.exit(1);
  }
  const overlap = new Map(
    JSON.parse(fs.readFileSync(OVERLAP_PATH, "utf-8"))
      .filter(r => !r.error)
      .map(r => [r.region_id, r])
  );
  console.log(`Loaded NPA overlap data for ${overlap.size} tracts`);

  // ── Step 1: Assignment by >=80% area coverage ─────────────────────────
  console.log(`\nStep 1: Assigning tracts (NPA must cover >= ${COVERAGE_THRESHOLD}% of tract area)...`);

  const neighborhoodMap = {}; // id → { id, name, tract_ids, source }
  let joined = 0;
  let standalone = 0;

  for (const tract of VISIBLE_REGIONS) {
    const ov = overlap.get(tract.region_id);
    const decisive = ov && ov.majority_npa && ov.majority_pct >= COVERAGE_THRESHOLD;

    if (decisive) {
      const id = slugify(ov.majority_npa);
      if (!neighborhoodMap[id]) {
        neighborhoodMap[id] = {
          id,
          name: ov.majority_npa,
          tract_ids: [],
          source: "npa-majority-area",
        };
      }
      neighborhoodMap[id].tract_ids.push(tract.region_id);
      joined++;
    } else {
      // Census identity is primary: standalone unit named by tract label
      const name = tract.tract_label || `Tract ${tract.region_id}`;
      const id = slugify(name) + `-${tract.region_id}`;
      neighborhoodMap[id] = {
        id,
        name,
        tract_ids: [tract.region_id],
        source: "census-tract",
      };
      standalone++;
    }
  }

  console.log(`  Joined named neighborhoods: ${joined} tracts`);
  console.log(`  Census-labeled standalones: ${standalone} tracts`);
  console.log(`  Named neighborhoods formed: ${Object.values(neighborhoodMap).filter(h => h.source === "npa-majority-area").length}`);

  // ── Step 2: Contiguity enforcement (true polygon adjacency) ───────────
  console.log("\nStep 2: Contiguity enforcement (polygon adjacency)...");

  console.log("  Loading REGIONS_GEOJSON for adjacency tests...");
  const REGIONS_GEOJSON = loadRegionsGeoJSON();
  console.log(`  Loaded ${REGIONS_GEOJSON.features.length} tract features`);

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

  const GAP_TOLERANCE_KM = 0.05;
  const adjacencyCache = new Map();

  function tractsAdjacent(idA, idB) {
    const key = idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
    if (adjacencyCache.has(key)) return adjacencyCache.get(key);

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

  let splitOff = 0;
  for (const hood of Object.values(neighborhoodMap)) {
    if (hood.tract_ids.length < 2) continue;

    const components = connectedComponents(hood.tract_ids);
    if (components.length === 1) continue;

    components.sort((x, y) => y.length - x.length || Math.min(...x) - Math.min(...y));
    hood.tract_ids = components[0];

    // Detached components fall back to census-labeled standalones —
    // the neighborhood does not decisively, contiguously contain them
    for (const comp of components.slice(1)) {
      for (const tid of comp) {
        const tract = REGION_INDEX.find(r => r.region_id === tid);
        const name = tract?.tract_label || `Tract ${tid}`;
        const id = slugify(name) + `-${tid}`;
        neighborhoodMap[id] = {
          id,
          name,
          tract_ids: [tid],
          source: "census-tract",
        };
        splitOff++;
      }
    }
    console.log(
      `    ${hood.name}: ${components.length} disconnected component(s) — kept ${components[0].length}, ` +
      `detached tract(s) ${components.slice(1).flat().join(", ")} -> census standalones`
    );
  }
  console.log(`  Detached tracts reverted to census standalones: ${splitOff}`);

  // ── Compute centroids + write ─────────────────────────────────────────
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

  const totalAssigned = neighborhoods.reduce((s, n) => s + n.tract_ids.length, 0);
  const named = neighborhoods.filter(n => n.source === "npa-majority-area");
  const largest = named.length
    ? named.reduce((a, b) => (a.tract_ids.length > b.tract_ids.length ? a : b))
    : null;

  console.log("\n=== Summary ===");
  console.log(`  Total neighborhoods (output): ${neighborhoods.length}`);
  console.log(`  Named neighborhoods (NPA >= ${COVERAGE_THRESHOLD}%): ${named.length}`);
  console.log(`  Census-tract standalones: ${neighborhoods.length - named.length}`);
  console.log(`  Total tracts assigned: ${totalAssigned} / ${VISIBLE_REGIONS.length} visible`);
  if (largest) console.log(`  Largest named neighborhood: "${largest.name}" (${largest.tract_ids.length} tracts)`);

  console.log("\nStep 3: Writing data/neighborhoods.js...");
  const neighborhoodsJS = `// Auto-generated by scripts/build_neighborhoods.cjs
// Assignment: a tract joins a named neighborhood ONLY if that City of Austin
// NPA polygon covers >= ${COVERAGE_THRESHOLD}% of the tract's area (majority-area rule).
// All other tracts are census-labeled standalone units.
// Multi-tract neighborhoods are enforced contiguous (tract polygons touching).
//
// To regenerate:
//   node scripts/assign_names_by_area.cjs   (tract/NPA area overlap)
//   node scripts/build_neighborhoods.cjs

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

  console.log("\nStep 4: Building neighborhood GeoJSON polygons...");
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

  const geojsonJS = `// Auto-generated by scripts/build_neighborhoods.cjs
// Polygons are unions of constituent census tract polygons
// Do NOT export from data/index.js — only useAustinMap.js should import this
export const NEIGHBORHOODS_GEOJSON = ${JSON.stringify({ type: "FeatureCollection", features: neighborhoodFeatures })};
`;
  fs.writeFileSync(NEIGHBORHOODS_GEOJSON_OUT, geojsonJS, "utf-8");
  console.log(`  ✓ Wrote ${NEIGHBORHOODS_GEOJSON_OUT}`);
  console.log(`  ${neighborhoodFeatures.length} neighborhood polygons (${unionFails} failures)`);

  console.log("\n=== Done ===\n");
}

main();
