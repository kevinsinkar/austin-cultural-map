# Methodology at a Glance

Every number on this site is a census figure, a count of records, or the result of one of the formulas on this page. Each formula is followed by a table that says where each of its terms comes from. The full account, with the reasons and the limits, is in [DATA_METHODOLOGY.md](DATA_METHODOLOGY.md); section numbers (§) point there.

Under each heading a **Source** note says whether the formula is **published** (taken from research, with the place it comes from) or **this site's own** (a choice made in building the site, explained in §12.4). A published formula is established practice, not proof: the studies give no test of their thresholds against measured displacement (§12.1).

**Terms used throughout**

| Term | Meaning |
|------|---------|
| Tract | One of the 269 census tracts on the map, on 2020 boundaries |
| Region | Bastrop, Caldwell, Hays, Travis and Williamson counties together (503 tracts) |
| 2000 | The 2000 Census (tables from Summary File 1 and Summary File 3) |
| Now | The American Community Survey (ACS) 5-year survey for the year shown: 2006–2010, 2011–2015, 2016–2020 or 2020–2024 |
| Example figures | Where a figure is given as an example it is for the 2020–2024 survey |

---

## 1. The map's colors: displacement stage

A stage is decided by three tests. The method is Appendix 3 of the University of Texas study *Uprooted* (Way, Mueller, Wegmann, 2018), written for the City of Austin. It adapts Lisa Bates's 2013 study for the City of Portland, which in turn follows Lance Freeman (2005). City of Austin staff have re-run it in 2019, 2020, 2021 and 2024. Code: `scripts/build_stages.mjs`. Detail: §3.

### 1.1 The five vulnerability shares

**Source: published.** Four of the shares are from Bates (2013); the UT study added children in poverty. *Uprooted*, Appendix 3, Vulnerability, step 1.

```
share = part ÷ whole × 100
```

| Share | Part | Whole | 2000 table | ACS table |
|-------|------|-------|------------|-----------|
| People of color | All residents − white non-Hispanic residents | All residents | SF1 P001, P004 | B03002 |
| Households that rent | Renter-occupied homes | Occupied homes | SF1 H004 | B25003 |
| Lower-income households | Households under the low-income line (1.2) | All households | SF3 P052 | B19001 |
| Children in poverty | People under 18 below the poverty line | People under 18 with a poverty status | SF3 P087 | B17001 |
| Adults without a bachelor's degree | Adults 25+ − adults 25+ with a four-year degree or more | Adults 25+ | SF3 P037 | B15002 |

A share is not computed when the whole is under 50.

### 1.2 The low-income line

**Source: published.** The 80% line is the one Bates and the UT study use. **Source: this site's own.** Counting the households under it from income brackets; both studies took the count from HUD (§12.4).

```
line             = 0.8 × the region's median family income
households under = every income bracket wholly under the line
                 + (bracket the line falls in) × (line − bracket floor) ÷ (bracket ceiling − bracket floor)
```

| Term | Data |
|------|------|
| Region's median family income | ACS B19113 for the Austin metropolitan area: $71,602 (2006–2010), $78,997 (2011–2015), $100,215 (2016–2020), $126,591 (2020–2024). For 2000, the five counties' medians (SF3 P077) weighted by their number of families (P076): $59,196 |
| Income brackets | Households by income, 16 brackets: SF3 P052, ACS B19001 |

### 1.3 Comparing a tract with the region

**Source: published.** *Uprooted*, Appendix 3, Vulnerability, step 3, term for term. Comparing with the region and using z-scores are the UT study's changes to Bates, who used fixed citywide thresholds.

```
z      = (figure in the tract − figure in the region) ÷ spread
spread = √( Σ wᵢ × (figureᵢ − figure in the region)²  ÷  ( (n − 1) ÷ n × Σ wᵢ ) )
```

| Term | Data |
|------|------|
| Figure in the region | The same share worked out on the region's totals (all 503 tracts added up) |
| figureᵢ, wᵢ | The figure in each of the region's tracts, and that tract's "whole" from 1.1 (residents, homes, households, children or adults) |
| n | The number of tracts with a figure |

"Well above the region" means **z above 0.5**.

### 1.4 Test 1: vulnerable residents

