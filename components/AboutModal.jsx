import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import methodologyText from "../DATA_METHODOLOGY.md?raw";
import { PRESENTER_MODE, isViewAllowed } from "../appConfig";
import { LEGACY_OPERATING, LEGACY_CLOSED, PA_ALL } from "../data";
import { DVI_BINS } from "../utils/math";

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
            style={{ background: "none", border: "none", fontSize: 20, color: "var(--muted)", cursor: "pointer", padding: 4, minWidth: 32, minHeight: 32 }}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {showMethodology ? (
          <>
            <button
              onClick={() => { setShowMethodology(false); panelRef.current?.scrollTo(0, 0); }}
              style={{ fontSize: 13, color: "#0f766e", background: "none", border: "none", cursor: "pointer", padding: "8px 0 4px", fontWeight: 500 }}
            >
              ← Back to summary
            </button>
            <div className="methodology-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{methodologyText}</ReactMarkdown>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "#44403c", lineHeight: 1.7, marginTop: 16 }}>
            <p style={{ margin: "0 0 12px" }}>
              <strong>Austin's Shifting Ground</strong> maps four decades of cultural displacement
              across 269 census tracts in Austin, Texas. It combines U.S.
              Census and ACS data (2000–2023), city permit records, eviction filings, and
              community-sourced business inventories to reveal where heritage communities are
              under pressure — and where intervention can still make a difference. This is an
              independent research tool built as a potential resource for organizations like
              Preservation Austin.
              {PRESENTER_MODE && (
                <> New here? The <strong>Tour</strong> button in the header gives a 3-minute guided walkthrough.</>
              )}
            </p>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              What You Can Explore
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              <strong>Map</strong> — Every census tract, colored by its stage on the displacement
              index, with a year slider from 1990 to 2025. Search for a neighborhood or address,
              select any area for a summary, and open its <strong>story card</strong> for the full
              profile on one printable page with its own link. The “Start here” card walks
              through the five ideas the map is built around. Layers add legacy businesses, music
              venues, the 1935 redlining map, Project Connect transit lines and more.
            </p>
            {isViewAllowed("history") && (
            <p style={{ margin: "0 0 4px" }}>
              <strong>History</strong> — A timeline of 112 events spanning 13,600 years
              of who shaped, and who was displaced from, the land that became Austin — from
              Clovis-era occupation through the 1928 Master Plan and 1935 HOLC redlining to
              today. This is research compiled with AI assistance from public sources and has
              not yet been reviewed by Preservation Austin; each event carries a documentation
              flag showing how well-sourced it is. Events with a location can jump straight
              onto the main map at the year they happened.
            </p>
            )}
            {isViewAllowed("compare") && (
            <p style={{ margin: "0 0 4px" }}>
              <strong>Compare</strong> — Place two census tracts side by side to contrast index
              trends, demographics, home values, and cultural anchors.
            </p>
            )}
            {isViewAllowed("triage") && (
            <p style={{ margin: "0 0 12px" }}>
              <strong>Triage</strong> — A grant-prioritization tool with three analytical lenses
              (Trajectory, Equity, Risk Matrix) to help target preservation funding where it
              is needed most. Triage scores are a screening prototype — a starting point for
              staff review, pending validation — not determinations about any neighborhood.
            </p>
            )}

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
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
              As a formula: score = 0.35 × demographic + 0.35 × market + 0.30 × socioeconomic,
              on a scale of 0 to 100.{PRESENTER_MODE && " (These are the published defaults; the DVI Weights panel on the map can change them.)"}
            </p>
            <p style={{ margin: "0 0 4px" }}>
              The score places each area in a stage:{" "}
              {DVI_BINS.map((b, i) => (
                <span key={b.stage}>
                  <strong>{b.stage}</strong> ({b.range}){i < DVI_BINS.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
            <p style={{ margin: "0 0 12px" }}>
              It measures the speed and intensity of neighborhood transformation, not a moral
              judgment, and it is a planning signal rather than a verdict on any block or
              household. Affluent tracts (income &gt;150% city median with &gt;75% owner-occupancy)
              are capped at 20 and shown as a separate group, <em>Affluent, not scored</em>.
            </p>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Cultural &amp; Business Data
            </h3>
            <p style={{ margin: "0 0 12px" }}>
              The map tracks {LEGACY_OPERATING.length} operating and {LEGACY_CLOSED.length} closed
              heritage businesses, geocoded to building-level precision. Preservation Austin's
              published grant, award, and advocacy listings ({PA_ALL.length} entries) are linked to
              the places they are near. Music and
              nightlife venue counts draw on the Austin Music Census, SXSW, and Red River
              Cultural District data.
            </p>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
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

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
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

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Neighborhood Aggregation
            </h3>
            <p style={{ margin: "0 0 12px" }}>
              Place names come from City of Austin Neighborhood Planning Areas. A census
              tract carries a neighborhood name only where a planning area covers at least 80%
              of it. Where one covers half or more, or two each cover a quarter or more, the
              tract is titled as that “area” (for example, “Govalle / Holly area”). Every
              other tract, including most suburban ones, is shown by its census tract number.
              In the Neighborhoods view, the tracts inside one planning area are combined and
              their figures weighted by population. For boundary-sensitive analysis, use the
              Census Tracts view, which shows data at its native resolution.
            </p>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Privacy
            </h3>
            <p style={{ margin: "0 0 12px" }}>
              Searching by neighborhood, tract number or cultural anchor happens entirely in
              your browser. A street address has to be looked up: if you choose “Look up … as
              a street address,” the text you typed is sent to OpenStreetMap's Nominatim
              service to find its location. Nothing is sent while you type. Map tiles are also
              loaded from OpenStreetMap, and fonts from Google Fonts.
            </p>

            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
              Sources
            </h3>
            <p style={{ margin: "0 0 4px" }}>
              U.S. Census Bureau (Decennial Census, ACS 5-year estimates) · NHGIS (historical
              tract crosswalks) · City of Austin Construction Permits (191k residential, 44k
              commercial) · BASTA Austin (eviction filings) · Preservation Austin's published
              listings (grants, awards, Legacy Business Month, advocacy){isViewAllowed("history") && " · historical events research compiled with AI assistance, Sept 2026 (not reviewed by Preservation Austin)"} · Mapping Inequality, University of Richmond (1935 HOLC map) · Austin Music Census · Six Square AACHD
              Cultural Plan · UT Austin "Uprooted" gentrification study · Capital Metro Project
              Connect · Chapter 380 Economic Development Agreements · HOME Amendments
              (AustinTexas.gov) · Community business inventories compiled March 2026.
            </p>
            <p style={{ margin: "16px 0 0" }}>
              <button
                onClick={() => { setShowMethodology(true); panelRef.current?.scrollTo(0, 0); }}
                style={{
                  fontSize: 13, fontWeight: 600, color: "#0f766e", background: "none",
                  border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
                }}
              >
                Full Data Methodology &amp; Sources →
              </button>
            </p>
            <p
              style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}
            >
              The data is imperfect. Imperfect data, honestly presented, is more valuable than no data
              at all.
            </p>
            <p
              style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}
            >
              Built with Claude by Anthropic.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
