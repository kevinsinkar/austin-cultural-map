import { STAGE_BASE_YEAR, STAGE_CLASSES } from "../utils/stages";

/**
 * The pieces that show a place's displacement stage. Used by the side
 * panel (compact) and the story card (full), so both say the same thing.
 *
 * A stage is decided by three tests (utils/stages.js, scripts/build_stages.mjs).
 * These pieces always show the tests beside the result, in words, so the
 * color is never the only thing carrying the answer.
 */

const money = (v) => (v == null ? "n/a" : `$${Math.round(v).toLocaleString()}`);
const pct = (v) => (v == null ? "n/a" : `${v.toFixed(1)}%`);
const signed = (v, unit) => {
  if (v == null) return "n/a";
  const n = Math.abs(v) < 0.05 ? 0 : v;
  const body = unit === "%" ? `${Math.abs(n).toFixed(0)}%` : `${Math.abs(n).toFixed(1)} pts`;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${body}`;
};

/** Swatch, stage name and the census year behind it. */
export function StageHeadline({ stage }) {
  const base = stage.isBaseYear && stage.scored;
  const title = base ? stage.typeName : stage.cls.label;
  // "Susceptible", "Early: Type 1", "Rapid loss": the study's exact type,
  // shown when it says more than the class name does.
  const exact = !base && stage.scored && stage.typeName !== stage.cls.label ? stage.typeName : null;
  return (
    <div className="stage-headline">
      <span className="stage-chip" style={{ background: stage.cls.fill }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <strong className="stage-name">{title}</strong>
        {exact && <span className="stage-exact"> · {exact}</span>}
        <div className="stage-source">
          {base ? "Starting point from the" : stage.scored ? "Stage from the" : "As of the"} {stage.source}
        </div>
      </div>
    </div>
  );
}

const housingPhrase = (h) => {
  if (!h) return "Not measured";
  if (h.code === "ACC") return "Accelerating: not among the highest, rising fast";
  if (h.code === "APP") return "Appreciated: started low, now among the highest";
  if (h.code === "ADJ") return "Adjacent: next to high or fast-rising values";
  return "None of the three patterns";
};

// Continued loss is met by demographic change, or by the white share and the
// bachelor's share both rising. Say so where the second route decided it.
const lossOnTwoMeasures = (stage) => stage.code === "CL" && stage.change?.measured && !stage.change.yes;
const LOSS_NOTE = "Continued loss can be met without this test: here the shares of white residents and of adults with a bachelor's degree have both risen.";

/** The three tests as one line each (side panel). */
export function StageChecks({ stage }) {
  if (!stage.scored) return null;
  const v = stage.vulnerable;
  const d = stage.change;
  return (
    <dl className="stage-checks">
      <div>
        <dt>Vulnerable residents</dt>
        <dd><strong>{v.yes ? "Yes" : "No"}</strong> · {v.count} of 5 measures well above the region</dd>
      </div>
      {d && (
        <div>
          <dt>Demographic change since {STAGE_BASE_YEAR}</dt>
          <dd>
            {d.measured
              ? <><strong>{d.yes ? "Yes" : "No"}</strong> · {d.count} of 4 measures well above the region's change</>
              : <>Not measured: no usable {STAGE_BASE_YEAR} figures here</>}
            {lossOnTwoMeasures(stage) && <> · white and bachelor's shares both up</>}
          </dd>
        </div>
      )}
      {d && (
        <div>
          <dt>Housing market</dt>
          <dd>{housingPhrase(stage.housing)}</dd>
        </div>
      )}
    </dl>
  );
}

function MeasureTable({ caption, measures, format, regionHead }) {
  return (
    <table className="stage-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Measure</th>
          <th scope="col">Here</th>
          <th scope="col">{regionHead}</th>
          <th scope="col">Past the line?</th>
        </tr>
      </thead>
      <tbody>
        {measures.map((m) => (
          <tr key={m.key} className={m.over ? "is-over" : undefined}>
            <th scope="row">{m.label}</th>
            <td>{format(m.value, m)}</td>
            <td>{format(m.region, m)}</td>
            <td>{m.value == null ? "n/a" : m.over ? `Yes (line: ${format(m.line, m)})` : "No"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The three tests with their numbers (story card). */
export function StageTests({ stage }) {
  if (!stage.scored) return null;
  const v = stage.vulnerable;
  const d = stage.change;
  const h = stage.housing;
  const fifth = (high) => (high ? "top two fifths" : "lower three fifths");
  return (
    <div className="stage-tests">
      <MeasureTable
        caption={`1. Vulnerable residents: ${v.yes ? "yes" : "no"} (${v.count} of 5 past the line; 3 are needed)`}
        measures={v.measures}
        format={(x) => pct(x)}
        regionHead="Region"
      />
      {d && d.measured && (
        <MeasureTable
          caption={`2. Demographic change since ${STAGE_BASE_YEAR}: ${d.yes ? "yes" : "no"} (${d.count} of 4 past the line; 2 are needed, and the four together)`}
          measures={d.measures}
          format={(x, m) => signed(x, m.unit)}
          regionHead="Region"
        />
      )}
      {d && !d.measured && (
        <p className="story-card-text">
          <strong>2. Demographic change since {STAGE_BASE_YEAR}:</strong> not measured. This area has no
          usable {STAGE_BASE_YEAR} figures to compare with.
        </p>
      )}
      {lossOnTwoMeasures(stage) && <p className="story-card-text" style={{ marginTop: 6 }}>{LOSS_NOTE}</p>}
      {d && (
        <p className="story-card-text" style={{ marginTop: 6 }}>
          <strong>3. Housing market: {h ? h.name.toLowerCase() : "not measured"}.</strong>{" "}
          {h ? (
            <>
              The {h.measure} went from {money(h.base)} in {STAGE_BASE_YEAR} to {money(h.now)} (up {Math.round(h.rise).toLocaleString()}%).
              Ranked among the tracts on this map, the {STAGE_BASE_YEAR} figure is in the {fifth(!h.baseLow)},
              today's is in the {fifth(h.nowHigh)}, and the rise is in the {fifth(h.riseHigh)}.
            </>
          ) : "The census reports neither a home value nor a rent for both years here."}
        </p>
      )}
    </div>
  );
}

/** The stage at each census year, as labeled chips. */
export function StageTimeline({ series, name }) {
  // Nothing to show for a place that was never scored.
  if (series.length < 2 || series.every((s) => !s.scored)) return null;
  const label = (s) => (s.isBaseYear && s.scored ? (s.code === "V0" ? "Vulnerable" : "Not vulnerable") : s.cls.label);
  return (
    <div>
      <ol
        className="stage-timeline"
        aria-label={`Stage of ${name} by census year: ${series.map((s) => `${s.dataYear}, ${label(s)}`).join("; ")}`}
      >
        {series.map((s) => (
          <li key={s.dataYear}>
            <span className="stage-timeline-year">{s.dataYear}</span>
            <span className="stage-timeline-chip" style={{ background: s.cls.fill }} aria-hidden="true" />
            <span className="stage-timeline-label">{label(s)}</span>
          </li>
        ))}
      </ol>
      <p className="story-card-caption">
        Each year is a separate reading from a census survey of a sample of households. {STAGE_BASE_YEAR} shows
        only whether residents were vulnerable, because change is measured from that year. A place close to a
        line can cross it and come back from one survey to the next.
      </p>
    </div>
  );
}

/** How many tracts sit in each stage: "3 vulnerable, 2 early" with swatches. */
export function StageMix({ counts }) {
  const shown = STAGE_CLASSES.filter((c) => counts?.[c.key] > 0);
  if (!shown.length) return <span style={{ color: "var(--muted)" }}>none</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "2px 10px" }}>
      {shown.map((c) => (
        <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: c.fill, border: "1px solid rgba(0,0,0,.18)" }} aria-hidden="true" />
          {counts[c.key]} {c.label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

/** What the City of Austin's own 2022 map says about the same tracts. */
export function CityRiskLine({ cityRisk, tractCount }) {
  if (!cityRisk?.length) return null;
  const text = tractCount === 1
    ? cityRisk[0].label
    : cityRisk.map((c) => `${c.label} (${c.count} tract${c.count === 1 ? "" : "s"})`).join(", ");
  return (
    <p className="stage-city">
      <strong>City of Austin's 2022 displacement risk map:</strong> {text}.
    </p>
  );
}
