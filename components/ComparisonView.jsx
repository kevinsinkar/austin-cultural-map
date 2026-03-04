import { useMemo, useState } from "react";
import _ from "lodash";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SOCIOECONOMIC, DEMOGRAPHICS, LEGACY_OPERATING, LEGACY_CLOSED } from "../data";
import { REGION_NAMES, DEMO_COLORS } from "../data/constants";
import { NAME_TO_ID } from "../data/regionLookup";
import { interpolateDvi, calcAnchorDensity } from "../utils/math";
import { fmtPct } from "../utils/formatters";

export default function ComparisonView({ compA, setCompA, compB, setCompB, isMobile }) {
  const [demoMode, setDemoMode] = useState("focused"); // "focused" = Black & Hispanic, "all" = all groups
  // Resolve region_ids from names once
  const idA = NAME_TO_ID.get(compA);
  const idB = NAME_TO_ID.get(compB);

  const compDviChart = useMemo(
    () => [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023].map((yr) => ({
      year: yr,
      [compA]: interpolateDvi(idA, yr),
      [compB]: interpolateDvi(idB, yr),
    })),
    [compA, compB]
  );

  const compHomeChart = useMemo(
    () => [2000, 2010, 2020, 2023].map((yr) => {
      const a = SOCIOECONOMIC.find((s) => s.region_id === idA && s.year === yr);
      const b = SOCIOECONOMIC.find((s) => s.region_id === idB && s.year === yr);
      return { year: yr, [compA]: a?.homeValue || 0, [compB]: b?.homeValue || 0 };
    }),
    [compA, compB, idA, idB]
  );

  const compIncomeChart = useMemo(
    () => [2000, 2010, 2020, 2023].map((yr) => {
      const a = SOCIOECONOMIC.find((s) => s.region_id === idA && s.year === yr);
      const b = SOCIOECONOMIC.find((s) => s.region_id === idB && s.year === yr);
      return { year: yr, [compA]: a?.incomeAdj || 0, [compB]: b?.incomeAdj || 0 };
    }),
    [compA, compB, idA, idB]
  );

  const compDemoChart = useMemo(
    () => [1990, 2000, 2010, 2020, 2023].map((yr) => {
      const a = DEMOGRAPHICS.find((d) => d.region_id === idA && d.year === yr);
      const b = DEMOGRAPHICS.find((d) => d.region_id === idB && d.year === yr);
      return {
        year: yr,
        [`${compA}_Black`]: a?.pctBlack || 0,
        [`${compA}_Hispanic`]: a?.pctHispanic || 0,
        [`${compA}_White`]: a?.pctWhite || 0,
        [`${compA}_Asian`]: a?.pctAsian || 0,
        [`${compA}_Other`]: a?.pctOther || 0,
        [`${compB}_Black`]: b?.pctBlack || 0,
        [`${compB}_Hispanic`]: b?.pctHispanic || 0,
        [`${compB}_White`]: b?.pctWhite || 0,
        [`${compB}_Asian`]: b?.pctAsian || 0,
        [`${compB}_Other`]: b?.pctOther || 0,
      };
    }),
    [compA, compB, idA, idB]
  );

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

    // --- Part 2: Cultural Data Enrichment ---

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

    if (atRiskA > atRiskB + 1) {
      t += `${compA} has a greater number of surviving cultural businesses under high or critical pressure, suggesting it is at greater near-term risk of further cultural loss.`;
    } else if (atRiskB > atRiskA + 1) {
      t += `${compB} has a greater number of surviving cultural businesses under high or critical pressure, suggesting it is at greater near-term risk of further cultural loss.`;
    }

    return t.trim();
  }, [compA, compB, idA, idB]);

  const nameA = compA.split("/")[0].trim();
  const nameB = compB.split("/")[0].trim();

  return (
    <section aria-label="Comparison view" style={{ maxWidth: 1100 }}>
      {/* Region selectors */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        {[
          { val: compA, set: setCompA, label: "Region A", color: "#0f766e" },
          { val: compB, set: setCompB, label: "Region B", color: "#7c3aed" },
        ].map((sel, i) => (
          <div key={i} style={{ flex: "1 1 280px" }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: 4 }}>{sel.label}</label>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: 2, background: sel.color }} />
              <select
                value={sel.val}
                onChange={(e) => sel.set(e.target.value)}
                aria-label={`Select ${sel.label}`}
                style={{ width: "100%", padding: "8px 12px 8px 28px", borderRadius: 8, border: "1.5px solid #d6d3cd", background: "#fffffe", fontSize: 13, fontWeight: 500, color: "#1a1a1a", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%237c6f5e' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", minHeight: 40 }}
              >
                {REGION_NAMES.map((rn) => <option key={rn} value={rn}>{rn}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* DVI */}
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>Displacement Velocity Index</h3>
          <div style={{ height: 200 }} role="img" aria-label={`DVI comparison: ${compA} vs ${compB}`}>
            <ResponsiveContainer><LineChart data={compDviChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d6d3cd" }} />
              <Line type="monotone" dataKey={compA} stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} name={nameA} />
              <Line type="monotone" dataKey={compB} stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} name={nameB} />
            </LineChart></ResponsiveContainer>
          </div>
        </div>

        {/* Home Value */}
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>Median Home Value</h3>
          <div style={{ height: 200 }} role="img" aria-label={`Home value comparison: ${compA} vs ${compB}`}>
            <ResponsiveContainer><LineChart data={compHomeChart} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `$${(v / 1000).toFixed(0)}k`} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d6d3cd" }} />
              <Line type="monotone" dataKey={compA} stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} name={nameA} />
              <Line type="monotone" dataKey={compB} stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} name={nameB} />
            </LineChart></ResponsiveContainer>
          </div>
        </div>

        {/* Income */}
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>Median Household Income (Adj. 2023$)</h3>
          <div style={{ height: 200 }} role="img" aria-label={`Income comparison: ${compA} vs ${compB}`}>
            <ResponsiveContainer><LineChart data={compIncomeChart} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => `$${(v / 1000).toFixed(0)}k`} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d6d3cd" }} />
              <Line type="monotone" dataKey={compA} stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} name={nameA} />
              <Line type="monotone" dataKey={compB} stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} name={nameB} />
            </LineChart></ResponsiveContainer>
          </div>
        </div>

        {/* Demographics */}
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: 0 }}>
              {demoMode === "focused" ? "Black & Hispanic Population Share" : "All Groups Population Share"}
            </h3>
            <div style={{ display: "flex", background: "#edeae4", borderRadius: 6, padding: 2 }}>
              {[
                { key: "focused", label: "Black & Hispanic" },
                { key: "all", label: "All Groups" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setDemoMode(opt.key)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: demoMode === opt.key ? 600 : 400,
                    background: demoMode === opt.key ? "#fffffe" : "transparent",
                    color: demoMode === opt.key ? "#0f766e" : "#7c6f5e",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: demoMode === opt.key ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 200 }} role="img" aria-label={`Demographics comparison: ${compA} vs ${compB}`}>
            <ResponsiveContainer><LineChart data={compDemoChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
              <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d6d3cd" }} />
              {/* Region A lines — solid */}
              <Line type="monotone" dataKey={`${compA}_Black`} stroke={demoMode === "all" ? DEMO_COLORS.Black : "#0f766e"} strokeWidth={2} dot={{ r: 2.5 }} name={`${nameA} Black`} />
              <Line type="monotone" dataKey={`${compA}_Hispanic`} stroke={demoMode === "all" ? DEMO_COLORS.Hispanic : "#0f766e"} strokeWidth={2} strokeDasharray={demoMode === "all" ? undefined : "6 3"} dot={{ r: 2.5 }} name={`${nameA} Hispanic`} />
              {demoMode === "all" && (
                <>
                  <Line type="monotone" dataKey={`${compA}_White`} stroke={DEMO_COLORS.White} strokeWidth={2} dot={{ r: 2.5 }} name={`${nameA} White`} />
                  <Line type="monotone" dataKey={`${compA}_Asian`} stroke={DEMO_COLORS.Asian} strokeWidth={2} dot={{ r: 2.5 }} name={`${nameA} Asian`} />
                  <Line type="monotone" dataKey={`${compA}_Other`} stroke={DEMO_COLORS.Other} strokeWidth={2} dot={{ r: 2.5 }} name={`${nameA} Other`} />
                </>
              )}
              {/* Region B lines — dashed */}
              <Line type="monotone" dataKey={`${compB}_Black`} stroke={demoMode === "all" ? DEMO_COLORS.Black : "#7c3aed"} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5 }} name={`${nameB} Black`} />
              <Line type="monotone" dataKey={`${compB}_Hispanic`} stroke={demoMode === "all" ? DEMO_COLORS.Hispanic : "#7c3aed"} strokeWidth={2} strokeDasharray={demoMode === "all" ? "6 3" : "2 2"} dot={{ r: 2.5 }} name={`${nameB} Hispanic`} />
              {demoMode === "all" && (
                <>
                  <Line type="monotone" dataKey={`${compB}_White`} stroke={DEMO_COLORS.White} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5 }} name={`${nameB} White`} />
                  <Line type="monotone" dataKey={`${compB}_Asian`} stroke={DEMO_COLORS.Asian} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5 }} name={`${nameB} Asian`} />
                  <Line type="monotone" dataKey={`${compB}_Other`} stroke={DEMO_COLORS.Other} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5 }} name={`${nameB} Other`} />
                </>
              )}
            </LineChart></ResponsiveContainer>
          </div>
          {demoMode === "focused" ? (
            <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2px solid #0f766e" }} /><span style={{ fontSize: 10, color: "#64615b" }}>Solid = Black</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2px dashed #7c3aed" }} /><span style={{ fontSize: 10, color: "#64615b" }}>Dashed = Hispanic</span></div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              {[["White", DEMO_COLORS.White], ["Black", DEMO_COLORS.Black], ["Hispanic", DEMO_COLORS.Hispanic], ["Asian", DEMO_COLORS.Asian], ["Other", DEMO_COLORS.Other]].map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} aria-hidden="true" />
                  <span style={{ fontSize: 10, color: "#64615b" }}>{label}</span>
                </div>
              ))}
              <span style={{ fontSize: 10, color: "#a8a49c", marginLeft: 4 }}>Solid = {nameA}, Dashed = {nameB}</span>
            </div>
          )}
          <p style={{ fontSize: 10, color: "#7c6f5e", margin: "10px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
            Note: Indigenous populations are not separately tracked in Census data for these geographies. This represents a known data gap.
          </p>
        </div>
      </div>

      {/* Comparison Table */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginTop: 16 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>Side-by-Side at 2023</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} role="table" aria-label="Region comparison table">
            <thead>
              <tr style={{ borderBottom: "2px solid #e8e5e0" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600, color: "#64615b" }}>Metric</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600, color: "#0f766e" }}>{nameA}</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600, color: "#7c3aed" }}>{nameB}</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600, color: "#64615b" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const sA = SOCIOECONOMIC.find((s) => s.region_id === idA && s.year === 2023);
                const sB = SOCIOECONOMIC.find((s) => s.region_id === idB && s.year === 2023);
                const dA = DEMOGRAPHICS.find((d) => d.region_id === idA && d.year === 2023);
                const dB = DEMOGRAPHICS.find((d) => d.region_id === idB && d.year === 2023);
                if (!sA || !sB) return null;
                const ancA = calcAnchorDensity(idA);
                const ancB = calcAnchorDensity(idB);
                const fmtAnc = (v) => v != null ? `${(v * 100).toFixed(0)}%` : "—";
                return [
                  { l: "DVI (2010–20)", a: interpolateDvi(idA, 2020).toFixed(1), b: interpolateDvi(idB, 2020).toFixed(1), d: (interpolateDvi(idA, 2020) - interpolateDvi(idB, 2020)).toFixed(1) },
                  { l: "Anchor Density", a: fmtAnc(ancA), b: fmtAnc(ancB), d: ancA != null && ancB != null ? `${((ancA - ancB) * 100).toFixed(0)}pp` : "—" },
                  { l: "Income", a: `$${(sA.incomeAdj / 1000).toFixed(0)}k`, b: `$${(sB.incomeAdj / 1000).toFixed(0)}k`, d: `$${((sA.incomeAdj - sB.incomeAdj) / 1000).toFixed(0)}k` },
                  { l: "Home Value", a: `$${(sA.homeValue / 1000).toFixed(0)}k`, b: `$${(sB.homeValue / 1000).toFixed(0)}k`, d: `$${((sA.homeValue - sB.homeValue) / 1000).toFixed(0)}k` },
                  { l: "Bachelor's+", a: fmtPct(sA.pctBachelors), b: fmtPct(sB.pctBachelors), d: `${((sA.pctBachelors - sB.pctBachelors) * 100).toFixed(0)}pp` },
                  { l: "Cost-Burdened", a: fmtPct(sA.pctCostBurdened), b: fmtPct(sB.pctCostBurdened), d: `${((sA.pctCostBurdened - sB.pctCostBurdened) * 100).toFixed(0)}pp` },
                  { l: "Population", a: dA?.total?.toLocaleString() || "—", b: dB?.total?.toLocaleString() || "—", d: dA && dB ? ((dA.total - dB.total) > 0 ? "+" : "") + (dA.total - dB.total).toLocaleString() : "—" },
                  { l: "Asian %", a: dA ? fmtPct(dA.pctAsian || 0) : "—", b: dB ? fmtPct(dB.pctAsian || 0) : "—", d: dA && dB ? `${(((dA.pctAsian || 0) - (dB.pctAsian || 0)) * 100).toFixed(0)}pp` : "—" },
                  { l: "Other %", a: dA ? fmtPct(dA.pctOther || 0) : "—", b: dB ? fmtPct(dB.pctOther || 0) : "—", d: dA && dB ? `${(((dA.pctOther || 0) - (dB.pctOther || 0)) * 100).toFixed(0)}pp` : "—" },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0ede8" }}>
                    <td style={{ padding: "6px 10px", color: "#1a1a1a", fontWeight: 500 }}>{r.l}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#0f766e", fontWeight: 600 }}>{r.a}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#7c3aed", fontWeight: 600 }}>{r.b}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#64615b" }}>{r.d}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Narrative */}
      {compNarrative && (
        <div style={{ background: "#fefbf3", borderRadius: 10, border: "1px solid #e6dfc8", padding: "16px 20px", marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#b45309" strokeWidth="1.5" fill="none" /><path d="M5 8h6M8 5v6" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>Comparative Summary</span>
          </div>
          <p style={{ fontSize: 13, color: "#44403c", margin: 0, lineHeight: 1.6 }}>{compNarrative}</p>
        </div>
      )}

      <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.5, padding: "12px 4px" }}>
        Charts use synchronized axes. DVI interpolated between measurement periods. Income in 2023-adjusted dollars.
      </div>
    </section>
  );
}
