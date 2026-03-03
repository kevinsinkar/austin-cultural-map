# Austin's Shifting Ground — AI Agent Task List

**Purpose:** Actionable tasks an AI coding agent can execute to fix data gaps, add missing features, and improve the app as a grant-allocation tool for Preservation Austin.

**How to use this document:** Tasks are organized into phases. Complete Phase 1 before Phase 2. Within each phase, tasks are numbered by priority. Each task includes acceptance criteria so the agent (or reviewer) knows when it's done.

---

## PRIORITY EXECUTION ORDER (Summary)

```
PHASE 1 — Data Integrity (do first, everything else depends on clean data)
  1.1  Normalize demographic field names
  1.2  Normalize property field names
  1.3  Normalize socioeconomic field names
  1.4  Validate region-to-tract mapping
  1.5  Add missing rent burden to detail panel

PHASE 2 — Core Feature Gaps (highest-impact missing features)
  2.1  Build grant triage / prioritization view
  2.2  Add cultural anchor density metric
  2.3  Expose DVI formula with adjustable weights
  2.4  Expand comparison view demographics to all groups

PHASE 3 — Narrative & Context Enrichment
  3.1  Enrich comparison auto-narratives with cultural data
  3.2  Add inflation-adjustment labels to property cards
  3.3  Add receiving community annotations
  3.4  Add language/linguistic displacement data

PHASE 4 — Forward-Looking & Qualitative Layers
  4.1  Integrate dev pressure into detail panel metrics
  4.2  Add institutional/social anchor data model
  4.3  Add oral history / community voice hooks
  4.4  Create "How to Use This for Grants" guide
```

---

## PHASE 1 — Data Integrity

These tasks fix silent data loss. Nothing else matters if the underlying data is inconsistent.

---

### Task 1.1: Normalize Demographic Field Names

**Problem:** The `audited_demographics.json` file contains 20 variants for Hispanic percentage, 14 for Black percentage, 13 for Asian percentage, 12 for White percentage, 15 for population, 8 for bachelor's degree attainment, and similar duplication across every concept. The app components reference specific canonical names. Records using non-canonical names silently produce N/A values.

**Field variant inventory (from data audit):**

**Hispanic (20 variants → normalize to `pct_hispanic`):**
`pct_hispanic`, `hispanic_pct`, `hispanic_percent`, `hispanic_percentage`, `hispanic_latino_pct`, `ethnicity_hispanic_pct`, `ethnicity_hispanic_percent`, `population_hispanic_pct`, `population_hispanic_percent`, `race_hispanic_pct`, `race_hispanic_percentage`, `percent_hispanic`
*(Also filter out cross-concept fields like `pct_white_non_hispanic` which belong under white)*

**Black (14 variants → normalize to `pct_black_non_hispanic`):**
`pct_black_non_hispanic`, `black_non_hispanic_pct`, `pct_black`, `black_pct`, `black_percent`, `black_percentage`, `african_american_pct`, `pct_african_american`, `percent_african_american`, `percent_black`, `percent_black_non_hispanic`, `ethnicity_black_pct`, `ethnicity_black_percent`, `population_black_pct`, `population_black_percent`, `race_black_pct`, `race_black_percentage`

**White (12 variants → normalize to `pct_white_non_hispanic`):**
`pct_white_non_hispanic`, `white_non_hispanic_pct`, `pct_white`, `white_pct`, `white_percent`, `white_percentage`, `percent_white`, `percent_white_non_hispanic`, `percent_caucasian`, `ethnicity_white_pct`, `ethnicity_white_percent`, `population_white_pct`, `population_white_percent`, `race_white_pct`, `race_white_percentage`

**Asian (13 variants → normalize to `pct_asian`):**
`pct_asian`, `asian_pct`, `asian_percent`, `asian_percentage`, `asian_non_hispanic_pct`, `pct_asian_other`, `asian_other_pct`, `percent_asian`, `percent_asian_non_hispanic`, `ethnicity_asian_pct`, `ethnicity_asian_percent`, `population_asian_pct`, `population_asian_percent`, `race_asian_pct`, `race_asian_percentage`

**Other Race (7 variants → normalize to `pct_other`):**
`pct_other`, `other_pct`, `other_percentage`, `percent_other`, `ethnicity_other_pct`, `race_other_pct`, `race_other_percentage`

