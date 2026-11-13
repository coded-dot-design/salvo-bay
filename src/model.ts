// Salvo Bay's game: pure, seeded, turn based. No DOM, no clock, no renderer, and no allocation once a
// match exists (typed arrays; `resetMatch` reuses one). Every change is `place()`, `fire()` or, for a
// shot whose answer came from the other player's screen, `record()`, so the same seed and the same
// inputs give the same game on every screen.
// Two bays: CLASSIC (8 × 8, four ships) and BIG BAY (10 × 10, five ships). A cell is y * n + x.
// Online, each screen knows only its own fleet: a shot crosses the wire as a cell, its answer comes
// back (and a sunk ship's place with it), and both fleets are revealed at the end and checked against
// the hash each side committed before the first shot (`commit`, `verify`). Tests: tests/model.test.mjs.

/** The bays: 0 CLASSIC (8 × 8), 1 BIG BAY (10 × 10). */
export const CLASSIC = 0, BIG = 1;
/** The largest bay and fleet, for the fixed buffers. */
export const MAXN = 10, MAXC = 100, MAXS = 5;
/** Per bay: its size, the fleet's lengths and names (longest first). */
export const BAYS = [
  { n: 8, name: "Classic", fleet: [4, 3, 3, 2], names: ["Whale", "Heron", "Otter", "Minnow"] },
  { n: 10, name: "Big bay", fleet: [5, 4, 3, 3, 2], names: ["Walrus", "Whale", "Heron", "Otter", "Minnow"] },
] as const;
/** Phases. */
export const PLACE = 0, BATTLE = 1, OVER = 2;
/** Shot results (and the shots grid's marks): 0 refused / none, then miss, hit, sunk. */
export const MISS = 1, HIT = 2, SUNK = 3;
/** The bot's levels. */
export const EASY = 0, NORMAL = 1, HARD = 2;

/** One side: where its ships are, what has been fired at it, and what it fired. */
export interface Side {
  /** Ship i's first cell (x, y; −1 while not placed or not known) and direction (0 along x, 1 along y). */
  sx: Int8Array;
  sy: Int8Array;
  dir: Uint8Array;
  /** Hits on ship i, and 1 once it is sunk. */
  hits: Uint8Array;
  sunk: Uint8Array;
  /** Per cell: the ship on it, or −1 (all −1 for a fleet this screen can't see). */
  grid: Int8Array;
  /** Per cell: what a shot at it found (0 not fired at, MISS, HIT, SUNK). */
  shots: Uint8Array;
  /** Shots this side fired, how many hit, the longest run of hits, the current run. */
  n: Uint16Array;
}
/** A match: the bay, two sides, the phase, whose turn, the winner (−1), the last shot's ship. */
export interface Match {
  seed: number;
  bay: number;
  /** Bay size, cells, ships. */
  N: number;
  C: number;
  S: number;
  /** Ship lengths. */
  fleet: Uint8Array;
  phase: number;
  turn: number;
  /** Who fired first this match. */
  first: number;
  winner: number;
  /** The ship the last fire() / record() hit (−1 on a miss). */
  ship: number;
  /** Shots fired in the match (both sides). */
  shots: number;
  sides: [Side, Side];
  /** The bot's scratch: candidate cells and the hunt's heat map. */
  cand: Int16Array;
  heat: Int32Array;
}

const side = (): Side => ({
  sx: new Int8Array(MAXS), sy: new Int8Array(MAXS), dir: new Uint8Array(MAXS), hits: new Uint8Array(MAXS), sunk: new Uint8Array(MAXS),
  grid: new Int8Array(MAXC), shots: new Uint8Array(MAXC), n: new Uint16Array(4),
});

