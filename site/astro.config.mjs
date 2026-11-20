// The Salvo Bay site on Cloudflare Pages: the landing page (/) and the game (/play/), built from the
// committed dist/. Custom domain: SITE_URL (default https://salvobay.fzlt.games) and SITE_BASE; .github/workflows/
// cloudflare.yml sets them per target (PR preview, main to salvobay-staging.fzlt.games, promote to production).
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
  root,
  srcDir: root + "site/src",
  publicDir: root + "site/public",
  outDir: root + "artifacts/pages",
  site: process.env.SITE_URL || "https://salvobay.fzlt.games",
  base: process.env.SITE_BASE || "/",
  trailingSlash: "always",
  output: "static",
  devToolbar: { enabled: false },
  server: { host: "127.0.0.1", port: 4323 },
});
