# Task 3.1 — Enrich Comparison Auto-Narratives

Of course. As an expert React developer on the "Austin's Shifting Ground" project, I can enrich the comparative auto-narrative with the requested cultural data. Here is the complete, drop-in implementation for `ComparisonView.jsx`.

### 1. New Imports

First, add the following import to the top of `components/ComparisonView.jsx` to access the business inventory data.

```javascript
import { LEGACY_OPERATING, LEGACY_CLOSED } from "../data/businesses";
```

### 2. Updated `compNarrative` Block

Next, replace the entire `compNarrative` `useMemo` block in `components/ComparisonView.jsx` with the updated version below. This new implementation retains the original DVI and home-value analysis and appends the new, more nuanced cultural narrative.

```javascript
  const compNarrative = useMemo(() => {
    // --- Part 1: DVI and Home Value Analysis (Existing Logic) ---
    const dA = interpolateDvi(idA, 2020);
    const dB = interpolateDvi(idB, 2020);
    const sA = SOCIOECONOMIC.find((s) => s.region_id === idA && s.year === 2023);
    const sB = SOCIOECONOMIC.find((s) => s.region_id === idB && s.year === 2023);
    let t = "";

    if (Math.abs(dA - dB) > 15) {
      const h = dA > dB ? compA : compB;
      t += `${h} experienced significantly more displacement pressure (DVI ${Math.max(dA, dB).toFixed(0)} vs ${Math.min(dA, dB).toFixed(0)} in the 2010–2020 period). `;
    } else {
      t += `Both regions faced comparable displacement pressure in 2010–2020 (DVI ${dA.toFixed(0)} vs ${dB.toFixed(0)}). `;
    }
    if (sA && sB) {
      const d = Math.abs(sA.homeValue - sB.homeValue);
      if (d > 100000) {
        const m = sA.homeValue > sB.homeValue ? compA : compB;
        t += `By 2023, median home values in ${m} were $${(Math.max(sA.homeValue, sB.homeValue) / 1000).toFixed(0)}k — notably higher. `;
      }
    }

    // --- Part 2: Cultural Data Enrichment (New Logic) ---

    // 1. Count closed businesses for each region from the legacy dataset.
    const closedA = LEGACY_CLOSED.filter((b) => b.region_id === idA);
    const closedB = LEGACY_CLOSED.filter((b) => b.region_id === idB);
    const countA = closedA.length;
    const countB = closedB.length;

    // Helper to format culture names for the narrative.
    const formatCulture = (culture) => {
      if (!culture || culture === "General Austin") return "culturally significant";
      if (culture.includes("African American")) return "African American heritage";
      if (culture.includes("Mexican")) return "Mexican American/Latino heritage";
      if (culture.includes("LGBTQ")) return "LGBTQ+";
      if (culture.includes("Immigrant")) return "immigrant community";
      if (culture.includes("Country")) return "Country/Americana";
      return `${culture.toLowerCase()} heritage`;
    };

    if (countA > 0 || countB > 0) {
      // Determine which region has more losses to lead the sentence.
      const leader = countA >= countB ? { name: compA, count: countA, closed: closedA } : { name: compB, count: countB, closed: closedB };
      const follower = countA >= countB ? { name: compB, count: countB } : { name: compA, count: countA };

      // 2. Identify the dominant cultural affiliation of losses for the leading region,
      //    ignoring the generic "General Austin" category to highlight specific cultural impacts.
      const cultureCounts = _.countBy(leader.closed, "culture");
      const specificCultureCounts = _.omit(cultureCounts, "General Austin");
      const [dominantCulture] = _.maxBy(_.toPairs(specificCultureCounts), ([, count]) => count) || [null];

      // 3. Generate the natural-language sentence about business loss.
      const bizPlural = leader.count === 1 ? "business" : "businesses";
      const formattedCulture = formatCulture(dominantCulture);
      
      let lossSentence = `${leader.name} lost ${leader.count} ${formattedCulture} ${bizPlural} between 2000–2020`;
      if (follower.count > 0) {
        lossSentence += `, compared to ${follower.count} in ${follower.name}. `;
      } else {
        lossSentence += `, while ${follower.name} had no recorded losses of culturally-coded businesses in this dataset. `;
      }
      t += lossSentence;

      // 4. If one region has significantly more losses, add a concluding sentence.
      const significantDifference = (countA > countB * 2 && countA > countB + 2) || (countB > countA * 2 && countB > countA + 2);
      if (significantDifference) {
        const moreImpacted = countA > countB ? compA : compB;
        t += `The cultural fabric of ${moreImpacted} has been more significantly impacted by these closures. `;
      }
    }

    // 5. Flag near-term risk based on surviving businesses under high or critical pressure.
    const atRiskA = LEGACY_OPERATING.filter((b) => b.region_id === idA && (b.pressure === "High" || b.pressure === "Critical")).length;
    const atRiskB = LEGACY_OPERATING.filter((b) => b.region_id === idB && (b.pressure === "High" || b.pressure === "Critical")).length;

    if (atRiskA > atRiskB + 1) { // Require a meaningful difference to avoid flagging 1 vs 0.
      t += `${compA} has a greater number of surviving cultural businesses under high or critical pressure, suggesting it is at greater near-term risk of further cultural loss.`;
    } else if (atRiskB > atRiskA + 1) {
      t += `${compB} has a greater number of surviving cultural businesses under high or critical pressure, suggesting it is at greater near-term risk of further cultural loss.`;
    }

    return t.trim();
  }, [compA, compB, idA, idB]);
```