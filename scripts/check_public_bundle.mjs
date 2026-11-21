// Guard for the public (GitHub Pages) build: fails if dist/ contains
// private outreach data or a presenter-only view. Run after `npm run build`
// (`npm run check:public`); the deploy workflow runs it before publishing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "dist", "assets");
if (!fs.existsSync(assets)) {
  console.error("check:public — dist/assets not found. Run `npm run build` first.");
  process.exit(2);
}
const bundle = fs.readdirSync(assets)
  .filter((f) => /\.(js|css|json)$/.test(f))
  .map((f) => fs.readFileSync(path.join(assets, f), "utf8"))
  .join("\n");

const problems = [];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/g;

// 1. No email address of any kind belongs in the public site. This catches
//    private datasets added later, not only the outreach contacts.
const emails = [...new Set(bundle.match(EMAIL) || [])];
if (emails.length) problems.push(`${emails.length} email address(es) in the bundle, e.g. ${emails.slice(0, 3).join(", ")}`);

// 2. When the private outreach file is present, none of its contact
//    details may appear.
const privateFile = path.join(root, "data", "outreach_events.json");
if (fs.existsSync(privateFile)) {
  const events = JSON.parse(fs.readFileSync(privateFile, "utf8"));
  const needles = new Set();
  for (const ev of events) {
    const text = [...(ev.contacts || []), ev.tablingText || ""].join(" ");
    for (const m of text.match(EMAIL) || []) needles.add(m);
    for (const m of text.match(PHONE) || []) needles.add(m);
  }
  const leaked = [...needles].filter((n) => bundle.includes(n));
  if (leaked.length) problems.push(`${leaked.length} outreach contact detail(s) in the bundle, e.g. ${leaked.slice(0, 3).join(", ")}`);
}

// 3. Presenter-only views must not ship. Each marker is a string that only
//    that view's code contains.
const MARKERS = {
  "Outreach planner": "pa-outreach-plan-v1",
  "Coverage view": "outreach desert",
  "Triage ranking": "Which neighborhoods should receive preservation grants",
};
for (const [view, marker] of Object.entries(MARKERS)) {
  if (bundle.includes(marker)) problems.push(`${view} code is in the bundle (found "${marker}")`);
}

if (problems.length) {
  console.error("check:public FAILED — this build must not be published:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("check:public passed — no private outreach data or presenter-only views in dist/.");
