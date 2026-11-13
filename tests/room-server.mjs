// A stand-in fizlet-rooms server for the online tests: the wire protocol @fzlt/core/presence speaks
// (12-byte messages; LOBBY, START, WELCOME, INPUT relayed with first write wins and rising frames,
// LEAVE on a close) and the invite check (POST /invite), on Node's own http with a minimal WebSocket
// (RFC 6455, binary frames only). Not the real server: no caps, no passes, no resume.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

export const CODE = "SALVO-TEST-CODE";
const INPUT = 1, HASH = 2, WELCOME = 3, LEAVE = 4, START = 7, LOBBY = 8;
const msg = (k, s, p, mode, a = 0, b = 0) => {
  const d = Buffer.alloc(12);
  (d[0] = k), (d[1] = s), (d[2] = p), (d[3] = mode);
  d.writeUInt32LE(a >>> 0, 4), d.writeUInt32LE(b >>> 0, 8);
  return d;
};

export function roomServer() {
  const rooms = new Map(), socks = new Set();
  const server = createServer((req, res) => {
    const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (req.url.startsWith("/invite") && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => (body.trim().toUpperCase() === CODE ? res.writeHead(200, cors).end('{"ok":true,"players":2}') : res.writeHead(403, cors).end('{"ok":false}')));
      return;
    }
    res.writeHead(404, cors).end("{}");
  });
  server.on("upgrade", (req, sock) => {
    const url = new URL(req.url, "http://x"), m = url.pathname.match(/^\/room\/(\d+)$/), protos = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim());
    if (!m || !protos.includes("invite." + CODE)) return sock.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: fizlet-rooms\r\n\r\n`);
    socks.add(sock);
    sock.on("close", () => socks.delete(sock));
    const players = Math.max(2, Number(url.searchParams.get("players")) || 2), key = m[1];
    let room = rooms.get(key);
    if (!room) rooms.set(key, (room = { seats: [], players, started: false, want: 0, mode: 0, seed: (Math.random() * 2 ** 32) >>> 0, frames: new Map() }));
    if (room.started || room.seats.filter(Boolean).length >= room.players) return sock.end();
    const peer = { sock, slot: room.seats.indexOf(null) < 0 ? room.seats.length : room.seats.indexOf(null), buf: Buffer.alloc(0), send: (d) => !sock.destroyed && sock.write(Buffer.concat([Buffer.from([0x82, d.length]), d])) };
    room.seats[peer.slot] = peer;
    const taken = () => room.seats.filter(Boolean);
    const lobby = () => room.seats.forEach((p, s) => p?.send(msg(LOBBY, s, room.players, taken().length)));
    const ready = () => {
      const n = taken().length;
      if (room.started || !(n === room.players || (room.want && n >= room.want))) return;
      room.started = true;
      room.seats.forEach((p, s) => p.send(msg(WELCOME, s, n, room.mode, room.seed, 1 + s)));
    };
    const leave = () => {
      if (room.seats[peer.slot] !== peer) return;
      room.seats[peer.slot] = null;
      if (room.started) room.seats.forEach((p) => p?.send(msg(LEAVE, peer.slot, room.players, 0)));
      if (!taken().length) rooms.delete(key);
      else if (!room.started) lobby();
    };
    sock.on("data", (chunk) => {
      peer.buf = Buffer.concat([peer.buf, chunk]);
      while (peer.buf.length >= 2) {
        const op = peer.buf[0] & 15, masked = peer.buf[1] & 128;
        let len = peer.buf[1] & 127, at = 2;
        if (len === 126) (len = peer.buf.readUInt16BE(2)), (at = 4);
        else if (len === 127) return sock.destroy();
        const end = at + (masked ? 4 : 0) + len;
        if (peer.buf.length < end) return;
        const mask = masked ? peer.buf.subarray(at, at + 4) : null, data = Buffer.from(peer.buf.subarray(end - len, end));
        if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
        peer.buf = peer.buf.subarray(end);
        if (op === 8) return leave(), sock.end(Buffer.from([0x88, 0]));
        if (op !== 2 || data.length !== 12) continue;
        if (!room.started) {
          if (data[0] === START && peer.slot === 0) (room.want = Math.max(1, data[2])), (room.mode = data[3]), ready();
          continue;
        }
        if (data[0] !== INPUT && data[0] !== HASH) continue;
        const k = peer.slot * 2 + data[0], f = data.readUInt32LE(4);
        if (f <= (room.frames.get(k) ?? -1)) continue;
        room.frames.set(k, f);
        data[1] = peer.slot;
        room.seats.forEach((p, s) => s !== peer.slot && p?.send(data));
      }
    });
    sock.on("close", leave);
    sock.on("error", leave);
    lobby();
    ready();
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `ws://127.0.0.1:${server.address().port}`, close: () => (socks.forEach((s) => s.destroy()), server.closeAllConnections?.(), server.close()) })));
}
