// The built site (npm run site:build → artifacts/pages): the landing page at 1440 and 390, night and
// day: the hero is the game playing itself, a tap on the table starts a solo game there, PLAY goes to
// /play/ and its menu, the measured sizes are on the page, no page errors. SHOTS=<dir> saves them.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { serve } from "./serve.mjs";

const site = await serve("artifacts/pages"), SHOTS = process.env.SHOTS;
// The not-found page (site/src/pages/404.astro): 404.html at the root, noindex, a key home.
{ const nf = readFileSync("artifacts/pages/404.html", "utf8"); assert.ok(/<meta name="robots" content="noindex/.test(nf) && nf.includes('href="/"'), "404.html is noindex and links home"); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [name, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]])
    for (const theme of ["dark", "light"]) {
      const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 500, isMobile: vp.width < 500 });
      await ctx.addInitScript((t) => localStorage.setItem("dom-virus:theme", t), theme);
      const p = await ctx.newPage(), errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(`${site.url}/`);
      await p.waitForFunction(() => window.salvoHero?.scene.m.sides[0].n[0] + window.salvoHero?.scene.m.sides[1].n[0] >= 2, null, { timeout: 20000 });
      await p.waitForFunction(() => window.salvoHero.scene.state.shell, null, { timeout: 10000 });
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/landing-${name}-${theme}.png` }), await p.screenshot({ path: `${SHOTS}/landing-${name}-${theme}-full.png`, fullPage: true });
      assert.match(await p.locator("#built").innerText(), /\d+\.\d KB/);
      assert.equal(await p.locator("h1").count(), 1);
      // A tap on the table: a solo game, right there.
      const box = await p.locator("#hero").boundingBox();
      await (vp.width < 500 ? p.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.88) : p.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.7));
      await p.waitForFunction(() => window.salvoHero.solo && window.salvoHero.scene.state.mode === "bot");
      assert.ok(await p.evaluate(() => document.body.classList.contains("hero-playing")));
      if (SHOTS && theme === "dark") await p.waitForTimeout(1800), await p.screenshot({ path: `${SHOTS}/landing-${name}-tapped.png` });
      await p.locator("header .play-key").click();
      await p.waitForURL(/\/play\/$/);
      await p.waitForFunction(() => window.app?.scene?.state.mode === "attract", null, { timeout: 15000 });
      if (SHOTS) await p.waitForTimeout(1200), await p.screenshot({ path: `${SHOTS}/play-${name}-${theme}.png` });
      assert.deepEqual(errors, [], `${name} ${theme}: no page errors`);
      console.log(`✓ landing ${name} ${theme}: the hero plays itself; a tap starts a game there; PLAY opens /play/`);
      await ctx.close();
    }
  const rc = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const r = await rc.newPage();
  await r.goto(`${site.url}/`);
  await r.waitForFunction(() => window.salvoHero?.scene.engine.paused.includes("settled"), null, { timeout: 15000 });
  if (SHOTS) await r.screenshot({ path: `${SHOTS}/landing-1440-reduced.png` });
  console.log("✓ reduced motion: the hero is a still poster");
  await rc.close();
  console.log("Salvo Bay: site green");
} finally {
  await browser.close();
  site.close();
}
