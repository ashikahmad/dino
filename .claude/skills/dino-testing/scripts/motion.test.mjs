// Smooth motion and cheap frames.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launch, openPage, sleep, startDev } from './lib.mjs';

let dev, browser;
before(async () => {
  dev = await startDev();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  dev?.stop();
});

describe('motion and performance', () => {
  it('a cactus moves a steady 6px a step even when frames arrive unevenly', async () => {
    const p = await openPage(browser, dev.url, { viewport: { width: 1200, height: 400 } });
    const xs = await p.evaluate(
      () =>
        new Promise((res) => {
          const g = window.dino;
          g.collides = () => false;
          g.pressJump();
          g.runningTime = 99999; // obstacles straight away
          const out = [];
          let n = 0;
          const f = () => {
            const o = g.obstacles.find((o) => o.x < 500 && o.x > 100);
            if (o) out.push(o.prevX + (o.x - o.prevX) * g.alpha); // where it is drawn
            if (n++ % 7 === 0) for (const t0 = performance.now(); performance.now() - t0 < 6; ); // a busy frame now and then
            if (n < 240) requestAnimationFrame(f);
            else res(out);
          };
          requestAnimationFrame(f);
        }),
    );
    const steps = xs.slice(1).map((v, i) => xs[i] - v).filter((d) => d > 0 && d < 20);
    assert.ok(steps.length > 150, `enough samples (${steps.length})`);
    const steady = steps.filter((d) => d > 5.75 && d < 6.75).length / steps.length;
    assert.ok(steady > 0.9, `most steps are about 6px (${(steady * 100).toFixed(0)}%)`);
    // the old variable-time code jumped 7px on about one frame in eight
    assert.equal(steps.filter((d) => d >= 6.75 && d < 10).length, 0, 'no 7px lurches');
  });

  it('the page is not restyled every frame while the sky is steady', async () => {
    const p = await openPage(browser, dev.url, { viewport: { width: 900, height: 600 } });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Performance.enable');
    await p.evaluate(() => {
      const g = window.dino;
      g.collides = () => false;
      g.pressJump();
      g.skipTo(100); // full daylight: the sky colour does not change
    });
    await sleep(500);
    const count = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'RecalcStyleCount').value;
    const before = await count();
    await sleep(2500);
    const recalcs = (await count()) - before;
    assert.ok(recalcs <= 5, `style recalculations in 2.5s: ${recalcs} (it was one per frame, about 150)`);
  });
});
