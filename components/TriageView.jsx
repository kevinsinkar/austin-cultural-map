import { useState, useMemo, useCallback } from "react";
import _ from "lodash";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis, Cell,
} from "recharts";
import {
  REGION_INDEX, LEGACY_OPERATING, LEGACY_CLOSED,
  DEMOGRAPHICS, AUDITED_DVI_LOOKUP,
} from "../data";
import {
  interpolateDvi, calcAnchorDensity, calcAnchorPressureScore,
  getDviBandColor,
} from "../utils/math";

// ── Default DVI sub-index weights ──
const DEFAULT_WEIGHTS = { demographic: 0.35, market: 0.35, socioeconomic: 0.30 };

// ── Triage category logic ──
// REFACTORED: Displacement = Vulnerability + Pressure, not Pressure alone.
// Affluent tracts are classified separately as "Exclusive / Appreciated"
// so they never appear in the urgent-intervention list.
function triageCategory(dvi, density, survivingCount, highPressureCount, { isExcluded } = {}) {
  // ── Affluence gate: high-income / high-ownership tracts ──
  if (isExcluded) {
    return "Exclusive / Appreciated";
  }

  const isHighRisk = dvi > 55;

  // BIAS CHECK: high DVI with zero tracked businesses is likely a reporting gap,
  // not a lack of culture. Flag for field audit.
  if (isHighRisk && survivingCount === 0) {
    return "High Risk / Data Gap";
  }

  // Low-income / high-renter tracts with active displacement pressure
  if (isHighRisk && survivingCount > 0) {
    return "Active Displacement";
  }

  if (dvi > 35 && survivingCount > 0) {
    return "Critical — Near Tipping";
  }

  if (dvi >= 20 && dvi <= 35) {
    return "Critical — Near Tipping";
  }

  return "Monitor";
}

const TRIAGE_COLORS = {
  "Active Displacement": "#dc2626",
  "High Risk / Data Gap": "#FF9800",
  "Critical — Near Tipping": "#f59e0b",
  "Monitor": "#16a34a",
  "Exclusive / Appreciated": "#1565C0",
};

const TRIAGE_ORDER = [
  "Active Displacement",
  "High Risk / Data Gap",
  "Critical — Near Tipping",
  "Monitor",
  "Exclusive / Appreciated",
];

// ── Component ──

