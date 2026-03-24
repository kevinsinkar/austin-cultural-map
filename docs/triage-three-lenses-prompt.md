## Task: Replace the single triage system with three toggleable prioritization lenses

### Overview

The current TriageView uses a single classification system that gates on
business anchor data — but only ~40 of 269 regions have tracked businesses.
Replace it with three prioritization lenses, each answering a different
question, all working across all 269 regions using census/ACS data.

Users toggle between the three lenses via a segmented control at the top
of the triage view. Each lens has its own scatter plot, table columns,
category definitions, and recommendation text. The DVI weight sliders
(Advanced section) remain shared across all three.

### Architecture context (see ARCHITECTURE.md)

**Files to modify:**
- `components/TriageView.jsx` — main rewrite
- `utils/math.js` — add new scoring functions

**Files to read (not modify):**
- `data/auditedDvi.js` — `AUDITED_DVI_LOOKUP` (has per-region DVI time
  series with `year` and `dvi` fields, plus `isExcluded` flag)
- `data/auditedData.js` — `DEMO_BY_RY`, `PROP_BY_RY`, `SOCIO_BY_RY`
  (Map<"regionId_year", row>) and `AUDITED_DEMO_BY_ID`,
  `AUDITED_PROP_BY_ID`, `AUDITED_SOCIO_BY_ID` (Map<id, rows[]>)
- `data/interim_demographics.js` — `DEMOGRAPHICS` array with derived
  fields: `pctBlack`, `pctHispanic`, `pctWhite`, `pctAsian`, `pctOther`
  (0–1 fractions), `popBlack`, `popHispanic`, `popWhite`, `total`,
  plus raw fields: `rent_burden_pct`, `pct_owner_occupied`,
  `pct_foreign_born`, `pct_65_and_over`, `pct_bachelors_degree_or_higher`
- `data/regionLookup.js` — `VISIBLE_REGIONS`, `getMergedIds`, `MERGE_LOOKUP`
- `data/regionIndex.js` — `REGION_INDEX` (array with `region_id`,
  `display_name`, `centroid` [lat, lng])
- `data/businesses.js` — `LEGACY_OPERATING` (41 entries), `LEGACY_CLOSED`
  (52 entries), each with `region_id`, `pressure`, `culture`, `heritage`
- `data/preservationAustin.js` — `PA_ALL` (156 entries with `lat`, `lng`,
  `type`, `year`)
- `utils/math.js` — existing: `interpolateDvi`, `calcAnchorDensity`,
  `calcAnchorPressureScore`, `getDviBandColor`
- `index.jsx` — passes `boundaryMode` to TriageView

**Data coverage:**
- Demographics: 269/269 regions (all years 1990–2023)
- Property: 209/269 regions
- Socioeconomic: 209/269 regions
- DVI: 269/269 (computed from above)
- Businesses: ~40/269 regions
- PA investments: varies by region

**Key constants used in auditedDvi.js scoring:**
- City median income: $86,000
- Affluent threshold: income > 1.5× city median AND owner-occupied > 75%
  (these are capped at DVI 20 and flagged `isExcluded`)

### Step 1: Add scoring functions to utils/math.js

Add the following exports. Each function takes a `region_id` and returns
a score object. All scoring uses data from the existing pre-indexed Maps
in auditedData.js — no new data imports needed.