/** A new match on `bay` in placement, both fleets on the dock. */
export function newMatch(seed: number, bay = CLASSIC): Match {
  const m: Match = {
    seed: 0, bay: 0, N: 8, C: 64, S: 4, fleet: new Uint8Array(MAXS), phase: PLACE, turn: 0, first: 0, winner: -1, ship: -1, shots: 0,
    sides: [side(), side()], cand: new Int16Array(MAXC * 4), heat: new Int32Array(MAXC),
  };
  return resetMatch(m, seed, bay);
}
/** Start `m` over in place (no allocation), on `bay` (default: the same one). */
export function resetMatch(m: Match, seed: number, bay = m.bay) {
  const b = BAYS[bay] ?? BAYS[0];
  m.seed = seed >>> 0;
  m.bay = b === BAYS[0] ? CLASSIC : BIG;
  m.N = b.n;
  m.C = b.n * b.n;
  m.S = b.fleet.length;
  m.fleet.fill(0);
  for (let i = 0; i < m.S; i++) m.fleet[i] = b.fleet[i]!;
  m.phase = PLACE;
  m.turn = m.first = 0;
  m.winner = m.ship = -1;
  m.shots = 0;
  for (let p = 0; p < 2; p++) {
    const s = m.sides[p]!;
    s.sx.fill(-1), s.sy.fill(-1), s.dir.fill(0), s.hits.fill(0), s.sunk.fill(0), s.grid.fill(-1), s.shots.fill(0), s.n.fill(0);
  }
  return m;
}

/** Cell k (0 ≤ k < length) of ship i on side s, on a bay n wide. */
export const cellOf = (s: Side, i: number, k: number, n: number) => (s.sy[i]! + (s.dir[i] ? k : 0)) * n + s.sx[i]! + (s.dir[i] ? 0 : k);
/** Can side p's ship i go at (x, y) facing dir (its own old cells don't count)? */
export function canPlace(m: Match, p: number, i: number, x: number, y: number, dir: number) {
  const L = m.fleet[i]!, N = m.N;
  if (i < 0 || i >= m.S || x < 0 || y < 0 || (dir ? y + L : x + L) > N || (dir ? x : y) >= N) return false;
  const g = m.sides[p]!.grid;
  for (let k = 0; k < L; k++) {
    const c = g[(y + (dir ? k : 0)) * N + x + (dir ? 0 : k)]!;
    if (c !== -1 && c !== i) return false;
  }
  return true;
}
/** Take side p's ship i back to the dock. */
export function unplace(m: Match, p: number, i: number) {
  const s = m.sides[p]!;
  if (s.sx[i]! < 0) return;
  for (let k = 0; k < m.fleet[i]!; k++) s.grid[cellOf(s, i, k, m.N)] = -1;
  s.sx[i] = s.sy[i] = -1;
}
/** Put side p's ship i at (x, y) facing dir; false (nothing changes) when it can't go there. Also
 *  used after the battle to show a fleet revealed by the other screen (`force`). */
export function place(m: Match, p: number, i: number, x: number, y: number, dir: number, force = false) {
  if ((m.phase !== PLACE && !force) || !canPlace(m, p, i, x, y, dir)) return false;
  unplace(m, p, i);
  const s = m.sides[p]!;
  (s.sx[i] = x), (s.sy[i] = y), (s.dir[i] = dir);
  for (let k = 0; k < m.fleet[i]!; k++) s.grid[cellOf(s, i, k, m.N)] = i;
  return true;
}
/** Every ship of side p somewhere legal, from `rnd`. */
export function randomFleet(m: Match, p: number, rnd: () => number) {
  for (let i = 0; i < m.S; i++) unplace(m, p, i);
  for (let i = 0; i < m.S; i++)
    for (let t = 0; t < 800; t++) if (place(m, p, i, (rnd() * m.N) | 0, (rnd() * m.N) | 0, rnd() < 0.5 ? 1 : 0)) break;
}
/** Is every ship of side p placed? */
export function ready(m: Match, p: number) {
  const s = m.sides[p]!;
  for (let i = 0; i < m.S; i++) if (s.sx[i]! < 0) return false;
  return true;
}
/** From placement to battle; `first` fires first. `remote`: the other fleet lives on another screen
 *  (it can't be checked here). */
export function begin(m: Match, first = 0, remote = false) {
  if (m.phase !== PLACE || !ready(m, 0) || (!remote && !ready(m, 1))) return false;
  m.phase = BATTLE;
  m.turn = m.first = first & 1;
  return true;
}
/** Side `by` fires at (x, y) on the other side, whose fleet this screen knows: 0 (not allowed: not
 *  its turn, off the bay, fired there already), MISS, HIT or SUNK; the ship hit is `m.ship`. */
