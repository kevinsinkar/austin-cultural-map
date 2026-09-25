## Task: UX / UI overhaul — implement the September 2026 design review

### Overview

Implement the prioritized recommendations from
`docs/ux-ui-design-review.md` (read it first — it is the spec; this prompt
is the execution order). The work is sequenced so each phase is
independently shippable and verifiable in the browser before moving on.

### Architecture context (see ARCHITECTURE.md)

- View routing: map | history | compare | triage in `index.jsx`; all state
  lives there as ~25 `useState` hooks passed as props (~35 into MapView).
- Choropleth color: `getDviColor` in `utils/math.js` — continuous
  green→yellow→orange→red interpolation via d3.
- Capped affluent tracts: `isExcluded` flag on DVI points; TriageView
  already renders them as "Affluent / Appreciated" in `#1565C0` blue.
- Map rendering: Leaflet via `hooks/useAustinMap.js`; legend + slider +
  LegislationTrack rendered below the 600px map in
  `components/MapView.jsx`.
- Detail panel: `components/RegionDetailPanel.jsx` (sticky, 380px).
- Interpolation: `interpolateDvi` / `interpolateSocio` in `utils/math.js`;
  SNAP_YEARS / PLAY_YEARS / TIMELINE_EVENTS in `data/constants.js`.
- Agenda modal parses only the FIRST `| Priority` table in
  `public/ISSUES.md` (`index.jsx` `agendaItems`).

### Phase 1 — Choropleth redesign (highest priority)

1. Replace `getDviColor` with a **binned** (4–5 step), colorblind-safe
   sequential ramp (light cream → deep red, ColorBrewer YlOrRd or similar).
   Darkness carries the signal; no green anywhere in the displacement ramp.
2. Give capped "Exclusive / Appreciated" tracts (`isExcluded`) a
   categorically distinct fill — `#1565C0` blue (matching TriageView) or a
   hatch pattern — plus their own legend entry: "Exclusive / Appreciated
   (DVI capped)".
3. Rebuild the legend so its bins exactly match the fill steps. Keep "New
   Dev. N/A" neutral tan.
4. Update every consumer of the old band colors (`getDviBandColor`, detail
   panel DVI tile, neighborhood composition card, TractSparkline) so the
   app has ONE color story.
5. Verify: no #4ade80/#facc15/#fb923c/#ef4444 ramp remains on the map;
   simulate deuteranopia (browser devtools rendering emulation) and confirm
   bands remain distinguishable.

### Phase 2 — State consolidation + shareable URLs

1. Consolidate `index.jsx` view state into a single reducer (or context):
   `{ viewMode, year, boundaryMode, layers: {...}, activeRegionId,
   compA, compB, triageLens }`.
2. Serialize that object to the URL hash/query on change (debounced);
   hydrate from URL on load. A pasted link must reproduce the exact view:
   tab, year, layers, selection, compare pair, triage lens.
3. Keep it GitHub-Pages-safe: hash-based (`#/map?year=2005&...`) — no
   server routing.
4. Verify: copy URL mid-exploration, open in a fresh tab, identical view.

### Phase 3 — Uncertainty system (ConfidenceChip)

1. New component `components/ConfidenceChip.jsx`: small badge
   (High / Medium ⓘ / Low ⓘ) with a click/hover popover explaining WHY
   (pre-2010 crosswalk, interpolated year, partial tract coverage).
2. Place in exactly three spots: (a) beside the DVI number in the detail
   panel header, (b) in the map hover tooltip, (c) beside the year numeral
   when `year < 2010` ("Pre-2010 boundaries crosswalked — medium
   confidence").
3. Mark interpolated values: "interpolated" micro-label under the DVI tile
   for non-census years; in charts, solid dots on measured years, lighter
   connecting line between them.
4. Replace the current scattered amber-box / italic-footnote / footer
   treatments with this one system where they describe the same concept
   (keep genuinely distinct notes like the neighborhood aggregation
   disclaimer).

### Phase 4 — Map-first layout

1. Map fills viewport height (`calc(100vh - header height)`); legend
   becomes a compact floating card top-right ON the map; year + play
   control docked as a slim bar along the map's bottom edge (keep the 32px
   year numeral).
2. Collapse overlay toggles into a grouped "Layers" popover: Boundaries /
   Cultural assets / Pressure / Historical.
3. One-line DVI formula in the legend card footer.
4. Triage: move the Recommendation card to the top (under the lens
   toggle); scatter + table side-by-side ≥1400px.
5. Typography: establish an 11px minimum across the app (the 7.5px timeline
   labels move into Phase 5's popovers).

### Phase 5 — Ambient historical context

1. Timeline event ticks become clickable → popover card (2–3 sentences +
   "Read more" jump to the History tab). Remove `aria-hidden`; make
   keyboard-accessible.
2. Year-aware policy callouts: when the slider crosses an event relevant to
   the selected tract, surface a one-line callout in the detail panel
   (reuse the narrative-callout component).
3. History → Map cross-link: events with geography get "Show on map" (set
   year + flyTo + enable relevant overlay), mirroring `handleLocateOnMap`.
4. Tipping-point teaser line in the always-visible panel header.

### Deferred (do NOT do now, note only)

- Compare view: wire to global year or label "Latest data (2023)";
  citywide baseline lines.
- Layer decluttering: shape+color point encoding, HOLC as hatch/outline.
- Read-only mobile fallback below 900px.

### Working rules

- After each phase: `npm run build` must pass; verify in the browser;
  commit with a `feat(ux):` / `refactor(ux):` message before starting the
  next phase.
- Update `public/ISSUES.md` statuses (the "UX / UI Overhaul" table) as
  phases complete.
- No data-pipeline changes; this is presentation-layer work only.
