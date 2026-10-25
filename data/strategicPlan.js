// ── Preservation Austin 2026–2029 Strategic Plan ──
// Transcribed from "Preservation Austin - PoP - 2026-29.pdf" (Strategic
// Plan on a Page). Content is PA's; `toolSupport` notes are ours — they
// state how this tool helps produce each objective's measures.

export const PLAN_YEARS = "2026 – 2029";

export const MISSION =
  "We empower Austinites to shape a more inclusive, resilient, and meaningful community culture through preservation.";

export const VISION =
  "A future where historic places play a meaningful role in everyone's life, inspiring all Austinites to become advocates for preservation.";

export const PILLARS = [
  {
    title: "Be a Household Name",
    text: "Grow PA's reach and reputation so that when Austinites think about protecting their city's character, they think of us first.",
  },
  {
    title: "Mission Momentum",
    text: "Hold every program, event, and touchpoint to a high standard of value and impact.",
  },
  {
    title: "Sustain What We've Built",
    text: "Make the gains of the last few years endure through stable funding, a strong team, and a well-kept McFarland-McBee House.",
  },
  {
    title: "Embed Equity Everywhere",
    text: "Make equity the source of our strength. It shapes who we serve, how we lead, how we work, and elevates the story we help tell.",
  },
];

export const OBJECTIVES = [
  {
    title: "Open the Door to Participation",
    text: "Create easy, visible ways for any Austinites to take part.",
    measures: [
      "Number of entry-point activities",
      "First-time participants",
      "Reach across all parts of the city",
    ],
    toolSupport:
      "The Outreach planner is the inventory of entry-point activities; the Coverage view tracks reach by council district, and outcome capture on tabled events counts participants.",
    dviWeights: {
      sub: "Demographic 45 · Market 25 · Socio 30",
      fields: "Renter share ↑ 45 within Demographic (rent burden 35, foreign-born 20)",
      rules: "Gate ON · data-desert boost ON",
      rationale:
        "Participation is about reachable people, not hot real estate: renters are the most displaceable and the least reached by homeowner-oriented channels — exactly the first-time-participant pool. A tract doesn't need a hot market for its residents to deserve an entry point.",
    },
  },
  {
    title: "Grow Advocacy on Every Front",
    text: "Turn awareness into action across community, political, and business arenas, wherever preservation decisions get made.",
    measures: [
      "Advocates activated by arena",
      "Policy and business wins influenced",
      "Members and donors gained",
    ],
    toolSupport:
      "Every opportunity is tagged by arena (community / political / business), so outreach activity can be reported per arena.",
    dviWeights: {
      sub: "Demographic 25 · Market 50 · Socio 25",
      fields: "Appreciation ↑ 60 within Market (rent-to-income 40); eviction ↑ 40 within Socio",
      rules: "Gate ON · data-desert boost OFF",
      rationale:
        "Advocacy follows decision points, and market pressure creates them: appreciation tracks the speculation, teardowns, and rezoning cases that reach the Historic Landmark and Planning Commissions; eviction spikes mark where tenant-protection advocacy is timely. Boost off to keep the market signal raw.",
    },
  },
  {
    title: "Hold Ourselves to a Clear Equity Standard",
    text: "Define what equity means for PA and commit to it with real rigor in how we operate.",
    measures: [
      "Written standard adopted",
      "Commitments tracked and reported on each year",
    ],
    toolSupport:
      "The displacement map plus PA's activity data form the measurement instrument for the annual equity report (Equity Audit overlay planned once PA datasets are shared).",
    dviWeights: {
      sub: "Demographic 40 · Market 20 · Socio 40",
      fields: "Eviction ↑ 50 within Socio (poverty 30, unemployment 20); rent burden 45 + foreign-born 30 within Demographic",
      rules: "Gate ON · data-desert boost ON (essential)",
      rationale:
        "An equity lens weights measured harm, not market excitement: eviction filings are the one field that records displacement happening rather than conditions for it, and foreign-born communities are systematically undercounted. The data-desert boost exists for exactly this objective — equity blind spots live where the data is thinnest.",
    },
  },
  {
    title: "Preserve the Whole Story of Austin",
    text: "Draw on diverse voices to protect the places and histories that have been overlooked, so PA becomes the organization that tells Austin's complete story.",
    measures: [
      "Underrepresented sites and histories preserved",
      "Community partners co-leading projects",
      "Diverse representation in decision-making roles in and outside of PA",
    ],
    toolSupport:
      "Opportunity audience tags identify heritage communities, so outreach can be checked against the whole story — not just the familiar places.",
    dviWeights: {
      sub: "Demographic 45 · Market 30 · Socio 25",
      fields: "Foreign-born ↑ 50 within Demographic (rent burden 25, renter share 25); appreciation ↑ 60 within Market",
      rules: "Gate ON · data-desert boost ON",
      rationale:
        "Foreign-born % is the DVI's only direct cultural-community field (Black and Hispanic share lives in the Triage lenses, not the DVI), so it carries the whole-story signal. Appreciation leads Market because teardown economics physically erase the buildings the stories live in.",
    },
  },
  {
    title: "Tell a Clear, Consistent Story",
    text: "Reach more Austinites with one strategic narrative about why preservation matters and why PA matters.",
    measures: [
      "Membership growth",
      "Follower count",
      "Rate at which followers convert to members",
      "Mission awareness",
    ],
    toolSupport:
      "Each region's cultural anchors, closures, and history supply locally specific talking points for tabling (neighborhood story cards planned).",
    dviWeights: {
      sub: "Default (Demographic 35 · Market 35 · Socio 30)",
      fields: "No field changes",
      rules: "Gate ON · data-desert boost ON",
      rationale:
        "A consistent public narrative needs a consistent methodology — tell the story with the published default weights so the numbers PA cites never shift between tellings.",
    },
  },
  {
    title: "Build Pipeline of Future Preservationists",
    text: "Open preservation to young people from every part of Austin, building a generation of members, advocates and leaders as diverse as the city itself.",
    measures: [
      "Young people engaged",
      "Participant diversity",
      "Lasting relationships that move into deeper roles over time",
    ],
    toolSupport:
      "School, university, and youth-audience events are searchable in the planner; pipeline stages record relationships as they deepen.",
    dviWeights: {
      sub: "Demographic 40 · Market 30 · Socio 30",
      fields: "Renter share ↑ 50 within Demographic (rent burden 30, foreign-born 20); rent-to-income ↑ 60 within Market",
      rules: "Gate ON · data-desert boost ON",
      rationale:
        "The DVI has no age field, so renter share is the proxy — young Austinites rent. Rent-to-income leads Market because affordability stress is the lived experience that makes preservation's anti-displacement case land with younger audiences.",
    },
  },
  {
    title: "Financial Resilience",
    text: "Grow and diversify annual revenue streams so we never depend on any single source.",
    measures: [
      "Months of operating reserve",
      "Number of income streams",
      "House upkeep fully funded each year",
    ],
    toolSupport: null,
  },
  {
    title: "Operational Excellence",
    text: "Set the bar for how a preservation organization should run. Stay efficient, stay curious, and keep raising our own standard.",
    measures: [
      "Cost-to-output ratio",
      "Number of new approaches adopted",
      "Year-over-year growth in capacity and reach",
    ],
    toolSupport:
      "A data-driven outreach workflow — deadlines, pipeline, exports — is itself one of the new approaches this measure counts.",
  },
];

