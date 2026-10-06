// Solo play: start screen, running, crash, the About card, the hit flash, touch gestures, the icon bar.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { crash, launch, openPage, sleep, startDev } from './lib.mjs';

let dev, browser;
before(async () => {
  dev = await startDev();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  dev?.stop();
});

const panelState = (p) =>
  p.evaluate(() => {
    const panel = document.getElementById('panel');
    const cs = getComputedStyle(panel);
    return { game: window.dino.status, cls: panel.className, visibility: cs.visibility, opacity: cs.opacity, info: !document.getElementById('info').hidden };
  });

describe('solo game', () => {
  it('the start screen is still, and a running game moves', async () => {
    const p = await openPage(browser, dev.url, { viewport: { width: 620, height: 170 } });
    const hash = async () => crypto.createHash('md5').update(await p.screenshot()).digest('hex');
    const a = await hash();
    await sleep(2000);
    assert.equal(await hash(), a, 'nothing moves before the game starts');
    await p.keyboard.press('Space');
    await sleep(1200);
    const b = await hash();
    await sleep(400);
    assert.notEqual(await hash(), b, 'the game moves once started');
    assert.deepEqual(p.errors, []);
  });

  it('start, crash, About card and restart', async () => {
    const p = await openPage(browser, dev.url, { viewport: { width: 1240, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
    assert.equal((await panelState(p)).game, 'idle');
    await p.click('#share');
    await sleep(150);
    assert.equal((await panelState(p)).game, 'idle', 'Share must not start the game');
    assert.equal(await p.textContent('#share-label'), 'Link copied');
    assert.equal(await p.getAttribute('#github', 'href'), 'https://github.com/ashikahmad/dino');

    await p.keyboard.press('Space');
    await sleep(600);
    let s = await panelState(p);
    assert.equal(s.game, 'running');
    assert.equal(s.opacity, '0', 'the start screen is gone while running');

    await p.waitForFunction(() => window.dino.status === 'crashed', null, { timeout: 40000, polling: 100 });
    await sleep(400);
    assert.equal((await panelState(p)).info, true, 'the info button is there after a crash');
    await p.click('#info');
    await sleep(500);
    s = await panelState(p);
    assert.match(s.cls, /overlay/);
    assert.equal(s.opacity, '1');

    await p.keyboard.press('Space'); // closes the card; must not restart
    await sleep(400);
    s = await panelState(p);
    assert.equal(s.game, 'crashed');
    assert.equal(s.visibility, 'hidden');

    await p.keyboard.press('KeyI');
    await sleep(300);
    await p.keyboard.press('Escape');
    await sleep(400);
    assert.equal((await panelState(p)).visibility, 'hidden');
    await p.click('#info');
    await sleep(300);
    await p.mouse.click(300, 700); // tap on the card's backdrop closes it without restarting
    await sleep(400);
    s = await panelState(p);
    assert.equal(s.game, 'crashed');
    assert.equal(s.visibility, 'hidden');

    await sleep(800);
    await p.keyboard.press('Space');
    await sleep(500);
    assert.equal((await panelState(p)).game, 'running', 'Space restarts after the delay');
    assert.deepEqual(p.errors, []);
  });

  it('closing the About card over Game Over hides it at once (no flash of the start screen)', async () => {
    const p = await openPage(browser, dev.url, { viewport: { width: 1240, height: 800 } });
    await crash(p);
    await sleep(700);
    await p.click('#info');
    await sleep(500);
    const first = await p.evaluate(() => {
      document.getElementById('close').click();
      const panel = document.getElementById('panel');
      const cs = getComputedStyle(panel);
      return { cls: panel.className, opacity: +cs.opacity, visibility: cs.visibility };
    });
    await sleep(30);
    const soon = await p.evaluate(() => ({ opacity: +getComputedStyle(document.getElementById('panel')).opacity, visibility: getComputedStyle(document.getElementById('panel')).visibility }));
    assert.match(first.cls, /instant/);
    assert.equal(soon.opacity, 0);
    assert.equal(soon.visibility, 'hidden');
  });

  for (const [name, colorScheme, reducedMotion, expected] of [
    ['day', 'light', 'no-preference', true],
    ['night', 'dark', 'no-preference', true],
    ['reduced motion', 'light', 'reduce', false],
  ]) {
    it(`the hit flash (${name}) ${expected ? 'plays' : 'is skipped'}`, async () => {
      const p = await openPage(browser, dev.url, { viewport: { width: 620, height: 170 }, colorScheme, reducedMotion });
      // sample the page colour every frame from the moment of the crash
      const sky = p.evaluate(
        () =>
          new Promise((res) => {
            const seen = [];
            let t0 = 0;
            const f = () => {
              if (window.dino.status === 'crashed') {
                t0 ||= performance.now();
                const c = document.body.style.background;
                if (seen[seen.length - 1] !== c) seen.push(c);
                if (performance.now() - t0 > 400) return res(seen);
              }
              requestAnimationFrame(f);
            };
            f();
          }),
      );
      await p.keyboard.press('Space');
      const seen = await sky;
      // calm: one colour the whole time; flash: the colour swaps and comes back
      assert.equal(seen.length > 1, expected, JSON.stringify(seen));
    });
  }

  it('touch: taps on buttons never leave the dino stuck ducking', async () => {
    const scenarios = {
      'plain tap on the page': async ({ touch, wait }) => {
        await touch('touchStart', [[200, 400]]);
        await wait(60);
        await touch('touchEnd', []);
      },
      'swipe down on the page': async ({ touch, wait }) => {
        await touch('touchStart', [[200, 300]]);
        await wait(40);
        await touch('touchMove', [[200, 360]]);
        await wait(40);
        await touch('touchEnd', []);
      },
      'tap the sound button with a little jitter, then play': async ({ touch, wait, p }) => {
        const [x, y] = await centre(p, '#mute');
        await touch('touchStart', [[x, y]]);
        await wait(30);
        await touch('touchMove', [[x, y + 3]]);
        await touch('touchEnd', []);
        await wait(100);
        await touch('touchStart', [[200, 400]]);
        await wait(60);
        await touch('touchEnd', []);
      },
      'tap Share with a little jitter, then play': async ({ touch, wait, p }) => {
        const [x, y] = await centre(p, '#share');
        await touch('touchStart', [[x, y]]);
        await wait(30);
        await touch('touchMove', [[x, y + 4]]);
        await touch('touchEnd', []);
        await wait(100);
        await touch('touchStart', [[200, 400]]);
        await wait(60);
        await touch('touchEnd', []);
      },
      'two fingers: swipe with one, tap with the other': async ({ touch, wait }) => {
        await touch('touchStart', [[100, 300, 0]]);
        await wait(30);
        await touch('touchStart', [[100, 300, 0], [300, 400, 1]]);
        await wait(30);
        await touch('touchMove', [[100, 360, 0], [300, 400, 1]]);
        await wait(30);
        await touch('touchEnd', [[300, 400, 1]]);
        await wait(30);
        await touch('touchEnd', []);
      },
    };
    const centre = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
    for (const [name, steps] of Object.entries(scenarios)) {
      const p = await openPage(browser, dev.url, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const cdp = await p.context().newCDPSession(p);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id = 0]) => ({ x, y, id })) });
      await steps({ touch, wait: sleep, p });
      await sleep(1500);
      const s = await p.evaluate(() => ({ ducking: window.dino.ducking, downHeld: window.dino.downHeld }));
      assert.deepEqual(s, { ducking: false, downHeld: false }, name);
      await p.context().close();
    }
  });

  it('the icon bar sits flush right, with no gap where a button is missing', async () => {
    const W = 1240;
    for (const [fullscreen, gameOver] of [[true, false], [false, false], [true, true], [false, true]]) {
      const p = await openPage(browser, dev.url, { viewport: { width: W, height: 500 } }).catch(() => null);
      if (!fullscreen) {
        // a browser without the Fullscreen API
        const context = await browser.newContext({ viewport: { width: W, height: 500 } });
        await context.addInitScript(() => {
          for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(document, k, { get: () => false });
        });
        const q = await context.newPage();
        await q.goto(dev.url);
        await q.waitForFunction(() => window.dino);
        await check(q, gameOver);
        await context.close();
      } else {
        await check(p, gameOver);
      }
      if (p && fullscreen) await p.context().close();
    }
    async function check(p, gameOver) {
      await sleep(400);
      if (gameOver) {
        await p.evaluate(() => { const g = window.dino; g.state = 'crashed'; g.crashedAt = g.now - 9999; g.nudgeT = 500; g.invalidate(); });
        await p.waitForFunction(() => !document.getElementById('info').hidden);
      }
      const boxes = await p.evaluate(() =>
        ['info', 'mute', 'fs']
          .map((id) => ({ id, el: document.getElementById(id) }))
          .filter(({ el }) => !el.hidden && el.getBoundingClientRect().width > 0)
          .map(({ id, el }) => ({ id, left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }))
          .sort((a, b) => a.left - b.left),
      );
      assert.equal(boxes.at(-1).right, W - 8, `right-most button is 8px from the edge (${JSON.stringify(boxes)})`);
      for (let i = 1; i < boxes.length; i++) assert.equal(boxes[i].left, boxes[i - 1].right, 'no gap between buttons');
    }
  });
});
