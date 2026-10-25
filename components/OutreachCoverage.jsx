import { useMemo } from "react";
import { REGION_INDEX } from "../data";
import { OUTREACH_EVENTS, ARENAS } from "../data/outreachEvents";
import { COUNCIL_DISTRICTS_GEOJSON } from "../data/councilDistricts";
import { findDistrict } from "../utils/geo";
import { interpolateDvi, isRegionExcluded, getDviColor } from "../utils/math";

/**
 * OutreachCoverage — the strategic-plan measurement view.
 * Crosses the city's displacement need (tract DVI, assigned to council
 * districts by centroid) with the committee's opportunity supply and
 * pipeline activity, per district and per advocacy arena. Directly
 * supports two plan measures: "reach across all parts of the city"
 * (Open the Door to Participation) and "advocates activated by arena"
 * (Grow Advocacy on Every Front); outcome totals feed "first-time
 * participants."
 */

const ACTIVE_STAGES = new Set(["contacted", "applied", "confirmed"]);

export default function OutreachCoverage({ plan, dviVersion }) {
  // Tract → district assignment (centroid point-in-polygon); recompute
  // only when the DVI weights change (dviVersion) for the DVI columns.
  const districtRows = useMemo(() => {
    const byDistrict = new Map();
    for (const f of COUNCIL_DISTRICTS_GEOJSON.features) {
      byDistrict.set(f.properties.district, {
        district: f.properties.district,
        tracts: 0, highDvi: 0, dviSum: 0, dviN: 0,
        opportunities: 0, open: 0, active: 0, tabled: 0,
        attendance: 0, signups: 0,
      });
    }

    for (const r of REGION_INDEX) {
      if (r.merge_into || r.lat == null) continue;
      const d = findDistrict(r.lat, r.lng, COUNCIL_DISTRICTS_GEOJSON);
      const row = byDistrict.get(d);
      if (!row) continue;
      row.tracts++;
      const dvi = interpolateDvi(r.region_id, 2023);
      if (dvi > 0 && !isRegionExcluded(r.region_id, 2023)) {
        row.dviSum += dvi;
        row.dviN++;
        if (dvi >= 35) row.highDvi++;
      }
    }

    for (const ev of OUTREACH_EVENTS) {
      // Prefer the pin's actual location; fall back to the inferred district.
      let d = ev.lat != null ? findDistrict(ev.lat, ev.lng, COUNCIL_DISTRICTS_GEOJSON) : null;
      if (d == null && ev.districts?.length) d = parseInt(ev.districts[0].slice(1), 10);
      const row = byDistrict.get(d);
      if (!row) continue;
      row.opportunities++;
      if (ev.status === "OPEN" || ev.status === "NPO") row.open++;
      const p = plan[ev.id];
      if (p?.stage && ACTIVE_STAGES.has(p.stage)) row.active++;
      if (p?.stage === "tabled") {
        row.tabled++;
        row.attendance += Number(p.outcome?.attendance) || 0;
        row.signups += Number(p.outcome?.signups) || 0;
      }
    }

    return [...byDistrict.values()].sort((a, b) => a.district - b.district);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, dviVersion]);

  // Arena rollup (plan measure: advocates activated by arena)
  const arenaRows = useMemo(() => {
    const rows = Object.keys(ARENAS).map((k) => ({
      arena: k, opportunities: 0, active: 0, tabled: 0,
    }));
    const byKey = Object.fromEntries(rows.map((r) => [r.arena, r]));
    for (const ev of OUTREACH_EVENTS) {
      const row = byKey[ev.arena] || byKey.community;
      row.opportunities++;
      const p = plan[ev.id];
      if (p?.stage && ACTIVE_STAGES.has(p.stage)) row.active++;
      if (p?.stage === "tabled") row.tabled++;
    }
    return rows;
  }, [plan]);

  const totals = districtRows.reduce((t, r) => ({
    tabled: t.tabled + r.tabled,
    attendance: t.attendance + r.attendance,
    signups: t.signups + r.signups,
    active: t.active + r.active,
  }), { tabled: 0, attendance: 0, signups: 0, active: 0 });

  // Outreach desert: meaningful displacement need, nothing confirmed open.
  const isDesert = (r) => r.highDvi >= 3 && r.open === 0;

  return (
    <div>
      {/* ── Measure tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Tile label="In pipeline" value={totals.active} hint="contacted → confirmed" />
        <Tile label="Events tabled" value={totals.tabled} hint="entry-point activities held" />
        <Tile label="Est. attendance reached" value={totals.attendance.toLocaleString()} hint="from outcome capture" />
        <Tile label="Signups collected" value={totals.signups.toLocaleString()} hint="first-time participants" />
      </div>

      {/* ── District coverage ── */}
      <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, overflow: "hidden", marginBottom: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#f5f0ea", textAlign: "left" }}>
              {["District", "Tracts (high-DVI / total)", "Avg DVI '23", "Opportunities", "Open to nonprofits", "In pipeline", "Tabled", "Reach"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", fontSize: 10.5, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {districtRows.map((r) => {
              const avg = r.dviN ? r.dviSum / r.dviN : 0;
              const desert = isDesert(r);
              return (
                <tr key={r.district} style={{ borderTop: "1px solid #edeae4", background: desert ? "#fff7ed" : undefined }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                    D{r.district}
                    {desert && (
                      <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: "#9a3412", background: "#ffedd5", padding: "1px 7px", borderRadius: 8 }}>
                        outreach desert
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontWeight: 600, color: r.highDvi > 0 ? "#b91c1c" : "#64615b" }}>{r.highDvi}</span>
                    <span style={{ color: "#a8a49c" }}> / {r.tracts}</span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: getDviColor(avg), border: "1px solid rgba(0,0,0,.12)" }} aria-hidden="true" />
                      {avg.toFixed(0)}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>{r.opportunities}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 600, color: r.open ? "#15803d" : "#b91c1c" }}>{r.open}</td>
                  <td style={{ padding: "8px 10px" }}>{r.active || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{r.tabled || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11.5, color: "#64615b" }}>
                    {r.attendance || r.signups
                      ? `~${r.attendance.toLocaleString()} · ${r.signups} signups`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "#a8a49c", margin: "0 2px 16px", lineHeight: 1.5 }}>
        Tracts are assigned to districts by centroid; events by pin location (inferred district when unmapped).
        "High-DVI" = DVI ≥ 35 (Active Displacement or worse) at 2023 under the current weight settings.
        An <strong>outreach desert</strong> is a district with 3+ high-DVI tracts and no confirmed nonprofit-open opportunity — start by asking the "Unknown" organizers there.
      </p>

      {/* ── Arena rollup ── */}
      <h3 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 16, fontWeight: 600, color: "#1a1a1a", margin: "0 0 8px" }}>
        Advocacy arenas <span style={{ fontSize: 11.5, fontWeight: 400, color: "#a8a49c" }}>— plan measure: "advocates activated by arena"</span>
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }}>
        {arenaRows.map((r) => {
          const meta = ARENAS[r.arena];
          return (
            <div key={r.arena} style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderLeft: `3px solid ${meta.color}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 4 }}>{meta.label}</div>
              <div style={{ fontSize: 12, color: "#64615b", lineHeight: 1.6 }}>
                {r.opportunities} opportunities<br />
                <strong style={{ color: "#1a1a1a" }}>{r.active}</strong> in pipeline · <strong style={{ color: "#1a1a1a" }}>{r.tabled}</strong> tabled
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Newsreader',Georgia,serif", color: "#0f766e", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: "#a8a49c" }}>{hint}</div>
    </div>
  );
}
