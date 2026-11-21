import { useMemo } from "react";
import ConfidenceChip from "./ConfidenceChip";
import { getDviStage, getDviColor, DVI_EXCLUDED } from "../utils/math";
import { buildPlaceSummary, changeSentence, fmtMoney } from "../utils/placeData";
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
export default function PlaceSummaryPanel({ placeRef, year, dviVersion, onClose, onOpenCard }) {
  const kind = placeRef?.kind;
  const id = placeRef?.id;
  const summary = useMemo(
    () => buildPlaceSummary({ kind, id }, year),
    // dviVersion: recompute after the presenter changes the index weights
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, id, year, dviVersion]
  );
  if (!summary) return null;

  const { place, dvi, excluded, confidence, change, income, homeValue, openCount, closedCount, paNearCount, tippingPoint } = summary;
  const preIndex = year < 1993;
  const band = excluded ? "Affluent, not scored" : getDviStage(dvi);
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

      {/* Headline: the index at the slider year */}
      <div className="place-summary-index">
        {preIndex ? (
          <p style={{ margin: 0, fontSize: 14, color: "#44403c", lineHeight: 1.5 }}>
            The displacement index starts in 1993. Move the year slider forward to see this place's score.
          </p>
        ) : (
          <>
            <span
              className="index-chip"
              style={{
                background: excluded ? DVI_EXCLUDED.fill : getDviColor(dvi),
                color: excluded || dvi >= 55 ? "#fffffe" : "#1a1a1a",
              }}
              aria-hidden="true"
            >
              {dvi.toFixed(0)}
            </span>
            <div style={{ fontSize: 14, lineHeight: 1.4, minWidth: 0 }}>
              <strong style={{ color: excluded ? DVI_EXCLUDED.text : "#1a1a1a" }}>{band}</strong>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Displacement index {dvi.toFixed(0)} of 100 in {year}
              </div>
              {confidence && (
                <div style={{ marginTop: 3 }}>
                  <ConfidenceChip level={confidence.level} suffix="confidence" reasons={confidence.reasons} />
                </div>
              )}
            </div>
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
        The story card has the full profile: charts over the measured years, the economics,
        cultural anchors and nearby preservation work. It has its own link and prints on one page.
      </p>
      <p className="place-summary-note">{place.note}</p>
    </section>
  );
}
