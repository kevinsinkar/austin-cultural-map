import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import {
  usePlanStore,
  eventsToCsv,
  downloadCsv,
  planToBackupJson,
  parsePlanBackup,
  downloadJson,
} from "../utils/outreachStore";
import OutreachCoverage from "./OutreachCoverage";
import OutreachEquityAudit from "./OutreachEquityAudit";

/**
 * OutreachView — the Community Engagement committee's working list.
 * Every entry from the tabling-opportunity database, sorted by date,
 * filterable by tabling status / fit / district / timeframe, with a
 * per-event pipeline stage (identified → contacted → applied → confirmed
 * → tabled) and a working note, both saved locally. Export the current
 * (filtered) list as CSV for the monthly committee meeting.
 *
 * The list is grouped by month (entries with no single date follow, one
 * group per kind) and shown a few whole months at a time. The column
 * header and the month headings stay in view while scrolling — see the
 * "Outreach worklist" block in styles.css for the sticky positioning.
 */

const TIMEFRAMES = [
  { key: "upcoming", label: "Upcoming" },
  { key: "60", label: "Next 60 days" },
  { key: "all", label: "All (incl. past)" },
];

const FITS = ["All", "High", "Medium", "Low"];
const DISTRICTS = ["All", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"];

// Worklist columns. Widths are fixed so the columns hold still from one
// page to the next instead of resizing to whatever rows are on screen.
const COLUMNS = [
  { label: "Date", width: "12%" },
  { label: "Event · Contact", width: "27%" },
  { label: "Audience · Fit", width: "12%" },
  { label: "Tabling", width: "18%" },
  { label: "Pipeline", width: "12%" },
  { label: "Note", width: "14%" },
  { label: "Map", width: "5%" },
];

// Paging: a page is made of whole groups (months), packed until it holds
// about PAGE_ROWS rows, so a month is never cut in half. No page goes past
// PAGE_ROWS_MAX; only a single group longer than that is split across pages.
const PAGE_ROWS = 40;
const PAGE_ROWS_MAX = 50;

// Entries with no single upcoming date are listed after the months, one
// group per kind, in this order.
const UNDATED_GROUPS = {
  dated: { label: "Date not set", hint: "One-off events without a firm date — each row shows what is known" },
  recurring: { label: "Recurring series", hint: "No single date — each row shows the schedule or last known date" },
  listening: { label: "Listening / civic bodies", hint: "Standing meetings — each row shows the schedule or last known date" },
  tracking: { label: "Tracking", hint: "No confirmed date — each row shows what is known" },
};
const UNDATED_ORDER = Object.keys(UNDATED_GROUPS);

const FIRST_PAGE = { page: 0, group: null };
const WORKLIST_TOP_ID = "outreach-worklist-top";
const groupDomId = (key) => `outreach-group-${key}`;

/**
 * The date an entry is listed under: its start date. A recurring/civic
 * entry whose only known date is historical has no known next occurrence,
 * so it is listed with the undated entries (null).
 */
function listTime(ev, now) {
  const t = eventSortTime(ev);
  return t != null && ev.kind !== "dated" && t < now ? null : t;
}

function undatedRank(ev) {
  const i = UNDATED_ORDER.indexOf(ev.kind);
  return i < 0 ? UNDATED_ORDER.length : i;
}

/** Sorted events → [{ key, label, hint, events }]: one group per month, then one per undated kind. */
function groupEvents(events, now) {
  const byKey = new Map();
  events.forEach((ev) => {
    const t = listTime(ev, now);
    let key, label, hint;
    if (t == null) {
      const meta = UNDATED_GROUPS[ev.kind];
      key = `undated-${ev.kind}`;
      label = meta?.label || OUTREACH_KINDS[ev.kind] || "No date";
      hint = meta?.hint || "No single date";
    } else {
      const d = new Date(t);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (!byKey.has(key)) byKey.set(key, { key, label, hint, events: [] });
    byKey.get(key).events.push(ev);
  });
  return [...byKey.values()];
}

/**
 * Groups → pages: [{ groups, count, start }], where `start` is the 1-based
 * position of the page's first row in the whole filtered list. Each group
 * on a page also carries `total` (rows in the whole group), `from` (1-based
 * position of its first row within the group) and `domId`.
 */
function paginate(groups) {
  const parts = [];
  groups.forEach((g) => {
    const total = g.events.length;
    const domId = groupDomId(g.key);
    if (total <= PAGE_ROWS_MAX) {
      parts.push({ ...g, total, from: 1, domId });
      return;
    }
    for (let i = 0; i < total; i += PAGE_ROWS) {
      parts.push({
        ...g, events: g.events.slice(i, i + PAGE_ROWS), total, from: i + 1,
        domId: i === 0 ? domId : `${domId}-${i + 1}`,
      });
    }
  });

  const pages = [];
  let cur = null;
  let seen = 0;
  parts.forEach((p) => {
    const n = p.events.length;
    // Add the group to the open page only while that brings the page
    // closer to PAGE_ROWS; otherwise it starts the next page.
    const fits = cur
      && cur.count + n <= PAGE_ROWS_MAX
      && Math.abs(cur.count + n - PAGE_ROWS) < Math.abs(cur.count - PAGE_ROWS);
    if (fits) {
      cur.groups.push(p);
      cur.count += n;
    } else {
      cur = { groups: [p], count: n, start: seen + 1 };
      pages.push(cur);
    }
    seen += n;
  });

  // Don't leave a handful of rows stranded on a last page of their own.
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    const prev = pages[pages.length - 2];
    if (last.count < PAGE_ROWS / 4 && prev.count + last.count <= PAGE_ROWS_MAX) {
      prev.groups.push(...last.groups);
      prev.count += last.count;
      pages.pop();
    }
  }
  return pages;
}

export default function OutreachView({ onLocate, dviVersion }) {
  const { plan, setStage, setNote, setOutcome, importPlan } = usePlanStore();
  const [subview, setSubview] = useState("worklist");
  // Backup / restore of the plan file. planEpoch remounts the rows after a
  // restore so note and outcome fields pick up the restored values.
  const restoreInputRef = useRef(null);
  const [planEpoch, setPlanEpoch] = useState(0);
  const [backupMsg, setBackupMsg] = useState(null);
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
  // Paging: the page shown, and the group last picked in "Jump to" (if any).
  const [pagePos, setPagePos] = useState(FIRST_PAGE);
  // Where to scroll once a newly chosen page has rendered ({ id, focus }).
  const [scrollReq, setScrollReq] = useState(null);

  // Any change to a filter or the search goes back to the first page. The
  // filters are compared with the previous render's (React's "adjust state
  // while rendering" pattern), so no individual setter has to remember to.
  const filterSig = JSON.stringify([search, statusFilter, fit, district, kind, arena, timeframe, stageFilter]);
  const [seenFilterSig, setSeenFilterSig] = useState(filterSig);
  if (seenFilterSig !== filterSig) {
    setSeenFilterSig(filterSig);
    setPagePos(FIRST_PAGE);
  }

  useEffect(() => {
    if (!scrollReq) return;
    const el = document.getElementById(scrollReq.id);
    if (!el) return;
    if (scrollReq.focus) el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start" });
  }, [scrollReq]);

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
      // Dated entries first, by date; then the undated ones (see listTime),
      // each kind together — they are listed as groups of their own — by name.
      const ta = listTime(a, now);
      const tb = listTime(b, now);
      if (ta == null && tb == null) {
        return undatedRank(a) - undatedRank(b) || a.name.localeCompare(b.name);
      }
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ta - tb;
    });
  }, [search, statusFilter, fit, district, kind, arena, timeframe, stageFilter, plan, now, in60]);

  // Month groups, and the pages they are packed into. The page number is
  // clamped because a stage change can shorten the list under a Stage filter.
  const groups = useMemo(() => groupEvents(filtered, now), [filtered, now]);
  const pages = useMemo(() => paginate(groups), [groups]);
  const pageIndex = Math.max(0, Math.min(pagePos.page, pages.length - 1));
  const page = pages[pageIndex] || null; // null when nothing matches
  const jumpValue = !page
    ? ""
    : pagePos.group && page.groups.some((g) => g.key === pagePos.group)
      ? pagePos.group
      : page.groups[0].key;

  const goToPage = (n, fromBottom) => {
    setPagePos({ page: n, group: null });
    // From the bottom pager, take the reader (and keyboard focus) back up
    // to the start of the list; the top pager is already there.
    setScrollReq(fromBottom ? { id: WORKLIST_TOP_ID, focus: true } : null);
  };

  const jumpToGroup = (key) => {
    const n = pages.findIndex((pg) => pg.groups.some((g) => g.key === key));
    if (n < 0) return;
    setPagePos({ page: n, group: key });
    setScrollReq({ id: groupDomId(key) });
  };

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

  const backupPlan = () => {
    const n = Object.keys(plan).length;
    downloadJson(
      `pa-outreach-plan-backup-${new Date().toISOString().slice(0, 10)}.json`,
      planToBackupJson(plan)
    );
    setBackupMsg(`Backup saved to your downloads (${n} ${n === 1 ? "entry" : "entries"}).`);
  };

  const restorePlan = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be chosen again
    if (!file) return;
    const incoming = parsePlanBackup(await file.text());
    if (!incoming) {
      setBackupMsg("That file has no plan entries in it — nothing was changed.");
      return;
    }
    const n = Object.keys(incoming).length;
    importPlan(incoming);
    setPlanEpoch((v) => v + 1);
    setBackupMsg(`Restored ${n} ${n === 1 ? "entry" : "entries"}. Where an event was in both, the backup's version was used; other entries were kept.`);
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
              {[["worklist", "Worklist"], ["coverage", "Coverage"], ["equity", "Equity Audit"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSubview(key)}
                  aria-current={subview === key ? "page" : undefined}
                  style={{
                    padding: "4px 14px", borderRadius: 6, fontSize: 13,
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
          <p style={{ fontSize: 13, color: "#64615b", margin: "3px 0 0", maxWidth: 680, lineHeight: 1.45 }}>
            {subview === "worklist" &&
              "Tabling, partnership, and listening opportunities from the research database (Oct 2026 – Dec 2027), for prioritizing where Preservation Austin shows up. Set a pipeline stage and a note on each event — your plan is saved in this browser. Verify dates and tabling policies with organizers before committing."}
            {subview === "coverage" &&
              "Displacement need vs. outreach activity by council district and advocacy arena — the numbers behind the strategic plan's \"reach across all parts of the city\" and \"advocates activated by arena\" measures."}
            {subview === "equity" &&
              "How Austin is changing alongside how Preservation Austin is serving the city — PA's grants, awards, legacy businesses, and advocacy against each district's displacement need. The instrument for the equity standard's annual report."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {PLAN_STAGES.filter((s) => pipelineCounts[s.key]).map((s) => (
            <span key={s.key} style={{ fontSize: 12, fontWeight: 600, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: 10 }}>
              {pipelineCounts[s.key]} {s.label.replace(" ✓", "")}
            </span>
          ))}
          {subview === "worklist" && (
            <button
              onClick={exportCsv}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "1.5px solid #0f766e",
                background: "#fffffe", color: "#0f766e", fontSize: 13, fontWeight: 600,
                cursor: "pointer", minHeight: 34,
              }}
            >
              ⬇ Export CSV ({filtered.length})
            </button>
          )}
          {subview === "worklist" && (
            <>
              <button
                onClick={backupPlan}
                title="Download every stage, note, and outcome as a file. The browser copy is the only other copy."
                style={{
                  padding: "6px 12px", borderRadius: 8, border: "1.5px solid #64615b",
                  background: "#fffffe", color: "#44403c", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", minHeight: 34,
                }}
              >
                Back up plan
              </button>
              <button
                onClick={() => restoreInputRef.current?.click()}
                title="Load a backup file. Entries already here are kept unless the backup has the same event."
                style={{
                  padding: "6px 12px", borderRadius: 8, border: "1.5px solid #64615b",
                  background: "#fffffe", color: "#44403c", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", minHeight: 34,
                }}
              >
                Restore…
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json,.txt"
                onChange={restorePlan}
                style={{ display: "none" }}
                aria-label="Choose a plan backup file to restore"
              />
            </>
          )}
        </div>
      </div>
      {backupMsg && subview === "worklist" && (
        <p role="status" style={{ fontSize: 13, color: "#115e59", background: "#f0fdfa", border: "1px solid #ccfbf1", borderRadius: 8, padding: "6px 10px", margin: "0 0 10px" }}>
          {backupMsg}
        </p>
      )}

      {subview === "coverage" && (
        <OutreachCoverage plan={plan} dviVersion={dviVersion} />
      )}

      {subview === "equity" && (
        <OutreachEquityAudit dviVersion={dviVersion} />
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
              flex: "1 1 220px", maxWidth: 320, padding: "6px 10px", fontSize: 13,
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
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 2 }}>
            Tabling status
          </span>
          {Object.entries(OUTREACH_STATUS).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setStatusFilter((f) => ({ ...f, [key]: !f[key] }))}
              aria-pressed={statusFilter[key]}
              title={meta.desc}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", minHeight: 26,
                borderRadius: 13, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1.5px solid ${statusFilter[key] ? meta.color : "#d6d3cd"}`,
                background: statusFilter[key] ? `${meta.color}14` : "#fffffe",
                color: statusFilter[key] ? meta.color : "var(--muted)",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: statusFilter[key] ? meta.color : "#d6d3cd" }} aria-hidden="true" />
              {meta.label}
            </button>
          ))}
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
            {filtered.length} match · {openish} open to nonprofits{unmapped ? ` · ${unmapped} not mappable` : ""}
          </span>
        </div>
      </div>

      {/* ── Paging (top) ── */}
      {page && (
        <Pager
          summaryId={WORKLIST_TOP_ID}
          page={pageIndex}
          pageCount={pages.length}
          from={page.start}
          to={page.start + page.count - 1}
          total={filtered.length}
          onPage={(n) => goToPage(n, false)}
        >
          {groups.length > 1 && (
            <Select label="Jump to" value={jumpValue} onChange={jumpToGroup}
              options={groups.map((g) => [g.key, `${g.label} (${g.events.length})`])} />
          )}
        </Pager>
      )}

      {/* ── Worklist table ── (overflow, sticky headings: styles.css) */}
      <div className="outreach-worklist" style={{ background: "#fffffe", border: "1px solid #e8e5e0", borderRadius: 10 }}>
        <table className="outreach-table" aria-label="Outreach worklist" style={{ fontSize: 13 }}>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.label} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" style={{
                  padding: "0 10px", textAlign: "left", background: "#f5f0ea",
                  fontSize: 12, fontWeight: 700, color: "#64615b", textTransform: "uppercase", letterSpacing: ".05em",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          {page && page.groups.map((g) => (
            <tbody key={g.domId}>
              <tr>
                <th id={g.domId} colSpan={COLUMNS.length} scope="rowgroup" className="outreach-group-head"
                  style={{ padding: "7px 10px 7px 14px", textAlign: "left", background: "#faf8f5", fontWeight: 400, lineHeight: 1.3 }}>
                  <span style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>
                    {g.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                    {" · "}
                    {g.events.length === g.total
                      ? g.total
                      : `${g.from}–${g.from + g.events.length - 1} of ${g.total}${g.from > 1 ? " (continued)" : ""}`}
                  </span>
                  {g.hint && (
                    <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 12 }}>{g.hint}</span>
                  )}
                </th>
              </tr>
              {g.events.map((ev) => (
                <EventRow
                  key={`${ev.id}-${planEpoch}`}
                  ev={ev}
                  past={isPast(ev, now)}
                  planEntry={plan[ev.id]}
                  setStage={setStage}
                  setNote={setNote}
                  setOutcome={setOutcome}
                  onLocate={onLocate}
                />
              ))}
            </tbody>
          ))}
          {!page && (
            <tbody>
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
                  No opportunities match these filters.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      {/* ── Paging (bottom) ── */}
      {page && pages.length > 1 && (
        <Pager
          bottom
          page={pageIndex}
          pageCount={pages.length}
          from={page.start}
          to={page.start + page.count - 1}
          total={filtered.length}
          onPage={(n) => goToPage(n, true)}
        />
      )}

      <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 2px 0", lineHeight: 1.5 }}>
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
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64615b" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "5px 6px", minHeight: 30, fontSize: 13, border: "1px solid #d6d3cd", borderRadius: 7, background: "#fffffe", color: "#1a1a1a" }}
      >
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

/**
 * "Showing 1–39 of 244 · page 1 of 7" with Previous / Next. Rendered above
 * and below the table; the top one carries the id the bottom one scrolls
 * back to, and any extra controls (the "Jump to" select) as children.
 */
function Pager({ summaryId, bottom, page, pageCount, from, to, total, onPage, children }) {
  const many = pageCount > 1;
  return (
    <nav
      aria-label={bottom ? "Worklist pages (end of list)" : "Worklist pages"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        margin: bottom ? "10px 2px 0" : "0 2px 8px",
      }}
    >
      <span
        id={summaryId}
        tabIndex={summaryId ? -1 : undefined}
        aria-live={bottom ? undefined : "polite"}
        style={{ fontSize: 13, color: "#44403c", scrollMarginTop: 12 }}
      >
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong>
        {many && <span style={{ color: "var(--muted)" }}> · page {page + 1} of {pageCount}</span>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {children}
        {many && (
          <>
            <PagerButton label="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)}>
              <span aria-hidden="true">‹ </span>Previous
            </PagerButton>
            <PagerButton label="Next page" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
              Next<span aria-hidden="true"> ›</span>
            </PagerButton>
          </>
        )}
      </div>
    </nav>
  );
}

// aria-disabled rather than disabled: the button keeps keyboard focus when
// the reader reaches the first or last page.
function PagerButton({ label, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      style={{
        padding: "6px 14px", borderRadius: 8, minHeight: 34, fontSize: 13, fontWeight: 600,
        border: `1.5px solid ${disabled ? "#d6d3cd" : "#0f766e"}`,
        background: disabled ? "#f5f3f0" : "#fffffe",
        color: disabled ? "var(--muted)" : "#0f766e",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/**
 * An email address that wraps only after "@" or before a "." — never
 * mid-word and not at a hyphen. <wbr> adds no characters, so the address
 * still copies cleanly. A single piece too long to ever fit on a line (it
 * would take 30+ characters with no dot) is left free to wrap rather than
 * spill into the next column.
 */
function EmailText({ email }) {
  const at = email.lastIndexOf("@");
  const parts = [
    ...email.slice(0, at + 1).split(/(?=\.)/),
    ...email.slice(at + 1).split(/(?=\.)/),
  ].filter(Boolean);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      <span style={{ whiteSpace: part.length <= 30 ? "nowrap" : "normal" }}>{part}</span>
    </Fragment>
  ));
}

function EventRow({ ev, past, planEntry, setStage, setNote, setOutcome, onLocate }) {
  const meta = OUTREACH_STATUS[ev.status] || OUTREACH_STATUS.UNK;
  const stage = planEntry?.stage || "identified";
  const stageMeta = PLAN_STAGE_BY_KEY[stage];
  const arenaMeta = ARENAS[ev.arena] || ARENAS.community;
  const [noteDraft, setNoteDraft] = useState(planEntry?.note || "");

  const deadlineSoon = !!ev.deadlineText;
  const contacts = (ev.contacts || []).slice(0, 3);

  // Row rules and wrapping of long words come from .outreach-table td (styles.css).
  return (
    <tr style={{ opacity: past ? 0.5 : 1, verticalAlign: "top" }}>
      {/* Date — a parsed date stays on one line; a free-text schedule may wrap */}
      <td style={{ padding: "9px 10px" }}>
        <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 13, lineHeight: 1.3, whiteSpace: ev.startDate ? "nowrap" : "normal" }}>
          {formatEventDate(ev)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, lineHeight: 1.35 }}>
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
          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", padding: "1px 6px", borderRadius: 8, display: "inline-block" }}>
            ⏰ {ev.deadlineText}
          </div>
        )}
      </td>

      {/* Event, with its contacts */}
      <td style={{ padding: "9px 10px" }}>
        <div style={{ fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3 }}>{ev.name}</div>
        {ev.organizer && <div style={{ fontSize: 12, color: "#64615b" }}>{ev.organizer}</div>}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, lineHeight: 1.35 }}>
          {ev.venueName || ev.venueText?.slice(0, 60)}
          {(ev.districts || []).map((d) => (
            <span key={d} style={{ marginLeft: 5, fontSize: 12, fontWeight: 700, color: "#0f766e", background: "#f0fdfa", padding: "0 5px", borderRadius: 7 }}>{d}</span>
          ))}
          <span title="Advocacy arena (strategic plan)" style={{ marginLeft: 5, fontSize: 12, fontWeight: 700, color: arenaMeta.color, background: arenaMeta.bg, padding: "0 5px", borderRadius: 7 }}>
            {arenaMeta.label}
          </span>
        </div>
        {contacts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 14, marginTop: 1 }}>
            {contacts.map((c) =>
              c.includes("@") ? (
                <a key={c} href={`mailto:${c}`} style={{
                  minWidth: 0, maxWidth: "100%", padding: "4px 0", fontSize: 12, lineHeight: "16px",
                  color: "#0f766e", textDecoration: "underline", textDecorationColor: "#8fcfc7", textUnderlineOffset: 2,
                }}>
                  <EmailText email={c} />
                </a>
              ) : (
                <span key={c} style={{ padding: "4px 0", fontSize: 12, lineHeight: "16px", color: "#64615b", whiteSpace: "nowrap" }}>{c}</span>
              )
            )}
          </div>
        )}
      </td>

      {/* Audience / Fit */}
      <td style={{ padding: "9px 10px" }}>
        <div style={{ fontSize: 12, color: "#1a1a1a", lineHeight: 1.35 }}>
          {ev.audience || <span style={{ color: "var(--muted)" }}>—</span>}
        </div>
        {ev.fit && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "1px 7px", borderRadius: 8, marginTop: 2, display: "inline-block",
            color: ev.fit === "High" ? "#15803d" : ev.fit === "Medium" ? "#b45309" : "var(--muted)",
            background: ev.fit === "High" ? "#dcfce7" : ev.fit === "Medium" ? "#fef3c7" : "#f5f0ea",
          }}>
            {ev.fit} fit
          </span>
        )}
      </td>

      {/* Tabling */}
      <td style={{ padding: "9px 10px" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
          color: meta.color, background: `${meta.color}14`, padding: "2px 8px", borderRadius: 9,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: meta.color }} aria-hidden="true" />
          {meta.label}
        </span>
        {ev.tablingText && (
          <div title={ev.tablingText} style={{
            fontSize: 12, color: "#64615b", marginTop: 3, lineHeight: 1.35,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {ev.tablingText}
          </div>
        )}
      </td>

      {/* Pipeline stage */}
      <td style={{ padding: "9px 10px" }}>
        <select
          value={stage}
          onChange={(e) => setStage(ev.id, e.target.value)}
          aria-label={`Pipeline stage for ${ev.name}`}
          style={{
            padding: "4px 6px", minHeight: 28, maxWidth: "100%", fontSize: 12, fontWeight: 600, borderRadius: 7,
            border: `1.5px solid ${stageMeta.color}55`, background: stageMeta.bg, color: stageMeta.color,
            cursor: "pointer",
          }}
        >
          {PLAN_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {stage === "tabled" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            <input
              type="number"
              min={0}
              placeholder="~attend."
              title="Approximate attendance reached (aggregate estimate)"
              aria-label={`Approximate attendance at ${ev.name}`}
              defaultValue={planEntry?.outcome?.attendance ?? ""}
              onBlur={(e) => setOutcome(ev.id, "attendance", e.target.value)}
              style={{ flex: "1 1 62px", minWidth: 0, minHeight: 26, padding: "3px 6px", fontSize: 12, border: "1px solid #e8e5e0", borderRadius: 6, background: "#f8f7f4" }}
            />
            <input
              type="number"
              min={0}
              placeholder="signups"
              title="Signups / new contacts collected"
              aria-label={`Signups collected at ${ev.name}`}
              defaultValue={planEntry?.outcome?.signups ?? ""}
              onBlur={(e) => setOutcome(ev.id, "signups", e.target.value)}
              style={{ flex: "1 1 58px", minWidth: 0, minHeight: 26, padding: "3px 6px", fontSize: 12, border: "1px solid #e8e5e0", borderRadius: 6, background: "#f8f7f4" }}
            />
          </div>
        )}
      </td>

      {/* Note */}
      <td style={{ padding: "9px 10px" }}>
        <input
          type="text"
          placeholder="Add note…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => { if (noteDraft !== (planEntry?.note || "")) setNote(ev.id, noteDraft); }}
          aria-label={`Note for ${ev.name}`}
          style={{
            width: "100%", minHeight: 28, padding: "4px 8px", fontSize: 12, border: "1px solid #e8e5e0",
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
              padding: "4px 6px", minWidth: 32, minHeight: 28, borderRadius: 7, border: "1px solid #d6d3cd",
              background: "#fffffe", color: "#0f766e", fontSize: 13, cursor: "pointer",
            }}
          >
            📍
          </button>
        )}
      </td>
    </tr>
  );
}
