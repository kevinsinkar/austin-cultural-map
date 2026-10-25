import {
  PLAN_YEARS,
  MISSION,
  VISION,
  PILLARS,
  OBJECTIVES,
  VALUES,
} from "../data/strategicPlan";

/**
 * StrategicPlanView — PA's 2026–2029 Strategic Plan on a Page, laid out
 * for board members: mission & vision up top, the four pillars, every
 * objective with its measures, and the organizational values. Each
 * objective also notes how this tool supports its measures, so the
 * connection between the plan and the map is explicit in one place.
 */
export default function StrategicPlanView() {
  return (
    <section aria-label="Strategic plan" style={{ maxWidth: 1060, margin: "0 auto" }}>
      {/* ── Mission / Vision ── */}
      <div style={{ textAlign: "center", padding: "18px 16px 6px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", color: "#9a3412", textTransform: "uppercase" }}>
          Preservation Austin · Strategic Plan {PLAN_YEARS}
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ flex: "1 1 380px", maxWidth: 500, background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 12, padding: "18px 22px", textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Mission</div>
            <p style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 19, lineHeight: 1.45, color: "#1a1a1a", margin: 0 }}>{MISSION}</p>
          </div>
          <div style={{ flex: "1 1 380px", maxWidth: 500, background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 12, padding: "18px 22px", textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Vision</div>
            <p style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 19, lineHeight: 1.45, color: "#1a1a1a", margin: 0 }}>{VISION}</p>
          </div>
        </div>
      </div>

      {/* ── Pillars ── */}
      <SectionHeading>Strategic Pillars</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {PILLARS.map((p, i) => (
          <div key={p.title} style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderTop: "3px solid #9a3412", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a8a49c" }}>{String(i + 1).padStart(2, "0")}</div>
            <h3 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 17, fontWeight: 600, color: "#1a1a1a", margin: "2px 0 6px" }}>{p.title}</h3>
            <p style={{ fontSize: 12.5, color: "#64615b", lineHeight: 1.5, margin: 0 }}>{p.text}</p>
          </div>
        ))}
      </div>

      {/* ── Objectives & measures ── */}
      <SectionHeading>Objectives — and how we'll measure them</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 12 }}>
        {OBJECTIVES.map((o) => (
          <div key={o.title} style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column" }}>
            <h3 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 16.5, fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px" }}>{o.title}</h3>
            <p style={{ fontSize: 12.5, color: "#64615b", lineHeight: 1.5, margin: "0 0 8px" }}>{o.text}</p>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4 }}>Measures</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#1a1a1a", lineHeight: 1.6 }}>
              {o.measures.map((m) => <li key={m}>{m}</li>)}
            </ul>
            {o.toolSupport && (
              <div style={{ marginTop: "auto", paddingTop: 10 }}>
                <div style={{ background: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: 8, padding: "7px 10px", fontSize: 11.5, color: "#115e59", lineHeight: 1.45 }}>
                  <strong>How this tool helps:</strong> {o.toolSupport}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Values ── */}
      <SectionHeading>Our Values — how we work</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 20 }}>
        {VALUES.map((v) => (
          <div key={v.title} style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, padding: "12px 16px" }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: "#9a3412", margin: "0 0 4px" }}>{v.title}</h3>
            <p style={{ fontSize: 12, color: "#64615b", lineHeight: 1.5, margin: 0 }}>{v.text}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: "#a8a49c", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>
        Source: Preservation Austin "Strategic Plan on a Page," 2026–2029.
        "How this tool helps" notes describe this site's support for each measure and are not part of the plan document.
      </p>
    </section>
  );
}

function SectionHeading({ children }) {
  return (
    <h2 style={{
      fontFamily: "'Newsreader',Georgia,serif", fontSize: 19, fontWeight: 600,
      color: "#1a1a1a", margin: "26px 0 10px", paddingBottom: 6,
      borderBottom: "1px solid #e8e5e0",
    }}>
      {children}
    </h2>
  );
}
