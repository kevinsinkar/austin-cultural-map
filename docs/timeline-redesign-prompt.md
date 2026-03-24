## Task: Rebuild the Timeline View as two sub-views — Era Stories and Dashboard

### Overview

Replace the current single-layout TimelineView with two toggleable modes:

- **Era Stories** — time flows vertically, broken into 4–5 narrative
  chapters. Each chapter shows a shared horizontal time axis with three
  parallel tracks (policy events, business lifespans, demographic context).
  Policy-to-closure connections are visible by default. Each chapter ends
  with an auto-generated era summary.

- **Dashboard** — everything on one screen, no scrolling. Four synchronized
  horizontal tracks (policy, businesses, demographics, DVI heatstrip)
  sharing a non-linearly compressed time axis. A vertical crosshair
  follows the mouse across all tracks simultaneously.

Both modes share the same filters, the same detail panel, and the same data.

### Architecture context (see ARCHITECTURE.md)

**Files to create:**
- `components/TimelineEras.jsx` — Era Stories sub-view
- `components/TimelineDashboard.jsx` — Dashboard sub-view

**Files to modify:**
- `components/TimelineView.jsx` — becomes a thin wrapper with the mode
  toggle, shared filters, shared detail panel, and delegates to the
  active sub-view

**Files to read (not modify):**
- `data/businesses.js` — `LEGACY_OPERATING` (41 entries), `LEGACY_CLOSED`
  (52 entries). Each has: `id`, `name`, `est` (year), `culture`, `type`,
  `region`, `region_id`, `notes`, `lat`, `lng`, `pressure` (operating)
  or `closed`/`closureDate`, `cause`, `replacedBy` (closed).
- `data/timelineInfra.js` — `TIMELINE_INFRA` array of events with:
  `year`, `label`, `summary`, `cat` (displacement|policy|development|
  cultural|economic)
- `data/interim_demographics.js` — `DEMOGRAPHICS` array with per-region
  per-year entries: `pctBlack`, `pctHispanic`, `pctWhite`, `pctAsian`,
  `pctOther` (0–1), `popBlack`, `popHispanic`, `popWhite`, `total`,
  `region_id`, `year`
- `data/regionLookup.js` — `VISIBLE_REGIONS`
- `data/auditedDvi.js` — `AUDITED_DVI_LOOKUP`
- `utils/math.js` — `interpolateDvi`, `getDviColor`
- `utils/formatters.js` — `catColor` (category → color for infrastructure events)
- `data/constants.js` — `DEMO_COLORS` (White, Black, Hispanic, Asian, Other)

**Existing constants to reuse from current TimelineView:**
```javascript
const CULTURE_COLORS = {
  "African American": "#7c3aed",
  "African American Heritage": "#7c3aed",
  "Mexican American/Latino": "#d97706",
  "General Austin": "#78716c",
  "LGBTQ+": "#db2777",
  "Immigrant Community (Vietnamese)": "#0891b2",
  "Immigrant Community (Asian)": "#0891b2",
  "Country/Americana": "#b45309",
};
```

Extract these into a shared location (either keep in TimelineView.jsx and
pass as props, or move to a `timelineConstants.js` file).

**Closure year extraction** (from current TimelineView):
```javascript
function closeYear(b) {
  if (typeof b.closed === "number") return b.closed;
  if (b.closureDate) {
    const m = b.closureDate.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }
  return null;
}
```

### Step 1: Define the eras

Create an `ERAS` constant (in TimelineView.jsx or a shared file):

```javascript
const ERAS = [
  {
    id: "segregation",
    title: "Segregation & Roots",
    subtitle: "The Master Plan and the communities it created",
    years: [1925, 1964],
    // Background context for the era summary
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
    context: "The 1997 Smart Growth Initiative directed $100M+ in bonds and infrastructure investment into East Austin, triggering rapid property value appreciation. Chapter 380 megadeals with Apple, Samsung, and others attracted a high-salaried tech workforce the housing supply could not accommodate. Property values east of I-35 began rising faster than incomes.",
  },
  {
    id: "displacement",
    title: "The Displacement Era",
    subtitle: "Cultural loss, rising rents, and the fight to stay",
    years: [2015, 2026],
    context: "The preceding boom reached its full displacement effect. East Austin's Black population declined by over 30% in some tracts. Legacy businesses faced 200–350% rent increases. The HOME Initiative, Agent of Change principle, and Cultural District Framework represent recent policy responses, but many closures are irreversible.",
  },
];
```