export const VALUES = [
  {
    title: "Accountable",
    text: "We do what is right, not what makes us right. We keep the best interests of those we serve top of mind, and we measure our impact against the highest standards of integrity, equity, and fiscal responsibility.",
  },
  {
    title: "Inclusive",
    text: "We build a culture that encourages, supports, and celebrates the diverse voices of our organization and our city. Diversity and inclusion fuel our creativity, break down barriers, and bring us closer to the people we serve.",
  },
  {
    title: "Locally Focused",
    text: "We have Austin's best interest at heart every day. Preserving Austin's individuality lets our citizens thrive, invites visitors to connect, and makes our city a model of preservation in action.",
  },
  {
    title: "Collaborating Enthusiastically",
    text: "We do our best work when we come together to solve the toughest challenges facing our city. We value those who speak thoughtfully, respect diversity of opinion, and listen carefully with an open mind.",
  },
  {
    title: "Taking the Long View",
    text: "We leverage our resources for the greatest possible impact and hold ourselves accountable to future generations, saving places that matter, that stand the test of time, and that honor a holistic view of Austin's heritage.",
  },
  {
    title: "Thinking Big",
    text: "We never settle. We have the courage and curiosity to challenge the status quo and find new ways for preservation to make a positive difference in our community.",
  },
];
