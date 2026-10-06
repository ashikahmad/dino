// Racing friends on the same Wi-Fi: the guided journey (how to host, then the lobby), the race
// itself (everyone gets the same obstacles and sees the others as ghosts) and the results.
// The relay server is server/host.mjs; when the page is not served by it (GitHub Pages, say),
// the card just walks the player through starting one.

import type { Game } from './game';
import { Net, probeHost, type HostInfo, type PlayerInfo, type RankRow, type ServerMessage } from './net';
import { qrSvg } from './qr';
import { DINO_GROUND_Y, type Ghost } from './world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = $('mp');
const hud = $('hud');
const nameInput = $<HTMLInputElement>('mp-name');
const startButton = $<HTMLButtonElement>('mp-start');
const againButton = $<HTMLButtonElement>('mp-again');
const NAME_KEY = 'dino-name';
const SEND_EVERY_MS = 66; // how often we tell the others where we are
const HUD_EVERY_MS = 250;

type View = 'guide' | 'lobby' | 'results' | 'error';

let game: Game;
let canvas: HTMLCanvasElement;
let host: HostInfo | null = null;
const net = new Net();

let me = 0;
let hostId: number | null = null;
let phase: 'lobby' | 'racing' | 'results' = 'lobby';
let players: PlayerInfo[] = [];
let racing = false; // this player is in a race
const ghosts = new Map<number, Ghost>();
let lastSend = 0;
let lastHud = 0;

export const isMultiplayerOpen = () => root.classList.contains('open');

function setView(view: View): void {
  root.dataset.view = view;
  $('mp-title').textContent =
    view === 'results' ? 'Results' : view === 'lobby' ? 'Waiting for the race' : view === 'error' ? 'Something went wrong' : 'Race friends on your Wi-Fi';
}

function showError(text: string): void {
  $('mp-error').textContent = text;
  setView('error');
}

const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

// ------------------------------------------------------------------------------ opening
export async function openMultiplayer(): Promise<void> {
  (document.activeElement as HTMLElement | null)?.blur();
  root.classList.add('open');
  if (net.connected) return;
  host = await probeHost();
  if (!host) {
    setView('guide');
    return;
  }
  await connect();
}

async function connect(): Promise<void> {
  setView('lobby');
  $('mp-status').textContent = 'Connecting…';
  net.onMessage = handle;
  net.onClose = () => {
    if (!isMultiplayerOpen() && !racing) return;
    exitRace();
    showError('The connection to the host was lost. Is it still running?');
    root.classList.add('open');
  };
  try {
    await net.connect();
  } catch {
    showError('Could not reach the host. Check that it is still running and you are on the same Wi-Fi.');
    return;
  }
  nameInput.value = savedName();
  net.send({ t: 'hello', name: nameInput.value });
  showJoinCode();
}

