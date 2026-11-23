import { useState, useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { STAGE_CLASSES, STAGE_NONE, STAGE_UNSCORED, surveySpan } from "../utils/stages";
import {
  LENSES, LENS_BY_KEY, LENS_REGION, PA_LISTING_COUNTS, PA_LISTING_YEARS, EARLIER_SURVEY, LATEST_SURVEY, PATH_YEARS,
  lensRows, groupCounts, lensSummary, carriedCount,
} from "../utils/lenses";

// Years and surveys named in labels come from the generated data, so a newer
// survey release changes them without editing this file.
const LATEST_YEAR = LENS_REGION.to;
const listOf = (items) => `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const PATH_YEARS_TEXT = listOf(PATH_YEARS);                    // "2010, 2015, 2020 and 2024"
const PATH_SURVEYS_TEXT = listOf(PATH_YEARS.map(surveySpan));  // `2006–2010, ${EARLIER_SURVEY}, 2016–2020 and 2020–2024`

/**
 * Triage (presenter mode only): three questions asked of the map's
 * displacement stages. Each lens sorts every census tract into a group by a
 * stated rule and shows the measured figures behind it. There is no
 * composite score. The rules and formulas are printed at the foot of the
 * view and in DATA_METHODOLOGY.md, section 6.
 */

// Dots for places with no stage: darker than the map's near-clear fill so
// they stay visible on white, still clearly recessive.
const NONE_DOT = "#b7b2a9";
const INK = "#1a1a1a";
const dotColor = (cls) => (cls === "none" || cls === "unscored" ? NONE_DOT : STAGE_CLASSES.find((c) => c.key === cls)?.fill || NONE_DOT);

// ── Number formats ──
const DASH = "—";
const signed = (v, digits = 2) => (v == null ? DASH : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`);
const pct = (v, digits = 0) => (v == null ? DASH : `${v.toFixed(digits)}%`);
const money = (v) => (v == null ? DASH : v >= 10000 ? `$${Math.round(v / 1000).toLocaleString()}k` : `$${Math.round(v).toLocaleString()}`);
const count = (v) => (v == null ? DASH : String(v));

// A fixed, small vertical offset per tract so dots that share a whole-number
// count do not sit exactly on top of each other.
const jitter = (id) => (((id * 37) % 21) - 10) / 10 * 0.22;

// ── What each lens plots ──
const PLOTS = {
  trajectory: {
    title: `Change since 2000 against the shift since the ${EARLIER_SURVEY} survey`,
    x: { label: "Change since 2000 (index)", get: (r) => r.dIndex, fmt: (v) => signed(v) },
    y: { label: `Shift since ${EARLIER_SURVEY} (index)`, get: (r) => r.rIndex, fmt: (v) => signed(v) },
    caption: "Each dot is a census tract, colored by its stage. Dots above the horizontal line shifted more than the region between the two latest surveys; dots right of the vertical line changed more than the region since 2000. Both lines are at 0.5, the line the stage tests use.",
  },
  equity: {
    title: "People of color as a share of residents, 2000 against today",
    x: { label: "People of color in 2000 (%)", get: (r) => r.pocThen, fmt: (v) => pct(v, 1) },
    y: { label: `People of color, ${LATEST_SURVEY} (%)`, get: (r) => r.pocNow, fmt: (v) => pct(v, 1) },
    caption: "Each dot is a census tract, colored by its stage. A filled dot has a Preservation Austin listing nearby; a ring has none. Dots below the diagonal have a smaller share of residents of color than in 2000.",
  },
  matrix: {
    title: "Vulnerability measures met against the rise in home values",
    x: { label: "Rise in value since 2000, ranked among these tracts (0–100)", get: (r) => r.risePct, fmt: (v) => (v == null ? DASH : v.toFixed(0)) },
    y: { label: "Vulnerability measures past the line (of 5)", get: (r) => r.vCount, fmt: (v) => count(v) },
    caption: "Each dot is a census tract, colored by its stage. Above the horizontal line a tract meets 3 or more of the 5 measures and counts as vulnerable. Right of the vertical line its rise in value is in the top two fifths. Dots are nudged up or down slightly so they do not hide each other.",
  },
};

