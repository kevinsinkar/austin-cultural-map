# Austin's Shifting Ground — AI Agent Task List

**Purpose:** Actionable tasks an AI coding agent can execute to fix data gaps, add missing features, and improve the app as a grant-allocation tool for Preservation Austin.

**How to use this document:** Tasks are organized into phases. Within each phase, tasks are numbered by priority. Each task includes acceptance criteria so the agent (or reviewer) knows when it's done.

**Last updated:** 2026-03-21

---

## PRIORITY EXECUTION ORDER (Summary)

```
PHASE 1 — Data Integrity [COMPLETE]
  1.1  Normalize demographic field names                    ✅ DONE
  1.2  Normalize property field names                       ✅ DONE
  1.3  Normalize socioeconomic field names                  ✅ DONE
  1.4  Validate region-to-tract mapping                     ✅ DONE (269 regions mapped)
  1.5  Add missing rent burden to detail panel              ✅ DONE

PHASE 2 — Core Feature Gaps [COMPLETE]
  2.1  Build grant triage / prioritization view             ✅ DONE (TriageView.jsx)
  2.2  Add cultural anchor density metric                   ✅ DONE (calcAnchorDensity + badge)
  2.3  Expose DVI formula with adjustable weights           ✅ DONE (weight sliders in Triage)
  2.4  Expand comparison view demographics to all groups    ✅ DONE (All Groups toggle)

PHASE 3 — Narrative & Context Enrichment [PARTIALLY COMPLETE]
  3.1  Enrich comparison auto-narratives with cultural data ✅ DONE
  3.2  Add inflation-adjustment labels to property cards    ✅ DONE (nominal / 2023$ via CPI)
  3.3  Add receiving community annotations                  ⬜ TODO (only Dove Springs hardcoded)
  3.4  Add language/linguistic displacement data             ⬜ TODO

PHASE 4 — Forward-Looking & Qualitative Layers [NOT STARTED]
  4.1  Integrate dev pressure into detail panel metrics     ⬜ TODO
  4.2  Add institutional/social anchor data model           ⬜ TODO
  4.3  Add oral history / community voice hooks             ⬜ TODO
  4.4  Create "How to Use This for Grants" guide            ⬜ TODO

PHASE 5 — Preservation Austin Overlay [COMPLETE — added 2026-03-21]
  5.1  Create preservationAustin.js data file               ✅ DONE (156 geocoded entries)
  5.2  Add PA toggle overlay to map                         ✅ DONE (4-color dot layer)
  5.3  Add sub-toggles per PA category                      ✅ DONE (grant/merit/legacy/advocacy)
  5.4  Bidirectional linking (dots ↔ panel cards)           ✅ DONE (click-to-pan + popup sync)
  5.5  PA section in RegionDetailPanel Culture tab          ✅ DONE (proximity-based matching)
  5.6  Private residence dots at neighborhood level         ✅ DONE (6 entries spread out)
```

---

## PHASE 1 — Data Integrity ✅ COMPLETE

All Phase 1 tasks have been completed. Normalized JSON files exist at:
- `data/phase1_output/audited_demographics_normalized.json`
- `data/phase1_output/audited_property_normalized.json`
- `data/phase1_output/audited_socioeconomic_normalized.json`

`data/auditedData.js` imports from these normalized files and exports O(1) lookup Maps. Region index covers 269 regions with validated centroids and display names. Rent burden is displayed in the Economics tab.

---

## PHASE 2 — Core Feature Gaps ✅ COMPLETE

All Phase 2 tasks have been completed:
- **TriageView.jsx** — Scatter plot (anchor density vs DVI), sortable table, 5 triage categories, auto-generated recommendations
- **calcAnchorDensity / getAnchorBadge** — in `utils/math.js`, badge in RegionDetailPanel header
- **DVI weight sliders** — adjustable demographic (35%), market (35%), socioeconomic (30%) weights in TriageView
- **ComparisonView** — "All Groups" toggle showing White, Black, Hispanic, Asian, Other

---

## PHASE 3 — Narrative & Context Enrichment (PARTIALLY COMPLETE)

### Task 3.1: Enrich Comparison Auto-Narratives ✅ DONE
Cultural data (closed businesses, heritage affiliations) is integrated into ComparisonView narratives.

