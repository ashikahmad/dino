// Keyboard, mouse and touch input: Space/Up jump, Down duck, M sound, F fullscreen, I info.
// Tap or click anywhere to jump, swipe down to duck.

import { toggleFullscreen, toggleMute } from './bar';
import type { Game } from './game';
import { closeMultiplayer, isMultiplayerOpen } from './multiplayer';
import { aboutReachable, closeAbout, isAboutOpen, openAbout } from './panel';

export function initInput(game: Game): void {
  const isJump = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'ArrowUp';

  window.addEventListener('keydown', (e) => {
    if (isMultiplayerOpen()) {
      // the multiplayer card has its own buttons and a name box; keys must not reach the game
      if (e.code === 'Escape') closeMultiplayer();
      return;
    }
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
    if (e.code === 'KeyI' && !e.repeat && aboutReachable()) {
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
    if (isMultiplayerOpen()) return;
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
}