```javascript
// ── Lens 1: Displacement Trajectory ──

/**
 * Compute displacement velocity and intervention window for a region.
 * Uses DVI time series from AUDITED_DVI_LOOKUP.
 *
 * @param {number} regionId
 * @returns {{ velocity, acceleration, interventionWindow, priority,
 *             dvi2023, dvi2010, dvi2000, category }}
 */
export function calcTrajectory(regionId) {
  const series = AUDITED_DVI_LOOKUP[regionId];
  if (!series || series.length === 0) return null;

  // Get DVI at key years via interpolation
  const dvi2023 = interpolateDvi(regionId, 2023);
  const dvi2010 = interpolateDvi(regionId, 2010);
  const dvi2000 = interpolateDvi(regionId, 2000);

  // Check affluence exclusion
  const dviPoint = series.find(p => p.year >= 2020) || series[series.length - 1];
  const isExcluded = dviPoint?.isExcluded ?? false;
  if (isExcluded) {
    return {
      velocity: 0, acceleration: 0, interventionWindow: 0,
      priority: 0, dvi2023, dvi2010, dvi2000,
      category: "Affluent / Appreciated",
    };
  }

  // Velocity: DVI change per year (recent period)
  const velocityRecent = (dvi2023 - dvi2010) / 13;
  const velocityPrior = (dvi2010 - dvi2000) / 10;

  // Normalize velocity: use a city-wide max of ~3.0 DVI points/year
  // as the scaling ceiling (adjustable)
  const MAX_VELOCITY = 3.0;
  const velocity = Math.max(0, Math.min(velocityRecent / MAX_VELOCITY * 100, 100));

  // Acceleration: is displacement speeding up or slowing down?
  const accelRaw = velocityRecent - velocityPrior;
  const MAX_ACCEL = 2.0;
  const acceleration = Math.max(0, Math.min(accelRaw / MAX_ACCEL * 100, 100));

  // Remaining vulnerability: what's at stake if displacement continues
  const d = DEMO_BY_RY.get(`${regionId}_2023`);
  const s = SOCIO_BY_RY.get(`${regionId}_2023`);
  const renterShare = d ? (100 - (d.pct_owner_occupied ?? 50)) / 75 : 0.5;
  const povertyNorm = s ? (s.poverty_rate ?? 0) / 30 : 0;
  const bipocShare = d ? ((d.pct_hispanic ?? 0) + (d.pct_black_non_hispanic ?? 0)) / 100 : 0;
  const rentBurdenNorm = d ? (d.rent_burden_pct ?? 0) / 55 : 0;
  const foreignBornNorm = d ? (d.pct_foreign_born ?? 0) / 40 : 0;

  const remainingVuln = Math.min(100,
    (0.30 * renterShare + 0.25 * povertyNorm + 0.20 * bipocShare
     + 0.15 * rentBurdenNorm + 0.10 * foreignBornNorm) * 100
  );

  // Intervention window: peaks in DVI 20–55 range
  let windowMultiplier;
  if (dvi2023 < 20)      windowMultiplier = dvi2023 / 20 * 0.3;  // low urgency
  else if (dvi2023 <= 55) windowMultiplier = 0.3 + 0.7 * ((dvi2023 - 20) / 35); // sweet spot
  else if (dvi2023 <= 70) windowMultiplier = 0.7;  // urgent but narrowing
  else                    windowMultiplier = 0.3;   // largely post-displacement

  const interventionWindow = Math.min(100,
    windowMultiplier * (0.5 * velocity + 0.5 * remainingVuln)
  );

  // Final priority score
  const priority = +(
    0.35 * interventionWindow +
    0.30 * velocity +
    0.20 * Math.min(dvi2023 / 80 * 100, 100) +
    0.15 * acceleration
  ).toFixed(1);

  // Category assignment
  let category;
  if (priority >= 75)      category = "Urgent — Active Window";
  else if (priority >= 55) category = "High Priority — Accelerating";
  else if (priority >= 35) category = "Emerging — Monitor Closely";
  else if (priority >= 15) category = "Stable — Low Priority";
  else                     category = "Post-Displacement or Stable";

  return {
    velocity: +velocity.toFixed(1),
    acceleration: +acceleration.toFixed(1),
    interventionWindow: +interventionWindow.toFixed(1),
    priority,
    dvi2023: +dvi2023.toFixed(1),
    dvi2010: +dvi2010.toFixed(1),
    dvi2000: +dvi2000.toFixed(1),
    category,
  };
}


// ── Lens 2: Equity-Weighted Vulnerability ──

/**
 * Compute equity-weighted priority for a region.
 * Prioritizes underrepresented heritage communities and areas with
 * low preservation investment relative to need.
 *
 * @param {number} regionId
 * @returns {{ demoVuln, econPrecarity, equityDeficit, preservationGap,
 *             priority, category }}
 */
export function calcEquityPriority(regionId) {
  const dvi = interpolateDvi(regionId, 2023);

  // Check affluence exclusion
  const series = AUDITED_DVI_LOOKUP[regionId];
  const dviPoint = series?.find(p => p.year >= 2020) || series?.[series.length - 1];
  const isExcluded = dviPoint?.isExcluded ?? false;
  if (isExcluded) {
    return {
      demoVuln: 0, econPrecarity: 0, equityDeficit: 0, preservationGap: 0,
      priority: 0, dvi, category: "Affluent / Appreciated",
    };
  }

  const d = DEMO_BY_RY.get(`${regionId}_2023`);
  const s = SOCIO_BY_RY.get(`${regionId}_2023`);
  const p = PROP_BY_RY.get(`${regionId}_2023`);

  // Demographic Vulnerability
  const rentBurden = d ? Math.min((d.rent_burden_pct ?? 0) / 55 * 100, 100) : 50;
  const renterShare = d ? Math.min((100 - (d.pct_owner_occupied ?? 50)) / 75 * 100, 100) : 50;
  const foreignBorn = d ? Math.min((d.pct_foreign_born ?? 0) / 40 * 100, 100) : 0;
  const elderly = d ? Math.min((d.pct_65_and_over ?? 0) / 25 * 100, 100) : 0;
  const demoVuln = +(0.40 * rentBurden + 0.30 * renterShare + 0.15 * foreignBorn + 0.15 * elderly).toFixed(1);

  // Economic Precarity
  const poverty = s ? Math.min((s.poverty_rate ?? 0) / 30 * 100, 100) : 0;
  const snap = s ? Math.min((s.snap_participation_rate ?? 0) / 25 * 100, 100) : 0;
  const homeValueChange = p ? Math.min((p.pct_home_value_change_yoy ?? 0) / 15 * 100, 100) : 0;
  const incomeGap = s ? Math.min((1 - (s.median_household_income ?? 86000) / 86000) * 100, 100) : 0;
  const econPrecarity = +(0.30 * poverty + 0.25 * Math.max(0, snap) + 0.25 * homeValueChange + 0.20 * Math.max(0, incomeGap)).toFixed(1);

  // Equity Deficit
  const bipocPct = d ? ((d.pct_hispanic ?? 0) + (d.pct_black_non_hispanic ?? 0)) : 0;
  const bipocScore = Math.min(bipocPct / 100 * 100, 100);

  // Heritage: check if any businesses in this region have heritage tags
  const allIds = getMergedIds(regionId);
  const regionBiz = [...LEGACY_OPERATING, ...LEGACY_CLOSED].filter(
    b => allIds.includes(b.region_id)
  );
  const hasHeritage = regionBiz.some(b =>
    b.heritage && b.heritage !== "None" && b.heritage !== ""
  );
  const heritageScore = hasHeritage ? 80 : 20;

  // East of I-35 proxy (historic segregation line)
  const regionEntry = REGION_INDEX.find(r => r.region_id === regionId);
  const centroidLng = regionEntry?.centroid?.[1] ?? -97.74;
  const eastOfI35 = centroidLng > -97.735;
  const eastScore = eastOfI35 ? 70 : 30;

  const foreignBornScore = d ? Math.min((d.pct_foreign_born ?? 0) / 40 * 100, 100) : 0;

  const equityDeficit = +(0.35 * bipocScore + 0.25 * heritageScore + 0.20 * eastScore + 0.20 * foreignBornScore).toFixed(1);

  // Preservation Gap: how much PA investment has this region received?
  const regionCentroid = regionEntry?.centroid;
  let paCount = 0;
  if (regionCentroid) {
    // Import PA_ALL at the top of math.js (add to existing imports from ../data)
    paCount = PA_ALL.filter(item => {
      const dlat = item.lat - regionCentroid[0];
      const dlng = item.lng - regionCentroid[1];
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
    }).length;
  }
  const preservationGap = +Math.max(0, 100 - paCount * 15).toFixed(1);

  // Final priority
  const normalizedDvi = Math.min(dvi / 80 * 100, 100);
  const priority = +(
    0.25 * normalizedDvi +
    0.20 * demoVuln +
    0.20 * econPrecarity +
    0.20 * equityDeficit +
    0.15 * preservationGap
  ).toFixed(1);

  let category;
  if (priority >= 75)      category = "Equity Priority — Underserved";
  else if (priority >= 55) category = "Heritage at Risk";
  else if (priority >= 35) category = "Moderate Need";
  else if (priority >= 15) category = "Lower Priority";
  else                     category = "Affluent / Appreciated";

  return { demoVuln, econPrecarity, equityDeficit, preservationGap, priority, dvi, category };
}


// ── Lens 3: Risk Matrix (Multi-Dimensional) ──

/**
 * Compute four independent risk axes for a region.
 * Returns axis scores + quadrant placement + suggested grant type.
 *
 * @param {number} regionId
 * @returns {{ marketPressure, communityVuln, culturalSig, feasibility,
 *             quadrant, grantType, category }}
 */
export function calcRiskMatrix(regionId) {
  const dvi = interpolateDvi(regionId, 2023);

  const series = AUDITED_DVI_LOOKUP[regionId];
  const dviPoint = series?.find(p => p.year >= 2020) || series?.[series.length - 1];
  const isExcluded = dviPoint?.isExcluded ?? false;
  if (isExcluded) {
    return {
      marketPressure: 0, communityVuln: 0, culturalSig: 0, feasibility: 0,
      quadrant: "Q3", grantType: "None needed", category: "Affluent / Appreciated",
    };
  }

  const d = DEMO_BY_RY.get(`${regionId}_2023`);
  const p = PROP_BY_RY.get(`${regionId}_2023`);
  const s = SOCIO_BY_RY.get(`${regionId}_2023`);

  // Axis 1: Market Displacement Pressure
  const appreciation = p ? Math.min((p.pct_home_value_change_yoy ?? 0) / 15 * 100, 100) : 0;
  const rent = p ? (p.median_rent_monthly ?? 0) : 0;
  const income = s ? (s.median_household_income ?? 30000) : 30000;
  const rentIncomeRatio = Math.min((rent * 12 / Math.max(income, 1)) / 0.50 * 100, 100);
  const giniScore = s ? Math.min((s.gini_coefficient ?? 0) / 0.55 * 100, 100) : 0;
  const permits = p ? Math.min((p.new_construction_permits ?? 0) / 500 * 100, 100) : 0;
  const marketPressure = +(0.35 * appreciation + 0.25 * rentIncomeRatio + 0.20 * permits + 0.20 * giniScore).toFixed(1);

  // Axis 2: Community Vulnerability
  const rentBurden = d ? Math.min((d.rent_burden_pct ?? 0) / 55 * 100, 100) : 50;
  const renterShare = d ? Math.min((100 - (d.pct_owner_occupied ?? 50)) / 75 * 100, 100) : 50;
  const poverty = s ? Math.min((s.poverty_rate ?? 0) / 30 * 100, 100) : 0;
  const foreignBorn = d ? Math.min((d.pct_foreign_born ?? 0) / 40 * 100, 100) : 0;
  const elderly = d ? Math.min((d.pct_65_and_over ?? 0) / 25 * 100, 100) : 0;
  const communityVuln = +(0.30 * rentBurden + 0.25 * renterShare + 0.20 * poverty + 0.15 * foreignBorn + 0.10 * elderly).toFixed(1);

  // Axis 3: Cultural Significance
  const bipocPct = d ? ((d.pct_hispanic ?? 0) + (d.pct_black_non_hispanic ?? 0)) : 0;
  const bipocScore = Math.min(bipocPct / 100 * 100, 100);

  const allIds = getMergedIds(regionId);
  const regionBiz = [...LEGACY_OPERATING, ...LEGACY_CLOSED].filter(
    b => allIds.includes(b.region_id)
  );
  const hasHeritage = regionBiz.some(b => b.heritage && b.heritage !== "None" && b.heritage !== "");
  const heritageScore = hasHeritage ? 80 : (regionBiz.length > 0 ? 40 : 0);

  // Anchor score: use actual density if available, neutral 50 if no data
  const anchorDensity = calcAnchorDensity(regionId);
  const anchorScore = anchorDensity != null ? anchorDensity * 100 : 50;

  const regionEntry = REGION_INDEX.find(r => r.region_id === regionId);
  const regionCentroid = regionEntry?.centroid;
  let paCount = 0;
  if (regionCentroid) {
    paCount = PA_ALL.filter(item => {
      const dlat = item.lat - regionCentroid[0];
      const dlng = item.lng - regionCentroid[1];
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.012;
    }).length;
  }
  const paScore = Math.min(paCount * 10, 100);

  const totalPop = d?.total_population ?? 0;
  // Population density rank would ideally be a percentile — approximate with normalization
  const popScore = Math.min(totalPop / 15000 * 100, 100);

  const culturalSig = +(0.25 * bipocScore + 0.25 * heritageScore + 0.20 * anchorScore + 0.15 * paScore + 0.15 * popScore).toFixed(1);

  // Axis 4: Intervention Feasibility
  // Sweet spot: DVI 25–55
  let dviWindowScore;
  if (dvi < 15)      dviWindowScore = 10;
  else if (dvi < 25) dviWindowScore = 10 + (dvi - 15) / 10 * 60;
  else if (dvi <= 55) dviWindowScore = 70 + (1 - Math.abs(dvi - 40) / 15) * 30;
  else if (dvi <= 70) dviWindowScore = 50;
  else                dviWindowScore = 25;

  const vacancy = p ? (p.vacancy_rate ?? 5) : 5;
  const vacancyScore = vacancy < 10 ? 80 : 40;
  const ownerOccupied = d ? (d.pct_owner_occupied ?? 50) : 50;
  const tenureMixScore = (ownerOccupied >= 20 && ownerOccupied <= 60) ? 80 : 40;
  const eviction = s ? (s.eviction_filing_rate ?? 0) : 0;
  const evictionScore = eviction < 5 ? 70 : 30;

  const feasibility = +(0.30 * dviWindowScore + 0.25 * vacancyScore + 0.25 * tenureMixScore + 0.20 * evictionScore).toFixed(1);

  // Quadrant assignment (market pressure vs community vulnerability)
  const marketHigh = marketPressure >= 50;
  const vulnHigh = communityVuln >= 50;
  let quadrant, grantType, category;

  if (marketHigh && vulnHigh) {
    quadrant = "Q1";
    category = feasibility >= 50 ? "Crisis — Fund Now" : "Crisis — Document";
    grantType = feasibility >= 50 ? "Emergency stabilization" : "Oral history & commemoration";
  } else if (marketHigh && !vulnHigh) {
    quadrant = "Q2";
    category = "Urgent — Prevent";
    grantType = "Proactive preservation";
  } else if (!marketHigh && vulnHigh) {
    quadrant = "Q4";
    category = feasibility >= 50 ? "Chronic — Invest" : "Chronic — Systemic";
    grantType = feasibility >= 50 ? "Community capacity building" : "Policy advocacy";
  } else {
    quadrant = "Q3";
    category = "Monitor";
    grantType = "No immediate action";
  }

  return {
    marketPressure, communityVuln, culturalSig, feasibility,
    quadrant, grantType, category, dvi,
  };
}
```

