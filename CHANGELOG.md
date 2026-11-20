# Changelog

## Unreleased

- **New home, new licence.** The game moves to the private repo `fizlet/salvo-bay` and the address
  `https://salvobay.fzlt.games` (the site's `SITE_URL` default and canonical; `SITE_BASE` defaults to `/`).
  From this version the game is all rights reserved (`LICENSE`, `"license": "UNLICENSED"`).
  Earlier versions were published under the MIT License and stay MIT for anyone who has a copy.
  The Fizlet engine (`@fzlt/core`, now `fizlet/fzlt`) stays MIT.

## 0.1.0 (2026-11-13)

- Salvo Bay grows from the Fizlet gallery piece #102 into a full game: solo against an easy,
  normal or hard bot, pass and play with a curtain between turns, and online over a fizlet-rooms
  room (invite code, lobby, send-a-link, rematch, a player leaving), with each fleet committed as a
  hash before the first shot and checked at the end.
- Two bays: classic 8 × 8 (four ships) and big bay 10 × 10 (five, with the Walrus).
- A turn banner, a shot log, win and lose cards with shots, accuracy, best streak and time, and a
  record per bot level on this device.
- The site: a landing page whose hero is the game playing itself (tap the table to play), and
  `/play/`.