// ── Table columns ──
const stageSort = (r) => ["unscored", "none", "vulnerable", "early", "dynamic", "late", "loss"].indexOf(r.cls);
const COLUMNS = {
  trajectory: [
    { key: "rIndex", label: `Shift since ${EARLIER_SURVEY}`, hint: `Average of four z-scores for change between the ${EARLIER_SURVEY} and ${LATEST_SURVEY} surveys. 0.5 or more, with two measures past the line, counts as a shift. ≈ marks ${EARLIER_SURVEY} figures estimated from earlier tract boundaries.`, value: (r) => r.rIndex, text: (r) => `${signed(r.rIndex)}${r.rIndex != null && r.carried ? " ≈" : ""}`, flag: (r) => r.recent === true },
    { key: "dIndex", label: "Change since 2000", hint: `Average of the same four z-scores for change between the 2000 Census and the ${LATEST_SURVEY} survey.`, value: (r) => r.dIndex, text: (r) => signed(r.dIndex), flag: (r) => r.changed === true },
    { key: "recentRise", label: `Value rise since ${EARLIER_SURVEY}`, hint: "Percent change in median home value (median rent where few homes are owned) between the two surveys. Bold when in the top two fifths.", value: (r) => r.recentRise, text: (r) => (r.recentRise == null ? DASH : `${r.recentRise > 0 ? "+" : ""}${r.recentRise}%`), flag: (r) => r.recentHigh === true },
    { key: "bhDelta", label: "Black + Hispanic share since 2000", hint: `Change in the Black and Hispanic share of residents, in percentage points, from 2000 (2010 where 2000 is missing) to ${LATEST_YEAR}.`, value: (r) => r.bhDelta, text: (r) => (r.bhDelta == null ? DASH : `${signed(r.bhDelta, 1)} pts`) },
  ],
  equity: [
    { key: "vCount", label: "Measures past the line", hint: "How many of the five vulnerability measures are well above the region. Three or more counts as vulnerable.", value: (r) => r.vCount, text: (r) => (r.vCount == null ? DASH : `${r.vCount} of 5`), flag: (r) => r.vulnerableNow === true },
    { key: "pocThen", label: "People of color, 2000", hint: "Residents who are not white non-Hispanic, as a share of all residents, 2000 Census.", value: (r) => r.pocThen, text: (r) => pct(r.pocThen) },
    { key: "pocNow", label: "People of color, now", hint: `The same share in the ${LATEST_SURVEY} survey.`, value: (r) => r.pocNow, text: (r) => pct(r.pocNow) },
    { key: "bhDelta", label: "Black + Hispanic share since 2000", hint: `Change in the Black and Hispanic share of residents, in percentage points, from 2000 (2010 where 2000 is missing) to ${LATEST_YEAR}.`, value: (r) => r.bhDelta, text: (r) => (r.bhDelta == null ? DASH : `${signed(r.bhDelta, 1)} pts`) },
    { key: "paNear", label: "PA listings nearby", hint: "Preservation Austin grants, awards, Legacy Business Month listings and advocacy within about 1.3 km of the tract's center. Citywide listings are not counted.", value: (r) => r.paNear, text: (r) => count(r.paNear), flag: (r) => r.paNear > 0 },
    { key: "biz", label: "Tracked businesses", hint: "Legacy businesses this site tracks in the tract: open / closed. Most tracts have none tracked, which reflects where surveys were done.", value: (r) => r.bizOpen + r.bizClosed, text: (r) => (r.bizOpen + r.bizClosed ? `${r.bizOpen} open / ${r.bizClosed} closed` : DASH) },
  ],
  matrix: [
    { key: "vCount", label: "Measures past the line", hint: "How many of the five vulnerability measures are well above the region. Three or more counts as vulnerable.", value: (r) => r.vCount, text: (r) => (r.vCount == null ? DASH : `${r.vCount} of 5`), flag: (r) => r.vulnerableNow === true },
    { key: "valueNow", label: "Value now", hint: `Median home value in the ${LATEST_SURVEY} survey. Tracts with few owner homes show median monthly rent instead.`, value: (r) => r.housing?.now ?? null, text: (r) => (r.housing ? `${money(r.housing.now)}${r.housing.isRent ? " rent" : ""}` : DASH) },
    { key: "rise", label: "Rise since 2000", hint: "Percent change in that value since the 2000 Census, in dollars of each year.", value: (r) => r.housing?.rise ?? null, text: (r) => (r.housing ? `+${Math.round(r.housing.rise).toLocaleString()}%` : DASH), flag: (r) => r.riseHigh === true },
    { key: "risePct", label: "Rank of the rise", hint: "Where the rise sits among the scored tracts on this map, 0 (smallest) to 100 (largest). Above 60 is the top two fifths.", value: (r) => r.risePct, text: (r) => (r.risePct == null ? DASH : r.risePct.toFixed(0)) },
    { key: "pattern", label: "Market pattern", hint: "The housing pattern the stage test found: accelerating, appreciated, adjacent, or none.", value: (r) => r.housing?.name || "", text: (r) => r.housing?.name || DASH, align: "left" },
    { key: "biz", label: "Tracked businesses", hint: "Legacy businesses this site tracks in the tract: open / closed. Most tracts have none tracked, which reflects where surveys were done.", value: (r) => r.bizOpen + r.bizClosed, text: (r) => (r.bizOpen + r.bizClosed ? `${r.bizOpen} open / ${r.bizClosed} closed` : DASH) },
  ],
};
// Within a group, the order that answers the lens's question.
const TIE_BREAK = {
  trajectory: (a, b) => (b.rIndex ?? -99) - (a.rIndex ?? -99),
  equity: (a, b) => (b.vCount ?? -1) - (a.vCount ?? -1) || (b.pocNow ?? -1) - (a.pocNow ?? -1),
  matrix: (a, b) => (b.risePct ?? -1) - (a.risePct ?? -1),
};