**Important:** Add `PA_ALL` and `REGION_INDEX` to the imports at the top
of `utils/math.js`. PA_ALL comes from `"../data"` (already partially
imported). REGION_INDEX also from `"../data"`. Also add `getMergedIds`
from `"../data/regionLookup"`.

### Step 2: Rewrite TriageView.jsx

#### Lens toggle state

```javascript
// Three prioritization lenses
const [lens, setLens] = useState("equity"); // "trajectory" | "equity" | "matrix"
```

The lens names and descriptions:
```javascript
const LENSES = [
  {
    key: "trajectory",
    label: "Trajectory",
    question: "Where is displacement accelerating fastest?",
    description: "Ranks regions by how rapidly displacement is intensifying and whether an intervention window remains open.",
  },
  {
    key: "equity",
    label: "Equity",
    question: "Which underserved communities need investment most?",
    description: "Prioritizes underrepresented heritage communities with high need and low preservation investment.",
  },
  {
    key: "matrix",
    label: "Risk Matrix",
    question: "What type of intervention does each area need?",
    description: "Plots regions across four dimensions to match areas with appropriate grant types.",
  },
];
```

#### Lens toggle UI

Place above the current triage legend:
```jsx
<div style={{ display: "flex", gap: 4, background: "#edeae4", borderRadius: 8, padding: 3, marginBottom: 16 }}>
  {LENSES.map(l => (
    <button
      key={l.key}
      onClick={() => setLens(l.key)}
      aria-current={lens === l.key ? "page" : undefined}
      style={{
        flex: 1,
        padding: "8px 14px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: lens === l.key ? 600 : 400,
        background: lens === l.key ? "#fffffe" : "transparent",
        color: lens === l.key ? "#0f766e" : "#7c6f5e",
        border: "none",
        cursor: "pointer",
        boxShadow: lens === l.key ? "0 1px 3px rgba(0,0,0,.08)" : "none",
        textAlign: "center",
        lineHeight: 1.3,
      }}
    >
      <div>{l.label}</div>
      <div style={{
        fontSize: 10,
        fontWeight: 400,
        color: lens === l.key ? "#0f766e" : "#a8a49c",
        marginTop: 2,
      }}>
        {l.question}
      </div>
    </button>
  ))}
</div>
```

