import { useState } from "react";
import { DVI_BINS, DVI_EXCLUDED } from "../utils/math";
import { HOLC_GRADES, HOLC_ATTRIBUTION } from "../data/history/holc";
import { PRESENTER_MODE } from "../appConfig";

/**
 * MapLegend — the colour key, as a strip above the map.
 *
 * It sits outside the map so it never covers a neighborhood, uses full
 * words instead of abbreviations, and expands to a plain-language meaning
 * for each stage. Keys for optional layers appear only while that layer is
 * switched on. (The weighting formula lives in the About dialog.)
 */

// What each stage means, in one sentence. The wording matches the story card.
const STAGES = [
  { ...DVI_BINS[0], label: DVI_BINS[0].stage, meaning: "Conditions here are comparatively stable today." },
  { ...DVI_BINS[1], label: DVI_BINS[1].stage, meaning: "Early pressure is visible. Conditions are shifting, but the community fabric is still intact." },
  { ...DVI_BINS[2], label: DVI_BINS[2].stage, meaning: "The latest data shows active displacement pressure: costs rising faster than long-time residents can absorb." },
  { ...DVI_BINS[3], label: DVI_BINS[3].stage, meaning: "Much of the change this map tracks has already happened here." },
];
const AFFLUENT = {
  fill: DVI_EXCLUDED.fill,
  label: "Affluent, not scored",
  meaning: "High-income, mostly owner-occupied areas. Rising values there are treated as appreciation rather than displacement risk, so they are shown as a separate group.",
};

const PA_TYPES = [
  { l: "Grant", c: "#7c3aed", k: "grant" },
  { l: "Merit award", c: "#2563eb", k: "merit_award" },
  { l: "Legacy business", c: "#d97706", k: "legacy_business" },
  { l: "Advocacy", c: "#059669", k: "advocacy" },
];

function Swatch({ color, round = false, size = 12 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, background: color,
        borderRadius: round ? "50%" : 3, border: "1px solid rgba(0,0,0,.18)",
      }}
    />
  );
}

function Group({ title, children }) {
  return (
    <div className="map-legend-group">
      <span className="map-legend-title">{title}</span>
      {children}
    </div>
  );
}

const itemStyle = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "#1a1a1a", whiteSpace: "nowrap" };

export default function MapLegend({
  year,
  showRegions,
  showPins,
  showProjectConnect,
  showHolc,
  showPreservationAustin,
  showOutreach,
  paFilter,
  setPaFilter,
  open,
  setOpen,
}) {
  // Controlled when the parent passes open/setOpen (the start-here path can
  // open the explanation); otherwise the strip keeps its own state.
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = open ?? localOpen;
  const toggle = () => (setOpen ? setOpen(!isOpen) : setLocalOpen(!isOpen));
  const preIndex = year < 1993;

  return (
    <div className="map-legend" role="region" aria-label="Map legend">
      <div className="map-legend-row">
        {showRegions && (
          <Group title="Displacement index">
            {preIndex ? (
              <span style={{ ...itemStyle, color: "var(--muted)", whiteSpace: "normal" }}>
                <Swatch color="#e0ddd7" /> No index before 1993. Boundaries only.
              </span>
            ) : (
              <>
                {STAGES.map((s) => (
                  <span key={s.label} style={itemStyle}>
                    <Swatch color={s.fill} /> {s.label}
                  </span>
                ))}
                <span style={itemStyle}>
                  <Swatch color={AFFLUENT.fill} /> {AFFLUENT.label}
                </span>
              </>
            )}
          </Group>
        )}

        {showPins && (
          <Group title="Cultural anchors">
            <span style={itemStyle}><Swatch color="#4ade80" round size={10} /> Operating</span>
            <span style={itemStyle}><Swatch color="#a8a29a" round size={10} /> Closed</span>
          </Group>
        )}

        {showProjectConnect && (
          <Group title="Transit">
            <span style={itemStyle}>
              <span aria-hidden="true" style={{ width: 16, borderTop: "2.5px dashed #2563eb" }} /> Project Connect line
            </span>
          </Group>
        )}

        {showHolc && (
          <Group title="1935 redlining grades">
            {HOLC_GRADES.map((g) => (
              <span key={g.grade} style={itemStyle}>
                <Swatch color={g.fill} size={11} /> {g.grade}: {g.category}
              </span>
            ))}
          </Group>
        )}

        {showPreservationAustin && (
          <Group title="Preservation Austin records">
            {PA_TYPES.map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => setPaFilter((prev) => ({ ...prev, [p.k]: !prev[p.k] }))}
                aria-pressed={!!paFilter[p.k]}
                title={paFilter[p.k] ? `Hide ${p.l.toLowerCase()} records` : `Show ${p.l.toLowerCase()} records`}
                className="map-legend-chip"
                style={{ opacity: paFilter[p.k] ? 1 : 0.5 }}
              >
                <Swatch color={p.c} round size={10} /> {p.l}
              </button>
            ))}
          </Group>
        )}

        {PRESENTER_MODE && showOutreach && (
          <Group title="Tabling opportunities">
            <span style={itemStyle}>
              <span aria-hidden="true" style={{ width: 9, height: 9, background: "#64615b", transform: "rotate(45deg)", borderRadius: 1.5 }} /> Dated event
            </span>
            <span style={itemStyle}><Swatch color="#64615b" round size={10} /> Recurring or civic body</span>
            <span style={{ ...itemStyle, color: "var(--muted)" }}>Color shows tabling status (filters above)</span>
          </Group>
        )}

        {showRegions && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls="map-legend-explain"
            className="map-legend-toggle"
          >
            {isOpen ? "Hide meanings" : "What do the colors mean?"}
          </button>
        )}
      </div>

      {showHolc && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.4 }}>{HOLC_ATTRIBUTION}</p>
      )}

      {isOpen && showRegions && (
        <div id="map-legend-explain" className="map-legend-explain">
          <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.5, color: "#44403c" }}>
            Each area gets a score from 0 to 100 that combines who is most exposed to rising
            costs, how fast the housing market is moving, and signs of economic stress. The
            score places it in one of four stages. It is a planning signal, not a verdict on
            any block or household.
          </p>
          <dl className="map-legend-defs">
            {[...STAGES, AFFLUENT].map((s) => (
              <div key={s.label} className="map-legend-def">
                <dt>
                  <Swatch color={s.fill} size={14} />
                  <span>{s.label}</span>
                  {s.range && <span style={{ color: "var(--muted)", fontWeight: 400 }}>score {s.range}</span>}
                </dt>
                <dd>{s.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
