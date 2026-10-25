import { SHOW_ANALYSIS_TABS } from "../appConfig";

// Tab roster is config-driven: outreach mode shows Map + Outreach only;
// the analysis views stay routable (direct URLs work) but untabbed.
const TABS = SHOW_ANALYSIS_TABS
  ? [
      { key: "map", label: "Map" },
      { key: "outreach", label: "Outreach" },
      { key: "plan", label: "Strategic Plan" },
      { key: "history", label: "History" },
      { key: "compare", label: "Compare" },
      { key: "triage", label: "Triage" },
    ]
  : [
      { key: "map", label: "Map" },
      { key: "outreach", label: "Outreach" },
      { key: "plan", label: "Strategic Plan" },
    ];

export default function Header({ viewMode, setViewMode, setShowAbout, setShowAgenda, onStartTour }) {
  return (
    <header
      style={{ borderBottom: "1px solid #d6d3cd", padding: "20px 28px 16px" }}
      role="banner"
    >
      <div style={{ margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "'Newsreader',Georgia,serif",
            fontSize: 26,
            fontWeight: 600,
            color: "#1a1a1a",
            letterSpacing: "-.02em",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          Austin's Shifting Ground
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 6,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <p style={{ fontSize: 14, color: "#64615b", margin: 0, lineHeight: 1.4 }}>
            {SHOW_ANALYSIS_TABS
              ? "Four decades of cultural displacement — 1990 to 2025"
              : "Displacement data + outreach planning for Preservation Austin's Community Engagement committee"}
          </p>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <nav aria-label="View mode" style={{ display: "flex", background: "#edeae4", borderRadius: 8, padding: 3 }}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  aria-current={viewMode === tab.key ? "page" : undefined}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: viewMode === tab.key ? 600 : 400,
                    background: viewMode === tab.key ? "#fffffe" : "transparent",
                    color: viewMode === tab.key ? "#0f766e" : "#7c6f5e",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: viewMode === tab.key ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                    minHeight: 32,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {onStartTour && SHOW_ANALYSIS_TABS && (
              <button
                onClick={onStartTour}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid #0f766e",
                  background: "#f0fdfa",
                  color: "#0f766e",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  minHeight: 32,
                }}
                aria-label="Take the guided tour (about 3 minutes)"
              >
                ▶ Tour
              </button>
            )}
            <button
              onClick={() => setShowAgenda(true)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid #d6d3cd",
                background: "#fffffe",
                color: "#64615b",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                minHeight: 32,
              }}
              aria-label="View agenda"
            >
              Agenda
            </button>
            <button
              onClick={() => setShowAbout(true)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid #d6d3cd",
                background: "#fffffe",
                color: "#64615b",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                minHeight: 32,
              }}
              aria-label="About this data"
            >
              About
            </button>
            <a
              href="https://forms.gle/r3FojhBqyHPzw4mG7"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid #d6d3cd",
                background: "#fffffe",
                color: "#64615b",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                minHeight: 32,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
              aria-label="Leave feedback"
            >
              Feedback
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
