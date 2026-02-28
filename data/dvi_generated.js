
import dvi from "./dvi_generated.json";
import { NAME_TO_ID } from "./regionLookup";

// Build a lookup: { [region_id]: Array<{year, dvi}> }
// Falls back to region_name key when no region_id mapping exists
export const DVI_LOOKUP = {};
dvi.forEach(({ region, year, dvi }) => {
  const id = NAME_TO_ID.get(region);
  const key = id != null ? id : region;
  if (!DVI_LOOKUP[key]) DVI_LOOKUP[key] = [];
  DVI_LOOKUP[key].push({ year, dvi });
});
