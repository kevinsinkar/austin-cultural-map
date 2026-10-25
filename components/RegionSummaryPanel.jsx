import { useState } from "react";
import StoryCardModal from "./StoryCardModal";
import ConfidenceChip from "./ConfidenceChip";
import { PA_ALL, REGION_INDEX } from "../data";
import { AUDITED_SOCIO_BY_ID, AUDITED_PROP_BY_ID, closestRow } from "../data/auditedData";
import {
  getDviBand, getDviColor, isRegionExcluded, DVI_EXCLUDED,
  getDviConfidence, calcDirectDisplacement,
} from "../utils/math";

/**
 * RegionSummaryPanel — the slimmed-down right panel for tract mode.
 * The full profile (charts, economics, culture, talking points) now
 * lives in the printable story card; this panel gives selection
 * feedback, the headline numbers at the slider year, and the way in.
 * RegionDetailPanel remains in use for neighborhood mode and is kept
 * intact for future repurposing.
 */

const NEAR_DEG = 0.012;

export default function RegionSummaryPanel({
  activeFeature,
  activeRegionName,
  activeRegionId,
  year,
  currentDvi,
  regionBizOpen,
  regionBizClosed,
  tippingPoint,
  setSelectedRegion,
  setHoveredRegion,
}) {
  const [showStoryCard, setShowStoryCard] = useState(false);

  if (!activeFeature || activeRegionId == null) {
    return (
      <div
        className="detail-panel"
        style={{ flex: "0 1 380px", minWidth: 300, maxHeight: "calc(100vh - 100px)", overflowY: "auto", position: "sticky", top: 16 }}
        role="region"
        aria-label="Region summary panel"
      >
        <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }} aria-hidden="true">🗺️</div>
          <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 18, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Select a neighborhood</div>
          <div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5, maxWidth: 280, margin: "0 auto" }}>
            Click any region on the map, then open its story card for the
            full profile — data story, charts, economics, and cultural anchors.
          </div>
        </div>
      </div>
    );
  }

  const dvi = currentDvi[activeRegionId] || 0;
  const excluded = isRegionExcluded(activeRegionId, year);
  const conf = getDviConfidence(activeRegionId, year);
  const dd = calcDirectDisplacement(activeRegionId);

  const region = REGION_INDEX.find((r) => r.region_id === activeRegionId);
  const paNearCount = region
    ? PA_ALL.filter((i) => i.lat && i.lng &&
        Math.hypot(i.lat - region.lat, i.lng - region.lng) < NEAR_DEG).length
    : 0;

  const socioNow = closestRow(AUDITED_SOCIO_BY_ID.get(activeRegionId), year);
  const propNow = closestRow(AUDITED_PROP_BY_ID.get(activeRegionId), year);

  const quick = [
    socioNow?.median_household_income != null && {
      label: "Median income", value: `$${Math.round(socioNow.median_household_income / 1000)}k`, yr: socioNow.year,
    },
    propNow?.median_home_value != null && {
      label: "Median home value", value: `$${Math.round(propNow.median_home_value / 1000)}k`, yr: propNow.year,
    },
    { label: "Cultural anchors", value: `${regionBizOpen.length} open · ${regionBizClosed.length} lost` },
    { label: "PA work nearby", value: `${paNearCount} item${paNearCount === 1 ? "" : "s"}` },
  ].filter(Boolean);

  return (
    <div
      className="detail-panel"
      style={{ flex: "0 1 380px", minWidth: 300, maxHeight: "calc(100vh - 100px)", overflowY: "auto", position: "sticky", top: 16 }}
      role="region"
      aria-label="Region summary panel"
    >
      <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 20, fontWeight: 600, color: "#1a1a1a", margin: 0, lineHeight: 1.25 }}>
            {activeRegionName}
            <span style={{ fontSize: 12, fontWeight: 400, color: "#a8a49c" }}> [id. {activeRegionId}]</span>
          </h2>
          <button
            onClick={() => { setSelectedRegion(null); setHoveredRegion(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#a8a49c", padding: 4, lineHeight: 1, minWidth: 32, minHeight: 32 }}
            aria-label="Close summary panel"
          >
            ✕
          </button>
        </div>

        {/* DVI headline at the slider year */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 48, height: 48, borderRadius: 8, fontWeight: 700, fontSize: 19,
            background: excluded ? DVI_EXCLUDED.fill : getDviColor(dvi),
            color: excluded || dvi >= 55 ? "#fffffe" : "#1a1a1a",
            border: "1px solid rgba(0,0,0,.12)", flexShrink: 0,
          }}>
            {dvi.toFixed(0)}
          </span>
          <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            <strong style={{ color: excluded ? DVI_EXCLUDED.text : undefined }}>
              {excluded ? "Exclusive / Appreciated" : getDviBand(dvi)}
            </strong>
            <span style={{ color: "#a8a49c" }}> · DVI at {year}</span>
            <div style={{ marginTop: 2 }}>
              {conf && <ConfidenceChip level={conf.level} suffix="confidence" reasons={conf.reasons} />}
            </div>
          </div>
        </div>

        {/* Measured change */}
        {dd && (
          <p style={{ fontSize: 12, color: "#64615b", lineHeight: 1.5, margin: "10px 0 0" }}>
            Measured {dd.fromYear}–{dd.toYear}: Black + Hispanic share {dd.bhFrom.toFixed(0)}% → {dd.bhTo.toFixed(0)}%
            <strong style={{ color: dd.bhDelta < 0 ? "#b91c1c" : "#15803d" }}> ({dd.bhDelta > 0 ? "+" : ""}{dd.bhDelta.toFixed(1)} pts)</strong>
            {dd.renterDelta != null && <>; renter share {dd.renterFrom.toFixed(0)}% → {dd.renterTo.toFixed(0)}%</>}.
          </p>
        )}

        {/* Quick facts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginTop: 12, paddingTop: 10, borderTop: "1px solid #edeae4" }}>
          {quick.map((q) => (
            <div key={q.label}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.15 }}>
                {q.value}{q.yr ? <span style={{ fontSize: 9.5, fontWeight: 400, color: "#a8a49c" }}> '{String(q.yr).slice(2)}</span> : null}
              </div>
              <div style={{ fontSize: 10.5, color: "#64615b" }}>{q.label}</div>
            </div>
          ))}
        </div>

        {tippingPoint && (
          <p style={{ fontSize: 11.5, color: "#9a3412", margin: "10px 0 0", lineHeight: 1.4 }}>
            ⚡ Tipping point: {tippingPoint.region} ({tippingPoint.decade})
          </p>
        )}

        {/* The way to the full profile */}
        <button
          onClick={() => setShowStoryCard(true)}
          style={{
            width: "100%", marginTop: 14, padding: "10px 14px", borderRadius: 8,
            border: "none", background: "#0f766e", color: "#fffffe",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          📄 Open story card
        </button>
        <p style={{ fontSize: 10.5, color: "#a8a49c", margin: "6px 0 0", lineHeight: 1.45, textAlign: "center" }}>
          Full profile — data story, charts over the measured years, economics,
          cultural anchors, and PA's work nearby. Printable for tabling.
        </p>
      </div>

      {showStoryCard && (
        <StoryCardModal regionId={activeRegionId} onClose={() => setShowStoryCard(false)} />
      )}
    </div>
  );
}