These are editorial choices — the dates should align with major events in
your `TIMELINE_INFRA` data. Adjust the years and descriptions based on
what events actually exist in the data.

### Step 2: Rewrite TimelineView.jsx as a wrapper

```jsx
import { useState, useMemo } from "react";
import { LEGACY_OPERATING, LEGACY_CLOSED, DEMOGRAPHICS, TIMELINE_INFRA } from "../data";
import TimelineEras from "./TimelineEras";
import TimelineDashboard from "./TimelineDashboard";

// Shared constants (or import from timelineConstants.js)
const CULTURE_COLORS = { /* ... */ };
const ERAS = [ /* ... as defined above */ ];

export default function TimelineView({ tlFilter, setTlFilter }) {
  const [timelineMode, setTimelineMode] = useState("eras"); // "eras" | "dashboard"
  const [cultureFilter, setCultureFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [hoveredItem, setHoveredItem] = useState(null);  // business or event
  const [selectedItem, setSelectedItem] = useState(null);
  const [focusEra, setFocusEra] = useState(null); // for "View in Dashboard" links

  // Shared filtered data
  const filteredEvents = useMemo(() =>
    TIMELINE_INFRA.filter(e => tlFilter === "all" || e.cat === tlFilter),
    [tlFilter]
  );

  const { opBars, clBars } = useMemo(() => {
    // Build bar objects from businesses (same logic as current)
    // Apply cultureFilter and actionFilter
    // Return { opBars, clBars }
  }, [cultureFilter, actionFilter]);

  return (
    <section aria-label="Timeline view">
      {/* ── Mode toggle + Shared filters ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center",
                      marginBottom: 12, flexWrap: "wrap" }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", background: "#edeae4",
                        borderRadius: 8, padding: 3 }}>
            {[
              { key: "eras", label: "Era Stories",
                sub: "Narrative chapters" },
              { key: "dashboard", label: "Dashboard",
                sub: "All data, one screen" },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => {
                  setTimelineMode(m.key);
                  if (m.key === "eras") setFocusEra(null);
                }}
                aria-current={timelineMode === m.key ? "page" : undefined}
                style={{
                  padding: "6px 16px", borderRadius: 6, border: "none",
                  fontSize: 12, cursor: "pointer", textAlign: "center",
                  fontWeight: timelineMode === m.key ? 600 : 400,
                  background: timelineMode === m.key ? "#fffffe" : "transparent",
                  color: timelineMode === m.key ? "#0f766e" : "#7c6f5e",
                  boxShadow: timelineMode === m.key
                    ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                }}
              >
                <div>{m.label}</div>
                <div style={{ fontSize: 9, fontWeight: 400,
                  color: timelineMode === m.key ? "#0f766e" : "#a8a49c",
                  marginTop: 1 }}>{m.sub}</div>
              </button>
            ))}
          </div>

          {/* Category filters (shared) */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600,
                           color: "#64615b", alignSelf: "center" }}>
              Category:
            </span>
            {["all","displacement","policy","development","cultural","economic"]
              .map(f => (
              <button key={f} onClick={() => setTlFilter(f)} style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 11,
                cursor: "pointer", minHeight: 28,
                fontWeight: tlFilter === f ? 600 : 400,
                border: tlFilter === f
                  ? "1.5px solid #0f766e" : "1.5px solid #d6d3cd",
                background: tlFilter === f ? "#f0fdfa" : "#fffffe",
                color: tlFilter === f ? "#0f766e" : "#64615b",
              }}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Active sub-view ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          {timelineMode === "eras" ? (
            <TimelineEras
              eras={ERAS}
              events={filteredEvents}
              opBars={opBars}
              clBars={clBars}
              cultureFilter={cultureFilter}
              setCultureFilter={setCultureFilter}
              actionFilter={actionFilter}
              setActionFilter={setActionFilter}
              hoveredItem={hoveredItem}
              setHoveredItem={setHoveredItem}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              onViewInDashboard={(era) => {
                setFocusEra(era);
                setTimelineMode("dashboard");
              }}
            />
          ) : (
            <TimelineDashboard
              eras={ERAS}
              events={filteredEvents}
              opBars={opBars}
              clBars={clBars}
              cultureFilter={cultureFilter}
              setCultureFilter={setCultureFilter}
              focusEra={focusEra}
              hoveredItem={hoveredItem}
              setHoveredItem={setHoveredItem}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
            />
          )}
        </div>

        {/* ── Shared detail panel (right sidebar) ── */}
        <div className="detail-panel" style={{
          flex: "0 1 380px", minWidth: 300,
          maxHeight: "calc(100vh - 100px)", overflowY: "auto",
          position: "sticky", top: 16,
        }}>
          {/* Render the same detail cards as current TimelineView:
              - Infrastructure event card (when hoveredItem is an event)
              - Business detail card (when hoveredItem is a business)
              - Empty state
              - Summary stats box
              Move the existing detail panel JSX here from current
              TimelineView, adapting to use hoveredItem/selectedItem. */}
        </div>
      </div>
    </section>
  );
}
```

