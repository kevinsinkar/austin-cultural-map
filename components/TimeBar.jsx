import { useEffect, useRef, useState } from "react";
import ConfidenceChip from "./ConfidenceChip";
import { SNAP_YEARS, TIMELINE_EVENTS } from "../data/constants";
import { isViewAllowed } from "../appConfig";

const YEAR_MIN = 1990;
const YEAR_MAX = 2025;
const pctOf = (y) => ((Math.max(y, YEAR_MIN) - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;

/**
 * TimeBar — year slider, play button and key-moment markers.
 *
 * Docked directly under the map (it used to float over the bottom of it,
 * hiding south Austin and the map's attribution).
 */
export default function TimeBar({ year, setYear, isPlaying, setIsPlaying, onOpenHistory }) {
  // Which key-moment popover is open (index into TIMELINE_EVENTS)
  const [openTick, setOpenTick] = useState(null);
  const tickRowRef = useRef(null);

  useEffect(() => {
    if (openTick == null) return;
    const onDoc = (e) => {
      if (tickRowRef.current && !tickRowRef.current.contains(e.target)) setOpenTick(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenTick(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openTick]);

  const fill = pctOf(year);

  return (
    <div className="time-bar" role="group" aria-label="Year controls">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 30, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-.03em", lineHeight: 1 }}>{year}</span>
          {year >= 2020 && <span style={{ fontSize: 12, color: "var(--muted)" }}>Census estimates for 2019–2023</span>}
          {year < 1993 && <span style={{ fontSize: 12, color: "var(--muted)" }}>The index starts in 1993</span>}
          {year >= 1993 && year < 2010 && (
            <ConfidenceChip
              level="Medium"
              suffix="confidence"
              reasons={["Pre-2010 census boundaries were crosswalked to modern tract geometry — tract values before 2010 are approximate."]}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (isPlaying) setIsPlaying(false);
            else {
              if (year >= YEAR_MAX) setYear(YEAR_MIN);
              setIsPlaying(true);
            }
          }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, border: "1.5px solid #0f766e", background: isPlaying ? "#0f766e" : "#fffffe", color: isPlaying ? "#fff" : "#0f766e", fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 36, flexShrink: 0 }}
          aria-label={isPlaying ? "Pause the year animation" : "Play through the years"}
        >
          {isPlaying ? (
            <><svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><rect x="0" y="0" width="3" height="12" fill="currentColor" rx="1" /><rect x="7" y="0" width="3" height="12" fill="currentColor" rx="1" /></svg>Pause</>
          ) : (
            <><svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><polygon points="0,0 10,6 0,12" fill="currentColor" /></svg>Play</>
          )}
        </button>
      </div>

      <input
        type="range"
        min={YEAR_MIN}
        max={YEAR_MAX}
        value={year}
        onChange={(e) => setYear(parseInt(e.target.value, 10))}
        className="slider-track"
        style={{ width: "100%", background: `linear-gradient(to right,#0f766e ${fill}%,#d6d3cd ${fill}%)` }}
        aria-label="Year shown on the map"
      />

      <div style={{ position: "relative", height: 26, marginTop: 2 }}>
        {SNAP_YEARS.map((sy) => (
          <button
            key={sy}
            type="button"
            onClick={() => { setYear(sy); setIsPlaying(false); }}
            className="time-bar-year"
            data-year={sy}
            style={{
              left: `${pctOf(sy)}%`,
              color: year === sy ? "#0f766e" : "var(--muted)",
              fontWeight: year === sy ? 700 : 400,
              // keep the end labels inside the bar
              transform: sy === YEAR_MIN ? "none" : "translateX(-50%)",
            }}
            aria-label={`Jump to ${sy}`}
            aria-current={year === sy ? "true" : undefined}
          >
            {sy}
          </button>
        ))}
      </div>

      {/* Key moments: each mark opens a short card. Events before 1990
          (the 1928 plan) pin to the left edge. */}
      <div ref={tickRowRef} className="time-bar-moments" role="group" aria-label="Key moments. Select a mark to read about it.">
        {TIMELINE_EVENTS.map((evt, i) => {
          const pct = pctOf(evt.year);
          const isOpen = openTick === i;
          return (
            <span key={i} style={{ position: "absolute", left: `${pct}%`, top: 0, transform: "translateX(-50%)" }}>
              <button
                type="button"
                onClick={() => setOpenTick(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-label={`${evt.year}: ${evt.label}`}
                title={`${evt.year}: ${evt.label}`}
                className="time-bar-tick"
              >
                <span aria-hidden="true" style={{ width: isOpen ? 4 : 3, height: 12, background: isOpen ? "#0f766e" : "#8a867e", opacity: isOpen || Math.abs(evt.year - year) <= 5 ? 1 : 0.5, borderRadius: 1.5 }} />
              </button>
              {isOpen && (
                <div
                  role="dialog"
                  aria-label={`${evt.year}: ${evt.label}`}
                  style={{
                    position: "absolute", bottom: "calc(100% + 8px)", zIndex: 1400,
                    ...(pct > 65 ? { right: -8 } : { left: -8 }),
                    width: "min(280px, 80vw)", background: "#fffffe", border: "1px solid #d6d3cd",
                    borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.16)",
                    padding: "10px 12px", textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
                    {evt.year}: {evt.label}
                  </div>
                  <p style={{ fontSize: 13, color: "#44403c", lineHeight: 1.5, margin: 0 }}>{evt.blurb}</p>
                  {onOpenHistory && isViewAllowed("history") && (
                    <button
                      type="button"
                      onClick={() => { setOpenTick(null); onOpenHistory(evt.historyEventId); }}
                      style={{ marginTop: 8, padding: "5px 10px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 28 }}
                    >
                      Read more in History
                    </button>
                  )}
                </div>
              )}
            </span>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 0", lineHeight: 1.3 }}>
        The marks are key moments in city policy. Select one to read about it.
      </p>
    </div>
  );
}
