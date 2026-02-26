import { useMemo } from "react";
import _ from "lodash";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { REGIONS_GEOJSON, SOCIOECONOMIC, DEMOGRAPHICS } from "../data";
import { REGION_NAMES } from "../data/constants";
import { interpolateDvi } from "../utils/math";
import { fmtPct } from "../utils/formatters";

export default function ComparisonView({ compA, setCompA, compB, setCompB, isMobile }) {
  const compDviChart = useMemo(
    () => [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2023].map((yr) => ({
      year: yr,
      [compA]: interpolateDvi(compA, yr),
      [compB]: interpolateDvi(compB, yr),
    })),
    [compA, compB]
  );

  const compHomeChart = useMemo(
    () => [2000, 2010, 2020, 2023].map((yr) => {
      const a = SOCIOECONOMIC.find((s) => s.region === compA && s.year === yr);
      const b = SOCIOECONOMIC.find((s) => s.region === compB && s.year === yr);
      return { year: yr, [compA]: a?.homeValue || 0, [compB]: b?.homeValue || 0 };
    }),
    [compA, compB]
  );

  const compIncomeChart = useMemo(
    () => [2000, 2010, 2020, 2023].map((yr) => {
      const a = SOCIOECONOMIC.find((s) => s.region === compA && s.year === yr);
      const b = SOCIOECONOMIC.find((s) => s.region === compB && s.year === yr);
      return { year: yr, [compA]: a?.incomeAdj || 0, [compB]: b?.incomeAdj || 0 };
    }),
    [compA, compB]
  );

  const compDemoChart = useMemo(
    () => [1990, 2000, 2010, 2020, 2023].map((yr) => {
      const a = DEMOGRAPHICS.find((d) => d.region === compA && d.year === yr);
      const b = DEMOGRAPHICS.find((d) => d.region === compB && d.year === yr);
      return {
        year: yr,
        [`${compA}_Black`]: a?.pctBlack || 0,
        [`${compA}_Hispanic`]: a?.pctHispanic || 0,
        [`${compB}_Black`]: b?.pctBlack || 0,
        [`${compB}_Hispanic`]: b?.pctHispanic || 0,
      };
    }),
    [compA, compB]
  );

  const compNarrative = useMemo(() => {
    const dA = interpolateDvi(compA, 2020);
    const dB = interpolateDvi(compB, 2020);
    const sA = SOCIOECONOMIC.find((s) => s.region === compA && s.year === 2023);
    const sB = SOCIOECONOMIC.find((s) => s.region === compB && s.year === 2023);
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
    return t;
  }, [compA, compB]);

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
          <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>Black & Hispanic Population Share</h3>
          <div style={{ height: 200 }} role="img" aria-label={`Demographics comparison: ${compA} vs ${compB}`}>
            <ResponsiveContainer><LineChart data={compDemoChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
              <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #d6d3cd" }} />
              <Line type="monotone" dataKey={`${compA}_Black`} stroke="#0f766e" strokeWidth={2} dot={{ r: 2.5 }} name={`${nameA} Black`} />
              <Line type="monotone" dataKey={`${compA}_Hispanic`} stroke="#0f766e" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5 }} name={`${nameA} Hispanic`} />
              <Line type="monotone" dataKey={`${compB}_Black`} stroke="#7c3aed" strokeWidth={2} dot={{ r: 2.5 }} name={`${nameB} Black`} />
              <Line type="monotone" dataKey={`${compB}_Hispanic`} stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5 }} name={`${nameB} Hispanic`} />
            </LineChart></ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2px solid #0f766e" }} /><span style={{ fontSize: 10, color: "#64615b" }}>Solid = Black</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2px dashed #7c3aed" }} /><span style={{ fontSize: 10, color: "#64615b" }}>Dashed = Hispanic</span></div>
          </div>
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
                const sA = SOCIOECONOMIC.find((s) => s.region === compA && s.year === 2023);
                const sB = SOCIOECONOMIC.find((s) => s.region === compB && s.year === 2023);
                const dA = DEMOGRAPHICS.find((d) => d.region === compA && d.year === 2023);
                const dB = DEMOGRAPHICS.find((d) => d.region === compB && d.year === 2023);
                if (!sA || !sB) return null;
                return [
                  { l: "DVI (2010–20)", a: interpolateDvi(compA, 2020).toFixed(1), b: interpolateDvi(compB, 2020).toFixed(1), d: (interpolateDvi(compA, 2020) - interpolateDvi(compB, 2020)).toFixed(1) },
                  { l: "Income", a: `$${(sA.incomeAdj / 1000).toFixed(0)}k`, b: `$${(sB.incomeAdj / 1000).toFixed(0)}k`, d: `$${((sA.incomeAdj - sB.incomeAdj) / 1000).toFixed(0)}k` },
                  { l: "Home Value", a: `$${(sA.homeValue / 1000).toFixed(0)}k`, b: `$${(sB.homeValue / 1000).toFixed(0)}k`, d: `$${((sA.homeValue - sB.homeValue) / 1000).toFixed(0)}k` },
                  { l: "Bachelor's+", a: fmtPct(sA.pctBachelors), b: fmtPct(sB.pctBachelors), d: `${((sA.pctBachelors - sB.pctBachelors) * 100).toFixed(0)}pp` },
                  { l: "Cost-Burdened", a: fmtPct(sA.pctCostBurdened), b: fmtPct(sB.pctCostBurdened), d: `${((sA.pctCostBurdened - sB.pctCostBurdened) * 100).toFixed(0)}pp` },
                  { l: "Population", a: dA?.total?.toLocaleString() || "—", b: dB?.total?.toLocaleString() || "—", d: dA && dB ? ((dA.total - dB.total) > 0 ? "+" : "") + (dA.total - dB.total).toLocaleString() : "—" },
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
