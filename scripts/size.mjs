// Every build in dist/ stays under its budget (gzip). The game is a board game on the diorama brick:
// its budget is measured, and a bump needs a measured reason (fizlet-factory docs/size-ledger.md).
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
const BUDGET = { "dist/salvo-bay.mjs": 57344, "dist/salvo-bay-hero.mjs": 49152 };
let failed = false;
for (const [file, max] of Object.entries(BUDGET)) {
  const raw = readFileSync(file), gz = gzipSync(raw, { level: 9 }).length, ok = gz <= max;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "OVER"} ${file} ${gz.toLocaleString("en-US")} / ${max.toLocaleString("en-US")} bytes gzip (${raw.length.toLocaleString("en-US")} raw)`);
}
if (failed) process.exit(1);
// The landing page quotes these (site/src/sizes.json): measured here, never typed by hand.
import { writeFileSync } from "node:fs";
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
const sizes = { game: gz("dist/salvo-bay.mjs"), hero: gz("dist/salvo-bay-hero.mjs"), date: new Date().toISOString().slice(0, 10) };
let old = {};
try { old = JSON.parse(readFileSync("site/src/sizes.json", "utf8")); } catch {}
if (old.game !== sizes.game || old.hero !== sizes.hero) writeFileSync("site/src/sizes.json", JSON.stringify(sizes, null, 2) + "\n");