### Step 3: Build TimelineEras.jsx (Era Stories)

This is the narrative chapter-based view. Each era is a self-contained
card with three parallel horizontal tracks.

#### Layout per era chapter:

```
┌─────────────────────────────────────────────────────────┐
│  ERA TITLE + SUBTITLE                                    │
│  Context paragraph (from ERAS definition)                │
│                                                          │
│  ── time axis: [era.years[0]] ──────── [era.years[1]] ──│
│                                                          │
│  POLICY TRACK (top)                                      │
│  Event cards positioned along the time axis.             │
│  Color-coded by category. Readable labels (no rotation). │
│  Dotted lines descend to closures in the business track. │
│                                                          │
│  BUSINESS TRACK (middle)                                 │
│  Gantt bars for businesses active during this era.       │
│  Wider bars (8px) than current (3.8px). Color by culture.│
│  ● at right end = still operating. ✕ = closed.           │
│  Bars sorted by culture group, then est. year.           │
│  Labels on the right side of each bar.                   │
│                                                          │
│  CONTEXT TRACK (bottom)                                  │
│  Narrow stacked area chart (80px) — demographic shares.  │
│  DVI sparkline overlay or annotation: "DVI: 22 → 48"    │
│                                                          │
│  ERA SUMMARY (auto-generated)                            │
│  "Between 1997 and 2015, the tracked areas lost N        │
│   businesses. Black population declined X%. Home values  │
│   rose Y%. DVI moved from Z to W."                       │
│                                                          │
│  [View this era in Dashboard →]                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Key implementation details:

**Time axis per era:** Each era has its own x-scale spanning only that
era's year range. Use a linear scale:
```javascript
const eraWidth = containerWidth - margins;
const xScale = (yr) => margins.left +
  ((yr - era.years[0]) / (era.years[1] - era.years[0])) * eraWidth;
```

This makes bars much wider and more readable — a 30-year era at 900px
gives ~30px per year instead of the current 48px crammed into a 4800px
scroll.

**Policy event cards** in the top track: Rendered as small cards (not
rotated text) positioned along the x-axis. If events are too close
together, stack them vertically to avoid overlap. Each card shows year
+ short label + category color dot.

**Policy-to-closure connections:** For each event, find businesses from
`clBars` that closed within 5 years after the event AND whose lifespan
overlaps this era. Draw a dashed line from the event card down to the
closure ✕ mark. These are ALWAYS VISIBLE — not hover-dependent.

```javascript
const DAM_REACH = 5;