### Task 3.2: Add Inflation Labels to Property Cards ✅ DONE
`adjustForInflation` (via `utils/cpi.js`) applied to property and income metrics. Cards show "(nominal / 2023$)" with change arrows based on real values.

---

### Task 3.3: Add Receiving Community Annotations ⬜ TODO

**Problem:** Only Dove Springs has a receiving-community callout (hardcoded in RegionDetailPanel). Other receiving neighborhoods are not identified.

**Agent instructions:**
1. In region data or constants, add a `receiving_community` flag and `receiving_from` field for relevant regions.
2. Known receiving communities for Austin displacement:
   - Dove Springs (already flagged)
   - Del Valle
   - Pflugerville
   - Manor
   - Southeast Austin / Onion Creek
   - Round Rock (partial)
3. In `RegionDetailPanel.jsx`, generalize the Dove Springs-specific callout to apply to any region with `receiving_community === true`.
4. Display text: "Note: [Region] is a receiving community. Demographic changes here partly reflect inflow of families displaced from [receiving_from], not gentrification."
5. In TriageView, receiving communities should be categorized separately.

**Acceptance criteria:**
- All known receiving communities flagged in data
- Callout renders for each receiving community
- Triage view distinguishes receiving communities from displacing ones

---

### Task 3.4: Add Language/Linguistic Data ⬜ TODO

**Problem:** Racial demographics alone don't capture cultural presence. A neighborhood can shift from 60% to 40% Hispanic while losing all Spanish-language signage — or maintain those markers despite demographic change.

**Agent instructions:**
1. Source ACS Table B16001 ("Language Spoken at Home") at the tract level for 2010 and 2019–2023.
2. Key fields per region: `pct_spanish_speaking_household`, `pct_asian_language_household`, `pct_english_only_household`
3. Add to demographics data model.
4. Display in RegionDetailPanel as a metric row below the demographic composition chart.
5. Integrate into narrative when relevant.

**Acceptance criteria:**
- Language data available for 2010+
- Displayed in detail panel
- Integrated into narrative when relevant

---

## PHASE 4 — Forward-Looking & Qualitative Layers (NOT STARTED)

### Task 4.1: Integrate Dev Pressure into Detail Panel ⬜ TODO

**Problem:** The map has a "Dev. Pressure" toggle, but development pressure data isn't surfaced in the detail panel or triage recommendations.

**Agent instructions:**
1. In `RegionDetailPanel.jsx`, add a "Development Pipeline" section (collapsible) showing active permits, planned units, recent zoning changes.
2. Surface per-region dev pressure data from the existing overlay.
3. Consider a "Forward DVI" estimate: current DVI + adjustment for pending development.
4. Flag regions where dev pressure is high but DVI is still moderate — "act now" cases.

**Acceptance criteria:**
- Dev pressure data visible per-region in detail panel
- Triage view incorporates forward-looking signal

---

### Task 4.2: Add Institutional/Social Anchor Data Model ⬜ TODO

**Problem:** The business inventory doesn't capture non-commercial cultural anchors (churches, community centers, mutual aid orgs, gathering spaces).

**Agent instructions:**
1. Extend the business data model to include `anchor_type`: `commercial`, `religious`, `community_org`, `cultural_space`, `informal_gathering`, `educational`.
2. Create a data template for non-commercial anchors.
3. Pre-populate with known anchors for highest-DVI regions.
4. Display in RegionDetailPanel alongside legacy businesses.

**Acceptance criteria:**
- Data model supports non-commercial anchors
- Template exists for community data collection
- At least 2–3 institutional anchors populated per high-DVI region
- UI displays them within the business inventory

---

### Task 4.3: Add Oral History / Community Voice Hooks ⬜ TODO

**Problem:** The app is data-rich but voice-poor. Grant committees are moved by stories, not just numbers.

**Agent instructions:**
1. Add a `community_voices` data model with fields: quote, speaker, context, year, source.
2. In `RegionDetailPanel.jsx`, add a "Community Voice" section that displays 1–2 quotes if available.
3. Style as a blockquote with attribution.
4. Pre-populate with publicly available quotes from UT "Uprooted" study, Six Square oral histories, and Preservation Austin engagement records.
5. Placeholder state when empty: "No community voices recorded for this region yet."

**Acceptance criteria:**
- Data model supports quotes per region
- UI renders quotes when available
- Placeholder invites contribution when empty
- At least 3–5 regions have at least one quote

---

