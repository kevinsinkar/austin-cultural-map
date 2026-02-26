import * as d3 from "d3";
import { MUSIC_NIGHTLIFE } from "../data/musicNightlife";
import { PROPERTY_DATA } from "../data/propertyData";

export function getMusicData(regionName, yr) {
  const rows = MUSIC_NIGHTLIFE.filter((m) => m.region === regionName);
  if (!rows.length) return null;
  const closest = rows.reduce(
    (a, b) => (Math.abs(b.year - yr) < Math.abs(a.year - yr) ? b : a),
    rows[0]
  );
  return closest;
}

export function getDevPressureColor(regionName, yr) {
  const rows = PROPERTY_DATA.filter((p) => p.region === regionName);
  if (!rows.length) return "#fb923c";
  const closest = rows.reduce(
    (a, b) => (Math.abs(b.year - yr) < Math.abs(a.year - yr) ? b : a),
    rows[0]
  );
  if (!closest || !closest.yoy) return "#fb923c";
  const yoy = closest.yoy;
  if (yoy < 0.1) return "#fb923c";
  return d3.interpolateRgb("#fb923c", "#ef4444")(Math.min((yoy - 0.18) / 0.17, 1));
}
