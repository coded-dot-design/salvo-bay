// The settle guard: a match keeps its clock while nobody touches it, the table sleeps (no frames at
// all) once it has been idle for its window, a pause holds the clock and asks for no frames, input
// wakes it, and Recall leaves the page exactly as it was with no frames after. The hero: an attract
// battle sleeps once it is won, off screen it asks for nothing, and with reduced motion it is one
// still frame. Needs npm run build. CHROMIUM_PATH picks the browser. Waits on state, not on time,
// except the measured windows.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./serve.mjs";

const site = await serve();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const frames = async (p, ms) => {
  const f0 = await p.evaluate(() => window.__frames);
  await p.waitForTimeout(ms);
  return (await p.evaluate(() => window.__frames)) - f0;
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${site.url}/tests/fixtures/host.html`);
  const before = await p.evaluate(() => document.documentElement.outerHTML);
  await p.evaluate(async () => {
    const { createSalvoBay } = await import("/dist/salvo-bay.mjs");
    window.g = createSalvoBay({ seed: 3, sound: false, idle: 2 });
    window.g.start();
  });
  const clock = () => p.evaluate(() => window.g.getSnapshot().elapsed);
  const c0 = await clock(), f1 = await frames(p, 1000), c1 = await clock();
  assert.ok(f1 > 20, `mid-match: the table draws (${f1} frames in 1 s)`);
  assert.ok(c1 - c0 > 0.8, `the clock keeps pace (${(c1 - c0).toFixed(2)} s in 1 s)`);
  await p.waitForFunction(() => window.g.scene.engine.paused.includes("settled"), null, { timeout: 15000 });
  const f2 = await frames(p, 1000), c2 = await clock(), c3 = (await p.waitForTimeout(500), await clock());
  assert.equal(f2, 0, "idle: settled, no frames");
  assert.ok(c3 > c2, "the match clock still runs while the table sleeps");
  console.log(`✓ mid-match ${f1} frames/s; idle 2 s → settled, 0 frames in 1 s; the clock keeps pace`);
  await p.mouse.move(900, 400);
  await p.mouse.move(920, 420);
  assert.ok((await frames(p, 400)) > 5, "input wakes it");
  await p.keyboard.press("p");
  await p.waitForFunction(() => window.g.getSnapshot().status === "paused");
  await p.waitForTimeout(200);
  const pc0 = await clock(), pf = await frames(p, 1000), pc1 = await clock();
  assert.equal(pf, 0, "paused: no frames");
  assert.equal(pc1, pc0, "paused: the clock holds");
  await p.keyboard.press("p");
  await p.waitForFunction(() => window.g.getSnapshot().status === "running");
  console.log("✓ input wakes it; paused: 0 frames and the clock holds; P resumes");
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => window.g.getSnapshot().status === "idle");
  const after = await p.evaluate(() => document.documentElement.outerHTML.replace(/<script>[\s\S]*?<\/script>/, (s) => s));
  assert.equal(after, before, "Recall: the page byte for byte");
  assert.equal(await frames(p, 1000), 0, "Recall: no frames after");
  console.log("✓ Escape: the page comes back byte for byte, 0 frames after");
  await ctx.close();

  // The hero.
  const hc = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const h = await hc.newPage();
  await h.addInitScript(() => {
    window.__frames = 0;
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => raf((t) => (window.__frames++, fn(t)));
  });
  await h.goto(`${site.url}/tests/fixtures/hero.html`);
  await h.waitForFunction(() => window.h.scene.m.sides[0].n[0] + window.h.scene.m.sides[1].n[0] >= 2, null, { timeout: 15000 });
  assert.ok((await frames(h, 500)) > 10, "the attract battle plays");
  await h.evaluate(() => window.scrollTo(0, 3000));
  await h.waitForTimeout(300);
  assert.equal(await frames(h, 800), 0, "off screen: no frames");
  await h.evaluate(() => window.scrollTo(0, 0));
  await h.evaluate(() => window.h.scene.finish(true));
  await h.waitForFunction(() => window.h.scene.engine.paused.includes("settled"), null, { timeout: 20000 });
  assert.equal(await frames(h, 1000), 0, "won: the hero settles");
  console.log("✓ hero: plays, 0 frames off screen, settles once the battle is won");
  await hc.close();
  const rc = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const r = await rc.newPage();
  await r.addInitScript(() => {
    window.__frames = 0;
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => raf((t) => (window.__frames++, fn(t)));
  });
  await r.goto(`${site.url}/tests/fixtures/hero.html`);
  await r.waitForFunction(() => window.h.scene.engine.paused.includes("settled"), null, { timeout: 10000 });
  assert.equal(await frames(r, 1000), 0, "reduced motion: a still poster");
  assert.ok(await r.evaluate(() => window.h.scene.state.shell), "the poster holds a shell in the air");
  console.log("✓ hero, reduced motion: one still frame (a shell in the air), 0 frames after");
  await rc.close();
  console.log("Salvo Bay: settle guard green");
} finally {
  await browser.close();
  site.close();
}
