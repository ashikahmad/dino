import { Game } from './game';
import { Renderer } from './renderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const game = new Game(renderer);
(window as unknown as { dino: Game }).dino = game;

// Start the day/night cycle to match the viewer's surroundings.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
game.setPreferDark(prefersDark.matches);
prefersDark.addEventListener('change', (e) => game.setPreferDark(e.matches));

const resize = () => renderer.resize();
window.addEventListener('resize', resize);
resize();

const isJump = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'ArrowUp';

window.addEventListener('keydown', (e) => {
  if (isJump(e)) {
    e.preventDefault();
    if (!e.repeat) game.pressJump();
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    game.pressDown();
  }
});
window.addEventListener('keyup', (e) => {
  if (isJump(e)) game.releaseJump();
  else if (e.code === 'ArrowDown') game.releaseDown();
});

// Touch / mouse: tap or click anywhere on the page to jump, swipe down to duck.
let startY = 0;
let swiped = false;
window.addEventListener('pointerdown', (e) => {
  startY = e.clientY;
  swiped = false;
  game.pressJump();
});
window.addEventListener('pointermove', (e) => {
  if (!swiped && e.buttons && e.clientY - startY > 24) {
    swiped = true;
    game.pressDown();
  }
});
const pointerEnd = () => {
  game.releaseJump();
  if (swiped) game.releaseDown();
  swiped = false;
};
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);

let last = performance.now();
const frame = (t: number) => {
  game.update(t - last);
  last = t;
  game.render();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
