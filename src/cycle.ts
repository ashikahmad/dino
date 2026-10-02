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

const DAY = 0.62; // fraction of the cycle the sun is up
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

type Stop = [number, string];

// Sky colour by sun altitude: evening (sun going down) ...
const SETTING: Stop[] = [
  [-0.3, '#202124'], // night
  [-0.18, '#3a3858'],
  [-0.08, '#6b4f72'], // dusk purple
  [0.0, '#b8667a'], // sun just gone: rose
  [0.06, '#e0866a'], // sun half behind the ground
  [0.15, '#e8a27c'], // sun low, orange
  [0.25, '#f0cfa6'],
  [0.42, '#f6e6c4'], // afternoon
  [0.6, '#f7f7f7'],
  [1.0, '#f7f7f7'],
];

// ... and morning (sun coming up): cooler and shorter than the evening.
const RISING: Stop[] = [
  [-0.3, '#202124'],
  [-0.18, '#363a5a'], // pre-dawn blue
  [-0.08, '#6a5f86'],
  [0.0, '#d49aa0'], // first light, pink
  [0.06, '#e9b39a'], // peach
  [0.15, '#f0cdb0'],
  [0.3, '#f4e3cd'],
  [0.45, '#f7f7f7'],
  [1.0, '#f7f7f7'],
];

const table = (stops: Stop[]) => stops.map(([a, c]) => [a, hex(c)] as [number, RGB]);
const SETTING_RGB = table(SETTING);
const RISING_RGB = table(RISING);

function lookup(stops: [number, RGB][], a: number): RGB {
  if (a <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (a <= stops[i][0]) {
      const [a0, c0] = stops[i - 1];
      const [a1, c1] = stops[i];
      return mix(c0, c1, (a - a0) / (a1 - a0));
    }
  }
  return stops[stops.length - 1][1];
}

// ------------------------------------------------------------ sun & moon art

const HORIZON = 139;
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

const SUN_RISE_LOW = hex('#d94f4f'); // slightly red at dawn
const SUN_SET_LOW = hex('#d9532b'); // orange at sunset
const SUN_MID = hex('#f2b233');
const SUN_NOON = hex('#fbe28f'); // a bit whitish at noon
export const MOON = hex('#ececec');

function sunColor(h: number, rising: boolean): RGB {
  const low = rising ? SUN_RISE_LOW : SUN_SET_LOW;
  return mix(mix(low, SUN_MID, smooth(0, 0.3, h)), SUN_NOON, smooth(0.3, 0.9, h));
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

const FG_DAY = hex('#535353');
const FG_DUSK = hex('#2a2328');
const FG_NIGHT = hex('#e4e4e4');

// The moon appears once the sky is properly dark and is gone before dawn, so it
// is never up at the same time as the sun.
const MOON_FROM = 0.075; // cycles after sunset
const MOON_TO = 1 - DAY - 0.06;

export function palette(score: number): Palette {
  const p = (((score % CYCLE_POINTS) + CYCLE_POINTS) % CYCLE_POINTS) / CYCLE_POINTS;
  const s = sunState(p);
  const sky = lookup(s.rising ? RISING_RGB : SETTING_RGB, s.a);
  const lum = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.0722 * sky[2];

  // Dark sprites on a light sky, light sprites on a dark one. The flip sits at the
  // perceptual midpoint so contrast stays readable all through dusk and dawn.
  const dark = mix(FG_DUSK, FG_DAY, smooth(0.8, 0.95, lum));
  const fg = mix(FG_NIGHT, dark, smooth(0.46, 0.5, lum));

  const sinceSet = s.q - DAY;
  const moonU = (sinceSet - MOON_FROM) / (MOON_TO - MOON_FROM);

  return {
    sky,
    fg,
    cloud: mix(sky, fg, 0.25),
    dim: mix(sky, fg, 0.75),
    night: Math.min(1, Math.max(0, (0.45 - lum) / 0.3)),
    sun: s.h > 0 ? { ...arc(s.q / DAY), color: sunColor(s.h, s.rising) } : null,
    moon: moonU >= 0 && moonU <= 1 ? arc(moonU) : null,
  };
}
