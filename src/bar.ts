// The icon bar: sound and fullscreen buttons (the info button belongs to the panel).

import type { Game } from './game';

let game: Game;
let onChange: () => void = () => {};

/** Wire up the bar. `onResize` runs when fullscreen changes, since some browsers report the new size late. */
export function initBar(g: Game, onResize: () => void): void {
  game = g;
  onChange = onResize;
  showMuted();
  muteButton.addEventListener('click', () => {
    toggleMute();
    muteButton.blur(); // keep the keyboard on the game
  });
  // taps on the button must not count as a jump
  muteButton.addEventListener('pointerdown', (e) => e.stopPropagation());
  muteButton.addEventListener('pointerup', (e) => e.stopPropagation());
  fsButton.hidden = !canFullscreen;
  fsButton.addEventListener('pointerdown', (e) => e.stopPropagation());
  fsButton.addEventListener('pointerup', (e) => e.stopPropagation());
  fsButton.addEventListener('click', () => {
    toggleFullscreen();
    fsButton.blur();
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  // iPhone Safari cannot fullscreen a web page; the home-screen app can
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  (document.getElementById('ios-hint') as HTMLElement).hidden = !(isIPhone && !canFullscreen && !standalone);
}

// ----------------------------------------------------------------------- sound
const muteButton = document.getElementById('mute') as HTMLButtonElement;
const showMuted = () => {
  muteButton.setAttribute('aria-pressed', String(game.sound.isMuted));
  muteButton.setAttribute('aria-label', game.sound.isMuted ? 'Sound off' : 'Sound on');
};
export const toggleMute = () => {
  game.sound.setMuted(!game.sound.isMuted);
  showMuted();
};

// ----------------------------------------------------------------------- fullscreen
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fsDoc = document as FsDoc;
const fsRoot = document.documentElement as FsEl;
const fsButton = document.getElementById('fs') as HTMLButtonElement;
export const canFullscreen = Boolean(fsDoc.fullscreenEnabled || fsDoc.webkitFullscreenEnabled);
const isFullscreen = () => Boolean(fsDoc.fullscreenElement || fsDoc.webkitFullscreenElement);

function syncFullscreen(): void {
  const on = isFullscreen();
  fsButton.setAttribute('aria-pressed', String(on));
  fsButton.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  fsButton.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
  onChange();
}

export function toggleFullscreen(): void {
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
