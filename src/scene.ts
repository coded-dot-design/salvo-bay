// Salvo Bay's table: a ship-hunting duel on a cutaway tabletop diorama. Two glass trays of water sit
// on a wooden plinth in the corner of a room: your bay and the enemy's, with a dock, a fort on the
// enemy shore and a lighthouse. Place your fleet (pick a ship on the dock, then a cell; R turns it;
// RANDOM; START), then trade shells: a shell arcs over the table, a miss splashes and leaves a white
// peg, a hit bursts into fire and smoke and leaves a red one, a sunk ship rolls over and settles to
// the bottom, seen faintly through the water. Views: AUTO follows the turn, or both bays, yours or
// theirs; drag orbits, pinch zooms. Dark is the bay at night under the lighthouse's sweeping beam.
// Who plays each side: you, the bot (easy / normal / hard), a second player on this screen (pass and
// play: a curtain between turns, the table turned to whoever's turn it is), a player on another screen
// (a `Link`: shots and answers cross the wire, src/net.ts), or two bots (attract mode, the hero).
// Grown from the Fizlet gallery piece #102 (site/gallery/pieces/salvo/). Bricks: the kernel (fixed
// step; settle; its ledger for every page write, so Recall gives the page back byte for byte),
// @fzlt/core/diorama (the 3D: shapes, the depth sort with the effects in it, shadows, picking) and
// @fzlt/core/sound. The game is ./model.ts, pure and seeded; this file is the scene and the controls.
import { createEngine, seeded } from "@fzlt/core/kernel";
import { diorama, type DioramaObject, type DioramaObjectDef, type DioramaPoints } from "@fzlt/core/diorama";
import { sound } from "@fzlt/core/sound";
import { keys } from "./keys";
import {
  BATTLE, BAYS, BIG, CLASSIC, HARD, HIT, MAXC, MAXS, MISS, NORMAL, OVER, PLACE, SUNK, begin, botPick, canPlace, commit, concede, fire, legal, newMatch, packShip,
  place, randomFleet, ready, record, resetMatch, shipsLeft, unplace, verify, type Match,
} from "./model";

const TAU = 6.283185307179586, D = Math.PI / 180;
// The palettes: day (light) and night (dark), by role.
const LIGHT = {
  bg: "#efe8de", floor: "#d9d3ca", rug: "#f3cdbf", rug2: "#f7dccf", wallB: "#f2ddd0", wallR: "#d3e5dd", base: "#c69a6f", top: "#e4c196", bed1: "#4f8fb5", bed2: "#6db0cf", water: "#a8def0",
  rim: "#f7f2e8", glass: "#e3f4fb", dock: "#ddb689", plank: "#b98f63", bollard: "#6f6a78", lhBase: "#aeb0bd", lhW: "#faf6ee", lhR: "#ee8270", lhDark: "#5f6678", lamp: "#ffe7a0", roof: "#e66d5f",
  basin: "#a3dcee", buoyR: "#ef7d6a", buoyW: "#fbf7f0", fort: "#cfc9d6", fortTop: "#bdb6c6", crate: "#dcab72", pot: "#e39a74", leaf: "#8fcf9b", leaf2: "#b0dfa8", pole: "#6e6878",
  frame: "#f8f4eb", pic: "#a6d6ea", sun: "#f7d27a", blind: "#ef9f98",
  you0: "#e9a6c8", you1: "#f08e6f", you2: "#7fcfa8", you3: "#a99be0", you4: "#f2c96b", foe: "#8f9dc6", deck: "#fbf4e6", cabin: "#ffffff", foeDeck: "#e7e4f0", funnel: "#5f6b8a", foeFunnel: "#e2675c", cap: "#3d4255",
  flagYou: "#f08e6f", flagFoe: "#e2675c", pegHit: "#e5484d", pegMiss: "#ffffff", bad: "#ef6b6b", shadow: "#3a2d3c",
  grid: "rgba(255,255,255,0.6)", gridShade: "rgba(40,90,120,0.18)", light: [0.55, 1, 0.42], amb: 0.5, smoke: "#9d98a6", drop: "#ffffff", scorch: "#3b3036",
  // The water's moving light: wave crests, the foam on the walls, the sheen (alphas: crest, foam, sheen).
  foam: "#ffffff", wa: [0.13, 0.62, 0.09], night: false,
};
type Pal = typeof LIGHT;
const DARK: Pal = {
  ...LIGHT, bg: "#141a2c", floor: "#2b3047", rug: "#3c3658", rug2: "#463f66", wallB: "#2f3654", wallR: "#283f47", base: "#7d5c45", top: "#987452", bed1: "#14385a", bed2: "#1d5275", water: "#3f8aac",
  rim: "#cfcadb", glass: "#9cc6d9", dock: "#94724f", plank: "#6d5139", lhW: "#dfdae6", lhR: "#c9615a", lamp: "#fff4b8", basin: "#3b7f9c", frame: "#c9c4d4", pic: "#41708a", sun: "#f0e2a4", blind: "#a96a72",
  shadow: "#000000", grid: "rgba(200,235,255,0.42)", gridShade: "rgba(0,0,0,0.2)", light: [0.4, 1, 0.55], amb: 0.44, smoke: "#6f7384", drop: "#d9f1ff", scorch: "#1c1820",
  foam: "#d9f1ff", wa: [0.08, 0.42, 0.06], night: true,
};
type Key = Exclude<keyof Pal, "light" | "amb" | "night" | "wa">;

// The table: plinth top PT, three water bands to the surface WY, the trays' z centre TZ; hulls under
// the water line draw on their own layer, under the water (seen faintly through it). The trays' x
// centres, the dock, the fort and the lighthouse follow the bay's size (layout()).
const PT = 1.24, BED1 = 0.3, BED2 = 0.22, WTR = 0.25, WY = PT + BED1 + BED2 + WTR, TZ = -1.6;
const BELOW = { y: WY - 0.02, layer: 2 };
// Particles: x y z, vx vy vz, life, max life, type, size. Types: 0 drop, 1 spark, 2 fire, 3 smoke,
// 4 flash, 5 the water column, 6 the fireball (blooms, then turns to smoke), 7 debris, 8 a bubble.
const PART = 420, PS = 10, RINGS = 24;
// Timed beats (a fixed table, no closures): what runs, and when.
const T_VIEW = 1, T_BOT = 2, T_TURN = 3, T_END = 4, T_POSTER = 5, T_BANNER = 6, T_CURTAIN = 7, T_AGAIN = 8, T_RESULT = 9;
const VIEWS = ["auto", "both", "mine", "enemy"];
/** Who plays a side. */
const HUMAN = 0, BOT = 1, REMOTE = 2;
/** Ship ids by kind, for the art: 0 Walrus (5), 1 Whale (4), 2 Heron (3), 3 Otter (3), 4 Minnow (2). */
const KINDS = [[1, 2, 3, 4], [0, 1, 2, 3, 4]] as const;
/** Fleet colours for your ships, by kind. */
const HULL: Key[] = ["you0", "you1", "you2", "you3", "you4"];
const LETTERS = "ABCDEFGHIJ";

/** The other screen in an online match (src/net.ts): what this scene sends, and the seat. */
export interface Link {
  readonly seat: number;
  fire(cell: number): void;
  answer(cell: number, res: number, ship: number, packed: number): void;
  commit(hash: number): void;
  reveal(ships: ArrayLike<number>, count: number, salt: number): void;
  rematch(): void;
  concede(): void;
  /** The scene takes the link's messages from here (in its step). */
  listen(fn: ((op: number, a: number, b: number) => void) | null): void;
}
/** Link ops the scene hears. */
export const OP_COMMIT = 1, OP_FIRE = 2, OP_ANSWER = 3, OP_REVEAL = 4, OP_SALT = 5, OP_REMATCH = 6, OP_CONCEDE = 7, OP_LEFT = 8, OP_AWAY = 9, OP_BACK = 10;

export type Mode = "bot" | "local" | "net" | "attract";
export interface SceneOptions {
  /** Who plays: you against the bot (default), two on this screen, you against another screen, or two bots. */
  mode?: Mode;
  /** The bot's level: 0 easy, 1 normal (default), 2 hard. */
  level?: number;
  /** 0 CLASSIC 8 × 8 (default), 1 BIG BAY 10 × 10. */
  bay?: number;
  seed?: number;
  /** Online: the other screen. */
  link?: Link;
  /** Skip placement: a random fleet, straight into battle (the drop-in's quick game). */
  quick?: boolean;
  /** The part of the stage the page's own copy covers, as fractions [left, top]: the camera frames the
   *  table in the rest (the hero). Read on every framing. */
  inset?: () => [number, number];
  /** false: start muted. */
  sound?: boolean;
  /** Attract: start another battle when one ends (else it settles on the last frame). */
  loop?: boolean;
  /** Seconds of no input before the water stops and the scene sleeps (default 30; attract 8). */
  idle?: number;
  /** Escape: give the page back (the drop-in), pause (default) or nothing. */
  escape?: "recall" | "pause" | "none";
  /** The end card's MENU key (the play page's menu); without it the card offers REMATCH only. */
  menu?: () => void;
  /** Recall from inside (Escape in the drop-in, LEAVE). */
  recall?: () => void;
  /** Events: "phase", "turn", "shot", "over", "rematch", "pause". */
  on?(type: string, detail?: unknown): void;
}

export type SalvoScene = ReturnType<typeof mount>;

