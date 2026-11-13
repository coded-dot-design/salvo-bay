// The landing page's hero: Salvo Bay playing itself. Two bots trade shells across the table (shells
// arcing over, splashes, fires, a ship rolling over and settling on the bottom); when the battle is
// won the table holds still and the engine sleeps, until a pointer comes back over it and another
// battle starts. A tap on the table starts a solo game right there (`onPlay` says so, so the page can
// move its copy aside). Reduced motion: one still frame of a volley in the air, nothing moves.
// Off screen, the engine pauses on its own (the kernel's offscreen rule).
import { mount, type SalvoScene } from "./scene";
import { shell } from "./shell";

export interface HeroOptions {
  /** A solo game started from the hero. */
  onPlay?(): void;
  /** The end card's MENU in that game (the page sends it to /play/). */
  menu?(): void;
}

export function hero(host: HTMLElement, o: HeroOptions = {}) {
  const box = shell(host), RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The copy sits over the left of a wide hero and the top of a narrow one: the table goes beside or under it.
  const inset = (): [number, number] => (host.clientWidth >= 820 ? [0.4, 0.04] : [0, host.clientWidth < 520 ? 0.5 : 0.4]);
  let scene: SalvoScene = mount(box.stage, { mode: "attract", idle: 8, inset }), solo = false;
  if (RM) scene.poster(false);
  const sig = { signal: scene.engine.signal };
  // Back over a finished battle: another one.
  host.addEventListener("pointerenter", () => !solo && !RM && scene.m.phase === 2 && scene.rematch(), sig);
  host.addEventListener("click", (e) => {
    if (solo || (e.target as Element)?.closest?.("a,button")) return;
    start();
  });
  function start() {
    if (solo) return;
    solo = true;
    scene.destroy();
    scene = mount(box.fresh(), { mode: "bot", menu: o.menu });
    host.dataset.playing = "";
    o.onPlay?.();
    scene.focus();
  }
  const api = {
    get scene() {
      return scene;
    },
    get solo() {
      return solo;
    },
    start,
    destroy() {
      scene.destroy();
      box.destroy();
    },
  };
  (window as unknown as { salvoHero?: unknown }).salvoHero = api;
  return api;
}
