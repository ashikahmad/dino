// The panel around the canvas: the start screen while idle, and the About card on request.
// Also the Share button, which lives on it.

import type { Game } from './game';

/** How much room there is above and below the canvas decides what the start screen can show. */
export type Room = 'full' | 'compact' | 'tight';

const panel = document.getElementById('panel') as HTMLDivElement;
let game: Game;
let getRoom: () => Room = () => 'full';

export function initPanel(g: Game, room: () => Room): void {
  game = g;
  getRoom = room;
}

/** The About card is one tap away after a crash, and on the start screen when that screen cannot show everything. */
export const aboutReachable = () => (game.status === 'crashed' && !game.race) || (game.status === 'idle' && getRoom() !== 'full');

const infoButton = document.getElementById('info') as HTMLButtonElement;
const closeButton = document.getElementById('close') as HTMLButtonElement;
const shareButton = document.getElementById('share') as HTMLButtonElement;
const shareLabel = document.getElementById('share-label') as HTMLSpanElement;
(document.getElementById('version') as HTMLElement).textContent = `v${__APP_VERSION__}`;

let aboutOpen = false;
export const isAboutOpen = () => aboutOpen;

let overlayTimer = 0;
export function syncPanel(): void {
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
  infoButton.hidden = aboutOpen || !aboutReachable();
}
export function openAbout(): void {
  aboutOpen = true;
  syncPanel();
  closeButton.focus();
}
export function closeAbout(): void {
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