**Total Population (15 variants → normalize to `total_population`):**
`total_population`, `population`, `population_total`, `total`, `regional_population`
*(Keep age-specific populations like `under_18_population` and `over_65_population` separate)*

**Bachelor's/Education (8 variants → normalize to `pct_bachelors_degree_or_higher`):**
`pct_bachelors_degree_or_higher`, `bachelors_degree_or_higher_pct`, `pct_bachelors_or_higher`, `percent_bachelor_degree_or_higher`, `percent_bachelors_degree_or_higher`, `percent_with_bachelor_degree_or_higher`, `percent_with_bachelors_degree`, `percent_with_bachelors_degree_or_higher`

**Owner-Occupied (in demographics → normalize to `pct_owner_occupied`):**
`pct_owner_occupied`
*(Only one variant in demographics; more variants exist in property data)*

**Foreign Born (3 variants → normalize to `pct_foreign_born`):**
`pct_foreign_born`, `foreign_born_pct`, `foreign_born_percent`

**Household Size (4+ variants → normalize to `avg_household_size`):**
`avg_household_size`, `average_household_size`, `household_size`, `household_size_avg`

**Agent instructions:**
1. Write a Python normalization script (`scripts/normalize_demographics.py`)
2. For each record, check all variant field names. If the canonical field is missing but a variant exists, copy the variant value to the canonical field name.
3. If multiple variants exist in the same record with different values, log a warning and prefer the canonical name, then the most specific variant (e.g., `pct_black_non_hispanic` over `black_pct`).
4. Ensure all percentage fields use the same scale (0–100 vs 0–1). The app's `ChartTooltip.jsx` multiplies by 100 before displaying (`(p.value * 100).toFixed(1)%`), implying the data should be in 0–1 scale. Verify and normalize.
5. Remove duplicate variant fields after normalization to prevent future confusion.
6. Write the output to `audited_demographics_normalized.json`.
7. Log a summary: how many records were fixed, how many had conflicts, which regions were most affected.

**Acceptance criteria:**
- Every record has exactly one field per concept using the canonical name
- Zero records return N/A for Hispanic, Black, White, Asian, or total population when data exists under any variant
- Percentage scale is consistent (all 0–1 OR all 0–100, matching what the app expects)
- Normalization log exists documenting all changes

---

### Task 1.2: Normalize Property Field Names

**Problem:** The `audited_property.json` contains similar variant proliferation.

**Key normalizations needed:**

| Canonical Name | Variants to Merge |
|---|---|
| `median_home_value` | `median_home_price`, `home_value_median`, `median_home_value_usd` |
| `median_rent_monthly` | `median_rent`, `median_rent_usd`, `median_rental_rate_monthly`, `average_rent`, `average_rent_monthly`, `average_rent_per_month`, `average_rent_per_month_usd`, `average_rent_usd`, `avg_rent`, `avg_rent_monthly`, `rent_median` |
| `pct_owner_occupied` | `owner_occupied_pct`, `owner_occupied_percent`, `owner_occupied_rate`, `owner_occupied_rate_pct`, `owner_occupied_rate_percent`, `owner_occupied_units_pct`, `owner_occupied_units_percent`, `percent_owner_occupied`, `homeownership_rate`, `homeownership_rate_pct`, `homeownership_rate_percent` |
| `pct_renter_occupied` | `renter_occupied_pct`, `renter_occupied_rate_percent`, `renter_occupied_units_percent`, `percent_renter_occupied` |
| `total_housing_units` | `housing_units`, `residential_units` |
| `vacancy_rate` | `vacancy_rate_percent` |
| `median_property_tax` | `average_property_tax`, `avg_property_tax` |
| `new_construction_permits` | `new_constructions`, `new_constructions_annual`, `new_housing_units_built`, `new_units_built`, `units_built` |
| `homes_sold` | `homes_sold_total` |
| `avg_days_on_market` | `average_days_on_market` |
| `pct_single_family` | `percent_single_family`, `percent_single_family_homes` |
| `commercial_vacancy_rate` | `commercial_vacancy_rate_pct`, `commercial_vacancy_rate_percent` |

**Agent instructions:**
- Same normalization pattern as Task 1.1
- Pay special attention to rent: `median_rent_monthly` vs `average_rent_monthly` are different measures. Prefer median. Only fall back to average if median is missing, and flag those records.
- Output to `audited_property_normalized.json`