export default function TriageView() {
  const [sortCol, setSortCol] = useState("triage");
  const [sortDir, setSortDir] = useState("asc");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Weight slider handler — when one slider moves, proportionally adjust the others
  const handleWeightChange = useCallback((key, newVal) => {
    setWeights((prev) => {
      const clamped = Math.max(0, Math.min(1, newVal));
      const remaining = 1 - clamped;
      const otherKeys = Object.keys(prev).filter((k) => k !== key);
      const otherSum = otherKeys.reduce((s, k) => s + prev[k], 0);

      const next = { ...prev, [key]: clamped };
      if (otherSum > 0) {
        for (const k of otherKeys) {
          next[k] = +(remaining * (prev[k] / otherSum)).toFixed(3);
        }
      } else {
        // Edge case: other sliders are all 0 — split equally
        for (const k of otherKeys) {
          next[k] = +(remaining / otherKeys.length).toFixed(3);
        }
      }
      return next;
    });
  }, []);

  const resetWeights = useCallback(() => setWeights({ ...DEFAULT_WEIGHTS }), []);

  // ── Compute per-region triage data ──
  const regionData = useMemo(() => {
    return REGION_INDEX.map((r) => {
      const rid = r.region_id;
      const name = r.region_name;
      const dvi = interpolateDvi(rid, 2023);
      const density = calcAnchorDensity(rid);
      const pressureScore = calcAnchorPressureScore(rid);

      const open = LEGACY_OPERATING.filter((b) => b.region_id === rid);
      const closed = LEGACY_CLOSED.filter((b) => b.region_id === rid);
      const survivingCount = open.length;
      const closedCount = closed.length;
      const highPressureCount = open.filter(
        (b) => b.pressure === "High" || b.pressure === "Critical"
      ).length;

      // Rent burden from demographics
      const demo2023 = DEMOGRAPHICS.find(
        (d) => d.region_id === rid && d.year === 2023
      );
      const rentBurden = demo2023?.rent_burden_pct ?? null;

      // Determine if this region is affluent / excluded based on the
      // DVI data point (Vulnerability Gate from auditedDvi.js)
      const dviSeries = AUDITED_DVI_LOOKUP[rid];
      const dviPoint = dviSeries?.reduce((best, pt) =>
        Math.abs(pt.year - 2023) < Math.abs(best.year - 2023) ? pt : best,
        dviSeries[0]
      );
      const isExcluded = dviPoint?.isExcluded ?? false;

      const cat = triageCategory(dvi, density, survivingCount, highPressureCount, { isExcluded });

      return {
        regionId: rid,
        name,
        dvi: +dvi.toFixed(1),
        density,
        densityPct: density != null ? +(density * 100).toFixed(0) : null,
        survivingCount,
        closedCount,
        highPressureCount,
        pressureScore,
        rentBurden,
        isExcluded,
        triage: cat,
      };
    });
  }, []); // DVI is deterministic for 2023 so no deps needed

  // ── Filtering & Sorting ──
  const sorted = useMemo(() => {
    let data = [...regionData];
    // Filter by category
    if (filterCategory !== "all") {
      data = data.filter((r) => r.triage === filterCategory);
    }
    // Filter by search term
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      data = data.filter((r) => r.name.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      let va, vb;
      if (sortCol === "triage") {
        va = TRIAGE_ORDER.indexOf(a.triage);
        vb = TRIAGE_ORDER.indexOf(b.triage);
      } else if (sortCol === "name") {
        va = a.name;
        vb = b.name;
      } else {
        va = a[sortCol] ?? -Infinity;
        vb = b[sortCol] ?? -Infinity;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [regionData, sortCol, sortDir, searchTerm, filterCategory]);

  const toggleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sortIcon = (col) => {
    if (sortCol !== col) return " ⇅";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  // ── Scatter plot data ──
  const scatterData = useMemo(
    () =>
      regionData
        .filter((r) => r.density != null)
        .map((r) => ({
          x: r.dvi,
          y: r.densityPct,
          z: Math.max(r.survivingCount, 1) * 40,
          name: r.name,
          triage: r.triage,
          surviving: r.survivingCount,
        })),
    [regionData]
  );

  // ── Recommendation text ──
  const recommendation = useMemo(() => {
    const urgent = regionData
      .filter((r) => r.triage === "Active Displacement")
      .sort((a, b) => b.dvi - a.dvi);
    const critical = regionData
      .filter((r) => r.triage === "Critical — Near Tipping")
      .sort((a, b) => b.dvi - a.dvi);

    const priority = [...urgent, ...critical.slice(0, Math.max(0, 5 - urgent.length))];
    if (priority.length === 0)
      return "No regions currently meet the criteria for urgent intervention based on current DVI thresholds.";

    const names = priority.map((r) => r.name);
    const joined =
      names.length <= 2
        ? names.join(" and ")
        : names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];

    return `Based on current data, we recommend prioritizing ${joined} for immediate grant support. These neighborhoods are experiencing active displacement but retain enough cultural anchors that intervention can still make a difference.`;
  }, [regionData]);

  // ── Scatter tooltip ──
  const ScatterTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div
        style={{
          background: "#fffffe",
          border: "1px solid #d6d3cd",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12,
          color: "#1a1a1a",
          boxShadow: "0 2px 8px rgba(0,0,0,.1)",
          maxWidth: 220,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
        <div>DVI: <strong>{d.x.toFixed(1)}</strong></div>
        <div>Anchor Density: <strong>{d.y}%</strong></div>
        <div>Surviving Anchors: <strong>{d.surviving}</strong></div>
        <div style={{ color: TRIAGE_COLORS[d.triage], fontWeight: 600, marginTop: 4 }}>{d.triage}</div>
      </div>
    );
  };

  return (
    <section aria-label="Grant triage view">
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontFamily: "'Newsreader',Georgia,serif",
            fontSize: 22,
            fontWeight: 600,
            color: "#1a1a1a",
            margin: "0 0 6px",
          }}
        >
          Grant Triage &amp; Prioritization
        </h2>
        <p style={{ fontSize: 13, color: "#64615b", margin: 0, lineHeight: 1.5 }}>
          Which neighborhoods should receive preservation grants this year? Regions are ranked by
          displacement vulnerability and remaining cultural anchor inventory.
        </p>
      </div>

      {/* Triage legend with counts */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {TRIAGE_ORDER.map((cat) => {
          const count = regionData.filter((r) => r.triage === cat).length;
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: TRIAGE_COLORS[cat],
                }}
              />
              <span style={{ fontSize: 11, color: "#64615b", fontWeight: 500 }}>{cat} ({count})</span>
            </div>
          );
        })}
        <span style={{ fontSize: 11, color: "#a8a49c", marginLeft: 4 }}>
          {regionData.length} regions total
        </span>
      </div>

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search regions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1.5px solid #d6d3cd",
            background: "#fffffe",
            color: "#1a1a1a",
            fontSize: 12,
            minWidth: 200,
            minHeight: 32,
            outline: "none",
          }}
          aria-label="Filter regions by name"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1.5px solid #d6d3cd",
            background: "#fffffe",
            color: "#1a1a1a",
            fontSize: 12,
            minHeight: 32,
            cursor: "pointer",
          }}
          aria-label="Filter by triage category"
        >
          <option value="all">All Categories</option>
          {TRIAGE_ORDER.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "#a8a49c" }}>
          Showing {sorted.length} of {regionData.length}
        </span>
      </div>

      {/* Scatter Plot */}
      <div
        style={{
          background: "#fffffe",
          borderRadius: 10,
          border: "1px solid #e8e5e0",
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#64615b",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            margin: "0 0 12px",
          }}
        >
          Displacement Risk vs. Cultural Anchor Survival
        </h3>
        <div
          style={{ width: "100%", height: 340 }}
          role="img"
          aria-label="Scatter plot: DVI score vs anchor density for all regions"
        >
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e5e0" />
              <XAxis
                type="number"
                dataKey="x"
                name="DVI"
                tick={{ fontSize: 11, fill: "#7c6f5e" }}
                tickLine={false}
                label={{ value: "DVI Score →", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "#a8a49c" }}
                domain={[0, 80]}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Anchor Density"
                tick={{ fontSize: 10, fill: "#a8a49c" }}
                tickLine={false}
                axisLine={false}
                label={{ value: "Anchor Density % ↑", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#a8a49c" }}
                domain={[0, 100]}
              />
              <ZAxis type="number" dataKey="z" range={[60, 400]} />
              <Tooltip content={<ScatterTooltip />} />
              <Scatter data={scatterData}>
                {scatterData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={TRIAGE_COLORS[entry.triage]}
                    fillOpacity={0.8}
                    stroke={TRIAGE_COLORS[entry.triage]}
                    strokeWidth={1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p style={{ fontSize: 10, color: "#a8a49c", margin: "8px 0 0", lineHeight: 1.4 }}>
          Dot size = number of surviving cultural anchors. Upper-right = high displacement &amp; strong
          remaining base (intervention window). Lower-right = high displacement with few anchors left
          (post-displacement).
        </p>
      </div>

      {/* Sortable Table */}
      <div
        style={{
          background: "#fffffe",
          borderRadius: 10,
          border: "1px solid #e8e5e0",
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#64615b",
            textTransform: "uppercase",
            letterSpacing: ".08em",
            margin: "0 0 12px",
          }}
        >
          Region Triage Rankings
        </h3>
        <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
            role="table"
            aria-label="Region triage table"
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #e8e5e0" }}>
                {[
                  { key: "triage", label: "Triage" },
                  { key: "name", label: "Region" },
                  { key: "dvi", label: "DVI" },
                  { key: "densityPct", label: "Anchor %" },
                  { key: "survivingCount", label: "Open" },
                  { key: "closedCount", label: "Lost" },
                  { key: "highPressureCount", label: "High Press." },
                  { key: "rentBurden", label: "Rent Burden" },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    style={{
                      textAlign: col.key === "name" || col.key === "triage" ? "left" : "right",
                      padding: "6px 8px",
                      fontWeight: 600,
                      color: "#64615b",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                      fontSize: 11,
                    }}
                  >
                    {col.label}
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{sortIcon(col.key)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.regionId} style={{ borderBottom: "1px solid #f0ede8" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 4,
                        color: "#1a1a1a",
                        background: TRIAGE_COLORS[r.triage],
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.triage}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", fontWeight: 500, color: "#1a1a1a", whiteSpace: "nowrap" }}>{r.name}</td>
                  <td
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontWeight: 700,
                      color: getDviBandColor(r.dvi),
                    }}
                  >
                    {r.dvi}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: r.density != null ? (r.density > 0.7 ? "#16a34a" : r.density >= 0.4 ? "#ca8a04" : "#dc2626") : "#a8a49c" }}>
                    {r.densityPct != null ? `${r.densityPct}%` : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a" }}>{r.survivingCount}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: r.closedCount > 0 ? "#dc2626" : "#a8a49c" }}>{r.closedCount}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: r.highPressureCount > 0 ? "#ea580c" : "#a8a49c" }}>{r.highPressureCount}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "#1a1a1a" }}>
                    {r.rentBurden != null ? `${r.rentBurden.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendation */}
      <div
        style={{
          background: "#f0fdfa",
          borderRadius: 10,
          border: "1px solid #99f6e4",
          padding: "16px 20px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="#0f766e" strokeWidth="1.5" fill="none" />
            <path d="M5 8l2 2 4-4" stroke="#0f766e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f766e" }}>Recommendation</span>
        </div>
        <p style={{ fontSize: 13, color: "#1a1a1a", margin: 0, lineHeight: 1.6 }}>{recommendation}</p>
      </div>

      {/* Advanced: DVI Weight Sliders (Task 2.3) */}
      <div
        style={{
          background: "#fffffe",
          borderRadius: 10,
          border: "1px solid #e8e5e0",
          marginBottom: 16,
        }}
      >
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            width: "100%",
            padding: "14px 20px",
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            fontWeight: 600,
            color: "#64615b",
            textTransform: "uppercase",
            letterSpacing: ".06em",
          }}
          aria-expanded={showAdvanced}
        >
          <span>Advanced: DVI Formula &amp; Weight Adjustment</span>
          <span style={{ fontSize: 14, transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </button>
        {showAdvanced && (
          <div style={{ padding: "0 20px 20px" }}>
            {/* Formula documentation */}
            <div
              style={{
                background: "#fafaf9",
                borderRadius: 8,
                padding: "14px 16px",
                marginBottom: 16,
                border: "1px solid #e8e5e0",
              }}
            >
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
                DVI Composition
              </h4>
              <p style={{ fontSize: 12, color: "#44403c", margin: "0 0 8px", lineHeight: 1.6 }}>
                <strong>DVI</strong> = (W₁ × Demographic Vulnerability) + (W₂ × Market Pressure) + (W₃ × Socioeconomic Stress), scaled 0–100.
              </p>
              <div style={{ fontSize: 11, color: "#64615b", lineHeight: 1.7 }}>
                <div><strong>Demographic Vulnerability</strong> (default {(DEFAULT_WEIGHTS.demographic * 100).toFixed(0)}%): rent burden (50%), renter share (30%), foreign-born % (20%)</div>
                <div><strong>Market Pressure</strong> (default {(DEFAULT_WEIGHTS.market * 100).toFixed(0)}%): home-value appreciation (50%), rent-to-income ratio (50%)</div>
                <div><strong>Socioeconomic Stress</strong> (default {(DEFAULT_WEIGHTS.socioeconomic * 100).toFixed(0)}%): poverty rate (40%), unemployment (30%), eviction filings (30%)</div>
              </div>
              <p style={{ fontSize: 11, color: "#a8a49c", margin: "8px 0 0", lineHeight: 1.5 }}>
                When data for a sub-index is missing, the remaining sub-indices are re-weighted proportionally.
              </p>
            </div>

            {/* Weight Sliders */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "demographic", label: "Demographic Vulnerability" },
                { key: "market", label: "Market Pressure" },
                { key: "socioeconomic", label: "Socioeconomic Stress" },
              ].map((s) => (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a" }}>{s.label}</label>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", minWidth: 40, textAlign: "right" }}>
                      {(weights[s.key] * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(weights[s.key] * 100)}
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
                <button
                  onClick={resetWeights}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "1px solid #d6d3cd",
                    background: "#fffffe",
                    color: "#64615b",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Reset to defaults
                </button>
              </div>
              <p style={{ fontSize: 10, color: "#a8a49c", margin: "4px 0 0", lineHeight: 1.5 }}>
                Adjusting weights here is for exploratory purposes. The triage table above uses the default research-based weights.
                Full live recomputation requires re-processing the raw audit data and is available in the data pipeline.
              </p>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: "#a8a49c", lineHeight: 1.5, padding: "4px 4px 0" }}>
        DVI computed at 2023. Anchor density = surviving businesses ÷ (surviving + closed). Business inventory from Preservation Austin community survey and public records.
      </div>
    </section>
  );
}