**Source: published.** *Uprooted*, Appendix 3, Vulnerability, step 4. Bates's rule was 3 of 4.

```
vulnerable = (number of the five shares with z above 0.5) is 3 or more
```

| Share | Region | Line a tract must pass |
|-------|--------|------------------------|
| People of color | 51.3% | 60.9% |
| Households that rent | 41.7% | 55.2% |
| Lower-income households | 50.3% | 59.5% |
| Children in poverty | 11.1% | 18.5% |
| Adults without a bachelor's degree | 49.1% | 58.7% |

### 1.5 Test 2: demographic change since 2000

**Source: published.** *Uprooted*, Appendix 3, Demographic Change, steps 6 to 8. The four measures are Bates's, with family income in place of household income.

```
change (shares) = share now − share in 2000                      in percentage points
change (income) = (income now − income in 2000) ÷ income in 2000 × 100      in percent
z               = (change in the tract − change in the region) ÷ spread of the tracts' changes
changed         = at least 2 of the 4 z are above 0.5, and the 4 z average 0.5 or more
```

| Measure | 2000 table | ACS table | Region's change | Line a tract must pass |
|---------|------------|-----------|-----------------|------------------------|
| Households that own | SF1 H004 | B25003 | 0.0 points | +10.0 points |
| White, non-Hispanic residents | SF1 P004 | B03002 | −12.0 points | −3.4 points |
| Adults with a bachelor's degree | SF3 P037 | B15002 | +14.3 points | +21.3 points |
| Median family income | SF3 P077 | B19113 | +114% | +150% |

Income is in dollars of each year. The spread is weighted as in 1.3.

### 1.6 Test 3: housing market

**Source: published.** Bates (2013), Appendix A; *Uprooted*, Appendix 3, Housing Market Change, steps 5 and 6, including the rent fallback. **Source: this site's own.** Testing "appreciated" on the 2000 value; the studies describe it with 1990 (§12.4).

```
rise = (value now − value in 2000) ÷ value in 2000 × 100
high = above the 60th percentile of the scored tracts on this map
```

| Term | Data | 60th percentile |
|------|------|-----------------|
| Value in 2000 | Median home value, SF3 H085 | $134,660 |
| Value now | Median home value, ACS B25077 | $626,040 |
| Rise | From the two values | +374% |
| Fallback | Median gross rent (SF3 H063, ACS B25064) where a tract has fewer than 50 owner homes in either year | $809, $1,831, +134% |

| Pattern | Value in 2000 | Value now | Rise | And |
|---------|---------------|-----------|------|-----|
| Accelerating | any | not high | high | |
| Appreciated | not high | high | high | |
| Adjacent | not high | any | not high | touches a tract whose value now or rise is high |

### 1.7 The stage

**Source: published.** Rows 1 and 3 to 7 are Table 1 of Bates (2013), which the UT study follows and the City of Austin's 2022 file applies exactly. The sources word the continued-loss row three ways; this site uses the reading the City's results show in use (§12.2). **Source: this site's own.** Rows 2 and 8 (§3.2).

| Stage on the map | Vulnerable (1.4) | Changed (1.5) | Housing (1.6) |
|------------------|------------------|---------------|---------------|
| Vulnerable | yes | no | adjacent |
| Vulnerable | yes | any other combination | any other combination |
| Early | yes | no | accelerating |
| Early | yes | yes | adjacent |
| Dynamic | yes | yes | accelerating |
| Late | yes | yes | appreciated |
| Continued loss | no | yes, or white share and bachelor's share both up | appreciated |
| Continued loss | no, but yes in 2000 | yes | accelerating |
| No stage | no | anything else | anything else |

A stage is a category: it is never averaged and never interpolated between years.

### 1.8 Places that are not scored

**Source: this site's own.** The UT study left out five tracts by hand. The 500 and the one-half are round numbers, not figures from research (§12.4).

```
not scored = residents under 500
          or college students ÷ residents is 50% or more
          or residents in group quarters ÷ residents is 50% or more
          or fewer than 3 of the 5 shares can be computed
```

| Term | 2000 table | ACS table |
|------|------------|-----------|
| College students | SF3 P036 | B14001 |
| Group quarters | SF1 P027 | B26001 |

