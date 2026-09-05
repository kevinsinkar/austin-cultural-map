/**
 * aisdSchools.js
 * ──────────────
 * Austin ISD campuses closed or consolidated (2010–2026), for the AISD map
 * overlay. Displacement drains enrollment from the attendance zones our
 * eviction/DVI layers flag; this layer puts the institutional consequence —
 * shuttered neighborhood schools — on the same map.
 *
 * Each entry:
 *   name                    campus name
 *   lat, lng                campus coordinates
 *   year_closed             calendar year the campus closed/consolidated
 *   level                   elementary | middle | high
 *   fate                    what happened to students/building
 *   enrollment_at_closure   approx enrollment in final year (null if unknown)
 *   source                  citation URL
 *
 * Populated from verified web research (TEA, AISD, Austin Monitor, KUT,
 * Statesman). See DATA_METHODOLOGY.md → AISD School Closures Layer.
 */

export const AISD_CLOSED_SCHOOLS = [
  {
    name: "Allan Elementary", lat: 30.256132, lng: -97.698947, year_closed: 2012, level: "elementary",
    fate: "Closed as a neighborhood school when AISD handed the campus to charter operator IDEA Public Schools (2012) over community protest; AISD terminated the contract after one year and the building later became the Allan Center for district programs.",
    enrollment_at_closure: null,
    source: "https://www.austinchronicle.com/news/2012-06-01/farewell-to-allan/all/",
  },
  {
    name: "Pease Elementary", lat: 30.274727, lng: -97.747835, year_closed: 2020, level: "elementary",
    fate: "Closed under the 2019 School Changes plan; students reassigned to Zavala Elementary; building converted into an affordable child care center for AISD employees in 2023.",
    enrollment_at_closure: 225,
    source: "https://communityimpact.com/austin/central-austin/education/2020/05/28/pease-brooke-elementary-school-communities-seek-closure-from-a-distance/",
  },
  {
    name: "Brooke Elementary", lat: 30.254465, lng: -97.708667, year_closed: 2020, level: "elementary",
    fate: "Closed in 2020; students split between Govalle and Linder elementaries; building declared surplus in 2025 and sold for mixed-use housing development.",
    enrollment_at_closure: 289,
    source: "https://www.austinisd.org/repurposing/brooke",
  },
  {
    name: "Metz Elementary", lat: 30.254832, lng: -97.721184, year_closed: 2021, level: "elementary",
    fate: "Approved for closure in 2019 but stayed open one extra year; consolidated into Sanchez Elementary in fall 2021; building now houses AISD administrative departments.",
    enrollment_at_closure: null,
    source: "https://www.kut.org/education/2021-02-01/to-preserve-the-legacy-of-a-closing-austin-isd-school-ut-students-create-a-digital-archive",
  },
  {
    name: "Sims Elementary", lat: 30.279023, lng: -97.686921, year_closed: 2021, level: "elementary",
    fate: "Merged into the modernized Norman campus (renamed Norman-Sims) after 2020-21; the Sims building now houses AISD's Alternative Learning Center.",
    enrollment_at_closure: null,
    source: "https://www.austinisd.org/repurposing/sims",
  },
  {
    name: "Barrington Elementary", lat: 30.360214, lng: -97.69617, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 under the consolidation plan approved Nov. 2025 (multi-F turnaround campus); students reassigned to Guerrero-Thompson and Wooldridge.",
    enrollment_at_closure: 307,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Becker Elementary", lat: 30.25028, lng: -97.759943, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (dual-language campus, 6-3 vote); students rezoned to Galindo and Zilker, with priority transfers to the relocated dual-language program at Sanchez.",
    enrollment_at_closure: 528,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Dawson Elementary", lat: 30.234365, lng: -97.764472, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (multi-F turnaround campus); students consolidated into Galindo Elementary.",
    enrollment_at_closure: 152,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Oak Springs Elementary", lat: 30.271347, lng: -97.705419, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (multi-F turnaround campus); students consolidated into Blackshear Elementary; possible future reopening after an estimated $47.6M renovation.",
    enrollment_at_closure: 213,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Ridgetop Elementary", lat: 30.311481, lng: -97.716966, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (dual-language campus); students rezoned to Reilly, with priority transfers to the relocated dual-language program at Pickle.",
    enrollment_at_closure: 375,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Sunset Valley Elementary", lat: 30.226861, lng: -97.806383, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (dual-language campus); students rezoned to Cunningham or Boone, with the dual-language program relocated to Odom.",
    enrollment_at_closure: 444,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Widén Elementary", lat: 30.189469, lng: -97.741182, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (multi-F turnaround campus); students consolidated into Rodríguez Elementary.",
    enrollment_at_closure: 339,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Winn Montessori", lat: 30.313543, lng: -97.665577, year_closed: 2026, level: "elementary",
    fate: "Closed ahead of 2026-27 (multi-F turnaround campus); students reassigned to Andrews and Pecan Springs, with the Montessori program recreated at Reilly Elementary.",
    enrollment_at_closure: 370,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Bedichek Middle School", lat: 30.195202, lng: -97.785391, year_closed: 2026, level: "middle",
    fate: "Closed ahead of 2026-27 (multi-F turnaround campus); students reassigned to Covington, Paredes, and Mendez middle schools.",
    enrollment_at_closure: 607,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
  {
    name: "Martin Middle School", lat: 30.253942, lng: -97.730691, year_closed: 2026, level: "middle",
    fate: "Closed ahead of 2026-27 (multi-F turnaround campus); students reassigned to Kealing, Lively, and Marshall middle schools.",
    enrollment_at_closure: 308,
    source: "https://www.austinchronicle.com/news/aisd-board-approves-school-closures-and-turnaround-plans/",
  },
];

export const AISD_COLORS = {
  closed: "#b91c1c",       // closed by the current slider year
  futureClosure: "#f59e0b", // closes after the current slider year
};
