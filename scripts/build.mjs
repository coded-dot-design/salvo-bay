// dist/salvo-bay.mjs (the whole game: the drop-in, the play page, the hero, the scene, the model and
// the room link) and dist/salvo-bay-hero.mjs (the landing hero alone: no menu, no room code).
// Fizlet (@fzlt/core) is bundled in: the builds have no runtime dependencies.
import { build, transform } from "esbuild";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const require = createRequire(import.meta.url);
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
const css = async (file) => (await transform(readFileSync(file, "utf8"), { loader: "css", minify: true })).code;
// The Board UI kit (Fizlet's ui brick) and Salvo Bay's sheet, minified and baked in for the shadow root.
const kit = await css(require.resolve("@fzlt/core/ui/board-ui.css"));
const salvo = await css("src/salvo.css");
const common = {
  define: { __KIT_CSS__: JSON.stringify(kit), __SALVO_CSS__: JSON.stringify(salvo) },
  bundle: true, minify: true, format: "esm", target: "es2022", legalComments: "none", logLevel: "warning",
  banner: { js: `/* Salvo Bay ${version} · MIT © Chris Cooley · built on Fizlet */` },
};
await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/salvo-bay.mjs" });
await build({ ...common, entryPoints: ["src/hero.ts"], outfile: "dist/salvo-bay-hero.mjs" });
console.log(`Built Salvo Bay ${version}: dist/salvo-bay.mjs, dist/salvo-bay-hero.mjs`);
