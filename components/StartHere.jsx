import { useMemo, useState } from "react";
import { buildBigIdeas, SUGGESTED_TRACTS } from "../data/bigIdeas";
import { tractPlace } from "../utils/places";

/**
 * StartHere — the right-hand card shown when no place is selected.
 *
 * It replaces the old empty "Select a neighborhood" box with an entry
 * point: one sentence on what the colors mean, then five ideas in a
 * teaching order (data/bigIdeas.js), each with one thing to do on the map.
 * All five titles stay visible so the takeaways are stated up front.
 */
export default function StartHere({ onAction, holcOn = false }) {
  const ideas = useMemo(() => buildBigIdeas(), []);
  const suggested = useMemo(
    () => SUGGESTED_TRACTS.map((id) => tractPlace(id)).filter(Boolean),
    []
  );
  const [step, setStep] = useState(0);
  const last = ideas.length - 1;

  return (
    <section className="side-card start-here" aria-labelledby="start-here-title">
      <h2 id="start-here-title" className="side-card-title">Start here</h2>
      <p className="start-here-lead">
        Each area is colored by how much displacement pressure the data shows, from pale
        yellow (stable) through orange (active) to red (where much of the change has
        already happened). Select any area to see its numbers.
      </p>

      <h3 className="start-here-sub">Five ideas this map is built around</h3>
      <ol className="start-here-list">
        {ideas.map((idea, i) => {
          const isOpen = i === step;
          return (
            <li key={idea.id} className={isOpen ? "is-open" : undefined}>
              <button
                type="button"
                className="start-here-step"
                aria-expanded={isOpen}
                aria-controls={`idea-${idea.id}`}
                onClick={() => setStep(i)}
              >
                <span className="start-here-num" aria-hidden="true">{i + 1}</span>
                <span>{idea.title}</span>
              </button>
              {isOpen && (
                <div id={`idea-${idea.id}`} className="start-here-body">
                  {idea.body.map((p, k) => <p key={k}>{p}</p>)}
                  {idea.action?.key === "places" ? (
                    <ul className="start-here-places">
                      {suggested.map((p) => (
                        <li key={p.id}>
                          <button type="button" className="btn-outline" onClick={() => onAction?.({ key: "example", tractId: p.id })}>
                            {p.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : idea.action ? (
                    <button type="button" className="btn-outline" onClick={() => onAction?.(idea.action)}>
                      {idea.action.key === "holc" && holcOn ? idea.action.activeLabel : idea.action.label}
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="start-here-nav">
        <button type="button" className="btn-plain" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Previous
        </button>
        <span aria-live="polite" style={{ fontSize: 13, color: "var(--muted)" }}>
          Idea {step + 1} of {ideas.length}
        </span>
        <button type="button" className="btn-solid" onClick={() => setStep((s) => Math.min(last, s + 1))} disabled={step === last}>
          Next
        </button>
      </div>
    </section>
  );
}
