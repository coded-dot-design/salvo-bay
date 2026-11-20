# Salvo Bay

**Sink what you can't see.** A ship-hunting duel on a cutaway tabletop diorama: two glass trays of
water on a wooden plinth, a dock, a fort and a lighthouse. Hide your fleet, then trade shells that
arc over the table, splash, burst into fire and smoke, and sink ships you can still see on the
bottom through the water. Orbit the table; at night the lighthouse sweeps the bay.

By [Chris Cooley](https://coded.design/) · built on [Fizlet](https://github.com/fizlet/fzlt) · all rights reserved ·
play it at [salvobay.fzlt.games](https://salvobay.fzlt.games/)

## Play

- **Solo** against the bot: easy, normal or hard. Measured over 300 matches each, the bots need
  41.7, 33.4 and 29.0 shots to sink a classic fleet (`npm test`).
- **Pass and play**: two people, one screen, a curtain between turns.
- **Online**: two screens over a fizlet-rooms room (invite code, room, a link
  to send). Only moves cross the wire; each fleet is locked in as a hash before the first shot and
  checked against it, and against every answer it gave, at the end.
- **Two bays**: classic 8 × 8 with four ships, big bay 10 × 10 with five.
- A turn banner, a shot log, rematch, win and lose cards, and your record on this device.

Keys: arrows move the cursor · Enter places or fires · R turns a ship · 1–5 pick one · X random
fleet · S start · V view · L log · P pause · M mute. Phones: tap a ship, tap a cell; drag to orbit,
pinch to zoom.

## Use it

```js
import { play, hero, createSalvoBay } from "./dist/salvo-bay.mjs";
play(document.getElementById("game"), { rooms: "wss://<your fizlet-rooms server>" }); // the full game
hero(document.getElementById("hero"));                                              // a battle playing itself
createSalvoBay().start(); // a quick game over any page; Escape gives the page back exactly as it was
```

## Develop

```sh
npm ci
npm run check         # typecheck, build dist/, the size budgets (gzip)
npm test              # the model, the bots, commit and reveal; 0 young GCs over 200,000 sim steps
npm run test:settle   # the table sleeps when idle, holds when paused, nothing after Escape; the hero
npm run test:browser  # Chromium at 1440 and 390: menu, placing, firing, pause, a round to the end,
                      # pass and play, reduced motion; two screens online against a stand-in room server
npm run site:build && npm run test:site   # the landing page and /play/ (Astro)
```

The game is `src/model.ts` (pure and seeded: no DOM, no clock, no allocation in play), `src/scene.ts`
(the diorama and the controls), `src/net.ts` (the room link), `src/app.ts` (the play page) and
`src/hero.ts` (the landing hero). Fizlet bricks: kernel, diorama, sound, presence and the Board UI
kit (`@fzlt/core`, bundled: no runtime dependencies). It grew from Fizlet gallery piece #102.
