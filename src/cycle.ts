import type { RGB } from './renderer';

/** Score points for one full day/night loop. */
export const CYCLE_POINTS = 1500;

export const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------- the sun
//
// Everything is driven by the sun's altitude `a`: 1 at noon, ~0 as it touches
// the ground, negative once it is below the horizon (twilight, then night).
// The sky colour is looked up from `a`, so the colour changes happen when the
// sun is actually near the ground instead of on fixed linear phases.

const DAY = 0.5; // fraction of the cycle the sun is up: day and night are the same length
const SUNRISE = 1 - 0.3 * DAY; // the game starts a little after sunrise, sun already high
const TWILIGHT = 0.08; // cycles from the sun touching the ground to full night
const DEEPEST = -0.3; // altitude at which the sky is fully dark

interface Sun {
  a: number; // altitude, see above
  h: number; // 0..1 height along the arc (0 when below the horizon)
  rising: boolean;
  q: number; // cycles since sunrise
}

function sunState(p: number): Sun {
  const q = (((p - SUNRISE) % 1) + 1) % 1;
  if (q <= DAY) {
    const u = q / DAY;
    const h = Math.sin(Math.PI * u);
    return { a: h, h, rising: u < 0.5, q };
  }
  const sinceSet = q - DAY;
  const untilRise = 1 - q;
  const depth = Math.min(1, Math.min(sinceSet, untilRise) / TWILIGHT);
  return { a: DEEPEST * depth, h: 0, rising: untilRise < sinceSet, q };
}

// ------------------------------------------------------------------ colours
//
// One table serves both directions: the sky at a given altitude looks the same whether the sun
// is going down or coming up. Colours are written in OKLCH (lightness, chroma, hue), where equal
// chroma looks equally saturated at any hue, so the twilight colours differ in hue and lightness
// but keep the same soft, flat saturation. The content (dino, cacti, text) is the sky's opposite
// hue, so it stays distinct even where the two have similar brightness; by day it is near black
// and by night near white.

type Lch = [number, number, number]; // lightness 0..1, chroma ~0..0.1, hue in degrees

// altitude, sky, content lightness and chroma (the content's hue is the sky's plus 180)
type Stop = [number, Lch, number, number];

const STOPS: Stop[] = [
  // hues run on past 0 (negative values) so the blend always takes the short way round the wheel
  [-0.3, [0.24, 0.012, -95], 0.93, 0.006], // night: near black sky, near white content
  [-0.22, [0.3, 0.04, -75], 0.9, 0.02],
  [-0.15, [0.4, 0.05, -55], 0.88, 0.03], // dusk purple
  [-0.08, [0.52, 0.06, -20], 0.85, 0.04], // dusty rose: the content turns light here
  [-0.03, [0.6, 0.065, 10], 0.3, 0.04],
  [0.0, [0.67, 0.068, 28], 0.28, 0.04], // the sun at the horizon: warm ember
  [0.06, [0.76, 0.065, 42], 0.32, 0.038],
  [0.15, [0.85, 0.055, 58], 0.36, 0.034], // low sun, peach
  [0.27, [0.91, 0.04, 78], 0.4, 0.026],
  [0.42, [0.95, 0.02, 92], 0.43, 0.012], // afternoon cream
  [0.6, [0.975, 0.0, 95], 0.45, 0.0], // day: near white sky, near black content
  [1.0, [0.975, 0.0, 95], 0.45, 0.0],
];

/** OKLCH to sRGB (0..1), lowering chroma until the colour fits the screen's gamut. */
function oklch(L: number, C: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  for (let k = 0; k < 24; k++) {
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005) || k === 23) {
      return lin.map((v) => {
        const c = Math.min(1, Math.max(0, v));
        return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      }) as RGB;
    }
    C *= 0.9;
  }
  return [0, 0, 0];
}