function getImpactedClosures(event, clBars) {
  return clBars.filter(b => {
    const cy = closeYear(b);
    return cy && cy >= event.year && cy <= event.year + DAM_REACH;
  });
}
```

Show a count badge on each event: "3 closures within 5 years".

**Business bars:** Filter to businesses active during this era:
```javascript
const eraBiz = allBars.filter(b =>
  b.x0 < era.years[1] && (b.x1 || 2026) > era.years[0]
);
```

Bar height: 8px (vs current 3.8px). Gap: 2px. Culture strata gap: 10px.
Bars that extend beyond the era's range are clipped to the era boundaries
but show an arrow indicator (→ continues in next era, ← started in
previous era).

**Context track:** A small Recharts AreaChart (80px tall) showing the
aggregate demographic composition for the era's year range. Use the
same computation as the current aggregate demographics chart but filtered
to the era's years:

```javascript
const contextData = [era.years[0], ..., era.years[1]].map(yr => {
  const rows = DEMOGRAPHICS.filter(d => d.year === yr);
  const t = _.sumBy(rows, "total");
  return {
    year: yr,
    Black: _.sumBy(rows, "popBlack") / t,
    Hispanic: _.sumBy(rows, "popHispanic") / t,
    White: _.sumBy(rows, "popWhite") / t,
    // ...
  };
});
```

Add a DVI annotation: text showing "DVI: [start] → [end]" for a
representative high-displacement region (e.g., East Austin / Chestnut),
or the city-wide average DVI change.

**Era summary (auto-generated):**

```javascript
function generateEraSummary(era, opBars, clBars, events) {
  const eraClosures = clBars.filter(b => {
    const cy = closeYear(b);
    return cy && cy >= era.years[0] && cy < era.years[1];
  });
  const eraOpenings = [...opBars, ...clBars].filter(b =>
    b.est >= era.years[0] && b.est < era.years[1]
  );
  const eraEvents = events.filter(e =>
    e.year >= era.years[0] && e.year < era.years[1]
  );

  // Demographic change for high-DVI regions
  const startDemo = DEMOGRAPHICS.filter(d =>
    d.year === nearestYear(era.years[0]) && d.region_id === 84 /* Chestnut */
  )[0];
  const endDemo = DEMOGRAPHICS.filter(d =>
    d.year === nearestYear(era.years[1]) && d.region_id === 84
  )[0];

  const parts = [];
  if (eraClosures.length > 0)
    parts.push(`${eraClosures.length} tracked businesses closed`);
  if (eraOpenings.length > 0)
    parts.push(`${eraOpenings.length} opened`);
  if (eraEvents.length > 0)
    parts.push(`${eraEvents.length} policy/infrastructure events occurred`);
  // Add demographic change if available...

  return `Between ${era.years[0]} and ${era.years[1]}, ${parts.join(", ")}.`;
}
```

Make the summary more narrative — reference the dominant closure causes,
the cultural affiliations lost, and connect to specific events. Keep it
to 2–4 sentences.

**"View in Dashboard →" link** at the bottom of each era:
```jsx
<button
  onClick={() => onViewInDashboard(era)}
  style={{
    background: "none", border: "none", color: "#0f766e",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 4,
    marginTop: 12, padding: 0,
  }}
>
  View this era in Dashboard →
</button>
```

### Step 4: Build TimelineDashboard.jsx (Synchronized Tracks)

This is the data-dense single-screen view. All four tracks share one
compressed time axis with a synchronized vertical crosshair.

#### Non-linear time axis

Give more pixels to recent decades where more happened:

```javascript
// Piecewise linear scale: maps year → pixel position
const TIME_SEGMENTS = [
  { start: 1925, end: 1970, widthPct: 0.12 },  // compressed
  { start: 1970, end: 1997, widthPct: 0.18 },
  { start: 1997, end: 2010, widthPct: 0.28 },  // expanded — peak activity
  { start: 2010, end: 2026, widthPct: 0.42 },  // most expanded
];