Below the toggle, show the active lens description:
```jsx
<p style={{ fontSize: 12, color: "#64615b", margin: "0 0 16px", lineHeight: 1.5 }}>
  {LENSES.find(l => l.key === lens).description}
</p>
```

#### Per-lens data computation

Compute all three lenses in a single useMemo (they share the same base
region list). Each returns an array of row objects appropriate for that
lens.

```javascript
const { trajectoryData, equityData, matrixData } = useMemo(() => {
  const traj = [];
  const eq = [];
  const mat = [];

  VISIBLE_REGIONS.forEach(r => {
    const rid = r.region_id;
    const name = r.display_name;

    // Trajectory lens
    const t = calcTrajectory(rid);
    if (t) traj.push({ regionId: rid, name, ...t });

    // Equity lens
    const e = calcEquityPriority(rid);
    if (e) eq.push({ regionId: rid, name, ...e });

    // Risk Matrix lens
    const m = calcRiskMatrix(rid);
    if (m) mat.push({ regionId: rid, name, ...m });
  });

  return {
    trajectoryData: traj,
    equityData: eq,
    matrixData: mat,
  };
}, []);
```

The active dataset is:
```javascript
const activeData = lens === "trajectory" ? trajectoryData
  : lens === "equity" ? equityData : matrixData;
```