**Acceptance criteria:**
- `median_home_value` and `median_rent_monthly` populated for every region-year where any variant existed
- No silent N/A values in RegionDetailPanel property cards

---

### Task 1.3: Normalize Socioeconomic Field Names

**Problem:** Same pattern in `audited_socioeconomic.json`.

**Key normalizations needed:**

| Canonical Name | Variants to Merge |
|---|---|
| `median_household_income` | `median_household_income_usd`, `income_median_household` |
| `poverty_rate` | `poverty_rate_pct`, `poverty_rate_percent`, `poverty_rate_percentage`, `pct_poverty` |
| `unemployment_rate` | `unemployment_rate_pct`, `unemployment_rate_percent`, `unemployment_rate_percentage`, `employment_unemployment_rate` |
| `pct_bachelors_degree_or_higher` | `bachelors_degree_or_higher_pct`, `bachelors_degree_or_higher_percent`, `bachelors_degree_or_higher_percentage`, `bachelors_degree_or_higher_rate`, `bachelors_degree_or_higher_rate_percent`, `bachelors_degree_pct`, `college_educated_pct`, `education_bachelors_or_higher_pct`, `educational_attainment_bachelors_or_higher`, `educational_attainment_bachelors_or_higher_percent`, `pct_bachelors_degree_or_higher`, `pct_bachelors_or_higher`, `pct_with_bachelors_degree`, `pct_with_bachelors_degree_or_higher`, `percent_bachelors_degree`, `percent_bachelors_degree_or_higher`, `percent_bachelors_or_higher`, `percent_with_bachelors_degree_or_higher`, `percent_with_bachelors_or_higher` |
| `per_capita_income` | `per_capita_income_usd` |
| `number_of_local_businesses` | `local_businesses_count`, `small_business_count`, `total_businesses`, `number_of_businesses` |
| `legacy_business_closure_rate` | `legacy_business_closure_rate_pct` |
| `eviction_filing_rate` | *(already consistent)* |

**Agent instructions:**
- Same normalization pattern as Task 1.1
- Output to `audited_socioeconomic_normalized.json`

**Acceptance criteria:**
- `median_household_income` and `poverty_rate` populated everywhere data exists under any variant
- No silent N/A in RegionDetailPanel socioeconomic cards

---

### Task 1.4: Validate Region-to-Tract Mapping

**Problem:** The About modal says "15 Austin neighborhoods" but the data contains 244+ distinct region names, many at census tract level. The GeoJSON likely aggregates tracts into macro-regions, but this mapping isn't documented or validated.

**Agent instructions:**
1. Extract all unique `region` and `region_id` pairs from the three normalized JSON files.
2. Cross-reference with the GeoJSON feature properties (look for `region_name` and `region_id` in `REGIONS_GEOJSON`).
3. Identify: (a) regions in the JSON that don't appear in the GeoJSON, (b) GeoJSON regions that have no data, (c) the tract-to-macro-region aggregation rules.
4. Generate a mapping table: `region_tract_mapping.json` with structure `{ macro_region_name, macro_region_id, tracts: [{ tract_name, tract_region_id }] }`.
5. Update the About modal text: either change "15 Austin neighborhoods" to the actual count, or add a sentence explaining the aggregation (e.g., "15 macro-regions aggregated from 244 census tracts").

**Acceptance criteria:**
- Documented mapping between tract-level data and map regions
- Zero orphaned data records (every record maps to a displayed region)
- About modal text matches the actual scope of the data

---

### Task 1.5: Surface Rent Burden in the Detail Panel

**Problem:** `rent_burden_pct` exists in the demographics data but is not displayed in `RegionDetailPanel.jsx`. Rent burden (% of households paying 30%+ of income on housing) is the strongest leading indicator of imminent displacement.

**Agent instructions:**
1. In `RegionDetailPanel.jsx`, add a fifth metric card after the existing four (Median Home Value, Median Rent, Median Household Income, Poverty Rate).
2. Source value from `demoChartData` or from the audited demographics data via the same pattern used for `socioNow`/`propertyNow`.
3. Label: "Rent-Burdened Households". Format as percentage. Change arrow: up = bad (red).
4. Add a subtitle or tooltip: "% of renter households paying ≥30% of income on rent."

