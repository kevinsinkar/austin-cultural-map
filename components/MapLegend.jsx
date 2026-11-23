import { useState } from "react";
import {
  STAGE_CLASSES, STAGE_NONE, STAGE_UNSCORED, STAGE_NO_DATA, STAGE_BASE_YEAR, STAGE_YEARS,
  stageDataYear, stageSourceLabel, stageCounts,
} from "../utils/stages";
import { HOLC_GRADES, HOLC_ATTRIBUTION } from "../data/history/holc";
import { PRESENTER_MODE } from "../appConfig";
import { LIGHT_RAIL_SOURCE } from "../data/projectConnect";

/**
 * MapLegend — the colour key, as a strip above the map.
 *
 * It sits outside the map so it never covers a neighborhood, uses full
 * words instead of abbreviations, and expands to a plain-language meaning
 * for each stage. Keys for optional layers appear only while that layer is
 * switched on. (The weighting formula lives in the About dialog.)
 */

// The stages and their one-sentence meanings live in utils/stages.js, so the
// legend, the side panel and the story card use the same words.
const ALL_CLASSES = [...STAGE_CLASSES, STAGE_NONE, STAGE_UNSCORED];
// In 2000 there is no stage yet: the map shows only where residents were vulnerable.
const BASE_YEAR_CLASSES = [
  { ...STAGE_CLASSES[0], label: `Vulnerable in ${STAGE_BASE_YEAR}` },
  { ...STAGE_NONE, label: "Not vulnerable" },
  STAGE_UNSCORED,
];

const PA_TYPES = [
  { l: "Grant", c: "#7c3aed", k: "grant" },
  { l: "Merit award", c: "#2563eb", k: "merit_award" },
  { l: "Legacy business", c: "#d97706", k: "legacy_business" },
  { l: "Advocacy", c: "#059669", k: "advocacy" },
];

function Swatch({ color, round = false, size = 12, dashed = false }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0, background: color,
        borderRadius: round ? "50%" : 3,
        border: dashed ? "1.5px dashed #6b675f" : "1px solid rgba(0,0,0,.18)",
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
  const dataYear = stageDataYear(year);
  const isBaseYear = dataYear === STAGE_BASE_YEAR;
  const shown = isBaseYear ? BASE_YEAR_CLASSES : ALL_CLASSES;
  const counts = dataYear != null ? stageCounts(dataYear) : null;

  return (
    <div className="map-legend" role="region" aria-label="Map legend">
      <div className="map-legend-row">
        {showRegions && (
          <Group title={isBaseYear ? `Residents in ${STAGE_BASE_YEAR}` : "Displacement stage"}>
            {dataYear == null ? (
              <span style={{ ...itemStyle, color: "var(--muted)", whiteSpace: "normal" }}>
                <Swatch color={STAGE_NO_DATA.fill} /> No census figures before {STAGE_BASE_YEAR}. Boundaries only.
              </span>
            ) : (
              shown.map((s) => (
                <span key={s.key} style={itemStyle}>
                  <Swatch color={s.fill} dashed={s.key === "unscored"} /> {s.label}
                </span>
              ))
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
              <span aria-hidden="true" style={{ width: 16, borderTop: "2.5px dashed #2563eb" }} /> Planned light rail, Phase 1
            </span>
            <span style={itemStyle}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", border: "2px solid #2563eb", background: "#fffffe", boxSizing: "border-box" }} /> Planned station
            </span>
            <span style={{ ...itemStyle, color: "var(--muted)" }}>
              Not built: service is planned for 2033. Route: Austin Transit Partnership, {LIGHT_RAIL_SOURCE.route.edited.slice(0, 4)}.
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
            Each area is put through three tests using census figures. Are many residents
            exposed to rising housing costs? Has the population shifted since {STAGE_BASE_YEAR}? What
            have home values done? The answers together place it in a stage. The tests come from
            a University of Texas study the City of Austin commissioned, and the City publishes
            its own version. A stage describes an area as a whole, not any block or household.
          </p>
          {dataYear == null ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#44403c" }}>
              Census figures on this site start in {STAGE_BASE_YEAR}. Move the year slider forward.
            </p>
          ) : (
            <>
              {isBaseYear && (
                <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.5, color: "#44403c" }}>
                  Stages measure change since {STAGE_BASE_YEAR}, so they start in 2010. For {STAGE_BASE_YEAR} the map shows
                  only the first test: where vulnerable residents lived.
                </p>
              )}
              <dl className="map-legend-defs">
                {shown.map((s) => (
                  <div key={s.key} className="map-legend-def">
                    <dt>
                      <Swatch color={s.fill} size={14} dashed={s.key === "unscored"} />
                      <span>{s.label}</span>
                      {counts && (
                        <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                          {counts[s.key]} census tract{counts[s.key] === 1 ? "" : "s"}
                        </span>
                      )}
                    </dt>
                    <dd>{s.meaning}</dd>
                  </div>
                ))}
              </dl>
              <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
                Showing the {stageSourceLabel(dataYear)}. The map changes at each census year
                ({STAGE_YEARS.join(", ")}), not in between.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
