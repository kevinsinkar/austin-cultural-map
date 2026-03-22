import { useState, useMemo, useCallback } from "react";
import _ from "lodash";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis, Cell, ReferenceLine,
} from "recharts";
import { VISIBLE_REGIONS } from "../data/regionLookup";
import {
  calcTrajectory, calcEquityPriority, calcRiskMatrix,
  getDviBandColor,
} from "../utils/math";

// ── Default DVI sub-index weights ──
const DEFAULT_WEIGHTS = { demographic: 0.35, market: 0.35, socioeconomic: 0.30 };

// ── Lens definitions ──
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

// ── Per-lens categories, colors, columns ──
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

const AXIS_LABELS = {
  trajectory: { x: "DVI Score (2023) \u2192", y: "Displacement Velocity \u2191" },
  equity: { x: "DVI Score \u2192", y: "Equity Deficit \u2191" },
  matrix: { x: "Market Pressure \u2192", y: "Community Vulnerability \u2191" },
};

// ── Component ──

export default function TriageView({ boundaryMode }) {
  const [lens, setLens] = useState("equity");
  const [sortCol, setSortCol] = useState("priority");
  const [sortDir, setSortDir] = useState("desc");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const handleWeightChange = useCallback((key, newVal) => {
    setWeights((prev) => {
      const clamped = Math.max(0, Math.min(1, newVal));
      const remaining = 1 - clamped;
      const otherKeys = Object.keys(prev).filter((k) => k !== key);
      const otherSum = otherKeys.reduce((s, k) => s + prev[k], 0);
      const next = { ...prev, [key]: clamped };
      if (otherSum > 0) {
        for (const k of otherKeys) next[k] = +(remaining * (prev[k] / otherSum)).toFixed(3);
      } else {
        for (const k of otherKeys) next[k] = +(remaining / otherKeys.length).toFixed(3);
      }
      return next;
    });
  }, []);

  const resetWeights = useCallback(() => setWeights({ ...DEFAULT_WEIGHTS }), []);

  // ── Compute all three lenses in one pass ──
  const { trajectoryData, equityData, matrixData } = useMemo(() => {
    const traj = [];
    const eq = [];
    const mat = [];

    VISIBLE_REGIONS.forEach(r => {
      const rid = r.region_id;
      const name = r.display_name;

      const t = calcTrajectory(rid);
      if (t) traj.push({ regionId: rid, name, ...t });

      const e = calcEquityPriority(rid);
      if (e) eq.push({ regionId: rid, name, ...e });

      const m = calcRiskMatrix(rid);
      if (m) mat.push({ regionId: rid, name, ...m });
    });

    return { trajectoryData: traj, equityData: eq, matrixData: mat };
  }, []);

  const activeData = lens === "trajectory" ? trajectoryData
    : lens === "equity" ? equityData : matrixData;
  const activeCols = lens === "trajectory" ? TRAJECTORY_COLS
    : lens === "equity" ? EQUITY_COLS : MATRIX_COLS;
  const activeColors = lens === "trajectory" ? TRAJECTORY_COLORS
    : lens === "equity" ? EQUITY_COLORS : MATRIX_COLORS;
  const activeCats = lens === "trajectory" ? TRAJECTORY_CATS
    : lens === "equity" ? EQUITY_CATS : MATRIX_CATS;

  // ── Scatter plot data ──
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
    return activeData.map(r => ({
      x: r.marketPressure, y: r.communityVuln, z: Math.max(r.culturalSig, 10) * 3,
      name: r.name, category: r.category, grantType: r.grantType,
    }));
  }, [activeData, lens]);

  // ── Filtering & Sorting ──
  const sorted = useMemo(() => {
    let data = [...activeData];
    if (filterCategory !== "all") {
      data = data.filter(r => r.category === filterCategory);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      data = data.filter(r => r.name.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      let va, vb;
      if (sortCol === "category") {
        va = activeCats.indexOf(a.category);
        vb = activeCats.indexOf(b.category);
      } else if (sortCol === "name" || sortCol === "grantType") {
        va = a[sortCol] ?? "";
        vb = b[sortCol] ?? "";
      } else {
        va = a[sortCol] ?? -Infinity;
        vb = b[sortCol] ?? -Infinity;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [activeData, sortCol, sortDir, searchTerm, filterCategory, activeCats]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "name" || col === "category" || col === "grantType" ? "asc" : "desc"); }
  };

  const sortIcon = (col) => {
    if (sortCol !== col) return " \u21C5";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  // Reset filter when switching lenses
  const handleLensChange = (key) => {
    setLens(key);
    setFilterCategory("all");
    setSortCol("priority");
    setSortDir("desc");
  };

  // ── Recommendation text ──
  const recommendation = useMemo(() => {
    const sorted = [...activeData].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
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
      return `Displacement is accelerating fastest in ${joined}. These areas have open intervention windows \u2014 grants deployed now can still alter the trajectory.`;
    }
    if (lens === "equity") {
      return `${joined} have the highest equity-weighted need \u2014 significant displacement pressure combined with historically underserved heritage communities and limited preservation investment.`;
    }
    const byType = _.groupBy(top5, "grantType");
    const parts = Object.entries(byType).map(([type, regions]) =>
      `${regions.map(r => r.name).join(", ")} \u2192 ${type}`
    );
    return `Recommended interventions: ${parts.join("; ")}.`;
  }, [activeData, lens]);

  // ── Scatter tooltip ──
  const ScatterTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#fffffe", border: "1px solid #d6d3cd", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1a1a1a", boxShadow: "0 2px 8px rgba(0,0,0,.1)", maxWidth: 240 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
        <div>X: <strong>{d.x?.toFixed(1)}</strong></div>
        <div>Y: <strong>{d.y?.toFixed(1)}</strong></div>
        {d.grantType && <div style={{ marginTop: 4, fontSize: 11, color: "#7c6f5e" }}>{d.grantType}</div>}
        <div style={{ color: activeColors[d.category], fontWeight: 600, marginTop: 4 }}>{d.category}</div>
      </div>
    );
  };

  return (
    <section aria-label="Grant triage view">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 22, fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px" }}>
          Grant Triage &amp; Prioritization
        </h2>
        <p style={{ fontSize: 13, color: "#64615b", margin: 0, lineHeight: 1.5 }}>
          Which neighborhoods should receive preservation grants this year? Three lenses for analyzing displacement risk across all {activeData.length} regions.
        </p>
      </div>

      {/* Lens toggle */}
      <div style={{ display: "flex", gap: 4, background: "#edeae4", borderRadius: 8, padding: 3, marginBottom: 16 }}>
        {LENSES.map(l => (
          <button
            key={l.key}
            onClick={() => handleLensChange(l.key)}
            aria-current={lens === l.key ? "page" : undefined}
            style={{
              flex: 1, padding: "8px 14px", borderRadius: 6, fontSize: 12,
              fontWeight: lens === l.key ? 600 : 400,
              background: lens === l.key ? "#fffffe" : "transparent",
              color: lens === l.key ? "#0f766e" : "#7c6f5e",
              border: "none", cursor: "pointer",
              boxShadow: lens === l.key ? "0 1px 3px rgba(0,0,0,.08)" : "none",
              textAlign: "center", lineHeight: 1.3,
            }}
          >
            <div>{l.label}</div>
            <div style={{ fontSize: 10, fontWeight: 400, color: lens === l.key ? "#0f766e" : "#a8a49c", marginTop: 2 }}>
              {l.question}
            </div>
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#64615b", margin: "0 0 16px", lineHeight: 1.5 }}>
        {LENSES.find(l => l.key === lens).description}
      </p>

      {/* Category legend with counts */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {activeCats.map(cat => {
          const count = activeData.filter(r => r.category === cat).length;
          if (count === 0) return null;
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: activeColors[cat] }} />
              <span style={{ fontSize: 11, color: "#64615b", fontWeight: 500 }}>{cat} ({count})</span>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          type="text" placeholder="Search regions..." value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1.5px solid #d6d3cd", background: "#fffffe", color: "#1a1a1a", fontSize: 12, minWidth: 200, minHeight: 32, outline: "none" }}
          aria-label="Filter regions by name"
        />
        <select
          value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1.5px solid #d6d3cd", background: "#fffffe", color: "#1a1a1a", fontSize: 12, minHeight: 32, cursor: "pointer" }}
          aria-label="Filter by category"
        >
          <option value="all">All Categories</option>
          {activeCats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "#a8a49c" }}>
          Showing {sorted.length} of {activeData.length}
        </span>
      </div>

      {/* Scatter Plot */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginBottom: 16 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>
          {lens === "trajectory" ? "Displacement Velocity vs. DVI" : lens === "equity" ? "Equity Deficit vs. DVI" : "Market Pressure vs. Community Vulnerability"}
        </h3>
        <div style={{ width: "100%", height: 340 }} role="img" aria-label={`Scatter plot for ${lens} lens`}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis
                type="number" dataKey="x" tick={{ fontSize: 11, fill: "#7c6f5e" }} tickLine={false}
                label={{ value: AXIS_LABELS[lens].x, position: "insideBottomRight", offset: -5, fontSize: 11, fill: "#a8a49c" }}
                domain={[0, lens === "matrix" ? 100 : 80]}
              />
              <YAxis
                type="number" dataKey="y" tick={{ fontSize: 10, fill: "#a8a49c" }} tickLine={false} axisLine={false}
                label={{ value: AXIS_LABELS[lens].y, angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#a8a49c" }}
                domain={[0, 100]}
              />
              <ZAxis type="number" dataKey="z" range={[60, 400]} />
              {lens === "matrix" && (
                <>
                  <ReferenceLine x={50} stroke="#d6d3cd" strokeDasharray="4 4" />
                  <ReferenceLine y={50} stroke="#d6d3cd" strokeDasharray="4 4" />
                </>
              )}
              <Tooltip content={<ScatterTooltip />} />
              <Scatter data={scatterData}>
                {scatterData.map((entry, i) => (
                  <Cell key={i} fill={activeColors[entry.category]} fillOpacity={0.8} stroke={activeColors[entry.category]} strokeWidth={1} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p style={{ fontSize: 10, color: "#a8a49c", margin: "8px 0 0", lineHeight: 1.4 }}>
          {lens === "trajectory" && "Dot size = intervention window score. Upper-right = fast displacement with open window for intervention."}
          {lens === "equity" && "Dot size = preservation gap (larger = less PA investment). Upper-right = high displacement with underserved communities."}
          {lens === "matrix" && "Dot size = cultural significance. Quadrant lines at 50. Q1 (upper-right) = crisis. Q2 (lower-right) = urgent prevention. Q4 (upper-left) = chronic underinvestment."}
        </p>
      </div>

      {/* Table */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px", marginBottom: 16 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 12px" }}>
          {lens === "trajectory" ? "Trajectory Rankings" : lens === "equity" ? "Equity Priority Rankings" : "Risk Matrix Rankings"}
        </h3>
        <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} role="table" aria-label="Triage table">
            <thead>
              <tr style={{ borderBottom: "2px solid #e8e5e0" }}>
                {activeCols.map(col => (
                  <th
                    key={col.key} onClick={() => toggleSort(col.key)}
                    style={{
                      textAlign: col.key === "name" || col.key === "category" || col.key === "grantType" ? "left" : "right",
                      padding: "6px 8px", fontWeight: 600, color: "#64615b", cursor: "pointer",
                      whiteSpace: "nowrap", userSelect: "none", fontSize: 11,
                    }}
                  >
                    {col.label}
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{sortIcon(col.key)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.regionId} style={{ borderBottom: "1px solid #f0ede8" }}>
                  {activeCols.map(col => {
                    const val = r[col.key];
                    if (col.key === "category") {
                      return (
                        <td key={col.key} style={{ padding: "6px 8px" }}>
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, color: "#fff", background: activeColors[val], whiteSpace: "nowrap" }}>
                            {val}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "name") {
                      return <td key={col.key} style={{ padding: "6px 8px", fontWeight: 500, color: "#1a1a1a", whiteSpace: "nowrap" }}>{val}</td>;
                    }
                    if (col.key === "grantType") {
                      return (
                        <td key={col.key} style={{ padding: "6px 8px" }}>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 4, background: "#f5f0ea", color: "#7c6f5e", whiteSpace: "nowrap" }}>
                            {val}
                          </span>
                        </td>
                      );
                    }
                    // Numeric columns
                    const isDvi = col.key === "dvi" || col.key === "dvi2023";
                    return (
                      <td key={col.key} style={{ padding: "6px 8px", textAlign: "right", fontWeight: isDvi ? 700 : 500, color: isDvi ? getDviBandColor(val) : "#1a1a1a" }}>
                        {val != null ? (typeof val === "number" ? val.toFixed(1) : val) : "\u2014"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendation */}
      <div style={{ background: "#f0fdfa", borderRadius: 10, border: "1px solid #99f6e4", padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="#0f766e" strokeWidth="1.5" fill="none" />
            <path d="M5 8l2 2 4-4" stroke="#0f766e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f766e" }}>Recommendation</span>
        </div>
        <p style={{ fontSize: 13, color: "#1a1a1a", margin: 0, lineHeight: 1.6 }}>{recommendation}</p>
      </div>

      {/* Advanced: DVI Weight Sliders */}
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", marginBottom: 16 }}>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          style={{ width: "100%", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em" }}
          aria-expanded={showAdvanced}
        >
          <span>Advanced: DVI Formula &amp; Weight Adjustment</span>
          <span style={{ fontSize: 14, transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>{"\u25BE"}</span>
        </button>
        {showAdvanced && (
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ background: "#fafaf9", borderRadius: 8, padding: "14px 16px", marginBottom: 16, border: "1px solid #e8e5e0" }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>DVI Composition</h4>
              <p style={{ fontSize: 12, color: "#44403c", margin: "0 0 8px", lineHeight: 1.6 }}>
                <strong>DVI</strong> = (W\u2081 \u00D7 Demographic Vulnerability) + (W\u2082 \u00D7 Market Pressure) + (W\u2083 \u00D7 Socioeconomic Stress), scaled 0\u2013100.
              </p>
              <div style={{ fontSize: 11, color: "#64615b", lineHeight: 1.7 }}>
                <div><strong>Demographic Vulnerability</strong> (default {(DEFAULT_WEIGHTS.demographic * 100).toFixed(0)}%): rent burden (50%), renter share (30%), foreign-born % (20%)</div>
                <div><strong>Market Pressure</strong> (default {(DEFAULT_WEIGHTS.market * 100).toFixed(0)}%): home-value appreciation (50%), rent-to-income ratio (50%)</div>
                <div><strong>Socioeconomic Stress</strong> (default {(DEFAULT_WEIGHTS.socioeconomic * 100).toFixed(0)}%): poverty rate (40%), unemployment (30%), eviction filings (30%)</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "demographic", label: "Demographic Vulnerability" },
                { key: "market", label: "Market Pressure" },
                { key: "socioeconomic", label: "Socioeconomic Stress" },
              ].map(s => (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a" }}>{s.label}</label>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", minWidth: 40, textAlign: "right" }}>
                      {(weights[s.key] * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={Math.round(weights[s.key] * 100)}
                    onChange={(e) => handleWeightChange(s.key, parseInt(e.target.value, 10) / 100)}
                    style={{ width: "100%", accentColor: "#0f766e", cursor: "pointer" }}
                    aria-label={`${s.label} weight`}
                  />
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, color: "#a8a49c" }}>
                  Total: {((weights.demographic + weights.market + weights.socioeconomic) * 100).toFixed(0)}%
                </span>
                <button onClick={resetWeights} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #d6d3cd", background: "#fffffe", color: "#64615b", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                  Reset to defaults
                </button>
              </div>
              <p style={{ fontSize: 10, color: "#a8a49c", margin: "4px 0 0", lineHeight: 1.5 }}>
                DVI weights affect the underlying displacement index used by all three lenses. Trajectory uses DVI change over time. Equity uses DVI as one of five components. Risk Matrix uses DVI indirectly through market pressure and community vulnerability sub-scores.
              </p>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.5, padding: "4px 4px 0" }}>
        All scores computed at 2023. Data: U.S. Census/ACS, TCAD, Preservation Austin surveys. All 269 regions scored using census data (no business-data gating).
      </div>
    </section>
  );
}
