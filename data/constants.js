import { REGION_INDEX } from "./regionIndex";

export const REGION_NAMES = REGION_INDEX
  .filter(r => !r.merge_into)
  .map(r => r.display_name)
  .sort((a, b) => a.localeCompare(b));

// Timeline anchor events. `blurb` feeds the clickable tick popovers on the
// map's time bar; `callout` is the one-line, tract-aware note surfaced in
// the detail panel when the slider crosses the event; `affects` scopes that
// callout ("east" = east-of-I-35 tracts only, "citywide" = any tract);
// `historyEventId` links "Read more" to the History tab's event record.
export const TIMELINE_EVENTS = [
  {
    year: 1928, label: "1928 Master Plan", affects: "east",
    historyEventId: "EV_1928_CITY_PLAN",
    blurb: "The Koch & Fowler city plan designated East Austin as the city's “Negro district,” steering Black residents east by restricting municipal services elsewhere. It is the structural root of the East/West divide this map still shows.",
    callout: "This tract sits in the area shaped by the 1928 plan's segregation of Black Austin east of what became I-35.",
  },
  {
    year: 1991, label: "Live Music Capital", affects: "citywide",
    blurb: "Austin adopted “Live Music Capital of the World” as its official slogan, making music central to the city's identity and marketing. Rising rents have since pushed many of the venues the slogan celebrated out of the urban core.",
    callout: "Austin brands itself the Live Music Capital — venue rents begin their long climb.",
  },
  {
    year: 1997, label: "Smart Growth", affects: "east",
    historyEventId: "EV_1998_SMART_GROWTH",
    blurb: "The Smart Growth Initiative steered development into a “Desired Development Zone” that included East Austin. Meant to protect the aquifer to the west, it aimed new investment squarely at the city's historically redlined neighborhoods.",
    callout: "Smart Growth (1997) placed this side of town in the Desired Development Zone, redirecting investment east.",
  },
  {
    year: 2000, label: "SMART Housing", affects: "east",
    blurb: "The SMART Housing program traded fee waivers and fast-track review for below-market units. It accelerated building in the urban core, where East Austin land was cheapest.",
    callout: "SMART Housing (2000) fast-tracked development in the urban core, including tracts like this one.",
  },
  {
    year: 2004, label: "Rainey Rezoned", affects: "citywide",
    blurb: "Rainey Street was rezoned into the Central Business District, converting a working-class Mexican American bungalow neighborhood into a bar-and-tower district within a decade.",
    callout: "Rainey Street's 2004 rezoning showed how fast a legacy neighborhood can turn over under CBD zoning.",
  },
  {
    year: 2010, label: "Oracle", affects: "citywide",
    blurb: "Oracle expanded its Austin footprint at the start of a decade of tech-driven growth, later moving its headquarters to its riverside campus. High-salary hiring added demand to a housing market already under pressure.",
    callout: "The 2010s tech hiring wave begins — housing demand accelerates citywide.",
  },
  {
    year: 2012, label: "Apple Ch.380", affects: "citywide",
    blurb: "City and county incentive agreements (Chapter 380/381) backed Apple's Americas Operations Center in North Austin, tying tax rebates to thousands of new jobs.",
    callout: "Apple's incentive deal (2012) anchors the northern tech corridor's job growth.",
  },
  {
    year: 2016, label: "Apple Campus", affects: "citywide",
    blurb: "Apple opened its Americas Operations Center in North Austin, one of the company's largest hubs outside Cupertino, cementing the northern tech corridor.",
    callout: "Apple's North Austin campus opens — the metro's job engine keeps pulling in high earners.",
  },
  {
    year: 2018, label: "CodeNEXT Scrapped", affects: "citywide",
    blurb: "After six years and three drafts, the CodeNEXT land-development-code rewrite was scrapped amid fights over density in single-family neighborhoods, freezing the zoning status quo for another half-decade.",
    callout: "CodeNEXT dies (2018) — zoning stays frozen while prices keep moving.",
  },
  {
    year: 2020, label: "Project Connect", affects: "citywide",
    blurb: "Voters approved Project Connect, a multi-billion-dollar transit expansion, alongside $300M in anti-displacement funds — an explicit acknowledgment that new rail raises nearby land values.",
    callout: "Project Connect passes (2020) with $300M in anti-displacement funds for corridors like this.",
  },
  {
    year: 2023, label: "HOME Phase 1", affects: "citywide",
    blurb: "The HOME ordinance allowed up to three units on single-family lots — Austin's largest zoning liberalization in decades. Phase 2 (2024) cut minimum lot sizes.",
    callout: "HOME Phase 1 (2023) legalizes three units per single-family lot citywide.",
  },
  {
    year: 2024, label: "Agent of Change", affects: "citywide",
    blurb: "The “Agent of Change” principle put sound-mitigation responsibility on new residential development built near existing music venues, a protection venues had sought for years.",
    callout: "Agent of Change (2024) shifts sound-mitigation costs onto new development near venues.",
  },
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
