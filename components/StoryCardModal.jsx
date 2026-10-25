import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL, PA_LABELS, REGION_INDEX, TIPPING_POINTS } from "../data";
import { ID_TO_NAME, getMergedIds } from "../data/regionLookup";
import { regionLookupMap } from "../data/regionIndex";
import {
  interpolateDvi, getDviBand, getDviColor, isRegionExcluded,
  calcDirectDisplacement, computeTippingStats,
} from "../utils/math";

/**
 * StoryCardModal — a printable one-pager that arms a tabler with the
 * locally specific story for one neighborhood: what the data shows, the
 * cultural anchors still standing, what has been lost, and what
 * Preservation Austin has already done nearby. Supports the plan's
 * "Tell a Clear, Consistent Story" and "Preserve the Whole Story of
 * Austin" objectives.
 *
 * Printing uses a body class + visibility rules in styles.css so only
 * the card sheet prints.
 */

const NEAR_DEG = 0.012; // ~1.3 km, same radius utils/math.js uses for PA counts

export default function StoryCardModal({ regionId, onClose }) {
  // Print-isolation class while the modal is open
  useEffect(() => {
    document.body.classList.add("story-card-open");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("story-card-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const card = useMemo(() => {
    const meta = regionLookupMap.get(regionId);
    const name = ID_TO_NAME.get(regionId) || meta?.display_name || `Tract ${regionId}`;
    const tractLabel = meta?.tract_label;

    const dviNow = interpolateDvi(regionId, 2023);
    const dvi2000 = interpolateDvi(regionId, 2000);
    const excluded = isRegionExcluded(regionId, 2023);
    const dd = calcDirectDisplacement(regionId);

    const allIds = getMergedIds(regionId);
    const open = LEGACY_OPERATING.filter((b) => allIds.includes(b.region_id));
    const closed = LEGACY_CLOSED.filter((b) => allIds.includes(b.region_id));

    const region = REGION_INDEX.find((r) => r.region_id === regionId);
    const paNear = region
      ? PA_ALL.filter((i) => i.lat && i.lng &&
          Math.hypot(i.lat - region.lat, i.lng - region.lng) < NEAR_DEG)
          .sort((a, b) => b.year - a.year)
      : [];

    const tp = TIPPING_POINTS.find((t) => t.region_ids?.includes(regionId)) || null;
    const tpStats = tp ? computeTippingStats(tp) : null;

    return { name, tractLabel, dviNow, dvi2000, excluded, dd, open, closed, paNear, tp, tpStats };
  }, [regionId]);

  const { name, tractLabel, dviNow, dvi2000, excluded, dd, open, closed, paNear, tp, tpStats } = card;

  // Plain-language headline for the data story
  const dataStory = excluded
    ? "This area is affluent and high-ownership — the index treats its rising values as appreciation, not displacement risk."
    : dviNow >= 55
      ? "Displacement here is largely historic: much of the change this map tracks has already happened."
      : dviNow >= 35
        ? "This neighborhood is under active displacement pressure right now — the window to act is open."
        : dviNow >= 20
          ? "Early pressure is visible here; conditions are shifting but community fabric is still intact."
          : "Conditions here are comparatively stable today.";

  const trendTxt = dvi2000 > 0
    ? `Displacement vulnerability moved from ${dvi2000.toFixed(0)} (2000) to ${dviNow.toFixed(0)} (2023) on the 0–100 index.`
    : `Displacement vulnerability stands at ${dviNow.toFixed(0)} (2023) on the 0–100 index.`;

  // Portal to <body>: the detail panel and Leaflet's floating controls
  // create their own stacking contexts, so rendering in place leaves the
  // modal painted behind the map no matter its z-index.
  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 3000, background: "rgba(26,26,26,.5)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "4vh 16px", overflowY: "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Neighborhood story card for ${name}`}
    >
      <div style={{ width: "100%", maxWidth: 660 }}>
        {/* Toolbar (never prints) */}
        <div className="story-card-toolbar" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#0f766e", color: "#fffffe", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
          >
            🖨 Print card
          </button>
          <button
            onClick={onClose}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #d6d3cd", background: "#fffffe", color: "#64615b", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        {/* The printable sheet */}
        <div className="story-card-sheet" style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #d6d3cd", padding: "26px 30px", fontFamily: "'Libre Franklin','Source Sans 3',sans-serif", color: "#1a1a1a" }}>
          <div style={{ borderBottom: "2.5px solid #9a3412", paddingBottom: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "#9a3412", textTransform: "uppercase" }}>
              Preservation Austin · Neighborhood story card
            </div>
            <h1 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 26, fontWeight: 600, margin: "4px 0 0", lineHeight: 1.15 }}>
              {name}
            </h1>
            {tractLabel && <div style={{ fontSize: 11.5, color: "#a8a49c", marginTop: 2 }}>{tractLabel}</div>}
          </div>

          {/* The data story */}
          <Section title="What the data shows">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 46, height: 46, borderRadius: 8, fontWeight: 700, fontSize: 18,
                background: excluded ? "#1565C0" : getDviColor(dviNow),
                color: excluded || dviNow >= 55 ? "#fffffe" : "#1a1a1a",
                border: "1px solid rgba(0,0,0,.12)",
              }}>
                {dviNow.toFixed(0)}
              </span>
              <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                <strong>{excluded ? "Exclusive / Appreciated" : getDviBand(dviNow)}</strong><br />
                <span style={{ color: "#64615b" }}>{trendTxt}</span>
              </div>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 4px" }}>{dataStory}</p>
            {dd && (
              <p style={{ fontSize: 12, color: "#64615b", lineHeight: 1.5, margin: 0 }}>
                Measured change {dd.fromYear}–{dd.toYear}: the Black + Hispanic share of residents went
                from {dd.bhFrom.toFixed(0)}% to {dd.bhTo.toFixed(0)}%
                ({dd.bhDelta > 0 ? "+" : ""}{dd.bhDelta.toFixed(1)} pts)
                {dd.renterDelta != null && (
                  <> ; renters went from {dd.renterFrom.toFixed(0)}% to {dd.renterTo.toFixed(0)}% of households</>
                )}.
              </p>
            )}
          </Section>

          {/* Historic turning point */}
          {tp && (
            <Section title="The turning point">
              <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                <strong>{tp.region}{tp.decade ? ` (${tp.decade})` : ""}:</strong>{" "}
                {tp.context || ""}
                {tpStats?.homeValue && (
                  <> Average home values in this corridor went from ${Math.round(tpStats.homeValue.from / 1000)}k
                  to ${Math.round(tpStats.homeValue.to / 1000)}k ({tpStats.homeValue.pct > 0 ? "+" : ""}{tpStats.homeValue.pct}%)
                  between {tpStats.fromYear} and {tpStats.toYear}.</>
                )}
              </p>
            </Section>
          )}

          {/* Anchors */}
          <Section title={`Cultural anchors still here (${open.length})`}>
            {open.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, columns: open.length > 6 ? 2 : 1 }}>
                {open.slice(0, 12).map((b) => (
                  <li key={b.id}>
                    <strong>{b.name}</strong> (est. {b.est})
                    {(b.pressure === "High" || b.pressure === "Critical") && (
                      <span style={{ color: "#b45309", fontWeight: 700 }}> · under pressure</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12.5, color: "#64615b", margin: 0 }}>No tracked cultural anchors in this area — part of the story may be undocumented. Ask who holds it.</p>
            )}
          </Section>

          {closed.length > 0 && (
            <Section title={`What has been lost (${closed.length})`}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: "#64615b" }}>
                {closed.slice(0, 10).map((b) => `${b.name} (${b.closed})`).join(" · ")}
                {closed.length > 10 ? ` · and ${closed.length - 10} more` : ""}
              </p>
            </Section>
          )}

          {/* PA's work nearby */}
          <Section title={`Preservation Austin nearby (${paNear.length})`}>
            {paNear.length ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55 }}>
                {paNear.slice(0, 6).map((i) => (
                  <li key={i.id}>
                    <strong>{i.name}</strong> — {PA_LABELS?.[i.type] || i.type}, {i.year}
                    {i.amount ? ` ($${i.amount.toLocaleString()})` : ""}
                  </li>
                ))}
                {paNear.length > 6 && <li style={{ color: "#a8a49c" }}>and {paNear.length - 6} more</li>}
              </ul>
            ) : (
              <p style={{ fontSize: 12.5, color: "#64615b", margin: 0 }}>
                No PA grants, awards, or advocacy on record near here yet — an honest opening line:
                "we want that to change, starting with listening."
              </p>
            )}
          </Section>

          <div style={{ borderTop: "1px solid #e8e5e0", marginTop: 14, paddingTop: 8, fontSize: 10, color: "#a8a49c", lineHeight: 1.5 }}>
            Sources: U.S. Census / ACS, audited to 2023; Preservation Austin program records; community business inventories.
            DVI = Displacement Vulnerability Index (0–100, current committee weight settings) — a planning signal, not a verdict on any block or household.
            Generated from Austin's Shifting Ground, {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
