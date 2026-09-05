/**
 * legislation.js
 * ──────────────
 * Texas Legislature bills (2000–2025) that materially affected the cost of
 * living in Austin — property taxes, rent, housing supply, preemption of
 * local affordability tools, and displacement pressure.
 *
 * Each entry:
 *   bill          "SB 2" / "HB 3" (bill number as passed)
 *   session       legislature + calendar year, e.g. "86th (2019)"
 *   year          effective year (integer; used for timeline position)
 *   title         short common name
 *   category      property-tax | preemption | housing-supply | annexation |
 *                 homelessness | tenant | utilities
 *   direction     raises-costs | lowers-costs | mixed  (Austin-specific
 *                 assessment per published analysis)
 *   summary       what the bill did
 *   austin_impact the Austin-specific cost-of-living mechanism
 *   source        best citation URL
 *
 * Populated from verified web research (Texas Legislature Online, Texas
 * Tribune, Every Texan, Texas Housers, Austin Monitor). See
 * DATA_METHODOLOGY.md for sourcing notes.
 */

export const TX_LEGISLATION = [
  {
    bill: "HB 1", session: "79th, 3rd Called (2006)", year: 2006,
    title: "School property tax compression / margins tax swap",
    category: "property-tax", direction: "mixed",
    summary: "Compressed school district M&O tax rates by one-third (from $1.50 toward $1.00 per $100), replacing local property tax revenue with a reformed franchise ('margins') tax and higher cigarette tax.",
    austin_impact: "Cut AISD tax rates, but the margins tax fell roughly $5 billion short of covering compression, contributing to the 2011 school funding cuts; Every Texan and Moak Casey document the structural shortfall that kept pressure on local rates.",
    source: "https://www.moakcasey.com/guide-to-texas-school-finance/tax-rate-compression/",
  },
  {
    bill: "SB 1", session: "84th (2015)", year: 2015,
    title: "Homestead exemption increase to $25,000 (Prop 1)",
    category: "property-tax", direction: "lowers-costs",
    summary: "Raised the school-district homestead exemption from $15,000 to $25,000, ratified by voters as Proposition 1 in November 2015.",
    austin_impact: "Modest direct school-tax savings for Austin homeowners; renters (roughly half of Austin households) received no relief, a gap noted by Every Texan in its property tax analyses.",
    source: "https://ballotpedia.org/Texas_Proposition_4,_Property_Tax_Changes_and_State_Education_Funding_Amendment_(2023)",
  },
  {
    bill: "SB 267", session: "84th (2015)", year: 2015,
    title: "Source-of-income ordinance preemption",
    category: "preemption", direction: "raises-costs",
    summary: "Barred cities and counties from adopting ordinances prohibiting landlord discrimination based on federal housing assistance (Section 8 vouchers). Filed in direct response to Austin's December 2014 source-of-income ordinance.",
    austin_impact: "Nullified Austin's voucher anti-discrimination ordinance, letting landlords refuse vouchers and concentrating voucher holders in lower-opportunity areas; Texas Housers and NLIHC identify it as a driver of displacement pressure in gentrifying Austin neighborhoods.",
    source: "https://texashousers.org/2015/06/22/anti-source-of-income-protection-legislation-signed-into-law/",
  },
  {
    bill: "HB 1449", session: "85th (2017)", year: 2017,
    title: "Linkage fee ban",
    category: "preemption", direction: "raises-costs",
    summary: "Banned cities from charging fees on new construction to offset the cost or rent of residential housing (linkage fees), while preserving voluntary density-bonus programs.",
    austin_impact: "Killed a tool Austin was actively studying — a city analysis found a $2/sq ft fee would have raised $500M+ for affordable housing over a decade; Texas Housers and UT's Uprooted report list it among displacement-mitigation tools taken off the table.",
    source: "https://texashousers.org/2017/05/24/state-bans-another-local-affordable-housing-tool-with-anti-linkage-fees-legislation/",
  },
  {
    bill: "SB 6", session: "85th, 1st Called (2017)", year: 2017,
    title: "Annexation election requirement (large counties)",
    category: "annexation", direction: "mixed",
    summary: "Ended unilateral annexation for cities in counties over 500,000 population, requiring an election or petition of affected residents.",
    austin_impact: "Effectively froze Austin's ability to grow its tax base through annexation; Austin officials testified the loss of this tool shifts the cost of regional growth onto existing city taxpayers, while suburban residents avoid city taxes.",
    source: "https://www.texastribune.org/2017/08/11/house-annexation-reform/",
  },
  {
    bill: "SB 2", session: "86th (2019)", year: 2020,
    title: "Property Tax Reform and Transparency Act",
    category: "property-tax", direction: "mixed",
    summary: "Lowered the voter-approval (rollback) rate for cities and counties from 8% to 3.5% annual revenue growth on existing property, requiring an automatic election to exceed it.",
    austin_impact: "Slowed growth of Austin and Travis County tax bills, but constrained city revenue enough that Austin sought voter-approved rate increases (2020 Project Connect, 2025 Prop Q) — making Austin the major Texas city most reliant on tax-rate elections since the cap.",
    source: "https://ttara.org/austin-property-tax-math-school-tax-rates-down-everybody-else-going-up/",
  },
  {
    bill: "HB 3", session: "86th (2019)", year: 2019,
    title: "School finance reform and tax compression",
    category: "property-tax", direction: "lowers-costs",
    summary: "$11.6B school finance law that compressed school M&O rates by 7 cents in 2019-20 and created ongoing compression whenever statewide property value growth exceeds 2.5%.",
    austin_impact: "AISD tax rates fell substantially and recapture payments were reduced; TTARA's Austin analysis credits HB 3 as the main force pulling school tax rates down while other local rates rose.",
    source: "https://tea.texas.gov/about-tea/government-relations-and-legal/government-relations/house-bill-3-86r",
  },
  {
    bill: "HB 347", session: "86th (2019)", year: 2019,
    title: "End of unilateral annexation statewide",
    category: "annexation", direction: "mixed",
    summary: "Extended SB 6's consent-annexation requirement to all 254 counties, permanently ending forced annexation by any Texas city.",
    austin_impact: "Locked in the freeze on Austin's territorial and tax-base growth; TML's analysis notes cities lose the ability to capture the suburban growth their infrastructure supports, concentrating tax burden on in-city property owners.",
    source: "https://www.tml.org/DocumentCenter/View/1233/Annexation-Paper-TML-July-2019PDF",
  },
  {
    bill: "HB 2439", session: "86th (2019)", year: 2019,
    title: "Building materials preemption",
    category: "preemption", direction: "mixed",
    summary: "Voided city rules restricting any building product or material approved by national model codes within the last three code cycles.",
    austin_impact: "Builders argued it lowers construction costs by allowing cheaper code-approved materials; Austin lost the ability to enforce stricter local material and design standards, with cost savings to buyers debated rather than documented.",
    source: "https://www.tml.org/DocumentCenter/View/1254/HB-2439-QA",
  },
  {
    bill: "HB 3167", session: "86th (2019)", year: 2019,
    title: "30-day plat approval shot clock",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Required cities and counties to approve, conditionally approve, or disapprove (with written reasons) subdivision plats within 30 days, with automatic approval if the deadline is missed.",
    austin_impact: "Forced Austin, whose subdivision reviews routinely ran far longer, to overhaul its process; the Austin Monitor reported it 'reset development review time,' reducing carrying costs that get passed into home prices.",
    source: "https://austinmonitor.com/stories/2019/06/shot-clock-bill-resets-development-review-time/",
  },
  {
    bill: "HB 1925", session: "87th (2021)", year: 2021,
    title: "Statewide public camping ban",
    category: "homelessness", direction: "raises-costs",
    summary: "Made camping in unauthorized public places a Class C misdemeanor with fines up to $500 statewide, and penalized cities that fail to enforce it.",
    austin_impact: "Passed largely in response to Austin's 2019 repeal of its camping ban, it locked in criminalization after Austin's Prop B; homeless service providers argue fines and criminal records add barriers to housing, intensifying displacement pressure on Austin's unhoused population.",
    source: "https://www.texastribune.org/2021/05/28/camping-ban-bill-approved",
  },
  {
    bill: "HB 4492", session: "87th (2021)", year: 2021,
    title: "ERCOT Winter Storm Uri debt securitization",
    category: "utilities", direction: "raises-costs",
    summary: "Authorized securitization of roughly $2.9B in ERCOT market shortfalls from Winter Storm Uri, repaid through charges spread across electric customers for up to 30 years.",
    austin_impact: "Uri-related securitization charges flow through ERCOT wholesale costs paid by Austin Energy and other load-serving entities, adding a decades-long line item to Austin electric bills on top of Austin Energy's own storm-cost recovery.",
    source: "https://comptroller.texas.gov/economy/fiscal-notes/archive/2021/oct/winter-storm-reform.php",
  },
  {
    bill: "HB 1520", session: "87th (2021)", year: 2021,
    title: "Gas utility Uri cost securitization",
    category: "utilities", direction: "raises-costs",
    summary: "Let regulated natural gas utilities securitize extraordinary gas costs from Winter Storm Uri via Railroad Commission-approved customer surcharges repaid over decades.",
    austin_impact: "Texas Gas Service customers in Austin pay a monthly Uri securitization surcharge for roughly 30 years to retire the storm-cost bonds, a direct and long-lived increase in Austin utility bills.",
    source: "https://www.rrc.texas.gov/news/02822-securitization-financing-order/",
  },
  {
    bill: "SB 1", session: "87th, 3rd Called (2021)", year: 2022,
    title: "Homestead exemption increase to $40,000 (Prop 2)",
    category: "property-tax", direction: "lowers-costs",
    summary: "Raised the school-district homestead exemption from $25,000 to $40,000, ratified by voters as Proposition 2 in May 2022.",
    austin_impact: "Saved Austin homeowners roughly $175/year on school taxes at the time; relief again bypassed Austin's renter majority, as Every Texan noted in its critiques of exemption-only relief.",
    source: "https://ballotpedia.org/Texas_Proposition_4,_Property_Tax_Changes_and_State_Education_Funding_Amendment_(2023)",
  },
  {
    bill: "HB 14", session: "88th (2023)", year: 2023,
    title: "Third-party permit review",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Allowed developers to hire qualified third-party reviewers and inspectors, whose approvals bind the city, when a local government misses statutory review deadlines by 15+ days.",
    austin_impact: "Aimed squarely at slow-permitting cities — Austin's multi-month residential permit backlogs were a poster child in legislative debate; faster review reduces carrying costs embedded in Austin home prices.",
    source: "https://natlawreview.com/article/2023-texas-legislative-update-issues-affecting-real-estate-entitlement-and",
  },
  {
    bill: "HB 1058", session: "88th (2023)", year: 2024,
    title: "State low-income housing tax credit",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Created a $25M/year state LIHTC (franchise and insurance premium tax credits) to supplement federal 4% and 9% credits for affordable housing developments, starting January 1, 2024.",
    austin_impact: "Adds a state subsidy layer that improves the feasibility of income-restricted developments in high-cost Austin, where federal credits alone often cannot close gaps.",
    source: "https://frostbrowntodd.com/texas-implements-a-state-low-income-housing-tax-credit/",
  },
  {
    bill: "HB 2127", session: "88th (2023)", year: 2023,
    title: "Texas Regulatory Consistency Act ('Death Star' preemption)",
    category: "preemption", direction: "raises-costs",
    summary: "Broadly preempted local regulation in fields occupied by nine state codes, including provisions blocking cities from regulating or delaying evictions. Struck down by a Travis County district court in 2023, but that ruling was vacated on appeal in July 2025 — the law is currently in effect.",
    austin_impact: "Voided Austin's tenant protections, including its 2023 ordinance giving renters a grace period to cure missed rent before eviction; Texas Housers warned it wipes out local eviction protections amid record filings, increasing displacement risk for Austin renters.",
    source: "https://www.tpr.org/government-politics/2025-07-19/appeals-court-upholds-texas-death-star-law-limiting-cities-enforcement-of-local-ordinances",
  },
  {
    bill: "SB 2038", session: "88th (2023)", year: 2023,
    title: "ETJ release by petition",
    category: "annexation", direction: "mixed",
    summary: "Gave landowners and residents the right to unilaterally exit a city's extraterritorial jurisdiction by petition or election, with no city discretion to refuse.",
    austin_impact: "Hundreds of Austin ETJ release petitions followed (300+ by March 2024), letting development escape Austin's environmental and subdivision rules — potentially cheaper building, but eroding Austin's future annexation tax base.",
    source: "https://communityimpact.com/austin/south-central-austin/government/2024/03/28/property-owners-flee-austin-regulations-under-senate-bill-2038/",
  },
  {
    bill: "SB 2", session: "88th, 2nd Called (2023)", year: 2023,
    title: "$100,000 homestead exemption and tax compression (Prop 4)",
    category: "property-tax", direction: "lowers-costs",
    summary: "Part of an $18B package: raised the school homestead exemption from $40,000 to $100,000, added further rate compression, and imposed a temporary 20% appraisal circuit breaker on non-homestead property under $5M; ratified as Proposition 4 (83% yes) in November 2023.",
    austin_impact: "The largest single cut to Austin homeowners' school tax bills in the study period (Comptroller estimated ~$1,300/year savings for a typical homeowner); Every Texan's analysis notes renters — a majority of Austin households — again received no direct relief.",
    source: "https://comptroller.texas.gov/economy/fiscal-notes/archive/2023/dec/proptax.php",
  },
  {
    bill: "SB 4", session: "89th (2025)", year: 2025,
    title: "$140,000 homestead exemption (Prop 13)",
    category: "property-tax", direction: "lowers-costs",
    summary: "Raised the school homestead exemption from $100,000 to $140,000 ($200,000 for seniors with companion SB 23), ratified by voters as Proposition 13 in November 2025, retroactive to tax year 2025.",
    austin_impact: "Further cuts AISD taxes for Austin homeowners (roughly $500/year additional savings statewide average); continues the shift of school funding from local property tax to state revenue, with relief again limited to owner-occupants.",
    source: "https://ballotpedia.org/Texas_Proposition_13,_Increase_Homestead_Property_Tax_Exemption_Amendment_(2025)",
  },
  {
    bill: "SB 15", session: "89th (2025)", year: 2025,
    title: "Small-lot homes in new subdivisions",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Barred large cities from requiring lots larger than 3,000 sq ft (or related bulk standards) in new greenfield subdivisions of five acres or more.",
    austin_impact: "Applies to Austin and complements the city's own HOME lot-size reforms; Pew and Mercatus assess smaller minimum lots as one of the strongest levers for cheaper starter homes on Austin's fringe.",
    source: "https://www.pew.org/en/about/news-room/press-releases-and-statements/2025/06/23/pew-applauds-texas-lawmakers-for-passage-of-much-needed-housing-legislation",
  },
  {
    bill: "SB 840", session: "89th (2025)", year: 2025,
    title: "Residential and mixed-use by right in commercial zones",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Required large cities to allow multifamily and mixed-use development by right on land zoned for office, retail, and commercial uses, with caps on parking, density, and height requirements cities may impose.",
    austin_impact: "Opens Austin's commercial corridors to apartments without rezoning cases or valid-petition fights; the Texas Tribune and development analysts project it unlocks substantial multifamily capacity along Austin's major corridors, easing rent pressure.",
    source: "https://www.texastribune.org/2025/05/20/texas-legislature-housing-mixed-use-office/",
  },
  {
    bill: "SB 2477", session: "89th (2025)", year: 2025,
    title: "Office-to-residential conversions",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Required cities to allow conversion of existing office buildings to residential use by right, limiting fees, parking mandates, and discretionary review for qualifying conversions.",
    austin_impact: "Targets the elevated post-pandemic office vacancy in big Texas metros — downtown Austin's vacancy makes it a prime candidate for conversions adding central housing supply.",
    source: "https://www.foley.com/p/102ltvo/client-briefing-texas-senate-bill-840-and-texas-senate-bill-2477-89th-legislatu/",
  },
  {
    bill: "HB 24", session: "89th (2025)", year: 2025,
    title: "Valid petition (zoning protest) reform",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Overhauled the 'valid petition' process by which nearby owners could force a supermajority council vote on rezonings, raising the petition threshold and removing the supermajority requirement for protests against added residential density.",
    austin_impact: "Directly responsive to Austin's experience — valid petitions helped derail CodeNEXT and delayed the HOME amendments; Mercatus notes it removes a veto that let a few neighbors block Austin density increases that would expand supply.",
    source: "https://www.mercatus.org/research/policy-briefs/framing-futures-pro-housing-legislation-goes-vertical-2025",
  },
  {
    bill: "SB 2835", session: "89th (2025)", year: 2025,
    title: "Single-stair apartment buildings",
    category: "housing-supply", direction: "lowers-costs",
    summary: "Authorized cities to permit single-staircase apartment buildings up to six stories (max four units per floor) meeting 14 safety conditions including sprinklers. Permissive — cities must opt in.",
    austin_impact: "Sponsored by Austin Rep. James Talarico; single-stair design cuts per-unit construction costs and makes small infill lots buildable, but the Austin impact depends on the city adopting the framework.",
    source: "https://nextcity.org/urbanist-news/the-weekly-wrap-texas-goes-big-on-single-staircase-reform",
  },
  {
    bill: "SB 38", session: "89th (2025)", year: 2026,
    title: "Eviction process acceleration",
    category: "tenant", direction: "raises-costs",
    summary: "Streamlined evictions statewide: summary judgment without trial in undisputed cases, 5-business-day service deadlines, 21-day limits on trials and appeals, and electronic notice delivery; effective January 1, 2026.",
    austin_impact: "Tenant advocates (Texas Housers, BASTA) warn the compressed timeline gives Austin renters — already facing record filings — less time to cure arrears or find housing, increasing eviction-driven displacement and homelessness risk.",
    source: "https://www.fox7austin.com/news/sb-38-how-new-property-rights-law-changes-game-texas-renters",
  },
];

/**
 * Published compilations aggregating this legislative history (cited in
 * DATA_METHODOLOGY.md):
 * - UT Austin "Uprooted" (2018), Part 5: Displacement Mitigation Tools Off
 *   Limits in Texas — sites.utexas.edu/gentrificationproject
 * - Every Texan, "Property Tax Compression" (2023) — everytexan.org
 * - Texas Comptroller, "Property Tax Cuts as Large as Texas" (2023)
 * - Mercatus, "Framing Futures: Pro-Housing Legislation Goes Vertical in
 *   2025" — mercatus.org
 */

export const LEG_DIRECTION_COLORS = {
  "raises-costs": "#dc2626",
  "lowers-costs": "#16a34a",
  "mixed": "#d97706",
};

export const LEG_DIRECTION_LABELS = {
  "raises-costs": "Raises costs",
  "lowers-costs": "Lowers costs",
  "mixed": "Mixed",
};

export const LEG_CATEGORY_LABELS = {
  "property-tax": "Property Tax",
  "preemption": "Local Preemption",
  "housing-supply": "Housing Supply",
  "annexation": "Annexation",
  "homelessness": "Homelessness",
  "tenant": "Tenant / Evictions",
  "utilities": "Utilities",
};