#### Per-lens categories, colors, and table columns

**Trajectory:**
```javascript
const TRAJECTORY_CATS = [
  "Urgent — Active Window",
  "High Priority — Accelerating",
  "Emerging — Monitor Closely",
  "Stable — Low Priority",
  "Post-Displacement or Stable",
  "Affluent / Appreciated",
];
const TRAJECTORY_COLORS = {
  "Urgent — Active Window": "#dc2626",
  "High Priority — Accelerating": "#ea580c",
  "Emerging — Monitor Closely": "#f59e0b",
  "Stable — Low Priority": "#16a34a",
  "Post-Displacement or Stable": "#64748b",
  "Affluent / Appreciated": "#1565C0",
};
const TRAJECTORY_COLS = [
  { key: "category", label: "Priority" },
  { key: "name", label: "Region" },
  { key: "priority", label: "Score" },
  { key: "dvi2023", label: "DVI '23" },
  { key: "velocity", label: "Velocity" },
  { key: "acceleration", label: "Accel." },
  { key: "interventionWindow", label: "Window" },
];
```

Scatter: X = DVI 2023, Y = Velocity, Size = Intervention Window, Color = Category.

**Equity:**
```javascript
const EQUITY_CATS = [
  "Equity Priority — Underserved",
  "Heritage at Risk",
  "Moderate Need",
  "Lower Priority",
  "Affluent / Appreciated",
];
const EQUITY_COLORS = {
  "Equity Priority — Underserved": "#dc2626",
  "Heritage at Risk": "#ea580c",
  "Moderate Need": "#f59e0b",
  "Lower Priority": "#16a34a",
  "Affluent / Appreciated": "#1565C0",
};
const EQUITY_COLS = [
  { key: "category", label: "Priority" },
  { key: "name", label: "Region" },
  { key: "priority", label: "Score" },
  { key: "dvi", label: "DVI" },
  { key: "equityDeficit", label: "Equity Gap" },
  { key: "econPrecarity", label: "Econ. Risk" },
  { key: "preservationGap", label: "PA Gap" },
];
```

