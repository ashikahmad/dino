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

const panel = document.getElementById('panel') as HTMLDivElement;
// How much room there is above and below the canvas decides what the start screen can show.
type Room = 'full' | 'compact' | 'tight';
let room: Room = 'full';
const resize = () => {
  renderer.resize();
  document.documentElement.style.setProperty('--canvas-h', canvas.style.height);
  const free = Math.max(0, (window.innerHeight - parseFloat(canvas.style.height)) / 2);
  room = free >= 145 ? 'full' : free >= 90 ? 'compact' : 'tight';
  panel.dataset.room = room;
  panel.style.setProperty('--room', `${free}px`);
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



// ----------------------------------------------------------------------- fullscreen
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fsDoc = document as FsDoc;
const fsRoot = document.documentElement as FsEl;
const fsButton = document.getElementById('fs') as HTMLButtonElement;
const canFullscreen = Boolean(fsDoc.fullscreenEnabled || fsDoc.webkitFullscreenEnabled);
const isFullscreen = () => Boolean(fsDoc.fullscreenElement || fsDoc.webkitFullscreenElement);

function syncFullscreen(): void {
  const on = isFullscreen();
  fsButton.setAttribute('aria-pressed', String(on));
  fsButton.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  fsButton.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
  resize(); // some browsers report the new size late
}
function toggleFullscreen(): void {
  if (!canFullscreen) return;
  try {
    const result = isFullscreen()
      ? (fsDoc.exitFullscreen ?? fsDoc.webkitExitFullscreen)?.call(document)
      : (fsRoot.requestFullscreen ?? fsRoot.webkitRequestFullscreen)?.call(fsRoot);
    void Promise.resolve(result).catch(() => {});
  } catch {
    /* refused: leave things as they are */
  }
}
fsButton.hidden = !canFullscreen;
fsButton.addEventListener('click', () => {
  toggleFullscreen();
  fsButton.blur();
});
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('webkitfullscreenchange', syncFullscreen);
// iPhone Safari cannot fullscreen a web page; the home-screen app can
const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
(document.getElementById('ios-hint') as HTMLElement).hidden = !(isIPhone && !canFullscreen && !standalone);

// ---------------------------------------------------------------- start screen and about card
const infoButton = document.getElementById('info') as HTMLButtonElement;
const closeButton = document.getElementById('close') as HTMLButtonElement;
const shareButton = document.getElementById('share') as HTMLButtonElement;
const shareLabel = document.getElementById('share-label') as HTMLSpanElement;
(document.getElementById('version') as HTMLElement).textContent = `v${__APP_VERSION__}`;

let aboutOpen = false;
const isAboutOpen = () => aboutOpen;

let overlayTimer = 0;
function syncPanel(): void {
  const idle = game.status === 'idle';
  panel.classList.toggle('hidden', !idle && !aboutOpen);
  if (aboutOpen || idle) {
    // the card layout while the card is open, the start-screen layout while idle
    window.clearTimeout(overlayTimer);
    overlayTimer = 0;
    panel.classList.toggle('overlay', aboutOpen);
    panel.classList.remove('instant');
  } else if (panel.classList.contains('overlay') && !overlayTimer) {
    // closed over the game-over screen: let the card fade out where it is, then drop its layout
    overlayTimer = window.setTimeout(() => {
      overlayTimer = 0;
      if (!aboutOpen) panel.classList.remove('overlay');
    }, 400);
  }
  // the About card is one tap away after a crash, and on the start screen when it cannot show everything
  const reachable = game.status === 'crashed' || (idle && room !== 'full');
  infoButton.hidden = aboutOpen || !reachable;
}
function openAbout(): void {
  aboutOpen = true;
  syncPanel();
  closeButton.focus();
}
function closeAbout(): void {
  aboutOpen = false;
  // over the game-over screen the card just goes, revealing the scene as it was (no fading contents)
  if (game.status !== 'idle') panel.classList.add('instant');
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
for (const el of [infoButton, fsButton, ...panel.querySelectorAll<HTMLElement>('a, button')]) {
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
  if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    toggleFullscreen();
    return;
  }
  if (e.code === 'KeyI' && !e.repeat && (game.status === 'crashed' || (game.status === 'idle' && room !== 'full'))) {
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
// Each finger is tracked on its own, and only if it started on the game: a press that began on a
// button, or a stray move, must never count as a swipe (a swipe that is never released leaves the dino ducking).
const gestures = new Map<number, { startY: number; swiped: boolean }>();
window.addEventListener('pointerdown', (e) => {
  gestures.set(e.pointerId, { startY: e.clientY, swiped: false });
  game.pressJump();
});
window.addEventListener('pointermove', (e) => {
  const g = gestures.get(e.pointerId);
  if (g && !g.swiped && e.clientY - g.startY > 24) {
    g.swiped = true;
    game.pressDown();
  }
});
const pointerEnd = (e: PointerEvent) => {
  game.sound.unlock(); // touch screens only count a finished tap as permission to play audio
  const g = gestures.get(e.pointerId);
  if (!g) return;
  gestures.delete(e.pointerId);
  game.releaseJump();
  if (g.swiped) game.releaseDown();
};
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);
// if the page loses focus mid-gesture, let go of everything
window.addEventListener('blur', () => {
  if ([...gestures.values()].some((g) => g.swiped)) game.releaseDown();
  gestures.clear();
});

let last = performance.now();
const frame = (t: number) => {
  game.update(t - last);
  last = t;
  syncPanel();
  game.render();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