### 1.9 Earlier years on today's tract boundaries

**Source: published.** The arithmetic is *Uprooted*, Appendix 3, Demographic Change, steps 4 and 5. **Source: this site's own.** Which crosswalk files are used (§12.4).

```
count on today's tract  = Σ (count in an earlier tract × share of that tract inside today's tract)
median on today's tract = Σ (median × weight) ÷ Σ weight
```

| Term | Data |
|------|------|
| Share of a 2000 tract | Census Bureau 2000–2010 relationship file: share of the 2000 tract's population (for counts of people) or housing units (for counts of homes) |
| Share of a 2010 tract | Census Bureau 2010–2020 relationship file: share of the 2010 tract's land area |
| Weight for a median | The families, owner homes or renter homes the earlier tract contributes |

Shares are taken after the counts are carried.

### 1.10 Neighborhoods

**Source: this site's own.** The studies work at tract level only (§3.5, §12.4).

```
count in the neighborhood  = Σ counts of its tracts          then the three tests are run on the totals
median in the neighborhood = Σ (median × residents) ÷ Σ residents
```

### 1.11 The check against the City of Austin's map

**Source: this site's own.** The City's data is published; the comparison is this site's.

```
agreement = tracts where this site and the City agree ÷ tracts both have a reading for
```

| Compared | Result |
|----------|--------|
| Vulnerable, yes or no | 223 of 260 (86%) |
| Stage | 174 of 235 (74%) |

Data: City of Austin, *Displacement Risk Areas 2022* (data.austintexas.gov, dataset `t8nv-zcp9`), set against this site's 2020–2024 reading. §3.6.

---

## 2. Figures beside the stage (place panel and story card)

### 2.1 Change in Black and Hispanic residents

**Source: this site's own.** A plain difference between two census shares. The published test uses the white non-Hispanic share (§12.4).

```
change = (Black + Hispanic share in the later year) − (Black + Hispanic share in the earlier year)     in percentage points
```

| Term | Data |
|------|------|
| Shares | Black non-Hispanic and Hispanic residents ÷ all residents, from the 2000 and 2010 Census counts and ACS table B03002, as stored in `data/phase1_output/audited_demographics_normalized.json` (§1.1) |
| Years | Earlier: 2000, or 2010 where a tract has no 2000 figure. Later: 2024, or 2020 |

### 2.2 Renters and rent burden

**Source: standard definitions.** The 50% line is the highest band the Census Bureau publishes in table B25070 (§12.3).

```
renter share = 100 − (owner-occupied homes ÷ occupied homes × 100)
rent burden  = renters paying 50% or more of income on rent ÷ renters × 100
```

| Term | Data |
|------|------|
| Owner-occupied and occupied homes | SF1 H004 (2000, 2010), ACS B25003 |
| Rent as a share of income | ACS B25070 |

### 2.3 Economics on the story card

**Source: this site's own.** Plain arithmetic on census figures.

```
change (dollars) = (latest value − earliest value) ÷ earliest value × 100      in percent
change (rates)   = latest value − earliest value                               in percentage points
```

| Figure | Data |
|--------|------|
| Median household income | ACS B19013 |
| Median home value, median rent | ACS B25077, B25064 |
| Poverty rate | ACS B17001 |
| Unemployment | ACS B23025 |
| SNAP participation | ACS B22003 |
| Eviction filing rate | BASTA Austin filings, Travis County, 2014–2025 |

Dollar figures are in dollars of each year; they are not adjusted for inflation. For a neighborhood, each figure is the average of its tracts weighted by residents, and a year is shown only when every tract has a value.

### 2.4 Preservation Austin listings "nearby"

**Source: this site's own.** The 0.012 degrees is not from research. §12.4 shows how the counts move with the radius.

```
nearby = √( (listing latitude − tract center latitude)² + (listing longitude − tract center longitude)² ) is under 0.012 degrees
```

| Term | Data |
|------|------|
| Listings | Preservation Austin's published grants, merit awards, Legacy Business Month listings and advocacy milestones, compiled in `data/preservationAustin.js` (181). Listings filed as citywide (19), and one whose location is not published, are not counted as near any place |
| Tract center | The center point of the tract's shape, `data/regionIndex.js` |