// ── How each lens is worked out: formula, then the data behind each term ──
const regionLine = (k, unit) => `${signed(LENS_REGION.d[k][0], 1)}${unit}, line ${signed(LENS_REGION.d[k][1], 1)}${unit}`;
const FORMULAS = {
  trajectory: [
    {
      figure: `Shift since ${EARLIER_SURVEY} (index)`,
      source: "This site's own. The four measures and the z-score are the UT study's test for change since 2000, used here on a later pair of surveys.",
      formula: "index = (z_owners + z_white + z_bachelor's + z_income) ÷ 4, where z = (change in the tract − change in the region) ÷ spread",
      data: [
        ["Change", `${LATEST_SURVEY} survey minus ${EARLIER_SURVEY} survey, on today's tract boundaries. Shares in percentage points; income in percent.`],
        ["Owners", `Owner-occupied ÷ occupied homes, ACS table B25003. Region ${regionLine("owner", " pts")}.`],
        ["White", `White non-Hispanic ÷ all residents, ACS B03002. Region ${regionLine("white", " pts")}.`],
        ["Bachelor's", `Adults 25+ with a four-year degree ÷ adults 25+, ACS B15002. Region ${regionLine("ba", " pts")}.`],
        ["Income", `Median family income, ACS B19113. Region ${regionLine("mfi", "%")}.`],
        ["Region", "Bastrop, Caldwell, Hays, Travis and Williamson counties together."],
        ["Spread", "Standard deviation of the tracts' changes around the region's change, weighted by each tract's homes, residents, adults or families."],
      ],
    },
    {
      figure: "Shifted, yes or no",
      source: "The rule is published (Uprooted, Appendix 3, Demographic Change, step 8). Applying it to these two surveys is this site's own. Comparing surveys that do not overlap follows Census Bureau guidance.",
      formula: "yes when at least 2 of the 4 z-scores are above 0.5 and the index is 0.5 or more",
      data: [["Rule", "The same rule the stage test uses for demographic change since 2000, applied to the two latest surveys that share no interviews."]],
    },
    {
      figure: "Change since 2000 (index)",
      source: "Published: the average z-score of Uprooted, Appendix 3, Demographic Change, step 8.",
      formula: `the same index, with change measured from the 2000 Census to the ${LATEST_SURVEY} survey`,
      data: [["2000 figures", "Census 2000 tables H004 (owners), P004 (white non-Hispanic), SF3 P037 (bachelor's) and P077 (median family income), carried onto today's tract boundaries."]],
    },
    {
      figure: `Value rise since ${EARLIER_SURVEY}`,
      source: "This site's own, with the published \"top two fifths\" line.",
      formula: "rise = (value now − value then) ÷ value then × 100",
      data: [["Value", `Median home value, ACS B25077; median gross rent, B25064, where fewer than 50 homes are owned. "Fast" is above the 60th percentile of scored tracts: +${LENS_REGION.recentRiseLine.value}% for home values, +${LENS_REGION.recentRiseLine.rent}% for rents.`]],
    },
    {
      figure: "Stage in each survey year",
      source: "The stage method is published (Bates 2013; Uprooted 2018). A reading for each survey year is this site's own.",
      formula: `the map's stage for ${PATH_YEARS_TEXT}`,
      data: [["Stage", `The three-part test of DATA_METHODOLOGY.md §3, run on the ${PATH_SURVEYS_TEXT} surveys.`]],
    },
  ],
  equity: [
    {
      figure: "People of color (share)",
      source: "Published measure: one of the vulnerability factors of Bates (2013) and the UT study.",
      formula: "share = (all residents − white non-Hispanic residents) ÷ all residents × 100",
      data: [
        ["2000", "Census 2000 tables P001 and P004, carried onto today's tract boundaries."],
        ["Now", `ACS ${LATEST_SURVEY} table B03002.`],
      ],
    },
    {
      figure: "Measures past the line",
      source: "Published: Uprooted, Appendix 3, Vulnerability, steps 3 and 4.",
      formula: "count of the five vulnerability shares whose z is above 0.5, where z = (share in the tract − share in the region) ÷ spread",
      data: [["Shares", `People of color (B03002), renters (B25003), households under 80% of the region's median family income (B19001, B19113), children in poverty (B17001), adults without a bachelor's degree (B15002). ACS ${LATEST_SURVEY}.`]],
    },
    {
      figure: "Black + Hispanic share (change)",
      source: "This site's own: a plain difference between two census shares.",
      formula: `change = share in ${LATEST_YEAR} − share in 2000, in percentage points`,
      data: [["Shares", "Black non-Hispanic plus Hispanic residents ÷ all residents, from the site's census file (data/phase1_output). 2010 is used where a tract has no 2000 figure."]],
    },
    {
      figure: "PA listings nearby",
      source: "This site's own. The 1.3 km is not from research; the methodology (section 12.4) shows how the counts move with it.",
      formula: "count of listings where distance(listing, tract center) < 0.012 degrees (about 1.3 km)",
      data: [
        ["Listings", `Preservation Austin's published grants (${PA_LISTING_YEARS.grant}), merit awards (${PA_LISTING_YEARS.merit_award}), Legacy Business Month listings (${PA_LISTING_YEARS.legacy_business}) and advocacy milestones, as compiled in data/preservationAustin.js. Listings filed as citywide have no place and are not counted.`],
        ["Tract center", "The center point of the tract's shape (data/regionIndex.js)."],
      ],
    },
  ],
  matrix: [
    {
      figure: "Measures past the line",
      source: "Published: Uprooted, Appendix 3, Vulnerability, steps 3 and 4.",
      formula: "count of the five vulnerability shares whose z is above 0.5; 3 or more = vulnerable",
      data: [["Shares", `People of color (B03002), renters (B25003), households under 80% of the region's median family income (B19001, B19113), children in poverty (B17001), adults without a bachelor's degree (B15002). ACS ${LATEST_SURVEY}; the 2000 reading uses Census 2000 tables P004, H004 and SF3 P052, P087, P037.`]],
    },
    {
      figure: "Rise since 2000",
      source: "Published: Uprooted, Appendix 3, Housing Market Change, step 5.",
      formula: "rise = (value now − value in 2000) ÷ value in 2000 × 100",
      data: [["Value", `Median home value: Census 2000 SF3 table H085 and ACS ${LATEST_SURVEY} table B25077. Median gross rent (H063, B25064) where fewer than 50 homes are owned in either year. Dollars of each year.`]],
    },
    {
      figure: "Rank of the rise",
      source: "This site's own way of drawing the published \"top two fifths\" line.",
      formula: "rank = (number of scored tracts with a smaller rise) ÷ (scored tracts − 1) × 100; above 60 = rising fast",
      data: [["Scored tracts", `The tracts on this map that are scored in the ${LATEST_SURVEY} survey, ranked separately for home values and for rents.`]],
    },
  ],
};