**Acceptance criteria:**
- Rent burden visible on the detail panel for every region that has the data
- Color-coded directional arrow (increasing rent burden = red)
- Falls back gracefully to "N/A" if data missing

---

## PHASE 2 — Core Feature Gaps

These are the features most critical for Preservation Austin's grant decision-making workflow.

---

### Task 2.1: Build Grant Triage / Prioritization View

**Problem:** The app supports exploration (map) and comparison (two regions), but Preservation Austin needs a ranked answer: "Which neighborhoods should get grants this year?"

**Agent instructions:**
1. Add a fourth view mode: "Triage" (alongside Map, Compare, Timeline) in `Header.jsx`.
2. Create `TriageView.jsx` component.
3. For each of the 15 macro-regions, compute and display:
   - **Current DVI score** (from existing `interpolateDvi`)
   - **Cultural anchor density**: `surviving_businesses / (surviving_businesses + closed_businesses)` as a ratio
   - **Surviving anchors count**: number of open legacy businesses
   - **Anchors under high pressure**: count of open businesses with `pressure === "high"` or `pressure === "critical"`
   - **Rent burden %** (from demographics)
   - **Triage category**: Computed as:
     - `"Urgent — Act Now"`: DVI 35–55 AND ≥3 surviving anchors AND ≥1 under high pressure
     - `"Critical — Near Tipping"`: DVI 20–35 AND anchors declining
     - `"Monitor"`: DVI <20 OR very few remaining anchors (may be too late)
     - `"Post-Displacement"`: DVI >55 AND cultural anchor density <20%
4. Display as a sortable table with color-coded triage categories.
5. Add a scatter plot: X-axis = DVI score, Y-axis = cultural anchor density. Each dot = a region, sized by number of surviving businesses. Color by triage category. This creates the "still saveable vs. already gone" matrix.
6. Below the table, add a summary box: "Based on current data, we recommend prioritizing [top 3–5 'Urgent' regions] for immediate grant support. These neighborhoods are experiencing active displacement but retain enough cultural anchors that intervention can still make a difference."

**Acceptance criteria:**
- Triage view accessible from header navigation
- All 15 regions ranked with scores visible
- Scatter plot renders with interactive tooltips
- Auto-generated recommendation text based on data
- Sortable by any column

---

### Task 2.2: Add Cultural Anchor Density Metric

**Problem:** DVI measures displacement velocity but not remaining cultural inventory. A high-DVI region with many surviving businesses is a different grant case than one with almost none left.

**Agent instructions:**
1. Create a utility function `calcAnchorDensity(regionId)` in `utils/math.js`:
   ```
   anchor_density = surviving_count / (surviving_count + closed_count)
   ```
   Return value between 0 and 1. If no businesses tracked, return null.
2. Create `calcAnchorPressureScore(regionId)`:
   ```
   pressure_score = (high_pressure_count * 2 + medium_pressure_count) / surviving_count
   ```
   Higher = more businesses under threat.
3. Display anchor density in `RegionDetailPanel.jsx` header area, next to the DVI badge. Use a second badge:
   - Green (>70%): "Strong anchor base"
   - Yellow (40–70%): "Eroding anchor base"
   - Red (<40%): "Critical anchor loss"
4. Also display in the comparison view side-by-side table.

**Acceptance criteria:**
- Anchor density badge visible on every region detail panel
- Values match actual business counts
- Integrated into comparison table
- Available for TriageView (Task 2.1)

---

### Task 2.3: Expose DVI Formula with Adjustable Weights

**Problem:** The DVI formula's component weights are opaque. Grant committees need to understand and potentially adjust them.

**Agent instructions:**
1. Locate the DVI calculation (likely in `utils/math.js`, referenced as `interpolateDvi`).
2. Document the current formula and weights in a new `DviMethodology` component or expandable section in the About modal.
3. Add an "Advanced" panel (collapsed by default) in the Triage view that exposes four weight sliders:
   - Population change weight (default: current value)
   - Home value appreciation weight (default: current value)
   - Educational attainment shift weight (default: current value)
   - Homeownership decline weight (default: current value)
4. Sliders should sum to 1.0 (or 100%). When one slider moves, proportionally adjust the others.
5. Changing weights should recompute all DVI scores in real time and re-sort the triage table.
6. Add a "Reset to defaults" button.
7. Display the formula in plain language: "DVI = (W₁ × population change rate) + (W₂ × home value appreciation) + (W₃ × education shift) + (W₄ × homeownership decline), scaled to 0–100."

