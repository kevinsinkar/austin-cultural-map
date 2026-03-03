# Austin's Shifting Ground — Cultural Research Review

**Reviewer perspective:** Austin cultural researcher, minority and displaced communities
**Purpose:** Improve the app as a grant-allocation decision tool for Preservation Austin

---

## What This App Does Well

**The DVI concept is the right instinct.** A composite displacement index that synthesizes multiple signals — population change, home values, educational attainment shift, homeownership decline — gives Preservation Austin a single number to rank urgency. Most displacement tools either drown the user in raw census tables or offer nothing but anecdotes. This sits in the right middle ground.

**The "What We Lost" tab is emotionally and analytically powerful.** Showing closed legacy businesses alongside operating ones, with cause-of-closure and replacement data, directly answers the question Preservation Austin needs: "what cultural anchors have already fallen, and which are next?" The pressure-dot indicators on surviving businesses are a smart visual shorthand for triage.

**The tipping point narratives are strong.** Identifying the specific decade and catalyst event for each neighborhood (Smart Growth bonds, I-35 reconstruction, Chapter 380 deals) connects abstract demographic curves to policy decisions. This is exactly the framing that makes data actionable for an advocacy organization — it names the mechanism, not just the outcome.

**Policy context in the About modal is excellent.** The 1928 Master Plan, I-35 as "concrete color line," Smart Growth as inadvertent eco-gentrification, HOME Initiative, Agent of Change principle — this gives the tool historical grounding that most data dashboards completely lack. It signals to the user that displacement is engineered, not accidental.

**The timeline view's cultural stratification is a standout feature.** Color-coding business lifespans by cultural affiliation (African American, Mexican American/Latino, LGBTQ+, Immigrant Community, Country/Americana) makes visible which specific cultural ecosystems are collapsing. A grant allocator can see at a glance that East Austin lost a cluster of African American businesses in the same five-year window.

**Transparency about data quality is honest and appropriate.** The confidence tiers (high/medium), the ACS estimation note, and the pre-2010 boundary caveat all build trust. The closing line — "imperfect data, honestly presented, is more valuable than no data at all" — is the right tone for community-facing work.

---

## What Needs More Attention

### 1. The Data Schema Is Dangerously Inconsistent

This is the most urgent technical issue. The audited JSON files contain dozens of field-name variants for the same concept:

- **Hispanic population:** `pct_hispanic`, `hispanic_pct`, `hispanic_percent`, `hispanic_percentage`, `race_hispanic_pct`, `race_hispanic_percentage`, `ethnicity_hispanic_pct`, `ethnicity_hispanic_percent`, `population_hispanic_pct`, `population_hispanic_percent`, `hispanic_latino_pct`
- **Home values:** `median_home_value`, `median_home_price`, `home_value_median`, `median_home_value_usd`
- **Owner-occupied:** `pct_owner_occupied`, `owner_occupied_pct`, `owner_occupied_percent`, `owner_occupied_rate`, `owner_occupied_rate_pct`, `owner_occupied_units_pct`, `percent_owner_occupied`, `homeownership_rate`, `homeownership_rate_pct`, `homeownership_rate_percent`

This suggests different extraction passes (likely AI-generated) produced inconsistent schemas across regions and years. The app components reference specific canonical field names (`median_home_value`, `median_rent_monthly`, `poverty_rate`, `median_household_income`), which means any region whose data landed under a variant field name will silently show "N/A" or zero. **You may be underreporting displacement in neighborhoods where the data exists but is stored under the wrong key.** This needs a normalization pass before any grant decisions are made from it.

### 2. The "15 Neighborhoods" Claim Doesn't Match the Data

The About modal says the tool covers "15 Austin neighborhoods," but the demographics JSON contains 244+ distinct region names, many at tract level (e.g., "Montopolis (Tract 22.16)", "Circle C Ranch (Tract 312.0)"). The app's map likely aggregates these into 15 macro-regions, but the mismatch is confusing and could undermine credibility with stakeholders who explore the raw data. Either update the About text to explain the aggregation, or document the tract-to-region mapping explicitly.

### 3. The Comparison View Narrows the Demographic Lens

The ComparisonView only charts Black and Hispanic population shares. This makes sense given Austin's primary displacement story, but it invisibilizes:

- **Asian communities** — the Vietnamese corridor along North Lamar, the Korean and Chinese businesses near Chinatown Center, and the growing South/Southeast Asian populations in the Rundberg area are all under displacement pressure.
- **Indigenous peoples** — Austin sits on Tonkawa, Lipan Apache, and Comanche land. There's no Indigenous presence in any of the data or narrative, which is a significant omission for a cultural preservation tool.

At minimum, the comparison view should offer an "All groups" toggle. Ideally, the narrative framework would acknowledge Indigenous displacement as the foundational layer.

### 4. Rent Burden Data Is Collected but Underused

The demographics data includes `rent_burden_pct` and the socioeconomic data has related fields, but the RegionDetailPanel only shows four metric cards: Median Home Value, Median Rent, Median Household Income, and Poverty Rate. Rent burden is arguably the single best leading indicator of imminent displacement — households paying 30%+ of income on housing are one rent increase away from leaving. This metric should be prominent, not buried in the JSON.

### 5. The DVI Formula Needs Transparency for Grant Decisions

