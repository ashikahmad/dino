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

const resize = () => {
  renderer.resize();
  document.documentElement.style.setProperty('--canvas-h', canvas.style.height);
};
window.addEventListener('resize', resize);
resize();

// Sound on/off: a button for touch screens and the M key.
const muteButton = document.getElementById('mute') as HTMLButtonElement;
const showMuted = () => {
  muteButton.setAttribute('aria-pressed', String(game.sound.isMuted));
  muteButton.setAttribute('aria-label', game.sound.isMuted ? 'Sound off' : 'Sound on');
};
const toggleMute = () => {
  game.sound.setMuted(!game.sound.isMuted);
  showMuted();
};
showMuted();
muteButton.addEventListener('click', () => {
  toggleMute();
  muteButton.blur(); // keep the keyboard on the game
});
// taps on the button must not count as a jump
muteButton.addEventListener('pointerdown', (e) => e.stopPropagation());
muteButton.addEventListener('pointerup', (e) => e.stopPropagation());


// ---------------------------------------------------------------- start screen and about card
const panel = document.getElementById('panel') as HTMLDivElement;
const infoButton = document.getElementById('info') as HTMLButtonElement;
const closeButton = document.getElementById('close') as HTMLButtonElement;
const shareButton = document.getElementById('share') as HTMLButtonElement;
const shareLabel = document.getElementById('share-label') as HTMLSpanElement;
(document.getElementById('version') as HTMLElement).textContent = `v${__APP_VERSION__}`;

let aboutOpen = false;
const isAboutOpen = () => aboutOpen;

function syncPanel(): void {
  const idle = game.status === 'idle';
  panel.classList.toggle('overlay', aboutOpen);
  panel.classList.toggle('hidden', !idle && !aboutOpen);
  infoButton.hidden = game.status !== 'crashed' || aboutOpen;
}
function openAbout(): void {
  aboutOpen = true;
  syncPanel();
  closeButton.focus();
}
function closeAbout(): void {
  aboutOpen = false;
  (document.activeElement as HTMLElement | null)?.blur();
  syncPanel();
}
infoButton.addEventListener('click', () => {
  infoButton.blur();
  openAbout();
});
closeButton.addEventListener('click', closeAbout);
// tapping the card (but not its links or buttons) dismisses it
panel.addEventListener('click', (e) => {
  if (aboutOpen && !(e.target as Element).closest('a, button')) closeAbout();
});
// taps on the panel's links and buttons, or anywhere on the open card, must not count as a jump
for (const el of [infoButton, ...panel.querySelectorAll<HTMLElement>('a, button')]) {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('pointerup', (e) => e.stopPropagation());
}
panel.addEventListener('pointerdown', (e) => {
  if (aboutOpen) e.stopPropagation();
});
panel.addEventListener('pointerup', (e) => {
  if (aboutOpen) e.stopPropagation();
});

let shareTimer = 0;
const flashShareLabel = (text: string) => {
  shareLabel.textContent = text;
  window.clearTimeout(shareTimer);
  shareTimer = window.setTimeout(() => (shareLabel.textContent = 'Share'), 1800);
};
shareButton.addEventListener('click', async () => {
  shareButton.blur();
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Dino', text: "Chrome's offline dino game in WebGL, from day to night.", url });
      return;
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    flashShareLabel('Link copied');
  } catch {
    flashShareLabel(url);
  }
});

const isJump = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'ArrowUp';

window.addEventListener('keydown', (e) => {
  if (isAboutOpen()) {
    if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyI') {
      e.preventDefault();
      closeAbout();
    }
    return;
  }
  if (e.code === 'KeyI' && game.status === 'crashed' && !e.repeat) {
    openAbout();
    return;
  }
  if (isJump(e)) {
    e.preventDefault();
    if (!e.repeat) game.pressJump();
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    game.pressDown();
  } else if (e.code === 'KeyM' && !e.repeat) {
    toggleMute();
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
  game.sound.unlock(); // touch screens only count a finished tap as permission to play audio
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
  syncPanel();
  game.render();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
