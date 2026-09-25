// Historical events + geographic reference layers from the Preservation Austin
// data package ("Austin Historical Tool: Data Specification", Sept 2026).
// Source of truth: /Preservation Austin/files — these are verbatim copies.
import eventsRaw from "./events_all.json";
import geoRef from "./geo_reference.json";
import holc from "./holc_1935.json";

export const HISTORY_META = eventsRaw.meta;

// Sorted by start year; undated events sort last
export const HISTORY_EVENTS = [...eventsRaw.events].sort((a, b) => {
  const av = a.date_start_sort ?? Infinity;
  const bv = b.date_start_sort ?? Infinity;
  return av - bv;
});

export const EVENT_BY_ID = new Map(HISTORY_EVENTS.map((e) => [e.event_id, e]));

// ── Geographic reference layers (WGS84 GeoJSON features) ──
const feats = geoRef.features.filter((f) => f.geometry && f.geometry.type);

export const GEO_CITY_LIMITS = feats.filter((f) => f.properties.feature_id.startsWith("CITY_"));
export const GEO_ZONES = feats.filter((f) => f.properties.feature_id.startsWith("ZONE_"));
export const GEO_NEIGHBORHOODS = feats.filter((f) => f.properties.feature_id.startsWith("NBHD_"));
export const GEO_CORRIDORS = feats.filter((f) =>
  ["CORRIDOR_I35_CAPEX_CENTRAL", "ROUTE_TONKAWA_1884_85"].includes(f.properties.feature_id)
);

// HOLC 1935 redlining polygons. CC BY-NC — non-commercial use only, credit
// Mapping Inequality (Digital Scholarship Lab, University of Richmond).
export const HOLC_1935 = holc;
export const HOLC_ATTRIBUTION =
  "HOLC 1935 map: Mapping Inequality, Digital Scholarship Lab, University of Richmond (CC BY-NC). No area descriptions survive for Austin.";
export const HOLC_GRADES = (() => {
  const seen = new Map();
  holc.features.forEach((f) => {
    const { grade, category, fill } = f.properties;
    if (grade && !seen.has(grade)) seen.set(grade, { grade, category, fill });
  });
  return [...seen.values()].sort((a, b) => a.grade.localeCompare(b.grade));
})();

// ── Era ordering (README §3.5) ──
export const ERA_ORDER = [
  "Deep Time (Context)",
  "Pre-Contact",
  "Spanish Colonial",
  "Mexican Period",
  "Early Anglo Settlement",
  "Indigenous Removal Era",
  "Slavery, Emancipation & Reconstruction",
  "Immigration & Institutional Growth",
  "Segregation Era",
  "Postwar Growth & Urban Renewal",
  "Civil Rights Era",
  "Tech Boom Era",
  "Contemporary",
];

// ── Time warp for the timeline axis (README §1.3) ──
// Three-quarters of the axis goes to 1800–2026, the heavily researched period.
export const timeWarp = (y) =>
  y == null ? null : y <= 1000 ? 0 : y <= 1800 ? (0.25 * (y - 1000)) / 800 : Math.min(1, 0.25 + (0.75 * (y - 1800)) / 226);

export const UNDATED_COLOR = "#8A8A8A";

// Viridis anchors used by the package's precomputed era_color_gradient values
export const ERA_GRADIENT_CSS =
  "linear-gradient(to right,#440154,#46327E,#365C8D,#277F8E,#1FA187,#4AC16D,#A0DA39)";

// ── Documentation flags: primary + secondary, matched at any level ──
export const allFlags = (ev) => [
  ev.documentation_validity_flag,
  ...(ev.documentation_validity_secondary || []).map((s) => s.flag),
];

export const FLAG_OPTIONS = [
  "Well-Documented",
  "Partially Documented",
  "Oral History/Community Knowledge",
  "Disputed/Conflicting Accounts",
  "Intentionally Erased",
  "Under-Researched",
];

// ── Label maps for controlled vocabularies ──
export const COMMUNITY_LABELS = {
  BLACK_AUSTIN: "Black Austin",
  MEXICAN_TEJANO_MEXICAN_AMERICAN: "Mexican / Tejano / Mexican American",
  LGBTQ_AUSTIN: "LGBTQ+ Austin",
  TONKAWA: "Tonkawa",
  COMANCHE: "Comanche",
  LIPAN_APACHE: "Lipan Apache",
  INDIGENOUS_GENERAL: "Indigenous (general)",
  MISSION_ERA_BANDS: "Mission-era bands",
  COAHUILTECAN_UMBRELLA: "Coahuiltecan (umbrella term)",
  OTHER_NATIVE_NATIONS: "Other Native nations",
  ASIAN_AUSTIN: "Asian Austin",
  JEWISH_AUSTIN: "Jewish Austin",
  LEBANESE_SYRIAN_AUSTIN: "Lebanese / Syrian Austin",
  EUROPEAN_IMMIGRANT: "European immigrant communities",
  ANGLO_AUSTIN: "Anglo Austin",
  SPANISH_COLONIAL: "Spanish colonial",
  LABOR: "Labor",
  ADVOCACY_CIVIC: "Advocacy / civic organizations",
  RELIGIOUS_INSTITUTIONS: "Religious institutions",
  PRESERVATION_SECTOR: "Preservation sector",
  PRIVATE_SECTOR: "Private sector",
  UT_UNIVERSITY: "UT / university",
  SUBURBAN_COMMUNITIES: "Suburban communities",
  GOV_CITY: "City government",
  GOV_STATE: "State government",
  GOV_FEDERAL: "Federal government",
  GOV_MEXICO: "Government of Mexico",
  GOV_LOCAL_REGIONAL: "Local / regional government",
};

export const communityLabel = (tag) => COMMUNITY_LABELS[tag] || tag;

export const TYPE_GROUP_LABELS = {
  POLICY: "Policy & planning",
  INFRA: "Infrastructure",
  DEMOG: "Demographic policy",
  CULTURE: "Cultural",
  DEMOLITION: "Demolition",
  ACQUISITION: "Acquisition",
  ORGANIZING: "Organizing & resistance",
  ECONOMIC: "Economic",
  CONFLICT: "Armed conflict",
  ENVIRONMENT: "Environmental hazard",
  MEASURE: "Census & measures",
  PRESENCE: "Long-duration presence",
};

// ── Indigenous presence zone colors (one hue per nation; overlaps show as blends) ──
export const ZONE_COLORS = {
  ZONE_TONKAWA_CENTRAL_TX: "#a16207",
  ZONE_TONKAWA_RECORDED_RANGE: "#a16207",
  ZONE_TONKAWA_PLAINS_ACCOUNT: "#a16207",
  ZONE_COMANCHERIA: "#0e7490",
  ZONE_PENATEKA_RANGE: "#0e7490",
  ZONE_LIPAN_1730: "#7e22ce",
  ZONE_LIPAN_SOUTH_TEXAS: "#7e22ce",
  ZONE_MISSION_ERA_BANDS: "#b91c1c",
  ZONE_COAHUILTECAN_UMBRELLA: "#57534e",
};

export const ZONE_LEGEND = [
  { label: "Tonkawa", color: "#a16207" },
  { label: "Comanche / Penateka", color: "#0e7490" },
  { label: "Lipan Apache", color: "#7e22ce" },
  { label: "Mission-era bands", color: "#b91c1c" },
  { label: "Coahuiltecan (umbrella)", color: "#57534e" },
];
