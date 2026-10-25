import { useState, useRef, useEffect, useCallback } from "react";
import { cloneDefaultWeights, isDefaultWeights, groupShare } from "../utils/dviWeights";
import { DVI_OBJECTIVE_PRESETS } from "../data/strategicPlan";

/**
 * "DVI Weights" popover — granular, committee-adjustable methodology.
 * Every weight that goes into the DVI is a slider: the three sub-index
 * weights plus each field inside each sub-index. Values are relative
 * (normalized within their group), so sliders read out an effective %.
 *
 * Two recalculation modes: Live (recompute as sliders move, debounced) and
 * Manual (stage changes, then press Recalculate) — whichever the committee
 * prefers for a working session vs. a presentation.
 */

// Named presets so the committee can debate priorities, not slider
// positions. The objective presets come from data/strategicPlan.js — the
// same configurations shown on each Strategic Plan objective card.
const PRESETS = [
  { key: "default", label: "Default", weights: null,
    hint: "The published methodology — also the 'Tell a Clear, Consistent Story' setting" },
  ...DVI_OBJECTIVE_PRESETS.map((p) => ({
    key: p.key, label: p.label, weights: p.weights,
    hint: `${p.objective} — ${p.hint}`,
  })),
];

const GROUPS = [
  {
    key: "sub",
    title: "Sub-index balance",
    hint: "How much each pillar counts toward the final DVI.",
    fields: [
      { key: "demographic", label: "Demographic Vulnerability" },
      { key: "market", label: "Market Pressure" },
      { key: "socio", label: "Socioeconomic Stress" },
    ],
  },
  {
    key: "demographic",
    title: "Demographic Vulnerability",
    hint: "Who is exposed if pressure arrives.",
    fields: [
      { key: "rentBurden", label: "Rent burden" },
      { key: "renterShare", label: "Renter share" },
      { key: "foreignBorn", label: "Foreign-born %" },
    ],
  },
  {
    key: "market",
    title: "Market Pressure",
    hint: "How hard the market is pushing.",
    fields: [
      { key: "appreciation", label: "Home-value appreciation" },
      { key: "rentIncome", label: "Rent-to-income ratio" },
    ],
  },
  {
    key: "socio",
    title: "Socioeconomic Stress",
    hint: "How much strain residents are already under.",
    fields: [
      { key: "poverty", label: "Poverty rate" },
      { key: "unemployment", label: "Unemployment" },
      { key: "eviction", label: "Eviction filings" },
    ],
  },
];

