// ── Build modes ──
// PUBLIC (the default): what `npm run dev`, `npm run build`, and the
// GitHub Pages deploy produce. It carries the map only — no outreach
// planning data, no organizer contacts, no ranking or planning views.
//
// PRESENTER: `npm run present`. Runs on this machine only (the dev server
// listens on localhost) and unlocks every view plus the private datasets.
// Nothing built in this mode should ever be uploaded.
//
// The switch is Vite's build mode, so it is fixed at build time: a public
// bundle cannot be flipped into presenter mode from the browser. The
// private data swap itself happens in vite.config.js.
export const PRESENTER_MODE = import.meta.env.MODE === "presenter";

// A public build can route to the map and to a place's story card ("card",
// the one-page profile at its own address) and nothing else — the other
// views are unreachable (including by direct URL) and, because
// PRESENTER_MODE is a build-time constant, their code and data are left out
// of the bundle.
//
// To publish another view later, add its key to PUBLIC_VIEWS *and* remove
// the PRESENTER_MODE gate on its render in index.jsx. Keep "outreach"
// (planning data, organizer contacts) and "triage" (a ranked list of
// neighborhoods, which the project has decided not to publish) out of it.
const PUBLIC_VIEWS = ["map", "card"];

const ALL_VIEWS = ["map", "card", "outreach", "plan", "history", "compare", "triage", "timeline"];

export const ALLOWED_VIEWS = PRESENTER_MODE ? ALL_VIEWS : PUBLIC_VIEWS;

export const isViewAllowed = (view) => ALLOWED_VIEWS.includes(view);
