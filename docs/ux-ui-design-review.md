# UX / UI Design Review — September 2026

An expert-lens evaluation of the layout, interface, and user experience of
**Austin's Shifting Ground**, grounded in the current implementation
(`index.jsx`, `components/MapView.jsx`, `components/RegionDetailPanel.jsx`,
`components/TriageView.jsx`, `components/ComparisonView.jsx`,
`utils/math.js`). Audiences considered: researchers, city planners, and
community advocates (Preservation Austin).

**Summary of the three biggest problems:**

1. The choropleth's green→red ramp is both a colorblindness failure and an
   ethical-framing failure for capped affluent tracts.
2. No shareable state — a researcher cannot cite or link to a specific view.
3. Uncertainty messaging exists but is scattered across five different visual
   treatments instead of one consistent system.

---

## 1. Information Architecture & Spatial Layout

### What's working

- The Map / History / Compare / Triage tab split matches the three user tasks
  (explore, contextualize, decide) cleanly.
- The sticky 380px detail panel with Demographics / Economics / Culture
  sub-tabs keeps tract depth out of the map's way.
- The `handleLocateOnMap` bridge from Triage back to the map is exactly the
  kind of cross-view linking these tools usually lack.

### Map view: the vertical stack is fighting the design

Current layout: toolbar → 600px fixed map → time slider → event ticks →
legislation track → legend, all stacked. Consequences: the legend sits two
scroll-heights below the colors it explains, and the time slider — the tool's
signature interaction — is below the fold on shorter laptops.

Recommended restructure:

- Make the map fill the viewport height (`calc(100vh - header)`) and float
  the controls **on** it: legend as a compact card in the map's top-right,
  the year + play control docked as a slim bar along the map's bottom edge.
  The 32px year numeral is a strong anchor — keep it.
- Collapse the growing toggle row (6 buttons plus the boundary switch, and
  growing) into a grouped **Layers** popover: *Boundaries* (tracts /
  neighborhoods), *Cultural assets* (businesses, music venues, Preservation
  Austin), *Pressure* (Project Connect, development), *Historical* (HOLC
  1935, AISD closures). Grouping matters more than saving pixels — it teaches
  users the data model.
- The DVI sub-index weights live only inside Triage's "Advanced" accordion.
  That is the right home for *editing* them, but the map legend should state
  the formula in one line, since the choropleth is the DVI's primary display.

### Compare view

The 2×2 synchronized chart grid is good. Two issues:

- The summary table and narrative are pinned to 2023/2020 while the app has a
  global year slider — Compare silently ignores `year`, which reads as a bug
  to a careful user. Either wire it to the global year or label the view
  "Latest data (2023)" explicitly in the header, not just in table captions.
- Add a pinned "Austin citywide" reference line on each chart; without a
  baseline, two gentrifying tracts can look falsely divergent.

### Triage view