export default function DviWeightsPanel({ weights, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(weights);
  const [live, setLive] = useState(true);
  const [dirty, setDirty] = useState(false);
  const rootRef = useRef(null);
  const debounceRef = useRef(null);

  // Keep draft in sync when weights change from outside (e.g., reset) —
  // state adjustment during render, per the React docs pattern.
  const [lastWeights, setLastWeights] = useState(weights);
  if (weights !== lastWeights) {
    setLastWeights(weights);
    setDraft(weights);
    setDirty(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const scheduleApply = useCallback((next) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onApply(next), 160);
  }, [onApply]);

  const update = (groupKey, fieldKey, value) => {
    const next = {
      ...draft,
      [groupKey]: { ...draft[groupKey], [fieldKey]: value },
    };
    setDraft(next);
    if (live) scheduleApply(next);
    else setDirty(true);
  };

  const updateOption = (key, value) => {
    const next = { ...draft, options: { ...draft.options, [key]: value } };
    setDraft(next);
    if (live) scheduleApply(next);
    else setDirty(true);
  };

  const recalc = () => { onApply(draft); setDirty(false); };
  const reset = () => { const d = cloneDefaultWeights(); setDraft(d); onApply(d); setDirty(false); };
  const applyPreset = (preset) => {
    const d = preset.weights
      ? JSON.parse(JSON.stringify(preset.weights))
      : cloneDefaultWeights();
    setDraft(d);
    onApply(d); // presets are deliberate choices — apply immediately
    setDirty(false);
  };

  const customized = !isDefaultWeights(weights) || dirty;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
          borderRadius: 8, border: "1.5px solid #9a3412", background: open ? "#9a3412" : "#fffffe",
          color: open ? "#fffffe" : "#9a3412", fontSize: 12, fontWeight: 600,
          cursor: "pointer", minHeight: 34,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="6" cy="4" r="1.8" fill="currentColor" />
          <circle cx="11" cy="8" r="1.8" fill="currentColor" />
          <circle cx="4.5" cy="12" r="1.8" fill="currentColor" />
        </svg>
        DVI Weights
        {customized && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
            background: open ? "rgba(255,255,254,.25)" : "#ffedd5",
            color: open ? "#fffffe" : "#9a3412",
          }}>
            custom
          </span>
        )}
        <span aria-hidden="true" style={{ fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>

      {open && (
        <div
          role="group"
          aria-label="DVI weight controls"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 1300,
            width: 330, maxHeight: "72vh", overflowY: "auto",
            background: "#fffffe", border: "1px solid #d6d3cd",
            borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.14)", padding: "12px 14px",
          }}
        >
          {/* Mode row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#1a1a1a", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
                style={{ accentColor: "#9a3412", width: 14, height: 14 }}
              />
              Live recalculation
            </label>
            {!live && (
              <button
                onClick={recalc}
                disabled={!dirty}
                style={{
                  padding: "4px 12px", borderRadius: 6, border: "none",
                  background: dirty ? "#9a3412" : "#e8e5e0",
                  color: dirty ? "#fffffe" : "#a8a49c",
                  fontSize: 11, fontWeight: 700, cursor: dirty ? "pointer" : "default",
                }}
              >
                Recalculate
              </button>
            )}
          </div>

          {/* Presets — one per strategic-plan objective */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>
            Objective presets
          </div>
          <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                title={p.hint}
                style={{
                  padding: "3px 10px", borderRadius: 11, fontSize: 11, fontWeight: 600,
                  border: "1.5px solid #d6d3cd", background: "#f8f7f4", color: "#64615b",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {GROUPS.map((g) => (
            <div key={g.key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {g.title}
              </div>
              <div style={{ fontSize: 10.5, color: "#a8a49c", marginBottom: 5 }}>{g.hint}</div>
              {g.fields.map((f) => (
                <WeightSlider
                  key={f.key}
                  label={f.label}
                  value={draft[g.key][f.key]}
                  share={groupShare(draft[g.key], f.key)}
                  onChange={(v) => update(g.key, f.key, v)}
                />
              ))}
            </div>
          ))}

          {/* Methodology rules */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>
              Methodology rules
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: "#1a1a1a", cursor: "pointer", marginBottom: 6, lineHeight: 1.35 }}>
              <input
                type="checkbox"
                checked={draft.options.vulnerabilityGate}
                onChange={(e) => updateOption("vulnerabilityGate", e.target.checked)}
                style={{ accentColor: "#9a3412", width: 13, height: 13, marginTop: 1, flexShrink: 0 }}
              />
              <span>
                <strong>Vulnerability gate</strong> — cap affluent, high-ownership
                tracts at DVI 20 and flag them Exclusive&nbsp;/&nbsp;Appreciated.
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: "#1a1a1a", cursor: "pointer", lineHeight: 1.35 }}>
              <input
                type="checkbox"
                checked={draft.options.lowConfidenceBoost}
                onChange={(e) => updateOption("lowConfidenceBoost", e.target.checked)}
                style={{ accentColor: "#9a3412", width: 13, height: 13, marginTop: 1, flexShrink: 0 }}
              />
              <span>
                <strong>Data-desert boost</strong> — when audit confidence is low,
                shift +10&nbsp;pts of weight to Socioeconomic Stress.
              </span>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #edeae4", paddingTop: 8 }}>
            <span style={{ fontSize: 10.5, color: "#a8a49c" }}>
              Weights are relative; shares shown in&nbsp;%.
            </span>
            <button
              onClick={reset}
              style={{
                padding: "4px 10px", borderRadius: 6, border: "1px solid #d6d3cd",
                background: "#fffffe", color: "#64615b", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WeightSlider({ label, value, share, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
      <span style={{ fontSize: 11.5, color: "#1a1a1a", width: 128, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        aria-label={`${label} weight`}
        style={{ flex: 1, accentColor: "#9a3412", height: 18 }}
      />
      <span style={{ fontSize: 11, color: "#64615b", width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {share.toFixed(0)}%
      </span>
    </div>
  );
}
