import { REGIONS_GEOJSON } from "./regions";

export const REGION_NAMES = REGIONS_GEOJSON.features.map(f => f.properties.region_name);

export const TIMELINE_EVENTS = [
  { year: 1928, label: "1928 Master Plan" },
  { year: 1991, label: "Live Music Capital" },
  { year: 1997, label: "Smart Growth" },
  { year: 2000, label: "SMART Housing" },
  { year: 2004, label: "Rainey Rezoned" },
  { year: 2010, label: "Oracle" },
  { year: 2012, label: "Apple Ch.380" },
  { year: 2016, label: "Apple Campus" },
  { year: 2018, label: "CodeNEXT Scrapped" },
  { year: 2020, label: "Project Connect" },
  { year: 2023, label: "HOME Phase 1" },
  { year: 2024, label: "Agent of Change" },
];

export const SNAP_YEARS = [1990, 2000, 2010, 2020, 2023];
export const PLAY_YEARS = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023, 2025];

export const DEMO_COLORS = {
  White: "#94a3b8",
  Black: "#7c3aed",
  Hispanic: "#f59e0b",
  Asian: "#06b6d4",
  Other: "#a3a3a3",
};