### Task 4.4: Create "How to Use This for Grants" Guide ⬜ TODO

**Problem:** The app doesn't explain how to translate data into funding decisions.

**Agent instructions:**
1. Create `GrantGuideModal.jsx` accessible from a button in the header (near "About" and "Agenda").
2. Content: step-by-step guide from Triage view → anchor density → pressure analysis → comparison → timeline storytelling.
3. Include recommended grant criteria thresholds (DVI 35–55, anchor density 30–70%, etc.).
4. Style consistently with the About modal.

**Acceptance criteria:**
- Grant guide modal accessible from header
- Content is specific and actionable
- References actual app features by name
- Includes recommended criteria thresholds

---

## PHASE 5 — Preservation Austin Overlay ✅ COMPLETE

Added 2026-03-21. All tasks complete.

### Task 5.1: Create preservationAustin.js Data File ✅ DONE
- 72 grants ($284K+ since 2016) with geocoded coordinates
- 41 merit award winners (2022–2025)
- 33 Legacy Business Month participants (2023–2025)
- 10 advocacy milestones
- Private residences placed at neighborhood-level centroids (not exact addresses)

### Task 5.2: Add PA Toggle Overlay to Map ✅ DONE
- "Preservation Austin" button in map toolbar
- 4-color scheme: purple (grants), blue (merit awards), amber (legacy businesses), emerald (advocacy)
- Dots filter by year slider (only shows items from that year or earlier)
- Grant dot size scales with award amount

### Task 5.3: Add Sub-Toggles per PA Category ✅ DONE
- Legend items are clickable toggles to show/hide each category independently
- Dimmed at 35% opacity when off

### Task 5.4: Bidirectional Linking (Dots ↔ Panel Cards) ✅ DONE
- Card → Map: clicking a card flies to location and opens the marker popup
- Map → Panel: clicking a dot switches to Culture tab, selects correct sub-tab, highlights card
- Works for both legacy business cards and PA cards

### Task 5.5: PA Section in RegionDetailPanel Culture Tab ✅ DONE
- Shows nearby PA items (grants, awards, businesses, advocacy) matched by proximity to region centroid
- Color-coded left border per type
- Displays name, type, year, amount, description

### Task 5.6: Private Residence Dots at Neighborhood Level ✅ DONE
- 6 private merit award homes spread to distinct residential neighborhood centroids
- Addresses tagged "neighborhood-level" in popups

---

## Data Files Reference

| File | Status | Description |
|---|---|---|
| `data/phase1_output/audited_demographics_normalized.json` | ✅ | Cleaned demographics with canonical field names |
| `data/phase1_output/audited_property_normalized.json` | ✅ | Cleaned property data with canonical field names |
| `data/phase1_output/audited_socioeconomic_normalized.json` | ✅ | Cleaned socioeconomic data with canonical field names |
| `data/preservationAustin.js` | ✅ | PA grants, merit awards, legacy businesses, advocacy (156 entries) |
| `data/regionIndex.js` | ✅ | 269 regions with centroids, DVI, display names |

## Key Components Reference

| Component | Status | Features |
|---|---|---|
| `components/MapView.jsx` | ✅ | Heritage, Businesses, Project Connect, Preservation Austin toggles + legend |
| `components/RegionDetailPanel.jsx` | ✅ | Demographics, Economics, Culture tabs; PA section; bidirectional linking |
| `components/TriageView.jsx` | ✅ | Scatter plot, sortable table, DVI weight sliders, triage categories |
| `components/ComparisonView.jsx` | ✅ | Side-by-side comparison, all-groups toggle, cultural narratives |
| `components/TimelineView.jsx` | ✅ | Gantt-style "River of Time" with business lifespans |
| `hooks/useAustinMap.js` | ✅ | Leaflet rendering, all overlay layers, marker ref storage |
| `data/auditedData.js` | ✅ | Single entry point for normalized phase1 data |
| `utils/math.js` | ✅ | DVI interpolation, anchor density, color ramps |
| `utils/cpi.js` | ✅ | CPI-U inflation adjustment to 2023 dollars |

---

*Remaining work: 6 tasks across Phases 3–4. Phase 3 remaining tasks (3.3, 3.4) focus on receiving community annotations and linguistic data. Phase 4 tasks (4.1–4.4) add forward-looking analysis, institutional anchors, oral histories, and a grant guide modal.*
