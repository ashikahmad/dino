import { initBar } from './bar';
import { Game } from './game';
import { initInput } from './input';
import { initMultiplayer, tickMultiplayer } from './multiplayer';
import { initPanel, syncPanel, type Room } from './panel';
import { Renderer } from './renderer';
import { Scene } from './scene';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const panel = document.getElementById('panel') as HTMLDivElement;
const renderer = new Renderer(canvas);
const game = new Game();
const scene = new Scene(renderer);
(window as unknown as { dino: Game }).dino = game;

// Start the day/night cycle to match the viewer's surroundings.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
game.setPreferDark(prefersDark.matches);
prefersDark.addEventListener('change', (e) => game.setPreferDark(e.matches));

let room: Room = 'full';
const resize = () => {
  renderer.resize();
  game.invalidate(); // resizing clears the canvas
  document.documentElement.style.setProperty('--canvas-h', canvas.style.height);
  const free = Math.max(0, (window.innerHeight - parseFloat(canvas.style.height)) / 2);
  room = free >= 145 ? 'full' : free >= 90 ? 'compact' : 'tight';
  panel.dataset.room = room;
  panel.style.setProperty('--room', `${free}px`);
};
window.addEventListener('resize', resize);
resize();

initBar(game, resize);
initPanel(game, () => room);
initInput(game);
initMultiplayer(game, canvas);
syncPanel();

let last = performance.now();
let lastStatus = game.status;
const frame = (t: number) => {
  game.update(t - last);
  last = t;
  if (game.status !== lastStatus) {
    lastStatus = game.status;
    syncPanel(); // the panel only follows the game's state, so there is nothing to do on other frames
  }
  tickMultiplayer(t);
  if (game.needsRender()) scene.render(game);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
