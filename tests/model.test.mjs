// The game (src/model.ts): placement, shots, the end, the bot's three levels, commit and reveal.
// Pure and seeded: the same seed and the same moves give the same match.
import test from "node:test";
import assert from "node:assert/strict";
import { seeded } from "@fzlt/core/kernel";
import * as M from "../src/model.ts";

const fleetCells = (m, p) => Array.from(m.sides[p].grid.subarray(0, m.C)).filter((g) => g >= 0).length;
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Bot against bot to the end; returns the shots each side fired. */
function duel(seed, bay, l0, l1) {
  const m = M.newMatch(seed, bay), r = seeded(seed * 3 + 1);
  M.randomFleet(m, 0, seeded(seed + 11));
  M.randomFleet(m, 1, seeded(seed + 23));
  assert.ok(M.begin(m, seed & 1));
  const lv = [l0, l1];
  while (m.phase === M.BATTLE) {
    const by = m.turn, c = M.botPick(m, by, r, lv[by]);
    assert.ok(c >= 0 && !m.sides[1 - by].shots[c], "the bot never fires at a cell twice");
    assert.ok(M.fire(m, by, c % m.N, (c / m.N) | 0) > 0);
  }
  return m;
}

test("both bays: sizes, fleets and random placement", () => {
  for (const [bay, n, ships, cells] of [[M.CLASSIC, 8, 4, 12], [M.BIG, 10, 5, 17]]) {
    for (let s = 1; s <= 200; s++) {
      const m = M.newMatch(s, bay);
      assert.equal(m.N, n);
      assert.equal(m.S, ships);
      M.randomFleet(m, 0, seeded(s));
      assert.ok(M.ready(m, 0), `seed ${s}: every ship placed`);
      assert.equal(fleetCells(m, 0), cells);
    }
  }
});

test("placement: in the bay, no overlap, a ship can move", () => {
  const m = M.newMatch(1);
  assert.equal(M.place(m, 0, 0, 5, 0, 0), false, "a 4-long ship off the right edge");
  assert.equal(M.place(m, 0, 0, 0, 5, 1), false, "off the bottom");
  assert.ok(M.place(m, 0, 0, 0, 0, 0));
  assert.equal(M.place(m, 0, 1, 2, 0, 1), false, "over the first ship");
  assert.ok(M.place(m, 0, 0, 0, 1, 0), "it moves; its old cells free up");
  assert.ok(M.place(m, 0, 1, 2, 0, 0));
  assert.equal(M.begin(m), false, "not before both fleets are out");
});

test("shots: miss, hit, sunk, turns, the end", () => {
  const m = M.newMatch(5);
  for (const p of [0, 1]) M.place(m, p, 0, 0, 0, 0), M.place(m, p, 1, 0, 2, 0), M.place(m, p, 2, 0, 4, 0), M.place(m, p, 3, 0, 6, 0);
  assert.ok(M.begin(m));
  assert.equal(M.fire(m, 1, 0, 0), 0, "not its turn");
  assert.equal(M.fire(m, 0, 7, 7), M.MISS);
  assert.equal(m.turn, 1);
  assert.equal(M.fire(m, 1, 7, 7), M.MISS);
  assert.equal(M.fire(m, 0, 7, 7), 0, "fired there already");
  const order = [[0, 6], [1, 6]];
  assert.equal(M.fire(m, 0, ...order[0]), M.HIT);
  assert.equal(M.fire(m, 1, 5, 5), M.MISS);
  assert.equal(M.fire(m, 0, ...order[1]), M.SUNK);
  assert.equal(m.ship, 3);
  assert.equal(m.sides[1].shots[6 * 8], M.SUNK, "a sunk ship marks all its cells");
  assert.equal(m.sides[0].n[2], 2, "the best streak counts hits in a row");
  // Sink the rest: side 0 never misses, side 1 always does.
  let x = 0;
  for (const [i, len, y] of [[0, 4, 0], [1, 3, 2], [2, 3, 4]])
    for (let k = 0; k < len; k++) {
      assert.ok(M.fire(m, 1, 6 + (x % 2), 1 + ((x++ / 2) | 0)) > 0);
      assert.equal(M.fire(m, 0, k, y), k === len - 1 ? M.SUNK : M.HIT, `ship ${i}`);
    }
  assert.equal(m.phase, M.OVER);
  assert.equal(m.winner, 0);
  assert.equal(M.shipsLeft(m, 1), 0);
});

