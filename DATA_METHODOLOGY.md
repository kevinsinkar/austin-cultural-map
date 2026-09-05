# Austin's Shifting Ground — Data Methodology & Sources

> **Last updated:** March 24, 2026
> **Purpose:** Comprehensive reference for all data sources, calculations, and assumptions. For anyone asking "where did these numbers come from?"

---

## How to Read This Document

This document is organized from raw inputs (§1–2) through calculations (§3–6) to known limitations (§10). If you want to verify a specific number on screen, start with the section matching the view you're looking at: Map View (§4), Compare View (§5), or Triage View (§6). If you want to understand how the Displacement Vulnerability Index works, start at §3. If you want to know what data we don't have, skip to §10.

---

## Table of Contents

1. [Primary Data Sources](#1-primary-data-sources)
2. [Data Coverage Summary](#2-data-coverage-summary)
3. [Displacement Vulnerability Index (DVI)](#3-displacement-vulnerability-index-dvi)
4. [Map View — Calculations & Data](#4-map-view)
5. [Compare View — Calculations & Data](#5-compare-view)
6. [Triage View — Three Prioritization Lenses](#6-triage-view)
7. [Neighborhood Aggregation Method](#7-neighborhood-aggregation)
8. [Inflation Adjustment (CPI)](#8-inflation-adjustment)
9. [Data Normalization Pipeline](#9-data-normalization-pipeline)
10. [Known Limitations](#10-known-limitations)
11. [Source Attributions](#11-source-attributions)

---

## 1. Primary Data Sources

### 1.1 Census & ACS Data (Demographics, Property, Socioeconomic)

Three audited JSON files in `data/phase1_output/` are the single source of truth:

| File | Rows | Regions | Years | Primary Sources |
|------|------|---------|-------|-----------------|
| `audited_demographics_normalized.json` | 1,542 | 269 | 2000–2023 | U.S. Census Decennial (2000, 2010, 2020), American Community Survey 5-year estimates (2006–2010, 2011–2015, 2016–2020, 2019–2023) |
| `audited_property_normalized.json` | 1,052 | 269 | 2010–2023 | Census/ACS (home values, rent, housing units, vacancy), City of Austin Construction Permits (new permits, commercial sqft) |
| `audited_socioeconomic_normalized.json` | 1,052 | 269 | 2010–2023 | Census/ACS (income, poverty, unemployment, Gini, SNAP participation), BASTA Austin (eviction filing rates, 2014-2025) |

**Important:** All data comes from observed Census, ACS, and administrative records. Intermediate years (e.g., 2005) are linearly interpolated from adjacent anchor years and flagged with `INTERPOLATED` audit flag. Rows computed from parent tracts (where a 2020 tract didn't exist in earlier Census vintages) are flagged with `COMPUTED_FROM_PARENT_TRACT`.

**Historical coverage:** Pre-2020 data was backfilled using `fill_census_gaps_v2.py` (Census API queries with 2010→2020 and 2000→2010→2020 tract crosswalking) and `fill_demographic_history.py` (chained crosswalk + interpolation). Current coverage: 247 regions at 2000, 246 at 2005, 256 at 2010/2015, 269 at 2020/2023. The ~22 regions missing at 2000 are tracts that did not exist in any form until after 2010 (genuinely new development with no historical population).

**Geography:** 269 census tracts covering the Austin-Round Rock MSA, mapped to the 2020 Census tract boundaries. Pre-2010 data is crosswalked from earlier tract definitions using Census Bureau relationship files (area-weighted proportional assignment). Business locations geocoded to building-level precision via Google Maps Geocoding API.

### 1.2 Cultural & Business Data

| Dataset | Entries | Source | Last Updated |
|---------|---------|--------|-------------|
| Legacy Businesses (operating) | 41 | Preservation Austin community survey, public records, field verification | Feb 2026 |
| Legacy Businesses (closed) | 52 | Same as above + closure records, news archives | Feb 2026 |
| Preservation Austin Grants | 72 | Preservation Austin annual reports (2016–2025) | Feb 2026 |
| PA Merit Awards | 41 | Preservation Austin Heritage Awards (2022–2025) | Feb 2026 |
| PA Legacy Business Month | 33 | Preservation Austin Legacy Business program (2023–2025) | Feb 2026 |
| PA Advocacy Milestones | 10 | Preservation Austin public records | Feb 2026 |
| Music/Nightlife Venues | 20 snapshots | Austin Music Census, SXSW venue data, Red River Cultural District records | Mar 2026 |
| Construction Permits | 191,099 new construction (44,266 commercial) | City of Austin Issued Construction Permits (dataset `3syk-w9eu`) | Mar 2026 |
| Project Connect Transit | 4 lines | Capital Metro Project Connect plans | Feb 2026 |

**Business data coverage note:** The 93 tracked businesses (41 operating + 52 closed) are concentrated in East Austin, South Lamar, and downtown — areas where Preservation Austin and community partners have conducted inventories. Approximately 230 of 269 regions have no tracked businesses. This reflects survey coverage, not an absence of culturally significant businesses. The triage system (§6) accounts for this by treating missing business data as neutral rather than as a negative signal.

### 1.3 Neighborhood Planning Areas

| Dataset | Features | Source | Fetched |
|---------|----------|--------|---------|
| COA NPA Boundaries | ~95 polygons | City of Austin Socrata API (dataset `inrm-c3ee`) | Mar 2026 |

---

## 2. Data Coverage Summary

| Data Type | Regions Covered | % of 269 | Notes |
|-----------|----------------|----------|-------|
| Demographics | 269 | 100% | All regions at 2020/2023; 247 at 2000, 246 at 2005, 256 at 2010/2015 |
| Property | 269 | 100% | All regions at 2020/2023; 257 at 2010/2015. Permits + commercial sqft for 1,000 rows. |
| Socioeconomic | 269 | 100% | All regions at 2020/2023; 257 at 2010/2015. SNAP for 479 rows. |
| DVI Score | 269 | 100% | Computed from available sub-indices; re-weighted when data missing (see §3.2) |
| Legacy Businesses | ~40 | 15% | Concentrated in East Austin, South Lamar, downtown. Reflects survey coverage, not absence of cultural assets. |
| Preservation Austin | ~30–40 | 11–15% | Grant/award recipients only |
| Eviction Filings | 244 | 91% | BASTA Austin filings 2014–2025 (2020 tract boundaries); Travis County only — 22 non-Travis tracts and 2010 rows have no data |
| Preservation Austin | ~30–40 | 11–15% | Grant/award recipients only |

---

## 3. Displacement Vulnerability Index (DVI)

### What DVI Measures — and What It Doesn't

The DVI is a composite score (0–100) that measures the **speed and intensity of demographic, economic, and housing-market transformation** in a neighborhood. Higher scores indicate faster, more intense change in the measured indicators.

The DVI **does not** measure: quality of life, community satisfaction, cultural vitality, or whether change is desirable. A high DVI indicates rapid transformation that correlates with displacement of existing residents, but displacement is a complex social process that no single index can fully capture. The DVI is a screening tool — it identifies where to look more closely, not a verdict on what is happening.

### 3.1 Sub-Index Composition

**Demographic Vulnerability (default weight: 35%)**

Captures how exposed a neighborhood's residents are to displacement pressures. Neighborhoods with high renter shares and cost-burdened households have less capacity to absorb rising costs.

| Component | Weight | Formula | Normalization Ceiling | Ceiling Rationale |
|-----------|--------|---------|----------------------|-------------------|
| Rent Burden | 50% | `rent_burden_pct / 55 * 100` | 55% of income | ~95th percentile across Austin tracts. Above this, virtually all renters are severely burdened. |
| Renter Share | 30% | `(100 - pct_owner_occupied) / 75 * 100` | 75% renters | ~95th percentile. Tracts above 75% renter are almost exclusively student or transient housing. |
| Foreign-Born | 20% | `pct_foreign_born / 40 * 100` | 40% population | ~95th percentile. Prevents high-immigration tracts from compressing the scale for all others. |

**Market Pressure (default weight: 35%)**

Captures the forces driving displacement — rising property values and housing costs relative to incomes.

| Component | Weight | Formula | Normalization Ceiling | Ceiling Rationale |
|-----------|--------|---------|----------------------|-------------------|
| Home Value Appreciation | 50% | `pct_home_value_change_yoy / 15 * 100` | 15% YoY | Sustained 15%+ annual appreciation represents extreme market pressure, seen only in peak gentrification corridors. |
| Rent-to-Income Ratio | 50% | `(rent * 12 / income) / 0.50 * 100` | 50% of income on rent | HUD defines >30% as cost-burdened and >50% as severely burdened. The 50% ceiling captures the severe end. |

**Socioeconomic Stress (default weight: 30%)**

Captures the lived economic pressure on residents. These indicators signal communities under strain that may lack resources to resist displacement.

| Component | Weight | Formula | Normalization Ceiling | Ceiling Rationale |
|-----------|--------|---------|----------------------|-------------------|
| Poverty Rate | 40% | `poverty_rate / 30 * 100` | 30% population | ~95th percentile. Federal "high poverty" threshold is 20%; 30% represents extreme concentrated poverty. |
| Unemployment | 30% | `unemployment_rate / 15 * 100` | 15% labor force | ~95th percentile. Double the national average during non-recessionary periods. |
| Eviction Filings | 30% | `eviction_filing_rate / 10 * 100` | 10 per 100 renters | ~95th percentile from Eviction Lab data for Texas metro areas. |

### 3.2 Composite Formula

```
DVI = (W₁ × Demographic Vulnerability) + (W₂ × Market Pressure) + (W₃ × Socioeconomic Stress)
```

Default weights: W₁ = 0.35, W₂ = 0.35, W₃ = 0.30. Users can adjust these via the Advanced panel in the Triage view (§6.4).

**Missing data re-weighting:** When a sub-index is unavailable (e.g., a region has demographic data but no property data), the remaining sub-indices are re-weighted to sum to 1.0. For example, if Market Pressure is missing, the formula becomes `DVI = (0.35/0.65) × Demographic + (0.30/0.65) × Socioeconomic`. This prevents regions with missing data from being artificially scored low.

**Low-confidence boost:** Each data row carries an `audit_confidence` score (see §9.1). When the average confidence across a region's available data sources falls below 0.5, the Socioeconomic Stress weight is boosted by 10 points before re-normalization. Rationale: in data-sparse tracts ("data deserts"), socioeconomic indicators like poverty rate and SNAP participation are more reliably reported than property appreciation or rent-to-income ratios, which may be estimated or interpolated.

### 3.3 Affluence Gate

Not every neighborhood with rising property values is experiencing displacement. Affluent areas with high homeownership aren't at risk of being pushed out — their residents have the resources and tenure security to stay. The Affluence Gate identifies these areas to prevent them from consuming grant resources meant for vulnerable communities.

**Criteria:** A region is flagged `isExcluded` when:
- `median_household_income > $129,000` (150% of Austin city median of $86,000), **AND**
- `pct_owner_occupied > 75%`

**Effect:** DVI is capped at 20 (Stable band) regardless of computed value. The region is labeled "Affluent / Appreciated" in the Triage view and excluded from grant priority recommendations.

### 3.4 DVI Bands (Map Colors)

| Band | DVI Range | Color | Meaning |
|------|-----------|-------|---------|
| Stable | 0–20 | Green | Low displacement pressure |
| Early Pressure | 20–35 | Yellow | Emerging signs of change |
| Active Displacement | 35–55 | Orange | Significant ongoing displacement |
| Historic Displacement | 55+ | Red | Extensive displacement has occurred or is occurring |
| Affluent/Excluded | Any (capped 20) | Slate gray | High-income, not at displacement risk |

These bands are used for map choropleth colors and triage category thresholds. The color ramp uses continuous interpolation within each band (not hard cutoffs) so adjacent tracts show subtle gradation.

### 3.5 DVI Interpolation

`interpolateDvi(regionId, year)` performs linear interpolation between DVI data points. It supports fractional years (e.g., 2023.5) for smooth time-slider animation. When the requested year falls before the earliest or after the latest data point, the function returns the boundary value (no extrapolation beyond the data).

### 3.6 Region Merging

Some census tracts are administratively merged in this tool — a secondary tract ID redirects to a primary tract ID via `MERGE_LOOKUP`. When a merged region is selected, business counts, demographic data, and DVI calculations are computed across all member tracts. This explains why some regions appear to have significantly more businesses than their neighbors: they may represent 2–3 merged tracts while adjacent regions represent single tracts. 232 "visible" regions remain after merging (out of 269 total).

---

## 4. Map View

### What the map shows

- **Polygon fill color:** DVI score at the selected year, using the color ramp from §3.4
- **Polygon click → Detail Panel:** Demographics, economics, and culture tabs for the selected region
- **Time slider:** Moves from 1990 to 2025 in 1-year increments. DVI, overlays, and detail panel data update accordingly.

### Detail Panel — Demographics Tab

| Metric | Source | Calculation |
|--------|--------|-------------|
| Demographic Composition Chart | `audited_demographics_normalized.json` | Stacked area chart of `pct_white`, `pct_black`, `pct_hispanic`, `pct_asian`, `pct_other` as fractions of total population. `pct_other = 100 - white - black - hispanic - asian`. |
| Total Population | Same | `total_population` field at closest available year (see §4.1) |
| Population counts (Black, Hispanic, White) | Same | `total_population * pct_<group> / 100` |
| Narrative Callouts | Computed | "Lost X% of Black population between Y and Z" triggers when `(prior.popBlack - current.popBlack) / prior.popBlack > 0.25` (25% population loss threshold) |

### Detail Panel — Economics Tab

| Metric | Source | Calculation | Display |
|--------|--------|-------------|---------|
| Median Home Value | `audited_property_normalized.json` | `median_home_value` at closest year | Shown in both nominal dollars and 2023 constant dollars (CPI-adjusted, see §8). Change arrow shows percentage change vs. ~5 years prior using inflation-adjusted values. |
| Median Rent | Same | `median_rent_monthly` at closest year | Same dual display (nominal / 2023$) with change arrow. |
| Median Household Income | `audited_socioeconomic_normalized.json` | `median_household_income` at closest year | Same dual display with change arrow. |
| Poverty Rate | Same | `poverty_rate` as percentage | Change arrow vs. prior period. |
| Rent-Burdened Households | `audited_demographics_normalized.json` | `rent_burden_pct` — % of renter households paying ≥30% of income on rent | Change arrow vs. prior period. |

### Detail Panel — Culture Tab

| Metric | Source | Calculation |
|--------|--------|-------------|
| Tipping Point narrative | `data/tippingPoints.js` | Hand-written narratives matched by region name. Not available for all regions. |
| Legacy Businesses (Still Here) | `data/businesses.js` → `LEGACY_OPERATING` | Filtered by `region_id`, sorted by establishment year. Shows name, type, culture, pressure rating. |
| Legacy Businesses (What We Lost) | Same → `LEGACY_CLOSED` | Filtered by `region_id`. Shows name, closure year, cause, replacement. |
| Preservation Austin items | `data/preservationAustin.js` → `PA_ALL` | Filtered by proximity to region centroid (see §4.2). Shows grants, merit awards, legacy business month participants, and advocacy milestones. |

### 4.1 Closest Year Matching

When the time slider is set to a year that doesn't have an exact data match for a region, the system uses `closestRow(rows, year)` to find the nearest available data point. For example, if the slider is at 2015 but a region only has data for 2014 and 2016, the 2014 row is returned. This means the Economics tab may display data from a year 1–2 years offset from the slider position. The displayed year in the panel reflects the actual data year, not the slider year.

### 4.2 Preservation Austin Proximity Matching

PA items (grants, awards, etc.) are matched to regions using geographic proximity: any PA item within 0.012 degrees (~1.3 km) of a region's centroid is associated with that region. This radius approximates the average extent of a census tract in urban Austin. The threshold is deliberately generous to account for the fact that PA grants often benefit an area broader than a single building address.

### Map Overlays

| Overlay | Data Source | Display |
|---------|-----------|---------|
| Business pins (green/amber/gray) | `LEGACY_OPERATING`, `LEGACY_CLOSED` | Circle markers filtered by year. Green = operating, amber = high pressure, gray = closed. |
| Preservation Austin dots | `PA_ALL` | Color-coded by type: grant = purple (#7c3aed), merit award = blue (#2563eb), legacy business = amber (#d97706), advocacy = green (#059669). Filtered by type sub-toggles and year slider. |
| Project Connect lines | `PROJECT_CONNECT_LINES` | Dashed polylines for planned transit corridors. |

### Anchor Density Badge

Displayed in the region detail panel header when business data is available for the selected region.

```
Anchor Density = surviving_businesses / (surviving + closed_businesses)
```

| Badge | Density | Color | Meaning |
|-------|---------|-------|---------|
| Strong anchor base | > 70% | Green | Most tracked cultural anchors still operating |
| Eroding anchor base | 40–70% | Amber | Significant losses but core remains |
| Critical anchor loss | < 40% | Red | Majority of tracked anchors have closed |
| No Data | — | Gray | Region has no tracked businesses (reflects survey coverage, not absence of culture) |

---

## 5. Compare View

### What it shows

Side-by-side comparison of two regions (or two neighborhoods in Neighborhoods mode) across four chart types.

### Charts & Data Sources

| Chart | X-Axis | Y-Axis | Data Source | Calculation |
|-------|--------|--------|-------------|-------------|
| DVI Time Series | Year (1990–2023) | DVI Score | `AUDITED_DVI_LOOKUP` | `interpolateDvi(regionId, year)` at 8 snap years (1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023) |
| Median Home Values | Year (2000–2023) | $ | `SOCIOECONOMIC` array | `homeValue` field (joined from property data). Nominal dollars. |
| Median Household Income | Year (2000–2023) | $ | `SOCIOECONOMIC` array | `incomeAdj` field. Nominal dollars. |
| Demographic Composition | Year (1990–2023) | % | `DEMOGRAPHICS` array | `pctBlack`, `pctHispanic`, `pctWhite`, `pctAsian`, `pctOther` as 0–1 fractions. "All Groups" toggle shows all five; default "Focused" view shows Black and Hispanic only. |

### Comparison Narrative (auto-generated)

The narrative text below the charts is computed from:
1. **DVI gap:** If `|dviA - dviB| > 15`, notes which region experienced more displacement pressure.
2. **Home value gap:** If `|homeA - homeB| > $100,000`, notes which has higher values.
3. **Business closures:** Counts `LEGACY_CLOSED` per region, identifies dominant cultural affiliation of losses (e.g., "predominantly African American" or "Mexican American").
4. **Surviving businesses under pressure:** Counts businesses where `pressure === "High"` or `"Critical"` from `LEGACY_OPERATING`.

The narrative uses these thresholds to avoid generating trivial comparisons — small differences are not narrated.

### Dropdown Options

- **Census Tracts mode:** Shows `REGION_NAMES` (232 visible regions after merging)
- **Neighborhoods mode:** Shows `NEIGHBORHOOD_NAMES` (~87 neighborhoods from COA NPA boundaries)

---

## 6. Triage View — Three Prioritization Lenses

The Triage View provides three ways to prioritize regions for grant investment. Users toggle between the three lenses via a segmented control. All three lenses score **all 232 visible regions** using census/ACS data available for every region. No lens gates on business data availability — regions without tracked businesses are scored using demographic, economic, and socioeconomic indicators, with business-related components defaulting to neutral values rather than zero.

### 6.1 Trajectory Lens

**Question:** *Where is displacement accelerating fastest?*

This lens identifies the intervention window — where change is happening rapidly enough that action now could alter the trajectory, but hasn't progressed so far that preservation is purely retrospective.

| Metric | Formula | Scale | Rationale |
|--------|---------|-------|-----------|
| **Velocity** | `(DVI_2023 - DVI_2010) / 13 years`, normalized to 0–100 | Max velocity cap: 3.0 DVI points/year | 3.0 represents the maximum observed velocity across Austin tracts in the 2010–2023 period. Higher values are clamped to prevent outliers from compressing the scale. |
| **Acceleration** | `velocity_recent - velocity_prior` (2010–2023 vs 2000–2010), normalized to 0–100 | Max acceleration cap: 2.0 | Positive = displacement speeding up. Negative (clamped to 0) = displacement decelerating. 2.0 represents the observed maximum acceleration. |
| **Remaining Vulnerability** | 30% renter share + 25% poverty + 20% BIPOC share + 15% rent burden + 10% foreign-born | 0–100 | Captures how much there is left to lose. A neighborhood that has already fully gentrified has low remaining vulnerability even if velocity was high in the past. |
| **Intervention Window** | Peaks in DVI 20–55 range. Combines velocity × remaining vulnerability, scaled by DVI-range multiplier. | 0–100 | DVI < 20: low urgency (minimal displacement). DVI 20–55: sweet spot where grants can prevent further loss. DVI 55–70: urgent but narrowing window. DVI > 70: largely post-displacement — grants may fund documentation rather than prevention. |
| **Priority Score** | `0.35 × window + 0.30 × velocity + 0.20 × normalized_DVI + 0.15 × acceleration` | 0–100 | Window is weighted highest because it captures the *actionability* of intervention, not just severity. |

**Categories:**

| Category | Priority Score | Color |
|----------|---------------|-------|
| Urgent — Active Window | ≥ 75 | Red |
| High Priority — Accelerating | ≥ 55 | Orange |
| Emerging — Monitor Closely | ≥ 35 | Yellow |
| Stable — Low Priority | ≥ 15 | Green |
| Post-Displacement or Stable | < 15 | Gray |
| Affluent / Appreciated | isExcluded | Blue |

**Scatter Plot:** X = DVI (2023), Y = Displacement Velocity, Dot Size = Intervention Window, Color = Category.

### 6.2 Equity Lens

**Question:** *Which underserved communities need investment most?*

This lens directly operationalizes Preservation Austin's stated mission to focus on underrepresented heritage communities. It aligns with the City of Austin's Equity-Based Preservation Plan (adopted November 2024), which found that only 16% of Austin's historic landmarks have known associations with communities of color.

| Metric | Formula | Scale | Rationale |
|--------|---------|-------|-----------|
| **Demographic Vulnerability** | 40% rent burden + 30% renter share + 15% foreign-born + 15% elderly (65+) | 0–100 | Elderly residents on fixed incomes are included because they face displacement pressure similar to renters — rising property taxes can force long-time homeowners to sell. |
| **Economic Precarity** | 30% poverty + 25% SNAP participation + 25% home value appreciation + 20% income gap (vs $86k city median) | 0–100 | SNAP participation captures deep poverty that the poverty rate alone misses. Home value appreciation appears here as a *threat* to economically precarious residents, not a positive indicator. |
| **Equity Deficit** | 35% BIPOC share + 25% heritage business presence + 20% east-of-I-35 flag + 20% foreign-born | 0–100 | See §6.2.1 for details on the east-of-I-35 proxy and heritage detection. |
| **Preservation Gap** | `max(0, 100 - PA_item_count × 15)` | 0–100 | Regions that have already received significant PA grants, merit awards, or other investments score lower. This creates a spread-the-wealth signal: grant money should flow to underserved areas, not concentrate in areas PA has already supported. A region with zero PA investment and high need gets the full 100. |
| **Priority Score** | `0.25 × DVI + 0.20 × demoVuln + 0.20 × econPrecarity + 0.20 × equityDeficit + 0.15 × preservationGap` | 0–100 | DVI is one of five equal-ish components, not dominant. The equity-specific factors (equity deficit, preservation gap) together carry 35% of the weight. |

#### 6.2.1 East-of-I-35 as an Equity Proxy

Austin's I-35 corridor follows the route of the 1928 Master Plan's racial segregation line, which created a "Negro District" east of East Avenue (now I-35). The highway's construction in the 1960s physically reinforced this divide as a "concrete color line." For eight decades, communities east of I-35 were systematically excluded from public investment, zoning protections, and infrastructure spending. The east-of-I-35 flag (centroid longitude > -97.735) is a geographic proxy for this historic underinvestment.

**Limitation:** This proxy is blunt. Some east-side tracts are now affluent (Mueller, parts of East Riverside), and some west-side tracts have historically underserved populations. The Affluence Gate (§3.3) catches the most obvious false positives, but the flag should be understood as a rough directional signal, not a precise equity measure.

#### 6.2.2 Heritage Business Detection

The equity deficit score includes whether any tracked businesses in the region carry a heritage affiliation tag (e.g., "AACHD (Six Square)", "5th Street Mex-Am Heritage Corridor"). Regions with heritage-affiliated businesses score 80; those without score 20 (not zero, since absence of tracked businesses doesn't mean absence of heritage). This component uses the incomplete business data as a bonus signal rather than a gating factor.

**Categories:**

| Category | Priority Score | Color |
|----------|---------------|-------|
| Equity Priority — Underserved | ≥ 75 | Red |
| Heritage at Risk | ≥ 55 | Orange |
| Moderate Need | ≥ 35 | Yellow |
| Lower Priority | ≥ 15 | Green |
| Affluent / Appreciated | isExcluded | Blue |

**Scatter Plot:** X = DVI, Y = Equity Deficit, Dot Size = Preservation Gap, Color = Category.

### 6.3 Risk Matrix Lens

**Question:** *What type of intervention does each area need?*

Unlike the Trajectory and Equity lenses (which produce a single ranked priority list), the Risk Matrix computes four independent scores and places regions in quadrants. Different quadrants suggest different *kinds* of grants, not just different priority levels.

**Axis 1: Market Displacement Pressure** — where is the market pushing people out?

| Component | Weight | Source | Normalization |
|-----------|--------|--------|---------------|
| Home value appreciation (YoY) | 35% | Property data | 15% YoY ceiling |
| Rent-to-income ratio | 25% | Property + Socioeconomic | 50% of income ceiling |
| New construction permits | 20% | Property data | Normalized to citywide maximum |
| Gini coefficient (inequality) | 20% | Socioeconomic data | 0.55 ceiling |

**Axis 2: Community Vulnerability** — who is at risk of being displaced?

| Component | Weight | Source | Normalization |
|-----------|--------|--------|---------------|
| Rent burden | 30% | Demographics | 55% ceiling |
| Renter share | 25% | Demographics | 75% ceiling |
| Poverty rate | 20% | Socioeconomic | 30% ceiling |
| Foreign-born % | 15% | Demographics | 40% ceiling |
| Elderly (65+) % | 10% | Demographics | 25% ceiling |

**Axis 3: Cultural Significance** — what is at stake if displacement continues?

| Component | Weight | Source | Default when missing |
|-----------|--------|--------|---------------------|
| BIPOC population share | 25% | Demographics | Always available |
| Heritage business presence | 25% | Business data | 0 if no businesses tracked (neutral impact on total since other components compensate) |
| Anchor density | 20% | Business data | **50** (neutral) if no businesses tracked — avoids penalizing data gaps |
| PA investment count | 15% | Preservation Austin | 0 if no PA items nearby |
| Population density | 15% | Demographics | Always available |

**Axis 4: Intervention Feasibility** — can a grant actually help here?

| Component | Weight | Source | Scoring logic |
|-----------|--------|--------|---------------|
| DVI window score | 30% | DVI computation | Peaks at DVI 25–55 (the range where preservation grants are most effective). Below 25: low urgency. Above 70: displacement largely complete. |
| Vacancy rate | 25% | Property data | < 10% = 80 (community still present); ≥ 10% = 40 (possible hollowing out) |
| Tenure mix | 25% | Demographics | 20–60% owner-occupied = 80 (mixed tenure is flexible); outside range = 40 |
| Eviction rate | 20% | Socioeconomic | < 5 per 100 renters = 70 (not in freefall); ≥ 5 = 30 |

**Quadrant Assignment** (Market Pressure vs Community Vulnerability, threshold at 50):

| Quadrant | Market Pressure | Vulnerability | Category | Recommended Grant Type |
|----------|----------------|--------------|----------|----------------------|
| Q1 (upper-right) | ≥ 50 | ≥ 50 | Crisis — Fund Now (if feasibility ≥ 50) | Emergency stabilization grants |
| Q1 (upper-right) | ≥ 50 | ≥ 50 | Crisis — Document (if feasibility < 50) | Oral history, commemoration, archival |
| Q2 (lower-right) | ≥ 50 | < 50 | Urgent — Prevent | Proactive preservation, business support |
| Q4 (upper-left) | < 50 | ≥ 50 | Chronic — Invest (if feasibility ≥ 50) | Community capacity building |
| Q4 (upper-left) | < 50 | ≥ 50 | Chronic — Systemic (if feasibility < 50) | Policy advocacy (not direct grants) |
| Q3 (lower-left) | < 50 | < 50 | Monitor | No immediate action needed |

**Scatter Plot:** X = Market Pressure, Y = Community Vulnerability, Dot Size = Cultural Significance, Color = Category. Quadrant reference lines at x=50, y=50.

### 6.4 DVI Weight Sliders (Advanced Section)

The Advanced panel allows exploratory adjustment of the three DVI sub-index weights (Demographic Vulnerability, Market Pressure, Socioeconomic Stress). Default: 35/35/30. When one slider moves, the other two adjust proportionally to maintain a sum of 100%.

These weights affect the underlying DVI score which feeds into all three lenses: Trajectory uses DVI and its change over time. Equity uses DVI as one of five components. Risk Matrix uses DVI indirectly through the Intervention Feasibility axis.

**Note:** Weight adjustments in the UI are for exploratory analysis only. The default weights (35/35/30) are used for all published recommendations.

---

## 7. Neighborhood Aggregation

When viewing in Neighborhoods mode (~87 neighborhoods from City of Austin NPA boundaries):

### Assignment Method

Each census tract is assigned to **exactly one neighborhood** based on which NPA polygon contains the tract's centroid (centroid-in-polygon matching via Turf.js `booleanPointInPolygon`). This means:

- No double-counting: every tract's population and data contribute to exactly one neighborhood.
- Tracts that physically straddle two neighborhoods are assigned entirely to whichever neighborhood contains the centroid. This is the same method used by HUD and the Census Bureau for cross-geography matching.
- The tradeoff is precision at borders: a tract whose centroid falls barely inside Neighborhood A will have all its data attributed to A, even if 40% of its land area is in Neighborhood B.

### Aggregation Rules

| Metric | Method | Rationale |
|--------|--------|-----------|
| Population | Sum of constituent tract populations | Absolute count — additive. |
| DVI | Population-weighted average across tracts | Prevents small-population tracts from disproportionately influencing the score. |
| Demographic percentages | Population-weighted average | A tract of 500 people and a tract of 5,000 shouldn't weight equally. |
| Demographic composition chart | Population-weighted average per year (1990, 2000, 2010, 2020, 2023) | Combined populations produce a single stacked area chart for the neighborhood. |
| Median home value | Population-weighted average | Approximation. True median would require household-level data (see §10). |
| Median rent | Population-weighted average | Same approximation. |
| Median income | Population-weighted average | Same approximation. |
| Poverty rate | Population-weighted average | Rates are weighted so larger communities drive the aggregate. |
| Rent burden | Population-weighted average | Same as poverty rate. |
| Narrative callouts | Computed from aggregated neighborhood populations | Thresholds (25% population loss, 100% home value surge) applied to combined totals, not per-tract (see below). |
| Anchor density | Combined: total surviving ÷ (surviving + closed) across all tracts | Treats the neighborhood's business inventory as a single pool rather than averaging per-tract densities. |
| Businesses | Union of all businesses in constituent tracts | No weighting needed — businesses are counted, not averaged. |
| PA items | Union of all PA items near any constituent tract centroid | Uses the same 0.012-degree proximity threshold as tract-level matching. |
| Tipping point narratives | All narratives from constituent tracts, shown individually | Not aggregated — each tract's narrative displayed with its origin identified (see below). |

### Temporal Alignment for Economics Data

When aggregating property or socioeconomic data across tracts, different tracts may have different "closest available years" to the slider position. For example, if the slider is at 2015, three tracts in a neighborhood might have 2015 data while a fourth only has 2014 data.

The aggregation resolves this by using the **most common closest year** across constituent tracts as the aggregate year. In the example above, the aggregate would report year 2015 (the majority). All tracts are then weighted using their closest available data, even if one tract's data is from a slightly different year. This keeps the change arrows and inflation adjustments coherent — they compare two specific aggregate years rather than a blend.

The tradeoff: a tract whose closest year is 1–2 years offset from the majority is still included in the weighted average, which introduces a small temporal imprecision. This is preferable to excluding the tract entirely, which would change the population weights and potentially misrepresent the neighborhood.

### Narrative Callouts in Neighborhood Mode

The Demographics tab generates narrative callouts when significant changes are detected (e.g., "Lost 34% of its Black population between 2000 and 2010"). In neighborhood mode, these thresholds are applied to the **aggregated neighborhood-level populations**, not to individual tracts.

This means:
- A neighborhood can trigger the 25% Black population loss callout even if no single constituent tract individually crosses 25% — because the combined population loss across all tracts exceeds the threshold.
- Conversely, a single tract's sharp decline might be diluted below the threshold when combined with stable tracts in the same neighborhood.

This is intentional: neighborhood-mode callouts describe what happened to the neighborhood as a whole, not to individual tracts within it. For tract-level precision on population changes, users should switch to Census Tracts view.

The home value surge callout (>100% increase) works similarly — it compares aggregated population-weighted median home values across tracts at each time period, not individual tract values.

### Tipping Point Narratives in Neighborhood Mode

Tipping point narratives are hand-written per tract (stored in `data/tippingPoints.js`). In neighborhood mode, the panel displays **all** tipping point narratives from constituent tracts, labeled with the originating tract name. A neighborhood spanning five tracts might show zero, one, or multiple tipping point narratives depending on how many of its tracts have them. These are not aggregated or merged — each is shown as written, with its tract of origin identified.

### Source

Neighborhood boundaries: City of Austin Neighborhood Planning Areas, dataset `inrm-c3ee` on data.austintexas.gov (Socrata SODA 2.1 API). ~95 planning areas covering central Austin. Tracts outside NPA coverage are assigned to the nearest NPA (within 2 km) or grouped by municipality (Pflugerville, Round Rock, etc.).

5 manually defined neighborhoods added for well-known areas not covered as distinct NPAs: Rainey Street Historic District, Warehouse District, Mueller, North Loop, Cherrywood.

**Build script:** `node scripts/build_neighborhoods.cjs` (fetches NPA data from City of Austin API, caches locally, generates `data/neighborhoods.js` and `data/neighborhoods_geojson.js`).

**Disclaimer displayed in UI:** "Neighborhood boundaries follow City of Austin planning areas. Data is aggregated from census tracts assigned by centroid location — each tract contributes to exactly one neighborhood. For precise tract-level data, switch to Census Tracts view."

---

## 8. Inflation Adjustment

### Function

`adjustForInflation(nominal_value, year, baseYear=2023)` converts dollar amounts from any year to 2023 constant dollars.

### Index

CPI-U (All Items, All Urban Consumers):
- **Primary:** Austin-Round Rock-Georgetown MSA (BLS Series CUURA320SA0), available 1998–2023
- **Fallback:** U.S. City Average (BLS Series CUUR0000SA0), used for 1990–1997 when Austin-specific data is unavailable

### Formula

```
adjusted_value = nominal_value × (CPI_2023 / CPI_year)
```

**Example:** $500 monthly rent in 2000 → $500 × (298.5 / 166.4) = **$897 in 2023 dollars**

### How it's used

All JSON source files store **nominal dollars** (the actual dollar amount recorded in that year). CPI adjustment is applied at display time in the UI, not in the stored data. The Economics tab shows both values: "$500 / $897 in 2023$" so users can see both the historical and inflation-adjusted figures. Change arrows (↑↓) between time periods use the inflation-adjusted values so that comparisons reflect real purchasing power changes, not just nominal dollar increases.

---

## 9. Data Normalization Pipeline

### 9.1 Audit Confidence Levels

Every data row carries an `audit_confidence` score indicating how reliable the underlying data is:

| Confidence | Score | Meaning | Indicators in UI |
|------------|-------|---------|-----------------|
| High | 0.8–1.0 | Data directly from Census/ACS at matching geography and year. No interpolation or crosswalk. | Presented without indicators. |
| Medium | 0.5–0.7 | Aggregated from tract-level data with some boundary approximation, interpolated between Census years, or derived from reliable secondary sources (TCAD, BLS). | Marked with ⓘ where displayed. |
| Low | 0.2–0.4 | Estimated from sparse data, projected beyond observed years, or from less reliable sources. | Marked with ⓘ and noted as estimate. |
| None | 0.0 | No data available for this region/year/field. Sub-index excluded from DVI computation and re-weighted (see §3.2). | Shown as "—" in the UI. |

The low-confidence boost in §3.2 activates when the average confidence across a region's data sources falls below 0.5. This prevents data-sparse regions from being systematically underscored.

### 9.2 Field Name Normalization

Raw audit JSONs use inconsistent field names across regions (generated by different auditors and API sources). The normalization layer (`data/auditedData.js`) resolves this at import time:

- **20+ variant names for Hispanic %** (e.g., `hispanic_pct`, `pct_latino`, `hispanic_or_latino_percentage`, `ethnic_distribution.hispanic`) collapsed to `pct_hispanic`
- **14+ variant names for Black %** collapsed to `pct_black_non_hispanic`
- **Nested race objects** (`racial_composition`, `ethnic_distribution`) flattened to top-level fields
- **0–1 fractions** auto-detected (values ≤ 1.0 for fields expected as percentages) and scaled to 0–100
- **Property field aliases** (10+ variants each for home value, rent, housing units) mapped to canonical names

### 9.3 Indexed Maps for O(1) Lookups

After normalization, data is stored in pre-indexed Maps for constant-time access:

| Map | Key | Value | Use |
|-----|-----|-------|-----|
| `DEMO_BY_RY` | `"regionId_year"` | Single demographic row | Direct lookup by region + year |
| `PROP_BY_RY` | `"regionId_year"` | Single property row | Direct lookup by region + year |
| `SOCIO_BY_RY` | `"regionId_year"` | Single socioeconomic row | Direct lookup by region + year |
| `AUDITED_DEMO_BY_ID` | `regionId` | Array of all years | Time-series analysis |
| `AUDITED_PROP_BY_ID` | `regionId` | Array of all years | Time-series analysis |
| `AUDITED_SOCIO_BY_ID` | `regionId` | Array of all years | Time-series analysis |

`closestRow(rows, year)` finds the nearest available year when an exact match doesn't exist: it returns the row whose year is closest to the target, preferring earlier years when equidistant. `priorRow(rows, year)` returns the most recent row *before* the target year, used for computing change arrows.

---

## 10. Known Limitations

### Coverage Gaps

- **60 regions** (22%) lack property and socioeconomic data — mostly rural, industrial, or ETJ tracts with sparse or no residential housing stock. DVI for these regions is computed from demographics only (Demographic Vulnerability sub-index), re-weighted to 100% of the DVI score. This makes their DVI less comprehensive but not zero.
- **~230 regions** have no tracked legacy businesses. This reflects survey coverage concentrated in East Austin, South Lamar, and downtown — not the absence of culturally significant businesses elsewhere. The three triage lenses (§6) treat missing business data as neutral (anchor density defaults to 50 in the Risk Matrix) rather than as a negative signal.

### Temporal Caveats

- **Pre-2005 data** relies on Census decennial snapshots (1990, 2000) with linear interpolation for intermediate years. ACS annual estimates didn't begin until 2005.
- **2024–2025 values** are projected estimates, not observed Census/ACS data. They carry low audit confidence scores (0.2–0.4) and should be treated as directional indicators, not precise measurements.
- **Tract boundary changes** between the 2000 and 2010 Census introduce geographic imprecision for cross-decade comparisons. A region's 1990–2000 data may represent a slightly different physical area than its 2010–2023 data. Affected regions are flagged with `TRACT_MISMATCH` in the audit data.

### Measurement Limitations

- **Rent burden** is derived from Census/ACS self-reported housing costs — may undercount informal housing arrangements, doubled-up households, or cash rent payments.
- **Eviction filings** lag actual displacement by 3–6 months (legal process time) and only capture formal filings — informal "cash for keys" agreements and lease non-renewals are not included. The 2020 snap-year rate averages filings over 2016–2020, which includes the 2020 COVID eviction moratorium months — rates for that window are diluted relative to normal years. Renter-household denominators are estimated from ACS housing units × occupancy × renter share, so rates in small or fast-changing tracts carry extra uncertainty.
- **Foreign-born %** has ±2–3 percentage point margin of error in ACS 5-year estimates for small tracts (populations under 2,000).
- **Business data** has selection bias toward historically significant areas in East Austin and downtown where Preservation Austin and community partners have conducted inventories. The tool explicitly notes this: "No Data" in the anchor density badge means no survey coverage, not no culture.
- **Home value data** from TCAD reflects appraised values, not market transaction prices. In rapidly appreciating markets, appraisals may lag actual sales prices by 1–2 years.

### Aggregation Caveats

- **Neighborhood aggregation** assigns each tract entirely to one neighborhood via centroid matching. Tracts straddling neighborhood boundaries are fully attributed to one side. This is standard practice (used by HUD, Census Bureau) but introduces error at boundaries.
- **Population-weighted averaging** for percentages and rates means small-population tracts (under 500 people) have minimal influence on neighborhood-level metrics. This is methodologically correct but means that a small enclave of a specific community within a larger neighborhood may not be visible in the aggregate.
- **Median averaging** is an approximation. Population-weighted averages of median home values across tracts are not the same as the true median across all homes in the neighborhood. The true median would require household-level microdata, which is not publicly available at the tract level.
- **Temporal misalignment in economics data:** When constituent tracts have different "closest available years" to the slider position, the aggregation uses the most common year across tracts as the reported aggregate year but includes all tracts in the weighted average regardless of their individual closest year. A tract reporting 2014 data may be averaged with tracts reporting 2015 data under a "2015" aggregate label. The offset is typically 1–2 years and is preferable to excluding the tract, which would change the population weights.
- **Narrative callout dilution:** Population change callouts (e.g., "lost 25% of its Black population") are computed from aggregated neighborhood totals, not per-tract. A sharp decline in one tract may be diluted below the 25% threshold when combined with stable tracts in the same neighborhood. Conversely, modest per-tract declines can sum to a threshold-crossing loss at the neighborhood level. Both effects are inherent to aggregation. For tract-level population change analysis, use Census Tracts view.

### DVI Limitations

- The DVI is a **screening tool**, not a diagnostic. A high DVI identifies where to investigate further — it does not prove displacement is occurring.
- The DVI equally weights all demographic change, whether driven by gentrification (higher-income newcomers displacing lower-income residents) or by other factors (natural population decline, voluntary outmigration, institutional changes). The Triage lenses (§6) attempt to distinguish these by incorporating market pressure and economic precarity alongside DVI.
- The Affluence Gate (§3.3) is a binary threshold. Regions just below the income or ownership cutoff may still be low-displacement-risk but receive a higher DVI than warranted.
- Normalization ceilings (§3.1) compress variation at the extremes. A tract with 60% rent burden and one with 80% both score 100 on the rent burden component. This is by design (both represent extreme burden) but loses nuance at the high end.

---

## 11. Source Attributions

### Government & Academic Sources

| Source | Data Used | Years | Access |
|--------|-----------|-------|--------|
| U.S. Census Bureau — Decennial Census | Population, race/ethnicity, housing tenure | 1990, 2000, 2010, 2020 | data.census.gov |
| U.S. Census Bureau — American Community Survey | All demographic, economic, housing fields | 2005–2023 (5-year estimates) | data.census.gov |
| Bureau of Labor Statistics | CPI-U inflation indices, unemployment rates | 1990–2023 | bls.gov |
| Travis Central Appraisal District | Property values, tax assessments | 2000–2023 | traviscad.org |
| City of Austin — Neighborhood Planning Areas | NPA boundary polygons (95 areas) | Current as of Mar 2026 | data.austintexas.gov (dataset `inrm-c3ee`) |
| City of Austin — Issued Construction Permits | New construction permit counts, commercial sqft | 2005–2025 | data.austintexas.gov (dataset `3syk-w9eu`) |
| City of Austin — Equity-Based Preservation Plan | Policy framework, equity analysis | Adopted Nov 2024 | austintexas.gov |
| BASTA Austin | Eviction filings by census tract and case outcome (received 2026-06-02 extract) | 2014–2025 | bastaaustin.org |

> **Data vintage note:** Eviction figures come from a static BASTA extract dated **June 2, 2026**. BASTA's public-facing eviction dashboard updates dynamically, so values shown there may differ slightly from the rates used in this tool. BASTA uses 2020 census tract boundaries for all years, matching this tool's tract system. Cases that could not be geocoded from court filing addresses (counted as "NO GEOGRAPHY" in the source data) are excluded from tract-level rates.
| UT Austin "Uprooted" Study | Gentrification typology, displacement patterns | 2018 | sites.utexas.edu |
| Eviction Lab (Princeton University) | Eviction filing rates by tract | 2010–2023 | evictionlab.org |
| Texas Justice Court Training Center | Eviction filing data | 2015–2023 | tjctc.org |
| Texas Health & Human Services Commission | SNAP participation rates | 2010–2023 | hhs.texas.gov (supplemented by ACS B22003 via Census API) |

### Community & Organizational Sources

| Source | Data Used |
|--------|-----------|
| Preservation Austin | Grant awards ($284K+ since 2016), merit awards (2022–2025), Legacy Business Month participants (2023–2025), advocacy milestones |
| Six Square Austin African American Cultural Heritage District | Cultural plan, heritage site inventory, AACHD boundary |
| Austin Legacy Business Closure Analysis | Business closure causes, replacement tenants, cultural affiliations |
| Community business inventories | Field surveys, public records (compiled Feb 2026) |

### Commercial/Estimated Sources

| Source | Data Used | Notes |
|--------|-----------|-------|
| Zillow Home Value Index | Home value estimates | Used to fill gaps in TCAD data, particularly for newer tracts |
| MLS (Multiple Listing Service) | Rent estimates, sales data | Via licensed data partnerships; used where ACS rent data is unavailable or outdated |

---

*The data is imperfect. Imperfect data, honestly presented, is more valuable than no data at all.*

### Data Pipeline Scripts

| Script | Purpose |
|--------|---------|
| `fill_census_gaps_v2.py` | Backfills historical Census/ACS data using tract crosswalking (2000→2010→2020) |
| `fill_demographic_history.py` | Chains crosswalks for deep history + interpolates 2005 from 2000/2010 |
| `extract_permits.py` | Extracts new construction permits and commercial sqft from COA 1.5GB permit CSV |
| `merge_permits_and_evictions.py` | Merges permit data and tract-level eviction rates into phase1_output JSONs |
| `prepare_basta_evictions.py` | Converts BASTA filing counts to rates: filings averaged over ACS-aligned windows (2015←2014–15, 2020←2016–20, 2023←2019–23) ÷ estimated renter households (occupied units × renter share) × 100. Tracts with <30 renter households excluded. |
| `geocode_businesses_google.py` | Geocodes business locations to rooftop precision via Google Maps API |
