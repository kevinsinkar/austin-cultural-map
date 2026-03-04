## GitHub Task: Refactor DVI & Triage Logic to Mitigate Data Bias

**Context:** The current `AUDITED_DVI_LOOKUP` and `TriageView` rely on scraped business data that suffers from "digital preservation bias" (over-representing internet-famous spots while missing non-digital neighborhood anchors). We need to adjust the DVI to be more predictive and the TriageView to be more skeptical of incomplete business data.

---

### Step 1: Update `auditedDvi.js`

**Instruction for AI:** "Modify `data/auditedDvi.js` to include a 'Data Confidence' multiplier and refine the weighting. If a region has high demographic vulnerability but zero business data, do not assume zero risk; instead, weight the Socioeconomic Stress higher to account for potential 'data ghosts.'"

```javascript
/** * REFACTOR: Update AUDITED_DVI_LOOKUP 
 * 1. Introduce a 'Data Confidence Score' based on source_audit fields.
 * 2. Adjust weights if Market Pressure or Socio data is missing.
 */

// Inside the year loop in auditedDvi.js:
const V = demScore(d);
const P = propScore(p, s);
const S = socioScore(s);

// New logic: Check if we have high audit confidence
const confidence = (d?.audit_confidence + (p?.audit_confidence || 0) + (s?.audit_confidence || 0)) / 3;

const parts = [];
if (V != null) parts.push({ score: V, weight: 0.35 });
if (P != null) parts.push({ score: P, weight: 0.35 });
if (S != null) parts.push({ score: S, weight: 0.30 });

// If confidence is low, boost the weight of Socioeconomic Stress (S) 
// as it often tracks displacement more reliably than property appreciation in 'data deserts'.
if (confidence < 0.5 && S != null) {
  const sPart = parts.find(p => p.score === S);
  if (sPart) sPart.weight += 0.10; 
}

```

---

### Step 2: Rework `TriageView.jsx` Logic

**Instruction for AI:**
"Rework the classification logic in `components/TriageView.jsx`. Instead of using raw `LEGACY_OPERATING` counts (which are biased), use a 'Proxy Vulnerability Score.' If a region has High DVI but Low Business Count, classify it as 'Potential Data Gap' rather than 'Safe.'"

```javascript
/** * REFACTOR: Triage Classification 
 * Move away from 'Anchor Density' as a primary metric toward 'Environmental Risk'.
 */

const getTriageCategory = (dvi, anchorCount, regionId) => {
  const isHighRisk = dvi > 55; // 'Critical' or 'Severe' bands
  
  // BIAS CHECK: If there are 0 businesses but DVI is high, 
  // it is likely a reporting gap, not a lack of culture.
  if (isHighRisk && anchorCount === 0) {
    return {
      label: "High Risk / Data Gap",
      color: "#FF9800", // Alert orange instead of Post-Displacement gray
      action: "Field Audit Required"
    };
  }

  if (isHighRisk && anchorCount > 0) return { label: "Urgent Preservation", color: "#F44336" };
  if (dvi > 35 && anchorCount > 0) return { label: "Monitor & Protect", color: "#2196F3" };
  
  return { label: "Stable", color: "#4CAF50" };
};

```

---

### Step 3: Implement Bi-Yearly Interpolation in `math.js`

**Instruction for AI:**
"Update `utils/math.js` to support bi-yearly (every 6 months) interpolation. This will allow the UI to show 'Market Shocks' between the standard ACS yearly snapshots."

```javascript
/**
 * REFACTOR: interpolateDvi
 * Allow for fractional years (e.g., 2023.5) to simulate bi-yearly reporting.
 */
export function interpolateDvi(regionId, targetYear) {
  const series = AUDITED_DVI_LOOKUP[regionId];
  if (!series) return 0;

  // Find the two surrounding years for the targetYear (e.g., 2022 and 2023)
  const prior = _.findLast(series, p => p.year <= targetYear);
  const next = _.find(series, p => p.year > targetYear);

  if (!next) return prior ? prior.dvi : 0;
  if (!prior) return next.dvi;

  // Linear interpolation for the 6-month 'mid-point'
  const t = (targetYear - prior.year) / (next.year - prior.year);
  return parseFloat((prior.dvi + t * (next.dvi - prior.dvi)).toFixed(1));
}

```

---

### Step 4: Documentation Update

**Instruction for AI:**
"Update `ARCHITECTURE.md` Section 7 (Key Domain Concepts) to explicitly mention 'Digital Preservation Bias' and how the Data Confidence Score in `auditedDvi.js` mitigates this."