**Acceptance criteria:**
- Current DVI formula documented in human-readable form
- Weight sliders functional and recompute scores live
- Reset button restores original weights
- All views reflect adjusted weights when changed

---

### Task 2.4: Expand Comparison View Demographics

**Problem:** `ComparisonView.jsx` only charts Black and Hispanic population shares. Asian communities (Vietnamese corridor on North Lamar, Chinatown Center area) and other groups are invisible.

**Agent instructions:**
1. In `ComparisonView.jsx`, add a toggle above the demographics chart: "Black & Hispanic" (default) | "All Groups".
2. When "All Groups" is selected, show lines for White, Black, Hispanic, Asian, and Other for both compared regions.
3. Use the existing `DEMO_COLORS` palette for consistency with the map view.
4. Update the chart legend to handle the additional lines (consider dashed vs. solid for Region A vs. Region B).
5. Update the side-by-side table to include Asian % and Other % rows.
6. Add a note below the chart: "Indigenous populations are not separately tracked in Census data for these geographies. This represents a known gap."

**Acceptance criteria:**
- Toggle switches between two-group and all-group views
- All five racial/ethnic categories visible in "All Groups" mode
- Legend is clear and distinguishable
- Table includes all groups
- Indigenous data gap acknowledged

---

## PHASE 3 — Narrative & Context Enrichment

These tasks make the data more meaningful and trustworthy.

---

### Task 3.1: Enrich Comparison Auto-Narratives

**Problem:** The `compNarrative` in `ComparisonView.jsx` is purely mathematical ("DVI 62 vs 31"). It should reference cultural losses.

**Agent instructions:**
1. In the `compNarrative` useMemo, after the DVI and home value comparisons, add logic that:
   - Counts closed businesses by `culture` field for each region
   - Identifies the dominant cultural affiliation of losses (e.g., "African American heritage businesses")
   - Generates a sentence like: "East Austin lost 8 African American heritage businesses between 2000–2020, compared to 2 in [Region B]."
2. If one region has significantly more closed businesses than the other, note it.
3. If one region has more surviving businesses under high pressure, flag it as "at greater near-term risk of further cultural loss."

**Acceptance criteria:**
- Comparison narrative includes cultural affiliation data
- Narrative reads naturally, not like a data dump
- Falls back gracefully if business data is sparse

---

### Task 3.2: Add Inflation Labels to Property Cards

**Problem:** `RegionDetailPanel.jsx` displays Median Home Value and Median Rent with change arrows, but doesn't indicate whether values are nominal or inflation-adjusted. If nominal, multi-decade change arrows are misleading.

**Agent instructions:**
1. Determine from the data source whether property values are nominal or adjusted (check `audit_source` fields or data documentation).
2. If nominal: add "(nominal $)" label beneath each property metric card.
3. Better: add an inflation-adjusted column. Use CPI-U Austin MSA data to convert nominal values to constant 2023 dollars. The `ComparisonView` already does this for income (`incomeAdj`), so the same deflator can be applied.
4. Display both: "Median Home Value: $485k (nominal) / $392k (2023$)".
5. Change arrows should use inflation-adjusted values for directional indicators.

**Acceptance criteria:**
- Every dollar-denominated metric clearly labeled nominal or adjusted
- Change arrows based on real (inflation-adjusted) values
- Consistent with ComparisonView's treatment of income

---

### Task 3.3: Add Receiving Community Annotations

**Problem:** Only Dove Springs has a receiving-community callout. Other receiving neighborhoods (e.g., Del Valle, Pflugerville, Manor, Southeast Austin) are not identified.

**Agent instructions:**
1. In the region data or constants, add a `receiving_community` flag and `receiving_from` field for relevant regions.
2. Known receiving communities for Austin displacement (research-based):
   - Dove Springs (already flagged)
   - Del Valle
   - Pflugerville
   - Manor
   - Southeast Austin / Onion Creek
   - Round Rock (partial)
3. In `RegionDetailPanel.jsx`, generalize the Dove Springs-specific callout (line 209) to apply to any region with `receiving_community === true`.
4. Display text: "Note: [Region] is a receiving community. Demographic changes here partly reflect inflow of families displaced from [receiving_from], not gentrification."
5. In the Triage view, receiving communities should be categorized separately — they need different interventions (support for community reconstitution, not displacement prevention).

