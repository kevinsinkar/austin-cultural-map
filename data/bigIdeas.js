// ── The ideas the map is built around, and the path through them ──
//
// Five takeaways, in a teaching order, each paired with one thing to do on
// the map. Shown in the "Start here" card when nothing is selected.
//
// Every number below is computed from the site's own data when the page
// loads (never typed in), so the text cannot drift from what the map shows.
// The wording of idea 1 reuses the 1928 timeline entry in data/constants.js.

import { REGION_INDEX } from "./regionIndex";
import { LEGACY_OPERATING, LEGACY_CLOSED } from "./businesses";
import { TIMELINE_EVENTS } from "./constants";
import { calcDirectDisplacement } from "../utils/math";
import { tractPlace } from "../utils/places";
import { STAGE_CLASSES, stageCounts } from "../utils/stages";

// Places offered as a first click. An editorial pick by the site maintainer:
// three east-side tracts with a large measured change since 2000 (88% to 34%,
// 94% to 42% and 91% to 62% Black and Hispanic residents) that also have
// tracked cultural anchors or a documented turning point.
export const SUGGESTED_TRACTS = [84, 111, 16];

// The tract used as the worked example in idea 2.
const EXAMPLE_TRACT = 84;

// Downtown reference point (Congress Ave at 6th St) for "how far out".
const DOWNTOWN = { lat: 30.2672, lng: -97.7431 };
const milesFromDowntown = (r) =>
  Math.hypot((r.lat - DOWNTOWN.lat) * 69.0, (r.lng - DOWNTOWN.lng) * 59.7);
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

let cache = null;

/** Figures behind idea 2: tracts measured in both 2000 and 2023. */
function measuredChangeStats() {
  const rows = REGION_INDEX
    .filter((r) => !r.merge_into)
    .map((r) => ({ r, dd: calcDirectDisplacement(r.region_id) }))
    .filter((x) => x.dd && x.dd.fromYear === 2000 && x.dd.toYear === 2023);
  const fell = rows.filter((x) => x.dd.bhDelta <= -10);
  const rose = rows.filter((x) => x.dd.bhDelta >= 10);
  return {
    measured: rows.length,
    fell: fell.length,
    rose: rose.length,
    fellMiles: median(fell.map((x) => milesFromDowntown(x.r))),
    roseMiles: median(rose.map((x) => milesFromDowntown(x.r))),
  };
}

/**
 * @returns {Array<{ id, title, body: string[], action?: { key, label } }>}
 * Action keys are handled by the map page: "holc", "example", "legend",
 * "anchors", "places".
 */
export function buildBigIdeas() {
  if (cache) return cache;
  const plan = TIMELINE_EVENTS.find((e) => e.year === 1928);
  const stats = measuredChangeStats();
  const example = tractPlace(EXAMPLE_TRACT);
  const exampleChange = calcDirectDisplacement(EXAMPLE_TRACT);

  const moved = stats.fellMiles != null && stats.roseMiles != null && stats.fellMiles < stats.roseMiles
    ? ` The tracts where it fell are typically about ${stats.fellMiles.toFixed(0)} miles from downtown; the tracts where it rose, about ${stats.roseMiles.toFixed(0)} miles.`
    : "";

  // Idea 3: how many tracts sit in each stage in the latest census survey.
  const counts = stageCounts(2023);
  const inStage = STAGE_CLASSES.reduce((a, c) => a + counts[c.key], 0);
  const scored = inStage + counts.none;
  const breakdown = STAGE_CLASSES.map((c) => `${counts[c.key]} ${c.label.toLowerCase()}`).join(", ");

  cache = [
    {
      id: "policy",
      title: "Where people live was shaped by policy",
      body: [
        plan ? `In 1928: ${plan.blurb}` : "",
        "In 1935 a federal lending map graded Austin's neighborhoods from “Best” to “Hazardous.” You can lay that map over today's.",
      ].filter(Boolean),
      action: { key: "holc", label: "Show the 1935 map", activeLabel: "Hide the 1935 map" },
    },
    {
      id: "measured",
      title: "Displacement can be measured",
      body: [
        `Between 2000 and 2023, the share of residents who are Black or Hispanic fell by 10 points or more in ${stats.fell} of the ${stats.measured} census tracts measured in both years. In ${stats.rose} tracts it rose by 10 points or more.${moved}`,
        example && exampleChange
          ? `One example: in the ${example.title}, it went from ${exampleChange.bhFrom.toFixed(0)}% to ${exampleChange.bhTo.toFixed(0)}%.`
          : "",
      ].filter(Boolean),
      action: example ? { key: "example", label: "Show that example", tractId: EXAMPLE_TRACT } : undefined,
    },
    {
      id: "stages",
      title: "Places are at different stages",
      body: [
        "The colors sort areas into five stages. “Vulnerable” means residents are exposed to rising housing costs and little has changed yet. Early, dynamic and late mark change under way. “Continued loss” is where most vulnerable residents have already gone.",
        `In the latest census survey, ${inStage} of the ${scored} census tracts scored are in a stage: ${breakdown}. The rest are not, because their residents are not vulnerable by these measures.`,
        "A stage describes an area as a whole. It is not a verdict on any block or household.",
      ],
      action: { key: "legend", label: "Explain the colors" },
    },
    {
      id: "anchors",
      title: "Culture has an address",
      body: [
        `The map tracks ${LEGACY_OPERATING.length} long-running businesses and gathering places that are still operating and ${LEGACY_CLOSED.length} that have closed.`,
        "Green dots are open. Gray dots are closed, and each one appears in the year it closed.",
      ],
      action: { key: "anchors", label: "Show them in 2023" },
    },
    {
      id: "places",
      title: "Every place has its own story",
      body: [
        "Select any area on the map, or start with one of these. Each has a story card you can read, print or share.",
      ],
      action: { key: "places" },
    },
  ];
  return cache;
}
