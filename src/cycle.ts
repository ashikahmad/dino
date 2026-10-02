import type { RGB } from './renderer';

/** Score points for one full day -> afternoon -> evening -> night -> dawn -> day loop. */
export const CYCLE_POINTS = 1500;

interface Key {
  p: number; // position in the cycle, 0..1
  sky: string;
  fg: string;
}

const KEYS: Key[] = [
  { p: 0.0, sky: '#f7f7f7', fg: '#535353' }, // day
  { p: 0.18, sky: '#f7f7f7', fg: '#535353' },
  { p: 0.32, sky: '#f6e6c4', fg: '#574f48' }, // afternoon
  { p: 0.46, sky: '#e8a27c', fg: '#3a2f36' }, // evening
  { p: 0.56, sky: '#4a4466', fg: '#2a2328' }, // dusk
  { p: 0.64, sky: '#202124', fg: '#2a2328' }, // night
  { p: 0.82, sky: '#202124', fg: '#2a2328' },
  { p: 0.88, sky: '#3f4562', fg: '#2a2328' }, // pre-dawn
  { p: 0.94, sky: '#e3b9a4', fg: '#3a2f36' }, // dawn
  { p: 1.0, sky: '#f7f7f7', fg: '#535353' }, // day again
];

const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];

const parsed = KEYS.map((k) => ({ p: k.p, sky: hex(k.sky), fg: hex(k.fg) }));

const LIGHT_FG: RGB = hex('#e4e4e4');

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface Palette {
  p: number;
  sky: RGB;
  fg: RGB;
  cloud: RGB;
  dim: RGB; // lighter foreground, used for the high score
  night: number; // 0 (day) .. 1 (deep night): moon/star visibility
}

export function palette(score: number): Palette {
  const p = (((score % CYCLE_POINTS) + CYCLE_POINTS) % CYCLE_POINTS) / CYCLE_POINTS;
  let i = 0;
  while (i < parsed.length - 2 && p > parsed[i + 1].p) i++;
  const a = parsed[i], b = parsed[i + 1];
  const t = (p - a.p) / (b.p - a.p);
  const sky = mix(a.sky, b.sky, t);
  const lum = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.0722 * sky[2];
  // Keyframes hold the dark foreground; swap to the light one only once the sky is
  // dark enough, so contrast stays readable through dusk and dawn.
  const dark = smooth(0.19, 0.21, lum);
  const fg = mix(LIGHT_FG, mix(a.fg, b.fg, t), dark);
  const night = Math.min(1, Math.max(0, (0.45 - lum) / 0.3));
  return { p, sky, fg, cloud: mix(sky, fg, 0.25), dim: mix(sky, fg, 0.75), night };
}

// ---------------------------------------------------------------- sun & moon

const HORIZON = 139;
const PEAK_TOP = 14;

export interface Body {
  x: number;
  y: number; // top edge; >= HORIZON means fully hidden
  h: number; // 0 at the horizon .. 1 at the top of the arc
}

/** Position along a left-to-right arc for u in 0..1, rising from and sinking behind the horizon. */
function arc(u: number, size: number): Body | null {
  if (u < 0 || u > 1) return null;
  const h = Math.sin(Math.PI * u);
  return { x: 130 + u * (440 - size), y: HORIZON + 2 - (HORIZON + 2 - PEAK_TOP) * h, h };
}

/** Sun is up from pre-dawn (p 0.88) to just after dusk (p 0.60 of the next loop). */
export const sunBody = (p: number): Body | null => arc(((p - 0.88 + 1) % 1) / 0.72, 24);

/** Moon is up from evening (p 0.50) to dawn (p 0.96). */
export const moonBody = (p: number): Body | null => arc((p - 0.5) / 0.46, 20);

const SUN_LOW: RGB = hex('#d9532b');
const SUN_HIGH: RGB = hex('#f2b233');
export const MOON: RGB = hex('#ececec');

export function sunColor(h: number): RGB {
  const t = Math.min(1, h / 0.55);
  return mix(SUN_LOW, SUN_HIGH, t * t * (3 - 2 * t));
}