function buildTimeScale(totalWidth) {
  let px = 0;
  const segments = TIME_SEGMENTS.map(seg => {
    const segWidth = seg.widthPct * totalWidth;
    const scale = (yr) => px + ((yr - seg.start) / (seg.end - seg.start)) * segWidth;
    const result = { ...seg, pxStart: px, pxEnd: px + segWidth, scale };
    px += segWidth;
    return result;
  });

  return (yr) => {
    const seg = segments.find(s => yr >= s.start && yr < s.end)
      || segments[segments.length - 1];
    return seg.scale(Math.min(yr, seg.end));
  };
}
```

If `focusEra` is set (user clicked "View in Dashboard" from Era Stories),
auto-highlight that era's year range with a subtle background band and
scroll/zoom to center it.

#### Track 1: Policy & Infrastructure (top, ~80px tall)

Events rendered as downward-pointing triangles (▼) with labels below.
No rotation. Colored by category via `catColor()`.

```jsx
{events.map(ev => {
  const px = timeScale(ev.year);
  return (
    <g key={ev.label}
       onMouseEnter={() => setHoveredItem(ev)}
       onMouseLeave={() => setHoveredItem(null)}
       onClick={() => setSelectedItem(ev)}
       style={{ cursor: "pointer" }}>
      <polygon
        points={`${px-5},10 ${px+5},10 ${px},20`}
        fill={catColor(ev.cat)}
        fillOpacity={hoveredItem === ev ? 1 : 0.7}
      />
      <text x={px} y={30} textAnchor="middle"
        style={{ fontSize: 7.5, fill: "#64615b", fontWeight: 500 }}>
        {ev.label.length > 20 ? ev.label.slice(0, 18) + "…" : ev.label}
      </text>
      <text x={px} y={40} textAnchor="middle"
        style={{ fontSize: 7, fill: "#a8a49c" }}>
        {ev.year}
      </text>
    </g>
  );
})}
```

When an event is hovered/selected, highlight the 5-year impact zone
in all tracks below with a semi-transparent vertical band.

#### Track 2: Business Lifespans (~200px tall)

Gantt bars, grouped by culture. Bar height: 6–8px. Labels on the right
side of each bar (truncated to ~15 chars). Green dot for operating,
red ✕ for closed. Filtered by cultureFilter.

Since this is compressed to fit one screen, limit to showing the most
significant businesses per culture group (sort by lifespan length,
show top N). Add a "Show all N businesses" toggle that expands the
track height.

#### Track 3: Demographics (stacked area, ~100px tall)

Recharts AreaChart showing city-wide aggregate racial composition over
time. Same computation as current TimelineView's aggregate chart.
The x-axis uses the non-linear time scale (pass custom tick positions).

For Recharts, the simplest approach is to render a standard AreaChart
with data points at the non-linear pixel positions. Or use a plain SVG
path with the timeScale function for precise alignment.

#### Track 4: DVI Heatstrip (~30px tall)

A continuous color strip showing DVI for a selected region (or city-wide
average) over time. Rendered as a series of narrow rectangles, each
colored by `getDviColor(dvi)`:

```jsx
{_.range(1990, 2024).map(yr => {
  const dvi = interpolateDvi(selectedRegionId || 84, yr);
  const px = timeScale(yr);
  const nextPx = timeScale(yr + 1);
  return (
    <rect key={yr}
      x={px} y={0} width={nextPx - px} height={30}
      fill={getDviColor(dvi)}
      fillOpacity={0.85}
    />
  );
})}
```

Add a dropdown above the heatstrip to select which region to show,
defaulting to "City-wide average" or "East Austin (Chestnut)".

#### Vertical crosshair (synchronized across all tracks)

The crosshair is the key interaction. Track mouse x-position relative
to the SVG/container, convert to a year using the inverse of timeScale,
then draw a vertical line across all four tracks:

```javascript
const [crosshairYear, setCrosshairYear] = useState(null);

function handleMouseMove(e) {
  const rect = containerRef.current.getBoundingClientRect();
  const px = e.clientX - rect.left;
  // Inverse of timeScale: pixel → year
  const yr = inverseTimeScale(px);
  setCrosshairYear(Math.round(yr));
}
```

Render as a vertical line spanning all tracks, with a year label at
the top:

```jsx
{crosshairYear && (
  <line
    x1={timeScale(crosshairYear)} y1={0}
    x2={timeScale(crosshairYear)} y2={totalHeight}
    stroke="#0f766e" strokeWidth={1} strokeOpacity={0.5}
    strokeDasharray="4 3" pointerEvents="none"
  />
)}
```

When the crosshair is active, the detail panel (in the parent
TimelineView) could show a "snapshot" of that year: how many businesses
active, which events occurred that year, demographic breakdown.

#### Non-linear axis labels

Show year labels at meaningful points along the non-linear axis.
Use major ticks at decade boundaries and minor ticks at 5-year
intervals. The non-linear spacing means labels in the 1925–1970
range are close together (compressed) while 2010–2026 labels are
spread out:

```jsx
{[1930, 1940, 1950, 1960, 1970, 1980, 1990, 1997, 2000, 2005,
  2010, 2015, 2020, 2025].map(yr => (
  <text key={yr}
    x={timeScale(yr)} y={totalHeight + 14}
    textAnchor="middle"
    style={{ fontSize: yr % 10 === 0 ? 10 : 8,
             fontWeight: yr % 10 === 0 ? 600 : 400,
             fill: "#a8a49c" }}>
    {yr}
  </text>
))}
```

Add a subtle note below the axis: "Time axis is non-linear — recent
decades are expanded to show more detail."

### Step 5: Wire "View in Dashboard" navigation

When the user clicks "View this era in Dashboard →" in the Era Stories
view, the parent TimelineView:

1. Sets `timelineMode` to "dashboard"
2. Sets `focusEra` to the clicked era object

The Dashboard component receives `focusEra` and:
- Draws a semi-transparent highlight band over that era's year range
- Optionally adjusts the non-linear scale to give that era more pixels
  (or just highlights it with the default scale)
- Scrolls/pans if the dashboard has any scrollability

### Step 6: Shared culture legend and action filters

Both sub-views use the same culture legend (clickable to filter) and
action filter (All / Operating / Closed). These are rendered in the
parent TimelineView.jsx above the sub-view, OR passed as props and
rendered inside each sub-view.

For the culture legend, reuse the current implementation:
```jsx
<div style={{ display: "flex", gap: 10, flexWrap: "wrap",
              alignItems: "center", marginBottom: 10 }}>
  {legend.map(({ culture, color }) => (
    <button
      key={color}
      onClick={() => setCultureFilter(
        cultureFilter === culture ? "all" : culture
      )}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        cursor: "pointer", background: "none", border: "none",
        opacity: cultureFilter === "all"
          || cultureFilter === culture ? 1 : 0.35,
      }}
    >
      <span style={{ width: 10, height: 4, borderRadius: 2,
                     background: color }} />
      <span style={{ fontSize: 9.5, color: "#44403c",
                     fontWeight: 500 }}>{cultureLabel(culture)}</span>
    </button>
  ))}