Scatter: X = DVI, Y = Equity Deficit, Size = Preservation Gap, Color = Category.

**Risk Matrix:**
```javascript
const MATRIX_CATS = [
  "Crisis — Fund Now",
  "Crisis — Document",
  "Urgent — Prevent",
  "Chronic — Invest",
  "Chronic — Systemic",
  "Monitor",
  "Affluent / Appreciated",
];
const MATRIX_COLORS = {
  "Crisis — Fund Now": "#dc2626",
  "Crisis — Document": "#be123c",
  "Urgent — Prevent": "#ea580c",
  "Chronic — Invest": "#7c3aed",
  "Chronic — Systemic": "#6366f1",
  "Monitor": "#16a34a",
  "Affluent / Appreciated": "#1565C0",
};
const MATRIX_COLS = [
  { key: "category", label: "Action" },
  { key: "name", label: "Region" },
  { key: "marketPressure", label: "Market" },
  { key: "communityVuln", label: "Vulnerability" },
  { key: "culturalSig", label: "Cultural" },
  { key: "feasibility", label: "Feasibility" },
  { key: "grantType", label: "Grant Type" },
];
```

Scatter: X = Market Pressure, Y = Community Vulnerability, Size = Cultural
Significance, Color = Category. Add quadrant reference lines at x=50, y=50
and label the quadrants.

