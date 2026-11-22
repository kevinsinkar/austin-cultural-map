# Austin's Shifting Ground — Data Methodology & Sources

> **Last updated:** November 22, 2026
> **Purpose:** Comprehensive reference for all data sources, calculations, and assumptions. For anyone asking "where did these numbers come from?"

---

## How to Read This Document

**Short on time?** [METHODOLOGY_AT_A_GLANCE.md](METHODOLOGY_AT_A_GLANCE.md) shows every formula on one page, each with the data behind its terms. This document gives the reasons and the limits.

This document is organized from raw inputs (§1–2) through calculations (§3–6) to known limitations (§10). If you want to verify a specific number on screen, start with the section matching the view you're looking at: Map View (§4), Compare View (§5), or Triage View (§6). If you want to understand how the map's displacement stages are decided, start at §3. If you want to know what data we don't have, skip to §10.

---

## Table of Contents

1. [Primary Data Sources](#1-primary-data-sources)
2. [Data Coverage Summary](#2-data-coverage-summary)
3. [Displacement Stages (Map Colors)](#3-displacement-stages-map-colors)
4. [Map View — Calculations & Data](#4-map-view)
5. [Compare View — Calculations & Data](#5-compare-view)
6. [Triage View: Three Lenses on the Stages](#6-triage-view-three-lenses-on-the-stages)
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
| `audited_demographics_normalized.json` | 1,541 | 269 | 2000–2023 | U.S. Census Decennial (2000, 2010, 2020), American Community Survey 5-year estimates (2006–2010, 2011–2015, 2016–2020, 2019–2023) |
| `audited_property_normalized.json` | 1,052 | 269 | 2010–2023 | Census/ACS (home values, rent, housing units, vacancy), City of Austin Construction Permits (new permits, commercial sqft) |
| `audited_socioeconomic_normalized.json` | 1,052 | 269 | 2010–2023 | Census/ACS (income, poverty, unemployment, Gini, SNAP participation), BASTA Austin (eviction filing rates, 2014-2025) |

**Important:** All data comes from observed Census, ACS, and administrative records. Intermediate years (e.g., 2005) are linearly interpolated from adjacent anchor years and flagged with `INTERPOLATED` audit flag.

**Historical coverage:** Pre-2020 data was first backfilled with `fill_census_gaps_v2.py` and `fill_demographic_history.py`. Current coverage: 246 regions at 2000 and 2005, 256 at 2010/2015, 269 at 2020/2023. The regions missing at 2000 are tracts with no 2000 tract to draw from.

**Rebuilt November 2026 (`npm run build:history`, `scripts/rebuild_census_history.mjs`):** population, race shares and owner share for 2000, 2010 and 2015, and rent burden for 2010 and 2015, are now taken straight from the census tables and allocated onto 2020 tract boundaries; 2005 is re-interpolated from them. The rebuild corrected four faults in the earlier backfill:

| Fault | Effect | Rows corrected |
|-------|--------|----------------|
| 2000 and 2010 owner share read from table H003 (occupied vs vacant) or from the mortgaged-owner cell alone, instead of table H004 (owner vs renter) | Renter share wrong: tract 8.03 showed 10% renters in 2000; the census count is 52% | 79 tracts in 2000 and 225 in 2010 moved by more than 5 points |
| Tracts split after 2000 or 2010 carried the parent tract's whole population | Earlier populations overstated, which inflated "fell from N to M residents" counts | 120 tracts in 2000, 91 in 2010 and 91 in 2015 moved by more than 10% |
| 177 of the 2000 rows used estimated, not counted, non-Hispanic race figures; whole-number 2000 tracts (7, 11, 12 …) were matched to the wrong tract | Black + Hispanic share off by more than 5 points | 8 tracts in 2000 |
| 2015 rent burden mixed two definitions: 149 tracts used "30% or more of income", 94 used "50% or more" | 2015 scores not comparable between tracts | 157 tracts moved by more than 5 points |

Rows whose 2020 tract has the same boundary as the earlier tract are exact counts. Rows allocated from earlier tracts are flagged `ALLOCATED_FROM_EARLIER_TRACTS` and are estimates: a tract split from a larger one inherits the larger tract's shares and a part of its population.

**Geography:** 269 census tracts covering the Austin-Round Rock MSA, mapped to the 2020 Census tract boundaries. Earlier tracts are mapped with the Census Bureau's tract relationship files: 2000→2010 by the share of the 2000 tract's population (for people) or housing units (for homes), 2010→2020 by land area, the only measure that file carries. Business locations geocoded to building-level precision via Google Maps Geocoding API.

**Definitions used in every year:** *owner share* is owner-occupied homes divided by occupied homes; renter share is the remainder. *Rent burden* is the share of renters paying **50% or more** of household income on rent (ACS table B25070). That is the federal "severe" burden line, not the more common 30% line.

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

**Business data coverage note:** The 93 tracked businesses (41 operating + 52 closed) are concentrated in East Austin, South Lamar, and downtown — areas where Preservation Austin and community partners have conducted inventories. Approximately 230 of 269 regions have no tracked businesses. This reflects survey coverage, not an absence of culturally significant businesses. The Triage view (§6) shows tracked-business counts for reference; none of its group rules depends on them.

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
| Displacement stage | 269 | 100% | Decided for every tract; 8 to 12 are not scored in a given year (§3.4) |
| Pressure score (presenter tools) | 269 | 100% | Computed from available sub-indices; re-weighted when data missing (see §3.8) |
| Legacy Businesses | ~40 | 15% | Concentrated in East Austin, South Lamar, downtown. Reflects survey coverage, not absence of cultural assets. |
| Preservation Austin | ~30–40 | 11–15% | Grant/award recipients only |
| Eviction Filings | 244 | 91% | BASTA Austin filings 2014–2025 (2020 tract boundaries); Travis County only — 22 non-Travis tracts and 2010 rows have no data |
| Preservation Austin | ~30–40 | 11–15% | Grant/award recipients only |

---

## 3. Displacement Stages (Map Colors)

### What a stage is, and what it is not

Every census tract and every multi-tract neighborhood on the map is placed in a **displacement stage**, or in none. A stage is a category decided by three tests on census figures. It is not a score, it is never averaged, and it is never interpolated between years.

The tests are those of Appendix 3 of *Uprooted: Residential Displacement in Austin's Gentrifying Neighborhoods, and What Can Be Done About It* (Way, Mueller and Wegmann, University of Texas at Austin, 2018), a study the City of Austin commissioned. That appendix adapts Lisa Bates, *Gentrification and Displacement Study* (Portland, 2013). The City of Austin publishes its own updates of the same test as "Displacement Risk Areas". This site works the test out itself, from Census Bureau tables, for each census year it shows (`scripts/build_stages.mjs` → `data/stages.js`; `npm run build:stages`).

A stage describes an area as a whole. It is **not** a statement about any block or household, and "no stage" does not mean no one there is at risk of displacement.

> **November 2026 change.** Until this revision the map was colored by a 0–100 composite score cut into four bands named Stable, Early pressure, Active displacement and Historic displacement. An audit found that 92% of scored tracts fell in the top two bands, that the score followed present-day poverty (correlation 0.71) far more closely than measured demographic change (0.13), and that the tracts with the largest measured loss of Black and Hispanic residents scored mid-scale. The band names claimed stages the score did not measure. The score is kept for the presenter-only tools under a plain name (§3.8); it no longer colors the map.

### 3.1 The three tests

"Region" means the five-county Austin area: Bastrop, Caldwell, Hays, Travis and Williamson counties (503 census tracts on 2020 boundaries). "Well above" means more than half a standard deviation above the regional figure (a z-score above +0.5), where the standard deviation is taken across the region's tracts, weighted by the size of each tract's population or households, around the regional figure.

**Test 1. Vulnerable residents.** Five shares. A place is vulnerable when at least 3 of the 5 are well above the region.

| Measure | Definition | Census tables (2000 / later years) |
|---------|------------|-------------------------------------|
| People of color | Residents who are not white non-Hispanic ÷ all residents | SF1 P004 / ACS B03002 |
| Households that rent | Renter-occupied ÷ occupied homes | SF1 H004 / ACS B25003 |
| Lower-income households | Households under 80% of the region's median family income ÷ all households | SF3 P052, P077 / ACS B19001, B19113 |
| Children in poverty | People under 18 below the poverty line ÷ people under 18 with a poverty status | SF3 P087 / ACS B17001 |
| Adults without a bachelor's degree | People 25 and over without a four-year degree ÷ people 25 and over | SF3 P037 / ACS B15002 |

**Test 2. Demographic change since 2000.** Four changes, each compared with the region's own change over the same years. Change is "yes" when at least 2 of the 4 are well above the regional change **and** the four average at least half a standard deviation above it.

| Measure | Change measured as |
|---------|--------------------|
| Households that own | Percentage points |
| White, non-Hispanic residents | Percentage points |
| Adults with a bachelor's degree | Percentage points |
| Median family income (SF3 P077 / ACS B19113) | Percent, in dollars of each year |

**Test 3. Housing market.** Median home value (SF3 H085 / ACS B25077) in 2000 and in the year tested, and the percent rise between them. Each is ranked among the scored tracts on this site and called **high** when it is in the top two fifths (above the 60th percentile). A tract with fewer than 50 owner-occupied homes in either year uses median gross rent instead (SF3 H063 / ACS B25064), ranked the same way.

| Pattern | Value in 2000 | Value today | Rise since 2000 | And |
|---------|---------------|-------------|-----------------|-----|
| Accelerating | any | not high | high | |
| Appreciated | not high | high | high | |
| Adjacent | not high | any | not high | touches a tract whose value today or rise is high |

For the 2019–2023 survey the lines were: people of color 59.8% (region 50.2%), renters 54.6% (41.1%), lower-income households 59.0% (49.7%), children in poverty 18.9% (11.5%), adults without a bachelor's 59.9% (50.1%); a 2000 home value of $134,660, a value today of $576,340 and a rise of 325%. The lines for every year are stored in `STAGE_REGION` in `data/stages.js`, and each story card prints the ones that applied to it.

### 3.2 The stages

| Stage on the map | The study's type | Vulnerable | Demographic change | Housing |
|------------------|------------------|------------|--------------------|---------|
| Vulnerable | Susceptible | yes | no | adjacent |
| Vulnerable | (no type in the study) | yes | any other combination | any other combination |
| Early | Early: Type 1 | yes | no | accelerating |
| Early | Early: Type 2 | yes | yes | adjacent |
| Dynamic | Dynamic | yes | yes | accelerating |
| Late | Late | yes | yes | appreciated |
| Continued loss | Continued loss | no | yes, or white share and bachelor's share both up | appreciated |
| Continued loss | Rapid loss (see below) | no, but yes in 2000 | yes | accelerating |
| No stage | | no | anything else | anything else |

The map draws five stages in one hue, light to dark (`STAGE_CLASSES` in `utils/stages.js`): Vulnerable `#eba259`, Early `#de7b2e`, Dynamic `#c9550a`, Late `#a7320c`, Continued loss `#75201a`. The ramp was checked for steadily falling lightness and for steps that stay apart under color-vision deficiency. Places with no stage are left nearly clear, so the staged places read as the pattern. The side panel and the story card name the study's exact type beside the stage where it says more ("Vulnerable · Susceptible", "Continued loss · Rapid loss").

**Two rows are not in the UT table.**

- *Vulnerable, no type.* The study gives no type to a vulnerable tract whose market shows none of its patterns. This site still shows it as Vulnerable, because the first test is met.
- *Rapid loss.* The study has no row for a tract that was vulnerable in 2000, no longer is, shows demographic change, and whose home values are rising fast but are not yet high. Several East Austin tracts with the largest measured loss of residents of color fall there (tracts 21.07, 21.09, 21.10 and 21.11 in the 2019–2023 survey). The City's updates call such tracts "rapid loss" and group them with continued loss as "chronic displacement risk". This site does the same, using its own 2000 reading for "was vulnerable". The City's exact rule is not published, so this row is this site's rule, not the City's.

Tracts in each stage, by census year:

| Year (survey) | Vulnerable | Early | Dynamic | Late | Continued loss | No stage | Not scored |
|---------------|-----------|-------|---------|------|----------------|----------|------------|
| 2010 (2006–2010) | 54 | 23 | 6 | 2 | 8 | 165 | 11 |
| 2015 (2011–2015) | 53 | 21 | 6 | 6 | 8 | 165 | 10 |
| 2020 (2016–2020) | 42 | 21 | 5 | 5 | 19 | 167 | 10 |
| 2023 (2019–2023) | 43 | 19 | 8 | 2 | 26 | 163 | 8 |

### 3.3 Years

| Slider year | What the map shows | Source |
|-------------|--------------------|--------|
| Before 2000 | Boundaries only | The site holds no census figures before 2000 |
| 2000–2009 | Test 1 only: vulnerable in 2000, or not | 2000 Census (SF1 and SF3) |
| 2010–2014 | Stage | American Community Survey 2006–2010 |
| 2015–2019 | Stage | American Community Survey 2011–2015 |
| 2020–2022 | Stage | American Community Survey 2016–2020 |
| 2023 on | Stage | American Community Survey 2019–2023 |

Change is always measured from 2000, so 2000 itself has no stage: 78 tracts were vulnerable, 179 were not, 12 were not scored. A slider year shows the latest census year at or before it; the time bar names the survey.

Figures from before 2020 are carried onto today's (2020) tract boundaries with the Census Bureau's tract relationship files: 2000 tracts to 2010 tracts by the share of the 2000 tract's people (for counts of people) or homes (for counts of homes), and 2010 tracts to 2020 tracts by land area, the only measure that file carries. Counts are allocated and summed before shares are taken. A median cannot be allocated, so a carried median is the average of the source tracts' medians weighted by the families, owner homes or renter homes each contributes.

### 3.4 Places that are not scored

A place is left out of the tests, and drawn in gray with a dashed edge, when in that year:

- it has fewer than 500 residents (the airport, tract 16.06), or
- half or more of its residents are enrolled in college or graduate school (the University of Texas and West Campus tracts 6.01 and 6.05–6.08; the Pleasant Valley student-apartment tracts in the 2010 and 2015 surveys), or
- half or more live in group quarters such as dormitories, barracks or a jail (tract 23.19), or
- fewer than three of the five vulnerability measures can be computed.

The UT study excluded the airport, the UT campus, Camp Mabry and two West Campus tracts by hand; this site applies a rule each year instead. A share is not computed on fewer than 50 people or homes.

### 3.5 Neighborhoods

A neighborhood of two or more tracts is put through the same three tests on its combined figures: counts are added across its tracts, medians are averaged by population (as elsewhere on the site, §7), and "adjacent" looks at every tract that touches the neighborhood from outside. Its stage is therefore its own reading and can differ from the stages of its tracts. A one-tract neighborhood has its tract's stage.

### 3.6 Check against the City of Austin's map

The City's *Displacement Risk Areas 2022* (data.austintexas.gov, dataset `t8nv-zcp9`, retrieved November 2026) covers the same 269 tracts. Its 2022 result and this site's reading of the 2019–2023 survey agree as follows:

| Compared | Agree | Of | Share |
|----------|-------|----|-------|
| Vulnerable, yes or no | 231 | 260 | 89% |
| Demographic change, yes or no | 221 | 248 | 89% |
| Housing market pattern | 196 | 259 | 76% |
| Stage (the study's type, with "stable" as no stage) | 188 | 235 | 80% |
| The City's three groups: vulnerable, active, chronic | 199 | 250 | 80% |

The two are not expected to match exactly: the City used earlier survey years, HUD data for low-income households, and it carries some tracts over from its earlier maps as "historical displacement" (15 tracts, left out of the stage comparison). The side panel and the story card print the City's category beside this site's stage so a reader can see both. The comparison is recomputed on every build (`STAGE_CHECK` in `data/stages.js`).

The stages also line up with change that can be measured directly. Mean change since 2000 among the tracts in each stage in the 2019–2023 survey:

| Stage | Tracts | White non-Hispanic share | Adults with a bachelor's | Median family income |
|-------|--------|--------------------------|--------------------------|----------------------|
| Vulnerable | 42 | −16.0 points | +7.6 points | +46% |
| Early | 19 | −1.2 points | +18.2 points | +71% |
| Dynamic | 8 | +12.4 points | +32.3 points | +140% |
| Late | 2 | +22.9 points | +28.5 points | +325% |
| Continued loss | 26 | +22.4 points | +41.1 points | +290% |
| No stage | 160 | −13.2 points | +15.4 points | +115% |

(Region: −10.9 points, +13.2 points, +106%. The second test uses these same measures, so the table shows the stages are ordered as intended; it is not an independent test of them.) Of the 78 tracts that were vulnerable in 2000, 24 are in continued loss, 2 late, 8 dynamic, 15 early, 17 still vulnerable with no change measured, and 12 have no stage. Of the 179 that were not vulnerable in 2000, 25 are vulnerable now; most are outer tracts.

For single places: The tracts with the largest fall in residents of color since 2000 read, across 2000, 2010, 2015, 2020 and 2023: Holly (tract 10) vulnerable, dynamic, late, continued loss, continued loss; Holly (9.02) vulnerable, dynamic, dynamic, late, continued loss; Chestnut (8.03) vulnerable, then continued loss in every later year; Rosewood (8.02) vulnerable, dynamic, dynamic, late, late.

### 3.7 Where this departs from the UT method

| Appendix 3 | This site | Why |
|------------|-----------|-----|
| Low-income households from HUD's CHAS tables (under 80% of area median family income, adjusted for household size) | Households under 80% of the region's median family income, counted from the census income brackets; the bracket the line falls in is split evenly | CHAS is not published for every survey year used here. The line is not adjusted for household size. |
| "Appreciated" described with a 1990 home value | Uses the 2000 value | The site holds no 1990 figures. The appendix's own spreadsheet formula also tests the 2000 value. |
| One reading, 2000 to 2012–2016 | A reading for 2010, 2015, 2020 and 2023, each against 2000 | The map has a year slider. |
| Tracts carried between boundaries with Brown University's Longitudinal Tract Database, to 2010 tracts | Census Bureau relationship files, to 2020 tracts (§3.3) | The site's tracts are 2020 tracts. |
| Five tracts excluded by hand | A rule, applied each year (§3.4) | Student areas moved over the period. |
| Home values in 2016 dollars | Dollars of each year | Rescaling every tract by the same factor does not change its rank. |
| Region's median family income for 2000 taken from the census | The five counties' medians, weighted by their number of families ($59,196) | The 2000 Census API has no figure for the metropolitan area. Appendix 3 suggests this fallback. |
| Vulnerable tracts with no market pattern are unclassified; no "rapid loss" | Shown as Vulnerable; rapid loss added (§3.2) | See §3.2. |

### 3.8 The pressure score (presenter tools only)

The 0–100 composite score that colored the map before November 2026 is still computed (`data/auditedDvi.js`) and still feeds the presenter-only Compare view, where it is called the pressure score (the code and some labels keep the old abbreviation, DVI). It sums up **present-day conditions**: rent burden, renter share, poverty, rent against income, home-value appreciation. It is not a stage and is not shown in the public build. Its bands are plain quarters of the scored tracts pooled over 2015, 2020 and 2023 under the default weights: under 37, 37–46, 46–56, and 56 and over (`DVI_BINS` in `utils/math.js`), drawn in a blue-gray ramp so they are not mistaken for stages.

#### Sub-Index Composition

**Demographic Vulnerability (default weight: 35%)**

| Component | Weight | Formula | Normalization Ceiling | Ceiling Rationale |
|-----------|--------|---------|----------------------|-------------------|
| Rent Burden | 50% | `rent_burden_pct / 55 * 100` | 55% of renters | `rent_burden_pct` is the share of renters paying 50% or more of income on rent (§1.1). 55% is above the 95th percentile (48% in 2023). |
| Renter Share | 30% | `(100 - pct_owner_occupied) / 75 * 100` | 75% renters | ~95th percentile. Tracts above 75% renter are almost exclusively student or transient housing. |
| Foreign-Born | 20% | `pct_foreign_born / 40 * 100` | 40% population | ~95th percentile. Prevents high-immigration tracts from compressing the scale for all others. |

**Market Pressure (default weight: 35%)**

| Component | Weight | Formula | Normalization Ceiling | Ceiling Rationale |
|-----------|--------|---------|----------------------|-------------------|
| Home Value Appreciation | 50% | `pct_home_value_change_yoy / 15 * 100` | 15% YoY | Set when 15% a year was rare. In 2023 the median tract was at 14.7% and 117 of 244 tracts hit the ceiling, so this component no longer separates tracts. |
| Rent-to-Income Ratio | 50% | `(rent * 12 / income) / 0.50 * 100` | 50% of income on rent | HUD defines >30% as cost-burdened and >50% as severely burdened. The 50% ceiling captures the severe end. |

**Socioeconomic Stress (default weight: 30%)**

| Component | Weight | Formula | Normalization Ceiling | Ceiling Rationale |
|-----------|--------|---------|----------------------|-------------------|
| Poverty Rate | 40% | `poverty_rate / 30 * 100` | 30% population | ~95th percentile. Federal "high poverty" threshold is 20%; 30% represents extreme concentrated poverty. |
| Unemployment | 30% | `unemployment_rate / 15 * 100` | 15% labor force | ~95th percentile. Double the national average during non-recessionary periods. |
| Eviction Filings | 30% | `eviction_filing_rate / 10 * 100` | 10 per 100 renters | ~95th percentile from Eviction Lab data for Texas metro areas. |

#### Composite Formula

```
score = (W₁ × Demographic Vulnerability) + (W₂ × Market Pressure) + (W₃ × Socioeconomic Stress)
```

Default weights: W₁ = 0.35, W₂ = 0.35, W₃ = 0.30. The presenter can adjust these in the DVI Weights panel on the map (presenter mode).

**Missing data re-weighting:** When a sub-index is unavailable (e.g., a region has demographic data but no property data), the remaining sub-indices are re-weighted to sum to 1.0. Re-weighting also applies **within** each sub-index: a missing field is excluded and the remaining fields' weights are re-normalized, rather than the field being scored as zero. Each score carries a `coverage` value (fraction of the 8 input fields present). A tract-year with fewer than 3 of the 8 fields gets no score.

**Low-confidence boost:** Each data row carries an `audit_confidence` score (see §9.1). When the average confidence across a region's available data sources falls below 0.5, the Socioeconomic Stress weight is boosted by 10 points before re-normalization.

#### Affluence Gate

A region is flagged `isExcluded` when `median_household_income > $129,000` (150% of Austin city median of $86,000) **and** `pct_owner_occupied > 75%`. Its score is capped at 20. The gate applies to the score only; on the map such tracts simply have no stage.

#### Interpolation

`interpolateDvi(regionId, year)` performs linear interpolation between score data points. When the requested year falls before the earliest or after the latest data point, the function returns the boundary value (no extrapolation beyond the data). Stages are never interpolated.

### 3.9 Region Merging

Some census tracts are administratively merged in this tool — a secondary tract ID redirects to a primary tract ID via `MERGE_LOOKUP`. When a merged region is selected, business counts and demographic data are computed across all member tracts. This explains why some regions appear to have significantly more businesses than their neighbors: they may represent 2–3 merged tracts while adjacent regions represent single tracts. 232 "visible" regions remain after merging (out of 269 total).

---

## 4. Map View

### What the map shows

- **Polygon fill color:** the place's displacement stage at the selected year (§3.2). A slider year shows the latest census year at or before it (§3.3).
- **Selecting a place** (a click on the map, a search result, or a suggestion in the "Start here" card) opens the **place panel** beside the map. The panel is the same for a census tract and for a neighborhood.
- **Story card:** "Open the story card" in the place panel opens that place's full profile as its own page, with its own address (`#/card?tract=84` or `#/card?hood=montopolis`). It can be printed; a section is not split across sheets.
- **Search:** neighborhoods, census tracts (by name or number) and tracked cultural anchors are matched in the browser. A street address is resolved by OpenStreetMap's Nominatim service, only when the person chooses "Look up … as a street address"; the address is then assigned to the census tract whose polygon contains it.
- **Time slider:** moves from 1990 to 2025 in 1-year increments. The map opens on 2023, the latest measured year.

### Place Panel

Built by `buildPlaceSummary()` in `utils/placeData.js`.

| Item | Source | Calculation |
|------|--------|-------------|
| Title and sub-line | `data/placeNames.js`, `data/regionIndex.js` | See §4.3. The sub-line gives the census tract number and the council district that contains the tract's center point. |
| Displacement stage | `data/stages.js` via `utils/stages.js` | The stage at the latest census year at or before the slider year, with the study's exact type, one sentence on why, and the three tests as one line each (§3.1). Between 2000 and 2009 it shows only "vulnerable in 2000" or not. A neighborhood of several tracts is tested on its combined figures (§3.5). |
| City of Austin's 2022 map | `CITY_RISK_2022` in `data/stages.js` | The City's own category for the same tract (vulnerable, active or chronic displacement risk, or none), shown beside the 2020 and 2023 readings (§3.6). For a neighborhood, the count of its tracts in each category. |
| Measured change sentence | `audited_demographics_normalized.json` | Black + Hispanic share of residents, and renter share, at the earliest reliable census year (2000, else 2010) and the latest (2023, else 2020). For a neighborhood, population-weighted shares using only years in which every one of its tracts was measured. Renter share is derived as 100 minus owner-occupied share. |
| Median household income, median home value | `audited_socioeconomic_normalized.json`, `audited_property_normalized.json` | Value at the closest available year (§4.1), in nominal dollars, with that year shown. For a neighborhood, a population-weighted average of tract medians (§7). |
| Cultural anchors tracked | `data/businesses.js` | Count of operating and closed anchors whose `region_id` is the tract (or any tract of the neighborhood). |
| Preservation Austin records nearby | `data/preservationAustin.js` | Count of grants, awards and advocacy items within 0.012° of the tract's center (§4.2). |
| Turning point | `data/tippingPoints.js` | Named when the tract belongs to a documented corridor. |

### Story Card

Built by `buildStoryCard()` in `utils/placeData.js`. It always describes the latest measured year (2023), whatever the slider shows.

| Section | Source | Calculation |
|---------|--------|-------------|
| What the data shows | `data/stages.js`, demographics | The stage in the 2019–2023 survey and one sentence on why; the measured-change sentence from the place panel; the City's 2022 category; the stage at each census year as a labeled strip. |
| How the stage was decided | `data/stages.js` | The three tests with their numbers: each measure here, the regional figure, and the line it had to pass (§3.1). Shown only for a scored place. |
| Who lives here | `audited_demographics_normalized.json` | Stacked shares of White non-Hispanic, Black, Hispanic or Latino, Asian and other residents for the census years that have data. `other = 100 − the four groups`. |
| The economics | Demographics, property and socioeconomic files | Eight measures (income, home value, rent, rent burden, poverty, unemployment, eviction filings, SNAP). Each shows its latest value and the change since its earliest measured year, with a small trend line over its own years. Dollars are nominal, not inflation-adjusted. For a neighborhood, values are population-weighted across tracts and a year is used only when every tract that carries the measure has a value that year. |
| The turning point | `data/tippingPoints.js` + census data | A hand-written narrative per corridor; the home-value figures are computed from the audited data by `computeTippingStats()`. |
| Cultural anchors still here / What has been lost | `data/businesses.js` | Operating anchors with the year they opened; closed anchors with the year they closed, where recorded. |
| Preservation Austin grants, awards and advocacy nearby | `data/preservationAustin.js` | Items within 0.012° of the tract's center (§4.2), newest first. |

The earlier three-tab detail panel (Demographics / Economics / Culture, `components/RegionDetailPanel.jsx`) is no longer shown; the story card carries its content.

### 4.1 Closest Year Matching

When the time slider is set to a year that doesn't have an exact data match for a region, the system uses `closestRow(rows, year)` to find the nearest available data point. For example, if the slider is at 2015 but a region only has data for 2014 and 2016, the 2014 row is returned. This means the Economics tab may display data from a year 1–2 years offset from the slider position. The displayed year in the panel reflects the actual data year, not the slider year.

### 4.2 Preservation Austin Proximity Matching

PA items (grants, awards, etc.) are matched to regions using geographic proximity: any PA item within 0.012 degrees (~1.3 km) of a region's centroid is associated with that region. This radius approximates the average extent of a census tract in urban Austin. The threshold is deliberately generous to account for the fact that PA grants often benefit an area broader than a single building address.

### 4.3 Place Names

A place is titled the same way in the panel, the story card, the hover label and the search list (`utils/places.js`). Internal ids are never shown.

A census tract carries a neighborhood name only where a City of Austin Neighborhood Planning Area (NPA) polygon supports it. `scripts/build_place_names.mjs` reads the share of each tract's area that falls inside each planning area (`data/audit_output/tract_npa_overlap.json`) and applies this rule, in order:

| Basis | Rule | Example title | Tracts |
|-------|------|---------------|--------|
| Named | One planning area covers 80% or more of the tract | "Montopolis" | 81 |
| Split | Two planning areas each cover 25% or more | "Govalle / Holly area" | 26 |
| Majority | One planning area covers 50% or more | "Old West Austin area" | 6 |
| Census | None of the above (mostly suburban tracts outside planning-area coverage) | "Census tract 419" | 119 |

The census tract number is always available as the second line, and the panel states the basis in a sentence (for example, "This tract straddles two City planning areas: Chestnut (51%) and Central East Austin (49%)"). Earlier heuristic names for tracts outside planning-area coverage are not used.

#### Naming audit (November 2026)

| Check | Result |
|-------|--------|
| Tract / planning-area overlap recomputed from the shapes | All 232 tracts reproduce the stored overlap within 1 point, and all 232 titles reproduce exactly. No tract carries a name its area does not support. |
| Neighborhoods (tract unions) against the City planning area of the same name | Of 44 named neighborhoods, 13 cover 90% or more of the City's area, 16 cover 70–89%, 7 cover 50–69% and 8 cover less than half (Govalle 32%, Georgian Acres 38%, Upper Boggy Creek 40%, MLK-183 42%). |
| City planning areas with no neighborhood on the site | 21 of 65, because no tract sits 80% inside them: Chestnut, East Cesar Chavez, Hancock, Heritage Hills, Highland, Holly, Hyde Park, Johnston Terrace, MLK, North Loop, North University, Old Enfield, Old West Austin, Pecan Springs-Springdale, Rosedale, Southeast, Sweetbriar, Triangle State, UT, West Congress, Windsor Road. |
| Tract shape against the Census Bureau's land + water area for that tract number | 174 of 269 shapes match within 2%. The other 95 are smaller, never larger: tracts on the edge of the mapped area are clipped. Of the 232 shown as their own place, 27 show less than a quarter of the real tract and 13 show a quarter to a half, while the figures describe the whole tract. |

What this means: a neighborhood on this site is the set of census tracts that best fits a City planning area, not the planning area itself, and census tracts cut across several of the neighborhoods this site is most about. The area-name layer below shows the City's real boundaries beside the tract-based figures.

#### Area names on the map

The names drawn on the map, and the outline shown when one is chosen, come from the City of Austin Neighborhood Planning Areas file and nothing else (`scripts/build_area_names.mjs` → `data/shapes/areas.min.json`, `data/areaNames.js`):

| Zoom | Names shown | Count |
|------|-------------|-------|
| Zoomed out (11 and below) | Combined planning areas ("East MLK": MLK, MLK-183, Pecan Springs-Springdale) and planning areas that belong to no combined area | 18 + 21 |
| Default (12–13) | Planning areas ("Holly", "Chestnut", "Rosewood") | 65 |
| Zoomed in (14 and above) | Planning areas plus named sub-districts ("Blackland", "Rogers-Washington-Holy Cross") | 65 + 20 |

Sub-districts that name a road or a zoning device rather than a place (a lane, an avenue, an infill exclusion zone) are left out. Two City names that are initials are spelled out on the label: RMMA (the former Robert Mueller Municipal Airport) reads "Mueller (RMMA)" and UT reads "University of Texas". A name is skipped where it would overlap another, so not every name shows at every zoom; all of them are in the search box.

Choosing a name outlines the City boundary and opens a card listing the census tracts that overlap it, with two shares for each: how much of the area the tract makes up, and how much of the tract lies inside. The card does not show figures for the area itself, because every figure on the site is counted by tract. No "East Austin" or "South Austin" level exists in the layer: the City publishes no boundary for those, and this site does not draw its own.

### Map Overlays

| Overlay | Data Source | Display |
|---------|-----------|---------|
| Business pins (green/gray) | `LEGACY_OPERATING`, `LEGACY_CLOSED` | Circle markers filtered by year. Green = operating, gray = closed. |
| Preservation Austin dots | `PA_ALL` | Color-coded by type: grant = purple (#7c3aed), merit award = blue (#2563eb), legacy business = amber (#d97706), advocacy = green (#059669). Filtered by type sub-toggles and year slider. |
| Project Connect lines | `PROJECT_CONNECT_LINES` | Dashed polylines for planned transit corridors. |

### Anchor Density Badge

Shown in the Compare table. (It was also the badge in the header of the earlier three-tab detail panel, which is no longer shown.)

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
| Pressure score | Year (1990–2023) | Score, 0–100 | `AUDITED_DVI_LOOKUP` | `interpolateDvi(regionId, year)` at 8 snap years (1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023). The score describes present-day conditions (§3.8); it is not the stage. |
| Median Home Values | Year (2000–2023) | $ | `SOCIOECONOMIC` array | `homeValue` field (joined from property data). Nominal dollars. |
| Median Household Income | Year (2000–2023) | $ | `SOCIOECONOMIC` array | `incomeAdj` field. Nominal dollars. |
| Demographic Composition | Year (1990–2023) | % | `DEMOGRAPHICS` array | `pctBlack`, `pctHispanic`, `pctWhite`, `pctAsian`, `pctOther` as 0–1 fractions. "All Groups" toggle shows all five; default "Focused" view shows Black and Hispanic only. |

### Comparison Narrative (auto-generated)

The narrative text below the charts is computed from:
1. **Stage and score:** Names each tract's displacement stage in the 2019–2023 survey (§3.2), then gives both pressure scores for 2020 (§3.8).
2. **Home value gap:** If `|homeA - homeB| > $100,000`, notes which has higher values.
3. **Business closures:** Counts `LEGACY_CLOSED` per region, identifies dominant cultural affiliation of losses (e.g., "predominantly African American" or "Mexican American").

The narrative uses these thresholds to avoid generating trivial comparisons — small differences are not narrated.

### Dropdown Options

- **Census Tracts mode:** Shows `REGION_NAMES` (232 visible regions after merging)
- **Neighborhoods mode:** Shows `NEIGHBORHOOD_NAMES` (~87 neighborhoods from COA NPA boundaries)

---

## 6. Triage View: Three Lenses on the Stages

*Presenter mode only (`components/TriageView.jsx`, `utils/lenses.js`).*

The Triage view asks three questions of the displacement stages of §3. Each lens sorts every one of the 269 census tracts into a group by a stated rule and shows the measured figures behind the rule. There is no composite score, no weighting and no ranking: within a group, the table is simply ordered by one measured figure, and any column can be sorted. A lens is a screening aid for committee discussion, not a finding about any neighborhood.

> **November 2026 change.** Until this revision the three lenses were weighted 0–100 scores built on the pressure score of §3.8, with categories such as "Urgent — Active Window" and "Crisis — Fund Now". They were replaced for three reasons. The score they rested on follows present-day poverty, not measured change (§3). Their weights, ceilings and "intervention window" multipliers were never checked against outcomes. And the weight sliders shown in the view did not change its results. The lenses now use the stages and census figures only.

Colors in this view are the stage colors of the map (§3.2). The lens's group is shown in words.

### 6.1 Figures the lenses add

The lenses use the stage and its three tests (§3.1) for the 2019–2023 survey, plus the figures below. They are computed by `scripts/build_stages.mjs` and written to `data/stageLenses.js`, which only the presenter build loads.

| Figure | Formula | Data |
|--------|---------|------|
| Change since 2000 (index) | Mean of the four z-scores of test 2 (§3.1): owner share, white non-Hispanic share, bachelor's share, median family income | 2000 Census and ACS 2019–2023, as in §3.1 |
| Shift since 2011–2015 (index) | The same mean, with change measured between the 2011–2015 and 2019–2023 surveys, compared with the region's change over that period and the spread of tracts around it | ACS 2011–2015 and 2019–2023: B25003, B03002, B15002, B19113 |
| Shifted, yes or no | Yes when at least 2 of the 4 z-scores are above 0.5 and the index is 0.5 or more (the rule of test 2) | |
| Value rise since 2011–2015 | (value now − value then) ÷ value then × 100. "Fast" is above the 60th percentile of scored tracts: +127% for home values, +59% for rents | ACS B25077; B25064 where fewer than 50 homes are owned |
| Rank of the rise since 2000 | (number of scored tracts with a smaller rise) ÷ (scored tracts − 1) × 100. Above 60 is the "high" of test 3 | 2000 SF3 H085 / ACS B25077 (H063 / B25064 for rent) |
| Preservation Austin listings nearby | Count of listings less than 0.012 degrees (about 1.3 km) from the tract's center point | `data/preservationAustin.js`: 156 published listings, of which 18 are filed as citywide and not counted |
| Black + Hispanic share since 2000 | Share in 2023 − share in 2000, in percentage points (2010 where a tract has no 2000 figure) | `data/phase1_output/audited_demographics_normalized.json` (§1.1) |
| Tracked businesses | Count of legacy businesses in the tract, open and closed | `data/businesses.js` (§1.2) |

The two surveys compared for the recent shift, 2011–2015 and 2019–2023, share no interviews. The 2016–2020 survey overlaps the latest one by two years, so it is not used for that comparison. For the period, the region's change and the line a tract must pass were: owner share +0.9 points (line +7.3), white non-Hispanic share −3.8 (line +1.8), bachelor's share +8.2 (line +13.2), median family income +54.2% (line +76.9%).

### 6.2 Trajectory lens

**Question:** *Where is change moving now?*

| Group | Rule | Tracts |
|-------|------|--------|
| Starting to shift | Stage is Vulnerable, and the population shifted between the two surveys | 6 |
| Shifting now | Stage is Early, Dynamic or Late, and the population shifted between the two surveys | 19 |
| Reached continued loss since 2015 | Stage is Continued loss now and was something else in the 2011–2015 survey | 19 |
| In a stage, no recent shift | Stage is Early, Dynamic or Late, and no shift was measured between the two surveys | 10 |
| Vulnerable, no shift measured | Stage is Vulnerable, and no shift was measured | 37 |
| Continued loss by 2015 | Stage was already Continued loss in the 2011–2015 survey | 7 |
| No stage | No stage in the 2019–2023 survey | 163 |
| Not scored | §3.4 | 8 |

Of the 25 tracts in the first two groups, 16 show no change on the longer test since 2000: the shift is recent. The table also shows each tract's stage in the 2010, 2015, 2020 and 2023 readings.

**Chart:** x = change since 2000 (index), y = shift since 2011–2015 (index), with both lines at 0.5.

### 6.3 Equity lens

**Question:** *Where do vulnerable residents live, and where has Preservation Austin's recorded work been?*

| Group | Rule | Tracts |
|-------|------|--------|
| Vulnerable residents, no listing nearby | Stage is Vulnerable, Early, Dynamic or Late, and no listing lies within about 1.3 km of the tract's center | 66 |
| Vulnerable residents, listing nearby | The same stages, with at least one listing within about 1.3 km | 6 |
| Continued loss, no listing nearby | Stage is Continued loss, no listing within about 1.3 km | 15 |
| Continued loss, listing nearby | Stage is Continued loss, at least one listing within about 1.3 km | 11 |
| No stage | No stage in the 2019–2023 survey (36 of these have a listing nearby) | 163 |
| Not scored | §3.4 | 8 |

**Chart:** x = people of color as a share of residents in 2000, y = the same share in the 2019–2023 survey, with the diagonal marking no change. A filled dot has a listing nearby; a ring has none.

The earlier version of this lens scored a tract higher for lying east of I-35 and for having a heritage-tagged business. Both are gone. People of color as a share of residents, in 2000 and now, is measured for every tract and does the same job.

### 6.4 Matrix lens

**Question:** *Who lives here, and what is the housing market doing?*

The two forces the stages are built on, as a grid. "Vulnerable" is test 1 (at least 3 of 5 measures past the line). "Rising fast" is the rise in value since 2000 in the top two fifths, the "high" of test 3.

| Group | Rule | Tracts |
|-------|------|--------|
| Vulnerable residents, values rising fast | Vulnerable now; rise in the top two fifths | 29 |
| Vulnerable residents, values not rising fast | Vulnerable now; rise not in the top two fifths | 43 |
| Vulnerable in 2000, not now, values rising fast | Not vulnerable now, vulnerable in 2000; rise in the top two fifths | 31 |
| Not vulnerable, values rising fast | Not vulnerable now or in 2000; rise in the top two fifths | 43 |
| Not vulnerable, values not rising fast | Not vulnerable; rise not in the top two fifths, or not measured | 115 |
| Not scored | §3.4 | 8 |

**Chart:** x = rank of the rise in value since 2000 (0–100, line at 60), y = number of vulnerability measures past the line (0–5, line between 2 and 3). Dots are offset slightly up or down so they do not cover each other.

The first three groups each carry a question for the committee, shown when the group or a place in it is selected. These are prompts written for this tool. They are not Preservation Austin programs and they are not recommendations of the UT study.

### 6.5 Limits of the lenses

- **The recent shift compares two samples.** A single tract's shift can be survey noise. The groups are lists to look into, not forecasts.
- **Boundaries.** 143 of the 269 tracts had different boundaries in 2010. Their 2011–2015 figures are estimates carried from the earlier tracts (§3.3) and are marked ≈ in the table. A shift was found in 26% of those tracts and in 29% of the tracts with unchanged boundaries, so carrying does not appear to create shifts, but any one carried tract can be wrong.
- **Listings are the published record.** They are not everything Preservation Austin has done. 18 of 156 are citywide and are not counted toward any tract; 42 more are placed at the center of a neighborhood or area, not at a street address. "Nearby" is measured from the tract's center, so a listing inside a large tract can fall outside the 1.3 km.
- **Tracked businesses** reflect where inventories were done (§1.2). No group rule uses them.
- **Tracts only.** The lenses are not offered for neighborhoods.
- **A group is not a stage.** Where a group's rule and the stage differ (31 tracts were vulnerable in 2000, are not now and have fast-rising values; 26 are in continued loss), the difference is the extra conditions of §3.2.

---

## 7. Neighborhood Aggregation

When viewing in Neighborhoods mode, the map shows 44 named neighborhoods (81 census tracts) and 151 single-tract units.

### Assignment Method

A census tract joins a named neighborhood **only when that City of Austin Neighborhood Planning Area covers at least 80% of the tract's area** (the same threshold as the "named" basis in §4.3). Every other tract, including all suburban tracts that have no planning-area polygon, stays a standalone unit and is titled as described in §4.3. Multi-tract neighborhoods must be contiguous: a tract that qualifies by area but does not touch the rest of the group reverts to a standalone unit.

- No double-counting: every tract's population and data contribute to at most one neighborhood.
- A neighborhood here is therefore the part of a planning area that census tracts can describe cleanly. A planning area whose tracts all straddle its edges has no neighborhood entry; its tracts appear individually, titled "… area".

### Aggregation Rules

| Metric | Method | Rationale |
|--------|--------|-----------|
| Population | Sum of constituent tract populations | Absolute count — additive. |
| Displacement stage | The three tests run on the neighborhood's combined figures (§3.5) | A stage is a category and cannot be averaged. |
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

*(These callouts belonged to the earlier three-tab detail panel, which is no longer shown. The rules are kept here because `utils/aggregation.js` still computes them.)*

The Demographics tab generates narrative callouts when significant changes are detected (e.g., "Lost 34% of its Black population between 2000 and 2010"). In neighborhood mode, these thresholds are applied to the **aggregated neighborhood-level populations**, not to individual tracts.

This means:
- A neighborhood can trigger the 25% Black population loss callout even if no single constituent tract individually crosses 25% — because the combined population loss across all tracts exceeds the threshold.
- Conversely, a single tract's sharp decline might be diluted below the threshold when combined with stable tracts in the same neighborhood.

This is intentional: neighborhood-mode callouts describe what happened to the neighborhood as a whole, not to individual tracts within it. For tract-level precision on population changes, users should switch to Census Tracts view.

The home value surge callout (>100% increase) works similarly — it compares aggregated population-weighted median home values across tracts at each time period, not individual tract values.

### Tipping Point Narratives in Neighborhood Mode

Tipping point records (`data/tippingPoints.js`) carry a hand-written qualitative narrative (`context`, policy events, citations) per corridor, joined to tracts by explicit `region_ids`. The quantitative claims — group population changes and home-value change over the corridor's decade — are **computed at render time** from the audited census data by `computeTippingStats` (`utils/math.js`), clamped to available census years (a corridor whose data starts later than its narrative decade, like Holly at 2010, is measured from its first data year), with percentage changes suppressed for group bases under 100 people. Home values use audited property medians (2010+) with the interim socioeconomic series as the pre-2010 fallback, averaged across tract medians. In neighborhood mode, the panel shows the tipping points of any corridor intersecting the neighborhood's tracts (Sept 2026 revision: previously narratives were matched by display name, which no longer matched any tract and left the card unreachable).

### Source

Neighborhood boundaries: City of Austin Neighborhood Planning Areas, dataset `inrm-c3ee` on data.austintexas.gov (Socrata SODA 2.1 API), about 95 planning areas covering central Austin.

**Build scripts:** `node scripts/assign_names_by_area.cjs` computes the tract and planning-area overlaps; `node scripts/build_neighborhoods.cjs` generates `data/neighborhoods.js` and `data/neighborhoods_geojson.js`; `npm run build:places` generates the tract titles (§4.3); `npm run build:shapes` generates the slim polygon files the site loads (`data/shapes/`).

**Note displayed in the UI (Neighborhoods view):** "Showing neighborhoods. A neighborhood combines the census tracts that sit inside a City of Austin planning area; areas without one are shown as single tracts."

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

All JSON source files store **nominal dollars** (the actual dollar amount recorded in that year).

**Not applied at present.** The place panel and the story card show dollars of each year, and their "up N% since" figures compare nominal dollars. The stage tests rank home values within one year, so inflation does not affect them (§3.7). The function remains in `utils/cpi.js` for a future view that compares dollar amounts across years.

---

## 9. Data Normalization Pipeline

### 9.1 Audit Confidence Levels

Every data row carries an `audit_confidence` score indicating how reliable the underlying data is:

| Confidence | Score | Meaning | Indicators in UI |
|------------|-------|---------|-----------------|
| High | 0.8–1.0 | Data directly from Census/ACS at matching geography and year. No interpolation or crosswalk. | Presented without indicators. |
| Medium | 0.5–0.7 | Aggregated from tract-level data with some boundary approximation, interpolated between Census years, or derived from reliable secondary sources (TCAD, BLS). | Marked with ⓘ where displayed. |
| Low | 0.2–0.4 | Estimated from sparse data, projected beyond observed years, or from less reliable sources. | Marked with ⓘ and noted as estimate. |
| None | 0.0 | No data available for this region/year/field. Sub-index excluded from the pressure score and re-weighted (see §3.8). | Shown as "—" in the UI. |

The low-confidence boost in §3.8 activates when the average confidence across a region's data sources falls below 0.5. This prevents data-sparse regions from being systematically underscored.

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
- **~230 regions** have no tracked legacy businesses. This reflects survey coverage concentrated in East Austin, South Lamar, and downtown — not the absence of culturally significant businesses elsewhere. The Triage lenses (§6) show the counts for reference and do not use them in any rule.

### Temporal Caveats

- **Pre-2005 data** relies on Census decennial snapshots (1990, 2000) with linear interpolation for intermediate years. ACS annual estimates didn't begin until 2005.
- **2024–2025 values** are projected estimates, not observed Census/ACS data. They carry low audit confidence scores (0.2–0.4) and should be treated as directional indicators, not precise measurements.
- **Tract boundary changes** between censuses make earlier figures estimates wherever a tract was split or merged (130 of 246 tracts at 2000; 104 of 256 at 2010 and 2015). Those rows are flagged `ALLOCATED_FROM_EARLIER_TRACTS` (§1.1). Only population, race, owner share and rent burden were rebuilt this way; the other 2010 and 2015 fields (income, home value, rent, poverty, foreign-born, education) still come from the first backfill, which copied a parent tract's value.

### Measurement Limitations

- **Rent burden** is derived from Census/ACS self-reported housing costs — may undercount informal housing arrangements, doubled-up households, or cash rent payments. It counts only renters paying half or more of their income, a small group in a tract-sized sample, so it swings widely between surveys (median change of 6 points between the 2020 and 2023 releases).
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

### Stage Limitations

- **A stage describes an area, not people.** Vulnerable households live in tracts with no stage, and a tract in "continued loss" still has long-time residents.
- **The tests are relative.** "Vulnerable" means well above the five-county region in that year, and "change" means more change than the region. A tract can cross a line because the region moved, not because the tract did.
- **Survey error.** From 2010 on, every figure comes from the American Community Survey, a sample. Tract estimates carry margins of error that this site does not show, and the tests have hard lines. Of 776 year-to-year readings, 621 stay in the same stage, 102 move to a later stage and 53 move back to an earlier one. A single reversal is more likely noise than recovery.
- **Change before 2000 is invisible.** Change is measured from 2000. A place whose vulnerable residents had already left by then reads as "no stage".
- **Home values are self-reported** by owner-occupants, and say nothing about rental housing. Tracts with few owner homes use median rent instead.
- **Boundaries.** Figures from before 2020 are estimates on today's tract boundaries (§3.3). Tracts on the edge of the mapped area are drawn clipped (§4.3) but tested on the whole tract.
- **Not the City's map.** This site's readings agree with the City's 2022 map for about four tracts in five (§3.6). Where they differ, neither is shown to be right.
- **Two rows are this site's own** (§3.2): vulnerable tracts with no market pattern, and rapid loss.

### Pressure Score Limitations

- The score (§3.8) describes present-day conditions and follows poverty closely. It is not evidence that displacement is happening and it is not used on the map.
- The Affluence Gate is a binary threshold. Regions just below the income or ownership cutoff are scored in full.
- Normalization ceilings compress variation at the extremes. A tract with 60% rent burden and one with 80% both score 100 on that component, and in 2023 about half of all tracts hit the home-value ceiling.

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
| UT Austin "Uprooted" Study (Way, Mueller, Wegmann) | The three-part test behind the map's stages: Appendix 3, "Methodology for Mapping Gentrifying Neighborhoods in Austin" | 2018 | sites.utexas.edu/gentrificationproject |
| Lisa Bates, "Gentrification and Displacement Study" (Portland) | The typology the UT study adapts | 2013 | portlandoregon.gov |
| City of Austin — Displacement Risk Areas 2022 | The City's own classification of the same 269 tracts, shown beside each stage and used as a check (§3.6) | 2022 model, retrieved Nov 2026 | data.austintexas.gov (dataset `t8nv-zcp9`) |
| U.S. Census Bureau — 2000 SF3 and ACS 5-year tables for the five-county region | Inputs to the stage tests (§3.1): education, income brackets, median family income, child poverty, home value, rent, college enrollment, group quarters | 2000, 2006–2010, 2011–2015, 2016–2020, 2019–2023 | api.census.gov |
| U.S. Census Bureau — tract relationship files | Carrying 2000 and 2010 tract figures onto 2020 tracts | 2010, 2020 | www2.census.gov/geo |
| Texas Legislature Online | Bill text and history for the state-legislation timeline layer (26 bills, 2006–2025) | 2000–2025 | capitol.texas.gov |

### AISD School Closures Layer

The map's "AISD Closures" overlay shows the 15 Austin ISD campuses closed or consolidated between 2012 and 2026: Allan (2012, charter handoff to IDEA), the 2019-vote "School Changes" round (Pease and Brooke in 2020; Metz and Sims in 2021), and the ten campuses approved for closure on November 21, 2025 (effective 2026–27). Coordinates were geocoded from published campus addresses; closure details and final enrollments come from AISD repurposing pages, the Austin Chronicle, KUT, and Community Impact — each entry carries its source URL in the map popup. Campuses that were proposed but not approved for closure (Maplewood, Palm, Bryker Woods) and programs without standalone buildings (International High School) are excluded. Markers respond to the time slider: solid once the slider passes the closure year, outlined before it.

### State Legislation Timeline Layer

The map's "TX Legislation — Cost of Living" track shows bills passed by the Texas Legislature that materially affected Austin housing costs, property taxes, rents, utilities, or displacement pressure. Each entry was verified against at least one published source (Texas Tribune, Texas Housers, Every Texan, Texas Municipal League, TEA, Texas Comptroller, TTARA, Ballotpedia, Pew, Mercatus). Cost-direction labels ("raises costs" / "lowers costs" / "mixed") follow published Austin-specific analysis, not our own judgment — e.g., homestead-exemption bills are labeled "lowers costs" for homeowners with the caveat that Austin's renter majority receives no direct relief.

Key aggregate sources for this layer:

- **UT Austin "Uprooted" (2018), Part 5** — catalogs displacement-mitigation tools preempted by state law (linkage fees, source-of-income protection, rent control, inclusionary zoning)
- **Every Texan, "Property Tax Compression" (2023)** — traces the 2006→2023 compression/exemption lineage
- **Texas Comptroller, "Property Tax Cuts as Large as Texas" (Fiscal Notes, Dec 2023)** — official retrospective of the 2015–2023 relief packages
- **Mercatus, "Framing Futures" (2025)** — aggregates the 89th Legislature's housing-supply package

Notes: HB 2127 ("Death Star" preemption) was struck down by a Travis County district court in 2023, but the ruling was vacated on appeal in July 2025 and the law is currently in effect. SB 38 (eviction acceleration) passed in 2025 with a January 1, 2026 effective date. Bills that failed, city ordinances, and federal action are excluded; pre-2000 statutes (e.g., the rent-control ban, the 1997 homestead appraisal cap) are excluded as outside the window.
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
| `build_stages.mjs` | Decides the displacement stage of every tract and neighborhood for each census year (§3) and writes `data/stages.js`. Pulls are cached in `data/_cache/census_history/stage_*.json`; `--report` prints the checks against the City's map. Also writes `data/stageLenses.js`, the figures for the Triage lenses (§6). |
| `rebuild_census_history.mjs` | Rebuilds 2000, 2010 and 2015 population, race, owner share and rent burden from census tables (§1.1). Shares its census helpers with `build_stages.mjs` (`scripts/lib/census.mjs`). |
| `fill_census_gaps_v2.py` | Backfills historical Census/ACS data using tract crosswalking (2000→2010→2020) |
| `fill_demographic_history.py` | Chains crosswalks for deep history + interpolates 2005 from 2000/2010 |
| `extract_permits.py` | Extracts new construction permits and commercial sqft from COA 1.5GB permit CSV |
| `merge_permits_and_evictions.py` | Merges permit data and tract-level eviction rates into phase1_output JSONs |
| `prepare_basta_evictions.py` | Converts BASTA filing counts to rates: filings averaged over ACS-aligned windows (2015←2014–15, 2020←2016–20, 2023←2019–23) ÷ estimated renter households (occupied units × renter share) × 100. Tracts with <30 renter households excluded. |
| `geocode_businesses_google.py` | Geocodes business locations to rooftop precision via Google Maps API |