export function fire(m: Match, by: number, x: number, y: number) {
  const t = m.sides[1 - by]!;
  m.ship = -1;
  if (!legal(m, by, x, y)) return 0;
  const i = t.grid[y * m.N + x]!;
  return record(m, by, x, y, i < 0 ? MISS : t.hits[i]! + 1 >= m.fleet[i]! ? SUNK : HIT, i);
}
/** Could side `by` fire at (x, y) now? */
export const legal = (m: Match, by: number, x: number, y: number) =>
  m.phase === BATTLE && m.turn === by && x >= 0 && y >= 0 && x < m.N && y < m.N && !m.sides[1 - by]!.shots[y * m.N + x];
/** Side `by`'s shot at (x, y) found `res` on ship `ship` (the answer from the screen that holds that
 *  fleet, or fire()'s own). A SUNK marks the ship's cells: its place must be known by then (`place`
 *  with force, from the answer). Returns res, or 0 when the shot isn't legal. */
export function record(m: Match, by: number, x: number, y: number, res: number, ship: number) {
  const t = m.sides[1 - by]!, me = m.sides[by]!, c = y * m.N + x;
  m.ship = -1;
  if (!legal(m, by, x, y) || res < MISS || res > SUNK || (res > MISS && (ship < 0 || ship >= m.S || t.sunk[ship]))) return 0;
  me.n[0]!++;
  m.shots++;
  if (res === MISS) return (t.shots[c] = MISS), (me.n[3] = 0), (m.turn = 1 - by), MISS;
  me.n[1]!++;
  me.n[3]!++;
  if (me.n[3]! > me.n[2]!) me.n[2] = me.n[3]!;
  t.hits[ship]!++;
  t.shots[c] = HIT;
  m.ship = ship;
  if (res === SUNK) {
    t.sunk[ship] = 1;
    t.hits[ship] = m.fleet[ship]!;
    if (t.sx[ship]! >= 0) for (let k = 0; k < m.fleet[ship]!; k++) t.shots[cellOf(t, ship, k, m.N)] = SUNK;
    else t.shots[c] = SUNK;
  }
  if (shipsLeft(m, 1 - by) === 0) (m.phase = OVER), (m.winner = by);
  else m.turn = 1 - by;
  return res;
}
/** One side gives up (or leaves): the other wins. */
export function concede(m: Match, p: number) {
  if (m.phase === OVER) return;
  m.phase = OVER;
  m.winner = 1 - p;
}
/** Ships of side p still afloat. */
export function shipsLeft(m: Match, p: number) {
  const s = m.sides[p]!;
  let n = 0;
  for (let i = 0; i < m.S; i++) n += s.sunk[i] ? 0 : 1;
  return n;
}

// ---- the bot ----
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
/** What side `by` knows of cell (x, y) on the other side: −1 off the bay, else its shot mark. */
const at = (m: Match, s: Uint8Array, x: number, y: number) => (x < 0 || y < 0 || x >= m.N || y >= m.N ? -1 : s[y * m.N + x]!);
/** The bot's next cell for side `by` at `level`. It reads only what a player could know: its own shot
 *  marks on the other bay and which of their ships are sunk. EASY fires at random and only sometimes
 *  follows up a hit; NORMAL finishes a line of hits, tries round a hit, else hunts on a checkerboard;
 *  HARD counts every place each ship still afloat could be and fires where the most of them cross
 *  (through any hits first). Never a cell it fired at; −1 when none is left. */