#### Scatter plot adaptation

The scatter plot structure stays the same (ScatterChart from recharts) but
axes and data change per lens. Build scatter data from the active dataset:

```javascript
const scatterData = useMemo(() => {
  if (lens === "trajectory") {
    return activeData.map(r => ({
      x: r.dvi2023, y: r.velocity, z: Math.max(r.interventionWindow, 10) * 3,
      name: r.name, category: r.category,
    }));
  }
  if (lens === "equity") {
    return activeData.map(r => ({
      x: r.dvi, y: r.equityDeficit, z: Math.max(r.preservationGap, 10) * 3,
      name: r.name, category: r.category,
    }));
  }
  // matrix
  return activeData.map(r => ({
    x: r.marketPressure, y: r.communityVuln, z: Math.max(r.culturalSig, 10) * 3,
    name: r.name, category: r.category,
    grantType: r.grantType,
  }));
}, [activeData, lens]);
```

Axis labels change per lens:
```javascript
const axisLabels = {
  trajectory: { x: "DVI Score (2023) →", y: "Displacement Velocity ↑" },
  equity: { x: "DVI Score →", y: "Equity Deficit ↑" },
  matrix: { x: "Market Pressure →", y: "Community Vulnerability ↑" },
};
```

For the Risk Matrix lens, add quadrant reference lines:
```jsx
{lens === "matrix" && (
  <>
    <ReferenceLine x={50} stroke="#d6d3cd" strokeDasharray="4 4" />
    <ReferenceLine y={50} stroke="#d6d3cd" strokeDasharray="4 4" />
  </>
)}
```

