import { useMemo, useState } from "react";
import _ from "lodash";
import { LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, TIMELINE_INFRA } from "../data";
import { DEMO_COLORS } from "../data/constants";
import TimelineEras from "./TimelineEras";
import TimelineDashboard from "./TimelineDashboard";

// ── Shared constants ──

export const CULTURE_COLORS = {
  "African American": "#7c3aed",
  "African American Heritage": "#7c3aed",
  "Mexican American/Latino": "#d97706",
  "General Austin": "#78716c",
  "LGBTQ+": "#db2777",
  "Immigrant Community (Vietnamese)": "#0891b2",
  "Immigrant Community (Asian)": "#0891b2",
  "Country/Americana": "#b45309",
};

const CULTURE_SORT = [
  "African American", "African American Heritage",
  "Mexican American/Latino", "LGBTQ+",
  "Immigrant Community (Vietnamese)", "Immigrant Community (Asian)",
  "Country/Americana", "General Austin",
];

export const CULTURE_LABELS = {
  "African American": "African American",
  "African American Heritage": "African American",
  "Mexican American/Latino": "Mexican American / Latino",
  "General Austin": "General Austin",
  "LGBTQ+": "LGBTQ+",
  "Immigrant Community (Vietnamese)": "Immigrant Community",
  "Immigrant Community (Asian)": "Immigrant Community",
  "Country/Americana": "Country / Americana",
};

export function cultureColor(c) { return CULTURE_COLORS[c] || "#78716c"; }
export function cultureSort(c) { const i = CULTURE_SORT.indexOf(c); return i >= 0 ? i : 99; }
export function cultureLabel(c) { return CULTURE_LABELS[c] || c; }

export function closeYear(b) {
  if (typeof b.closed === "number") return b.closed;
  if (b.closureDate) {
    const m = b.closureDate.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }
  return null;
}

export const ERAS = [
  {
    id: "segregation",
    title: "Segregation & Roots",
    subtitle: "The Master Plan and the communities it created",
    years: [1925, 1964],
    context: "Austin's 1928 Master Plan institutionalized racial segregation, designating East Austin as the 'Negro District.' The construction of I-35 in the early 1960s physically reinforced this divide. Within these boundaries, vibrant Black and Mexican American communities established businesses, churches, and cultural institutions that would anchor East Austin for decades.",
  },
  {
    id: "community",
    title: "Community Building",
    subtitle: "Civil rights, cultural roots, and a growing city",
    years: [1964, 1997],
    context: "Following the Civil Rights Act, Austin's communities of color built thriving commercial corridors along East 11th, East 12th, and East Cesar Chavez. Music venues, restaurants, and family businesses created the cultural fabric that would later be threatened by rapid growth.",
  },
  {
    id: "boom",
    title: "The Boom",
    subtitle: "Smart Growth, tech migration, and unintended consequences",
    years: [1997, 2015],
    context: "The 1997 Smart Growth Initiative directed $100M+ in bonds and infrastructure investment into East Austin, triggering rapid property value appreciation. Chapter 380 megadeals with Apple, Samsung, and others attracted a high-salaried tech workforce the housing supply could not accommodate.",
  },
  {
    id: "displacement",
    title: "The Displacement Era",
    subtitle: "Cultural loss, rising rents, and the fight to stay",
    years: [2015, 2026],
    context: "The preceding boom reached its full displacement effect. East Austin's Black population declined by over 30% in some tracts. Legacy businesses faced 200\u2013350% rent increases. The HOME Initiative, Agent of Change principle, and Cultural District Framework represent recent policy responses, but many closures are irreversible.",
  },
];

