import { useMemo } from "react";
import { StageHeadline, StageChecks, CityRiskLine } from "./StageBlock";
import { buildPlaceSummary, changeSentence, fmtMoney } from "../utils/placeData";
import { STAGE_BASE_YEAR } from "../utils/stages";
import { districtText } from "../utils/places";

/**
 * PlaceSummaryPanel — the right-hand panel for a selected place.
 *
 * One panel for both kinds of place. Selecting a census tract and selecting
 * a neighborhood now lead to the same summary and the same next step (the
 * story card); before, a neighborhood opened a different three-tab panel.
 *
 * Titles come from utils/places.js: neighborhood name first where the City's
 * planning areas support one, census tract number second, no internal id.
 */
export default function PlaceSummaryPanel({ placeRef, year, onClose, onOpenCard }) {
  const kind = placeRef?.kind;
  const id = placeRef?.id;
  const summary = useMemo(() => buildPlaceSummary({ kind, id }, year), [kind, id, year]);
  if (!summary) return null;

  const { place, tractCount, stage, cityRisk, change, income, homeValue, openCount, closedCount, paNearCount, tippingPoint } = summary;
  const where = [place.subtitle, districtText(place)].filter(Boolean).join(" · ");
  const sentence = changeSentence(change);

  const facts = [
    income && { label: "Median household income", value: fmtMoney(income.value), year: income.year },
    homeValue && { label: "Median home value", value: fmtMoney(homeValue.value), year: homeValue.year },
    { label: "Cultural anchors tracked", value: `${openCount} open, ${closedCount} closed` },
    {
      label: "Preservation Austin grants, awards and advocacy nearby",
      value: `${paNearCount} record${paNearCount === 1 ? "" : "s"}`,
    },
  ].filter(Boolean);

  return (
    <section className="side-card place-summary" aria-labelledby="place-summary-title">
      <div className="place-summary-head">
        <div style={{ minWidth: 0 }}>
          <h2 id="place-summary-title" className="side-card-title">{place.title}</h2>
          {where && <p className="place-summary-where">{where}</p>}
        </div>
        <button type="button" onClick={onClose} className="icon-button" aria-label="Close this place and return to the start card">
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Headline: the stage at the slider year, and the three tests behind it */}
      <div className="place-summary-stage">
        {!stage ? (
          <p style={{ margin: 0, fontSize: 14, color: "#44403c", lineHeight: 1.5 }}>
            Census figures on this site start in {STAGE_BASE_YEAR}. Move the year slider forward to see this place's stage.
          </p>
        ) : (
          <>
            <StageHeadline stage={stage} />
            <p className="stage-why">{stage.why}</p>
            <StageChecks stage={stage} />
            {stage.isBaseYear && stage.scored && (
              <p className="place-summary-note" style={{ marginTop: 6 }}>
                Stages measure change since {STAGE_BASE_YEAR}, so they start in 2010.
              </p>
            )}
            {tractCount > 1 && stage.scored && (
              <p className="place-summary-note" style={{ marginTop: 6 }}>
                Worked out on the combined figures of {tractCount} census tracts.
              </p>
            )}
            {/* The City's map is from 2022: shown beside the two latest readings only */}
            {stage.dataYear >= 2020 && <CityRiskLine cityRisk={cityRisk} tractCount={tractCount} />}
          </>
        )}
      </div>

      {sentence && <p className="place-summary-change">{sentence}</p>}

      <dl className="place-summary-facts">
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>
              {f.value}
              {f.year ? <span className="fact-year"> in {f.year}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {tippingPoint && (
        <p className="place-summary-turning">
          <strong>Turning point:</strong> {tippingPoint.region}{tippingPoint.decade ? `, ${tippingPoint.decade}` : ""}. The story card explains it.
        </p>
      )}

      <button type="button" className="btn-solid btn-block" onClick={onOpenCard}>
        Open the story card
      </button>
      <p className="place-summary-note">
        The story card has the full profile: how the stage was decided, charts over the measured
        years, the economics, cultural anchors and nearby preservation work. It has its own link
        and can be printed.
      </p>
      <p className="place-summary-note">{place.note}</p>
    </section>
  );
}
