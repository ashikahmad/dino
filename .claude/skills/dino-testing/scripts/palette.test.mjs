// The day/night colours (src/cycle.ts) as pure functions: no browser. Needs Node 22.18+ to load the .ts file directly.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

let cycle;
before(async () => {
  try {
    cycle = await import('../../../../src/cycle.ts');
  } catch (e) {
    console.log(`(skipping: Node cannot load TypeScript directly here: ${e.message})`);
  }
});

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a, b) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return Math.max(x, y) / Math.min(x, y); };
const each = (f) => { for (let p = 0; p < 1500; p++) f(p, cycle.palette(p)); };

describe('day and night colours', { skip: false }, () => {
  it('the sky never jumps from one point to the next (no hue wrapping the wrong way)', (t) => {
    if (!cycle) return t.skip('Node too old');
    let prev = cycle.palette(1499);
    each((p, now) => {
      const step = Math.max(...now.sky.map((v, i) => Math.abs(v - prev.sky[i]))) * 255;
      assert.ok(step <= 12, `sky changes by ${step.toFixed(1)}/255 between points ${p - 1} and ${p}`);
      prev = now;
    });
  });

  it('content stays readable, except for a short flip between dark and light at dusk and dawn', (t) => {
    if (!cycle) return t.skip('Node too old');
    const low = [];
    each((p, { sky, fg }) => { if (contrast(sky, fg) < 2.5) low.push(p); });
    assert.ok(low.length <= 60, `${low.length} points below 2.5:1 contrast (expected two short dips)`);
    let run = 1, longest = 1;
    for (let i = 1; i < low.length; i++) { run = low[i] === low[i - 1] + 1 ? run + 1 : 1; longest = Math.max(longest, run); }
    assert.ok(longest <= 30, `the longest low-contrast stretch is ${longest} points`);
  });

  it('day is near white with near black content, night the other way round', (t) => {
    if (!cycle) return t.skip('Node too old');
    const day = cycle.palette(150), night = cycle.palette(cycle.NIGHT_START);
    assert.ok(lum(day.sky) > 0.85 && lum(day.fg) < 0.15, 'day');
    assert.ok(lum(night.sky) < 0.05 && lum(night.fg) > 0.6, 'night');
  });

  it('dawn is dusk in reverse: the sky depends only on the sun\'s height', (t) => {
    if (!cycle) return t.skip('Node too old');
    // find noon (sun highest) and compare the sky equally far before and after it
    let noon = 0, best = 1e9;
    each((p, { sun }) => { if (sun && sun.y < best) { best = sun.y; noon = p; } });
    for (let d = 1; d < 200; d += 7) {
      const a = cycle.palette(noon - d).sky, b = cycle.palette(noon + d).sky;
      a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `sky differs ${d} points either side of noon`));
    }
  });

  it('the sun and the moon are never up together', (t) => {
    if (!cycle) return t.skip('Node too old');
    let seenSun = false, seenMoon = false;
    each((p, { sun, moon }) => {
      assert.ok(!(sun && moon), `both visible at point ${p}`);
      seenSun ||= !!sun;
      seenMoon ||= !!moon;
    });
    assert.ok(seenSun && seenMoon);
  });

  it('a new run never starts in a low-contrast moment', (t) => {
    if (!cycle) return t.skip('Node too old');
    for (let p = 0; p < 1500; p += 5) {
      const q = cycle.safeAfter(p);
      const { sky, fg } = cycle.palette(q);
      assert.ok(contrast(sky, fg) >= 3, `after ${p} the safe point ${q} has contrast ${contrast(sky, fg).toFixed(2)}`);
    }
  });
});
