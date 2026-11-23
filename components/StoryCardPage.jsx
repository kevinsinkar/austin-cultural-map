import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { PA_LABELS } from "../data";
import { DEMO_COLORS, LATEST_SURVEY } from "../data/constants";
import { StageHeadline, StageTests, StageTimeline, CityRiskLine } from "./StageBlock";
import { buildStoryCard, changeSentence } from "../utils/placeData";
import { districtText } from "../utils/places";
import { PRESENTER_MODE } from "../appConfig";

/**
 * StoryCardPage — the one-page profile of a place, at its own address.
 *
 * It used to be a pop-up over the map, which could not be linked to. It is
 * now a page ("#/card?tract=84" or "#/card?hood=montopolis"), so a link or QR
 * code opens the card directly, and the browser's Back button returns to
 * the map. The same card serves census tracts and neighborhoods.
 *
 * Printing shows only the sheet (body class + rules in styles.css).
 *
 * The card carries Preservation Austin's name in its heading only in
 * presenter mode. The public build uses the site's own name until
 * Preservation Austin has agreed to appear on the public site.
 */

const MUTED = "var(--muted)";

/** Compact hover tip shared by every chart on the card. */
function CardTip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1a1a", color: "#fffffe", borderRadius: 6,
      padding: "5px 9px", fontSize: 12, lineHeight: 1.5,
      boxShadow: "0 2px 8px rgba(0,0,0,.25)", pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700 }}>{label ?? payload[0]?.payload?.year}</div>
      {payload.map((p) => (
        <div key={p.dataKey}>{format(p)}</div>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="story-card-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function StoryCardPage({ placeRef, onBack }) {
  const kind = placeRef?.kind;
  const id = placeRef?.id;
  const card = useMemo(() => buildStoryCard({ kind, id }), [kind, id]);
  const [copied, setCopied] = useState("");

  // Print isolation (styles.css) and a page title that names the place.
  useEffect(() => {
    document.body.classList.add("story-card-open");
    const before = document.title;
    if (card) document.title = `${card.place.title} · Austin's Shifting Ground`;
    window.scrollTo(0, 0);
    return () => {
      document.body.classList.remove("story-card-open");
      document.title = before;
    };
  }, [card]);

  if (!card) {
    return (
      <section className="story-card-page" aria-labelledby="story-missing">
        <div className="story-card-sheet">
          <h2 id="story-missing" className="story-card-title">This link does not match a place on the map</h2>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            The place may have been renamed since the link was made. Go back to the map and
            search for it by neighborhood or address.
          </p>
          <button type="button" className="btn-solid" onClick={onBack}>Back to the map</button>
        </div>
      </section>
    );
  }

  const { place, tractCount, stage, stageSeries, cityRisk, change, open, closed, paNear, tp, tpStats, demoData, econStats } = card;
  const name = place.title;
  const isGroup = tractCount > 1;
  const demoYears = demoData.map((r) => r.year);
  const where = [place.subtitle, districtText(place) && `${districtText(place)} (by tract center)`].filter(Boolean).join(" · ");
  const sentence = changeSentence(change);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Link copied.");
    } catch {
      setCopied(`Copy this link: ${window.location.href}`);
    }
  };

  return (
    <article className="story-card-page" aria-labelledby="story-card-title">
      {/* Toolbar (never prints) */}
      <div className="story-card-toolbar">
        <button type="button" className="btn-plain" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to the map
        </button>
        <span style={{ flex: 1 }} />
        <span role="status" aria-live="polite" style={{ fontSize: 13, color: MUTED, overflowWrap: "anywhere" }}>{copied}</span>
        <button type="button" className="btn-plain" onClick={copyLink}>Copy link</button>
        <button type="button" className="btn-solid" onClick={() => window.print()}>Print</button>
      </div>

      {/* The printable sheet */}
      <div className="story-card-sheet">
        <header className="story-card-head">
          <div className="story-card-eyebrow">
            {PRESENTER_MODE ? "Preservation Austin" : "Austin's Shifting Ground"} · Neighborhood story card
          </div>
          <h2 id="story-card-title" className="story-card-title">{name}</h2>
          {where && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{where}</div>}
        </header>

        <Section title="What the data shows">
          {stage && (
            <>
              <StageHeadline stage={stage} />
              <p className="story-card-text" style={{ marginTop: 8 }}>{stage.why}</p>
            </>
          )}
          {sentence && <p className="story-card-text">{sentence}</p>}
          <CityRiskLine cityRisk={cityRisk} tractCount={tractCount} />
          <StageTimeline series={stageSeries} name={name} />
        </Section>

        {stage?.scored && (
          <Section title="How the stage was decided">
            <StageTests stage={stage} />
            <p className="story-card-caption">
              “Region” is the five-county Austin area (Bastrop, Caldwell, Hays, Travis and Williamson). “Past the
              line” means more than half a standard deviation above the regional figure. Lower-income households
              earn under 80% of the region's median family income.
              {isGroup && ` Worked out on the combined figures of ${tractCount} census tracts.`}
            </p>
          </Section>
        )}

        {demoData.length >= 2 && (
          <Section title="Who lives here: population share over time">
            <div style={{ width: "100%", height: 170 }} role="img" aria-label={`Population share by group in ${name}, for the census years ${demoYears.join(", ")}`}>
              <ResponsiveContainer>
                <AreaChart data={demoData} margin={{ top: 4, right: 22, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edeae4" />
                  <XAxis
                    dataKey="year" type="number" domain={["dataMin", "dataMax"]}
                    ticks={demoYears} tick={{ fontSize: 12, fill: MUTED }}
                    tickLine={false} axisLine={{ stroke: "#d6d3cd" }}
                  />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} ticks={[0, 0.5, 1]} tick={{ fontSize: 12, fill: MUTED }} tickLine={false} axisLine={false} domain={[0, 1]} />
                  <Tooltip content={<CardTip format={(p) => `${p.name}: ${(p.value * 100).toFixed(0)}%`} />} />
                  <Area type="monotone" dataKey="Other" stackId="1" stroke="none" fill={DEMO_COLORS.Other} fillOpacity={0.85} activeDot={false} name="Other or multiracial" isAnimationActive={false} />
                  <Area type="monotone" dataKey="Asian" stackId="1" stroke="none" fill={DEMO_COLORS.Asian} fillOpacity={0.85} activeDot={false} name="Asian" isAnimationActive={false} />
                  <Area type="monotone" dataKey="Hispanic" stackId="1" stroke="none" fill={DEMO_COLORS.Hispanic} fillOpacity={0.85} activeDot={false} name="Hispanic or Latino" isAnimationActive={false} />
                  <Area type="monotone" dataKey="Black" stackId="1" stroke="none" fill={DEMO_COLORS.Black} fillOpacity={0.85} activeDot={false} name="Black" isAnimationActive={false} />
                  <Area type="monotone" dataKey="White" stackId="1" stroke="none" fill={DEMO_COLORS.White} fillOpacity={0.85} activeDot={false} name="White, non-Hispanic" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: "4px 12px", flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
              {[["White, non-Hispanic", "White"], ["Black", "Black"], ["Hispanic or Latino", "Hispanic"], ["Asian", "Asian"], ["Other or multiracial", "Other"]].map(([label, key]) => (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#44403c" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: DEMO_COLORS[key] }} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
            <p className="story-card-caption">Census years with data: {demoYears.join(", ")}.</p>
          </Section>
        )}

        {econStats.length > 0 && (
          <Section title="The economics">
            <div className="story-card-econ">
              {econStats.map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.15 }}>
                    {s.value} <span style={{ fontSize: 12, fontWeight: 400, color: MUTED }}>in {s.year}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#44403c", lineHeight: 1.3 }}>{s.label}</div>
                  {s.delta && <div style={{ fontSize: 12, color: "#9a3412", fontWeight: 600 }}>{s.delta}</div>}
                  {s.series.length >= 2 && (
                    <div style={{ width: "100%", height: 32, marginTop: 2 }} role="img"
                      aria-label={`${s.label}: ${s.fmtFn(s.series[0].value)} in ${s.series[0].year}, ${s.value} in ${s.year}`}>
                      <ResponsiveContainer>
                        <LineChart data={s.series} margin={{ top: 3, right: 3, left: 3, bottom: 1 }}>
                          <XAxis dataKey="year" type="number" domain={["dataMin", "dataMax"]} hide />
                          <YAxis domain={["auto", "auto"]} hide />
                          <Tooltip content={<CardTip format={(p) => s.fmtFn(p.value)} />} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 10 }} />
                          <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={1.5}
                            dot={{ r: 1.5, fill: "#0f766e", strokeWidth: 0 }} activeDot={{ r: 3 }} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="story-card-caption">
              Latest value for each measure, with the change since its earliest measured year. Each small
              line covers only that measure's years, on its own scale. Dollars are not adjusted for inflation.
              {isGroup && ` Figures combine ${tractCount} census tracts, weighted by population.`}
            </p>
          </Section>
        )}

        {tp && (
          <Section title="The turning point">
            <p className="story-card-text">
              <strong>{tp.region}{tp.decade ? ` (${tp.decade})` : ""}:</strong>{" "}
              {tp.context || ""}
              {tpStats?.homeValue && (
                <> Average home values in this corridor went from ${Math.round(tpStats.homeValue.from / 1000)}k
                to ${Math.round(tpStats.homeValue.to / 1000)}k ({tpStats.homeValue.pct > 0 ? "up" : "down"} {Math.abs(tpStats.homeValue.pct)}%)
                between {tpStats.fromYear} and {tpStats.toYear}.</>
              )}
            </p>
          </Section>
        )}

        <Section title={`Cultural anchors still here (${open.length})`}>
          {open.length ? (
            <ul className="story-card-list" style={{ columns: open.length > 6 ? 2 : 1 }}>
              {open.slice(0, 12).map((b) => (
                <li key={b.id}>
                  <strong>{b.name}</strong> (since {b.est}{b.unverified ? ", unverified" : ""})
                </li>
              ))}
            </ul>
          ) : (
            <p className="story-card-text">
              No cultural anchors are tracked in this area. Part of the story may be undocumented.
              {PRESENTER_MODE && " Ask who holds it."}
            </p>
          )}
        </Section>

        {closed.length > 0 && (
          <Section title={`What has been lost (${closed.length})`}>
            <p className="story-card-text">
              {closed.slice(0, 10).map((b) => `${b.name} (${[b.closed, b.unverified && "unverified"].filter(Boolean).join(", ") || "year not recorded"})`).join(" · ")}
              {closed.length > 10 ? ` · and ${closed.length - 10} more` : ""}
            </p>
          </Section>
        )}

        {[...open, ...closed].some((b) => b.unverified) && (
          <p className="story-card-caption">“Unverified” marks a record for which no published source was found.</p>
        )}

        <Section title={`Preservation Austin grants, awards and advocacy nearby (${paNear.length})`}>
          {paNear.length ? (
            <ul className="story-card-list">
              {paNear.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <strong>{i.name}</strong>: {PA_LABELS?.[i.type] || i.type}, {i.year}
                  {i.amount ? ` ($${i.amount.toLocaleString()})` : ""}
                </li>
              ))}
              {paNear.length > 6 && <li style={{ color: MUTED }}>and {paNear.length - 6} more</li>}
            </ul>
          ) : (
            <p className="story-card-text">
              No Preservation Austin grants, awards or advocacy are on record near here.
              {PRESENTER_MODE && " An honest opening line: “we want that to change, starting with listening.”"}
            </p>
          )}
        </Section>

        <footer className="story-card-foot">
          <p>{place.note}</p>
          <p>
            Sources: U.S. Census and American Community Survey, through the {LATEST_SURVEY} survey; City of Austin;
            Preservation Austin's published grant, award and advocacy listings; community business
            inventories. Stages follow the three-part test in the University of Texas study
            “Uprooted” (2018), worked out here from census tables; the City of Austin publishes its
            own version. A stage describes an area as a whole, not any block or household.
          </p>
          <p>
            From Austin's Shifting Ground, {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
          </p>
        </footer>
      </div>
    </article>
  );
}
