// The keys strip: small Board UI keys on the stage's bottom edge, under the ground line, so they
// never cover the play (from the Fizlet gallery's minis). A key reports its press on pointerdown;
// a keyboard press on a focused key (a click with no pointer) reports it too. The strip goes
// through the engine's ledger: Recall gives the page back.
import type { Engine } from "@fzlt/core/kernel";

/** A key: its label, its accessible name when the label alone is not one, its id, its classes. */
export type Key = { label: string; aria?: string; id: number; c?: string };

export function keys(engine: Engine, stage: HTMLElement, defs: Key[], on: (id: number) => void) {
  const bar = engine.ledger.add(document.createElement("div")), sig = { signal: engine.signal };
  bar.className = "gk-bar";
  stage.append(bar);
  // When the last pointer press landed: the click that follows it is the same press, not a second one.
  let down = -1e9;
  return defs.map((d) => {
    const b = bar.appendChild(document.createElement("button"));
    b.type = "button";
    b.className = "bui-key gk " + (d.c ?? "");
    b.textContent = d.label;
    d.aria && b.setAttribute("aria-label", d.aria);
    b.addEventListener("pointerdown", (e) => (e.preventDefault(), (down = e.timeStamp), on(d.id)), sig);
    b.addEventListener("click", (e) => e.detail || e.timeStamp - down < 1000 || on(d.id), sig);
    return b;
  });
}
