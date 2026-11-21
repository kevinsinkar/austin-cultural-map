// Key moments: the ordered event ids behind the History view's guided path.
//
// This is an editorial starting sequence chosen by the site maintainer. The
// events are drawn from the AI-compiled dataset in events_all.json. Neither
// that dataset nor this selection has been reviewed by Preservation Austin.
//
// Editing rules:
//   - List only ids that exist in events_all.json, in the order they should
//     be read (earliest first).
//   - Keep it to 6-8 steps, and prefer events flagged "Well-Documented".
//   - Add no titles, dates or text here. Everything the view shows for a step
//     is read from the event record itself.
import { EVENT_BY_ID } from "./index";

const SELECTED_IDS = [
  "EV_1928_CITY_PLAN", // 1928 city plan
  "EV_1935_HOLC_MAP", // 1935 HOLC map
  "EV_1950_SWEATT", // 1950 Sweatt v. Painter
  "EV_1950S_URBAN_RENEWAL", // urban renewal clearance, c. 1960 to c. 1975
  "EV_1962_I35_DEDICATION", // 1962 Interstate 35
  "EV_1998_SMART_GROWTH", // 1998 Smart Growth Initiative
  "EV_2000_2010_BLACK_POPULATION_DECLINE", // 2000 to 2010 census change
  "EV_2021_CITY_APOLOGY", // 2021 City Council apology
];

// Ids that are not in the dataset (renamed or removed by a data update) are
// dropped silently, as are repeats, so the view never steps to a missing record.
export const KEY_MOMENT_IDS = SELECTED_IDS.filter(
  (id, i) => EVENT_BY_ID.has(id) && SELECTED_IDS.indexOf(id) === i
);
