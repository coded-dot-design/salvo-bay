// The sim allocates nothing: 200,000 sim steps (a shot each: the bot picks at every level and fires,
// a new match when one ends) with V8's young-generation GCs counted. Run alone (npm test runs files
// one at a time, with --expose-gc).
import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceObserver, constants } from "node:perf_hooks";
import { seeded } from "@fzlt/core/kernel";
import * as M from "../src/model.ts";

const STEPS = 200000;
function run(n, m, r) {
  let matches = 0;
  for (let i = 0; i < n; i++) {
    if (m.phase !== M.BATTLE) {
      M.resetMatch(m, i, i & 1 ? M.BIG : M.CLASSIC);
      M.randomFleet(m, 0, r);
      M.randomFleet(m, 1, r);
      M.begin(m, i & 1);
      matches++;
    }
    const by = m.turn, c = M.botPick(m, by, r, i % 3);
    M.fire(m, by, c % m.N, (c / m.N) | 0);
  }
  return matches;
}

test(`0 young GCs over ${STEPS.toLocaleString("en-US")} sim steps`, async () => {
  const m = M.newMatch(1), r = seeded(1);
  run(20000, m, r); // warm up: the JIT
  globalThis.gc?.();
  let minor = 0;
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.detail?.kind === constants.NODE_PERFORMANCE_GC_MINOR) minor++;
  });
  obs.observe({ entryTypes: ["gc"] });
  const matches = run(STEPS, m, r);
  await new Promise((ok) => setTimeout(ok, 50));
  obs.disconnect();
  console.log(`# Salvo Bay: ${minor} young GCs over ${STEPS.toLocaleString("en-US")} sim steps (${matches.toLocaleString("en-US")} matches)`);
  assert.equal(minor, 0, `${minor} young GCs`);
});
