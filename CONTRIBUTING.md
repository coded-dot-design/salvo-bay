# Contributing

Pull requests welcome. Before you open one, run `npm run check`, `npm test`, `npm run test:settle`,
`npm run test:browser`, `npm run site:build` and `npm run test:site`, and keep them green
(`CHROMIUM_PATH` picks a local Chromium). Commit the rebuilt `dist/`. No runtime dependencies, no
allocation in a sim step, measured numbers only in copy.
