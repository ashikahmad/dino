// Hand-drawn 1-bit sprites. Every sprite is built from rectangles (or a tiny
// procedural rule) so the art stays crisp: pure 0/1 alpha, no anti-aliased
// edges, and the colour comes from the shader tint, so there are no dark
// fringes when the background changes.

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
  add(x: number, y: number, w: number, h: number): this {
    return this.fill(x, y, w, h, 1);
  }
  sub(x: number, y: number, w: number, h: number): this {
    return this.fill(x, y, w, h, 0);
  }
  private fill(x: number, y: number, w: number, h: number, v: number): this {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i >= 0 && i < this.w && j >= 0 && j < this.h) this.px[j * this.w + i] = v;
      }
    }
    return this;
  }
  rule(f: (x: number, y: number) => boolean): this {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) this.px[y * this.w + x] = f(x + 0.5, y + 0.5) ? 1 : 0;
    }
    return this;
  }
}

// ---------------------------------------------------------------- dino (44x47)

type Legs = 'stand' | 'left' | 'right';

function dino(legs: Legs, dead = false): Bmp {
  const b = new Bmp(44, 47);
  // tail
  b.add(0, 16, 4, 2).add(0, 18, 10, 6).add(4, 24, 6, 2);
  // body
  b.add(8, 20, 24, 16).add(10, 36, 16, 2);
  // neck + head
  b.add(22, 16, 10, 4);
  b.add(24, 0, 18, 2).add(22, 2, 22, 10).add(22, 12, 22, 4);
  b.sub(34, 13, 10, 1); // mouth
  if (dead) {
    b.sub(26, 3, 5, 5).add(26, 3, 1, 1).add(30, 3, 1, 1).add(28, 5, 1, 1).add(26, 7, 1, 1).add(30, 7, 1, 1);
  } else {
    b.sub(26, 4, 3, 3).add(27, 5, 1, 1); // eye
  }
  // arm
  b.add(32, 26, 6, 2).add(36, 28, 2, 2);
  // legs: left leg x12, right leg x22; a raised leg is just a stub
  const leg = (x: number, up: boolean) => {
    if (up) b.add(x, 38, 4, 3);
    else b.add(x, 38, 4, 6).add(x, 44, 8, 3);
  };
  leg(12, legs === 'left');
  leg(22, legs === 'right');
  return b;
}

// ------------------------------------------------------------ ducking (59x30)

function duck(legs: Legs): Bmp {
  const b = new Bmp(59, 30);
  b.add(0, 8, 6, 6); // tail
  b.add(6, 8, 32, 14).add(8, 22, 24, 2); // body
  b.add(39, 0, 18, 2).add(37, 2, 22, 12); // head
  b.sub(49, 11, 10, 1); // mouth
  b.sub(41, 4, 3, 3).add(42, 5, 1, 1); // eye
  b.add(38, 16, 5, 2); // arm
  const leg = (x: number, up: boolean) => {
    if (up) b.add(x, 24, 4, 2);
    else b.add(x, 24, 4, 4).add(x, 28, 8, 2);
  };
  leg(12, legs === 'left');
  leg(26, legs === 'right');
  return b;
}

// --------------------------------------------------------------------- cacti

function cactusSmall(): Bmp {
  return new Bmp(17, 35)
    .add(6, 2, 5, 33).add(7, 0, 3, 2)
    .add(1, 11, 3, 9).add(1, 17, 6, 3)
    .add(13, 7, 3, 9).add(10, 13, 6, 3);
}

function cactusLarge(): Bmp {
  return new Bmp(25, 50)
    .add(9, 3, 7, 47).add(10, 0, 5, 3)
    .add(1, 14, 4, 14).add(1, 24, 9, 4)
    .add(20, 10, 4, 14).add(15, 20, 9, 4);
}

// ---------------------------------------------------------------- pterodactyl

function ptero(wingsUp: boolean): Bmp {
  const b = new Bmp(46, 40);
  b.add(0, 19, 14, 2).add(8, 16, 10, 6); // beak + head
  b.sub(12, 18, 2, 2); // eye
  b.add(16, 20, 26, 8).add(40, 22, 6, 3); // body + tail
  if (wingsUp) {
    b.add(18, 16, 20, 4).add(20, 10, 16, 6).add(22, 5, 12, 5).add(25, 2, 6, 3);
  } else {
    b.add(18, 28, 20, 4).add(20, 32, 16, 4).add(22, 36, 12, 3);
  }
  return b;
}

// ------------------------------------------------------------------ scenery

