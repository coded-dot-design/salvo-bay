// Salvo Bay online: two screens, one match, over a fizlet-rooms room (@fzlt/core/presence's `join`,
// the same room server and lobby Battlefield Blitz uses). A turn game needs no lockstep: every
// message is one of presence's 12-byte INPUT messages, its frame a rising number per seat (the room
// relays each number once, in order, and replays the last 64 to a seat that reconnects) and its
// value one move: op in the top 4 bits, the move's data under it.
//   COMMIT  the 28-bit hash of your fleet and a secret salt (model.ts commit), before the first shot
//   FIRE    a cell; the screen that holds that fleet answers it
//   ANSWER  cell | result << 8 | ship << 10 | the sunk ship's place << 13
//   REVEAL  ship | place << 3, one per ship at the end; SALT the salt: the other screen checks the
//           fleet against the commit and against every answer (model.ts verify)
//   REMATCH both ask, a new round starts; CONCEDE gives up; PING keeps the room open while you think
// Fleets never cross the wire until the end, so neither screen can peek.
import { join, AWAY, INPUT, LEAVE, RESUME, type Transport } from "@fzlt/core/presence";
import { OP_ANSWER, OP_AWAY, OP_BACK, OP_COMMIT, OP_CONCEDE, OP_FIRE, OP_LEFT, OP_REMATCH, OP_REVEAL, OP_SALT, type Link } from "./scene";

const W_COMMIT = 1, W_FIRE = 2, W_ANSWER = 3, W_REVEAL = 4, W_SALT = 5, W_REMATCH = 6, W_CONCEDE = 7, W_PING = 8;
/** The room closes after 120 s with nothing relayed: a ping every 40 s while a player thinks. */
const PING_MS = 40000;

/** A Link over a room transport for `seat` (0 is the host: it fires first in round 1). */
export function roomLink(t: Transport, seat: number) {
  let seq = 0, last = 0, fn: ((op: number, a: number, b: number) => void) | null = null, closed = false;
  const out = new Uint8Array(12), sent: number[] = [], early: number[] = [], wait = new Map<number, number>();
  const emit = (op: number, a: number, b = 0) => (fn ? fn(op, a, b) : early.push(op, a, b));
  const raw = (f: number, value: number) => {
    out.fill(0);
    (out[0] = INPUT), (out[1] = seat);
    for (let k = 0; k < 4; k++) (out[4 + k] = (f >>> (k * 8)) & 255), (out[8 + k] = (value >>> (k * 8)) & 255);
    t.send(out);
  };
  const send = (op: number, data: number) => {
    if (closed) return;
    const v = ((op & 15) << 28) | (data & 0x0fffffff);
    seq++;
    sent.push(seq, v >>> 0);
    if (sent.length > 128) sent.splice(0, 2);
    raw(seq, v >>> 0);
  };
  const deliver = (v: number) => {
    const op = v >>> 28, d = v & 0x0fffffff;
    if (op === W_COMMIT) emit(OP_COMMIT, d);
    else if (op === W_FIRE) emit(OP_FIRE, d & 255);
    else if (op === W_ANSWER) emit(OP_ANSWER, d & 0x1fff, (d >>> 13) & 511);
    else if (op === W_REVEAL) emit(OP_REVEAL, d & 7, (d >>> 3) & 511);
    else if (op === W_SALT) emit(OP_SALT, d);
    else if (op === W_REMATCH) emit(OP_REMATCH, 0);
    else if (op === W_CONCEDE) emit(OP_CONCEDE, 0);
  };
  t.listen((d) => {
    if (d.length < 12) return;
    const k = d[0]!, s = d[1]!, f = (d[4]! | (d[5]! << 8) | (d[6]! << 16) | (d[7]! << 24)) >>> 0, v = (d[8]! | (d[9]! << 8) | (d[10]! << 16) | (d[11]! << 24)) >>> 0;
    if (k === LEAVE && s !== seat) return emit(OP_LEFT, 0);
    if (k === AWAY && s !== seat) return emit(OP_AWAY, 0);
    if (k === RESUME) {
      // Back (us or them): send our recent moves again; the room passes on only the ones it never had.
      for (let i = 0; i < sent.length; i += 2) raw(sent[i]!, sent[i + 1]!);
      return s !== seat && emit(OP_BACK, 0);
    }
    if (k !== INPUT || s === seat || f <= last) return;
    // In order: a move that skipped ahead waits for the ones before it.
    if (f !== last + 1) return void (wait.size < 256 && wait.set(f, v));
    deliver(v);
    last = f;
    for (let n = wait.get(last + 1); n !== undefined; n = wait.get(last + 1)) wait.delete(last + 1), deliver(n), last++;
  });
  const ping = setInterval(() => send(W_PING, 0), PING_MS);
  const link: Link & { close(): void; readonly sent: number; readonly heard: number } = {
    seat,
    fire: (cell) => send(W_FIRE, cell),
    answer: (cell, res, ship, packed) => send(W_ANSWER, (cell & 255) | ((res & 3) << 8) | ((ship & 7) << 10) | ((packed & 511) << 13)),
    commit: (hash) => send(W_COMMIT, hash),
    reveal(ships, count, salt) {
      for (let i = 0; i < count; i++) send(W_REVEAL, (i & 7) | ((ships[i]! & 511) << 3));
      send(W_SALT, salt & 0xffffff);
    },
    rematch: () => send(W_REMATCH, 0),
    concede: () => send(W_CONCEDE, 0),
    listen(f) {
      fn = f;
      while (f && early.length) f(early.shift()!, early.shift()!, early.shift()!);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      t.close();
    },
    get sent() {
      return seq;
    },
    get heard() {
      return last;
    },
  };
  return link;
}
export type RoomLink = ReturnType<typeof roomLink>;