function StageSwatch({ cls, size = 11 }) {
  const dashed = cls?.key === "unscored";
  return (
    <span
      aria-hidden="true"
      className="triage-swatch"
      style={{ width: size, height: size, background: cls ? cls.fill : "transparent", borderStyle: dashed || !cls ? "dashed" : "solid" }}
    />
  );
}

function StagePath({ path }) {
  const text = path.map((p) => `${p.year} ${p.cls ? p.cls.label : "no reading"}`).join(", ");
  return (
    <span className="triage-path" role="img" aria-label={text} title={text}>
      {path.map((p) => <StageSwatch key={p.year} cls={p.cls} size={12} />)}
    </span>
  );
}

/** Hover card for a dot. Recharts adds `active` and `payload`. */
function DotTooltip({ active, payload, plot, lensKey, groups }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload.row;
  return (
    <div className="triage-tooltip">
      <div className="triage-tooltip-name">{r.name}{r.tract ? ` · tract ${r.tract}` : ""}</div>
      <div className="triage-tooltip-stage"><StageSwatch cls={r.stage.cls} /> {r.stage.cls.label}</div>
      <div>{plot.x.label}: <strong>{plot.x.fmt(plot.x.get(r))}</strong></div>
      <div>{plot.y.label}: <strong>{plot.y.fmt(plot.y.get(r))}</strong></div>
      {lensKey === "equity" && <div>PA listings nearby: <strong>{r.paNear}</strong></div>}
      <div className="triage-tooltip-group">{groups[r.groups[lensKey]].label}</div>
    </div>
  );
}