test("the same seed and moves give the same match", () => {
  const a = duel(42, M.BIG, M.HARD, M.NORMAL), b = duel(42, M.BIG, M.HARD, M.NORMAL);
  assert.deepEqual([...a.sides[0].shots], [...b.sides[0].shots]);
  assert.deepEqual([...a.sides[1].shots], [...b.sides[1].shots]);
  assert.equal(a.winner, b.winner);
});

test("the bot's levels: harder bots need fewer shots (measured over 300 matches a level)", () => {
  for (const bay of [M.CLASSIC, M.BIG]) {
    const avg = [M.EASY, M.NORMAL, M.HARD].map((lv) => {
      const shots = [];
      for (let s = 1; s <= 300; s++) {
        const m = M.newMatch(s, bay), r = seeded(s * 7);
        M.randomFleet(m, 1, seeded(s + 99));
        M.randomFleet(m, 0, seeded(s + 7));
        M.begin(m, 0);
        // One side alone: the bot fires every shot (the other side passes by missing a cell it owns).
        let n = 0;
        while (M.shipsLeft(m, 1) && n < m.C) {
          m.turn = 0;
          const c = M.botPick(m, 0, r, lv);
          M.fire(m, 0, c % m.N, (c / m.N) | 0);
          n++;
        }
        shots.push(n);
      }
      return sum(shots) / shots.length;
    });
    console.log(`# ${M.BAYS[bay].name}: shots to sink a fleet, easy ${avg[0].toFixed(1)} · normal ${avg[1].toFixed(1)} · hard ${avg[2].toFixed(1)}`);
    assert.ok(avg[0] > avg[1] && avg[1] > avg[2], `easy > normal > hard: ${avg.map((a) => a.toFixed(1)).join(" > ")}`);
  }
});

test("online: answers from the other screen, commit and reveal", () => {
  // Two screens, each knowing only its own fleet.
  const a = M.newMatch(9), b = M.newMatch(9);
  M.randomFleet(a, 0, seeded(1));
  M.randomFleet(b, 0, seeded(2));
  const saltA = 0x123456, saltB = 0x654321, hA = M.commit(a, 0, saltA), hB = M.commit(b, 0, saltB);
  assert.ok(hA >= 0 && hA < 2 ** 28);
  assert.ok(M.begin(a, 0, true) && M.begin(b, 1, true), "each screen begins with the other fleet unseen");
  const r = seeded(77);
  // a fires at b: b answers with fire() on its own side 1 = a's view of it as side 0... mirror the turns.
  while (a.phase === M.BATTLE) {
    const [me, them] = a.turn === 0 ? [a, b] : [b, a];
    const c = M.botPick(me, 0, r, M.NORMAL), x = c % me.N, y = (c / me.N) | 0;
    const res = M.fire(them, 1, x, y), ship = them.ship;
    if (res === M.SUNK) M.place(me, 1, ship, them.sides[0].sx[ship], them.sides[0].sy[ship], them.sides[0].dir[ship], true);
    assert.equal(M.record(me, 0, x, y, res, ship), res);
  }
  assert.equal(b.phase, M.OVER);
  assert.equal(a.winner === 0, b.winner === 1, "both screens agree who won");
  // The reveal: b's fleet into a's view, checked against b's commit and every answer b gave.
  for (let i = 0; i < b.S; i++) M.place(a, 1, i, b.sides[0].sx[i], b.sides[0].sy[i], b.sides[0].dir[i], true);
  assert.equal(M.verify(a, 1, saltB, hB), 0, "an honest fleet checks out");
  assert.equal(M.verify(a, 1, saltB ^ 1, hB), 1, "a wrong salt does not");
  // A screen that moved a ship after the commit is caught, even if it re-hashes.
  const moved = M.newMatch(9);
  M.randomFleet(moved, 0, seeded(3));
  const h = M.commit(moved, 0, 5);
  M.unplace(moved, 0, 3);
  M.randomFleet(moved, 0, seeded(4));
  assert.equal(M.verify(moved, 0, 5, h), 1);
  // A lie: a cell answered "miss" where a ship is.
  const liar = M.newMatch(9);
  M.randomFleet(liar, 1, seeded(5));
  liar.phase = M.BATTLE;
  const c = Array.from(liar.sides[1].grid).findIndex((g) => g >= 0);
  liar.sides[1].shots[c] = M.MISS;
  assert.equal(M.verify(liar, 1, 1, M.commit(liar, 1, 1)), 2);
  assert.equal(hA, M.commit(a, 0, saltA), "the commit is a pure function of the fleet and salt");
});
