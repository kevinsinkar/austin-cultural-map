// Tipping Points — narrative anchors for the corridors where displacement
// crossed a point of no return.
//
// The quantitative story (population and home-value changes) is NOT stored
// here: it is computed at render time from the audited census data by
// computeTippingStats(utils/math.js) using each corridor's `region_ids`
// and `decade`, so the numbers shown can never drift from the data.
// `context` holds only what the data cannot compute: policy narrative and
// external citations. `region_ids` are best-effort tract assignments from
// the audited data's own region labels and census tract numbers (see
// tract_label in data/regionIndex.js); corridors like Red River map only
// approximately onto census geography.
export const TIPPING_POINTS = [
  {
    region: "East 11th/12th Street Corridor",
    region_ids: [85, 86], // Tracts 8.04, 9.01 — Central East Austin
    decade: "2000–2010",
    context: "The Smart Growth Initiative directed $100M+ in bonds to the East Austin Desired Development Zone (1999). The UT 'Uprooted' study documented a 66% decrease in Black population across East Austin 2000–2010.",
    impact: "African American",
    magnitude: "Extreme",
    event: "Smart Growth Initiative DDZ directed $100M+ in bonds to East Austin (1999); I-35 corridor investment; East Austin SMART Housing; Mueller Airport redevelopment announced",
    eventYear: "2000–2005",
  },
  {
    region: "East Cesar Chavez / East 5th-7th",
    region_ids: [111], // Tract 9.02
    decade: "2000–2010",
    context: "Smart Growth 'eco-gentrification' drove a 106% East Austin home-price increase 1999–2006 ('Uprooted').",
    impact: "Mexican American/Latino",
    magnitude: "Extreme",
    event: "Smart Growth DDZ investment; East Cesar Chavez corridor investment; I-35 frontage redevelopment",
    eventYear: "2003–2008",
  },
  {
    region: "Govalle / Johnston Terrace",
    region_ids: [82, 102], // Tract 8.01 + Johnston Terrace
    decade: "2010–2020",
    context: "East Austin development spillover reached Govalle in the 2010s as central East Austin priced out.",
    impact: "Mexican American/Latino",
    magnitude: "Severe",
    event: "East Austin development spillover; Oracle campus; Project Connect planning",
    eventYear: "2015–2020",
  },
  {
    region: "Rosewood / College Heights",
    region_ids: [83], // Tract 8.02
    decade: "2010–2020",
    context: "Mueller's 78723 zip median household income roughly tripled, from $34,242 to $87,000+ (2000–2023).",
    impact: "African American",
    magnitude: "Severe",
    event: "Mueller development buildout (25% affordable housing req.); Springdale corridor rezoning; 'Uprooted' displacement study published",
    eventYear: "2012–2018",
  },
  {
    region: "Holly / Rainey Street",
    region_ids: [112], // Tract 10.0
    decade: "2000–2010",
    context: "Holly Power Plant decommissioning and the 2004 Rainey Street CBD rezoning turned over a working-class Mexican American riverfront neighborhood within a decade.",
    impact: "Mexican American/Latino",
    magnitude: "Extreme",
    event: "Rainey Street rezoning (2004); Holly Shores redevelopment; Second Street District required 30%+ locally-owned retail; Seaholm adaptive reuse (2015)",
    eventYear: "2004–2010",
  },
  {
    region: "South Lamar Corridor",
    region_ids: [129, 170, 172],
    decade: "2010–2020",
    context: "No single dramatic demographic shift, but steady cultural erosion — luxury development surrounding legacy venues like the Broken Spoke.",
    impact: "Mixed/Working class",
    magnitude: "Moderate",
    event: "South Lamar densification; luxury condos surrounding Broken Spoke",
    eventYear: "2014–2020",
  },
  {
    region: "Red River Cultural District",
    region_ids: [163], // Tract 11.01 — approximate; the district spans blocks, not tracts
    decade: "2020–2025",
    context: "Venue closures accelerating; cultural displacement outpacing residential change. The district maps only loosely onto census geography, so tract statistics understate the story.",
    impact: "Music/LGBTQ+ community",
    magnitude: "Severe",
    event: "Convention Center expansion (approved 2023); hotel development",
    eventYear: "2023–2025",
  },
  {
    region: "Montopolis / Southeast Austin",
    region_ids: [16, 24, 66, 76, 227, 237, 255],
    decade: "2010–2020",
    context: "Gentrification spreading east across Riverside and Montopolis.",
    impact: "Mexican American/Latino",
    magnitude: "Severe",
    event: "Riverside redevelopment; Oracle HQ; Project Connect Orange Line",
    eventYear: "2018–2020",
  },
  {
    region: "St. Johns / Rundberg",
    region_ids: [8, 57, 223],
    decade: "2010–2020",
    context: "Immigrant businesses under rent pressure along the North Lamar corridor.",
    impact: "Immigrant communities",
    magnitude: "Moderate",
    event: "Project Connect Blue Line; North Lamar corridor planning",
    eventYear: "2018–2020",
  },
  {
    region: "Dove Springs",
    region_ids: [261, 262, 263], // Franklin Park tracts (78744) — approximate
    decade: "1990–2010",
    context: "A receiving community: families displaced from central East Austin resettled here. Not infrastructure-driven — a function of displacement FROM other areas.",
    impact: "Receiving community",
    magnitude: "N/A",
    event: "Not infrastructure-driven; function of displacement FROM other areas",
    eventYear: "1990–2010",
  },
  {
    region: "Manor Road / Cherrywood",
    region_ids: [79, 242], // Upper Boggy Creek tracts
    decade: "2000–2010",
    context: "Mueller redevelopment and Manor Road corridor investment remade the area's market.",
    impact: "African American",
    magnitude: "Severe",
    event: "Mueller Airport redevelopment; Manor Road corridor investment",
    eventYear: "2004–2010",
  },
  {
    region: "South Congress (SoCo)",
    region_ids: [115, 116], // Galindo + South River City
    decade: "2005–2015",
    context: "Transformation from eclectic, affordable retail to a high-end boutique tourism destination — the Hotel San José effect.",
    impact: "Working-class/eclectic",
    magnitude: "Moderate",
    event: "SoCo became tourism destination; Hotel San Jose effect",
    eventYear: "2005–2015",
  },
  {
    region: "The Domain / North Burnet",
    region_ids: [27, 42, 176, 177, 201],
    decade: "2007–2015",
    context: "Greenfield to master-planned community; no pre-existing residential community was displaced.",
    impact: "N/A",
    magnitude: "N/A",
    event: "Domain Phase 1 (2007); NORTHSIDE (2013); IBM campus redevelopment",
    eventYear: "2007–2013",
  },
  {
    region: "Downtown / West Campus",
    region_ids: [94, 165, 210, 160, 161, 162, 171],
    decade: "1997–2020",
    context: "Downtown transformed by high-rise residential: Smart Growth funneled development downtown, Liberty Lunch was demolished for City Hall (1999), CodeNEXT failed (2018), and the HOME Initiative passed (2023).",
    impact: "Mixed",
    magnitude: "Moderate",
    event: "Smart Growth DDZ; Seaholm Power Plant adaptive reuse; Downtown Austin Plan; Waller Creek TIF; West Campus density bonuses; HOME Phase 1 (2023); Agent of Change (2024)",
    eventYear: "1997–2024",
  },
];