**Acceptance criteria:**
- All known receiving communities flagged in data
- Callout renders for each receiving community
- Triage view distinguishes receiving communities from displacing ones

---

### Task 3.4: Add Language/Linguistic Data

**Problem:** Racial demographics alone don't capture cultural presence. A neighborhood can shift from 60% to 40% Hispanic while losing all Spanish-language signage, community radio, and bilingual services — or it can maintain those cultural markers despite demographic change.

**Agent instructions:**
1. Source ACS Table B16001 ("Language Spoken at Home") or C16001 at the tract level for 2010 and 2019–2023.
2. Key fields to extract per region:
   - `pct_spanish_speaking_household`
   - `pct_asian_language_household` (includes Vietnamese, Chinese, Korean)
   - `pct_english_only_household`
3. Add to demographics data model.
4. Display in RegionDetailPanel as a small secondary chart or metric row below the demographic composition chart.
5. In the tipping-point narrative, if language shift correlates with demographic shift, note it: "Spanish-speaking households dropped from X% to Y% in the same period."

**Acceptance criteria:**
- Language data available for 2010+ (ACS coverage)
- Displayed in detail panel
- Integrated into narrative when relevant

---

## PHASE 4 — Forward-Looking & Qualitative Layers

These tasks shift the tool from retrospective analysis to predictive capability and emotional resonance.

---

### Task 4.1: Integrate Dev Pressure into Detail Panel

**Problem:** The map has a "Dev. Pressure" toggle, but development pressure data isn't integrated into the detail panel or DVI score.

**Agent instructions:**
1. In `RegionDetailPanel.jsx`, add a "Development Pipeline" section (collapsible) showing:
   - Active permits count
   - Planned units
   - Recent zoning changes
2. If data is available from the existing `showDevPressure` layer, surface it per-region.
3. Consider adding a "Forward DVI" estimate: current DVI + adjustment for pending development.
4. Flag regions where dev pressure is high but DVI is still moderate — these are the "act now before it's too late" cases.

**Acceptance criteria:**
- Dev pressure data visible per-region in detail panel
- Triage view incorporates forward-looking signal

---

### Task 4.2: Add Institutional/Social Anchor Data Model

**Problem:** The business inventory doesn't capture non-commercial cultural anchors (churches, community centers, mutual aid orgs, gathering spaces).

**Agent instructions:**
1. Extend the business data model to include an `anchor_type` field with values: `commercial`, `religious`, `community_org`, `cultural_space`, `informal_gathering`, `educational`.
2. Create a data template (`institutional_anchors_template.json`) with fields:
   ```json
   {
     "name": "",
     "type": "religious|community_org|cultural_space|informal|educational",
     "culture": "",
     "region_id": null,
     "established": null,
     "closed": null,
     "status": "operating|closed|relocated",
     "address": "",
     "notes": ""
   }
   ```
3. Pre-populate with known anchors for highest-DVI regions (agent can research or placeholder):
   - East Austin: Wesley United Methodist, David Chapel Missionary Baptist, Congregation Beth Israel (relocated 2019), Carver Museum
   - East Cesar Chavez: Alamo Drafthouse original location, Pan American Park, El Concilio
   - Holly: Holly Street Power Plant site (community activism site)
4. Update the Legacy Businesses section in `RegionDetailPanel.jsx` to include institutional anchors in a separate tab or combined view.

**Acceptance criteria:**
- Data model supports non-commercial anchors
- Template exists for community data collection
- At least 2–3 institutional anchors populated per high-DVI region
- UI displays them alongside or within the business inventory

---

### Task 4.3: Add Oral History / Community Voice Hooks

**Problem:** The app is data-rich but voice-poor. Grant committees are moved by stories, not just numbers.

**Agent instructions:**
1. Add a `community_voices` field to the region data model:
   ```json
   {
     "quote": "",
     "speaker": "",
     "context": "",
     "year": null,
     "source": ""
   }
   ```
2. In `RegionDetailPanel.jsx`, add a "Community Voice" section (after narrative callouts, before the data source footer) that displays 1–2 quotes if available.
3. Style as a blockquote with attribution.
4. Pre-populate with publicly available quotes from:
   - UT Austin "Uprooted" study interviews
   - Six Square Cultural District oral histories
   - Austin American-Statesman archival coverage
   - Preservation Austin's own community engagement records