Import `ReferenceLine` from recharts (already imported in RegionDetailPanel,
add to TriageView imports).

#### Recommendation text

Each lens generates its own recommendation:

```javascript
const recommendation = useMemo(() => {
  const sorted = [...activeData].sort((a, b) =>
    (b.priority ?? 0) - (a.priority ?? 0)
  );
  const top5 = sorted.slice(0, 5).filter(r =>
    r.category !== "Monitor" &&
    r.category !== "Affluent / Appreciated" &&
    r.category !== "Stable — Low Priority" &&
    r.category !== "Post-Displacement or Stable"
  );

  if (top5.length === 0) {
    return "No regions currently meet the criteria for urgent intervention under this lens.";
  }

  const names = top5.map(r => r.name);
  const joined = names.length <= 2
    ? names.join(" and ")
    : names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];

  if (lens === "trajectory") {
    return `Displacement is accelerating fastest in ${joined}. These areas have open intervention windows — grants deployed now can still alter the trajectory.`;
  }
  if (lens === "equity") {
    return `${joined} have the highest equity-weighted need — significant displacement pressure combined with historically underserved heritage communities and limited preservation investment.`;
  }
  // matrix — group by grant type
  const byType = _.groupBy(top5, "grantType");
  const parts = Object.entries(byType).map(([type, regions]) =>
    `${regions.map(r => r.name).join(", ")} → ${type}`
  );
  return `Recommended interventions: ${parts.join("; ")}.`;
}, [activeData, lens]);
```

#### Table adaptation

The table columns, sort keys, and color maps switch with the lens:

```javascript
const activeCols = lens === "trajectory" ? TRAJECTORY_COLS
  : lens === "equity" ? EQUITY_COLS : MATRIX_COLS;
const activeColors = lens === "trajectory" ? TRAJECTORY_COLORS
  : lens === "equity" ? EQUITY_COLORS : MATRIX_COLORS;
const activeCats = lens === "trajectory" ? TRAJECTORY_CATS
  : lens === "equity" ? EQUITY_CATS : MATRIX_CATS;
```

The table header and body render from `activeCols` and `activeColors`
dynamically, same pattern as current.

#### Keep the DVI weight sliders

The Advanced section with DVI weight sliders stays at the bottom. The note
should be updated to explain the sliders affect the underlying DVI which
feeds into all three lenses:

```jsx
<p style={{ fontSize: 10, color: "#a8a49c", margin: "4px 0 0", lineHeight: 1.5 }}>
  DVI weights affect the underlying displacement index used by all three
  lenses. Trajectory uses DVI change over time. Equity uses DVI as one of
  five components. Risk Matrix uses DVI indirectly through market pressure
  and community vulnerability sub-scores.
</p>
```

### Step 3: Validate

1. All three lens toggles render without errors
2. All 269 visible regions appear in every lens (no filtering by business
   data availability)
3. Scatter plot axes and labels update per lens
4. Table columns update per lens
5. Sorting works on all columns in all lenses
6. Category filter dropdown updates with lens-specific categories
7. Recommendation text changes per lens and references appropriate regions
8. Risk Matrix lens shows quadrant reference lines at x=50, y=50
9. Affluent/excluded regions show as "Affluent / Appreciated" in all lenses
10. Search filter works across all lenses
11. DVI weight sliders section still renders and functions

### Implementation notes

- The scoring functions in math.js are pure and deterministic — they read
  from pre-indexed Maps that are built once at import time. No async, no
  side effects.
- All three lenses compute in a single useMemo pass over VISIBLE_REGIONS.
  With 232 regions, this is fast enough to not need memoization per lens.
- The Risk Matrix scatter plot benefits from quadrant labels. Add them as
  positioned text elements inside the chart or as annotations below. If
  recharts makes this difficult, add them as absolutely-positioned divs
  overlaid on the chart container.
- For the Risk Matrix "Grant Type" column, use a colored pill/badge
  similar to the triage category badge.
