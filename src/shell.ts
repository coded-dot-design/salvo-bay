// The game's own box: a shadow root on the host with Fizlet's Board UI kit and Salvo Bay's sheet
// (both baked in at build), a `.bui` root that follows the page's theme (html[data-theme], or one
// given), and the stage the scene draws on. Nothing outside the host is touched.
declare const __KIT_CSS__: string, __SALVO_CSS__: string;

export function shell(host: HTMLElement, theme?: "light" | "dark") {
  const sr = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  sr.textContent = "";
  const style = document.createElement("style");
  style.textContent = __KIT_CSS__ + __SALVO_CSS__ + ":host{display:block;position:relative}";
  const root = document.createElement("div");
  root.className = "bui sb-app";
  const stage = document.createElement("div");
  stage.className = "sb-stage";
  root.append(stage);
  sr.append(style, root);
  const sync = () => (root.dataset.theme = theme ?? (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  sync();
  const mo = theme ? null : new MutationObserver(sync);
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return {
    root,
    stage,
    /** A fresh stage (the old one and its scene are gone). */
    fresh() {
      const s = document.createElement("div");
      s.className = "sb-stage";
      this.stage.replaceWith(s);
      this.stage = s;
      return s;
    },
    destroy() {
      mo?.disconnect();
      sr.textContent = "";
    },
  };
}
export type Shell = ReturnType<typeof shell>;