export default function TimelineView({ tlFilter, setTlFilter }) {
  const [timelineMode, setTimelineMode] = useState("eras");
  const [cultureFilter, setCultureFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [hoveredItem, setHoveredItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [focusEra, setFocusEra] = useState(null);

  // Filtered events
  const filteredEvents = useMemo(() =>
    TIMELINE_INFRA.filter(e => tlFilter === "all" || e.cat === tlFilter),
    [tlFilter]
  );

  // Build bar objects from businesses
  const { opBars, clBars } = useMemo(() => {
    const YR0 = 1925, YR1 = 2026;
    const op = LEGACY_OPERATING
      .map(b => ({
        ...b, stream: "operating",
        x0: Math.max(b.est, YR0), x1: YR1,
        cs: cultureSort(b.culture), clr: cultureColor(b.culture),
      }))
      .sort((a, b) => a.cs - b.cs || a.est - b.est);

    const cl = LEGACY_CLOSED
      .map(b => {
        const cy = closeYear(b);
        return {
          ...b, stream: "closed",
          x0: Math.max(b.est, YR0), x1: cy || YR1,
          closedYear: cy,
          cs: cultureSort(b.culture), clr: cultureColor(b.culture),
        };
      })
      .filter(b => b.x1 !== null)
      .sort((a, b) => a.cs - b.cs || a.est - b.est);

    return { opBars: op, clBars: cl };
  }, []);

  // Apply filters
  const filteredOp = useMemo(() => {
    if (actionFilter === "closed") return [];
    return opBars.filter(b => cultureFilter === "all" || b.culture === cultureFilter);
  }, [opBars, actionFilter, cultureFilter]);

  const filteredCl = useMemo(() => {
    if (actionFilter === "opened") return [];
    return clBars.filter(b => cultureFilter === "all" || b.culture === cultureFilter);
  }, [clBars, actionFilter, cultureFilter]);

  // Culture legend
  const legend = useMemo(() => {
    const seen = new Set();
    const items = [];
    [...opBars, ...clBars].forEach(b => {
      const c = cultureColor(b.culture);
      if (!seen.has(c)) { seen.add(c); items.push({ culture: b.culture, color: c }); }
    });
    return items.sort((a, b) => cultureSort(a.culture) - cultureSort(b.culture));
  }, [opBars, clBars]);

  // Detail panel content
  const detailItem = selectedItem || hoveredItem;

  return (
    <section aria-label="Timeline view">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 22, fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px" }}>
          Austin Cultural Timeline
        </h2>
        <p style={{ fontSize: 13, color: "#64615b", margin: "0 0 16px", lineHeight: 1.5 }}>
          Four decades of policy decisions, business lifespans, and demographic transformation.
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", background: "#edeae4", borderRadius: 8, padding: 3 }}>
            {[
              { key: "eras", label: "Era Stories", sub: "Narrative chapters" },
              { key: "dashboard", label: "Dashboard", sub: "All data, one screen" },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => { setTimelineMode(m.key); if (m.key === "eras") setFocusEra(null); }}
                aria-current={timelineMode === m.key ? "page" : undefined}
                style={{
                  padding: "6px 16px", borderRadius: 6, border: "none",
                  fontSize: 12, cursor: "pointer", textAlign: "center",
                  fontWeight: timelineMode === m.key ? 600 : 400,
                  background: timelineMode === m.key ? "#fffffe" : "transparent",
                  color: timelineMode === m.key ? "#0f766e" : "#7c6f5e",
                  boxShadow: timelineMode === m.key ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                }}
              >
                <div>{m.label}</div>
                <div style={{ fontSize: 9, fontWeight: 400, color: timelineMode === m.key ? "#0f766e" : "#a8a49c", marginTop: 1 }}>{m.sub}</div>
              </button>
            ))}
          </div>

          {/* Category filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64615b", alignSelf: "center" }}>Events:</span>
            {["all", "displacement", "policy", "development", "cultural", "economic"].map(f => (
              <button key={f} onClick={() => setTlFilter(f)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", minHeight: 28,
                fontWeight: tlFilter === f ? 600 : 400,
                border: tlFilter === f ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd",
                background: tlFilter === f ? "#f0fdfa" : "#fffffe",
                color: tlFilter === f ? "#0f766e" : "#64615b",
              }}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Action filter */}
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64615b", alignSelf: "center" }}>Show:</span>
            {["all", "opened", "closed"].map(f => (
              <button key={f} onClick={() => setActionFilter(f)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", minHeight: 28,
                fontWeight: actionFilter === f ? 600 : 400,
                border: actionFilter === f ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd",
                background: actionFilter === f ? "#f0fdfa" : "#fffffe",
                color: actionFilter === f ? "#0f766e" : "#64615b",
              }}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Culture legend */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {legend.map(({ culture, color }) => (
            <button
              key={color}
              onClick={() => setCultureFilter(cultureFilter === culture ? "all" : culture)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                cursor: "pointer", background: "none", border: "none",
                opacity: cultureFilter === "all" || cultureFilter === culture ? 1 : 0.35,
              }}
            >
              <span style={{ width: 10, height: 4, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 9.5, color: "#44403c", fontWeight: 500 }}>{cultureLabel(culture)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active sub-view + detail panel */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {timelineMode === "eras" ? (
            <TimelineEras
              eras={ERAS}
              events={filteredEvents}
              opBars={filteredOp}
              clBars={filteredCl}
              hoveredItem={hoveredItem}
              setHoveredItem={setHoveredItem}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              onViewInDashboard={(era) => { setFocusEra(era); setTimelineMode("dashboard"); }}
            />
          ) : (
            <TimelineDashboard
              eras={ERAS}
              events={filteredEvents}
              opBars={filteredOp}
              clBars={filteredCl}
              focusEra={focusEra}
              hoveredItem={hoveredItem}
              setHoveredItem={setHoveredItem}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
            />
          )}
        </div>

        {/* Shared detail panel */}
        <div className="detail-panel" style={{ flex: "0 1 340px", minWidth: 280, maxHeight: "calc(100vh - 100px)", overflowY: "auto", position: "sticky", top: 16 }}>
          {detailItem ? (
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "16px 20px" }}>
              {detailItem.cat ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>{detailItem.cat}</div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: "0 0 6px", lineHeight: 1.3 }}>{detailItem.label}</h3>
                  <div style={{ fontSize: 12, color: "#7c6f5e", marginBottom: 8 }}>{detailItem.year}</div>
                  <p style={{ fontSize: 12, color: "#44403c", margin: 0, lineHeight: 1.6 }}>{detailItem.summary}</p>
                </>
              ) : (
                <>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px", lineHeight: 1.3 }}>{detailItem.name}</h3>
                  <div style={{ fontSize: 11, color: "#7c6f5e", marginBottom: 6 }}>
                    {detailItem.stream === "closed"
                      ? `${detailItem.est}\u2013${detailItem.closedYear || "?"}`
                      : `Est. ${detailItem.est} \u2014 Still operating`}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: cultureColor(detailItem.culture) + "22", color: cultureColor(detailItem.culture), fontWeight: 600 }}>{detailItem.culture}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#f5f0ea", color: "#7c6f5e" }}>{detailItem.type}</span>
                  </div>
                  {detailItem.notes && <p style={{ fontSize: 12, color: "#44403c", margin: "0 0 6px", lineHeight: 1.5 }}>{detailItem.notes}</p>}
                  {detailItem.cause && <div style={{ fontSize: 11, color: "#991b1b", marginTop: 4 }}>Closed: {detailItem.cause}</div>}
                  {detailItem.replacedBy && <div style={{ fontSize: 11, color: "#64615b", marginTop: 2 }}>Now: {detailItem.replacedBy}</div>}
                </>
              )}
            </div>
          ) : (
            <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>{"\u23F3"}</div>
              <div style={{ fontSize: 13, color: "#7c6f5e", lineHeight: 1.5 }}>
                Hover or click any event or business bar to see details.
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div style={{ background: "#fffffe", borderRadius: 10, border: "1px solid #e8e5e0", padding: "12px 16px", marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#64615b", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Data Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
              <div><span style={{ color: "#a8a49c" }}>Operating:</span> <strong>{filteredOp.length}</strong></div>
              <div><span style={{ color: "#a8a49c" }}>Closed:</span> <strong>{filteredCl.length}</strong></div>
              <div><span style={{ color: "#a8a49c" }}>Events:</span> <strong>{filteredEvents.length}</strong></div>
              <div><span style={{ color: "#a8a49c" }}>Eras:</span> <strong>{ERAS.length}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
