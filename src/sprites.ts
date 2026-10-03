// Sprites for the atlas. The dino, cacti, pterodactyl, clouds, stars, ground, digits and
// text come from the pixel art in art.ts; the sun and moon are drawn here. Every sprite is
// 1-bit (ink or nothing) and coloured in the shader, so there are no anti-aliased edges
// and no dark fringes when the background changes.

import { ART } from './art';

export interface Sprite {
  x: number; // atlas position
  y: number;
  w: number;
  h: number;
}

class Bmp {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h);
  }
  static fromRows(rows: readonly string[]): Bmp {
    const b = new Bmp(rows[0].length, rows.length);
    rows.forEach((row, y) => {
      if (row.length !== b.w) throw new Error(`sprite row ${y} is ${row.length} wide, expected ${b.w}`);
      for (let x = 0; x < b.w; x++) b.px[y * b.w + x] = row[x] === '#' ? 1 : 0;
    });
    return b;
  }
  static rule(w: number, h: number, f: (x: number, y: number) => boolean): Bmp {
    const b = new Bmp(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.px[y * w + x] = f(x + 0.5, y + 0.5) ? 1 : 0;
    return b;
  }
}

// Sun and moon share the same diameter. The moon is a disc minus an offset disc.
const sun = () => Bmp.rule(24, 24, (x, y) => (x - 12) ** 2 + (y - 12) ** 2 <= 11.5 ** 2);
const moon = () =>
  Bmp.rule(
    24,
    24,
    (x, y) => (x - 12) ** 2 + (y - 12) ** 2 <= 11.5 ** 2 && !((x - 17.5) ** 2 + (y - 12) ** 2 <= 10.5 ** 2),
  );

const { digits, letters, ...art } = ART;

const defs = {
  ...(Object.fromEntries(Object.entries(art).map(([k, rows]) => [k, Bmp.fromRows(rows)])) as Record<
    keyof typeof art,
    Bmp
  >),
  moon: moon(),
  sun: sun(),
};

export type SpriteName = keyof typeof defs;
export type Sprites = Record<SpriteName, Sprite> & { glyphs: Record<string, Sprite> };

export interface Atlas {
  width: number;
  height: number;
  pixels: Uint8Array; // RGBA, white with alpha 0 or 255
  sprites: Sprites;
}

export function buildAtlas(): Atlas {
  const items: { key: string; bmp: Bmp }[] = [
    ...Object.entries(defs).map(([key, bmp]) => ({ key, bmp })),
    ...digits.map((rows, i) => ({ key: `glyph:${i}`, bmp: Bmp.fromRows(rows) })),
    ...Object.entries(letters).map(([ch, rows]) => ({ key: `glyph:${ch}`, bmp: Bmp.fromRows(rows) })),
  ];
  items.sort((a, b) => b.bmp.h - a.bmp.h);

  // shelf packing with 1px transparent padding so scaled sampling never bleeds
  const width = 2048;
  const placed: { key: string; bmp: Bmp; x: number; y: number }[] = [];
  let x = 1, y = 1, rowH = 0;
  for (const it of items) {
    if (x + it.bmp.w + 1 > width) {
      x = 1;
      y += rowH + 1;
      rowH = 0;
    }
    placed.push({ ...it, x, y });
    x += it.bmp.w + 1;
    rowH = Math.max(rowH, it.bmp.h);
  }
  const height = 1 << Math.ceil(Math.log2(y + rowH + 1));

  const pixels = new Uint8Array(width * height * 4);
  const sprites: Record<string, Sprite> = {};
  const glyphs: Record<string, Sprite> = {};
  for (const p of placed) {
    for (let j = 0; j < p.bmp.h; j++) {
      for (let i = 0; i < p.bmp.w; i++) {
        const o = ((p.y + j) * width + p.x + i) * 4;
        pixels.fill(255, o, o + 3);
        pixels[o + 3] = p.bmp.px[j * p.bmp.w + i] ? 255 : 0;
      }
    }
    const spr = { x: p.x, y: p.y, w: p.bmp.w, h: p.bmp.h };
    if (p.key.startsWith('glyph:')) glyphs[p.key.slice(6)] = spr;
    else sprites[p.key] = spr;
  }
  return { width, height, pixels, sprites: { ...(sprites as Record<SpriteName, Sprite>), glyphs } };
}