The lens cards with embedded questions ("Which underserved communities need
investment most?") are the best piece of IA in the app. But the ordering
buries the answer: scatter → 500px table → *then* the Recommendation card.
Grant reviewers read conclusions first.

- Move the Recommendation card to the top, directly under the lens toggle;
  let the scatter and table serve as its evidence.
- On wide screens, place scatter and table side-by-side (they are already
  selection-linked) to halve the scrolling.

### Structural prerequisite

`index.jsx` holds ~25 `useState` hooks and passes ~35 props into MapView.
Moving view state into a reducer or context is not just hygiene — it is the
prerequisite for URL-encoded state (Recommendation #2), which requires one
serializable state object.

---

## 2. Visual Hierarchy & Data Visualization

### The choropleth ramp is the most important fix in this document

`getDviColor` (utils/math.js) interpolates green → yellow → orange → red.
Three distinct problems:

1. **Colorblind failure.** Green-to-red is the canonical deuteranopia trap;
   roughly 1 in 12 male users cannot distinguish "Stable" (#4ade80) from
   "Historic Displacement" (#ef4444). Use a sequential single-direction ramp
   (light cream → deep red, e.g. ColorBrewer YlOrRd) where *darkness* carries
   the signal.
2. **The ethical problem with the cap.** Affluent tracts capped at DVI ≤ 20
   render in the same green as genuinely stable working-class tracts. Green
   reads as "healthy," so West Austin's exclusionary stability is displayed
   as a success state — the exact misreading the cap rule was designed to
   prevent. TriageView already solves this: it categorizes these tracts as
   "Affluent / Appreciated" in a distinct blue (#1565C0). The map should
   match: give capped tracts a *categorically* different treatment (that
   blue, or a hatch pattern) with their own legend entry — "Exclusive /
   Appreciated (DVI capped)" — so the map says "different phenomenon," not
   "low score." This also makes the map and Triage legends consistent.
3. **Continuous fill, discrete legend.** The map interpolates smoothly but
   the legend shows four bins. A user cannot match an on-screen olive-yellow
   back to a bin boundary. Bin the fill to match the legend (4–5 steps).
   Binned choropleths are also more honest for an index with ±crosswalk
   uncertainty — smooth gradients imply precision the data doesn't have.

### Layer clutter

All point layers are small circles distinguished only by color, and colors
collide across layers (businesses green #4ade80 vs. the choropleth's green;
PA purple #7c3aed vs. Compare's Region B purple).

- Use **shape + color** jointly: circles for businesses, squares for
  Preservation Austin, ✕ glyphs for school closures (the toggle icons already
  hint at this — carry it onto the map).
- Cluster or fade points below a zoom threshold.
- When HOLC 1935 is on, two polygon fills stack (HOLC over DVI). Render HOLC
  as hatched outlines or auto-drop the choropleth to ~30% opacity with a
  note, so users never read a blended color as data.

### Keep the interactive-legend pattern

The Preservation Austin legend chips that toggle `paFilter` are a genuinely
good pattern — legend as control surface. Extend it: clicking a DVI band in
the legend should highlight/isolate those tracts.

### Typography floor

There is text at 7.5px (timeline event labels), 9px, and 9.5px throughout.
Below ~11px is unreadable for a large fraction of a public audience.
Establish an 11px floor; anything that can't fit at 11px should become a
tooltip or a click-through, not smaller.

---

## 3. Data Confidence & Transparency UX

Already a strength — the amber "Census data available for X only" notes, the
nearest-year fallback warnings, the neighborhood aggregation disclaimers, and
the per-tract data-gap breakdown in the contributing-tracts drawer are more
disclosure than most academic tools ship. Two refinements:

### Unify the visual language

Uncertainty currently appears as amber boxes, italic gray footnotes, a footer
line, and inline parentheticals — five treatments for one concept. Build a
single `ConfidenceChip` component: a small badge (High / Medium ⓘ / Low ⓘ)
whose popover explains *why* (crosswalked boundaries, interpolated year,
partial tract coverage). Place it in exactly three spots:

1. Next to the DVI number in the detail panel header.
2. In the map hover tooltip.
3. Beside the year numeral when the slider is pre-2010 ("Pre-2010 boundaries
   crosswalked — medium confidence" as a persistent, quiet badge on the map,
   not a modal or a paragraph).

Point-of-reading disclosure builds trust; footer disclosure reads as fine
print.

### Mark interpolation, not just gaps

Values between census years are linearly interpolated (`interpolateDvi`) but
display identically to measured values — the DVI tile shows "43" for 2007
with the same confidence as for 2010. Cheap fixes with high trust payoff:

- An "interpolated" micro-label under the DVI tile for non-census years.
- In charts, solid dots for measured years with a lighter line between them.

Principle: **never let a derived number wear a measured number's clothes.**

---

## 4. Historical & Policy Context Integration

The bones are good: HOLC overlay with grade legend and attribution, the
LegislationTrack under the slider, the "What Happened Here?" tipping-point
card, and a full History tab. The problem is that the context is siloed — it
lives in places users must already know to look.

- **Make the timeline event ticks interactive.** They are currently 7.5px,
  `aria-hidden`, decorative. These are the 1928-Plan / Smart-Growth / HOME
  anchors sitting exactly where the user's attention is (the slider). Make
  each tick clickable → small popover card (2–3 sentences + "Read more" →
  History tab, pre-scrolled). The existing opacity-by-proximity behavior is a
  nice touch; build on it.
- **Context should follow the year.** When the slider crosses a policy event
  that touches the selected tract (e.g., Smart Growth 1997 while an East
  Austin tract is selected), surface a one-line callout in the detail panel —
  the callout component and the tipping-point data model already exist; this
  is a join, not a new system.
- **Cross-link History ↔ Map.** History events with a geography should have a
  "show on map" action (set year + fly to + enable the relevant overlay),
  mirroring `handleLocateOnMap`. The 1928 Plan is a *spatial* story; a text
  tab can't carry it alone.
- **Surface the tipping point outside the Culture tab.** It is the strongest
  narrative asset, but invisible unless the user clicks the third tab. Put a
  one-line teaser ("Tipping point: 2005–2015 →") in the always-visible panel
  header.

---

## 5. Prioritized Recommendations

1. **Fix the choropleth first** — binned, colorblind-safe sequential ramp;
   categorically distinct blue/hatched treatment for capped
   "Exclusive/Appreciated" tracts matching Triage's existing color; legend
   bins that match the fill. Highest impact-to-effort ratio in the app, and
   the ethical core of the visualization.
2. **URL-encode view state** (view, year, layers, selected tract, compare
   pair, triage lens). Researchers cite, planners paste into memos, advocates
   share — a view that can't be linked barely exists for this audience.
   Requires consolidating index.jsx state first.
3. **Ship one uncertainty system**: a single ConfidenceChip with explanatory
   popovers at the DVI tile, map tooltip, and year display; visually
   distinguish interpolated from measured values in every chart and stat.
4. **Go map-first in layout**: full-height map, on-map legend and docked time
   bar, grouped Layers popover; in Triage, move the Recommendation card to
   the top. Same information, ordered by what each audience needs first.
5. **Make history ambient, not archived**: clickable timeline events,
   year-aware policy callouts in the detail panel, and map-linked History
   events — so the 1928 Plan and I-35 appear at the moment they explain what
   the user is looking at.

**Caveat outside the brief's scope:** the current `<900px` blocking notice is
a reasonable v1 call, but community advocates disproportionately share and
open links on phones — a read-only mobile fallback (tract lookup + DVI card,
no map) would serve Recommendation #2's sharing story.
