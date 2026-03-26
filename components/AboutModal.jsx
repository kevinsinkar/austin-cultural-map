import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import methodologyText from "../DATA_METHODOLOGY.md?raw";

export default function AboutModal({ onClose }) {
  const [showMethodology, setShowMethodology] = useState(false);
  const panelRef = useRef(null);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="About this data"
    >
      <div
        style={{
          background: "#fffffe",
          borderRadius: 12,
          maxWidth: showMethodology ? 860 : 600,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          padding: "28px 32px",
          boxShadow: "0 16px 48px rgba(0,0,0,.2)",
          transition: "max-width 0.2s",
        }}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2
            style={{
              fontFamily: "'Newsreader',Georgia,serif",
              fontSize: 22,
              fontWeight: 600,
              color: "#1a1a1a",
              margin: 0,
            }}
          >
            {showMethodology ? "Data Methodology & Sources" : "About This Data"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: "#a8a49c", cursor: "pointer", padding: 4, minWidth: 32, minHeight: 32 }}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {showMethodology ? (
          <>
            <button
              onClick={() => { setShowMethodology(false); panelRef.current?.scrollTo(0, 0); }}
              style={{ fontSize: 12, color: "#0f766e", background: "none", border: "none", cursor: "pointer", padding: "8px 0 4px", fontWeight: 500 }}
            >
              ← Back to summary
            </button>
            <div className="methodology-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{methodologyText}</ReactMarkdown>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#44403c", lineHeight: 1.7, marginTop: 16 }}>
            <p style={{ margin: "0 0 12px" }}>
              <strong>Austin's Shifting Ground</strong> maps four decades of cultural displacement
              across 269 census tracts and 137 neighborhoods in Austin, Texas. It combines U.S.
              Census and ACS data (2000–2023), city permit records, eviction filings, and
              community-sourced business inventories to reveal where heritage communities are
              under pressure — and where intervention can still make a difference. This is an
              independent research tool built as a potential resource for organizations like
              Preservation Austin.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              What You Can Explore
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Map</strong> — An interactive choropleth of every census tract, color-coded by
              DVI with a time slider from 1990 to 2025. Toggle overlays for heritage businesses,
              music venues, Project Connect transit lines, and development pressure.
            </p>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Compare</strong> — Place two neighborhoods side by side to contrast DVI trends,
              demographics, home values, and cultural anchors.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              <strong>Triage</strong> — A grant-prioritization tool with three analytical lenses
              (Trajectory, Equity, Risk Matrix) to help target preservation funding where it
              is needed most.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              The Displacement Vulnerability Index
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              The DVI is a composite score (0–100) built from three sub-indices:
            </p>
            <ul style={{ margin: "0 0 4px", paddingLeft: 20 }}>
              <li><strong>Demographic Vulnerability (35%)</strong> — rent burden, renter share, foreign-born %</li>
              <li><strong>Market Pressure (35%)</strong> — home-value appreciation, rent-to-income ratio</li>
              <li><strong>Socioeconomic Stress (30%)</strong> — poverty rate, unemployment, eviction filings</li>
            </ul>
            <p style={{ margin: "0 0 12px" }}>
              It measures the speed and intensity of neighborhood transformation, not a moral
              judgment. Affluent tracts (income &gt;150% city median with &gt;75% owner-occupancy)
              are capped at DVI 20 and flagged <em>Exclusive / Appreciated</em>.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Cultural &amp; Business Data
            </h3>
            <p style={{ margin: "0 0 12px" }}>
              The map tracks 41 operating and 52 closed heritage businesses, geocoded to
              building-level precision. Preservation Austin's grant, award, and advocacy
              records (156 entries) are linked to the neighborhoods they serve. Music and
              nightlife venue counts draw on the Austin Music Census, SXSW, and Red River
              Cultural District data.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Policy Context
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              Austin's displacement patterns are rooted in the <strong>1928 Master Plan</strong>, which
              institutionalized racial segregation by creating a designated district in East Austin. The
              construction of I-35 in the 1960s reinforced this divide as a "concrete color line."
            </p>
            <p style={{ margin: "0 0 4px" }}>
              The <strong>Smart Growth Initiative (1997)</strong> directed development toward East Austin
              through $100M+ in bonds and density bonuses, inadvertently engineering "eco-gentrification"
              that displaced low-income minority families. <strong>Chapter 380 megadeals</strong> with
              Apple ($282.5M), Samsung ($17B), and others attracted a high-salaried tech workforce the
              housing supply could not accommodate.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              Recent countermeasures include the <strong>HOME Initiative (2023–24)</strong> allowing 3-unit
              infill housing, the <strong>Agent of Change principle (2024)</strong> requiring new
              developments to soundproof near music venues, and the <strong>Cultural District Framework
              (2024)</strong> enabling tax-increment financing and the Souly Austin program for legacy
              business preservation.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Data Coverage &amp; Confidence
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Demographics:</strong> 247–269 tracts, 2000–2023 (Census Decennial + ACS 5-year
              estimates). Pre-2010 boundaries crosswalked via area-weighted proportional assignment.
            </p>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Property &amp; Socioeconomic:</strong> 257–269 tracts, 2010–2023 (ACS + City of
              Austin construction permits + BASTA Austin eviction records).
            </p>
            <p style={{ margin: "0 0 4px" }}>
              <strong>High confidence:</strong> Directly from Census/ACS at matching geographies.
            </p>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Medium confidence (ⓘ):</strong> Aggregated from tract-level data with
              boundary approximation, or derived from reliable secondary sources.
            </p>
            <p style={{ margin: "0 0 12px" }}>
              <strong>Pre-2010 note:</strong> Census tract boundaries changed between 2000 and 2010.
              Pre-2010 data is crosswalked from earlier tract definitions and should be treated as
              approximate.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Neighborhood Aggregation
            </h3>
            <p style={{ margin: "0 0 12px" }}>
              Neighborhood boundaries are based on City of Austin Neighborhood Planning
              Areas. Census tracts are assigned to neighborhoods using centroid-in-polygon
              matching with contiguity enforcement — each tract belongs to exactly one
              neighborhood, and its full population and metrics are attributed to that
              neighborhood. Tracts that fail contiguity checks are excluded to prevent
              misleading aggregation. For boundary-sensitive analysis, use the Census Tracts
              view, which shows data at its native resolution.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Sources
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              U.S. Census Bureau (Decennial Census, ACS 5-year estimates) · NHGIS (historical
              tract crosswalks) · City of Austin Construction Permits (191k residential, 44k
              commercial) · BASTA Austin (eviction filings) · Preservation Austin (grants,
              awards, Legacy Business Month, advocacy) · Austin Music Census · Six Square AACHD
              Cultural Plan · UT Austin "Uprooted" gentrification study · Capital Metro Project
              Connect · Chapter 380 Economic Development Agreements · HOME Amendments
              (AustinTexas.gov) · Community business inventories compiled March 2026.
            </p>
            <p style={{ margin: "16px 0 0" }}>
              <button
                onClick={() => { setShowMethodology(true); panelRef.current?.scrollTo(0, 0); }}
                style={{
                  fontSize: 12, fontWeight: 600, color: "#0f766e", background: "none",
                  border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
                }}
              >
                Full Data Methodology &amp; Sources →
              </button>
            </p>
            <p
              style={{ margin: "12px 0 0", fontSize: 12, color: "#a8a49c", fontStyle: "italic" }}
            >
              The data is imperfect. Imperfect data, honestly presented, is more valuable than no data
              at all.
            </p>
            <p
              style={{ margin: "8px 0 0", fontSize: 11, color: "#a8a49c" }}
            >
              Built with Claude by Anthropic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
