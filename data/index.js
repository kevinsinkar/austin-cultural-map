// REGIONS_GEOJSON (~7.6 MB) is NOT barrel-exported;
// only hooks/useAustinMap.js imports it directly for Leaflet rendering.
export { REGION_INDEX } from "./regionIndex";
export { NAME_TO_ID, ID_TO_NAME, toId, toName } from "./regionLookup";
// REGION_SVGS was previously used for SVG overlays but has been
// deprecated in favor of rendering REGIONS_GEOJSON with Leaflet's
// native styling and event handling (see useAustinMap.js).
export { LEGACY_OPERATING, LEGACY_CLOSED } from "./businesses";
export { DEMOGRAPHICS } from "./interim_demographics";
export { SOCIOECONOMIC } from "./interim_socioeconomic";
export { TIPPING_POINTS } from "./tippingPoints";
export { AUDITED_DVI_LOOKUP } from "./auditedDvi";
export { MUSIC_NIGHTLIFE } from "./musicNightlife";
export { PROPERTY_DATA } from "./interim_property";
export { PROJECT_CONNECT_LINES, PC_PROXIMITY_REGIONS } from "./projectConnect";
export { TIMELINE_INFRA } from "./timelineInfra";
export {
  REGION_NAMES,
  TIMELINE_EVENTS,
  SNAP_YEARS,
  PLAY_YEARS,
  DEMO_COLORS,
} from "./constants";
