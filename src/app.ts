// The /play/ page: the whole game. A menu card over an attract battle (the bots play behind it):
// SOLO against the bot (easy, normal, hard), PASS AND PLAY (two on this screen), or ONLINE (two
// screens, a fizlet-rooms room: invite code, room, JOIN, send the link, the same lobby as Battlefield
// Blitz), on the CLASSIC 8 × 8 bay or the BIG BAY 10 × 10. The last pick is remembered on this
// device; a link can carry it (?mode=solo|local|online&level=easy|normal|hard&bay=classic|big&room=N).
import { mount, type Mode, type SalvoScene } from "./scene";
import { joinRoom, type RoomLink } from "./net";
import { shell } from "./shell";
import { BIG, CLASSIC, NORMAL } from "./model";

export interface PlayOptions {
  /** The fizlet-rooms server (wss://…); ?rooms= overrides it. */
  rooms?: string;
  /** Rooms on the server (default 16). */
  roomCount?: number;
}
type Pick = { mode: "solo" | "local" | "online"; level: number; bay: number };
const KEEP = "salvo-bay:menu";
const LEVELS = ["easy", "normal", "hard"], BAYS = ["classic", "big"];

const keep = {
  get(k: string, s: () => Storage) {
    try {
      return s().getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set(k: string, v: string, s: () => Storage) {
    try {
      s().setItem(k, v);
    } catch {}
  },
};
const tab = () => sessionStorage, device = () => localStorage;

export function play(host: HTMLElement, o: PlayOptions = {}) {
  const box = shell(host), root = box.root;
  const qs = new URLSearchParams(location.search);
  const ws = qs.get("rooms") ?? o.rooms ?? "", http = ws.replace(/^ws/, "http"), ROOMS = o.roomCount ?? 16;
  let pick: Pick = { mode: "solo", level: NORMAL, bay: CLASSIC };
  try {
    const v = JSON.parse(keep.get(KEEP, device) || "null");
    if (v && typeof v === "object") pick = { mode: ["solo", "local", "online"].includes(v.mode) ? v.mode : "solo", level: Math.max(0, Math.min(2, v.level | 0)), bay: v.bay ? BIG : CLASSIC };
  } catch {}
  const qm = qs.get("mode");
  if (qm === "solo" || qm === "local" || qm === "online") pick.mode = qm;
  const ql = LEVELS.indexOf(qs.get("level") ?? "");
  if (ql >= 0) pick.level = ql;
  if (qs.has("bay")) pick.bay = qs.get("bay") === "big" ? BIG : CLASSIC;
  let room = Math.min(ROOMS - 1, Math.max(0, Number(qs.get("room")) | 0));

  root.insertAdjacentHTML(
    "beforeend",
    `<div class="sb-corner"><button type="button" class="bui-key sb-pausek" aria-label="Pause (P)" title="Pause (P)">❚❚</button></div>` +
      `<p class="sb-roomchip" role="status" hidden><i></i><span></span></p>` +
      `<section class="sb-menu-card" aria-labelledby="sb-menu-title">
        <h2 id="sb-menu-title">Salvo Bay<small>A SHIP-HUNTING DUEL ON A TABLETOP</small></h2>
        <div class="sb-pick" role="group" aria-label="Who you play"><span>PLAY</span>
          <div class="sb-seg sb-tall" data-seg="mode">
            <button type="button" class="bui-key" data-v="solo">SOLO<small>vs the bot</small></button>
            <button type="button" class="bui-key" data-v="local">2 PLAYERS<small>pass and play</small></button>
            <button type="button" class="bui-key" data-v="online">ONLINE<small>two screens</small></button>
          </div></div>
        <div class="sb-pick" role="group" aria-label="The bot's level" data-for="solo"><span>BOT <small data-say="level"></small></span>
          <div class="sb-seg" data-seg="level">
            <button type="button" class="bui-key" data-v="0">EASY</button>
            <button type="button" class="bui-key" data-v="1">NORMAL</button>
            <button type="button" class="bui-key" data-v="2">HARD</button>
          </div></div>
        <div class="sb-pick" role="group" aria-label="The bay"><span>BAY <small data-say="bay"></small></span>
          <div class="sb-seg sb-tall" data-seg="bay">
            <button type="button" class="bui-key" data-v="0">CLASSIC<small>8 × 8 · 4 ships</small></button>
            <button type="button" class="bui-key" data-v="1">BIG BAY<small>10 × 10 · 5 ships</small></button>
          </div></div>
        <button type="button" class="bui-key sb-go-key" data-go>PLAY</button>
        <p class="sb-fine" data-say="mode"></p>
      </section>` +
      `<section class="sb-room" aria-labelledby="sb-room-title" data-step="join" hidden>
        <h2 id="sb-room-title">Online<small data-room-sub>TWO SCREENS, ONE BAY</small></h2>
        <form data-for="join" novalidate>
          <div class="sb-pick" style="gap:.7em">
            <label data-invite>INVITE CODE<input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="64" placeholder="SALVO-XXXX-XXXX" /></label>
            <label data-pass hidden>PASS<input name="pass" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="600" placeholder="Paste your pass" /></label>
            <div class="sb-pick"><span>ROOM</span><div class="sb-rooms"><button type="button" class="bui-key" data-room="-1" aria-label="Previous room">−</button><output name="roomShow" aria-live="polite">0</output><button type="button" class="bui-key" data-room="1" aria-label="Next room">+</button></div></div>
            <button type="submit" class="bui-key sb-go-key">JOIN</button>
            <p class="sb-say" role="alert" data-say="join"></p>
            <p class="sb-fine">Both of you: the same code, the same room. Whoever joins first picks the bay. Fleets stay on their own screen until the end, when each is checked against every answer it gave.</p>
            <button type="button" class="bui-key" data-back>BACK</button>
          </div>
        </form>
        <div data-for="wait" hidden>
          <ol class="sb-seats" aria-label="Seats"><li class="sb-me">P1 · YOU</li><li>OPEN SEAT</li></ol>
          <p class="sb-big" data-say="wait">Waiting for player 2.</p>
          <p class="sb-fine">Send the link: it has the code and the room, so they just press JOIN.</p>
          <div class="sb-keysrow"><button type="button" class="bui-key" data-share>SEND LINK</button><button type="button" class="bui-key" data-cancel>CANCEL</button></div>
        </div>
        <div data-for="gone" hidden>
          <p class="sb-big" data-say="gone"></p>
          <div class="sb-keysrow"><button type="button" class="bui-key sb-go-key" data-again>TRY AGAIN</button><button type="button" class="bui-key" data-back>MENU</button></div>
        </div>
      </section>`,
  );
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const menuCard = $(".sb-menu-card"), roomCard = $(".sb-room"), chip = $(".sb-roomchip"), pauseK = $<HTMLButtonElement>(".sb-pausek");
  const form = roomCard.querySelector("form")!, field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const SAY_MODE = {
    solo: "You against the bot. You fire first; the bot fires first in the rematch.",
    local: "Two players, one screen. A curtain hides each fleet while you hand over.",
    online: "Two screens, over the internet. You need an invite code.",
  };
  const SAY_LEVEL = ["fires at random, and only sometimes follows up a hit", "hunts on a checkerboard and finishes what it hits", "counts every place your ships could still be"];
  function showPick() {
    for (const seg of root.querySelectorAll<HTMLElement>("[data-seg]")) {
      const k = seg.dataset.seg as keyof Pick, cur = String(pick[k]);
      for (const b of seg.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.v === cur));
    }
    ($("[data-for=solo]") as HTMLElement).hidden = pick.mode !== "solo";
    $("[data-say=mode]").textContent = SAY_MODE[pick.mode];
    $("[data-say=level]").textContent = SAY_LEVEL[pick.level]!;
    $("[data-say=bay]").textContent = pick.bay ? "a fifth ship, the Walrus (5)" : "Whale, Heron, Otter, Minnow";
    $("[data-go]").textContent = pick.mode === "online" ? "NEXT" : "PLAY";
  }
  for (const seg of root.querySelectorAll<HTMLElement>("[data-seg]"))
    for (const b of seg.querySelectorAll<HTMLButtonElement>("button"))
      b.addEventListener("click", () => {
        const k = seg.dataset.seg as keyof Pick;
        (pick as Record<string, unknown>)[k] = k === "mode" ? b.dataset.v : Number(b.dataset.v);
        keep.set(KEEP, JSON.stringify(pick), device);
        showPick();
      });

  // ---- the scene: one at a time on a fresh stage ----
  let scene: SalvoScene | null = null, link: RoomLink | null = null, abort: AbortController | null = null, playing = false;
  const w = window as unknown as { salvo?: unknown };
  function run(mode: Mode, extra: Parameters<typeof mount>[1] = {}) {
    scene?.destroy();
    scene = mount(box.fresh(), { mode, level: pick.level, bay: pick.bay, menu: mode === "attract" ? undefined : menu, ...extra });
    playing = mode !== "attract";
    pauseK.hidden = !playing;
    w.salvo = api;
    return scene;
  }
  function attract() {
    link?.close();
    link = null;
    run("attract", { loop: true, bay: pick.bay });
  }
  function menu() {
    abort?.abort();
    attract();
    chip.hidden = true;
    roomCard.hidden = true;
    menuCard.hidden = false;
    showPick();
    $<HTMLButtonElement>("[data-go]").focus({ preventScroll: true });
  }
  function go() {
    keep.set(KEEP, JSON.stringify(pick), device);
    if (pick.mode === "online") return online();
    menuCard.hidden = true;
    run(pick.mode === "local" ? "local" : "bot").focus();
  }
  $("[data-go]").addEventListener("click", go);
  pauseK.addEventListener("click", () => (scene?.state.paused ? scene.resume() : scene?.pause()));

  // ---- online: the room card (join → wait → the match, or someone left) ----
  const step = (s: "join" | "wait" | "gone") => {
    roomCard.dataset.step = s;
    for (const el of roomCard.querySelectorAll<HTMLElement>("[data-for]")) el.hidden = el.dataset.for !== s;
    roomCard.querySelector<HTMLElement>(`[data-for="${s}"] :is(input:not([hidden]), button)`)?.focus({ preventScroll: true });
  };
  const say = (k: string, t: string) => ($(`[data-say=${k}]`).textContent = t);
  const showRoom = () => ((form.elements.namedItem("roomShow") as HTMLOutputElement).value = String(room));
  showRoom();
  for (const b of roomCard.querySelectorAll<HTMLButtonElement>("[data-room]")) b.addEventListener("click", () => ((room = (room + Number(b.dataset.room) + ROOMS) % ROOMS), showRoom()));
  for (const b of roomCard.querySelectorAll<HTMLButtonElement>("[data-back]")) b.addEventListener("click", menu);
  // A ?code= link: the page's head script took it out of the URL and left it here (memory only).
  const wi = window as unknown as { __salvoInvite?: string };
  field("code").value = wi.__salvoInvite || keep.get("salvo-bay:code", tab);
  delete wi.__salvoInvite;
  let needPass = false, code = "", pass = keep.get("salvo-bay:pass", tab);
  field("pass").value = pass;
  const deviceKey = () => {
    let k = keep.get("salvo-bay:device", device);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
      const b = crypto.getRandomValues(new Uint8Array(18));
      k = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_");
      keep.set("salvo-bay:device", k, device);
    }
    return k;
  };
  const showPass = (on: boolean) => ((needPass = on), (roomCard.querySelector<HTMLElement>("[data-pass]")!.hidden = !on), (roomCard.querySelector<HTMLElement>("[data-invite]")!.hidden = on));
  function online() {
    menuCard.hidden = true;
    roomCard.hidden = false;
    step("join");
    say("join", ws ? "" : "Online play needs a room server: this build has none set.");
    // Does the server want a pass instead of a code? An empty POST /invite says pass:true when it does.
    if (ws) fetch(`${http}/invite`, { method: "POST", body: "", referrerPolicy: "no-referrer" }).then((r) => r.json()).then((b) => b?.pass === true && showPass(true)).catch(() => {});
  }
  async function check(body: string) {
    const r = await fetch(`${http}/invite`, { method: "POST", body, referrerPolicy: "no-referrer" }).catch(() => null);
    if (!r) return null;
    if (r.status === 429) return "slow";
    const b = await r.json().catch(() => ({}));
    if (b.pass === true) showPass(true);
    return r.ok;
  }
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!ws) return say("join", "Online play needs a room server: this build has none set.");
    let ok: boolean | "slow" | null;
    if (needPass) {
      pass = field("pass").value.trim();
      if (pass.length < 20) return say("join", "Paste the pass you were sent.");
      say("join", "Checking the pass…");
      ok = await check(`${pass}\n${deviceKey()}`);
    } else {
      code = field("code").value.trim().toUpperCase();
      if (code.length < 6) return say("join", "Enter the invite code you were sent.");
      say("join", "Checking the code…");
      ok = await check(code);
    }
    if (ok === null) return say("join", "Can't reach the game server. Check your connection and try again.");
    if (ok === "slow") return say("join", "Too many tries. Wait a minute, then try again.");
    if (!ok) return say("join", needPass ? "That pass isn't valid here." : "That invite code isn't on the list.");
    say("join", "");
    needPass ? keep.set("salvo-bay:pass", pass, tab) : keep.set("salvo-bay:code", code, tab);
    enter();
  });
  const seatsEl = roomCard.querySelector(".sb-seats")!;
  async function enter() {
    step("wait");
    $("[data-room-sub]").textContent = `ROOM ${room} · WAITING`;
    seatsEl.innerHTML = `<li class="sb-me">P1 · YOU</li><li>OPEN SEAT</li>`;
    say("wait", "Waiting for player 2.");
    abort = new AbortController();
    const signal = abort.signal;
    for (let tries = 0; ; tries++) {
      try {
        const s = await joinRoom(ws, room, needPass ? { pass, device: deviceKey() } : { code }, pick.bay, signal, (seat, seated) => {
          seatsEl.innerHTML = [0, 1].map((i) => `<li class="${i === seat ? "sb-me" : i < seated ? "sb-in" : ""}">${i === seat ? `P${i + 1} · YOU` : i < seated ? `P${i + 1}` : "OPEN SEAT"}</li>`).join("");
          say("wait", seated < 2 ? "Waiting for player 2." : "Starting…");
          $("[data-room-sub]").textContent = `ROOM ${room} · P${seat + 1} · ${seated} OF 2`;
        });
        if (signal.aborted) return s.link.close();
        return start(s);
      } catch {
        if (signal.aborted) return;
        if (tries >= 3) return gone(`Room ${room} is full or mid-match. Try another room.`);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  function start(s: Awaited<ReturnType<typeof joinRoom>>) {
    roomCard.hidden = true;
    link = s.link;
    pick.bay = s.bay;
    run("net", { link: s.link, seed: s.seed, bay: s.bay, on: (t) => t === "over" && (chip.dataset.conn = "off") }).focus();
    chip.hidden = false;
    chip.dataset.conn = "live";
    chip.lastElementChild!.textContent = `ROOM ${room} · P${s.seat + 1} · ${s.bay ? "BIG BAY" : "CLASSIC"} · LIVE`;
  }
  function gone(text: string) {
    attract();
    roomCard.hidden = false;
    say("gone", text);
    step("gone");
  }
  $("[data-again]").addEventListener("click", () => enter());
  $("[data-cancel]").addEventListener("click", () => (abort?.abort(), step("join")));
  $("[data-share]").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?mode=online&room=${room}&bay=${BAYS[pick.bay]}${qs.get("rooms") ? `&rooms=${encodeURIComponent(ws)}` : ""}${code ? `&code=${encodeURIComponent(code)}` : ""}`;
    const k = $("[data-share]");
    try {
      if (navigator.share) await navigator.share({ title: "Salvo Bay · online", text: `Join me in Salvo Bay, room ${room}.`, url });
      else await navigator.clipboard.writeText(url), (k.textContent = "LINK COPIED");
    } catch {
      k.textContent = "COPY FAILED";
    }
  });

  // P pauses (and resumes) a match from anywhere on the page.
  addEventListener("keydown", (e) => {
    if (!playing || e.metaKey || e.ctrlKey || e.altKey || (e.target as Element)?.closest?.("input,textarea,select")) return;
    if (e.key === "p" || e.key === "P") {
      if (e.composedPath().some((n) => n === box.stage)) return; // the stage handles its own
      e.preventDefault();
      scene?.state.paused ? scene.resume() : scene?.pause();
    }
  });

  const api = {
    get scene() {
      return scene;
    },
    get pick() {
      return pick;
    },
    get link() {
      return link;
    },
    menu,
    go,
    /** Start a mode straight away (tests, deep links). */
    start(p: Partial<Pick>) {
      Object.assign(pick, p);
      showPick();
      go();
    },
    destroy() {
      abort?.abort();
      link?.close();
      scene?.destroy();
      box.destroy();
    },
  };
  // A link straight to a mode (?mode=…) skips the menu for solo and pass and play.
  attract();
  showPick();
  if (qm === "online") online();
  else if (qm === "solo" || qm === "local") go();
  return api;
}
