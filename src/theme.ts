// Keeps the page around the canvas in step with the game's colours. Writing styles repaints the
// whole page, so this only writes when the colour has changed in 8-bit terms (never on a still frame).

import type { RGB } from './renderer';

const to8 = (c: number) => Math.round(c * 255);
const css = (c: RGB) => `rgb(${to8(c[0])},${to8(c[1])},${to8(c[2])})`;

let lastSky = '';
let lastFg = '';

export function applyTheme(sky: RGB, fg: RGB): void {
  const s = css(sky);
  if (s !== lastSky) {
    lastSky = s;
    document.body.style.background = s; // the About card inherits this
  }
  const f = css(fg);
  if (f !== lastFg) {
    lastFg = f;
    document.body.style.color = f; // text and buttons follow the sprite colour
  }
}