0.012 degrees is about 1.3 km.

### 2.5 Legacy businesses

A count of the businesses this site tracks inside the place, open and closed (`data/businesses.js`: 46 open, 60 closed). A business counts toward the census tract its street address is in, as the Census Bureau's geocoder assigns it; 13 records have no confirmed address and keep an approximate place. Most tracts have none tracked, which reflects where inventories were done (§1.2).

<!-- presenter-tools -->

---

## 3. Presenter tools

These views are not part of the public site.

### 3.1 Triage lenses

**Source: this site's own.** The shift index reuses the published rule of 1.5 on a later pair of surveys; the published rule was written for change since 2000. Choosing surveys that do not overlap follows Census Bureau guidance (§12.3, §12.4).

Each lens puts every tract in a group by a rule. There is no composite score. Code: `utils/lenses.js`. Detail: §6.

```
shift index   = (z owners + z white + z bachelor's + z income) ÷ 4
                each z as in 1.5, with change measured from the 2011–2015 survey to the 2020–2024 survey
shifted       = at least 2 of the 4 z are above 0.5, and the index is 0.5 or more
change index  = the same average, with change measured from 2000 (the z of 1.5)
recent rise   = (value now − value in 2011–2015) ÷ value in 2011–2015 × 100
rank of rise  = (scored tracts with a smaller rise since 2000) ÷ (scored tracts − 1) × 100
```

| Term | Data | Example figures |
|------|------|-----------------|
| Owners, white, bachelor's, income | ACS B25003, B03002, B15002, B19113, 2011–2015 and 2020–2024 | Region: +0.3, −4.9, +9.3 points and +60%. Lines: +6.8, +1.0, +14.7 points and +84% |
| Value | ACS B25077; B25064 where fewer than 50 homes are owned | "Fast" recent rise: above +155% (home values) or +67% (rents) |
| Rank of rise | The rise of 1.6 | Above 60 is "high" |

| Lens | Group rule uses |
|------|-----------------|
| Trajectory | The stage now, the stage in the 2011–2015 survey, and "shifted" |
| Equity | The stage now, and whether any listing is nearby (2.4) |
| Matrix | Vulnerable now (1.4), vulnerable in 2000, and whether the rise since 2000 is high (1.6) |

### 3.2 Pressure score (Compare view)

**Source: this site's own.** The weights and ceilings were set by judgment. No source is recorded for them (§12.4).

A 0–100 summary of present-day conditions. It is not a stage and no longer colors the map. Code: `data/auditedDvi.js`. Detail: §3.8.

```
score       = 0.35 × demographic + 0.35 × market + 0.30 × socioeconomic
demographic = 0.5 × cap(rent burden ÷ 55) + 0.3 × cap(renter share ÷ 75) + 0.2 × cap(foreign-born share ÷ 40)
market      = 0.5 × cap(yearly rise in home value ÷ 15) + 0.5 × cap((monthly rent × 12 ÷ household income) ÷ 0.50)
socioeconomic = 0.4 × cap(poverty rate ÷ 30) + 0.3 × cap(unemployment ÷ 15) + 0.3 × cap(eviction filing rate ÷ 10)
cap(x)      = x × 100, held between 0 and 100
```

| Term | Data |
|------|------|
| Rent burden, renter share | 2.2 |
| Foreign-born share | ACS B05002 |
| Yearly rise in home value | (value − value at the previous data year) ÷ value at the previous data year ÷ years between × 100, from ACS B25077 |
| Monthly rent, household income | ACS B25064, B19013 |
| Poverty rate, unemployment | ACS B17001, B23025 |
| Eviction filing rate | BASTA Austin |

A missing term is left out and the remaining weights are scaled up to sum to 1. A tract-year with fewer than 3 of the 8 terms gets no score. Where the data files rate their own confidence below one half, the socioeconomic weight is raised by 0.10 before scaling. A tract with household income over $129,000 and more than 75% owner-occupied homes is capped at 20.

### 3.3 Anchor density (Compare view)

**Source: this site's own.**

```
anchor density = open tracked businesses ÷ (open + closed tracked businesses)
```

Data: `data/businesses.js`.
