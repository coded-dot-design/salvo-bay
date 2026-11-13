// Two screens, one match, through the real play page and @fzlt/core/presence's join() against a
// stand-in fizlet-rooms server (tests/room-server.mjs): the invite check, the lobby, the host's bay
// reaching the guest, placement (fleets stay on their own screen), shots and answers, the end on
// both screens, the reveal checked against each commit, a rematch, and a player leaving.
// Needs npm run build. CHROMIUM_PATH picks the browser.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./serve.mjs";
import { CODE, roomServer } from "./room-server.mjs";

const site = await serve(), rooms = await roomServer();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const t0 = Date.now();
try {
  // Reduced motion keeps the shells short; the game is the same.
  const open = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${site.url}/tests/fixtures/play.html?mode=online&rooms=${encodeURIComponent(rooms.url)}`);
    return p;
  };
  const A = await open({ width: 1440, height: 900 }), B = await open({ width: 390, height: 844 });
  const st = (p) => p.evaluate(() => window.app.scene && { ...window.app.scene.state, phase: window.app.scene.m.phase, winner: window.app.scene.m.winner, N: window.app.scene.m.N });
  const join = async (p) => {
    const sr = p.locator("#game");
    await sr.locator("input[name=code]").fill(CODE.toLowerCase());
    for (let i = 0; i < 3; i++) await sr.locator("[data-room='1']").click();
    await sr.locator("form button[type=submit]").click();
  };
  // A joins first: it is the host, and it picked the big bay.
  await A.evaluate(() => (window.app.pick.bay = 1));
  await join(A);
  await A.locator("#game [data-for=wait]").waitFor({ state: "visible" });
  await join(B);
  for (const p of [A, B]) await p.waitForFunction(() => window.app.scene?.state.mode === "net", null, { timeout: 15000 });
  const [a0, b0] = [await st(A), await st(B)];
  assert.equal(a0.N, 10, "the host's bay");
  assert.equal(b0.N, 10, "the guest plays the host's bay");
  console.log(`✓ invite, lobby, both in room 3 on the host's big bay (${Date.now() - t0} ms)`);

  // Placement: a random fleet on each screen, then START (keys on the stage).
  for (const p of [A, B]) {
    await p.evaluate(() => window.app.scene.focus());
    await p.keyboard.press("x");
    await p.keyboard.press("s");
  }
  for (const p of [A, B]) await p.waitForFunction(() => window.app.scene.m.phase === 1, null, { timeout: 10000 });
  const fleetA = await A.evaluate(() => Array.from(window.app.scene.m.sides[1].grid).some((g) => g >= 0));
  assert.equal(fleetA, false, "A cannot see B's fleet");
  console.log("✓ fleets committed; neither screen holds the other fleet");

  // Battle: the host fires first. A fires only at B's ships (the test reads B's own screen), B misses.
  const yours = (p) => p.evaluate(() => { const s = window.app.scene, m = s.m; return m.phase === 1 && m.turn === 0 && !s.state.anim && !s.state.shell; });
  const bShips = await B.evaluate(() => Array.from(window.app.scene.m.sides[0].grid).map((g, c) => (g >= 0 ? c : -1)).filter((c) => c >= 0));
  const aShips = new Set(await A.evaluate(() => Array.from(window.app.scene.m.sides[0].grid).map((g, c) => (g >= 0 ? c : -1)).filter((c) => c >= 0)));
  let ai = 0, bi = 0, shots = 0;
  while ((await st(A)).phase === 1 || (await st(B)).phase === 1) {
    if (await yours(A)) {
      const c = bShips[ai++];
      const at = await A.evaluate((c) => window.app.scene.cellScreen(1, c), c);
      await A.mouse.click(at[0], at[1]);
      await A.waitForFunction(() => !window.app.scene.state.waiting, null, { timeout: 10000 });
      shots++;
    } else if (await yours(B)) {
      while (aShips.has(bi)) bi++;
      const at = await B.evaluate((c) => window.app.scene.cellScreen(1, c), bi++);
      await B.touchscreen?.tap?.(at[0], at[1]).catch(() => {});
      await B.mouse.click(at[0], at[1]);
      shots++;
    } else await A.waitForTimeout(60);
    if (Date.now() - t0 > 150000) throw new Error("the match took too long");
  }
  for (const p of [A, B]) await p.waitForFunction(() => window.app.scene.state.card && window.app.scene.state.check >= 0, null, { timeout: 15000 });
  const [a1, b1] = [await st(A), await st(B)];
  assert.equal(a1.winner, 0, "A won on A's screen");
  assert.equal(b1.winner, 1, "and on B's");
  assert.equal(a1.check, 0, "B's revealed fleet matches its commit and every answer");
  assert.equal(b1.check, 0, "A's too");
  const text = await A.locator("#game .sb-end").innerText();
  assert.match(text, /Victory/);
  assert.match(text, /matches every answer/);
  console.log(`✓ ${shots} shots; both screens agree A won; both fleets verified at the reveal (${Date.now() - t0} ms)`);

  // Rematch: both ask; a new round in placement, the guest fires first this time.
  await A.locator("#game .sb-again").click();
  await A.waitForFunction(() => window.app.scene.state.card && /WAITING/.test(document.querySelector("#game").shadowRoot.querySelector(".sb-again").textContent));
  await B.locator("#game .sb-again").click();
  for (const p of [A, B]) await p.waitForFunction(() => window.app.scene.m.phase === 0 && window.app.scene.state.round === 1, null, { timeout: 10000 });
  for (const p of [A, B]) await p.evaluate(() => window.app.scene.focus()), await p.keyboard.press("x"), await p.keyboard.press("s");
  for (const p of [A, B]) await p.waitForFunction(() => window.app.scene.m.phase === 1, null, { timeout: 10000 });
  assert.equal((await st(B)).turn, 0, "round 2: the guest fires first");
  console.log("✓ rematch: both asked, a new round, the guest fires first");

  // B leaves: A hears it and wins by default.
  await B.close();
  await A.waitForFunction(() => window.app.scene.state.card, null, { timeout: 10000 });
  assert.match(await A.locator("#game .sb-end").innerText(), /left the match/);
  console.log("✓ a player leaves: the other screen says so and the match ends");
  assert.deepEqual(errors, [], "no page errors");
  console.log(`Salvo Bay online: green in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  await browser.close();
  rooms.close();
  site.close();
}
