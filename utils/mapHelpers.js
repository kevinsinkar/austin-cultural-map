import * as d3 from "d3";
import { MUSIC_NIGHTLIFE } from "../data/musicNightlife";
import { AUDITED_PROP_BY_ID } from "../data/auditedData";
import { NAME_TO_ID } from "../data/regionLookup";

export function getMusicData(regionNameOrId, yr) {
  // Accept region_id (number) or display_name (string)
  const rid = typeof regionNameOrId === "number" ? regionNameOrId : NAME_TO_ID.get(regionNameOrId);
  const rows = rid != null
    ? MUSIC_NIGHTLIFE.filter((m) => m.region_id === rid)
    : MUSIC_NIGHTLIFE.filter((m) => m.region === regionNameOrId);
  if (!rows.length) return null;
  const closest = rows.reduce(
    (a, b) => (Math.abs(b.year - yr) < Math.abs(a.year - yr) ? b : a),
    rows[0]
  );
  return closest;
}

export function getDevPressureColor(regionNameOrId, yr) {
  const rid = typeof regionNameOrId === "number" ? regionNameOrId : NAME_TO_ID.get(regionNameOrId);
  const rows = rid != null ? AUDITED_PROP_BY_ID.get(rid) : null;
  if (!rows || !rows.length) return "#fb923c";
  const closest = rows.reduce(
    (a, b) => (Math.abs(b.year - yr) < Math.abs(a.year - yr) ? b : a),
    rows[0]
  );
  const yoy = closest?.pct_home_value_change_yoy ?? closest?.yoy;
  if (!yoy || yoy < 0.1) return "#fb923c";
  return d3.interpolateRgb("#fb923c", "#ef4444")(Math.min((yoy - 0.18) / 0.17, 1));
}
