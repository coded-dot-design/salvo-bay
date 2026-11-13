// Salvo Bay: a ship-hunting duel on a cutaway tabletop diorama, by Chris Cooley, built on Fizlet.
//   createSalvoBay()  the drop-in: a quick game against the bot over any page; Escape gives it back
//   play(host)        the full game (/play/): solo with three bot levels, pass and play, online
//   hero(host)        the landing hero: an attract battle, tap to play
//   mount(stage)      the scene alone; the model (pure, seeded) and the room link for your own
import { mount } from "./scene";
import { shell } from "./shell";
export { mount } from "./scene";
export type { SalvoScene, SceneOptions, Link, Mode } from "./scene";
export { play } from "./app";
export { hero } from "./hero";
export { roomLink, joinRoom, pair } from "./net";
export * as model from "./model";

export interface SalvoBayOptions {
  /** The bot's level: 0 easy, 1 normal (default), 2 hard. */
  level?: number;
  /** 0 classic 8 × 8 (default), 1 big bay 10 × 10. */
  bay?: number;
  seed?: number;
  /** false: start muted. */
  sound?: boolean;
  theme?: "light" | "dark";
  /** Seconds of no input before the scene sleeps (default 30). */
  idle?: number;
  /** Place the fleet yourself (default: a random fleet, straight into battle). */
  place?: boolean;
}

/** The drop-in: Salvo Bay over the page, in its own fixed layer and shadow root. start() deals a
 *  fleet and starts the battle; P pauses; Escape (or stop()) gives the page back exactly as it was. */
export function createSalvoBay(o: SalvoBayOptions = {}) {
  let host: HTMLElement | null = null, scene: ReturnType<typeof mount> | null = null, status: "idle" | "running" = "idle";
  const stop = () => {
    scene?.destroy();
    host?.remove();
    (scene = null), (host = null), (status = "idle");
  };
  return {
    start() {
      if (scene) return;
      host = document.createElement("div");
      host.setAttribute("data-fizlet-host", "salvo-bay");
      host.style.cssText = "position:fixed;inset:0;z-index:2147483000";
      document.body.append(host);
      const box = shell(host, o.theme);
      scene = mount(box.stage, { mode: "bot", level: o.level, bay: o.bay, seed: o.seed, quick: !o.place, escape: "recall", recall: stop, sound: o.sound, idle: o.idle });
      status = "running";
      scene.focus();
    },
    pause: () => scene?.pause(),
    resume: () => scene?.resume(),
    stop,
    destroy: stop,
    finish: (won: boolean) => scene?.finish(won),
    get scene() {
      return scene;
    },
    getSnapshot() {
      if (!scene || status === "idle") return { status: "idle", elapsed: 0, score: 0, player: null };
      const s = scene.state, m = scene.m, N = m.N;
      return {
        status: s.paused ? "paused" : m.phase === 2 ? "gameover" : "running",
        elapsed: s.elapsed,
        score: m.sides[0].n[1],
        phase: ["place", "battle", "over"][m.phase],
        player: { x: (s.cursor % N) * 40, y: ((s.cursor / N) | 0) * 40 },
      };
    },
  };
}