function cloud(): Bmp {
  return new Bmp(46, 14)
    .add(18, 0, 10, 2).add(12, 2, 22, 2).add(6, 4, 36, 2)
    .add(2, 6, 42, 2).add(0, 8, 46, 4).add(2, 12, 42, 2);
}

function moon(): Bmp {
  // same diameter as the sun: a disc minus an offset disc leaves a crescent
  return new Bmp(24, 24).rule((x, y) => {
    const a = (x - 12) ** 2 + (y - 12) ** 2 <= 11.5 ** 2;
    const c = (x - 17.5) ** 2 + (y - 12) ** 2 <= 10.5 ** 2;
    return a && !c;
  });
}

function sun(): Bmp {
  return new Bmp(24, 24).rule((x, y) => (x - 12) ** 2 + (y - 12) ** 2 <= 11.5 ** 2);
}

function star(big: boolean): Bmp {
  if (big) return new Bmp(9, 9).add(4, 0, 1, 9).add(0, 4, 9, 1).add(3, 3, 3, 3);
  return new Bmp(5, 5).add(2, 0, 1, 5).add(0, 2, 5, 1);
}

export const GROUND_W = 600;

function ground(): Bmp {
  const b = new Bmp(GROUND_W, 11);
  b.add(0, 0, GROUND_W, 1);
  // deterministic scatter of little dents and dashes under the line
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let x = 4; x < GROUND_W - 12; x += 8 + Math.floor(rnd() * 22)) {
    const r = rnd();
    if (r < 0.45) b.add(x, 3, 2 + Math.floor(rnd() * 3), 1);
    else if (r < 0.8) b.add(x, 6, 3 + Math.floor(rnd() * 4), 1);
    else b.add(x, 1, 2, 1).sub(x, 0, 2, 1); // small dip in the line
  }
  return b;
}

// --------------------------------------------------------------------- font

const GLYPHS: Record<string, string> = {
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11110 00001 00001 01110 00001 00001 11110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  G: '01110 10001 10000 10111 10001 10001 01111',
  A: '01110 10001 10001 11111 10001 10001 10001',
  M: '10001 11011 10101 10101 10001 10001 10001',
  E: '11111 10000 10000 11110 10000 10000 11111',
  O: '01110 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  R: '11110 10001 10001 11110 10100 10010 10001',
};

function glyph(rows: string): Bmp {
  const b = new Bmp(10, 14);
  rows.split(' ').forEach((row, y) => {
    for (let x = 0; x < 5; x++) if (row[x] === '1') b.add(x * 2, y * 2, 2, 2);
  });
  return b;
}

// ------------------------------------------------------------- restart icon

function restart(): Bmp {
  const cx = 18, cy = 16;
  const deg = Math.PI / 180;
  const pt = (r: number, a: number): [number, number] => [cx + r * Math.cos(a * deg), cy + r * Math.sin(a * deg)];
  // arrow head at the open end of the ring, pointing clockwise into the gap
  const tip = pt(10, -50), b1 = pt(15, -80), b2 = pt(5, -80);
  const side = (p: [number, number], q: [number, number], x: number, y: number) =>
    (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  return new Bmp(36, 32).rule((x, y) => {
    const r = Math.hypot(x - cx, y - cy);
    let a = Math.atan2(y - cy, x - cx) / deg;
    if (a < -90 - 10) a += 360;
    const inRing = r >= 8 && r <= 12 && !(a > -80 && a < -20);
    const d1 = side(tip, b1, x, y), d2 = side(b1, b2, x, y), d3 = side(b2, tip, x, y);
    const inHead = (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
    return inRing || inHead;
  });
}

// ------------------------------------------------------------------- atlas

const defs = {
  dinoStand: dino('stand'),
  dinoLeft: dino('left'),
  dinoRight: dino('right'),
  dinoDead: dino('stand', true),
  duckLeft: duck('left'),
  duckRight: duck('right'),
  cactusSmall: cactusSmall(),
  cactusLarge: cactusLarge(),
  pteroUp: ptero(true),
  pteroDown: ptero(false),
  cloud: cloud(),
  moon: moon(),
  sun: sun(),
  starBig: star(true),
  starSmall: star(false),
  ground: ground(),
  restart: restart(),
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
    ...Object.entries(GLYPHS).map(([ch, rows]) => ({ key: 'glyph:' + ch, bmp: glyph(rows) })),
  ];
  items.sort((a, b) => b.bmp.h - a.bmp.h);

  // shelf packing with 1px transparent padding so scaled sampling never bleeds
  const width = 1024;
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