export default function TriageView({ onLocateOnMap, lens: lensProp, setLens: setLensProp }) {
  // Lens is controlled by the app (URL-synced) when provided; local otherwise.
  const [localLens, setLocalLens] = useState("equity");
  const lensKey = LENS_BY_KEY[lensProp ?? localLens] ? (lensProp ?? localLens) : "equity";
  const setLens = setLensProp ?? setLocalLens;
  const [sort, setSort] = useState({ col: "group", dir: "asc" });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  const lens = LENS_BY_KEY[lensKey];
  const rows = useMemo(() => lensRows(), []);
  const counts = useMemo(() => groupCounts(lensKey, rows), [lensKey, rows]);
  const summary = useMemo(() => lensSummary(lensKey, rows), [lensKey, rows]);
  const groupOrder = useMemo(() => Object.fromEntries(lens.groups.map((g, i) => [g.key, i])), [lens]);
  const groupByKey = useMemo(() => Object.fromEntries(lens.groups.map((g) => [g.key, g])), [lens]);
  const plot = PLOTS[lensKey];
  const columns = COLUMNS[lensKey];
  const selected = selectedId != null ? rows.find((r) => r.regionId === selectedId) : null;

  const changeLens = (key) => {
    setLens(key);
    setFilterGroup("all");
    setSort({ col: "group", dir: "asc" });
    setSelectedId(null);
  };

  // ── Scatter points: only tracts with both figures; "no stage" drawn first ──
  const { points, unplotted } = useMemo(() => {
    const pts = [];
    let missing = 0;
    for (const r of rows) {
      const x = plot.x.get(r);
      const y = plot.y.get(r);
      if (x == null || y == null) { if (r.scored) missing++; continue; }
      pts.push({ x, y: lensKey === "matrix" ? y + jitter(r.regionId) : y, row: r });
    }
    pts.sort((a, b) => stageSort(a.row) - stageSort(b.row));
    return { points: pts, unplotted: missing };
  }, [rows, plot, lensKey]);

  // Axis ranges. The two index axes run over whole numbers that cover the data.
  const axes = useMemo(() => {
    const whole = (vals) => {
      const lo = Math.floor(Math.min(...vals, 0));
      const hi = Math.ceil(Math.max(...vals, 1));
      return { domain: [lo, hi], ticks: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) };
    };
    const share = { domain: [0, 100], ticks: [0, 20, 40, 60, 80, 100] };
    if (lensKey === "trajectory") return { x: whole(points.map((p) => p.x)), y: whole(points.map((p) => p.y)) };
    if (lensKey === "matrix") return { x: share, y: { domain: [-0.5, 5.5], ticks: [0, 1, 2, 3, 4, 5] } };
    return { x: share, y: share };
  }, [points, lensKey]);

  // ── Table rows ──
  const tableRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = rows.filter((r) =>
      (filterGroup === "all" || r.groups[lensKey] === filterGroup) &&
      (!q || r.name.toLowerCase().includes(q) || (r.tract || "").toLowerCase().includes(q)));
    const dir = sort.dir === "asc" ? 1 : -1;
    const col = columns.find((c) => c.key === sort.col);
    const byGroup = (a, b) => groupOrder[a.groups[lensKey]] - groupOrder[b.groups[lensKey]] || TIE_BREAK[lensKey](a, b);
    list.sort((a, b) => {
      if (sort.col === "group") return dir * (groupOrder[a.groups[lensKey]] - groupOrder[b.groups[lensKey]]) || TIE_BREAK[lensKey](a, b);
      if (sort.col === "name") return dir * a.name.localeCompare(b.name) || (a.tract || "").localeCompare(b.tract || "", undefined, { numeric: true });
      if (sort.col === "stage") return dir * (stageSort(a) - stageSort(b)) || byGroup(a, b);
      const va = col?.value(a);
      const vb = col?.value(b);
      // Places without the figure stay at the bottom in either direction.
      if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
      if (vb == null || vb === "") return -1;
      return dir * (typeof va === "string" ? va.localeCompare(vb) : va - vb) || byGroup(a, b);
    });
    return list;
  }, [rows, filterGroup, searchTerm, sort, columns, lensKey, groupOrder]);

  const toggleSort = (col) => setSort((s) => (s.col === col
    ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
    : { col, dir: col === "group" || col === "name" || col === "pattern" ? "asc" : "desc" }));
  const ariaSort = (col) => (sort.col !== col ? "none" : sort.dir === "asc" ? "ascending" : "descending");
  const sortMark = (col) => (sort.col !== col ? "" : sort.dir === "asc" ? " ↑" : " ↓");

  // A group filter lights that group; with no filter, a selected place stands alone.
  const isDimmed = (r) => {
    if (r.regionId === selectedId) return false;
    return filterGroup !== "all" ? r.groups[lensKey] !== filterGroup : selectedId != null;
  };

  const renderDot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const r = payload.row;
    const color = dotColor(r.cls);
    const dim = isDimmed(r);
    const sel = r.regionId === selectedId;
    const hollow = lensKey === "equity" && r.paNear === 0;
    const quiet = r.cls === "none";
    return (
      <circle
        cx={cx} cy={cy} r={sel ? 7.5 : quiet ? 4 : 5.5}
        fill={hollow ? "#fffffe" : color}
        fillOpacity={dim ? 0.18 : hollow ? 0.9 : quiet ? 0.75 : 0.95}
        stroke={sel ? INK : hollow ? color : "#fffffe"}
        strokeOpacity={dim && !sel ? 0.3 : 1}
        strokeWidth={sel ? 2.5 : hollow ? 2 : 1}
        style={{ cursor: "pointer" }}
      />
    );
  };

  const carried = carriedCount(rows);
  const activeGroup = filterGroup !== "all" ? groupByKey[filterGroup] : null;
  const selectedGroup = selected ? groupByKey[selected.groups[lensKey]] : null;

  return (
    <section aria-label="Triage view" className="triage" data-view="triage-lenses-v2">
      <header className="triage-head">
        <h2>Triage: three questions to ask of the map</h2>
        <p>
          Each lens sorts the {rows.length} census tracts into groups by a stated rule, using the same census
          tests as the map's stages. Colors mean what they mean on the map. There is no composite score.
        </p>
        <p className="triage-caveat">
          A screening aid for committee discussion. It does not rank neighborhoods and is not a finding about any of them.
        </p>
      </header>

      {/* Lens toggle */}
      <div className="triage-lenses" role="group" aria-label="Choose a lens">
        {LENSES.map((l) => (
          <button key={l.key} type="button" onClick={() => changeLens(l.key)} aria-pressed={lensKey === l.key} className="triage-lens">
            <span className="triage-lens-name">{l.label}</span>
            <span className="triage-lens-question">{l.question}</span>
          </button>
        ))}
      </div>
      <p className="triage-description">{lens.description}</p>

      {/* What the lens finds: counts first, the scatter and table are its evidence */}
      <div className="triage-summary">
        <h3>What this lens shows</h3>
        <ul>
          {summary.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </div>

      {lensKey === "trajectory" && (
        <p className="triage-note">
          Both surveys are samples, so a single tract's shift can be noise; read the groups as a list to look into, not a
          forecast. {carried} of the {rows.length} tracts had different boundaries in 2010; their {EARLIER_SURVEY} figures are
          estimates carried from the earlier tracts and are marked ≈.
        </p>
      )}
      {lensKey === "equity" && (
        <p className="triage-note">
          A listing is what Preservation Austin has published, not everything it has done. Of {PA_LISTING_COUNTS.all} listings,{" "}
          {PA_LISTING_COUNTS.all - PA_LISTING_COUNTS.placed} are citywide and not counted, and {PA_LISTING_COUNTS.areaOnly} are placed at the
          center of a neighborhood or area, not at a street address. "No listing nearby" describes the record, not the
          organization's intent.
        </p>
      )}
      {lensKey === "matrix" && (
        <p className="triage-note">
          The questions shown for each group are prompts written for this tool. They are not Preservation Austin programs
          and are not recommendations from the UT study.
        </p>
      )}

      {/* Groups: counts, and a filter */}
      <div className="triage-groups" role="group" aria-label="Filter by group">
        <button type="button" className="triage-group" aria-pressed={filterGroup === "all"} onClick={() => setFilterGroup("all")}>
          All <span className="triage-group-count">{rows.length}</span>
        </button>
        {lens.groups.map((g) => (
          <button
            key={g.key} type="button" className="triage-group" title={g.rule}
            aria-pressed={filterGroup === g.key}
            onClick={() => setFilterGroup((cur) => (cur === g.key ? "all" : g.key))}
          >
            {g.label} <span className="triage-group-count">{counts[g.key]}</span>
          </button>
        ))}
      </div>
      {activeGroup && (
        <div className="triage-rule">
          <p><strong>Rule:</strong> {activeGroup.rule}</p>
          {activeGroup.prompt && <p><strong>A question this raises:</strong> {activeGroup.prompt}</p>}
        </div>
      )}

      <div className="triage-evidence">
        {/* Scatter */}
        <div className="triage-card">
          <h3>{plot.title}</h3>
          <div className="triage-legend" aria-hidden="true">
            {STAGE_CLASSES.map((c) => (
              <span key={c.key}><span className="triage-dot" style={{ background: c.fill }} /> {c.label}</span>
            ))}
            <span><span className="triage-dot" style={{ background: NONE_DOT }} /> {STAGE_NONE.label}</span>
            {lensKey === "equity" && (
              <span><span className="triage-dot triage-dot-ring" /> no PA listing nearby</span>
            )}
          </div>
          <div style={{ width: "100%", height: 360 }} role="img" aria-label={`${plot.title}. ${points.length} census tracts plotted. The table that follows lists the same figures.`}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 28, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ebe8e2" />
                <XAxis
                  type="number" dataKey="x" tick={{ fontSize: 12, fill: "#6b675f" }} tickLine={false}
                  domain={axes.x.domain} ticks={axes.x.ticks}
                  label={{ value: plot.x.label, position: "insideBottom", offset: -16, fontSize: 12, fill: "#6b675f" }}
                />
                <YAxis
                  type="number" dataKey="y" tick={{ fontSize: 12, fill: "#6b675f" }} tickLine={false} axisLine={false}
                  domain={axes.y.domain} ticks={axes.y.ticks}
                  label={{ value: plot.y.label, angle: -90, position: "insideLeft", offset: 4, fontSize: 12, fill: "#6b675f", style: { textAnchor: "middle" } }}
                />
                {lensKey === "trajectory" && <ReferenceLine x={0.5} stroke="#8f8a81" strokeDasharray="4 4" label={{ value: "line: 0.5", position: "insideTopRight", fontSize: 11, fill: "#6b675f" }} />}
                {lensKey === "trajectory" && <ReferenceLine y={0.5} stroke="#8f8a81" strokeDasharray="4 4" label={{ value: "line: 0.5", position: "insideTopRight", fontSize: 11, fill: "#6b675f" }} />}
                {lensKey === "equity" && <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#8f8a81" strokeDasharray="4 4" />}
                {lensKey === "matrix" && <ReferenceLine x={60} stroke="#8f8a81" strokeDasharray="4 4" label={{ value: "top two fifths", position: "insideTopLeft", fontSize: 11, fill: "#6b675f" }} />}
                {lensKey === "matrix" && <ReferenceLine y={2.5} stroke="#8f8a81" strokeDasharray="4 4" label={{ value: "vulnerable: 3 or more", position: "insideBottomLeft", fontSize: 11, fill: "#6b675f" }} />}
                <Tooltip content={<DotTooltip plot={plot} lensKey={lensKey} groups={groupByKey} />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter
                  data={points} shape={renderDot} isAnimationActive={false}
                  onClick={(p) => { const id = p?.payload?.row?.regionId ?? p?.row?.regionId; if (id != null) setSelectedId((cur) => (cur === id ? null : id)); }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="triage-caption">
            {plot.caption}
            {unplotted > 0 && ` ${unplotted} scored ${unplotted === 1 ? "tract is" : "tracts are"} not plotted because one of the two figures could not be measured; ${unplotted === 1 ? "it is" : "they are"} in the table.`}
          </p>
          {selected && (
            <div className="triage-selected">
              <div>
                <strong>{selected.name}</strong>{selected.tract ? ` · tract ${selected.tract}` : ""}
                <div className="triage-selected-line">
                  <StageSwatch cls={selected.stage.cls} /> {selected.stage.cls.label}
                  {selected.scored && selected.stage.typeName !== selected.stage.cls.label ? ` · ${selected.stage.typeName}` : ""}
                  {" · "}{selectedGroup.label}
                </div>
                {selectedGroup.prompt && <div className="triage-selected-prompt">{selectedGroup.prompt}</div>}
              </div>
              {onLocateOnMap && (
                <button type="button" className="triage-locate" onClick={() => onLocateOnMap(selected.regionId)}>
                  Show on the map
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="triage-card">
          <div className="triage-table-head">
            <h3>{filterGroup === "all" ? "All census tracts" : activeGroup.label}</h3>
            <input
              type="search" placeholder="Find a place or tract number" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} aria-label="Find a place or tract number"
            />
            <span className="triage-showing" role="status">Showing {tableRows.length} of {rows.length}</span>
          </div>
          <div className="triage-table-wrap">
            <table className="triage-table">
              <thead>
                <tr>
                  <th scope="col" aria-sort={ariaSort("group")} className="is-left">
                    <button type="button" onClick={() => toggleSort("group")}>Group{sortMark("group")}</button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("name")} className="is-left">
                    <button type="button" onClick={() => toggleSort("name")}>Place{sortMark("name")}</button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("stage")} className="is-left">
                    <button type="button" onClick={() => toggleSort("stage")}>Stage{sortMark("stage")}</button>
                  </th>
                  {lensKey === "trajectory" && (
                    <th scope="col" className="is-left" title={`The stage in the ${PATH_YEARS_TEXT} readings`}>{PATH_YEARS[0]} to {LATEST_YEAR}</th>
                  )}
                  {columns.map((c) => (
                    <th key={c.key} scope="col" aria-sort={ariaSort(c.key)} className={c.align === "left" ? "is-left" : undefined} title={c.hint}>
                      <button type="button" onClick={() => toggleSort(c.key)}>{c.label}{sortMark(c.key)}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr
                    key={r.regionId}
                    className={selectedId === r.regionId ? "is-selected" : undefined}
                    onClick={() => setSelectedId((cur) => (cur === r.regionId ? null : r.regionId))}
                  >
                    <td className="is-left triage-cell-group">{groupByKey[r.groups[lensKey]].label}</td>
                    <th scope="row" className="is-left">
                      <button
                        type="button" className="triage-place" aria-pressed={selectedId === r.regionId}
                        onClick={(e) => { e.stopPropagation(); setSelectedId((cur) => (cur === r.regionId ? null : r.regionId)); }}
                      >
                        {r.name}
                      </button>
                      {r.tract && r.name !== `Census tract ${r.tract}` && <span className="triage-tract"> tract {r.tract}</span>}
                    </th>
                    <td className="is-left triage-cell-stage"><StageSwatch cls={r.stage.cls} /> {r.stage.cls.label}</td>
                    {lensKey === "trajectory" && <td className="is-left"><StagePath path={r.path} /></td>}
                    {columns.map((c) => (
                      <td key={c.key} className={`${c.align === "left" ? "is-left" : ""}${c.flag?.(r) ? " is-flag" : ""}`}>{c.text(r)}</td>
                    ))}
                  </tr>
                ))}
                {!tableRows.length && (
                  <tr><td colSpan={columns.length + 4} className="is-left" style={{ color: "var(--muted)" }}>No place matches.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="triage-caption">
            Select a row to mark the place on the chart. Bold figures are past the line their column describes; hover a
            column heading for its definition. {DASH} means the census does not report enough to measure it.
          </p>
        </div>
      </div>

      {/* The working, in full */}
      <details className="triage-method" open>
        <summary>How this lens is worked out</summary>
        <div className="triage-method-body">
          {FORMULAS[lensKey].map((f) => (
            <div key={f.figure} className="triage-formula">
              <h4>{f.figure}</h4>
              <p className="triage-formula-line">{f.formula}</p>
              {f.source && <p className="triage-formula-source"><strong>Source:</strong> {f.source}</p>}
              <dl>
                {f.data.map(([term, source]) => (
                  <div key={term}><dt>{term}</dt><dd>{source}</dd></div>
                ))}
              </dl>
            </div>
          ))}
          <div className="triage-formula">
            <h4>Groups</h4>
            <p className="triage-formula-source"><strong>Source:</strong> this site's own. The groups are definitions for sorting, not findings.</p>
            <table className="triage-rules">
              <thead><tr><th scope="col">Group</th><th scope="col">Rule</th><th scope="col">Tracts</th></tr></thead>
              <tbody>
                {lens.groups.map((g) => (
                  <tr key={g.key}><th scope="row">{g.label}</th><td>{g.rule}</td><td>{counts[g.key]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <p className="triage-foot">
        Stages and figures: 2000 Census and American Community Survey {EARLIER_SURVEY} and {LATEST_SURVEY}, five-county Austin region.
        Listings: Preservation Austin's published records as compiled for this site. {STAGE_UNSCORED.label}: {counts.unscored} tracts.
        Full method: About, then Methodology (section 6).
      </p>
    </section>
  );
}
