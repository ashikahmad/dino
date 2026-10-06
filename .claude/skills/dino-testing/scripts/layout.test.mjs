// Responsive layout: what the start screen shows depending on the room around the canvas, and the About card.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launch, openPage, startDev } from './lib.mjs';

let dev, browser;
before(async () => {
  dev = await startDev();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  dev?.stop();
});

const phone = (width, height) => ({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
const inside = (p, sel) =>
  p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }, sel);

describe('start screen by room', () => {
  it('a big window shows everything and no info button', async () => {
    const p = await openPage(browser, dev.url, { viewport: { width: 1240, height: 800 } });
    assert.equal(await p.getAttribute('#panel', 'data-room'), 'full');
    for (const sel of ['.title svg', '.tagline', '.how', '#share', '.credit']) assert.ok(await visible(p, sel), sel);
    assert.ok(!(await visible(p, '#info')), 'the info button is only for screens that cannot show it all');
  });

  it('a phone in landscape keeps the title, how to play and the buttons, drops the extras, and offers the info button', async () => {
    const p = await openPage(browser, dev.url, phone(844, 390));
    assert.equal(await p.getAttribute('#panel', 'data-room'), 'compact');
    for (const sel of ['.title svg', '.how.touch', '#share']) assert.ok(await visible(p, sel), sel);
    for (const sel of ['.tagline', '.credit']) assert.ok(!(await visible(p, sel)), `${sel} is hidden`);
    for (const sel of ['.title svg', '.how.touch']) assert.ok(await inside(p, sel), `${sel} fits on screen`);
    assert.ok(await visible(p, '#info'));
  });

  it('a very short landscape screen keeps only the title and one line of instructions', async () => {
    const p = await openPage(browser, dev.url, phone(844, 320));
    assert.equal(await p.getAttribute('#panel', 'data-room'), 'tight');
    assert.ok(await visible(p, '.title svg') && (await visible(p, '.how.touch')));
    assert.ok(!(await visible(p, '#share')), 'the buttons are left to the info card');
    assert.ok(await inside(p, '.title svg'));
    assert.ok(await visible(p, '#info'));
  });

  it('a phone in portrait has room for everything', async () => {
    const p = await openPage(browser, dev.url, phone(390, 844));
    assert.equal(await p.getAttribute('#panel', 'data-room'), 'full');
    assert.ok(await visible(p, '.how.touch') && !(await visible(p, '.how.keys')), 'touch instructions, not keyboard ones');
  });
});

describe('the About card', () => {
  it('shows everything and its close button, even on a short landscape phone', async () => {
    const p = await openPage(browser, dev.url, phone(844, 320));
    await p.click('#info');
    await p.waitForFunction(() => document.getElementById('panel').classList.contains('overlay'));
    for (const sel of ['.title svg', '.tagline', '#share', '.credit', '#close']) assert.ok(await visible(p, sel), sel);
    assert.ok(await inside(p, '#close'));
    const scrollable = await p.evaluate(() => { const e = document.getElementById('panel'); return e.scrollHeight > e.clientHeight; });
    const creditReachable = await p.evaluate(() => { const e = document.getElementById('panel'); e.scrollTop = e.scrollHeight; return document.querySelector('.credit').getBoundingClientRect().bottom <= innerHeight; });
    assert.ok(creditReachable, `the credit line can be scrolled into view (card scrolls: ${scrollable})`);
  });
});
