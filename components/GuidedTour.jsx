import { useState, useEffect, useCallback } from "react";

/**
 * A ~3-minute guided tour of what the tool was built for and how to use it.
 * Three purposes, in order: (1) educate on Austin's history and the
 * communities shaped by each era, (2) show how people living here have
 * been affected over the past 35 years, (3) start the board conversation
 * about where to focus outreach and advocacy.
 *
 * Each step drives the app itself (switches tabs, moves the year, toggles
 * overlays, selects a tract) via the `ctx` callbacks from index.jsx, so
 * the tour shows the real tool rather than screenshots of it.
 */
const STEPS = [
  {
    title: "Austin's Shifting Ground",
    body: "This map tells the story of who has lived in Austin — and who has been pushed out. It was built as an education and conversation tool: the city's history first, then thirty-five years of measured change, and finally a starting point for deciding where outreach and advocacy matter most. The next two and a half minutes walk through all three.",
    apply: (c) => { c.setIsPlaying(false); c.setViewMode("map"); c.setYear(2023); },
  },
  {
    title: "Start with the history",
    body: "The History tab holds 112 events across 13,600 years — from Clovis-era occupation through the eras that shaped each of Austin's communities: Indigenous peoples, freedom colonies, Mexican American East Austin, LGBTQ+ Austin, and more. The research was compiled with AI assistance and has not yet been reviewed by Preservation Austin; every event carries a documentation flag, because a missing record is not missing history.",
    apply: (c) => { c.setIsPlaying(false); c.setViewMode("history"); },
  },
  {
    title: "The lines were drawn in 1928",
    body: "Back on the map: the pink shapes are the 1935 federal redlining map, laid over today's census tracts. The 1928 Master Plan had already pushed Black Austinites east by withholding city services elsewhere; redlining then starved those same blocks of credit, and I-35 became the concrete color line. Modern displacement follows lines drawn a century ago.",
    apply: (c) => { c.setIsPlaying(false); c.setViewMode("map"); c.setYear(1990); c.setShowHolc(true); },
  },
  {
    title: "Watch 35 years move",
    body: "The colors show each area's displacement stage. Light orange means residents are vulnerable but little has changed; darker means further along; the darkest is where most vulnerable residents have already gone. Areas with no color are not in a stage. The map is now playing 1990 to today. Census figures start in 2000 and the map changes at each census year; watch the darker stages spread through East Austin.",
    apply: (c) => { c.setViewMode("map"); c.setShowHolc(false); c.setYear(1990); c.setIsPlaying(true); },
  },
  {
    title: "One neighborhood's story",
    body: "Select any place and the panel beside the map sums it up. This is Central East Austin — the East 11th/12th corridor. “Open the story card” gives the full profile on a printable page: who left, who arrived, what home values did, and the turning point behind it. Every card has its own link.",
    apply: (c) => { c.setIsPlaying(false); c.setYear(2023); c.locate(85); },
  },
  {
    title: "Two neighborhoods, two paths",
    body: "Compare places two neighborhoods side by side — displacement stage, home values, income, and demographics. Solid dots are measured census years; the lighter lines between them are interpolated. Useful for showing a board how differently the same decades treated two communities.",
    apply: (c) => { c.setIsPlaying(false); c.setViewMode("compare"); },
  },
  {
    title: "Where to focus outreach",
    body: "Triage ranks every region through three screening lenses — this one asks which underserved communities need investment most. Treat the scores as what they are: a screening prototype and a conversation starter for staff and board, pending validation — not a verdict on any neighborhood.",
    apply: (c) => { c.setIsPlaying(false); c.setViewMode("triage"); c.setTriageLens("equity"); },
  },
  {
    title: "Now it's your conversation",
    body: "Every view is shareable: the address bar always encodes the tab, year, layers, and selection, so a pasted link reproduces exactly what you were looking at. Find a neighborhood whose story should be told, copy the URL, and bring it to the next board discussion.",
    apply: (c) => { c.setIsPlaying(false); c.setViewMode("map"); },
  },
];

export default function GuidedTour({ ctx, onClose }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  const go = useCallback((next) => {
    if (next < 0) return;
    if (next >= STEPS.length) { onClose(); return; }
    setStep(next);
    STEPS[next].apply(ctx);
  }, [ctx, onClose]);

  // Apply the first step on mount
  useEffect(() => { STEPS[0].apply(ctx); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, go, onClose]);

  return (
    <div
      role="dialog"
      aria-label={`Guided tour, step ${step + 1} of ${STEPS.length}: ${s.title}`}
      style={{
        position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
        zIndex: 2000, width: 480, maxWidth: "calc(100vw - 40px)",
        background: "#fffffe", border: "1px solid #d6d3cd", borderRadius: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,.22)", padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".06em" }}>
          Guided tour · step {step + 1} of {STEPS.length} · ~3 min
        </span>
        <button
          onClick={onClose}
          aria-label="End tour"
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--muted)", padding: 2, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px" }}>
        {s.title}
      </h2>
      <p style={{ fontSize: 14, color: "#44403c", lineHeight: 1.55, margin: "0 0 12px" }}>{s.body}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, marginRight: "auto" }} aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === step ? "#0f766e" : "#d6d3cd" }} />
          ))}
        </div>
        {step > 0 && (
          <button
            onClick={() => go(step - 1)}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d6d3cd", background: "#fffffe", color: "#64615b", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            Back
          </button>
        )}
        <button
          onClick={() => go(step + 1)}
          style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "#0f766e", color: "#fffffe", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {step === STEPS.length - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