/** The sky and content colours for a sun altitude. */
function colours(a: number): { sky: RGB; fg: RGB } {
  let i = 1;
  while (i < STOPS.length - 1 && a > STOPS[i][0]) i++;
  const [a0, s0, fl0, fc0] = STOPS[i - 1];
  const [a1, s1, fl1, fc1] = STOPS[i];
  const t = Math.min(1, Math.max(0, (a - a0) / (a1 - a0)));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const hue = lerp(s0[2], s1[2]);
  return {
    sky: oklch(lerp(s0[0], s1[0]), lerp(s0[1], s1[1]), hue),
    fg: oklch(lerp(fl0, fl1), lerp(fc0, fc1), hue + 180),
  };
}

// ------------------------------------------------------------ sun & moon art

const HORIZON = 133; // the ground line
export const BODY_SIZE = 24; // sun and moon share the same diameter
const X_FAR = 568; // they rise at the far (right) end ...
const X_NEAR = 72; // ... and set behind the dino
const CEILING = 2;

export interface Body {
  x: number;
  y: number; // top edge; >= HORIZON means fully hidden
}

function arc(u: number): Body {
  const h = Math.sin(Math.PI * u);
  const cx = X_FAR + (X_NEAR - X_FAR) * u;
  return { x: cx - BODY_SIZE / 2, y: HORIZON + 2 - (HORIZON + 2 - CEILING) * h };
}

const SUN_LOW = hex('#d7473a'); // red at sunrise and sunset
const SUN_MID = hex('#e8b14f');
const SUN_NOON = hex('#f3df9f'); // a bit whitish at noon
export const MOON = hex('#ececec');

function sunColor(h: number): RGB {
  return mix(mix(SUN_LOW, SUN_MID, smooth(0.04, 0.3, h)), SUN_NOON, smooth(0.3, 0.9, h));
}

// ------------------------------------------------------------------ palette

export interface Palette {
  sky: RGB;
  fg: RGB;
  cloud: RGB;
  dim: RGB; // lighter foreground, used for the high score
  night: number; // 0 (day) .. 1 (deep night): star visibility
  sun: (Body & { color: RGB }) | null;
  moon: Body | null;
}

// The moon appears once the sky is properly dark and is gone before dawn, so it
// is never up at the same time as the sun.
const MOON_FROM = 0.075; // cycles after sunset
const MOON_TO = 1 - DAY - 0.06;

/** `position` is a point on the day/night cycle, in score points (it wraps every CYCLE_POINTS). */
export function palette(position: number): Palette {
  const p = (((position % CYCLE_POINTS) + CYCLE_POINTS) % CYCLE_POINTS) / CYCLE_POINTS;
  const s = sunState(p);
  const { sky, fg } = colours(s.a);
  const lum = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.0722 * sky[2];

  const sinceSet = s.q - DAY;
  const moonU = (sinceSet - MOON_FROM) / (MOON_TO - MOON_FROM);

  return {
    sky,
    fg,
    cloud: mix(sky, fg, 0.25),
    dim: mix(sky, fg, 0.75),
    night: Math.min(1, Math.max(0, (0.45 - lum) / 0.3)),
    sun: s.h > 0 ? { ...arc(s.q / DAY), color: sunColor(s.h) } : null,
    moon: moonU >= 0 && moonU <= 1 ? arc(moonU) : null,
  };
}

/** Cycle position where the sky first turns fully black after sunset: the longest stretch of night ahead. */
export const NIGHT_START = ((SUNRISE + DAY + TWILIGHT) % 1) * CYCLE_POINTS;

const MIN_CONTRAST = 3;

function contrast(a: RGB, b: RGB): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const x = lum(a) + 0.05, y = lum(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}

/**
 * The first position at or after `position` where the sprites stand out from the sky.
 * The sprite colour fades through the sky's brightness at dusk and dawn; this steps
 * past that short stretch (about 20 points) so a new run never starts inside it.
 */
export function safeAfter(position: number): number {
  for (let d = 0; d <= 60; d++) {
    const pal = palette(position + d);
    if (contrast(pal.sky, pal.fg) >= MIN_CONTRAST) return position + d;
  }
  return position;
}