</div>
```

### Step 7: Remove the DVI heatmap table

The current TimelineView has a "DVI Heatmap by Region & Period" table
at the bottom. This is better served by:
- The DVI heatstrip in the Dashboard view (for a single region)
- The Triage view (for all-region DVI comparison)
- The Map view (for spatial DVI visualization)

Remove the table from the new TimelineView. If users miss it, it can
be added back as a collapsible section, but it's redundant with the
other views.

### Step 8: Validate

1. Era Stories mode:
   - All four eras render as separate cards
   - Each era shows policy events, business bars, and demographic context
     on a shared time axis
   - Policy-to-closure connection lines are visible by default
   - Era summary text is generated and displays business counts,
     demographic changes
   - "View in Dashboard →" switches to Dashboard mode

2. Dashboard mode:
   - All four tracks render on one screen (no horizontal scrolling)
   - Non-linear time axis gives more space to 2000–2026
   - Vertical crosshair follows mouse across all tracks
   - Policy event hover highlights the 5-year impact zone in all tracks
   - Culture filter and category filter work across both modes
   - DVI heatstrip responds to region selector

3. Mode toggle:
   - Switching between modes preserves filter state
   - The "View in Dashboard" navigation from Era Stories sets focusEra
   - Detail panel (right sidebar) works in both modes

4. General:
   - No horizontal scrolling in either mode
   - Business bars are readable (≥6px height, labels visible)
   - Policy event labels are horizontal (no rotation)
   - Culture color coding is consistent across both modes

### Implementation order

1. **Extract shared constants** — CULTURE_COLORS, closeYear(), ERAS —
   into TimelineView.jsx or a separate file
2. **Build TimelineEras.jsx** — start with a single era to get the
   three-track layout working. Then expand to all four eras.
3. **Build TimelineDashboard.jsx** — start with the non-linear time
   axis and one track (businesses). Add tracks one at a time.
4. **Rewrite TimelineView.jsx** — thin wrapper with mode toggle,
   shared filters, and detail panel
5. **Wire crosshair** in Dashboard
6. **Wire "View in Dashboard"** navigation
7. **Polish** — era summaries, connection lines, hover interactions

### Constraints
- Desktop-only — minimum 900px viewport width assumed
- No horizontal scrolling in either mode
- Both modes use the same underlying data (LEGACY_OPERATING,
  LEGACY_CLOSED, TIMELINE_INFRA, DEMOGRAPHICS)
- The detail panel (right sidebar) is shared and works in both modes
- Business bars must be ≥6px tall with visible culture colors
- Policy event labels must be horizontal and readable (no rotation)
- All SVG rendering should use the same Recharts + raw SVG approach
  as the rest of the app (no new charting libraries)
- Policy-to-closure connections are always visible in Era Stories
  (not hover-dependent)