If Preservation Austin is using DVI scores to allocate real grant dollars, the formula's weights need to be visible and debatable. The About modal describes DVI's four components (population change, home value appreciation, educational attainment shift, homeownership decline) but doesn't disclose how they're weighted. A neighborhood that lost 40% of its Black population but saw modest home price increases would score differently depending on whether demographic change or property values are weighted more heavily. Grant committees need to understand and potentially adjust these weights.

### 6. The Narrative Generation Is Thin in Places

The ComparisonView generates auto-narratives that are purely mathematical: "Region X experienced significantly more displacement pressure (DVI 62 vs 31)." For a tool meant to guide cultural preservation, the narrative should connect to what was lost — was it a music scene, a food corridor, a church network, a language community? The data supports this (you have cultural affiliation on businesses), but the comparison narrative doesn't use it.

---

## What's Missing

### Critical for Grant Decision-Making

**A prioritization or triage view.** The app lets you explore individual neighborhoods and compare pairs, but Preservation Austin needs to answer: "Given limited grant dollars, which 3-5 neighborhoods should we focus on this year?" This requires a ranked view that combines DVI score, number of surviving cultural anchors, and some measure of intervention feasibility (e.g., are there businesses that could be saved with a $50K-$200K grant, or has the neighborhood already fully transformed?). Think of it as a "still saveable vs. already gone" matrix.

**"Cultural anchor density" as a metric.** DVI measures the velocity of change, but not the remaining cultural inventory. A neighborhood with a DVI of 60 but 12 surviving legacy businesses is a different grant case than one with a DVI of 60 and only 2 left. The ratio of surviving-to-lost businesses per region should be calculated and displayed.

**Receiving community tracking.** The Dove Springs callout ("changes reflect inflow of displaced families, not gentrification") is the only acknowledgment that displaced people go somewhere. A tool for Preservation Austin should systematically track where communities relocated to — not to pathologize receiving communities, but to understand whether cultural institutions followed the population or dissolved. This is essential for deciding whether to invest in origin neighborhoods (preserving what remains) or destination neighborhoods (supporting reconstitution).

**Institutional and social anchors beyond businesses.** The legacy business inventory is excellent, but cultural ecosystems include churches, mosques, community centers, mutual aid organizations, barber shops that function as social hubs, weekend flea markets, and informal gathering spaces. Many of these aren't "businesses" in the commercial sense but are the connective tissue of community. If Preservation Austin's grants can support non-commercial cultural anchors, the app should track them.

### Important for Credibility and Completeness

**Language and linguistic displacement data.** The percentage of Spanish-speaking households, Vietnamese-speaking households, or bilingual signage density would powerfully illustrate cultural erasure in ways that racial demographic percentages alone cannot. ACS publishes language-spoken-at-home data at the tract level.

**Zoning and permitting pipeline data.** Current DVI shows what has already happened. For grant decisions, Preservation Austin also needs a forward-looking signal: which neighborhoods have large-scale development permits pending? Which have been recently upzoned? The "Dev. Pressure" toggle on the map gestures at this, but it's not integrated into the detail panel or DVI score.

**Inflation-adjusted time series.** The ComparisonView labels income as "Adj. 2023$" which is correct, but the RegionDetailPanel's Median Home Value and Median Rent cards don't indicate whether values are nominal or adjusted. If nominal, the change-over-time arrows are misleading — a 50% increase in home value over 20 years could be below inflation.

**Community voice or qualitative data layer.** Numbers tell you what happened; stories tell you what it meant. Even a curated set of 2-3 oral history excerpts per high-DVI neighborhood — linked from the detail panel — would transform this from a data dashboard into a persuasion tool. Preservation Austin is trying to move hearts as well as budgets.

**An explicit "How to Use This for Grants" guide.** The app assumes the user understands how to translate DVI scores and business inventories into funding decisions. A short methodology section that says something like "We recommend prioritizing neighborhoods where DVI is 35-55 (active displacement) AND at least 3 cultural anchors remain operating under high pressure" would dramatically increase the tool's utility.

---

## Summary Recommendations — Ranked by Impact

| Priority | Action | Why |
|----------|--------|-----|
| **1** | Normalize field names across all JSON files | Without this, data is silently missing for some regions |
| **2** | Add a prioritization/triage view for grant allocation | This is the stated end goal of the tool |
| **3** | Surface rent burden as a first-class metric | Best leading indicator of imminent displacement |
| **4** | Calculate and display cultural anchor density | Directly answers "is it too late?" per neighborhood |
| **5** | Make DVI formula weights transparent and configurable | Grant committees must understand and trust the scoring |
| **6** | Expand demographic lens to include Asian and Indigenous communities | Current framing invisibilizes real displacement |
| **7** | Add receiving community tracking | Completes the displacement story |
| **8** | Include non-commercial cultural anchors | Churches, community orgs, and informal spaces matter |
| **9** | Integrate forward-looking signals (permits, zoning) | Shifts tool from retrospective to predictive |
| **10** | Add qualitative/oral history layer | Makes the data persuasive, not just informative |

---

*This review is based on analysis of the uploaded component source code (MapView, RegionDetailPanel, ComparisonView, TimelineView, Header, AboutModal, AgendaModal, ChartTooltip, ErrorBoundary) and the three audited data files (demographics, property, socioeconomic). It does not reflect a review of the live running application, GeoJSON boundary definitions, the DVI calculation utilities, or the business inventory source data.*
