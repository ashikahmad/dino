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
  { p: 0.46, sky: '#e8a27c', fg: '#4a3c44' }, // evening
  { p: 0.56, sky: '#4a4466', fg: '#d2cde0' }, // dusk
  { p: 0.64, sky: '#202124', fg: '#d4d4d4' }, // night
  { p: 0.82, sky: '#202124', fg: '#d4d4d4' },
  { p: 0.88, sky: '#3f4562', fg: '#d0d0dc' }, // pre-dawn
  { p: 0.94, sky: '#e3b9a4', fg: '#4a3f44' }, // dawn
  { p: 1.0, sky: '#f7f7f7', fg: '#535353' }, // day again
];

const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255,
];

const parsed = KEYS.map((k) => ({ p: k.p, sky: hex(k.sky), fg: hex(k.fg) }));

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
  const fg = mix(a.fg, b.fg, t);
  const lum = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.0722 * sky[2];
  const night = Math.min(1, Math.max(0, (0.45 - lum) / 0.3));
  return { p, sky, fg, cloud: mix(sky, fg, 0.25), dim: mix(sky, fg, 0.75), night };
}
