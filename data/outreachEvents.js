// ── Outreach / tabling opportunity dataset ──
// Generated from preservation_austin_tabling_database.md by
// scripts/parse_tabling_db.py (re-run it whenever the database file is
// updated; add --geocode to refresh coordinates). The markdown stays the
// human-readable source of truth; this file only adapts it for the app.

import RAW from "./outreach_events.json";

export const OUTREACH_EVENTS = RAW;

// Tabling-status metadata (legend order). Colors are distinct from the DVI
// ramp so pins never read as displacement data.
export const OUTREACH_STATUS = {
  OPEN:   { label: "Open to nonprofits",  color: "#15803d", desc: "Confirmed open to nonprofit / community tables" },
  NPO:    { label: "Nonprofit-only",      color: "#0d9488", desc: "Nonprofit-only table or fair" },
  PART:   { label: "Partner / invite",    color: "#7c3aed", desc: "Invitation or partner arrangement needed" },
  VEND:   { label: "Vendor (fee)",        color: "#b45309", desc: "Vendor booth with a fee" },
  LISTEN: { label: "Listening / civic",   color: "#1d4ed8", desc: "Public meeting — presence, not tabling" },
  UNK:    { label: "Unknown — ask",       color: "#57534e", desc: "Tabling policy not published; contact organizer" },
  CLOSED: { label: "Closed / sold out",   color: "#b91c1c", desc: "Applications closed — plan for next edition" },
};

// Strategic-plan advocacy arenas ("Grow Advocacy on Every Front" —
// advocates activated by arena).
export const ARENAS = {
  community: { label: "Community", color: "#0f766e", bg: "#f0fdfa" },
  political: { label: "Political", color: "#1d4ed8", bg: "#dbeafe" },
  business:  { label: "Business",  color: "#9a3412", bg: "#ffedd5" },
};

export const OUTREACH_KINDS = {
  dated: "Dated event",
  recurring: "Recurring series",
  listening: "Listening / civic body",
  tracking: "Tracking (no confirmed date)",
};

export const CONFIDENCE_LABELS = {
  C: "Confirmed by an official source",
  P: "Pattern-based (computed from prior years)",
  U: "Unconfirmed",
};

/** Pipeline stages for the committee workflow, in order. */
export const PLAN_STAGES = [
  { key: "identified", label: "Identified", color: "#64615b", bg: "#edeae4" },
  { key: "contacted",  label: "Contacted",  color: "#1d4ed8", bg: "#dbeafe" },
  { key: "applied",    label: "Applied",    color: "#7c3aed", bg: "#ede9fe" },
  { key: "confirmed",  label: "Confirmed",  color: "#b45309", bg: "#fef3c7" },
  { key: "tabled",     label: "Tabled ✓",   color: "#15803d", bg: "#dcfce7" },
  { key: "passed",     label: "Passed",     color: "#a8a49c", bg: "#f5f0ea" },
];

export const PLAN_STAGE_BY_KEY = Object.fromEntries(PLAN_STAGES.map((s) => [s.key, s]));

/** Sortable date for an event: startDate when known (ISO string → ms). */
export function eventSortTime(ev) {
  if (!ev.startDate) return null;
  const t = Date.parse(ev.startDate + "T12:00:00");
  return Number.isNaN(t) ? null : t;
}

/** The event's end (or start) as ms — used to decide whether it has passed. */
export function eventEndTime(ev) {
  const end = ev.endDate || ev.startDate;
  if (!end) return null;
  const t = Date.parse(end + "T23:59:00");
  return Number.isNaN(t) ? null : t;
}

/** Recurring/listening/tracking entries never "expire"; dated ones do. */
export function isPast(ev, now = Date.now()) {
  if (ev.kind !== "dated") return false;
  const end = eventEndTime(ev);
  return end != null && end < now;
}

export function formatEventDate(ev) {
  if (ev.startDate && !ev.approxDate) {
    const d = new Date(ev.startDate + "T12:00:00");
    const txt = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return ev.endDate ? `${txt} →` : txt;
  }
  if (ev.startDate && ev.approxDate) {
    const d = new Date(ev.startDate + "T12:00:00");
    return `~${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  }
  return ev.dateText ? ev.dateText.slice(0, 40) : "No date";
}
