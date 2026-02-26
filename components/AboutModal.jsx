export default function AboutModal({ onClose }) {
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
          maxWidth: 600,
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
          padding: "28px 32px",
          boxShadow: "0 16px 48px rgba(0,0,0,.2)",
        }}
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
            About This Data
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: "#a8a49c", cursor: "pointer", padding: 4 }}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 13, color: "#44403c", lineHeight: 1.7, marginTop: 16 }}>
          <p style={{ margin: "0 0 12px" }}>
            This tool visualizes four decades of demographic, economic, and cultural change across 15
            Austin neighborhoods. It draws on U.S. Census data (1990–2020), American Community Survey
            5-year estimates (2019–2023), Travis County Appraisal District records, City of Austin
            planning documents, and community-sourced business inventories.
          </p>
          <p style={{ margin: "0 0 16px" }}>
            The Displacement Velocity Index (DVI) is a composite score (0–100) combining rates of
            population change, home value appreciation, educational attainment shift, and homeownership
            decline. It measures the speed and intensity of neighborhood transformation, not a moral
            judgment. Higher values indicate faster change in the measured period.
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
          <p style={{ margin: "0 0 16px" }}>
            Recent countermeasures include the <strong>HOME Initiative (2023–24)</strong> allowing 3-unit
            infill housing, the <strong>Agent of Change principle (2024)</strong> requiring new
            developments to soundproof near music venues, and the <strong>Cultural District Framework
            (2024)</strong> enabling tax-increment financing and the Souly Austin program for legacy
            business preservation.
          </p>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
            Data Confidence
          </h3>
          <p style={{ margin: "0 0 4px" }}>
            <strong>High confidence:</strong> Directly from Census/ACS at matching geographies.
            Presented without indicators.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Medium confidence (ⓘ):</strong> Aggregated from tract-level data with some
            boundary approximation, or derived from reliable secondary sources.
          </p>
          <p style={{ margin: "0 0 16px" }}>
            <strong>Pre-2010 note:</strong> Census tract boundaries changed between 2000 and 2010.
            Region-to-tract mappings for earlier decades are approximate.
          </p>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
            Sources
          </h3>
          <p style={{ margin: "0 0 4px" }}>
            U.S. Census Bureau (decennial census, ACS) · Travis Central Appraisal District · City of
            Austin Neighborhood Housing & Community Development · UT Austin "Uprooted" gentrification
            study · Six Square AACHD Cultural Plan · Austin Legacy Business Closure Analysis ·
            Policy-Driven Transformation of Austin (1990–2025) · Preservation Austin Legacy Business
            Month · Chapter 380 Economic Development Agreements · HOME Amendments (AustinTexas.gov) ·
            Community business inventories compiled February 2026.
          </p>
          <p
            style={{ margin: "16px 0 0", fontSize: 12, color: "#a8a49c", fontStyle: "italic" }}
          >
            The data is imperfect. Imperfect data, honestly presented, is more valuable than no data
            at all.
          </p>
        </div>
      </div>
    </div>
  );
}