/** Two links joined in memory (tests and a one-page demo): what one sends, the other hears. `delay`
 *  ms per message. */
export function pair(delay = 0) {
  const ends: Transport[] = [], fns: (((d: Uint8Array) => void) | null)[] = [null, null];
  for (let p = 0; p < 2; p++)
    ends.push({
      send(d) {
        const c = d.slice();
        c[1] = p;
        delay ? setTimeout(() => fns[1 - p]?.(c), delay) : queueMicrotask(() => fns[1 - p]?.(c));
      },
      listen: (f) => (fns[p] = f),
      close: () => {
        fns[p] = null;
        const bye = new Uint8Array(12);
        (bye[0] = LEAVE), (bye[1] = p);
        queueMicrotask(() => fns[1 - p]?.(bye));
      },
    });
  return [roomLink(ends[0]!, 0), roomLink(ends[1]!, 1)] as const;
}

/** Join room `room` on a fizlet-rooms server (`url`: wss://…) with an invite code or a pass:
 *  resolves with the link, your seat and the match's bay once both players are in. The host (seat
 *  0) picks the bay: its START carries it to the guest. `lobby` hears who is in while you wait. */
export async function joinRoom(url: string, room: number, cred: { code?: string; pass?: string; device?: string }, bay: number, signal?: AbortSignal, lobby?: (seat: number, seated: number) => void) {
  const protocols = cred.pass ? ["fizlet-rooms", "pass." + cred.pass, "device." + cred.device] : ["fizlet-rooms", "invite." + cred.code];
  let asked = false;
  const s = await join(`${url}/room/${room}?players=2`, signal, protocols, {
    lobby(start, seat, seated) {
      lobby?.(seat, seated);
      // The host says "start when two are in" at once, and its bay rides along to the guest.
      if (seat === 0 && !asked) (asked = true), start(2, bay & 1);
    },
  });
  return { link: roomLink(s.transport, s.slot), seat: s.slot, seed: s.seed, bay: s.mode & 1 };
}
