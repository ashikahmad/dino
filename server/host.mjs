// Hosts a local race: serves the built game and relays messages between the players on the
// same Wi-Fi. Run with `npm run host`. There is one lobby; everyone who opens the address joins it.
//
// Messages (JSON):
//   client -> server  hello {name}  name {name}  start  state {y, s, j, d}  dead {s}  lobby
//   server -> client  welcome {id}  players {phase, hostId, list}  go {seed, startIn, racers}
//                     state {id, y, s, j, d}  dead {id, s}  results {ranking}  full

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import qrcode from 'qrcode-generator';

const PORT = Number(process.env.PORT) || 8787;
const MAX_PLAYERS = 6;
const COUNTDOWN_MS = 3000;
const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

/** Addresses other devices on the Wi-Fi can reach this computer at (private IPv4 ranges first). */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  const privateFirst = (a) => (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) ? 0 : 1);
  return out.sort((a, b) => privateFirst(a) - privateFirst(b));
}
const urls = () => lanAddresses().map((a) => `http://${a}:${PORT}/`);

// ----------------------------------------------------------------------------- static files
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/lan.json') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ lan: true, max: MAX_PLAYERS, urls: urls() }));
      return;
    }
    let file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
});

// ------------------------------------------------------------------------------- the lobby
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

let nextId = 1;
let phase = 'lobby'; // lobby -> racing -> results -> lobby
const players = new Map(); // id -> { id, ws, name, racing, alive, score }

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (msg, exceptId) => {
  for (const p of players.values()) if (p.id !== exceptId) send(p.ws, msg);
};
const hostId = () => players.keys().next().value ?? null; // the longest-connected player hosts

function announce() {
  broadcast({
    t: 'players',
    phase,
    hostId: hostId(),
    list: [...players.values()].map((p) => ({ id: p.id, name: p.name, racing: p.racing })),
  });
}

function finishIfDone() {
  if (phase !== 'racing') return;
  const racers = [...players.values()].filter((p) => p.racing);
  if (racers.some((p) => p.alive)) return;
  phase = 'results';
  const ranking = racers.sort((a, b) => b.score - a.score).map((p) => ({ id: p.id, name: p.name, score: p.score }));
  broadcast({ t: 'results', ranking });
  announce();
}

/** A finite number clamped to a range (anything else becomes 0): players cannot send each other junk. */
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

const cleanName = (n) => String(n ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14);

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: 'full', max: MAX_PLAYERS });
    ws.close();
    return;
  }
  const id = nextId++;
  const me = { id, ws, name: `Dino ${id}`, racing: false, alive: false, score: 0 };
  players.set(id, me);
  send(ws, { t: 'welcome', id });
  announce();

  ws.on('message', (data) => {
    let m;
    try {
      m = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (m.t) {
      case 'hello':
      case 'name': {
        const name = cleanName(m.name);
        if (name) me.name = name;
        announce();
        break;
      }
      case 'start': {
        if (id !== hostId() || phase !== 'lobby' || players.size < 2) break;
        phase = 'racing';
        for (const p of players.values()) Object.assign(p, { racing: true, alive: true, score: 0 });
        broadcast({ t: 'go', seed: (Math.random() * 2 ** 32) >>> 0, startIn: COUNTDOWN_MS, racers: players.size });
        announce();
        break;
      }
      case 'state':
        if (phase === 'racing' && me.racing && me.alive) {
          me.score = num(m.s, 0, 99999);
          broadcast({ t: 'state', id, y: num(m.y, -200, 200), s: me.score, j: m.j === true, d: m.d === true }, id);
        }
        break;
      case 'dead':
        if (phase === 'racing' && me.racing && me.alive) {
          me.alive = false;
          me.score = num(m.s, 0, 99999) || me.score;
          broadcast({ t: 'dead', id, s: me.score });
          finishIfDone();
        }
        break;
      case 'lobby':
        if (id === hostId() && phase === 'results') {
          phase = 'lobby';
          for (const p of players.values()) p.racing = false;
          announce();
        }
        break;
    }
  });

  ws.on('close', () => {
    players.delete(id);
    if (!players.size) phase = 'lobby';
    else if (phase === 'racing') {
      me.alive = false;
      broadcast({ t: 'dead', id, s: me.score });
      finishIfDone();
    }
    announce();
  });
});

// ------------------------------------------------------------------------------ start up
function terminalQr(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = (dark) => (dark ? '\x1b[40m  \x1b[0m' : '\x1b[47m  \x1b[0m');
  const lines = [];
  for (let r = -2; r < n + 2; r++) {
    let line = '';
    for (let c = -2; c < n + 2; c++) line += cell(r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c));
    lines.push('    ' + line);
  }
  return lines.join('\n');
}

server.listen(PORT, '0.0.0.0', () => {
  const found = urls();
  console.log('\n  Dino race is ready.\n');
  if (!found.length) {
    console.log('  No Wi-Fi address found. Connect this computer to the network and run it again.\n');
    console.log(`  On this computer only: http://localhost:${PORT}/\n`);
    return;
  }
  console.log(`  1. Open this on the computer you are hosting from:\n       ${found[0]}\n`);
  console.log('  2. Friends on the same Wi-Fi scan this code with their camera:\n');
  console.log(terminalQr(`${found[0]}?join`));
  if (found.length > 1) console.log(`\n  Other addresses: ${found.slice(1).join('  ')}`);
  console.log('\n  Press Ctrl+C to stop.\n');
});
