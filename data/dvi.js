import _ from "lodash";
import { REGIONS_GEOJSON } from "./regions";

// DVI Data
export const DVI_RAW = [
  { region:"East 11th/12th Street Corridor", period:"2000-2010", dvi:68 }, { region:"East 11th/12th Street Corridor", period:"2010-2020", dvi:58.6 }, { region:"East 11th/12th Street Corridor", period:"2020-2023", dvi:34.4 },
  { region:"East Cesar Chavez / East 5th-7th", period:"2000-2010", dvi:63 }, { region:"East Cesar Chavez / East 5th-7th", period:"2010-2020", dvi:56 },
  { region:"Govalle / Johnston Terrace", period:"2000-2010", dvi:44 }, { region:"Govalle / Johnston Terrace", period:"2010-2020", dvi:47 },
  { region:"Rosewood / College Heights", period:"2000-2010", dvi:49 }, { region:"Rosewood / College Heights", period:"2010-2020", dvi:52.6 },
  { region:"Holly / Rainey Street", period:"2000-2010", dvi:80.6 }, { region:"Holly / Rainey Street", period:"2010-2020", dvi:48 },
  { region:"South Lamar Corridor", period:"2000-2010", dvi:27 }, { region:"South Lamar Corridor", period:"2010-2020", dvi:31 },
  { region:"Red River Cultural District", period:"2000-2010", dvi:14 }, { region:"Red River Cultural District", period:"2010-2020", dvi:16 }, { region:"Red River Cultural District", period:"2020-2023", dvi:22 },
  { region:"North Loop / Hyde Park", period:"2000-2010", dvi:12 }, { region:"North Loop / Hyde Park", period:"2010-2020", dvi:15 },
  { region:"Montopolis / Southeast Austin", period:"2000-2010", dvi:22 }, { region:"Montopolis / Southeast Austin", period:"2010-2020", dvi:39 },
  { region:"St. Johns / Rundberg", period:"2000-2010", dvi:17.4 }, { region:"St. Johns / Rundberg", period:"2010-2020", dvi:30.6 },
  { region:"Dove Springs", period:"2000-2010", dvi:9.2 }, { region:"Dove Springs", period:"2010-2020", dvi:18.4 },
  { region:"Manor Road / Cherrywood", period:"2000-2010", dvi:57 }, { region:"Manor Road / Cherrywood", period:"2010-2020", dvi:49.6 },
  { region:"South Congress (SoCo)", period:"2000-2010", dvi:35.4 }, { region:"South Congress (SoCo)", period:"2010-2020", dvi:29.4 },
  { region:"The Domain / North Burnet", period:"2000-2010", dvi:23 }, { region:"The Domain / North Burnet", period:"2010-2020", dvi:25 },
  { region:"Downtown / West Campus", period:"2000-2010", dvi:27 }, { region:"Downtown / West Campus", period:"2010-2020", dvi:21.2 },
];

// Build DVI lookup table
export const DVI_LOOKUP = {};
REGIONS_GEOJSON.features.forEach(f => {
  const n = f.properties.region_name, entries = DVI_RAW.filter(d => d.region === n);
  const pts = [{ year:1990, dvi:0 },{ year:2000, dvi:0 }];
  entries.forEach(e => pts.push({ year:parseInt(e.period.split("-")[1]), dvi:e.dvi }));
  if (!pts.find(p=>p.year===2023)){ const l=_.maxBy(pts,"year"); pts.push({ year:2023, dvi:l?l.dvi*.92:0 }); }
  if (!pts.find(p=>p.year===2025)){ const l=pts.find(p=>p.year===2023); pts.push({ year:2025, dvi:l?l.dvi*.95:0 }); }
  DVI_LOOKUP[n] = _.sortBy(pts,"year");
});
