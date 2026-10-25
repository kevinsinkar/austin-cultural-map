import { useMemo, useState } from "react";
import {
  OUTREACH_EVENTS,
  OUTREACH_STATUS,
  OUTREACH_KINDS,
  ARENAS,
  CONFIDENCE_LABELS,
  PLAN_STAGES,
  PLAN_STAGE_BY_KEY,
  eventSortTime,
  isPast,
  formatEventDate,
} from "../data/outreachEvents";
import { usePlanStore, eventsToCsv, downloadCsv } from "../utils/outreachStore";
import OutreachCoverage from "./OutreachCoverage";

/**
 * OutreachView — the Community Engagement committee's working list.
 * Every entry from the tabling-opportunity database, sorted by date,
 * filterable by tabling status / fit / district / timeframe, with a
 * per-event pipeline stage (identified → contacted → applied → confirmed
 * → tabled) and a working note, both saved locally. Export the current
 * (filtered) list as CSV for the monthly committee meeting.
 */

const TIMEFRAMES = [
  { key: "upcoming", label: "Upcoming" },
  { key: "60", label: "Next 60 days" },
  { key: "all", label: "All (incl. past)" },
];

const FITS = ["All", "High", "Medium", "Low"];
const DISTRICTS = ["All", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"];

export default function OutreachView({ onLocate, dviVersion }) {
  const { plan, setStage, setNote, setOutcome } = usePlanStore();
  const [subview, setSubview] = useState("worklist");
  const [search, setSearch] = useState("");
  const [arena, setArena] = useState("All");
  const [statusFilter, setStatusFilter] = useState(() => {
    const init = {};
    Object.keys(OUTREACH_STATUS).forEach((k) => { init[k] = k !== "CLOSED"; });
    return init;
  });
  const [fit, setFit] = useState("All");
  const [district, setDistrict] = useState("All");
  const [kind, setKind] = useState("All");
  const [timeframe, setTimeframe] = useState("upcoming");
  const [stageFilter, setStageFilter] = useState("All");

  // Snapshot "now" once per mount — row past/upcoming state doesn't need to
  // tick live, and an impure Date.now() during render breaks purity rules.
  const [now] = useState(() => Date.now());
  const in60 = now + 60 * 24 * 3600 * 1000;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return OUTREACH_EVENTS.filter((ev) => {
      if (!statusFilter[ev.status]) return false;
      if (fit !== "All" && ev.fit !== fit) return false;
      if (district !== "All" && !(ev.districts || []).includes(district)) return false;
      if (kind !== "All" && ev.kind !== kind) return false;
      if (arena !== "All" && ev.arena !== arena) return false;
      const stage = plan[ev.id]?.stage || "identified";
      if (stageFilter !== "All" && stage !== stageFilter) return false;
      if (timeframe === "upcoming" && isPast(ev, now)) return false;
      if (timeframe === "60") {
        const t = eventSortTime(ev);
        if (isPast(ev, now)) return false;
        if (ev.kind === "dated" && (t == null || t > in60)) return false;
      }
      if (q) {
        const hay = [
          ev.name, ev.organizer, ev.venueText, ev.audience, ev.notes,
          ev.tablingText, (ev.districts || []).join(" "),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // A recurring/civic entry whose only known date is historical sorts
      // with the undated entries — its next occurrence is unknown.
      const sortTime = (ev) => {
        const t = eventSortTime(ev);
        return t != null && ev.kind !== "dated" && t < now ? null : t;
      };
      const ta = sortTime(a);
      const tb = sortTime(b);
      if (ta == null && tb == null) return a.name.localeCompare(b.name);
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ta - tb;
    });
  }, [search, statusFilter, fit, district, kind, arena, timeframe, stageFilter, plan, now, in60]);

  // Pipeline summary across ALL events (not just filtered)
  const pipelineCounts = useMemo(() => {
    const c = {};
    Object.values(plan).forEach((p) => {
      if (p.stage && p.stage !== "identified") c[p.stage] = (c[p.stage] || 0) + 1;
    });
    return c;
  }, [plan]);

  const openish = filtered.filter((e) => e.status === "OPEN" || e.status === "NPO").length;
  const unmapped = filtered.filter((e) => e.lat == null).length;

  const exportCsv = () => {
    downloadCsv(
      `pa-outreach-worklist-${new Date().toISOString().slice(0, 10)}.csv`,
      eventsToCsv(filtered, plan)
    );
  };

  return (
    <section aria-label="Outreach planner" style={{ width: "100%" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 20, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>
              Outreach Planner
            </h2>
            <nav aria-label="Planner view" style={{ display: "flex", background: "#edeae4", borderRadius: 8, padding: 3 }}>
              {[["worklist", "Worklist"], ["coverage", "Coverage"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSubview(key)}
                  aria-current={subview === key ? "page" : undefined}
                  style={{
                    padding: "4px 14px", borderRadius: 6, fontSize: 12,
                    fontWeight: subview === key ? 600 : 400,
                    background: subview === key ? "#fffffe" : "transparent",
                    color: subview === key ? "#0f766e" : "#7c6f5e",
                    border: "none", cursor: "pointer", minHeight: 28,
                    boxShadow: subview === key ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <p style={{ fontSize: 12.5, color: "#64615b", margin: "3px 0 0", maxWidth: 680, lineHeight: 1.45 }}>
            {subview === "worklist"
              ? "Tabling, partnership, and listening opportunities from the research database (Oct 2026 – Dec 2027), for prioritizing where Preservation Austin shows up. Set a pipeline stage and a note on each event — your plan is saved in this browser. Verify dates and tabling policies with organizers before committing."
              : "Displacement need vs. outreach activity by council district and advocacy arena — the numbers behind the strategic plan's \"reach across all parts of the city\" and \"advocates activated by arena\" measures."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {PLAN_STAGES.filter((s) => pipelineCounts[s.key]).map((s) => (
            <span key={s.key} style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: 10 }}>
              {pipelineCounts[s.key]} {s.label.replace(" ✓", "")}
            </span>
          ))}
          <button
            onClick={exportCsv}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1.5px solid #0f766e",
              background: "#fffffe", color: "#0f766e", fontSize: 12, fontWeight: 600,
              cursor: "pointer", minHeight: 34,
            }}
          >
            ⬇ Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      {subview === "coverage" && (
        <OutreachCoverage plan={plan} dviVersion={dviVersion} />
      )}

      {subview === "worklist" && (<>
      {/* ── Filters ── */}
      <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input
            type="search"
            placeholder="Search events, venues, audiences…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search outreach opportunities"
            style={{
              flex: "1 1 220px", maxWidth: 320, padding: "6px 10px", fontSize: 12.5,
              border: "1px solid #d6d3cd", borderRadius: 7, background: "#f8f7f4",
            }}
          />
          <Select label="Timeframe" value={timeframe} onChange={setTimeframe}
            options={TIMEFRAMES.map((t) => [t.key, t.label])} />
          <Select label="Fit" value={fit} onChange={setFit}
            options={FITS.map((f) => [f, f === "All" ? "All fit levels" : `${f} fit`])} />
          <Select label="District" value={district} onChange={setDistrict}
            options={DISTRICTS.map((d) => [d, d === "All" ? "All districts" : d])} />
          <Select label="Type" value={kind} onChange={setKind}
            options={[["All", "All types"], ...Object.entries(OUTREACH_KINDS)]} />
          <Select label="Arena" value={arena} onChange={setArena}
            options={[["All", "All arenas"], ...Object.entries(ARENAS).map(([k, a]) => [k, a.label])]} />
          <Select label="Stage" value={stageFilter} onChange={setStageFilter}
            options={[["All", "All stages"], ...PLAN_STAGES.map((s) => [s.key, s.label])]} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 2 }}>
            Tabling status
          </span>
          {Object.entries(OUTREACH_STATUS).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setStatusFilter((f) => ({ ...f, [key]: !f[key] }))}
              aria-pressed={statusFilter[key]}
              title={meta.desc}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
                borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${statusFilter[key] ? meta.color : "#d6d3cd"}`,
                background: statusFilter[key] ? `${meta.color}14` : "#fffffe",
                color: statusFilter[key] ? meta.color : "#a8a49c",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: statusFilter[key] ? meta.color : "#d6d3cd" }} aria-hidden="true" />
              {meta.label}
            </button>
          ))}
          <span style={{ fontSize: 11.5, color: "#a8a49c", marginLeft: "auto" }}>
            {filtered.length} shown · {openish} open to nonprofits{unmapped ? ` · ${unmapped} not mappable` : ""}
          </span>
        </div>
      </div>

      {/* ── Worklist table ── */}
      <div style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#f5f0ea", textAlign: "left" }}>
              {["Date", "Event", "Audience · Fit", "Tabling", "Contact", "Pipeline", "Note", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", fontSize: 10.5, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev) => (
              <EventRow
                key={ev.id}
                ev={ev}
                past={isPast(ev, now)}
                planEntry={plan[ev.id]}
                setStage={setStage}
                setNote={setNote}
                setOutcome={setOutcome}
                onLocate={onLocate}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "#a8a49c", fontSize: 13 }}>
                  No opportunities match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "#a8a49c", margin: "10px 2px 0", lineHeight: 1.5 }}>
        Source: Preservation Austin tabling-opportunity research database (compiled Oct 2026, two passes).
        Date confidence — C: {CONFIDENCE_LABELS.C.toLowerCase()} · P: {CONFIDENCE_LABELS.P.toLowerCase()} · U: {CONFIDENCE_LABELS.U.toLowerCase()}.
        Council districts are inferred from addresses; verify before relying on them.
        Re-run <code>scripts/parse_tabling_db.py</code> after updating the database file.
      </p>
      </>)}
    </section>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#64615b" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "5px 6px", fontSize: 12, border: "1px solid #d6d3cd", borderRadius: 7, background: "#fffffe", color: "#1a1a1a" }}
      >
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function EventRow({ ev, past, planEntry, setStage, setNote, setOutcome, onLocate }) {
  const meta = OUTREACH_STATUS[ev.status] || OUTREACH_STATUS.UNK;
  const stage = planEntry?.stage || "identified";
  const stageMeta = PLAN_STAGE_BY_KEY[stage];
  const arenaMeta = ARENAS[ev.arena] || ARENAS.community;
  const [noteDraft, setNoteDraft] = useState(planEntry?.note || "");

  const deadlineSoon = !!ev.deadlineText;

  return (
    <tr style={{ borderTop: "1px solid #edeae4", opacity: past ? 0.5 : 1, verticalAlign: "top" }}>
      {/* Date */}
      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 12 }}>{formatEventDate(ev)}</div>
        <div style={{ fontSize: 10.5, color: "#a8a49c", marginTop: 1 }}>
          {ev.confidence ? (
            <span title={CONFIDENCE_LABELS[ev.confidence]} style={{
              fontWeight: 700,
              color: ev.confidence === "C" ? "#15803d" : ev.confidence === "P" ? "#b45309" : "#b91c1c",
            }}>
              {ev.confidence}
            </span>
          ) : null}
          {ev.confidence ? " · " : ""}{OUTREACH_KINDS[ev.kind]}
        </div>
        {deadlineSoon && (
          <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", padding: "1px 6px", borderRadius: 8, display: "inline-block" }}>
            ⏰ {ev.deadlineText}
          </div>
        )}
      </td>

      {/* Event */}
      <td style={{ padding: "9px 10px", minWidth: 200, maxWidth: 320 }}>
        <div style={{ fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 }}>{ev.name}</div>
        {ev.organizer && <div style={{ fontSize: 11, color: "#64615b" }}>{ev.organizer}</div>}
        <div style={{ fontSize: 11, color: "#a8a49c", marginTop: 1, lineHeight: 1.35 }}>
          {ev.venueName || ev.venueText?.slice(0, 60)}
          {(ev.districts || []).map((d) => (
            <span key={d} style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: "#0f766e", background: "#f0fdfa", padding: "0 5px", borderRadius: 7 }}>{d}</span>
          ))}
          <span title="Advocacy arena (strategic plan)" style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: arenaMeta.color, background: arenaMeta.bg, padding: "0 5px", borderRadius: 7 }}>
            {arenaMeta.label}
          </span>
        </div>
      </td>

      {/* Audience / Fit */}
      <td style={{ padding: "9px 10px", maxWidth: 160 }}>
        <div style={{ fontSize: 11.5, color: "#1a1a1a", lineHeight: 1.35 }}>{ev.audience || "—"}</div>
        {ev.fit && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, marginTop: 2, display: "inline-block",
            color: ev.fit === "High" ? "#15803d" : ev.fit === "Medium" ? "#b45309" : "#a8a49c",
            background: ev.fit === "High" ? "#dcfce7" : ev.fit === "Medium" ? "#fef3c7" : "#f5f0ea",
          }}>
            {ev.fit} fit
          </span>
        )}
      </td>

      {/* Tabling */}
      <td style={{ padding: "9px 10px", maxWidth: 240 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700,
          color: meta.color, background: `${meta.color}14`, padding: "2px 8px", borderRadius: 9,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: meta.color }} aria-hidden="true" />
          {meta.label}
        </span>
        {ev.tablingText && (
          <div title={ev.tablingText} style={{
            fontSize: 11, color: "#64615b", marginTop: 3, lineHeight: 1.35,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {ev.tablingText}
          </div>
        )}
      </td>

      {/* Contact */}
      <td style={{ padding: "9px 10px", maxWidth: 170 }}>
        {(ev.contacts || []).length === 0 && <span style={{ color: "#d6d3cd" }}>—</span>}
        {(ev.contacts || []).slice(0, 3).map((c) =>
          c.includes("@") ? (
            <a key={c} href={`mailto:${c}`} style={{ display: "block", fontSize: 11, color: "#0f766e", textDecoration: "none", wordBreak: "break-all", lineHeight: 1.4 }}>
              {c}
            </a>
          ) : (
            <div key={c} style={{ fontSize: 11, color: "#64615b", lineHeight: 1.4 }}>{c}</div>
          )
        )}
      </td>

      {/* Pipeline stage */}
      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
        <select
          value={stage}
          onChange={(e) => setStage(ev.id, e.target.value)}
          aria-label={`Pipeline stage for ${ev.name}`}
          style={{
            padding: "4px 6px", fontSize: 11.5, fontWeight: 600, borderRadius: 7,
            border: `1.5px solid ${stageMeta.color}55`, background: stageMeta.bg, color: stageMeta.color,
            cursor: "pointer",
          }}
        >
          {PLAN_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {stage === "tabled" && (
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <input
              type="number"
              min={0}
              placeholder="~attend."
              title="Approximate attendance reached (aggregate estimate)"
              aria-label={`Approximate attendance at ${ev.name}`}
              defaultValue={planEntry?.outcome?.attendance ?? ""}
              onBlur={(e) => setOutcome(ev.id, "attendance", e.target.value)}
              style={{ width: 62, padding: "3px 6px", fontSize: 11, border: "1px solid #e8e5e0", borderRadius: 6, background: "#f8f7f4" }}
            />
            <input
              type="number"
              min={0}
              placeholder="signups"
              title="Signups / new contacts collected"
              aria-label={`Signups collected at ${ev.name}`}
              defaultValue={planEntry?.outcome?.signups ?? ""}
              onBlur={(e) => setOutcome(ev.id, "signups", e.target.value)}
              style={{ width: 58, padding: "3px 6px", fontSize: 11, border: "1px solid #e8e5e0", borderRadius: 6, background: "#f8f7f4" }}
            />
          </div>
        )}
      </td>

      {/* Note */}
      <td style={{ padding: "9px 10px", minWidth: 140 }}>
        <input
          type="text"
          placeholder="Add note…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => { if (noteDraft !== (planEntry?.note || "")) setNote(ev.id, noteDraft); }}
          aria-label={`Note for ${ev.name}`}
          style={{
            width: "100%", padding: "4px 8px", fontSize: 11.5, border: "1px solid #e8e5e0",
            borderRadius: 7, background: "#f8f7f4", color: "#1a1a1a",
          }}
        />
      </td>

      {/* Map */}
      <td style={{ padding: "9px 8px" }}>
        {ev.lat != null && onLocate && (
          <button
            onClick={() => onLocate(ev)}
            title="Show on map"
            aria-label={`Show ${ev.name} on the map`}
            style={{
              padding: "4px 8px", borderRadius: 7, border: "1px solid #d6d3cd",
              background: "#fffffe", color: "#0f766e", fontSize: 12, cursor: "pointer",
            }}
          >
            📍
          </button>
        )}
      </td>
    </tr>
  );
}
