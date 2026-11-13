// The game in Chromium at 1440 × 900 (keyboard and mouse) and 390 × 844 (touch): the menu, placing a
// fleet by hand (pick a ship on the dock, a cell, rotate), RANDOM and START, firing by keyboard,
// mouse and touch, pause and resume, a round played to the end (the end card, its stats, REMATCH),
// pass and play (the curtain, the table turned to each player), the big bay, reduced motion, the
// theme switch, and no page errors. Needs npm run build. CHROMIUM_PATH picks the browser.
// SHOTS=<dir> saves a screenshot of each step.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { serve } from "./serve.mjs";

const site = await serve(), SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const t0 = Date.now();
const S = (p) => p.evaluate(() => ({ ...window.app.scene.state, phase: window.app.scene.m.phase, turn: window.app.scene.m.turn, winner: window.app.scene.m.winner }));
const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png` });
const mine = (p) => p.waitForFunction(() => { const s = window.app.scene; return s.m.phase === 1 && s.m.turn === s.state.v && !s.state.anim && !s.state.curtain && !s.state.banner; }, null, { timeout: 20000 });

for (const [name, vp, touch, theme] of [["desktop", { width: 1440, height: 900 }, false, "dark"], ["phone", { width: 390, height: 844 }, true, "light"]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${site.url}/tests/fixtures/play.html?theme=${theme}`);
  const g = p.locator("#game");
  const press = (x, y) => (touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
  // The menu over an attract battle.
  await g.locator(".sb-menu-card").waitFor();
  assert.equal((await S(p)).mode, "attract");
  await shot(p, `${name}-1-menu`);
  await g.locator("[data-seg=mode] [data-v=solo]").click();
  await g.locator("[data-seg=level] [data-v='2']").click();
  await g.locator("[data-seg=bay] [data-v='0']").click();
  await g.locator("[data-go]").click();
  await p.waitForFunction(() => window.app.scene.state.mode === "bot" && window.app.scene.state.level === 2);
  // Placement by hand: the Whale from the dock to a cell, turned.
  await p.waitForFunction(() => !window.app.scene.state.banner);
  let at = await p.evaluate(() => window.app.scene.shipScreen(0));
  await press(at[0], at[1]);
  assert.equal((await S(p)).sel, 0, "the Whale is picked");
  if (!touch) await p.keyboard.press("r");
  at = await p.evaluate(() => window.app.scene.cellScreen(0, 2 * 8 + 3));
  await press(at[0], at[1]);
  const placed = await p.evaluate(() => { const s = window.app.scene.m.sides[0]; return [s.sx[0], s.sy[0], s.dir[0]]; });
  assert.ok(placed[0] >= 0, `the Whale is in the bay at ${placed}`);
  if (!touch) assert.equal(placed[2], 1, "R turned it");
  await shot(p, `${name}-2-place`);
  await g.locator(".gk-bar button", { hasText: "RANDOM" }).click();
  await g.locator(".gk-bar button", { hasText: "START" }).click();
  await p.waitForFunction(() => window.app.scene.m.phase === 1);
  console.log(`✓ ${name}: menu, a ship placed by ${touch ? "touch" : "mouse and R"}, RANDOM, START`);
  // Fire: keyboard (desktop) or touch (phone), then the mouse.
  await mine(p);
  const before = (await S(p)).log;
  if (!touch) {
    await p.evaluate(() => window.app.scene.focus());
    await p.keyboard.press("ArrowRight");
    await p.keyboard.press("ArrowDown");
    const c = (await S(p)).cursor;
    await p.keyboard.press("Enter");
    await p.waitForFunction((c) => window.app.scene.m.sides[1].shots[c] > 0, c, { timeout: 10000 });
  } else {
    at = await p.evaluate(() => window.app.scene.cellScreen(1, 0));
    await p.touchscreen.tap(at[0], at[1]);
    await p.waitForFunction(() => window.app.scene.m.sides[1].shots[0] > 0, null, { timeout: 10000 });
  }
  await shot(p, `${name}-3-shell`);
  await p.waitForFunction((n) => window.app.scene.state.log >= n + 2, before, { timeout: 15000 });
  console.log(`✓ ${name}: fired by ${touch ? "touch" : "keyboard"}; the bot answered; the log has both shots`);
  // Pause: the corner key (and P on desktop).
  await mine(p);
  await g.locator(".sb-pausek").click();
  await p.waitForFunction(() => window.app.scene.state.paused);
  const pc = (await S(p)).elapsed;
  await p.waitForTimeout(400);
  assert.equal((await S(p)).elapsed, pc, "paused: the clock holds");
  await shot(p, `${name}-4-paused`);
  await g.locator(".sb-resume").click();
  await p.waitForFunction(() => !window.app.scene.state.paused);
  if (!touch) await p.keyboard.press("p"), await p.waitForFunction(() => window.app.scene.state.paused), await p.keyboard.press("p"), await p.waitForFunction(() => !window.app.scene.state.paused);
  console.log(`✓ ${name}: pause and resume`);
  // Play the round out: aim at their ships (the test reads the bot's fleet), with the mouse or touch.
  while ((await S(p)).phase === 1) {
    await mine(p).catch(() => {});
    if ((await S(p)).phase !== 1) break;
    const c = await p.evaluate(() => { const m = window.app.scene.m, s = m.sides[1]; for (let c = 0; c < m.C; c++) if (s.grid[c] >= 0 && !s.shots[c]) return c; return -1; });
    at = await p.evaluate((c) => window.app.scene.cellScreen(1, c), c);
    if (!touch) await p.mouse.move(at[0], at[1]);
    await press(at[0], at[1]);
    await p.waitForFunction((c) => window.app.scene.m.sides[1].shots[c] > 0, c, { timeout: 10000 });
    if ((await p.evaluate(() => window.app.scene.state.sinking)) && SHOTS) await shot(p, `${name}-5-sinking`);
    if (Date.now() - t0 > 240000) throw new Error("the round took too long");
  }
  await p.waitForFunction(() => window.app.scene.state.card, null, { timeout: 15000 });
  const end = await g.locator(".sb-end").innerText();
  assert.match(end, /Victory/);
  assert.match(end, /BEST STREAK\s+12/i, "twelve hits in a row");
  assert.match(end, /won/);
  await shot(p, `${name}-6-end`);
  await g.locator(".sb-again").click();
  await p.waitForFunction(() => window.app.scene.m.phase === 0 && window.app.scene.state.round === 1);
  console.log(`✓ ${name}: a round to the end: Victory, a 12-hit streak, stats; REMATCH`);
  // Pass and play on the big bay.
  await p.evaluate(() => window.app.menu());
  await g.locator("[data-seg=mode] [data-v=local]").click();
  await g.locator("[data-seg=bay] [data-v='1']").click();
  await g.locator("[data-go]").click();
  await p.waitForFunction(() => window.app.scene.state.mode === "local" && window.app.scene.state.curtain && window.app.scene.m.N === 10);
  await shot(p, `${name}-7-curtain`);
  await g.locator(".sb-ready").click();
  for (const who of [0, 1]) {
    await p.waitForFunction((v) => window.app.scene.state.v === v && !window.app.scene.state.curtain, who);
    await g.locator(".gk-bar button", { hasText: "RANDOM" }).click();
    await g.locator(".gk-bar button", { hasText: "START" }).click();
    await p.waitForFunction(() => window.app.scene.state.curtain);
    await g.locator(".sb-ready").click();
  }
  await mine(p);
  assert.equal((await S(p)).v, 0, "Player 1 has the table");
  at = await p.evaluate(() => window.app.scene.cellScreen(1, 55));
  await press(at[0], at[1]);
  await p.waitForFunction(() => window.app.scene.state.curtain, null, { timeout: 10000 });
  assert.match(await g.locator(".sb-curtain").innerText(), /Player 2/);
  await g.locator(".sb-ready").click();
  await p.waitForFunction(() => window.app.scene.state.v === 1 && !window.app.scene.state.curtain);
  assert.equal(await p.evaluate(() => window.app.scene.m.sides[1].shots[55] > 0), true, "Player 2's bay shows Player 1's shot");
  await shot(p, `${name}-8-local`);
  console.log(`✓ ${name}: pass and play on the big bay: the curtain, the table turns to each player`);
  // The theme follows the page.
  await p.evaluate(() => (document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light"));
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => document.querySelector("#game").shadowRoot.querySelector(".sb-app").dataset.theme), theme === "light" ? "dark" : "light");
  assert.deepEqual(errors, [], `${name}: no page errors`);
  await ctx.close();
}
// Reduced motion: it plays (shells short, no bob), and nothing breaks.
const rc = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const r = await rc.newPage(), rerr = [];
r.on("pageerror", (e) => rerr.push(e.message));
await r.goto(`${site.url}/tests/fixtures/play.html?mode=solo`);
await r.waitForFunction(() => window.app.scene?.state.mode === "bot");
await r.evaluate(() => window.app.scene.focus());
await r.keyboard.press("x");
await r.keyboard.press("s");
await mine(r);
const at = await r.evaluate(() => window.app.scene.cellScreen(1, 9));
await r.mouse.click(at[0], at[1]);
await r.waitForFunction(() => window.app.scene.state.log >= 2, null, { timeout: 10000 });
assert.deepEqual(rerr, []);
console.log("✓ reduced motion: plays a turn each, no errors");
await rc.close();
await browser.close();
site.close();
console.log(`Salvo Bay: browser green in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