function showJoinCode(): void {
  if (!host) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = local && host.urls[0] ? host.urls[0] : `${location.origin}/`;
  $('qr').innerHTML = qrSvg(`${base}?join`);
  $('join-url').textContent = base.replace(/^http:\/\//, '');
}

export function closeMultiplayer(): void {
  net.close();
  me = 0;
  hostId = null;
  players = [];
  exitRace();
  root.classList.remove('open');
}

/** Stop racing and go back to the start screen. */
function exitRace(): void {
  racing = false;
  ghosts.clear();
  hud.hidden = true;
  if (game.race) game.leaveRace();
}

// --------------------------------------------------------------------- server messages
function handle(m: ServerMessage): void {
  switch (m.t) {
    case 'welcome':
      me = m.id;
      nameInput.placeholder = `Dino ${m.id}`;
      break;
    case 'players':
      phase = m.phase;
      hostId = m.hostId;
      players = m.list;
      if (m.phase === 'lobby') {
        if (racing || root.dataset.view === 'results') {
          exitRace(); // the host started a new round
          root.classList.add('open');
        }
        if (root.dataset.view !== 'error') setView('lobby');
      }
      render();
      break;
    case 'go':
      beginRace(m.seed, m.startIn);
      break;
    case 'state': {
      const g = ghosts.get(m.id);
      if (g) Object.assign(g, { y: m.y, score: m.s, jumping: m.j, ducking: m.d });
      break;
    }
    case 'dead': {
      const g = ghosts.get(m.id);
      if (g) Object.assign(g, { alive: false, score: m.s });
      refreshHud();
      break;
    }
    case 'results':
      showResults(m.ranking);
      break;
    case 'full':
      showError(`This race is full (${m.max} players).`);
      break;
  }
}

function beginRace(seed: number, startIn: number): void {
  racing = true;
  ghosts.clear();
  for (const p of players) {
    if (p.id === me) continue;
    ghosts.set(p.id, { id: p.id, name: p.name, y: DINO_GROUND_Y, shownY: DINO_GROUND_Y, score: 0, alive: true, jumping: false, ducking: false });
  }
  game.ghosts = [...ghosts.values()];
  root.classList.remove('open');
  game.startRace(seed, startIn);
  hud.hidden = false;
  lastSend = 0;
  refreshHud();
}

function showResults(ranking: RankRow[]): void {
  racing = false;
  hud.hidden = true;
  const list = $('mp-ranking');
  list.replaceChildren(
    ...ranking.map((r, i) => {
      const li = document.createElement('li');
      if (r.id === me) li.className = 'me';
      const left = document.createElement('span');
      left.textContent = `${i + 1}. ${r.name}${r.id === me ? ' (you)' : ''}`;
      const right = document.createElement('b');
      right.textContent = String(r.score).padStart(5, '0');
      li.append(left, right);
      return li;
    }),
  );
  const youHost = me === hostId;
  againButton.hidden = !youHost;
  $('mp-result-status').textContent = youHost ? '' : 'Waiting for the host to start another round…';
  setView('results');
  root.classList.add('open');
}

// ------------------------------------------------------------------------------ lobby UI
function render(): void {
  const list = $('mp-list');
  list.replaceChildren(
    ...players.map((p) => {
      const li = document.createElement('li');
      if (p.id === me) li.className = 'me';
      const left = document.createElement('span');
      left.textContent = p.name + (p.id === me ? ' (you)' : '');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.id === hostId ? 'host' : '';
      li.append(left, tag);
      return li;
    }),
  );
  const youHost = me === hostId;
  startButton.hidden = !youHost;
  startButton.disabled = players.length < 2 || phase !== 'lobby';
  $('mp-status').textContent =
    phase !== 'lobby'
      ? 'A race is under way. You will join the next one.'
      : youHost
        ? players.length < 2
          ? 'Waiting for friends to join…'
          : 'Everyone here? Start the race.'
        : 'Waiting for the host to start…';
}

// ---------------------------------------------------------------------- the race, per frame
const pad = (n: number) => String(Math.min(Math.floor(n), 99999)).padStart(5, '0');

function refreshHud(): void {
  const rect = canvas.getBoundingClientRect();
  // above the canvas when there is room (several rows would cover the playfield), else over its corner
  hud.style.left = `${rect.left + 6}px`;
  hud.style.width = `${rect.width - 12}px`;
  if (rect.top >= 56) {
    hud.style.top = 'auto';
    hud.style.bottom = `${window.innerHeight - rect.top + 6}px`;
  } else {
    hud.style.bottom = 'auto';
    hud.style.top = `${rect.top + 4}px`;
  }
  const rows = [
    { id: me, name: nameInput.value.trim() || `Dino ${me}`, score: game.score, alive: game.status !== 'crashed' },
    ...[...ghosts.values()].map((g) => ({ id: g.id, name: g.name, score: g.score, alive: g.alive })),
  ].sort((a, b) => b.score - a.score || a.id - b.id);
  hud.replaceChildren(
    ...rows.map((r) => {
      const d = document.createElement('div');
      d.className = (r.id === me ? 'me ' : '') + (r.alive ? '' : 'out');
      d.textContent = `${r.name.slice(0, 10).padEnd(10)} ${pad(r.score)}`;
      return d;
    }),
  );
}

/** Called every frame: tell the others where we are, glide their ghosts, keep the scoreboard fresh. */
export function tickMultiplayer(now: number): void {
  if (!racing || !game.race) return;
  for (const g of ghosts.values()) g.shownY += (g.y - g.shownY) * 0.35;
  if (game.status === 'running' && now - lastSend >= SEND_EVERY_MS) {
    lastSend = now;
    net.send({ t: 'state', y: game.dinoY, s: game.score, j: game.jumping, d: game.ducking });
  }
  if (now - lastHud >= HUD_EVERY_MS) {
    lastHud = now;
    refreshHud();
  }
}

// ------------------------------------------------------------------------------- set up
export function initMultiplayer(g: Game, c: HTMLCanvasElement): void {
  game = g;
  canvas = c;
  game.onCrash = (score) => {
    if (racing) net.send({ t: 'dead', s: score });
  };

  $('play-friends').addEventListener('click', () => void openMultiplayer());
  for (const id of ['mp-close', 'mp-leave', 'mp-leave2', 'mp-leave3']) $(id).addEventListener('click', closeMultiplayer);
  $('mp-retry').addEventListener('click', () => {
    net.close();
    void (async () => {
      host = await probeHost();
      if (host) await connect();
      else setView('guide');
    })();
  });
  startButton.addEventListener('click', () => net.send({ t: 'start' }));
  againButton.addEventListener('click', () => net.send({ t: 'lobby' }));

  const copy = $<HTMLButtonElement>('copy-cmd');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('cmd').textContent ?? '');
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select and copy';
    }
    window.setTimeout(() => (copy.textContent = 'Copy'), 1800);
  });

  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim();
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* storage unavailable */
    }
    net.send({ t: 'name', name });
  });

  // taps inside the card must never count as a jump
  for (const type of ['pointerdown', 'pointerup']) root.addEventListener(type, (e) => e.stopPropagation());

  // a phone that scanned the host's QR code lands here with ?join and goes straight to the lobby
  void probeHost().then((info) => {
    host = info;
    if (info && /[?&]join\b/.test(location.search)) void openMultiplayer();
  });
}
