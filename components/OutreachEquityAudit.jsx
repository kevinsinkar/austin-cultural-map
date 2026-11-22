import { useMemo } from "react";
import { REGION_INDEX, PA_ALL, PA_LABELS } from "../data";
import { PA_EXTRA_DATASETS, EXTRA_TYPE_LABELS } from "../data/equityAudit";
import { COUNCIL_DISTRICTS_GEOJSON } from "../data/councilDistricts";
import { findDistrict } from "../utils/geo";
import { calcDirectDisplacement } from "../utils/math";
import { STAGE_CLASSES, tractStageClass } from "../utils/stages";
import { StageMix } from "./StageBlock";

// Displacement stages (vulnerable through continued loss), as opposed to
// "no stage" and "not scored".
const IN_DISPLACEMENT_STAGE = new Set(STAGE_CLASSES.map((c) => c.key));

/**
 * OutreachEquityAudit — "a dataset showing how Austin is changing
 * alongside a dataset showing how Preservation Austin is serving and
 * representing the city" (the committee's framing for the Equity Audit).
 *
 * How Austin is changing: per district, tract DVI and the measured shift
 * in Black+Hispanic population share (2000→2023 direct displacement).
 * How PA is serving: every grant, merit award, legacy business, and
 * advocacy action in the PA activity dataset, plus any extra datasets
 * added to data/equityAudit.js (Homes Tour addresses, Equity Audit rows).
 *
 * East/West split uses the I-35 line (lng −97.735).
 */

const I35_LNG = -97.735;

