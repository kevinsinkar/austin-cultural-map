// ── Committee outreach plan store ──
// Per-event pipeline stage + working note, persisted in localStorage so the
// plan survives reloads on the committee member's machine. Export/import
// via JSON keeps the plan shareable (email a file, or paste into the
// monthly meeting notes) without needing a backend.

import { useCallback, useState } from "react";

const STORE_KEY = "pa-outreach-plan-v1";

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(plan) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(plan));
  } catch { /* storage unavailable — plan lives for the session only */ }
}

/**
 * usePlanStore — { plan, setStage, setNote, importPlan }
 * plan: { [eventId]: { stage, note, updatedAt } }
 */
export function usePlanStore() {
  const [plan, setPlan] = useState(load);

  const setStage = useCallback((id, stage) => {
    setPlan((prev) => {
      const entry = { ...(prev[id] || {}), stage, updatedAt: new Date().toISOString() };
      if (stage === "identified" && !entry.note) {
        // "identified" with no note is the default state — drop the row
        const { [id]: _, ...rest } = prev;
        persist(rest);
        return rest;
      }
      const next = { ...prev, [id]: entry };
      persist(next);
      return next;
    });
  }, []);

  const setNote = useCallback((id, note) => {
    setPlan((prev) => {
      const entry = { ...(prev[id] || {}), note, updatedAt: new Date().toISOString() };
      if (!note && (!entry.stage || entry.stage === "identified")) {
        const { [id]: _, ...rest } = prev;
        persist(rest);
        return rest;
      }
      const next = { ...prev, [id]: entry };
      persist(next);
      return next;
    });
  }, []);

  // Outcome numbers captured after tabling an event (aggregate counts
  // only — attendance estimate and signups collected). These feed the
  // plan's "first-time participants" measure via the Coverage view.
  const setOutcome = useCallback((id, field, value) => {
    setPlan((prev) => {
      const entry = { ...(prev[id] || {}) };
      entry.outcome = { ...(entry.outcome || {}), [field]: value };
      if (value === "" || value == null) delete entry.outcome[field];
      if (Object.keys(entry.outcome).length === 0) delete entry.outcome;
      entry.updatedAt = new Date().toISOString();
      const next = { ...prev, [id]: entry };
      persist(next);
      return next;
    });
  }, []);

  const importPlan = useCallback((incoming) => {
    if (!incoming || typeof incoming !== "object") return false;
    setPlan((prev) => {
      const next = { ...prev, ...incoming };
      persist(next);
      return next;
    });
    return true;
  }, []);

  return { plan, setStage, setNote, setOutcome, importPlan };
}

/** CSV export of the (filtered) worklist, including plan stage and notes. */
export function eventsToCsv(events, plan) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "id", "name", "organizer", "kind", "arena", "date", "dateText", "venue", "districts",
    "audience", "tablingStatus", "tablingDetail", "confidence", "fit",
    "contacts", "deadline", "planStage", "planNote",
    "attendanceEstimate", "signupsCollected", "sourceNotes",
  ];
  const rows = events.map((ev) => {
    const p = plan[ev.id] || {};
    return [
      ev.id, ev.name, ev.organizer, ev.kind, ev.arena || "", ev.startDate || "", ev.dateText,
      ev.venueText, (ev.districts || []).join(" "), ev.audience || "",
      ev.status, ev.tablingText || "", ev.confidence || "", ev.fit || "",
      (ev.contacts || []).join("; "), ev.deadlineText || "",
      p.stage || "identified", p.note || "",
      p.outcome?.attendance ?? "", p.outcome?.signups ?? "", ev.notes || "",
    ].map(esc).join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