5. Add a placeholder state: "No community voices recorded for this region yet. Help us collect stories: [link]."

**Acceptance criteria:**
- Data model supports quotes per region
- UI renders quotes when available
- Placeholder invites contribution when empty
- At least 3–5 regions have at least one quote populated

---

### Task 4.4: Create "How to Use This for Grants" Guide

**Problem:** The app doesn't explain how to translate its data into funding decisions.

**Agent instructions:**
1. Create a new modal component `GrantGuideModal.jsx` accessible from a button in the header (near "About" and "Agenda").
2. Content should include:
   - **Step 1: Start with the Triage View.** Identify regions in the "Urgent — Act Now" category.
   - **Step 2: Check Cultural Anchor Density.** Prioritize regions with 40–70% density (enough anchors to save, but eroding). Regions below 20% may need a different strategy (memorialization, receiving-community support).
   - **Step 3: Look at What's Under Pressure.** In the detail panel, check the "Still Here" businesses. Focus on those with high pressure dots — these are the ones a grant could save.
   - **Step 4: Compare with Peer Regions.** Use the Comparison view to see if a similar neighborhood already lost its anchors. This demonstrates urgency to funders.
   - **Step 5: Use the Timeline for Storytelling.** The timeline's Gantt chart shows closure clusters — use these visuals in grant applications to show the pattern of loss.
   - **Recommended Grant Criteria:** "We suggest prioritizing neighborhoods where: DVI is 35–55 (active displacement, not yet complete), cultural anchor density is 30–70% (enough to save), at least 2 businesses are under high pressure (immediate need), and rent burden exceeds 40% (community is cost-stressed)."
3. Style consistently with the About modal.

**Acceptance criteria:**
- Grant guide modal accessible from header
- Content is specific and actionable, not generic
- References actual app features by name
- Includes recommended criteria thresholds

---

## Data Files to Produce

| Output File | Produced By | Description |
|---|---|---|
| `audited_demographics_normalized.json` | Task 1.1 | Cleaned demographics with canonical field names |
| `audited_property_normalized.json` | Task 1.2 | Cleaned property data with canonical field names |
| `audited_socioeconomic_normalized.json` | Task 1.3 | Cleaned socioeconomic data with canonical field names |
| `region_tract_mapping.json` | Task 1.4 | Tract-to-macro-region mapping documentation |
| `normalization_log.json` | Tasks 1.1–1.3 | Record of all field renames, conflicts, and fixes |
| `institutional_anchors_template.json` | Task 4.2 | Template + seed data for non-commercial anchors |
| `community_voices_seed.json` | Task 4.3 | Seed oral history quotes |

## Components to Create or Modify

| Component | Action | Task |
|---|---|---|
| `TriageView.jsx` | **Create** | 2.1 |
| `GrantGuideModal.jsx` | **Create** | 4.4 |
| `utils/math.js` | **Modify** — add `calcAnchorDensity`, `calcAnchorPressureScore` | 2.2 |
| `utils/math.js` | **Modify** — expose DVI weights as configurable | 2.3 |
| `RegionDetailPanel.jsx` | **Modify** — add rent burden card, anchor density badge, dev pressure section, community voices, institutional anchors | 1.5, 2.2, 4.1, 4.2, 4.3 |
| `ComparisonView.jsx` | **Modify** — add all-groups toggle, anchor density to table, enriched narrative | 2.4, 2.2, 3.1 |
| `Header.jsx` | **Modify** — add Triage tab, Grant Guide button | 2.1, 4.4 |
| `AboutModal.jsx` | **Modify** — fix neighborhood count, add DVI formula docs | 1.4, 2.3 |
| `data/auditedData.js` | **Modify** — point imports to normalized JSON files | 1.1–1.3 |
| `data/constants.js` | **Modify** — add receiving community flags | 3.3 |

---

*This task list is designed for sequential execution by an AI coding agent. Phase 1 must complete before Phase 2 begins. Within phases, tasks can be parallelized where noted. Estimated scope: Phase 1 is ~1 day of agent work, Phase 2 is ~2 days, Phase 3 is ~1 day, Phase 4 is ~2 days.*