export function botPick(m: Match, by: number, rnd: () => number, level = NORMAL) {
  const s = m.sides[1 - by]!.shots, cand = m.cand, N = m.N, C = m.C;
  let n = 0;
  if (level === HARD) {
    const h = heatMap(m, by);
    let best = 0;
    for (let c = 0; c < C; c++) if (!s[c] && h[c]! > best) best = h[c]!;
    if (best > 0) for (let c = 0; c < C; c++) if (!s[c] && h[c] === best) cand[n++] = c;
  } else if (level === NORMAL || rnd() < 0.45) {
    for (let c = 0; c < C; c++) {
      if (s[c] !== HIT) continue;
      const x = c % N, y = (c / N) | 0;
      for (let d = 0; d < 4; d++) {
        if (at(m, s, x + DX[d]!, y + DY[d]!) !== HIT) continue;
        let k = 1;
        while (at(m, s, x + DX[d]! * k, y + DY[d]! * k) === HIT) k++;
        if (at(m, s, x + DX[d]! * k, y + DY[d]! * k) === 0) cand[n++] = (y + DY[d]! * k) * N + x + DX[d]! * k;
      }
    }
    if (!n)
      for (let c = 0; c < C; c++) {
        if (s[c] !== HIT) continue;
        const x = c % N, y = (c / N) | 0;
        for (let d = 0; d < 4; d++) if (at(m, s, x + DX[d]!, y + DY[d]!) === 0) cand[n++] = (y + DY[d]!) * N + x + DX[d]!;
      }
    // Every ship is two or longer: a checkerboard finds them all (EASY doesn't know that).
    if (!n && level === NORMAL) for (let c = 0; c < C; c++) if (!s[c] && (((c % N) + ((c / N) | 0)) & 1) === 0) cand[n++] = c;
  }
  if (!n) for (let c = 0; c < C; c++) if (!s[c]) cand[n++] = c;
  return n ? cand[(rnd() * n) | 0]! : -1;
}
/** HARD's map for side `by`: per cell of the other bay, how many places of the ships still afloat
 *  cover it, through no miss or sunk cell. While there are open hits, only places through a hit count,
 *  weighted by how many hits they cover. In `m.heat`. */
export function heatMap(m: Match, by: number) {
  const t = m.sides[1 - by]!, s = t.shots, h = m.heat, N = m.N;
  h.fill(0);
  let open = 0;
  for (let c = 0; c < m.C; c++) if (s[c] === HIT) open++;
  for (let i = 0; i < m.S; i++) {
    if (t.sunk[i]) continue;
    const L = m.fleet[i]!;
    for (let dir = 0; dir < 2; dir++)
      for (let y = 0; y < (dir ? N - L + 1 : N); y++)
        for (let x = 0; x < (dir ? N : N - L + 1); x++) {
          let hits = 0, ok = true;
          for (let k = 0; k < L && ok; k++) {
            const v = s[(y + (dir ? k : 0)) * N + x + (dir ? 0 : k)]!;
            if (v === MISS || v === SUNK) ok = false;
            else if (v === HIT) hits++;
          }
          if (!ok || (open && !hits)) continue;
          const w = open ? hits * hits * 8 : 1;
          for (let k = 0; k < L; k++) h[(y + (dir ? k : 0)) * N + x + (dir ? 0 : k)]! += w;
        }
  }
  return h;
}

// ---- commit and reveal (online play) ----
/** A fleet packed in one u32 per ship: x | y << 4 | dir << 8 (what crosses the wire at the end). */
export const packShip = (s: Side, i: number) => (s.sx[i]! & 15) | ((s.sy[i]! & 15) << 4) | ((s.dir[i]! & 1) << 8);
/** The 28-bit hash side p commits before the first shot: its fleet and a secret salt, so the other
 *  screen can check at the end that the fleet never moved (FNV-1a). */
export function commit(m: Match, p: number, salt: number) {
  const s = m.sides[p]!;
  let h = 0x811c9dc5;
  const eat = (b: number) => (h = Math.imul(h ^ (b & 255), 16777619));
  eat(m.bay), eat(m.S);
  for (let i = 0; i < m.S; i++) eat(s.sx[i]!), eat(s.sy[i]!), eat(s.dir[i]!);
  for (let k = 0; k < 4; k++) eat(salt >>> (k * 8));
  return (h >>> 0) & 0x0fffffff;
}
/** After a reveal of side p's whole fleet (placed with force): does it match the commit, and every
 *  answer that side gave? 0 yes, 1 the hash differs, 2 an answer doesn't fit the fleet. */
export function verify(m: Match, p: number, salt: number, hash: number) {
  if (!ready(m, p) || commit(m, p, salt) !== hash) return 1;
  const s = m.sides[p]!;
  for (let c = 0; c < m.C; c++) {
    const v = s.shots[c]!, i = s.grid[c]!;
    if (v === MISS && i >= 0) return 2;
    if ((v === HIT || v === SUNK) && i < 0) return 2;
    if (v === HIT && s.sunk[i]) return 2;
  }
  for (let i = 0; i < m.S; i++) {
    let hit = 0;
    for (let k = 0; k < m.fleet[i]!; k++) hit += s.shots[cellOf(s, i, k, m.N)]! >= HIT ? 1 : 0;
    if ((hit === m.fleet[i]!) !== !!s.sunk[i]) return 2;
  }
  return 0;
}