export function mount(stage: HTMLElement, opts: SceneOptions = {}) {
  const engine = createEngine({ root: stage, settle: 0.5, seed: (opts.seed ?? (Math.random() * 2147483647)) | 0 });
  const L = engine.ledger, sig = { signal: engine.signal };
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches, coarse = matchMedia("(pointer: coarse)").matches;
  const mode: Mode = opts.mode ?? "bot", link = opts.link ?? null, attract = mode === "attract", local = mode === "local";
  const IDLE = opts.idle ?? (attract ? 8 : 30);
  const theme = () => ((stage.closest("[data-theme]") as HTMLElement | null)?.dataset.theme ?? document.documentElement.dataset.theme) === "light";
  let P: Pal = theme() ? LIGHT : DARK;
  // Who plays each model side, and the viewer: the side shown in the near tray ("your bay"). Tray t
  // holds model side t ^ v; v changes only in pass and play.
  const ctl = new Uint8Array(2);
  ctl[0] = attract ? BOT : HUMAN;
  ctl[1] = mode === "bot" || attract ? BOT : mode === "net" ? REMOTE : HUMAN;
  let v = 0;
  let level = opts.level ?? NORMAL, round = 0;

  // ---- the page: the canvas, a key over it (the pointer surface and the keyboard's focus), the HUD
  // stickers, the banner, the shot log, the cards and the keys bar. All through the ledger. ----
  const canvas = L.add(document.createElement("canvas"));
  canvas.setAttribute("aria-hidden", "true");
  const play = L.add(document.createElement("button"));
  play.type = "button";
  play.className = "sb-play";
  const hud = L.add(document.createElement("div"));
  hud.className = "sb-hud" + (attract ? " sb-attract" : "");
  hud.innerHTML =
    `<div class="sb-head" data-hud><p class="sb-top"><b class="sb-chip sb-turn">Place your fleet</b><b class="sb-chip sb-n"><i class="sb-dot"></i><em>You</em> <span>4</span><i class="sb-dot sb-foe"></i><em>Enemy</em> <span>4</span> · Shots <span>0</span></b></p><p class="sb-hint"></p></div>` +
    `<p class="sb-banner" aria-hidden="true"><b></b></p>` +
    `<section class="sb-log" aria-label="Shot log"><h2>SHOT LOG</h2><ol></ol></section>` +
    `<p class="sb-live" aria-live="polite"></p>` +
    `<div class="sb-card sb-end" role="dialog" aria-label="Game over" hidden><small></small><b></b><p></p><dl class="sb-stats"></dl><p class="sb-best"></p><p class="sb-check"></p><div class="sb-cardkeys"><button type="button" class="bui-key sb-again">REMATCH</button><button type="button" class="bui-key sb-menu">MENU</button></div></div>` +
    `<div class="sb-card sb-curtain" role="dialog" aria-label="Pass the device" hidden><small>PASS AND PLAY</small><b></b><p></p><div class="sb-cardkeys"><button type="button" class="bui-key sb-ready">READY</button></div></div>` +
    `<div class="sb-card sb-pause" role="dialog" aria-label="Paused" hidden><small>PAUSED</small><b>Hold your fire</b><p>P or RESUME carries on.</p><div class="sb-cardkeys"><button type="button" class="bui-key sb-resume">RESUME</button><button type="button" class="bui-key sb-giveup">GIVE UP</button><button type="button" class="bui-key sb-pmenu">MENU</button></div></div>`;
  const q = <T extends Element>(s: string) => hud.querySelector(s) as T;
  const head = q<HTMLElement>(".sb-head"), top = head.children[0] as HTMLElement, hintEl = head.children[1] as HTMLElement;
  const live = q<HTMLElement>(".sb-live"), card = q<HTMLElement>(".sb-end"), curtain = q<HTMLElement>(".sb-curtain"), pauseCard = q<HTMLElement>(".sb-pause");
  const bannerEl = q<HTMLElement>(".sb-banner"), logEl = q<HTMLElement>(".sb-log"), logList = logEl.lastElementChild as HTMLElement;
  const turnEl = top.children[0] as HTMLElement, nums = top.children[1]!.querySelectorAll("span"), whoEl = top.children[1]!.querySelectorAll("em");
  const again = q<HTMLButtonElement>(".sb-again"), menuK = q<HTMLButtonElement>(".sb-menu"), readyK = q<HTMLButtonElement>(".sb-ready");
  menuK.hidden = q<HTMLElement>(".sb-pmenu").hidden = !opts.menu;
  stage.append(canvas, play, hud);
  const snd = sound(engine, { cues: { fire: "fire", splash: "click", hit: "hit", sunk: "boom", place: "click", bad: "hurt", start: "ready", win: "win", lose: "end" }, volume: 0.1 });
  if (attract || opts.sound === false) snd.on = false;
  // The keys: mute, then the placement keys and the view.
  const K_MUTE = 0, K_ROT = 1, K_RND = 2, K_GO = 3, K_VIEW = 4, K_LOG = 5;
  const [muteK, rotK, rndK, goK, logK, viewK] = keys(engine, stage, [
    { label: "♪", aria: "Mute (M)", id: K_MUTE },
    { label: "ROTATE", aria: "Rotate the ship (R)", id: K_ROT },
    { label: "RANDOM", aria: "Random fleet (X)", id: K_RND },
    { label: "START", aria: "Start the battle (S)", id: K_GO, c: "sb-go" },
    { label: "LOG", aria: "Shot log (L)", id: K_LOG, c: "sb-logk" },
    { label: "VIEW · AUTO", aria: "Camera view (V)", id: K_VIEW },
  ], (id) => {
    alive();
    if (id === K_MUTE) toggle();
    else if (id === K_ROT) rotate();
    else if (id === K_RND) randomize();
    else if (id === K_GO) startBattle();
    else if (id === K_LOG) toggleLog();
    else cycleView();
  }) as HTMLButtonElement[];
  muteK!.setAttribute("aria-pressed", "" + snd.on);
  muteK!.textContent = snd.on ? "♪" : "×";
  viewK!.innerHTML = `<span class="sb-vl">VIEW ·&nbsp;</span><b>AUTO</b>`;
  const viewName = viewK!.lastChild as HTMLElement;
  function toggle() {
    snd.on = !snd.on;
    muteK!.textContent = snd.on ? "♪" : "×";
    muteK!.setAttribute("aria-pressed", "" + snd.on);
  }
  // The log: open by default on a wide stage, folded to its key on a narrow one.
  let logOpen = !matchMedia("(max-width: 760px)").matches;
  function toggleLog() {
    logOpen = !logOpen;
    hudDirty = true;
    logM = 1;
    engine.wake();
  }

  // ---- the diorama ----
  const dio = diorama(canvas, { light: P.light, ambient: P.amb, background: () => P.bg, overlay: drawOverlay, get shadowColor() { return P.shadow; } });
  const keyed: DioramaObject[] = [], keyName: Key[] = [];
  const put = (d: DioramaObjectDef & { color?: Key }) => {
    const k = d.color as Key | undefined, ob = dio.add({ ...d, color: k ? P[k] : undefined });
    if (k) keyed.push(ob), keyName.push(k);
    return ob;
  };
  let m: Match = newMatch(1), seed = 1, botRnd = seeded(1), fxRnd = seeded(1), pegN = 0, randN = 0;
  // The bay's layout: size N (cells a side, one world unit each), half size H, the trays' x centres,
  // the dock, the fort, the lighthouse, the ships' places on the dock.
  let N = 8, H = 4, S = 4;
  const TX = [-5, 5], DOCK = { x: -5, z: 5.1 }, FORT = { x: 9, z: 5 }, LH = { x: 10.2, z: -4.7 }, SLOTS = new Float64Array(10);
  function layout() {
    (N = m.N), (H = N / 2), (S = m.S);
    (TX[0] = -(H + 1)), (TX[1] = H + 1);
    (DOCK.x = TX[0]!), (DOCK.z = TZ + H + 2.7);
    (FORT.x = TX[1]! + H), (FORT.z = DOCK.z - 0.1);
    (LH.x = TX[1]! + H + 1.2), (LH.z = TZ - H + 0.9);
    SLOTS.set(S === 4 ? [-2.3, -0.68, 2.15, -0.68, -2.75, 0.72, 1.35, 0.72, 0, 0] : [-2.75, -0.68, 2.65, -0.68, -3.55, 0.72, 0.05, 0.72, 3.45, 0.72]);
  }
  // Per ship (tray * MAXS + i): its root, its parts, the drop-in (your ships), its sink time (−1: afloat).
  const ships: DioramaObject[] = [], parts: DioramaObject[][] = [], drops = new Float64Array(MAXS), sinkT = new Float64Array(MAXS * 2).fill(-1);
  let fx0: DioramaPoints, fx1: DioramaPoints, shellPts: DioramaPoints;
  /** A bubble's colour (the painter strokes it as a ring). */
  const BUB = "#fefefe";
  /** Tray t's model side, and its ships' kinds. */
  const sideOf = (t: number) => m.sides[t ^ v]!;
  const kind = (i: number) => KINDS[m.bay === BIG ? 1 : 0][i]!;

  function buildScene() {
    dio.clear();
    layout();
    keyed.length = keyName.length = pegN = 0;
    const PW = 4 * H + 7.2, PD = 2 * H + 5.6;
    dio.cluster("room", { fixed: 0 });
    dio.cluster("base", { fixed: 1 });
    // The room: floor slab, two backdrop walls, rug, a picture, a blind, a plant (the cutaway corner).
    put({ id: "floor", size: [40, 0.5, 30], pos: [0, -0.5, 0], color: "floor", cluster: "room", layer: 0, pick: false });
    put({ id: "wallB", size: [40.6, 11, 0.5], pos: [0, -0.5, -15.25], color: "wallB", cluster: "room", layer: 0.3, pick: false });
    put({ id: "wallR", size: [0.5, 11, 30], pos: [20.25, -0.5, 0], color: "wallR", cluster: "room", layer: 0.3, pick: false });
    put({ id: "rug", size: [PW + 5.8, 0.05, PD + 6.4], on: "floor", pos: [0, 0, 1], color: "rug", layer: 0.2, pick: false });
    put({ id: "rug2", size: [PW + 3.8, 0.02, PD + 4.4], on: "rug", color: "rug2", layer: 0.21, pick: false });
    put({ id: "pic", size: [6, 3.6, 0.16], pos: [-6, 5.2, -15], color: "frame", cluster: "room", layer: 0.6, pick: false });
    put({ id: "picIn", size: [5.2, 2.8, 0.06], on: "pic", pos: [0, -3.2, 0.1], color: "pic", layer: 0.7, pick: false });
    put({ id: "picSun", shape: "cyl", sides: 10, size: [1, 0.05, 1], rot: [Math.PI / 2, 0, 0], on: "picIn", pos: [1.3, -1.2, 0.05], color: "sun", layer: 0.8, pick: false });
    for (let i = 0; i < 7; i++) put({ size: [0.12, 0.5, 5], pos: [20, 3.4 + i * 0.6, -6], color: "blind", cluster: "room", layer: 0.6, pick: false });
    put({ id: "pot", shape: "cyl", sides: 10, top: 1.2, size: [1.8, 1.5, 1.8], pos: [-16.5, 0, -12], color: "pot", cluster: "room", layer: 1, shadow: 0.2, on: "floor", pick: false });
    put({ id: "leaf", shape: "cyl", sides: 7, top: 0.45, size: [3, 2, 3], on: "pot", color: "leaf", layer: 1, pick: false });
    put({ shape: "cyl", sides: 7, top: 0.05, size: [2.1, 1.8, 2.1], on: "leaf", color: "leaf2", layer: 1, pick: false });
    // The plinth: a wooden tabletop the bay sits on.
    put({ id: "plinth", size: [PW, PT - 0.14, PD], on: "floor", color: "base", cluster: "base", layer: 0, shadow: 0.22, pick: false });
    put({ id: "top", size: [PW + 0.6, 0.14, PD + 0.6], on: "plinth", color: "top", layer: 0.4, pick: false });
    // Two trays: three water bands, opaque rims behind, glass in front.
    for (let s = 0; s < 2; s++) {
      const x = TX[s]!, cl = "tray" + s, rh = WY - PT + 0.1, w = 2 * H, e = H + 0.2;
      dio.cluster(cl, { at: [x, WY, TZ] });
      put({ id: "bed1" + s, size: [w, BED1, w], on: "top", pos: [x, 0, TZ], color: "bed1", cluster: cl, layer: 1, mask: 62, pick: false });
      put({ id: "bed2" + s, size: [w, BED2, w], on: "bed1" + s, color: "bed2", layer: 1, pick: false });
      put({ id: "water" + s, size: [w, WTR, w], on: "bed2" + s, color: "water", layer: 3, alpha: 0.84, pick: false });
      // The far and right walls are split at the water line: under it they draw under the water (so
      // they never hide the back row's cells), over it only a low rim.
      put({ size: [w + 0.8, WY - PT, 0.4], on: "top", pos: [x, 0, TZ - e], color: "rim", cluster: cl, layer: 0.5, pick: false });
      put({ size: [0.4, WY - PT, w], on: "top", pos: [x + e, 0, TZ], color: "rim", cluster: cl, layer: 0.5, pick: false });
      put({ size: [w + 0.8, rh - WY + PT, 0.4], on: "top", pos: [x, WY - PT, TZ - e], color: "rim", cluster: cl, layer: 4, pick: false });
      put({ size: [0.4, rh - WY + PT, w], on: "top", pos: [x + e, WY - PT, TZ], color: "rim", cluster: cl, layer: 4, pick: false });
      put({ size: [w + 0.8, rh, 0.4], on: "top", pos: [x, 0, TZ + e], color: "glass", alpha: 0.32, cluster: cl, layer: 6, pick: false });
      put({ size: [0.4, rh, w], on: "top", pos: [x - e, 0, TZ], color: "glass", alpha: 0.32, cluster: cl, layer: 6, pick: false });
      put({ size: [w + 0.8, 0.12, 0.42], on: "top", pos: [x, 0, TZ + e], color: "rim", cluster: cl, layer: 6.5, pick: false });
      put({ size: [0.42, 0.12, w], on: "top", pos: [x - e, 0, TZ], color: "rim", cluster: cl, layer: 6.5, pick: false });
      dio.decal(cl, 3.6, (ctx) => trayDecals(ctx, s));
    }
    // The dock (the fleet starts here), its planks and bollards; crates by it.
    const dw = 2 * H + 1.4;
    dio.cluster("dock", { at: [DOCK.x, PT, DOCK.z] });
    put({ id: "dock", size: [dw, 0.2, 3.1], on: "top", pos: [DOCK.x, 0, DOCK.z], color: "dock", cluster: "dock", layer: 1, shadow: 0.18, pick: false });
    for (let i = 0; i < 5; i++) put({ size: [dw, 0.012, 0.05], on: "dock", pos: [0, 0, -1.25 + i * 0.62], color: "plank", layer: 1.2, pick: false });
    for (let i = 0; i < 4; i++) put({ shape: "cyl", sides: 8, size: [0.28, 0.32, 0.28], on: "dock", pos: [i & 1 ? dw / 2 - 0.2 : 0.2 - dw / 2, 0, i & 2 ? 1.35 : -1.35], color: "bollard", layer: 3, shadow: 0.2, pick: false });
    const cx = TX[0]! - H - 1.6;
    put({ id: "crate0", size: [1, 0.9, 1], on: "top", pos: [cx, 0, DOCK.z + 0.2], rot: [0, 0.2, 0], color: "crate", shadow: 0.2, cluster: "crates", pick: false });
    put({ size: [0.8, 0.7, 0.8], on: "crate0", rot: [0, -0.5, 0], color: "crate", pick: false });
    put({ size: [0.9, 0.8, 0.9], on: "top", pos: [cx + 0.1, 0, DOCK.z - 1.2], rot: [0, -0.15, 0], color: "crate", shadow: 0.2, cluster: "crates2", pick: false });
    // The enemy shore: a small basin with buoys, and the fort they fire from.
    dio.cluster("shore", { at: [TX[1]!, PT, DOCK.z] });
    put({ id: "basin", size: [2 * H - 1.4, 0.1, 2.6], on: "top", pos: [TX[1]! - 1.1, 0, DOCK.z], color: "basin", cluster: "shore", layer: 1, pick: false });
    for (let i = 0; i < 3; i++) {
      put({ id: "buoy" + i, shape: "cyl", sides: 8, top: 0.8, size: [0.5, 0.36, 0.5], on: "basin", pos: [[-2.4, -0.3, 1.5][i]! * (H / 4), 0, [-0.4, 0.5, -0.3][i]!], color: "buoyR", layer: 3, shadow: 0.18, pick: false });
      put({ id: "buoyW" + i, shape: "cyl", sides: 8, top: 0.7, size: [0.4, 0.24, 0.4], on: "buoy" + i, color: "buoyW", layer: 3, pick: false });
      put({ shape: "cyl", sides: 8, top: 0, size: [0.28, 0.3, 0.28], on: "buoyW" + i, color: "buoyR", layer: 3, pick: false });
    }
    put({ id: "fort", size: [1.8, 1, 1.6], on: "top", pos: [FORT.x, 0, FORT.z], color: "fort", cluster: "shore", layer: 3, shadow: 0.2, pick: false });
    for (let i = 0; i < 4; i++) put({ size: [0.4, 0.3, 0.4], on: "fort", pos: [i & 1 ? 0.65 : -0.65, 0, i & 2 ? 0.55 : -0.55], color: "fortTop", layer: 3, pick: false });
    put({ id: "fmast", shape: "cyl", sides: 6, size: [0.07, 1.2, 0.07], on: "fort", color: "pole", layer: 3, pick: false });
    put({ size: [0.6, 0.36, 0.04], on: "fmast", pos: [0.32, -0.42, 0], color: "flagFoe", layer: 3, pick: false });
    // The lighthouse: a stack of red and white rings, the gallery, the lamp (unshaded), the roof.
    dio.cluster("lh", { at: [LH.x, PT + 2, LH.z] });
    put({ id: "lh0", shape: "cyl", sides: 9, top: 0.85, size: [2.2, 0.45, 2.2], on: "top", pos: [LH.x, 0, LH.z], color: "lhBase", shadow: 0.25, cluster: "lh", pick: false });
    let w = 1.3, prev = "lh0";
    for (let i = 0; i < 4; i++) put({ id: "lt" + i, shape: "cyl", sides: 12, top: 0.87, size: [w, 0.7, w], on: prev, color: i & 1 ? "lhR" : "lhW", pick: false }), (prev = "lt" + i), (w *= 0.87);
    put({ id: "lgal", shape: "cyl", sides: 12, size: [1.3, 0.12, 1.3], on: prev, color: "lhDark", pick: false });
    put({ id: "lamp", shape: "cyl", sides: 12, size: [0.66, 0.55, 0.66], on: "lgal", color: "lamp", emissive: true, pick: false });
    put({ id: "lroof", shape: "cyl", sides: 12, top: 0, size: [1, 0.55, 1], on: "lamp", color: "roof", pick: false });
    put({ shape: "cyl", sides: 6, top: 0.3, size: [0.12, 0.3, 0.12], on: "lroof", color: "lhDark", pick: false });
    // The fleets.
    for (let s = 0; s < 2; s++) for (let i = 0; i < S; i++) addShip(s, i);
    // The effects, in the depth sort: per tray (in its cluster, on the ships' layer, so smoke and
    // sparks sit between the hulls they rise from), and the shell with its trail over everything.
    const fxOpt = (cl: string) => ({ cap: PART, cluster: cl, layer: 4, paint: dot });
    fx0 = dio.points(fxOpt("tray0"));
    fx1 = dio.points(fxOpt("tray1"));
    shellPts = dio.points({ cap: 15, paint: shellDot });
  }
  const dot = (ctx: CanvasRenderingContext2D, i: number, p: DioramaPoints) => {
    const c = p.color[i]!;
    ctx.beginPath();
    ctx.arc(p.sx[i]!, p.sy[i]!, Math.max(0.8, p.sr[i]!), 0, TAU);
    if (c === BUB) return void ((ctx.strokeStyle = P.foam), (ctx.lineWidth = 1.3), ctx.stroke());
    ctx.fillStyle = c;
    ctx.fill();
  };
  const shellDot = (ctx: CanvasRenderingContext2D, i: number, p: DioramaPoints) => {
    const x = p.sx[i]!, y = p.sy[i]!;
    if (i) return dot(ctx, i, p);
    const r = Math.max(2.5, p.sr[0]!), a = ctx.globalAlpha;
    // A warm glow round the shell (brighter at night).
    ctx.fillStyle = P.night ? "#ffd36b" : "#fff3c4";
    ctx.globalAlpha = P.night ? 0.32 : 0.22;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#3a3f52";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, TAU);
    ctx.fill();
  };
  function hullOutline(L: number) {
    const hl = L / 2 - 0.1, hw = 0.33, b = Math.min(0.55, L * 0.18);
    return [[-hl, -hw * 0.8], [-hl + 0.12, -hw], [hl - b, -hw], [hl, 0], [hl - b, hw], [-hl + 0.12, hw], [-hl, hw * 0.8]];
  }
  /** One ship: a group (the root you pick, which moves, bobs and sinks) and its parts. The far tray's
   *  parts stay hidden until it sinks. */
  function addShip(t: number, i: number) {
    const L = m.fleet[i]!, k = kind(i), id = (t ? "f" : "y") + i, hull: Key = t ? "foe" : HULL[k]!, deck: Key = t ? "foeDeck" : "deck", fun: Key = t ? "foeFunnel" : "funnel", flag: Key = t ? "flagFoe" : "flagYou";
    const root = put({ id, shape: "group", size: [L - 0.3, 0, 0.66], on: t ? "water1" : "dock", shadow: t ? 0 : 0.22, tag: { side: t, ship: i }, layer: 4, below: BELOW });
    const list: DioramaObject[] = [];
    const part = (sfx: string, d: DioramaObjectDef & { color?: Key }) => {
      const ob = put({ below: BELOW, hidden: t === 1, layer: 4, ...d, id: id + sfx });
      list.push(ob);
      return ob;
    };
    part("h", { shape: "prism", outline: hullOutline(L), size: [L, 0.42, 0.7], taper: 0.72, on: id, pos: [0, -0.16, 0], color: hull });
    part("d", { size: [L - 0.75, 0.05, 0.52], on: id + "h", pos: [-0.14, 0, 0], color: deck });
    const funnel = (on: string, x: number, h = 0.42) => {
      part("fu" + on + x, { shape: "cyl", sides: 9, size: [0.3, h, 0.3], on, pos: [x, 0, 0], color: fun });
      part("fc" + on + x, { shape: "cyl", sides: 9, size: [0.32, 0.06, 0.32], on: id + "fu" + on + x, color: "cap" });
    };
    const turret = (on: string, x: number, back?: boolean) => {
      part("t" + x, { shape: "cyl", sides: 9, size: [0.38, 0.14, 0.38], on, pos: [x, 0, 0], color: hull });
      part("g" + x, { size: [0.4, 0.06, 0.07], on: id + "t" + x, pos: [back ? -0.2 : 0.2, -0.02, 0], color: "cap" });
    };
    if (k === 0) {
      // The Walrus: the big gun ship. Two turrets forward, one aft, a stepped tower, two funnels.
      part("c", { size: [1.5, 0.34, 0.48], on: id + "d", pos: [-0.3, 0, 0], color: "cabin" });
      part("b", { size: [0.7, 0.3, 0.42], on: id + "c", pos: [0.25, 0, 0], color: "cabin" });
      part("bt", { size: [0.34, 0.22, 0.34], on: id + "b", pos: [0.08, 0, 0], color: "cabin" });
      funnel(id + "c", -0.5), funnel(id + "c", -0.12, 0.34);
      part("m", { size: [0.05, 0.56, 0.05], on: id + "bt", pos: [0, 0, 0], color: "cap" });
      part("r", { size: [0.05, 0.05, 0.4], on: id + "m", pos: [0, -0.12, 0], color: "cap" });
      turret(id + "d", 1.55), turret(id + "d", 1.05), turret(id + "d", -1.6, true);
    } else if (k === 1) {
      part("c", { size: [1.75, 0.34, 0.46], on: id + "d", pos: [-0.35, 0, 0], color: "cabin" });
      part("b", { size: [0.6, 0.26, 0.42], on: id + "c", pos: [0.42, 0, 0], color: "cabin" });
      funnel(id + "c", -0.45), funnel(id + "c", -0.02, 0.3);
      part("m", { size: [0.05, 0.5, 0.05], on: id + "b", pos: [0.1, 0, 0], color: "cap" });
      turret(id + "d", 1.25);
    } else if (k === 2) {
      part("c", { size: [0.82, 0.42, 0.46], on: id + "d", pos: [-0.45, 0, 0], color: "cabin" });
      part("w", { shape: "wedge", size: [0.28, 0.42, 0.46], rot: [0, Math.PI, 0], on: id + "d", pos: [0.1, 0, 0], color: "cabin" });
      funnel(id + "c", -0.15);
      part("m", { size: [0.05, 0.42, 0.05], on: id + "c", pos: [0.22, 0, 0], color: "cap" });
      part("r", { size: [0.05, 0.05, 0.34], on: id + "m", color: "cap" });
      turret(id + "d", 0.75);
    } else if (k === 3) {
      part("c", { size: [0.7, 0.3, 0.44], on: id + "d", pos: [-0.1, 0, 0], color: "cabin" });
      funnel(id + "c", -0.08, 0.3);
      turret(id + "d", 0.68), turret(id + "d", -0.92, true);
    } else {
      part("c", { size: [0.6, 0.3, 0.42], on: id + "d", pos: [-0.15, 0, 0], color: "cabin" });
      part("m", { shape: "cyl", sides: 6, size: [0.05, 0.62, 0.05], on: id + "c", pos: [0.05, 0, 0], color: "cap" });
      part("fl", { size: [0.3, 0.17, 0.03], on: id + "m", pos: [0.16, -0.2, 0], color: flag });
    }
    ships[t * MAXS + i] = root;
    parts[t * MAXS + i] = list;
  }

  // ---- controller state ----
  // sel: the ship being placed (−1 none); hover / cursor: the cell under the pointer / the keyboard's.
  let sel = -1, hover = -1, cursor = 27, view = 0, anim = 0, picked = false, kbd = false, flash = 0, flashCell = -1, tAmb = 0, hudDirty = true, dirty = true;
  let freeze = false, logM = 0, paused = false, shown = false, waitingFor = 0, check = -1, overDone = false, banner = "", bannerK = 0, bannerOn = false;
  const pdir = new Uint8Array(MAXS), ghost = { show: false, ok: true, x: 0, y: 0, dir: 0, i: -1 };
  const shell = { on: false, t: 0, dur: 1, by: 0, cell: 0, res: 0, ship: -1, a: new Float64Array(3), b: new Float64Array(3), h: 3, pos: new Float64Array(3), trail: new Float64Array(42), tn: 0 };
  const fx = new Float32Array(PART * PS), rings = new Float32Array(RINGS * 5), burning = new Uint8Array(MAXC * 2);
  const TT = new Float64Array(10), TF = new Uint8Array(10);
  const cues = new Uint8Array(8);
  let ncue = 0, toastT = 0, toastK = 0, toastS = "", said = "", shake = 0, shakeA = 0, toastX = 0.5;
  const CUES = ["", "fire", "splash", "hit", "sunk", "place", "bad", "start", "win", "lose"];
  const cue = (k: number) => ncue < 8 && (cues[ncue++] = k);
  const tmp = new Float64Array(3), tmp2 = new Float64Array(3), hit3 = new Float64Array(3), A2 = new Int8Array(2);
  // [0] measure, [1] theme, [2] poster resolution, [3] safe top, [4] safe bottom inset, [5] drawn once.
  const V = new Float64Array(6);
  V[0] = V[1] = 1;
  const ro = new ResizeObserver(() => ((V[0] = 1), engine.wake()));
  ro.observe(stage);
  const mo = new MutationObserver(() => ((V[1] = 1), engine.wake()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
  const themed = stage.closest("[data-theme]");
  if (themed && themed !== document.documentElement) mo.observe(themed, { attributes: true, attributeFilter: ["data-theme"] });
  engine.signal.addEventListener("abort", () => (ro.disconnect(), mo.disconnect(), link?.listen(null)), { once: true });
  // Online: the other screen's messages wait here and run in the step, in order.
  const inbox: number[] = [];
  link?.listen((op, a, b) => (inbox.push(op, a, b), alive()));
  // Online: what crosses at the end. Our salt, our commit, theirs; their reveal as it arrives.
  const net = { salt: 0, mine: -1, theirs: -1, them: new Uint16Array(MAXS), got: 0, tsalt: -1, rematch: 0, gone: 0, away: false };

  // The match clock: wall time in play (placement and battle), not while paused or hidden.
  const clock = { base: 0, since: -1 };
  const ticking = () => !paused && m.phase !== OVER && !document.hidden && !attract;
  function clockSync() {
    const now = performance.now();
    if (clock.since >= 0) clock.base += now - clock.since;
    clock.since = ticking() ? now : -1;
  }
  const elapsed = () => (clock.base + (clock.since >= 0 ? performance.now() - clock.since : 0)) / 1000;
  document.addEventListener("visibilitychange", clockSync, sig);

  /** Something happened: keep the water moving a while (a scheduled hold, so settle waits). */
  let aliveT = 0;
  function alive() {
    const hold = m.phase === OVER || paused ? 6 : IDLE;
    aliveT = Math.max(aliveT, engine.time + hold);
    engine.busy(hold);
    engine.wake();
  }
  function later(sec: number, what: number) {
    if (attract) sec *= 0.6;
    for (let k = 0; k < 10; k++) if (!TF[k]) return void ((TT[k] = engine.time + sec), (TF[k] = what), engine.busy(sec + 0.05));
  }
  /** A new match (or a rematch: `next`) with the current settings. */
  function reset(s: number, bay = m.bay) {
    seed = s >>> 0;
    resetMatch(m, seed, bay);
    v = 0;
    botRnd = seeded(seed * 31 + 7);
    fxRnd = seeded(seed * 17 + 3);
    if (ctl[1] === BOT) randomFleet(m, 1, seeded(seed * 7 + 1));
    if (attract) randomFleet(m, 0, seeded(seed * 13 + 5)), begin(m, round & 1);
    sel = attract ? -1 : 0;
    hover = -1, cursor = ((N / 2) | 0) * N + ((N / 2) | 0) - 1, anim = 0, flash = 0, toastT = 0, shake = 0, waitingFor = 0, check = -1, overDone = false;
    pdir.fill(0), drops.fill(0), sinkT.fill(-1), burning.fill(0), fx.fill(0), rings.fill(0), TF.fill(0);
    (net.mine = net.theirs = net.tsalt = -1), (net.got = net.rematch = 0), net.them.fill(0);
    shell.on = false;
    logList.textContent = "";
    logRows.length = 0;
    buildScene();
    for (let i = 0; i < S; i++) syncShip(0, i), syncShip(1, i);
    card.hidden = curtain.hidden = true;
    stage.classList.remove("sb-curtained");
    (clock.base = 0), (clock.since = -1), clockSync();
    freeze = false;
    if (opts.quick && !attract) randomizeQuiet(), startBattle();
    setView(-1, true);
    refresh();
    alive();
    if (!attract && !opts.quick) local ? showCurtain(0, "Player 1, place your fleet", "Player 2: look away. Player 1 places first, then hands over.") : showBanner(mode === "net" ? "Place your fleet: they can't see it" : "Place your fleet", 0);
    else if (attract) later(1.2, ctl[m.turn] === BOT ? T_BOT : T_TURN);
    opts.on?.("phase", m.phase);
  }
  const cellLocal = (gx: number, gz: number, out: Float64Array) => ((out[0] = -H + 0.5 + gx), (out[2] = -H + 0.5 + gz), out);
  const cellWorld = (t: number, c: number, out: Float64Array) => ((out[0] = TX[t]! - H + 0.5 + (c % N)), (out[1] = WY), (out[2] = TZ - H + 0.5 + ((c / N) | 0)), out);
  /** The ship's first cell for a pointer on cell c (the ship centred on it, kept in the bay), in A2. */
  function anchorFor(i: number, c: number, dir: number) {
    const Lg = m.fleet[i]!, hx = c % N, hy = (c / N) | 0, off = (Lg - 1) >> 1;
    if (dir) (A2[0] = hx), (A2[1] = Math.max(0, Math.min(N - Lg, hy - off)));
    else (A2[0] = Math.max(0, Math.min(N - Lg, hx - off))), (A2[1] = hy);
    return A2;
  }
  function rest(ob: DioramaObject, on: string) {
    if (ob.on !== on) dio.on(ob, on);
  }
  function setShipAt(root: DioramaObject, t: number, x: number, y: number, dir: number, Lg: number) {
    rest(root, "water" + t);
    cellLocal(x + (dir ? 0 : (Lg - 1) / 2), y + (dir ? (Lg - 1) / 2 : 0), tmp);
    (root.pos[0] = tmp[0]!), (root.pos[1] = 0), (root.pos[2] = tmp[2]!);
    (root.rot[0] = root.rot[2] = 0), (root.rot[1] = dir ? -Math.PI / 2 : 0);
  }
  /** Ship i of a tray where the model has it: in the bay, a ghost over the hovered cell, or on the dock. */
  function syncShip(t: number, i: number) {
    const root = ships[t * MAXS + i]!, s = sideOf(t);
    root.tint = null;
    if (sinkT[t * MAXS + i]! >= 0) return;
    if (t === 1) return void (s.sx[i]! >= 0 && setShipAt(root, 1, s.sx[i]!, s.sy[i]!, s.dir[i]!, m.fleet[i]!));
    root.alpha = 1;
    if (s.sx[i]! >= 0) return setShipAt(root, 0, s.sx[i]!, s.sy[i]!, s.dir[i]!, m.fleet[i]!);
    if (m.phase === PLACE && i === sel && hover >= 0) {
      const a = anchorFor(i, hover, pdir[i]!), ok = canPlace(m, v, i, a[0]!, a[1]!, pdir[i]!);
      setShipAt(root, 0, a[0]!, a[1]!, pdir[i]!, m.fleet[i]!);
      (root.pos[1] = 0.22), (root.alpha = 0.6), (root.tint = ok ? null : P.bad);
      (ghost.show = true), (ghost.ok = ok), (ghost.x = a[0]!), (ghost.y = a[1]!), (ghost.dir = pdir[i]!), (ghost.i = i);
      return;
    }
    rest(root, "dock");
    (root.pos[0] = SLOTS[i * 2]!), (root.pos[1] = 0.16 + (i === sel ? 0.3 : 0)), (root.pos[2] = SLOTS[i * 2 + 1]!);
    root.rot[0] = root.rot[1] = root.rot[2] = 0;
  }
  function syncGhost() {
    ghost.show = false;
    for (let i = 0; i < S; i++) syncShip(0, i);
    refresh();
  }
  function refresh() {
    hudDirty = dirty = true;
    engine.wake();
  }
  /** The table rebuilt from the model, for the viewer `v` (pass and play turns it round): ships,
   *  pegs, scorches, sunk hulls on the bottom, fires on the hit cells. No effects, no words. */
  function restore() {
    buildScene();
    sinkT.fill(-1), burning.fill(0), fx.fill(0), rings.fill(0);
    for (let t = 0; t < 2; t++) {
      const s = sideOf(t);
      for (let i = 0; i < S; i++) {
        syncShip(t, i);
        if (s.sunk[i]) sink(t, i, true);
      }
      for (let c = 0; c < m.C; c++) {
        const r = s.shots[c]!;
        if (!r) continue;
        addPeg(t, c, r > MISS, s.grid[c]!);
        if (r === HIT) burning[t * MAXC + c] = 1;
      }
    }
    dirty = true;
  }

  // ---- effects ----
  function spawn(type: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) {
    for (let k = 0; k < PART; k++) {
      const o = k * PS;
      if (fx[o + 6]! > 0) continue;
      (fx[o] = x), (fx[o + 1] = y), (fx[o + 2] = z), (fx[o + 3] = vx), (fx[o + 4] = vy), (fx[o + 5] = vz);
      (fx[o + 6] = fx[o + 7] = life), (fx[o + 8] = type), (fx[o + 9] = size);
      return;
    }
  }
  const R = () => fxRnd();
  /** A ring on the water: centre, how far it spreads, how long it lives, a delay (it waits). */
  function ring(x: number, z: number, spread: number, life: number, delay: number) {
    for (let i = 0; i < RINGS; i++) if (rings[i * 5 + 4]! <= 0) return void ((rings[i * 5] = x), (rings[i * 5 + 1] = z), (rings[i * 5 + 2] = spread), (rings[i * 5 + 3] = -delay), (rings[i * 5 + 4] = life));
  }
  /** A miss: a tall column of water that rises and falls back, spray and a crown of drops round its
   *  foot, a ring and ripples that travel out across the cells. */
  function splash(x: number, z: number) {
    if (RM) {
      for (let i = 0; i < 10; i++) {
        const a = R() * TAU, sp = 0.5 + R() * 1.3;
        spawn(0, x, WY + 0.05, z, Math.cos(a) * sp, 2.6 + R() * 2.4, Math.sin(a) * sp, 0.45, 0.08);
      }
      return ring(x, z, 0.9, 0.5, 0);
    }
    for (let i = 0; i < 18; i++) {
      const h = R();
      spawn(5, x + (R() - 0.5) * 0.16, WY + 0.02, z + (R() - 0.5) * 0.16, (R() - 0.5) * 0.3, 3.2 + h * 4.4, (R() - 0.5) * 0.3, 2, 0.3 - h * 0.15);
    }
    for (let i = 0; i < 30; i++) {
      const a = R() * TAU, sp = 0.6 + R() * 1.5;
      spawn(0, x, WY + 0.3 + R() * 1.4, z, Math.cos(a) * sp, 1.5 + R() * 3.4, Math.sin(a) * sp, 1.4, 0.05 + R() * 0.06);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, sp = 1.6 + R() * 0.5;
      spawn(0, x + Math.cos(a) * 0.2, WY + 0.04, z + Math.sin(a) * 0.2, Math.cos(a) * sp, 1.6 + R() * 1.2, Math.sin(a) * sp, 1, 0.06 + R() * 0.03);
    }
    ring(x, z, 0.9, 0.9, 0), ring(x, z, 2.2, 1.6, 0.12), ring(x, z, 3.2, 2.2, 0.4), ring(x, z, 1.4, 1.3, 0.9);
  }
  /** A hit: a flash, a fireball that blooms and turns to smoke, sparks, debris, a shake, rings. */
  function burst(x: number, y: number, z: number, big: boolean) {
    spawn(4, x, y + 0.1, z, 0, 0, 0, RM ? 0.12 : 0.26, big ? 1.1 : 0.8);
    for (let i = 0, n = RM ? 8 : big ? 34 : 24; i < n; i++) {
      const a = R() * TAU, sp = 1 + R() * 2.6;
      spawn(1, x, y, z, Math.cos(a) * sp, 2 + R() * 3.2, Math.sin(a) * sp, 0.4 + R() * 0.35, 0.07 + R() * 0.06);
    }
    if (!RM) {
      for (let i = 0, n = big ? 9 : 6; i < n; i++) {
        const a = R() * TAU, sp = 0.25 + R() * 0.5;
        spawn(6, x + Math.cos(a) * 0.15, y + R() * 0.25, z + Math.sin(a) * 0.15, Math.cos(a) * sp, 0.5 + R() * 0.9, Math.sin(a) * sp, 1.4 + R() * 0.8, 0.08 + R() * 0.07);
      }
      for (let i = 0, n = big ? 16 : 10; i < n; i++) {
        const a = R() * TAU, sp = 1.2 + R() * 2.4;
        spawn(7, x, y, z, Math.cos(a) * sp, 2.4 + R() * 3.4, Math.sin(a) * sp, 1.6, 0.04 + R() * 0.05);
      }
      for (let i = 0; i < 14; i++) spawn(2, x + (R() - 0.5) * 0.4, y + 0.05, z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.4, 0.6 + R() * 0.8, (R() - 0.5) * 0.4, 0.7 + R() * 0.9, 0.2 + R() * 0.14);
      for (let i = 0, n = big ? 18 : 11; i < n; i++) spawn(3, x + (R() - 0.5) * 0.5, y + 0.25, z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.3 + 0.18, 0.7 + R() * 0.6, (R() - 0.5) * 0.3 - 0.1, 1.8 + R() * 1.4, 0.22 + R() * 0.14);
      (shake = 1), (shakeA = big ? 9 : 5);
    }
    ring(x, z, 0.8, RM ? 0.4 : 0.8, 0);
    RM || ring(x, z, 2, 1.4, 0.1);
  }
  function stepFx(dt: number) {
    let on = false;
    for (let i = 0; i < PART; i++) {
      const o = i * PS;
      if (fx[o + 6]! <= 0) continue;
      on = true;
      const ty = fx[o + 8]!;
      fx[o + 6] = fx[o + 6]! - dt;
      if (ty <= 1 || ty === 5 || ty === 7) fx[o + 4] = fx[o + 4]! - 9.8 * dt;
      else if (ty === 4) fx[o + 9] = fx[o + 9]! + dt * 3;
      else if (ty === 6) {
        // Blooms fast, then drifts up and spreads as smoke.
        const u = fx[o + 6]! / fx[o + 7]!;
        (fx[o + 3] = fx[o + 3]! * 0.95), (fx[o + 5] = fx[o + 5]! * 0.95), (fx[o + 4] = fx[o + 4]! * 0.97 + 0.02);
        fx[o + 9] = fx[o + 9]! + dt * (u > 0.8 ? 0.8 : 0.1);
      } else if (ty === 8) fx[o + 9] = fx[o + 9]! + dt * 0.12;
      else (fx[o + 3] = fx[o + 3]! * 0.985), (fx[o + 5] = fx[o + 5]! * 0.985), (fx[o + 9] = fx[o + 9]! + dt * (ty === 3 ? 0.22 : -0.12));
      (fx[o] = fx[o]! + fx[o + 3]! * dt), (fx[o + 1] = fx[o + 1]! + fx[o + 4]! * dt), (fx[o + 2] = fx[o + 2]! + fx[o + 5]! * dt);
      // Water, the column and debris end where they fall back into the bay.
      if ((ty === 0 || ty === 5 || ty === 7) && fx[o + 1]! < WY && fx[o + 4]! < 0) fx[o + 6] = 0;
    }
    for (let i = 0; i < RINGS; i++) {
      const o = i * 5;
      if (rings[o + 4]! <= 0) continue;
      on = true;
      rings[o + 3] = rings[o + 3]! + dt;
      if (rings[o + 3]! >= rings[o + 4]!) rings[o + 4] = 0;
    }
    if (shake > 0) (shake = Math.max(0, shake - dt * 2.4)), (on = true);
    return on;
  }
  /** The particles into the diorama's point pools (by tray), alpha and colour by type and age. */
  const FIRE = ["#ffd36b", "#ff7a3c"], BALL = ["#5d4a4c", "#9a4a36", "#e2552f", "#ff8a3a", "#ffc94d", "#fff2c0"];
  function fxPoints() {
    fx0.n = fx1.n = 0;
    for (let i = 0; i < PART; i++) {
      const o = i * PS, l = fx[o + 6]!;
      if (l <= 0) continue;
      const p = fx[o]! > 0 ? fx1 : fx0, j = p.n++, u = l / fx[o + 7]!, ty = fx[o + 8]!;
      (p.x[j] = fx[o]!), (p.y[j] = fx[o + 1]!), (p.z[j] = fx[o + 2]!), (p.r[j] = fx[o + 9]!);
      if (ty === 6) {
        // The fireball: white-hot, yellow, orange, red, soot, then the smoke colour as it fades.
        const k = u > 0.46 ? Math.min(5, ((u - 0.46) / 0.09) | 0) : -1;
        (p.a[j] = u > 0.46 ? Math.min(0.95, (1 - u) * 14) : (u / 0.46) * 0.55), (p.color[j] = k < 0 ? P.smoke : BALL[k]!);
        continue;
      }
      p.a[j] = ty === 3 ? Math.min(1, (1 - u) * 6) * u * 0.55 : ty === 2 ? Math.min(1, u * 1.5) : ty === 4 ? u * 0.9 : ty === 5 ? 0.92 : ty === 7 || ty === 8 ? Math.min(1, u * 3) : Math.min(1, u * 2);
      p.color[j] = ty === 3 ? P.smoke : ty === 0 || ty === 5 ? P.drop : ty === 2 ? FIRE[u > 0.55 ? 0 : 1]! : ty === 4 ? "#fff3c4" : ty === 7 ? "#3d4255" : ty === 8 ? BUB : "#ffd36b";
    }
    const s = shellPts;
    s.n = 0;
    if (!shell.on) return;
    (s.x[0] = shell.pos[0]!), (s.y[0] = shell.pos[1]!), (s.z[0] = shell.pos[2]!), (s.r[0] = 0.15), (s.a[0] = 1);
    for (let k = 1; k < shell.tn; k++) {
      (s.x[k] = shell.trail[k * 3]!), (s.y[k] = shell.trail[k * 3 + 1]!), (s.z[k] = shell.trail[k * 3 + 2]!);
      (s.r[k] = 0.09 * (1 - k / 16)), (s.a[k] = (1 - k / 14) * 0.5), (s.color[k] = P.night ? "#ffe9a0" : "#ffffff");
    }
    s.n = shell.tn || 1;
  }
  /** A shell from tray `bt`'s side at cell `cell` of the other tray. `res` 0: the answer is still on
   *  its way from the other screen (the shell waits over the cell for it). */
  function launch(bt: number, cell: number, res: number, ship: number) {
    (shell.on = true), (shell.t = 0), (shell.by = bt), (shell.cell = cell), (shell.res = res), (shell.ship = ship), (shell.tn = 0);
    if (bt === 0) {
      // From one of your ships still afloat (picked at random), else the dock.
      const s = sideOf(0);
      let n = 0;
      for (let i = 0; i < S; i++) n += s.sunk[i] ? 0 : 1;
      let k = (R() * n) | 0, r = ships[0]!;
      for (let i = 0; i < S; i++) if (!s.sunk[i] && k-- === 0) r = ships[i]!;
      (shell.a[0] = r.M[9]!), (shell.a[1] = r.M[10]! + 0.75), (shell.a[2] = r.M[11]!);
    } else (shell.a[0] = FORT.x), (shell.a[1] = PT + 1.3), (shell.a[2] = FORT.z);
    cellWorld(1 - bt, cell, shell.b);
    // The muzzle: a flash and a puff of smoke where it fired from.
    spawn(4, shell.a[0]!, shell.a[1]!, shell.a[2]!, 0, 0, 0, RM ? 0.1 : 0.16, 0.45);
    if (!RM) for (let i = 0; i < 6; i++) spawn(3, shell.a[0]! + (R() - 0.5) * 0.2, shell.a[1]!, shell.a[2]! + (R() - 0.5) * 0.2, (R() - 0.5) * 0.5, 0.5 + R() * 0.5, (R() - 0.5) * 0.5, 1 + R() * 0.6, 0.12 + R() * 0.08);
    const d = Math.hypot(shell.b[0]! - shell.a[0]!, shell.b[2]! - shell.a[2]!);
    shell.dur = (RM ? 0.5 : 0.75 + d * 0.035) * (attract ? 0.75 : 1);
    shell.h = 2 + d * 0.22;
    anim = 1;
    cue(1);
    alive();
    hudDirty = true;
  }
  function stepShell(dt: number) {
    if (!shell.on || freeze) return false;
    shell.t += dt / shell.dur;
    // An online answer not in yet: the shell hangs at the top of its fall over the cell until it is.
    if (!shell.res && shell.t > 0.92) shell.t = 0.92;
    const t = Math.min(1, shell.t), a = shell.a, b = shell.b;
    shell.pos[0] = a[0]! + (b[0]! - a[0]!) * t;
    shell.pos[2] = a[2]! + (b[2]! - a[2]!) * t;
    shell.pos[1] = a[1]! + (b[1]! - a[1]!) * t + 4 * shell.h * t * (1 - t);
    shell.trail.copyWithin(3, 0, 39);
    (shell.trail[0] = shell.pos[0]!), (shell.trail[1] = shell.pos[1]!), (shell.trail[2] = shell.pos[2]!);
    shell.tn = Math.min(14, shell.tn + 1);
    if (!RM && engine.steps & 1) spawn(3, shell.pos[0]!, shell.pos[1]!, shell.pos[2]!, 0, 0.1, 0, 0.45, 0.05);
    if (shell.t >= 1) (shell.on = false), impact(shell.by, shell.cell, shell.res, shell.ship, false);
    return true;
  }
  const CELL = (c: number) => LETTERS[(c / N) | 0]! + ((c % N) + 1);
  const names = () => BAYS[m.bay]!.names;
  /** The side's name as this screen says it. */
  const who = (side: number, cap = false) =>
    local ? `Player ${side + 1}` : attract ? (side ? "Blue" : "Red") : side === 0 ? (cap ? "You" : "you") : mode === "net" ? (cap ? "They" : "they") : cap ? "Enemy" : "the enemy";
  /** A shot lands: the splash or the burst, its peg, a sinking; then the next beat. `quick`: no
   *  beats, no words (the poster's set-up). */
  function impact(bt: number, c: number, res: number, ship: number, quick: boolean) {
    const t = 1 - bt, by = bt ^ v;
    cellWorld(t, c, tmp);
    // The toast goes on the side away from the impact, so it never hides the splash or the fire.
    toastX = dio.project(tmp[0]!, WY, tmp[2]!, tmp2) && tmp2[0]! < dio.width / 2 ? 0.72 : 0.28;
    const mine = bt === 0, nm = names()[ship] ?? "";
    if (res === MISS) {
      quick || (splash(tmp[0]!, tmp[2]!), cue(2), toast("Splash! Miss", 0));
      addPeg(t, c, false, -1);
    } else {
      quick || (burst(tmp[0]!, WY + 0.35, tmp[2]!, res === SUNK), cue(res === SUNK ? 4 : 3));
      addPeg(t, c, true, ship);
      if (res === SUNK) {
        sink(t, ship, quick);
        quick || toast(attract ? `${nm} sunk!` : mine ? `Sunk their ${nm}!` : local ? `Your ${nm} is sunk` : `They sank your ${nm}`, 2);
        const s = sideOf(t);
        for (let k = 0; k < m.fleet[ship]!; k++) burning[t * MAXC + (s.sy[ship]! + (s.dir[ship] ? k : 0)) * N + s.sx[ship]! + (s.dir[ship] ? 0 : k)] = 0;
      } else (burning[t * MAXC + c] = 1), quick || toast(attract ? "Hit!" : mine ? "Hit!" : "You're hit!", 1);
    }
    hudDirty = dirty = true;
    if (quick) return;
    const what = res === MISS ? "miss" : res === HIT ? "hit" : "sunk the " + nm;
    say(`${who(by, true)} fired at ${CELL(c)}: ${what}.`);
    logRow(by, c, res, ship);
    opts.on?.("shot", { by, cell: c, res, ship, name: nm });
    alive();
    if (m.phase === OVER) later(RM ? 1 : 2.4, T_END);
    else nextTurn();
  }
  /** After a shot: the beat, then whoever is next (a bot fires, a person gets the table). */
  function nextTurn() {
    if (local) return later(RM ? 0.6 : 1.4, T_CURTAIN);
    if (ctl[m.turn] === BOT) later(RM ? 0.5 : 0.6, T_VIEW), later(RM ? 0.8 : 1.35, T_BOT);
    else later(RM ? 0.25 : 0.45, T_TURN);
  }
  function addPeg(t: number, c: number, hit: boolean, ship: number) {
    const id = "peg" + pegN++;
    const s = sideOf(t);
    if (hit && ship >= 0 && s.sx[ship]! >= 0) {
      const k = s.dir[ship] ? ((c / N) | 0) - s.sy[ship]! : (c % N) - s.sx[ship]!;
      const root = ships[t * MAXS + ship]!, x = k - (m.fleet[ship]! - 1) / 2;
      // A scorch on the deck (a far ship's shows with its hull, when it sinks).
      const sc = put({ shape: "cyl", sides: 7, size: [0.62, 0.012, 0.5], on: root.id!, pos: [x, 0.31, 0], rot: [0, k * 1.3, 0], color: "scorch", alpha: 0.8, layer: 4, below: BELOW, hidden: t === 1 && !s.sunk[ship], pick: false });
      parts[t * MAXS + ship]!.push(sc);
      put({ id, shape: "cyl", sides: 6, size: [0.12, 0.42, 0.12], on: root.id!, pos: [x, 0.26, 0], color: "pegHit", layer: 5, below: BELOW, pick: false });
    } else {
      cellLocal(c % N, (c / N) | 0, tmp2);
      put({ id, shape: "cyl", sides: 6, size: [0.12, hit ? 0.42 : 0.3, 0.12], on: "water" + t, pos: [tmp2[0]!, 0, tmp2[2]!], color: hit ? "pegHit" : "pegMiss", layer: 5, pick: false });
    }
    put({ shape: "cyl", sides: 8, size: [0.24, 0.16, 0.24], on: id, color: hit ? "pegHit" : "pegMiss", layer: 5, below: BELOW, pick: false });
  }
  /** Roll it over and down to the bottom (a far ship shows itself as it goes). */
  function sink(t: number, i: number, quick: boolean) {
    const k = t * MAXS + i, root = ships[k]!;
    if (t === 1) {
      syncShip(1, i);
      for (const ob of parts[k]!) ob.hidden = false;
      root.alpha = 0;
      root.shadow = 0.22;
    }
    sinkT[k] = quick ? 99 : 0;
    if (quick) return sinkPose(k, 1);
    // A whirlpool where it goes down (drawn on the water while it sinks) and its rings.
    if (!RM) (shake = 1), (shakeA = 11), ring(root.M[9]!, root.M[11]!, 1.6, 1.8, 0.3), ring(root.M[9]!, root.M[11]!, 2.8, 2.4, 0.9);
  }
  const SINK = RM ? 1 : 2.6;
  function sinkPose(k: number, u: number) {
    const r = ships[k]!, e = u * u * (3 - 2 * u);
    if (k >= MAXS) r.alpha = Math.min(1, sinkT[k]! / 0.35);
    r.rot[0] = 0.55 * e;
    r.rot[2] = 0.28 * Math.min(1, u * 1.6);
    // It lists, goes down by the bow, and settles on the bottom with a small bump.
    r.pos[1] = -0.5 * e * e + (u > 0.8 ? Math.sin((u - 0.8) * 5 * Math.PI) * 0.04 : 0);
  }
  function stepSink(dt: number) {
    let on = false;
    for (let k = 0; k < MAXS * 2; k++) {
      if (sinkT[k]! < 0 || sinkT[k]! >= SINK) continue;
      sinkT[k] = Math.min(SINK, sinkT[k]! + dt);
      const u = sinkT[k]! / SINK, r = ships[k]!;
      sinkPose(k, u);
      if (!RM && u < 0.9) {
        // Spray off the hull while it rolls, then bubbles breaking on the surface over it.
        const Lh = m.fleet[k % MAXS]! * 0.5, a = (fxRnd() - 0.5) * 2 * Lh, ca = r.M[0]!, sa = r.M[6]!;
        if (u < 0.45 && fxRnd() < 0.3) spawn(0, r.M[9]! + ca * a, WY + 0.02, r.M[11]! + sa * a, (fxRnd() - 0.5) * 0.6, 0.9 + fxRnd(), (fxRnd() - 0.5) * 0.6, 0.6, 0.05);
        if (fxRnd() < 0.45) spawn(8, r.M[9]! + ca * a + (fxRnd() - 0.5) * 0.5, WY + 0.015, r.M[11]! + sa * a + (fxRnd() - 0.5) * 0.5, 0, 0, 0, 0.35 + fxRnd() * 0.5, 0.03 + fxRnd() * 0.05);
      }
      if (u >= 1) r.alpha = 1;
      on = true;
    }
    return on;
  }
  /** The bot's shot, for whichever side it plays. */
  function botFire() {
    const by = m.turn;
    if (m.phase !== BATTLE || ctl[by] !== BOT || paused) return;
    const lv = attract ? (by ? HARD : NORMAL) : level, c = botPick(m, by, botRnd, lv), res = fire(m, by, c % N, (c / N) | 0);
    if (res) launch(by ^ v, c, res, m.ship);
  }
  /** A person on this screen fires at cell c of the far tray. */
  function playerFire(c: number) {
    const by = v;
    if (m.phase !== BATTLE || m.turn !== by || ctl[by] !== HUMAN || anim || paused || !curtain.hidden) return;
    if (sideOf(1).shots[c]) return void ((flash = 0.5), (flashCell = MAXC + c), cue(6), refresh());
    if (ctl[1 - by] === REMOTE) {
      // Online: the answer comes from their screen. The shell flies now and waits for it.
      if (!legal(m, by, c % N, (c / N) | 0)) return;
      waitingFor = c + 1;
      link!.fire(c);
      return launch(0, c, 0, -1);
    }
    const res = fire(m, by, c % N, (c / N) | 0);
    if (res) launch(0, c, res, m.ship);
  }

  // ---- online: the other screen's messages, in order, in the step ----
  function inboxStep() {
    let i = 0;
    for (; i < inbox.length; i += 3) {
      const op = inbox[i]!, a = inbox[i + 1]!, b = inbox[i + 2]!;
      // Their shot waits until our own shell and its beat are done (and the battle has begun).
      if (op === OP_FIRE && (anim || m.phase !== BATTLE || m.turn !== 1)) break;
      if (op === OP_COMMIT) {
        net.theirs = a;
        tryBegin();
      } else if (op === OP_FIRE) {
        const res = fire(m, 1, a % N, (a / N) | 0);
        if (!res) continue;
        link!.answer(a, res, m.ship, res === SUNK ? packShip(m.sides[0]!, m.ship) : 0);
        launch(1, a, res, m.ship);
      } else if (op === OP_ANSWER) {
        // a: cell | res << 8 | ship << 10; b: the sunk ship's place.
        const c = a & 255, res = (a >> 8) & 3, ship = (a >> 10) & 7;
        if (!waitingFor || c !== waitingFor - 1) continue;
        if (res === SUNK) place(m, 1, ship, b & 15, (b >> 4) & 15, (b >> 8) & 1, true);
        const r = record(m, 0, c % N, (c / N) | 0, res, ship);
        waitingFor = 0;
        if (!r) continue;
        if (shell.on && shell.cell === c) (shell.res = r), (shell.ship = m.ship);
        else impact(0, c, r, m.ship, false);
      } else if (op === OP_REVEAL) {
        // a: ship index; b: its place.
        if (a < S) place(m, 1, a, b & 15, (b >> 4) & 15, (b >> 8) & 1, true), (net.got |= 1 << a);
        settleReveal();
      } else if (op === OP_SALT) {
        net.tsalt = a >>> 0;
        settleReveal();
      } else if (op === OP_REMATCH) {
        net.rematch |= 2;
        if (net.rematch === 3) nextRound();
        else hudDirty = true;
      } else if (op === OP_CONCEDE || op === OP_LEFT) {
        net.gone = op === OP_LEFT ? 2 : 1;
        if (m.phase !== OVER) concede(m, 1), endNow();
        else hudDirty = true;
      } else if (op === OP_AWAY || op === OP_BACK) {
        net.away = op === OP_AWAY;
        hudDirty = true;
      }
    }
    if (i) inbox.splice(0, i);
  }
  /** Online: both fleets committed (theirs heard, ours sent): the battle begins. */
  function tryBegin() {
    if (net.mine < 0 || net.theirs < 0 || m.phase !== PLACE) return;
    begin(m, ((round & 1) === link!.seat) ? 0 : 1, true);
    sel = hover = -1;
    syncGhost();
    cue(7);
    turnBegins();
    opts.on?.("phase", m.phase);
  }
  /** Online, at the end: their whole fleet is in; check it against their commit and their answers. */
  function settleReveal() {
    if (m.phase !== OVER || net.tsalt < 0 || net.got !== (1 << S) - 1) return;
    check = verify(m, 1, net.tsalt, net.theirs);
    for (let i = 0; i < S; i++) if (!m.sides[1]!.sunk[i]) syncShip(1, i), showFar(i);
    hudDirty = dirty = true;
    engine.wake();
  }
  function sendReveal() {
    if (!link || net.mine < 0) return;
    const s = m.sides[0]!, packed = net.them;
    for (let i = 0; i < S; i++) packed[i] = packShip(s, i);
    link.reveal(packed, S, net.salt);
  }

  // ---- placement ----
  function selectShip(i: number) {
    if (m.phase !== PLACE || i >= S || net.mine >= 0 || !curtain.hidden) return;
    const s = sideOf(0);
    if (s.sx[i]! >= 0) (pdir[i] = s.dir[i]!), unplace(m, v, i);
    sel = i;
    syncGhost();
  }
  function tryPlace(c: number) {
    if (sel < 0 || m.phase !== PLACE || net.mine >= 0) return;
    const a = anchorFor(sel, c, pdir[sel]!);
    if (place(m, v, sel, a[0]!, a[1]!, pdir[sel]!)) {
      drops[sel] = RM ? 0 : 1;
      cue(5);
      let nxt = -1;
      for (let i = S - 1; i >= 0; i--) if (sideOf(0).sx[i]! < 0) nxt = i;
      sel = nxt;
      if (!picked) hover = -1;
      syncGhost();
    } else (flash = 0.6), (flashCell = c), (hover = c), cue(6), syncGhost();
  }
  function rotate() {
    if (m.phase !== PLACE || sel < 0) return;
    pdir[sel] = pdir[sel]! ^ 1;
    syncGhost();
  }
  function randomize() {
    if (m.phase !== PLACE || net.mine >= 0 || attract) return;
    randomFleet(m, v, seeded(seed * 13 + ++randN + v * 977));
    sel = hover = -1;
    for (let i = 0; i < S; i++) drops[i] = RM ? 0 : 1 + i * 0.25;
    cue(5);
    syncGhost();
  }
  function startBattle() {
    if (m.phase !== PLACE || !ready(m, v) || !curtain.hidden || attract) return;
    sel = hover = -1;
    if (local && v === 0) {
      // Player 1's fleet is out: hand over for Player 2's.
      syncGhost();
      return showCurtain(1, "Pass to Player 2", "Player 1's fleet is in. Player 2: place yours.");
    }
    if (mode === "net") {
      if (net.mine >= 0) return;
      net.salt = (crypto.getRandomValues(new Uint32Array(1))[0]! & 0xffffff) | 1;
      net.mine = commit(m, 0, net.salt);
      link!.commit(net.mine);
      syncGhost();
      showBanner("Fleet locked in", 0);
      return tryBegin();
    }
    if (!begin(m, local ? 0 : round & 1)) return;
    cursor = ((N / 2) | 0) * N + ((N / 2) | 0) - 1;
    syncGhost();
    cue(7);
    if (local) return showCurtain(m.turn, `Pass to Player ${m.turn + 1}`, `Both fleets are in. Player ${m.turn + 1} fires first.`);
    turnBegins();
    opts.on?.("phase", m.phase);
  }
  /** A turn starts on this screen: the camera, the banner, and a bot's shot if it's the bot's. */
  function turnBegins() {
    setView(-1, false);
    const t = m.turn;
    if (m.phase !== BATTLE) return;
    const yours = ctl[t] === HUMAN;
    showBanner(local ? `Player ${t + 1}: fire!` : yours ? "Your turn" : mode === "net" ? "Their turn" : "Enemy turn", yours ? 1 : 2);
    if (ctl[t] === BOT) later(RM ? 0.6 : 1.2, T_BOT);
    opts.on?.("turn", t);
    hudDirty = true;
  }

  // ---- pass and play: the curtain ----
  // `next`: the model side that gets the table when READY is pressed.
  let curtainNext = 0;
  function showCurtain(next: number, title: string, text: string) {
    curtainNext = next;
    (curtain.children[1] as HTMLElement).textContent = title;
    (curtain.children[2] as HTMLElement).textContent = text;
    readyK.textContent = `PLAYER ${next + 1}: READY`;
    curtain.hidden = false;
    stage.classList.add("sb-curtained");
    hover = -1;
    refresh();
    readyK.focus({ preventScroll: true });
  }
  function lift() {
    if (curtain.hidden) return;
    curtain.hidden = true;
    stage.classList.remove("sb-curtained");
    if (v !== curtainNext) (v = curtainNext), restore();
    sel = m.phase === PLACE && !ready(m, v) ? 0 : -1;
    for (let i = 0; i < S; i++) syncShip(0, i), syncShip(1, i);
    setView(-1, true);
    if (m.phase === PLACE) showBanner(`Player ${v + 1}: place your fleet`, 0);
    else turnBegins();
    refresh();
    alive();
    play.focus({ preventScroll: true });
  }

  // ---- the end ----
  /** Stats on this device (per mode, level and bay): games, wins, best accuracy, fewest shots to win. */
  const STORE = "salvo-bay:stats";
  type Stat = { g: number; w: number; acc: number; few: number };
  function stats(win: boolean, shots: number, acc: number): Stat | null {
    if (attract || local) return null;
    const k = `${mode}${mode === "bot" ? level : ""}-${m.bay}`;
    let all: Record<string, Stat> = {};
    try {
      all = JSON.parse(localStorage.getItem(STORE) || "{}") || {};
    } catch {}
    const s = all[k] ?? { g: 0, w: 0, acc: 0, few: 0 };
    s.g++;
    if (win) (s.w++, (s.few = s.few ? Math.min(s.few, shots) : shots));
    s.acc = Math.max(s.acc, acc);
    all[k] = s;
    try {
      localStorage.setItem(STORE, JSON.stringify(all));
    } catch {}
    return s;
  }
  function endNow() {
    hudDirty = true;
    later(RM ? 0.4 : 1, T_END);
  }
  function showEnd() {
    if (overDone) return;
    overDone = true;
    clockSync();
    const w = m.winner, me = local ? w : v, win = w === me, s = m.sides[me]!, acc = s.n[0] ? Math.round((s.n[1]! / s.n[0]!) * 100) : 0;
    const LB = ["Easy", "Normal", "Hard"][level]!, bayName = BAYS[m.bay]!.name;
    (card.children[0] as HTMLElement).textContent = "GAME OVER · " + (local ? "PASS AND PLAY" : mode === "net" ? "ONLINE" : attract ? "DEMO" : `VS THE BOT · ${LB.toUpperCase()}`) + " · " + bayName.toUpperCase();
    card.firstElementChild!.nextElementSibling!.textContent = local ? `Player ${w + 1} wins!` : attract ? `${who(w, true)} wins` : win ? "Victory!" : "Defeat";
    const left = shipsLeft(m, w);
    const struck = shipsLeft(m, 1 - w) > 0;
    card.children[2]!.textContent = net.gone
      ? net.gone === 2 ? "The other player left the match." : "The other player gave up."
      : struck ? (local ? `Player ${2 - w} struck their colours.` : win ? "They struck their colours: the bay is yours." : "You struck your colours. The bay is theirs.")
      : local ? `Every one of Player ${2 - w}'s ships is on the bottom. ${left} of Player ${w + 1}'s still afloat.`
      : win ? `Every enemy ship is resting on the bottom. ${left} of yours still afloat.` : `They sank your fleet. ${left} of theirs still afloat.`;
    const t = elapsed(), mm = (t / 60) | 0, ss = (t % 60) | 0;
    const rows: [string, string][] = local
      ? [["P1 shots", "" + m.sides[0]!.n[0]], ["P1 accuracy", pct(0) + "%"], ["P2 shots", "" + m.sides[1]!.n[0]], ["P2 accuracy", pct(1) + "%"], ["Time", `${mm}:${ss < 10 ? "0" : ""}${ss}`]]
      : [["Shots", "" + s.n[0]], ["Hits", "" + s.n[1]], ["Accuracy", acc + "%"], ["Best streak", "" + s.n[2]], ["Ships left", "" + shipsLeft(m, me)], ["Time", `${mm}:${ss < 10 ? "0" : ""}${ss}`]];
    (card.children[3] as HTMLElement).innerHTML = rows.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join("");
    const st = stats(win, s.n[0]!, acc);
    (card.children[4] as HTMLElement).textContent = st ? `${bayName} ${mode === "bot" ? "vs " + LB : "online"}: ${st.w} of ${st.g} won · best accuracy ${st.acc}%${st.few ? ` · fewest shots to win ${st.few}` : ""}` : "";
    // A loss (or the end of an online match, once their fleet is in) shows where their fleet was.
    if (mode !== "net") for (let i = 0; i < S; i++) if (!sideOf(1).sunk[i]) showFar(i);
    if (mode === "net") sendReveal();
    again.textContent = "REMATCH";
    card.hidden = false;
    anim = 0;
    cue(win || local ? 8 : 9);
    setView(-1, false);
    refresh();
    alive();
    if (!attract) again.focus({ preventScroll: true });
    opts.on?.("over", { winner: w, win, shots: s.n[0], hits: s.n[1], acc, streak: s.n[2], time: t });
    if (attract && opts.loop) later(4, T_AGAIN);
    settleReveal();
  }
  const pct = (p: number) => (m.sides[p]!.n[0] ? Math.round((m.sides[p]!.n[1]! / m.sides[p]!.n[0]!) * 100) : 0);
  /** A far ship still afloat at the end: shown, faded, where it was. */
  function showFar(i: number) {
    const k = MAXS + i;
    if (sideOf(1).sx[i]! < 0 || sinkT[k]! >= 0) return;
    syncShip(1, i);
    for (const ob of parts[k]!) ob.hidden = false;
    ships[k]!.alpha = 0.75;
  }
  /** REMATCH: the same seats, a new seed; who fires first alternates. Online, both screens must ask. */
  function rematch() {
    if (m.phase !== OVER) return;
    if (mode === "net") {
      if (net.gone || net.rematch & 1) return;
      net.rematch |= 1;
      link!.rematch();
      again.textContent = net.rematch === 3 ? "REMATCH" : "WAITING…";
      if (net.rematch === 3) nextRound();
      return;
    }
    nextRound();
  }
  function nextRound() {
    round++;
    reset(seed + 0x9e3779b1, m.bay);
    opts.on?.("rematch", round);
    if (!attract) play.focus({ preventScroll: true });
  }

  // ---- pause ----
  function setPaused(on: boolean) {
    if (attract || on === paused || m.phase === OVER || (on && !curtain.hidden)) return;
    paused = on;
    clockSync();
    pauseCard.hidden = !on;
    (pauseCard.querySelector(".sb-giveup") as HTMLElement).hidden = local || m.phase !== BATTLE;
    hudDirty = dirty = true;
    opts.on?.("pause", on);
    if (on) {
      // One more frame for the card, then the engine stops (the table holds still).
      engine.wake();
      later(0.05, T_RESULT);
      (pauseCard.querySelector(".sb-resume") as HTMLElement).focus({ preventScroll: true });
    } else engine.start(), alive(), play.focus({ preventScroll: true });
  }
  function giveUp() {
    if (m.phase !== BATTLE) return;
    setPaused(false);
    if (mode === "net") link!.concede();
    concede(m, v);
    endNow();
  }

  // ---- the banner ----
  function showBanner(text: string, k: number) {
    if (attract) return;
    (banner = text), (bannerK = k), (bannerOn = true);
    hudDirty = true;
    for (let i = 0; i < 10; i++) if (TF[i] === T_BANNER) TF[i] = 0;
    later(RM ? 1.6 : 1.5, T_BANNER);
  }
  // ---- the shot log: rows wait for the render, newest first, at most 40 ----
  const logRows: string[] = [];
  let logDirty = false;
  function logRow(by: number, c: number, res: number, ship: number) {
    const tone = local ? (by ? "sb-l2" : "sb-l1") : by === 0 ? "sb-l1" : "sb-l2";
    const r = res === MISS ? "miss" : res === HIT ? "HIT" : `SUNK · ${names()[ship]}`;
    logRows.push(`<li class="${tone}${res > MISS ? " sb-lhit" : ""}"><i></i><span>${local ? `P${by + 1}` : who(by, true)}</span><b>${CELL(c)}</b><em>${r}</em></li>`);
    if (logRows.length > 40) logRows.shift();
    logDirty = true;
  }

  // ---- views ----
  const goal = { yaw: 0, pitch: 0, dist: 30, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0, fov: 0.62 };
  let limits = { yaw: [-2, 2], pitch: [25 * D, 65 * D], dist: [5, 200] }, tweening = false;
  const portrait = () => dio.width / dio.height < 0.95;
  function effView() {
    if (view) return view;
    if (!curtain.hidden) return 1;
    if (!portrait() || RM) return m.phase === PLACE && portrait() ? 2 : 1;
    if (m.phase === PLACE) return 2;
    if (m.phase === OVER) return 1;
    return m.turn === v && !shell.on ? 3 : shell.on ? (shell.by === 0 ? 3 : 2) : 2;
  }
  /** Aim the camera for the view (v ≥ 0 picks one; −1 keeps it): framed inside the safe area (under
   *  the stickers, over the keys), then tweened there (snap: at once). */
  function setView(nv: number, snap: boolean) {
    if (nv >= 0) view = nv;
    const ev = effView(), port = portrait(), g = goal, W = dio.width, Hh = dio.height;
    const X = TX[1]! + H, Zb = TZ - H, Zf = DOCK.z + 1.6;
    let pts: number[];
    if (ev === 1) {
      (g.yaw = (port ? -58 : -24) * D), (g.pitch = (port ? 52 : 50) * D), (g.tx = 0), (g.ty = PT), (g.tz = port ? 0 : 0.4);
      pts = port ? [-X - 0.6, WY, Zb - 0.6, X + 0.6, WY, Zb - 0.6, -X - 0.6, PT, Zf, X + 0.6, PT, Zf, -X - 0.6, WY, TZ + H + 0.5, X + 0.6, WY + 0.6, Zb - 0.6] : [-X - 0.8, WY + 0.4, Zb - 0.7, X + 0.8, WY + 0.4, Zb - 0.7, -X - 0.8, PT, Zf, X + 0.9, PT, Zf, LH.x, PT + 4.6, LH.z];
    } else {
      const s = ev === 2 ? 0 : 1, x = TX[s]!, dock = s === 0 && m.phase === PLACE, e = H + 0.4;
      (g.yaw = (port ? -20 : -24) * D), (g.pitch = (port ? 58 : 54) * D), (g.tx = x), (g.ty = WY), (g.tz = TZ + (dock ? 2.6 : 0));
      pts = [x - e, PT, TZ - e, x + e, PT, TZ - e, x - e, PT, TZ + e, x + e, PT, TZ + e, x - e, WY + 0.8, TZ - e, x + e, WY + 0.8, TZ - e];
      if (dock) pts.push(DOCK.x - H - 0.8, PT, DOCK.z + 1.6, DOCK.x + H + 0.8, PT, DOCK.z + 1.6);
    }
    const ins = opts.inset?.() ?? [0, 0];
    dio.fit(g, pts, { x0: 8 + ins[0] * W, x1: W - 8 - logInset(), y0: V[3]! + ins[1] * Hh, y1: Math.max(V[3]! + ins[1] * Hh + 80, Hh - V[4]!) });
    limits = { yaw: [g.yaw - 50 * D, g.yaw + 50 * D], pitch: [25 * D, 65 * D], dist: [g.dist * 0.55, g.dist * 1.6] };
    if (snap || RM) Object.assign(dio.cam, g), (tweening = false);
    else tweening = true;
    hudDirty = dirty = true;
    engine.wake();
  }
  // The open log takes the stage's right edge on a wide stage: the camera frames the bays left of it.
  let logW = 0;
  const logInset = () => (logOpen && !attract && m.phase !== PLACE && logW > 0 && dio.width > 900 ? logW + 12 : 0);
  function cycleView() {
    setView((view + 1) % 4, false);
  }
  const CAMF = ["yaw", "pitch", "dist", "tx", "ty", "tz", "ox", "oy"] as const;
  function stepCam(dt: number) {
    if (!tweening) return false;
    const c = dio.cam, k = 1 - Math.exp(-dt * 5.5);
    let d = 0;
    for (let i = 0; i < 8; i++) {
      const f = CAMF[i]!;
      c[f] += (goal[f] - c[f]) * k;
      d = Math.max(d, Math.abs(goal[f] - c[f]) / (i > 5 ? 40 : i < 2 ? 0.05 : 1));
    }
    if (d < 0.01) Object.assign(c, goal), (tweening = false);
    return true;
  }

  // ---- decals (inside a tray, just over the water) and the overlay (labels, toast, the night) ----
  const Q = new Float64Array(8);
  function quad(ctx: CanvasRenderingContext2D, t: number, gx: number, gz: number, inset: number) {
    const x0 = TX[t]! - H + gx + inset, z0 = TZ - H + gz + inset, x1 = x0 + 1 - inset * 2, z1 = z0 + 1 - inset * 2, y = WY + 0.006;
    dio.project(x0, y, z0, tmp), (Q[0] = tmp[0]!), (Q[1] = tmp[1]!);
    dio.project(x1, y, z0, tmp), (Q[2] = tmp[0]!), (Q[3] = tmp[1]!);
    dio.project(x1, y, z1, tmp), (Q[4] = tmp[0]!), (Q[5] = tmp[1]!);
    dio.project(x0, y, z1, tmp), (Q[6] = tmp[0]!), (Q[7] = tmp[1]!);
    ctx.beginPath();
    ctx.moveTo(Q[0]!, Q[1]!), ctx.lineTo(Q[2]!, Q[3]!), ctx.lineTo(Q[4]!, Q[5]!), ctx.lineTo(Q[6]!, Q[7]!);
    ctx.closePath();
  }
  const FLASH = ["rgba(239,80,80,0.1)", "rgba(239,80,80,0.2)", "rgba(239,80,80,0.3)", "rgba(239,80,80,0.4)", "rgba(239,80,80,0.5)", "rgba(239,80,80,0.6)"];
  /** A point on the water (world x, z kept inside the bay) to the path. */
  function wp(ctx: CanvasRenderingContext2D, x: number, z: number, x0: number, z0: number, first: boolean) {
    const w = 2 * H;
    dio.project(Math.max(x0, Math.min(x0 + w, x)), WY + 0.005, Math.max(z0, Math.min(z0 + w, z)), tmp);
    first ? ctx.moveTo(tmp[0]!, tmp[1]!) : ctx.lineTo(tmp[0]!, tmp[1]!);
  }
  /** The same, from the water's own 8 × 8 pattern space (u, w in 0..8), stretched over the bay. */
  const wq = (ctx: CanvasRenderingContext2D, u: number, w: number, x0: number, z0: number, first: boolean) => wp(ctx, x0 + u * (H / 4), z0 + w * (H / 4), x0, z0, first);
  /** The water: wave crests rolling across, a slow sheen, foam lapping at the walls and the bow
   *  waves of your ships, and at night the lighthouse's beam crossing the bay. It moves with the
   *  clock of the bob (tAmb), so it stops when the scene settles, and stays still with reduced motion. */
  function water(ctx: CanvasRenderingContext2D, t: number, x0: number, z0: number, y: number) {
    const tt = tAmb + t * 3.1, wa = P.wa, w = 2 * H;
    ctx.fillStyle = P.foam;
    // Crests: five wavy bands rolling toward you, fading in at the far wall and out at the near one.
    for (let b = 0; b < 5; b++) {
      const c = (b * 2 + tt * 0.3) % 10 - 1, f = Math.sin(Math.PI * Math.max(0, Math.min(1, (c + 1) / 10)));
      ctx.globalAlpha = wa[0]! * f;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) wq(ctx, k * 0.5, c + Math.sin(k * 0.45 + tt * 1.3 + b * 1.7) * 0.2, x0, z0, !k);
      for (let k = 16; k >= 0; k--) wq(ctx, k * 0.5, c - 0.28 - Math.sin(k * 0.6 - tt * 0.9 + b) * 0.08, x0, z0, false);
      ctx.fill();
    }
    // The sheen: a broad soft band drifting slowly across.
    const sx = ((tt * 0.16 + t * 4) % 12) - 2;
    ctx.globalAlpha = wa[2]!;
    ctx.beginPath();
    wq(ctx, sx, 0, x0, z0, true), wq(ctx, sx + 1.4, 0, x0, z0, false), wq(ctx, sx + 0.2, 8, x0, z0, false), wq(ctx, sx - 1.2, 8, x0, z0, false);
    ctx.fill();
    // Foam on the walls: a ragged white edge that breathes in and out, and a fainter line lapping
    // further in. One path round the bay (S runs 0..32 along the four walls).
    ctx.globalAlpha = wa[1]!;
    ctx.beginPath();
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k <= 64; k++) {
        const Sx = k * 0.5, e = Math.min(3, Sx >> 3), s = Sx - e * 8;
        const ww = pass ? 0 : 0.08 + 0.07 * (1 + Math.sin(Sx * 2.3 + tt * 2.1)) * 0.5 + 0.035 * Math.sin(Sx * 0.7 - tt * 1.3);
        const px = e === 0 ? s : e === 1 ? 8 : e === 2 ? 8 - s : 0, pz = e === 0 ? 0 : e === 1 ? s : e === 2 ? 8 : 8 - s;
        const nx = e === 1 ? -1 : e === 3 ? 1 : 0, nz = e === 0 ? 1 : e === 2 ? -1 : 0;
        wp(ctx, x0 + px * (H / 4) + nx * ww, z0 + pz * (H / 4) + nz * ww, x0, z0, !k);
      }
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.strokeStyle = P.foam;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = wa[1]! * (0.25 + 0.2 * Math.sin(tt * 1.7));
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) {
      const Sx = k * 0.5, e = Math.min(3, Sx >> 3), s = Sx - e * 8, ww = 0.3 + 0.1 * Math.sin(tt * 1.7 + Sx * 0.5);
      const px = e === 0 ? s : e === 1 ? 8 : e === 2 ? 8 - s : 0, pz = e === 0 ? 0 : e === 1 ? s : e === 2 ? 8 : 8 - s;
      wp(ctx, x0 + px * (H / 4) + (e === 1 ? -ww : e === 3 ? ww : 0), z0 + pz * (H / 4) + (e === 0 ? ww : e === 2 ? -ww : 0), x0, z0, !k);
    }
    ctx.stroke();
    // Bow waves and the wash astern of your ships (theirs stay hidden: no wakes to give them away).
    if (t === 0)
      for (let i = 0; i < S; i++) {
        const r = ships[i]!;
        if (r.on !== "water0" || sinkT[i]! >= 0 || drops[i]! > 0 || r.alpha < 1) continue;
        const h = m.fleet[i]! / 2 - 0.15, dx = r.M[0]!, dz = r.M[6]!, l = Math.sqrt(dx * dx + dz * dz) || 1, ux = dx / l, uz = dz / l;
        const bx = r.M[9]! + ux * h, bz = r.M[11]! + uz * h, qq = 0.5 + 0.5 * Math.sin(tt * 2.4 + i * 1.9);
        ctx.globalAlpha = wa[1]! * (0.6 + 0.4 * qq);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          wp(ctx, bx + ux * 0.08, bz + uz * 0.08, x0, z0, true);
          wp(ctx, bx - ux * (0.35 + 0.1 * qq) - uz * sgn * (0.3 + 0.08 * qq), bz - uz * (0.35 + 0.1 * qq) + ux * sgn * (0.3 + 0.08 * qq), x0, z0, false);
          wp(ctx, bx - ux * (0.9 + 0.1 * qq) - uz * sgn * (0.48 + 0.1 * qq), bz - uz * (0.9 + 0.1 * qq) + ux * sgn * (0.48 + 0.1 * qq), x0, z0, false);
        }
        const sx2 = r.M[9]! - ux * (h + 0.1), sz2 = r.M[11]! - uz * (h + 0.1);
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          wp(ctx, sx2 - uz * sgn * 0.18, sz2 + ux * sgn * 0.18, x0, z0, true);
          wp(ctx, sx2 - ux * (0.4 + 0.15 * qq) - uz * sgn * 0.26, sz2 - uz * (0.4 + 0.15 * qq) + ux * sgn * 0.26, x0, z0, false);
        }
        ctx.stroke();
      }
    // Night: where the lighthouse's two beams cross the bay, a pale streak on the water.
    if (P.night) {
      const a = RM ? 2.3 : tAmb * 0.7;
      ctx.fillStyle = "#ffe9a0";
      for (let b = 0; b < 2; b++) {
        const ca = Math.cos(a + b * Math.PI), sa = Math.sin(a + b * Math.PI);
        for (let d = 2; d < 17; d += 0.6) {
          const px = LH.x + ca * d, pz = LH.z + sa * d;
          if (px < x0 || px > x0 + w || pz < z0 || pz > z0 + w || !dio.project(px, y, pz, tmp)) continue;
          const f = dio.focal() / tmp[2]!, ww = 0.18 + d * 0.05;
          ctx.globalAlpha = 0.07;
          ctx.beginPath();
          ctx.ellipse(tmp[0]!, tmp[1]!, ww * f, ww * f * 0.5, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  function trayDecals(ctx: CanvasRenderingContext2D, t: number) {
    const y = WY + 0.004, x0 = TX[t]! - H, z0 = TZ - H, sd = sideOf(t), sh = sd.shots, w = 2 * H, C = m.C;
    // A checkerboard for reading the cells, the water's moving light over it, then the grid lines.
    ctx.fillStyle = P.gridShade;
    for (let c = 0; c < C; c++) if (((c % N) + ((c / N) | 0)) & 1) quad(ctx, t, c % N, (c / N) | 0, 0), ctx.fill();
    water(ctx, t, x0, z0, y);
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      dio.project(x0 + i, y, z0, tmp), ctx.moveTo(tmp[0]!, tmp[1]!), dio.project(x0 + i, y, z0 + w, tmp), ctx.lineTo(tmp[0]!, tmp[1]!);
      dio.project(x0, y, z0 + i, tmp), ctx.moveTo(tmp[0]!, tmp[1]!), dio.project(x0 + w, y, z0 + i, tmp), ctx.lineTo(tmp[0]!, tmp[1]!);
    }
    ctx.stroke();
    // Row letters down the left edge and column numbers along the far edge, small, on the water.
    if (!attract && dio.width > 420) {
      ctx.fillStyle = P.night ? "rgba(220,240,255,0.55)" : "rgba(30,60,90,0.5)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < N; i++) {
        if (dio.project(x0 + 0.18, y, z0 + i + 0.5, tmp)) (ctx.font = font(Math.max(8, Math.min(12, Math.round((0.34 * dio.focal()) / tmp[2]!))))), ctx.fillText(LETTERS[i]!, tmp[0]!, tmp[1]!);
        if (dio.project(x0 + i + 0.5, y, z0 + 0.2, tmp)) ctx.fillText("" + (i + 1), tmp[0]!, tmp[1]!);
      }
    }
    // A sunk ship's cells get a dark wash, a hit a warm glow.
    // (Not the cell a shell is still flying at: its result shows when it lands.)
    const inbound = shell.on && t === 1 - shell.by ? shell.cell : -1;
    // A ship that shell will sink still shows as hit until then.
    const g = sd.grid, going = inbound >= 0 && sh[inbound] === SUNK ? g[inbound]! : -2;
    for (let c = 0; c < C; c++) if (sh[c]! >= HIT && c !== inbound) (ctx.fillStyle = sh[c] === SUNK && g[c] !== going ? "rgba(30,40,70,0.22)" : "rgba(255,120,80,0.28)"), quad(ctx, t, c % N, (c / N) | 0, 0.06), ctx.fill();
    // The placement ghost's cells.
    if (t === 0 && m.phase === PLACE && ghost.show) {
      ctx.fillStyle = ghost.ok ? "rgba(255,255,255,0.45)" : "rgba(239,80,80,0.5)";
      for (let k = 0; k < m.fleet[ghost.i]!; k++) quad(ctx, 0, ghost.x + (ghost.dir ? 0 : k), ghost.y + (ghost.dir ? k : 0), 0.05), ctx.fill();
    }
    if (flash > 0 && flashCell >= MAXC === (t === 1)) {
      ctx.fillStyle = FLASH[Math.min(5, (flash * 10) | 0)]!;
      const fc = flashCell % MAXC;
      quad(ctx, t, fc % N, (fc / N) | 0, 0.04);
      ctx.fill();
    }
    // The target reticle (or the keyboard's cursor).
    const aim = m.phase === PLACE ? 0 : 1, cur = hover >= 0 ? hover : kbd ? cursor : -1;
    if (t === aim && cur >= 0 && cur < C && !attract && curtain.hidden && (m.phase === BATTLE ? yourTurn() : m.phase === PLACE)) {
      const bad = m.phase === BATTLE && sh[cur];
      ctx.lineWidth = 3;
      ctx.strokeStyle = bad ? "rgba(120,120,140,0.9)" : m.phase === BATTLE ? "#e5484d" : "#ffffff";
      quad(ctx, t, cur % N, (cur / N) | 0, 0.08);
      ctx.stroke();
      if (m.phase === BATTLE && !bad) {
        cellWorld(1, cur, tmp2);
        dio.project(tmp2[0]!, WY, tmp2[2]!, tmp);
        const r = (0.22 * dio.focal()) / tmp[2]!, x = tmp[0]!, yy = tmp[1]!;
        ctx.beginPath();
        ctx.arc(x, yy, r, 0, TAU);
        ctx.moveTo(x - r * 1.6, yy), ctx.lineTo(x + r * 1.6, yy), ctx.moveTo(x, yy - r * 1.6), ctx.lineTo(x, yy + r * 1.6);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // The incoming shell's shadow on this bay's water.
    if (shell.on && t === 1 - shell.by && dio.project(shell.pos[0]!, WY, shell.pos[2]!, tmp)) {
      const f = dio.focal() / tmp[2]!;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(tmp[0]!, tmp[1]!, 0.16 * f, 0.08 * f, 0, 0, TAU);
      ctx.fill();
    }
    // Rings and the ripples that run out across the cells (eased out, thinning as they go), kept
    // inside the bay.
    ctx.strokeStyle = P.foam;
    for (let i = 0; i < RINGS; i++) {
      const o = i * 5;
      if (rings[o + 4]! <= 0 || rings[o + 3]! < 0 || rings[o]! > 0 !== (t === 1)) continue;
      const u = rings[o + 3]! / rings[o + 4]!, e = 1 - (1 - u) * (1 - u), r = 0.12 + e * rings[o + 2]!, rx = rings[o]!, rz = rings[o + 1]!;
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.lineWidth = 1 + (1 - u) * 2;
      ctx.beginPath();
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * TAU;
        dio.project(Math.max(x0, Math.min(x0 + w, rx + Math.cos(a) * r)), WY + 0.01, Math.max(z0, Math.min(z0 + w, rz + Math.sin(a) * r)), tmp);
        k ? ctx.lineTo(tmp[0]!, tmp[1]!) : ctx.moveTo(tmp[0]!, tmp[1]!);
      }
      ctx.stroke();
    }
    // A whirlpool over each ship going down: three arms turning in, fading as it settles.
    for (let k = t * MAXS; k < t * MAXS + S; k++) {
      const st = sinkT[k]!;
      if (st < 0 || st >= SINK) continue;
      const u = st / SINK, r = ships[k]!, cx = r.M[9]!, cz = r.M[11]!;
      ctx.globalAlpha = Math.min(1, u * 5) * (1 - u) * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a < 3; a++)
        for (let j = 0; j <= 12; j++) {
          const th = (a / 3) * TAU + j * 0.42 + st * 3.2, rr = (1.5 - j * 0.11) * (1 - u * 0.4);
          dio.project(Math.max(x0, Math.min(x0 + w, cx + Math.cos(th) * rr)), WY + 0.012, Math.max(z0, Math.min(z0 + w, cz + Math.sin(th) * rr)), tmp);
          j ? ctx.lineTo(tmp[0]!, tmp[1]!) : ctx.moveTo(tmp[0]!, tmp[1]!);
        }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const yourTurn = () => m.phase === BATTLE && m.turn === v && ctl[v] === HUMAN && !anim && !paused && !!curtain.hidden;
  const FONT = "ui-rounded, \"SF Pro Rounded\", Nunito, system-ui, sans-serif", FONTS: string[] = [], WIDTHS = new Map<string, number>();
  const font = (px: number) => FONTS[px] || (FONTS[px] = `800 ${px}px ${FONT}`);
  const width = (ctx: CanvasRenderingContext2D, text: string, px: number) => {
    const k = text + px;
    let w = WIDTHS.get(k);
    if (w === undefined) WIDTHS.set(k, (w = ctx.measureText(text).width));
    return w;
  };
  /** A sticker label at a point: ink shadow, fill, ink rim, ink text. */
  function sticker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, bg: string, fg: string) {
    ctx.font = font(px);
    const w = width(ctx, text, px) + px, h = px + 10, lx = x - w / 2, ly = y - h / 2;
    ctx.fillStyle = "#1f2433";
    ctx.fillRect(lx + 2, ly + 2, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(lx, ly, w, h);
    ctx.strokeStyle = "#1f2433";
    ctx.lineWidth = 2;
    ctx.strokeRect(lx, ly, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, ly + h / 2 + 0.5);
  }
  function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, z: number, bg: string) {
    if (!dio.project(x, y, z, tmp)) return;
    const px = Math.max(11, Math.min(14, Math.round(((0.5 * dio.focal()) / tmp[2]!) * 1.4)));
    sticker(ctx, text, tmp[0]!, tmp[1]! - (px + 10) / 2, px, bg, "#1f2433");
  }
  const TOAST = ["#fffaf1", "#ffd36b", "#e5484d"];
  let labels = ["YOUR BAY", "ENEMY BAY"];
  function drawOverlay(ctx: CanvasRenderingContext2D) {
    const f = dio.focal();
    if (P.night) {
      // The lighthouse: a glow, and a slow sweeping beam.
      const lamp = dio.get("lamp");
      if (lamp && dio.project(lamp.M[9]!, lamp.M[10]! + 0.28, lamp.M[11]!, tmp)) {
        const lx = tmp[0]!, ly = tmp[1]!, r0 = (1.2 * f) / tmp[2]!;
        ctx.fillStyle = "#ffe9a0";
        for (let i = 3; i > 0; i--) (ctx.globalAlpha = 0.07 * (4 - i)), ctx.beginPath(), ctx.arc(lx, ly, r0 * i * 0.7, 0, TAU), ctx.fill();
        const a = RM ? 2.3 : tAmb * 0.7;
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = "#ffe27a";
        for (let b = 0; b < 2; b++) {
          const ang = a + b * Math.PI;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          for (let s = -0.09; s < 0.1; s += 0.18) dio.project(lamp.M[9]! + Math.cos(ang + s) * 12, lamp.M[10]! - 0.4, lamp.M[11]! + Math.sin(ang + s) * 12, tmp2), ctx.lineTo(tmp2[0]!, tmp2[1]!);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (!curtain.hidden) return;
    label(ctx, labels[0]!, TX[0]!, WY + 0.5, TZ - H - 0.4, "#f08e6f");
    label(ctx, labels[1]!, TX[1]!, WY + 0.5, TZ - H - 0.4, "#8f9dc6");
    // The toast: pops in, holds, drifts up and fades (over the bays, under the stickers).
    if (toastT > 0) {
      const u = 1 - toastT / TOAST_T, s = u < 0.18 ? 0.6 + (u / 0.18) * 0.48 : u < 0.3 ? 1.08 - ((u - 0.18) / 0.12) * 0.08 : 1;
      const px = Math.round(Math.max(20, Math.min(30, dio.width / 26)));
      ctx.font = font(px);
      const half = (width(ctx, toastS, px) + px) * 0.6 + 10, tx = Math.max(half, Math.min(dio.width - half, dio.width * toastX));
      ctx.save();
      ctx.globalAlpha = u < 0.18 ? u / 0.18 : u > 0.8 ? (1 - u) / 0.2 : 1;
      ctx.translate(tx, V[3]! + (dio.height - V[3]! - V[4]!) * 0.28 - (u > 0.8 ? (u - 0.8) * 60 : 0));
      ctx.scale(s, s);
      sticker(ctx, toastS, 0, 0, px, TOAST[toastK]!, toastK === 2 ? "#ffffff" : "#1f2433");
      ctx.restore();
    }
  }
  const TOAST_T = RM ? 0.9 : 1;
  function toast(text: string, kind: number) {
    if (attract) return say(text);
    (toastS = text), (toastK = kind), (toastT = TOAST_T);
    say(text);
  }
  function say(t: string) {
    said = t;
    hudDirty = true;
  }

  // ---- the HUD (DOM writes in render, change-only) ----
  const was: (string | number | boolean)[] = [];
  const set = (i: number, x: string | number | boolean) => (was[i] === x ? false : ((was[i] = x), true));
  function hudWrite() {
    const ph = m.phase, yt = yourTurn(), them = 1 - v;
    const waitThem = mode === "net" && ph === PLACE && net.mine >= 0;
    const t = ph === PLACE
      ? waitThem ? "Waiting for their fleet…" : local ? `Player ${v + 1}: place your fleet` : "Place your fleet"
      : ph === OVER ? (local ? `Player ${m.winner + 1} wins` : attract ? `${who(m.winner, true)} wins` : m.winner === v ? "Victory" : "Defeat")
      : yt ? (local ? `Player ${v + 1}: fire!` : "Your turn")
      : shell.on && shell.by === 0 ? (waitingFor ? "Shell away… (their answer)" : "Shell away…")
      : attract ? `${who(m.turn, true)} is aiming…` : local ? `Player ${m.turn + 1}'s turn` : mode === "net" ? (net.away ? "They dropped: reconnecting…" : "They're aiming…") : "Enemy is aiming…";
    if (set(0, t)) turnEl.textContent = t;
    const cls = ph === PLACE ? "sb-chip sb-turn sb-place" : ph === OVER ? "sb-chip sb-turn sb-over" : yt || (shell.on && shell.by === 0) ? "sb-chip sb-turn sb-you" : "sb-chip sb-turn sb-them";
    if (set(1, cls)) turnEl.className = cls;
    const a = shipsLeft(m, v), b = shipsLeft(m, them), n = m.sides[v]!.n[0]!;
    if (set(2, a)) nums[0]!.textContent = "" + a;
    if (set(3, b)) nums[1]!.textContent = "" + b;
    if (set(4, n)) nums[2]!.textContent = "" + n;
    const w0 = local ? `P${v + 1}` : attract ? "Red" : "You", w1 = local ? `P${them + 1}` : attract ? "Blue" : mode === "net" ? "Them" : "Enemy";
    if (set(12, w0 + w1)) (whoEl[0]!.textContent = w0), (whoEl[1]!.textContent = w1), (labels = local ? [`P${v + 1} · YOUR BAY`, `P${them + 1} · TARGET`] : attract ? ["RED BAY", "BLUE BAY"] : ["YOUR BAY", mode === "net" ? "THEIR BAY" : "ENEMY BAY"]);
    const tap = coarse ? "Tap" : "Click";
    const nm = names();
    const hint = ph === PLACE
      ? waitThem ? "Your fleet is locked in. The battle starts when theirs is." : sel >= 0 ? `${tap} a cell in your bay for the ${nm[sel]} (${m.fleet[sel]}). R turns it.` : ready(m, v) ? "Fleet ready: START, or pick a ship to move it." : `${tap} a ship on the dock, or RANDOM.`
      : ph === BATTLE ? (yt ? `${tap} a cell in the ${local ? "target" : "enemy"} bay to fire. Drag to look around.` : "Hold tight…") : "";
    if (set(5, hint)) hintEl.textContent = hint;
    if (set(6, said)) live.textContent = said;
    const pl = ph === PLACE && !waitThem && !attract;
    if (set(7, pl)) rotK!.hidden = rndK!.hidden = goK!.hidden = !pl;
    if (set(8, ready(m, v))) goK!.disabled = !ready(m, v);
    if (set(9, sel < 0)) rotK!.disabled = sel < 0;
    const vl = VIEWS[view]!.toUpperCase();
    if (set(10, vl)) (viewName.textContent = vl), viewK!.setAttribute("aria-label", `Camera view: ${VIEWS[view]} (V)`);
    if (set(11, yt)) play.classList.toggle("sb-aim", yt);
    // The banner: slides in, holds, slides out (CSS); its text and tone.
    if (set(13, banner)) (bannerEl.firstChild as HTMLElement).textContent = banner;
    const bc = "sb-banner" + (bannerOn ? " sb-on" : "") + " sb-b" + bannerK;
    if (set(14, bc)) bannerEl.className = bc;
    // The log: its rows (newest first) and whether it is open.
    if (logDirty) (logDirty = false), (logList.innerHTML = logRows.slice().reverse().join(""));
    const lo = logOpen && ph !== PLACE && !attract;
    if (set(15, lo)) logEl.classList.toggle("sb-open", lo), logK!.setAttribute("aria-pressed", "" + lo), (logM = 1);
    if (set(16, ph === PLACE || attract)) logK!.hidden = ph === PLACE || attract;
    // Online: who still has to ask for the rematch.
    const rk = mode === "net" ? (net.gone ? "NEW MATCH" : net.rematch === 1 ? "WAITING…" : net.rematch === 2 ? "REMATCH ✓" : "REMATCH") : "REMATCH";
    if (set(17, rk)) again.textContent = rk;
    const ck = mode !== "net" || m.phase !== OVER ? "" : check < 0 ? "Checking their fleet against the shots…" : check === 0 ? "✓ Their fleet matches every answer they gave." : check === 1 ? "✗ Their fleet doesn't match what they locked in." : "✗ Their answers don't fit their fleet.";
    if (set(19, ck)) (card.querySelector(".sb-check") as HTMLElement).textContent = ck;
    if (set(20, S)) play.setAttribute("aria-label", "Salvo Bay: arrows move the cursor, Enter or Space places or fires, R turns a ship, 1 to " + S + " pick one, X random fleet, S start, V view, L log, P pause (M mutes)");
  }

  // ---- the frame ----
  // Bob: each ship afloat rocks on its own phase; the selected ship on the dock lifts and floats.
  function bob(dt: number) {
    tAmb += dt;
    for (let s = 0; s < 2; s++)
      for (let i = 0; i < S; i++) {
        const k = s * MAXS + i, r = ships[k]!;
        if (sinkT[k]! >= 0 || r.on !== "water" + s || (s === 0 && drops[i]! > 0)) continue;
        const ph = i * 1.7 + s * 0.9;
        r.rot[0] = Math.sin(tAmb * 1.6 + ph) * 0.035;
        r.rot[2] = Math.sin(tAmb * 1.1 + ph) * 0.02;
        if (!(m.phase === PLACE && ghost.show && ghost.i === i && s === 0)) r.pos[1] = Math.sin(tAmb * 1.3 + ph) * 0.025;
      }
    const lead = sel >= 0 ? ships[sel]! : null;
    if (m.phase === PLACE && lead && lead.on === "dock") lead.pos[1] = 0.46 + Math.sin(tAmb * 3) * 0.05;
    // Fires smoulder on the hit cells.
    if (!RM && engine.steps % 5 === 0)
      for (let k = 0; k < MAXC * 2; k++) {
        if (!burning[k] || fxRnd() > 0.5) continue;
        cellWorld((k / MAXC) | 0, k % MAXC, tmp);
        spawn(3, tmp[0]! + (fxRnd() - 0.5) * 0.3, WY + 0.5, tmp[2]! + (fxRnd() - 0.5) * 0.3, 0.12, 0.45 + fxRnd() * 0.35, -0.06, 1.8 + fxRnd(), 0.08 + fxRnd() * 0.05);
        if (fxRnd() < 0.5) spawn(2, tmp[0]! + (fxRnd() - 0.5) * 0.25, WY + 0.38, tmp[2]! + (fxRnd() - 0.5) * 0.25, 0, 0.5 + fxRnd() * 0.4, 0, 0.35 + fxRnd() * 0.25, 0.08 + fxRnd() * 0.06);
      }
  }
  engine.add({
    read() {
      if (V[1]) {
        V[1] = 0;
        const next = theme() ? LIGHT : DARK;
        if (next !== P) {
          P = next;
          dio.setLight(P.light, P.amb);
          for (let i = 0; i < keyed.length; i++) keyed[i]!.color = P[keyName[i]!];
          for (let i = 0; i < S; i++) syncShip(0, i);
          dirty = true;
        }
      }
      if (logM && !V[0]) (logM = 0), (logW = logEl.getBoundingClientRect().width), setView(-1, false);
      if (V[0]) {
        V[0] = 0;
        const sr = stage.getBoundingClientRect(), hr = head.getBoundingClientRect(), kr = viewK!.getBoundingClientRect();
        logW = logEl.getBoundingClientRect().width;
        // The backing store: the device's pixels, but at most about 1.6 million of them (a big stage on
        // a 2× screen, or a full-screen desktop window, would otherwise fill 3 to 7 million a frame).
        const px = (sr.width || 1) * (sr.height || 1), want = Math.min(2, devicePixelRatio || 1) * (V[2] || 1);
        dio.resize(sr.width || 1, sr.height || 1, Math.min(want, Math.max(0.75, Math.sqrt(1.6e6 / px) * 0.85)));
        V[3] = (attract ? 8 : hr.bottom - sr.top + 6);
        // The keys' strip at the bottom (the view key is always there), when the sheet has it there.
        V[4] = attract ? 8 : kr.bottom > sr.bottom - 24 ? sr.bottom - kr.top + 6 : 6;
        setView(-1, true);
      }
    },
    step(e, dt) {
      for (let i = 0; i < ncue; i++) e.events.emit(CUES[cues[i]!]!);
      ncue = 0;
      let moving = false;
      if (inbox.length) inboxStep(), (moving = true);
      for (let k = 0; k < 10; k++) {
        if (!TF[k] || e.time < TT[k]! || (paused && TF[k] !== T_RESULT && TF[k] !== T_BANNER)) continue;
        const w = TF[k];
        TF[k] = 0;
        moving = true;
        if (w === T_VIEW) view || setView(-1, false);
        else if (w === T_BOT) botFire();
        else if (w === T_TURN) (anim = 0), (hudDirty = true), attract ? botFire() : turnBegins();
        else if (w === T_END) showEnd();
        else if (w === T_POSTER) playerFire(posterCell);
        else if (w === T_BANNER) (bannerOn = false), (hudDirty = true);
        else if (w === T_CURTAIN) (anim = 0), showCurtain(m.turn, `Pass to Player ${m.turn + 1}`, lastWords());
        else if (w === T_AGAIN) nextRound();
        else if (w === T_RESULT && paused) e.stop();
      }
      if (paused) return;
      if (stepShell(dt)) moving = true;
      if (stepFx(dt)) moving = true;
      if (stepSink(dt)) moving = true;
      if (stepCam(dt)) moving = true;
      for (let i = 0; i < S; i++) if (drops[i]! > 0) (drops[i] = Math.max(0, drops[i]! - dt * 2.6)), (moving = true);
      if (flash > 0) (flash -= dt), (moving = true);
      if (toastT > 0) (toastT = Math.max(0, toastT - dt)), (moving = true);
      // The water moves only while the scene is alive (a hold from the last thing that happened).
      if (!RM && e.time < aliveT) bob(dt), (dirty = true);
      if (moving) e.busy(), (dirty = true);
    },
    render() {
      for (let i = 0; i < S; i++) {
        const r = ships[i]!;
        if (drops[i]! > 0 && r.on === "water0") r.pos[1] = Math.min(1, drops[i]!) ** 2 * 1.6;
      }
      if (hudDirty) (hudDirty = false), hudWrite();
      if (dirty) {
        dirty = false;
        fxPoints();
        // The shake: the camera's screen shift nudged for this draw only.
        const c = dio.cam, k = shake * shake * shakeA, sx = Math.sin(engine.time * 67) * k, sy = Math.cos(engine.time * 53) * k * 0.7;
        (c.ox += sx), (c.oy += sy);
        dio.draw();
        (c.ox -= sx), (c.oy -= sy), (V[5] = 1);
      }
      if (!shown) (shown = true), stage.classList.add("sb-drawn");

    },
  });
  /** What the curtain says between turns in pass and play: the shot that was just fired. */
  function lastWords() {
    return said ? `${said} Player ${m.turn + 1}: your turn.` : `Player ${m.turn + 1}: your turn.`;
  }

  // ---- input: tap acts, drag orbits, pinch zooms, keys move a cursor ----
  const ptrs = new Map<number, Float64Array>();
  let downX = 0, downY = 0, dragging = false, pinch0 = 0, dist0 = 0;
  const pinch = () => {
    let a: Float64Array | null = null, d = 0;
    for (const p of ptrs.values()) a ? (d = Math.hypot(a[0]! - p[0]!, a[1]! - p[1]!)) : (a = p);
    return d;
  };
  function cellAt(x: number, y: number, t: number) {
    if (!dio.ground(x, y, WY, hit3)) return -1;
    const gx = Math.floor(hit3[0]! - (TX[t]! - H)), gz = Math.floor(hit3[2]! - (TZ - H));
    return gx < 0 || gz < 0 || gx >= N || gz >= N ? -1 : gz * N + gx;
  }
  play.addEventListener("pointerdown", (e) => {
    if (attract) return;
    e.preventDefault();
    play.focus({ preventScroll: true });
    play.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, Float64Array.of(e.offsetX, e.offsetY));
    if (ptrs.size === 1) (downX = e.offsetX), (downY = e.offsetY), (dragging = false);
    else if (ptrs.size === 2) (pinch0 = pinch()), (dist0 = dio.cam.dist), (dragging = true);
    alive();
  }, sig);
  play.addEventListener("pointermove", (e) => {
    const x = e.offsetX, y = e.offsetY, p = ptrs.get(e.pointerId);
    if (!p) return void (e.pointerType === "mouse" && hoverAt(x, y));
    if (ptrs.size === 2) {
      (p[0] = x), (p[1] = y);
      const d = pinch();
      if (pinch0 > 0 && d > 0) (dio.cam.dist = (dist0 * pinch0) / d), dio.clamp(limits), (tweening = false), alive(), refresh();
      return;
    }
    const dx = x - p[0]!, dy = y - p[1]!;
    if (!dragging && Math.hypot(x - downX, y - downY) > 7) (dragging = true), play.classList.add("sb-drag");
    if (dragging) (dio.cam.yaw -= dx * 0.006), (dio.cam.pitch += dy * 0.005), dio.clamp(limits), (tweening = false), alive(), refresh();
    (p[0] = x), (p[1] = y);
  }, sig);
  const end = (e: PointerEvent) => {
    const had = ptrs.delete(e.pointerId);
    play.classList.remove("sb-drag");
    if (!had) return;
    if (!dragging && !ptrs.size && e.type === "pointerup") tap(e.offsetX, e.offsetY, e.pointerType);
    if (!ptrs.size) dragging = false;
  };
  play.addEventListener("pointerup", end, sig);
  // Tabbed in: the keyboard's cursor shows on the bay (it is the focus ring).
  play.addEventListener("focus", () => play.matches(":focus-visible") && ((kbd = true), refresh()), sig);
  play.addEventListener("pointercancel", end, sig);
  play.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && hover >= 0) (hover = -1), (picked = false), m.phase === PLACE ? syncGhost() : refresh();
  }, sig);
  function hoverAt(x: number, y: number) {
    if (m.phase === OVER || attract || paused) return;
    kbd = false;
    const c = cellAt(x, y, m.phase === PLACE ? 0 : 1);
    picked = c >= 0;
    if (c >= 0) cursor = c;
    if (c !== hover) (hover = c), m.phase === PLACE ? syncGhost() : refresh();
    alive();
  }
  function tap(x: number, y: number, type: string) {
    if (m.phase === OVER || attract || paused || !curtain.hidden) return;
    kbd = false;
    alive();
    if (m.phase === PLACE) {
      const ob = dio.root(dio.pick(x, y)), tag = ob?.tag as { side: number; ship: number } | null | undefined;
      if (tag && tag.side === 0 && !(sel === tag.ship && hover >= 0 && cellAt(x, y, 0) >= 0)) {
        selectShip(tag.ship);
        if (type !== "mouse") (hover = -1), syncGhost();
        return;
      }
      const c = cellAt(x, y, 0);
      if (c >= 0 && sel >= 0) (picked = type === "mouse"), (cursor = c), tryPlace(c);
      return;
    }
    const c = cellAt(x, y, 1);
    if (c >= 0) (cursor = c), playerFire(c);
  }
  const MOVE: Record<string, number> = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 3, ArrowDown: 4, a: 1, d: 2, w: 3 };
  stage.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || attract) return;
    const k = e.key.toLowerCase(), onKey = (e.target as Element).closest?.(".gk-bar, .sb-card");
    alive();
    if (k === "escape") {
      if (opts.escape === "recall") return void (e.preventDefault(), opts.recall ? opts.recall() : api.destroy());
      if (opts.escape !== "none") return void (e.preventDefault(), setPaused(!paused));
      return;
    }
    if (k === "p") return void (e.preventDefault(), setPaused(!paused));
    if (paused || !card.hidden || !curtain.hidden) return;
    if (k === "m") return void (e.preventDefault(), toggle());
    if (k === "r") return void (e.preventDefault(), rotate());
    if (k === "x") return void (e.preventDefault(), randomize());
    if (k === "s" && m.phase === PLACE) return void (e.preventDefault(), startBattle());
    if (k === "v") return void (e.preventDefault(), cycleView());
    if (k === "l") return void (e.preventDefault(), toggleLog());
    if (m.phase === PLACE && k >= "1" && k <= "" + S) return void (e.preventDefault(), selectShip(+k - 1));
    const mv = MOVE[e.key] ?? (k === "s" ? 4 : 0);
    if (mv) {
      e.preventDefault();
      kbd = true;
      const x = Math.max(0, Math.min(N - 1, (cursor % N) + (mv === 1 ? -1 : mv === 2 ? 1 : 0))), y = Math.max(0, Math.min(N - 1, ((cursor / N) | 0) + (mv === 3 ? -1 : mv === 4 ? 1 : 0)));
      cursor = hover = y * N + x;
      return void (m.phase === PLACE ? syncGhost() : refresh());
    }
    if ((e.key === "Enter" || e.key === " ") && !onKey) {
      e.preventDefault();
      const c = hover >= 0 ? hover : cursor;
      m.phase === PLACE ? tryPlace(c) : playerFire(c);
    }
  }, sig);
  again.addEventListener("click", () => (mode === "net" && net.gone ? opts.menu?.() : rematch()), sig);
  menuK.addEventListener("click", () => opts.menu?.(), sig);
  readyK.addEventListener("click", lift, sig);
  q<HTMLElement>(".sb-resume").addEventListener("click", () => setPaused(false), sig);
  q<HTMLElement>(".sb-giveup").addEventListener("click", giveUp, sig);
  q<HTMLElement>(".sb-pmenu").addEventListener("click", () => opts.menu?.(), sig);

  // The poster (reduced motion, the hero's still): a few turns in, a ship of theirs gone, one of yours
  // burning, a shell on its way (`fly`: it lands; else it hangs there).
  let posterCell = -1;
  function poster(fly = true) {
    V[2] = fly ? 1 : 0.8;
    V[0] = 1;
    reset(20261113, m.bay);
    if (!attract) randomizeQuiet();
    if (m.phase === PLACE) begin(m, 0);
    m.turn = 0;
    sel = hover = -1;
    view = 1;
    const s1 = m.sides[1]!, s0 = m.sides[0]!, last = m.S - 1;
    // Sink their smallest and hit their biggest; the bot hits your second ship first, then hunts.
    const mine = [cellAt1(s1, last, 0), cellAt1(s1, last, 1), cellAt1(s1, 0, 1), 9, 50, 22];
    for (let k = 0; k < 6; k++) shot(0, mine[k]!), shot(1, k ? botPick(m, 1, botRnd) : cellAt1(s0, 1, 0));
    posterCell = cellAt1(s1, 0, 2);
    while (s1.shots[posterCell]) posterCell = (posterCell + 1) % m.C;
    TF.fill(0);
    if (fly) later(1.1, T_POSTER);
    else {
      // The shell hangs over its target: a frozen frame of the volley.
      launch(0, posterCell, 0, -1);
      shell.t = 0.62;
      stepShell(0);
      (anim = 0), (freeze = true), (fx.fill(0));
    }
    for (let i = 0; i < 2 * S; i++) syncShip((i / S) | 0, i % S);
    setView(-1, true);
    refresh();
  }
  const cellAt1 = (s: { sx: Int8Array; sy: Int8Array; dir: Uint8Array }, i: number, k: number) => (s.sy[i]! + (s.dir[i] ? k : 0)) * N + s.sx[i]! + (s.dir[i] ? 0 : k);
  function shot(by: number, c: number) {
    // A cell already fired at: the next one free (so the turns keep alternating).
    while (m.sides[1 - by]!.shots[c]) c = (c + 1) % m.C;
    const r = fire(m, by, c % N, (c / N) | 0);
    if (r) impact(by, c, r, m.ship, true);
  }
  function randomizeQuiet() {
    randomFleet(m, v, seeded(seed * 13 + 1));
    for (let i = 0; i < S; i++) syncShip(0, i);
  }

  reset(opts.seed ?? (engine.random() * 100000) | 0, opts.bay ?? CLASSIC);
  engine.start();
  const api = {
    engine,
    get m() {
      return m;
    },
    /** For tests and the drop-in: where things are. */
    get state() {
      let sinking = 0;
      for (let k = 0; k < MAXS * 2; k++) if (sinkT[k]! >= 0 && sinkT[k]! < SINK) sinking++;
      return { phase: m.phase, turn: m.turn, v, anim, shell: shell.on, view: VIEWS[view]!, sel, cursor, sinking, card: !card.hidden, curtain: !curtain.hidden, paused, banner: bannerOn ? banner : "", log: logRows.length, waiting: waitingFor > 0, check, round, mode, level, bay: m.bay, elapsed: elapsed() };
    },
    /** The screen point of cell c on tray t (CSS px from the stage's top left), as of the last draw. */
    cellScreen(t: number, c: number): [number, number] {
      cellWorld(t, c, tmp2);
      dio.project(tmp2[0]!, WY, tmp2[2]!, tmp);
      return [tmp[0]!, tmp[1]!];
    },
    /** Where a dock ship is on screen (placement), for tests. */
    shipScreen(i: number): [number, number] {
      const r = ships[i]!;
      dio.project(r.M[9]!, r.M[10]! + 0.2, r.M[11]!, tmp);
      return [tmp[0]!, tmp[1]!];
    },
    poster,
    focus: () => play.focus({ preventScroll: true }),
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    rematch,
    /** Settings for the next match (the play page's menu). */
    newGame(o: { level?: number; bay?: number; seed?: number } = {}) {
      if (o.level != null) level = o.level;
      round = 0;
      engine.start();
      paused = false;
      pauseCard.hidden = true;
      reset(o.seed ?? (engine.random() * 100000) | 0, o.bay ?? m.bay);
    },
    /** End the round now (the audit's finish): the side `win` says wins. */
    finish(win: boolean) {
      if (m.phase === OVER) return;
      concede(m, win ? 1 - v : v);
      showEnd();
    },
    destroy: () => engine.destroy(),
  };
  return api;
}

export { BIG, CLASSIC, HARD, NORMAL };