// Supports the plan measure "commitments tracked and reported on each
// year": the same tables, exported or screenshotted annually, are the
// report.
export default function OutreachEquityAudit() {
  const paItems = useMemo(
    () => [...PA_ALL, ...PA_EXTRA_DATASETS].filter((i) => i.lat != null && i.lng != null),
    []
  );

  // ── East/West I-35 rollup ──
  const eastWest = useMemo(() => {
    const side = (lng) => (lng > I35_LNG ? "east" : "west");
    const out = {
      east: { items: 0, dollars: 0, stagedTracts: 0, tracts: 0 },
      west: { items: 0, dollars: 0, stagedTracts: 0, tracts: 0 },
    };
    for (const i of paItems) {
      const s = out[side(i.lng)];
      s.items++;
      s.dollars += i.amount || 0;
    }
    for (const r of REGION_INDEX) {
      if (r.merge_into || r.lat == null) continue;
      const s = out[side(r.lng)];
      s.tracts++;
      if (IN_DISPLACEMENT_STAGE.has(tractStageClass(r.region_id, 2023).key)) s.stagedTracts++;
    }
    return out;
  }, [paItems]);

  // ── Per-district: PA footprint vs. measured change ──
  const rows = useMemo(() => {
    const byDistrict = new Map();
    for (const f of COUNCIL_DISTRICTS_GEOJSON.features) {
      byDistrict.set(f.properties.district, {
        district: f.properties.district,
        tracts: 0, staged: 0, mix: {},
        bhDeltaSum: 0, bhDeltaN: 0,
        items: 0, dollars: 0, byType: {},
      });
    }
    for (const r of REGION_INDEX) {
      if (r.merge_into || r.lat == null) continue;
      const row = byDistrict.get(findDistrict(r.lat, r.lng, COUNCIL_DISTRICTS_GEOJSON));
      if (!row) continue;
      row.tracts++;
      const key = tractStageClass(r.region_id, 2023).key;
      if (IN_DISPLACEMENT_STAGE.has(key)) {
        row.staged++;
        row.mix[key] = (row.mix[key] || 0) + 1;
      }
      const dd = calcDirectDisplacement(r.region_id);
      if (dd?.bhDelta != null) {
        row.bhDeltaSum += dd.bhDelta;
        row.bhDeltaN++;
      }
    }
    for (const i of paItems) {
      const row = byDistrict.get(findDistrict(i.lat, i.lng, COUNCIL_DISTRICTS_GEOJSON));
      if (!row) continue;
      row.items++;
      row.dollars += i.amount || 0;
      row.byType[i.type] = (row.byType[i.type] || 0) + 1;
    }
    return [...byDistrict.values()].sort((a, b) => a.district - b.district);
  }, [paItems]);

  const totalDollars = eastWest.east.dollars + eastWest.west.dollars;
  const totalItems = eastWest.east.items + eastWest.west.items;
  const eastDollarShare = totalDollars ? (eastWest.east.dollars / totalDollars) * 100 : 0;
  const eastNeedShare = (eastWest.east.stagedTracts + eastWest.west.stagedTracts)
    ? (eastWest.east.stagedTracts / (eastWest.east.stagedTracts + eastWest.west.stagedTracts)) * 100
    : 0;

  const typeLabel = (t) => PA_LABELS?.[t] || EXTRA_TYPE_LABELS[t] || t;

  // Underserved: meaningful need, little PA presence relative to it.
  const underserved = (r) => r.staged >= 3 && r.items / Math.max(r.staged, 1) < 0.5;

  return (
    <div>
      {/* ── East / West of I-35 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 6 }}>
        <Tile
          label="PA grant dollars east of I-35"
          value={`${eastDollarShare.toFixed(0)}%`}
          hint={`$${eastWest.east.dollars.toLocaleString()} of $${totalDollars.toLocaleString()}`}
        />
        <Tile
          label="Tracts in a displacement stage east of I-35"
          value={`${eastNeedShare.toFixed(0)}%`}
          hint={`${eastWest.east.stagedTracts} of ${eastWest.east.stagedTracts + eastWest.west.stagedTracts} (need benchmark)`}
        />
        <Tile
          label="PA activity items east / west"
          value={`${eastWest.east.items} / ${eastWest.west.items}`}
          hint={`${totalItems} grants, awards, legacy businesses, advocacy`}
        />
        <Tile
          label="Extra datasets loaded"
          value={PA_EXTRA_DATASETS.length}
          hint="Homes Tour + Equity Audit rows (data/equityAudit.js)"
        />
      </div>
      <p style={{ fontSize: 12, color: "#64615b", margin: "0 2px 14px", lineHeight: 1.5, maxWidth: 760 }}>
        Read the first two tiles together: if {eastNeedShare.toFixed(0)}% of the city's
        tracts in a displacement stage are east of I-35 but {eastDollarShare.toFixed(0)}% of grant
        dollars land there, the gap between those numbers is the equity story to report each year.
      </p>

      {/* ── District table ── */}
      <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, overflow: "hidden", marginBottom: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f5f0ea", textAlign: "left" }}>
              {["District", "Stages, 2019–2023 survey", "Tracts in a stage", "Δ Black+Hispanic share", "PA items", "Grant $", "Activity mix"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bhDelta = r.bhDeltaN ? r.bhDeltaSum / r.bhDeltaN : null;
              const flagged = underserved(r);
              return (
                <tr key={r.district} style={{ borderTop: "1px solid #edeae4", background: flagged ? "#fff7ed" : undefined }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>
                    D{r.district}
                    {flagged && (
                      <span style={{ marginLeft: 7, fontSize: 12, fontWeight: 700, color: "#9a3412", background: "#ffedd5", padding: "1px 7px", borderRadius: 8 }}>
                        under-served
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>
                    <StageMix counts={r.mix} />
                  </td>
                  <td style={{ padding: "8px 10px", fontWeight: 600, color: r.staged > 0 ? "#9a3412" : "#64615b" }}>
                    {r.staged} <span style={{ fontWeight: 400, color: "var(--muted)" }}>/ {r.tracts}</span>
                  </td>
                  <td style={{ padding: "8px 10px", fontWeight: 600, color: bhDelta != null && bhDelta < 0 ? "#b91c1c" : "#15803d" }}>
                    {bhDelta != null ? `${bhDelta > 0 ? "+" : ""}${bhDelta.toFixed(1)} pts` : "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{r.items || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{r.dollars ? `$${r.dollars.toLocaleString()}` : "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, color: "#64615b" }}>
                    {Object.entries(r.byType).map(([t, n]) => `${n} ${typeLabel(t)}`).join(" · ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 2px 14px", lineHeight: 1.5 }}>
        "Δ Black+Hispanic share" is the tract-average change in combined Black + Hispanic population share
        from the earliest reliable census year (2000, else 2010) to the latest (2023) — measured change, not modeled risk.
        Tracts and PA items are assigned to districts by centroid / pin location (see the Coverage view caveat).
        <strong> Under-served</strong> = 3+ tracts in a displacement stage with fewer than one PA activity item per two such tracts.
        Stages are from the 2019–2023 census survey (vulnerable through continued loss).
      </p>

      {/* ── Pending-data note ── */}
      <div style={{ background: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#115e59", lineHeight: 1.55, maxWidth: 820 }}>
        <strong>Waiting on PA datasets:</strong> Homes Tour addresses and the Equity Audit data
        (promised in the committee follow-up) plug into <code>data/equityAudit.js</code> — the file
        documents the row shape. Once loaded, they appear in the tiles, the district table's activity
        mix, and the east/west split automatically, completing the audit's "how PA is serving and
        representing the city" side.
      </div>
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Newsreader',Georgia,serif", color: "#0f766e", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</div>
    </div>
  );
}
