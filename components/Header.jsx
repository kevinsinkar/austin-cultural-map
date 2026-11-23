import { PRESENTER_MODE, isViewAllowed } from "../appConfig";
import { YEAR_MIN, YEAR_MAX } from "../data/constants";

// Tab roster follows the build mode (appConfig.js): a public build shows
// only the views it is allowed to route to; presenter mode shows them all.
// The story card is a page reached from the map, not a tab.
const TABS = [
  { key: "map", label: "Map" },
  { key: "outreach", label: "Outreach" },
  { key: "plan", label: "Strategic Plan" },
  { key: "history", label: "History" },
  { key: "compare", label: "Compare" },
  { key: "triage", label: "Triage" },
].filter((tab) => isViewAllowed(tab.key));

const utilityButton = {
  padding: "5px 12px",
  borderRadius: 6,
  border: "1px solid #d6d3cd",
  background: "#fffffe",
  color: "#44403c",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  minHeight: 34,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

export default function Header({ viewMode, setViewMode, setShowAbout, onOpenAgenda, onStartTour }) {
  // A story card belongs to the map, so the Map tab stays marked while one is open.
  const currentTab = viewMode === "card" ? "map" : viewMode;

  return (
    <header className="app-header" role="banner">
      <h1 className="app-title">Austin's Shifting Ground</h1>
      <div className="app-header-row">
        <p className="app-subtitle">
          Four decades of cultural displacement, {YEAR_MIN} to {YEAR_MAX}
          {PRESENTER_MODE && (
            <span className="presenter-badge" title="This build includes the planning views and private outreach data. It runs on this computer only and must never be uploaded.">
              Presenter mode · this computer only
            </span>
          )}
        </p>
        <div className="app-header-actions">
          {/* A single-view build needs no tab bar */}
          {TABS.length > 1 && (
            <nav aria-label="Views" className="app-nav">
              {TABS.map((tab) => {
                const current = currentTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setViewMode(tab.key)}
                    aria-current={current ? "page" : undefined}
                    style={{
                      padding: "5px 14px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: current ? 600 : 400,
                      background: current ? "#fffffe" : "transparent",
                      color: current ? "#0f766e" : "#57534e",
                      border: "none",
                      cursor: "pointer",
                      boxShadow: current ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                      minHeight: 32,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}
          {onStartTour && PRESENTER_MODE && (
            <button
              type="button"
              onClick={onStartTour}
              style={{ ...utilityButton, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", fontWeight: 600 }}
              aria-label="Take the guided tour (about 3 minutes)"
            >
              Tour
            </button>
          )}
          {/* The agenda is the internal roadmap: presenter mode only */}
          {PRESENTER_MODE && (
            <button type="button" onClick={onOpenAgenda} style={utilityButton}>
              Agenda
            </button>
          )}
          <button type="button" onClick={() => setShowAbout(true)} style={utilityButton} aria-label="About this map and its data">
            About
          </button>
          <a
            href="https://forms.gle/r3FojhBqyHPzw4mG7"
            target="_blank"
            rel="noopener noreferrer"
            style={utilityButton}
            aria-label="Leave feedback (opens a form in a new tab)"
          >
            Feedback
          </a>
        </div>
      </div>
    </header>
  );
}
