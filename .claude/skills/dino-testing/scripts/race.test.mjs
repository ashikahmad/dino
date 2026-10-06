// Racing friends on the same Wi-Fi: lobby, ready-up, a shared course, crashes, results.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launch, openPage, sleep, startHost, startStatic } from './lib.mjs';

let host, pages, browser;
before(async () => {
  host = await startHost();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  host?.stop();
});

/** Open the host's page and `friends` more pages that join through the QR-code link. */
async function joinRace(friends) {
  const first = await openPage(browser, host.url);
  await first.click('#play-friends');
  const all = [first];
  for (let i = 0; i < friends; i++) all.push(await openPage(browser, `${host.url}/?join`));
  await first.waitForFunction((n) => document.querySelectorAll('#mp-list li').length === n, friends + 1);
  return all;
}
const closeAll = (ps) => Promise.all(ps.map((p) => p.context().close()));
const readyAll = async (ps) => {
  for (const p of ps) await p.click('#mp-ready');
  for (const p of ps) await p.waitForFunction(() => !document.getElementById('mp-start').hidden);
};
const invulnerable = (p) => p.evaluate(() => { window.dino.realCollides = window.dino.collides.bind(window.dino); window.dino.collides = () => false; });
const vulnerable = (p) => p.evaluate(() => { window.dino.collides = window.dino.realCollides; });
const view = (p) => p.evaluate(() => document.getElementById('mp').dataset.view);
const crashed = (p, timeout = 40000) => p.waitForFunction(() => window.dino.status === 'crashed', null, { timeout, polling: 50 });
const lobby = (p) =>
  p.evaluate(() => ({
    notice: document.getElementById('mp-status').textContent,
    ready: document.getElementById('mp-ready').hidden ? 'hidden' : document.getElementById('mp-ready').textContent,
    start: !document.getElementById('mp-start').hidden,
    tags: [...document.querySelectorAll('#mp-list .tag')].map((t) => t.textContent),
  }));

describe('multiplayer race', () => {
  it('the lobby: ready-up, then anyone can start', async () => {
    const first = await openPage(browser, host.url);
    await first.click('#play-friends');
    await first.waitForFunction(() => document.getElementById('mp').dataset.view === 'lobby');
    assert.match((await lobby(first)).notice, /Waiting for a friend/);
    assert.ok(await first.evaluate(() => !!document.querySelector('#qr svg')), 'a QR code to join');

    const b = await openPage(browser, `${host.url}/?join`);
    const c = await openPage(browser, `${host.url}/?join`);
    await first.waitForFunction(() => document.querySelectorAll('#mp-list li').length === 3);
    assert.equal(await view(b), 'lobby', 'the QR link goes straight to the lobby');
    assert.match((await lobby(c)).notice, /0 of 3 ready/);

    await first.click('#mp-ready');
    await c.waitForFunction(() => document.querySelector('#mp-list .tag.on'));
    assert.equal((await lobby(c)).start, false, 'not everyone is ready yet');
    await b.click('#mp-ready');
    await c.click('#mp-ready');
    await c.waitForFunction(() => !document.getElementById('mp-start').hidden);
    const all = await lobby(first);
    assert.equal(all.ready, 'hidden', 'Ready gives way to Start');
    assert.deepEqual(all.tags, ['✓ ready', '✓ ready', '✓ ready']);

    // a newcomer takes Start away until they are ready too
    const d = await openPage(browser, `${host.url}/?join`);
    await first.waitForFunction(() => document.getElementById('mp-start').hidden);
    await d.click('#mp-ready');
    await first.waitForFunction(() => !document.getElementById('mp-start').hidden);

    await c.click('#mp-start'); // not the first player: anyone may start
    for (const p of [first, b, c, d]) {
      await p.waitForFunction(() => window.dino.race && ['countdown', 'running'].includes(window.dino.status));
      assert.equal(await p.evaluate(() => window.dino.ghosts.length), 3);
    }
    await closeAll([first, b, c, d]);
  });

  it('everyone gets the same obstacles', async () => {
    const ps = await joinRace(2);
    await readyAll(ps);
    for (const p of ps) {
      await p.evaluate(() => {
        const g = window.dino;
        g.log = [];
        g.collides = () => false;
        const add = g.addObstacle.bind(g);
        g.addObstacle = () => {
          add();
          const o = g.obstacles.at(-1);
          g.log.push([o.type.w, o.size, o.y, o.gap, o.speedOffset]);
        };
      });
    }
    await ps[0].click('#mp-start');
    await sleep(15000);
    const logs = await Promise.all(ps.map((p) => p.evaluate(() => window.dino.log)));
    const n = Math.min(...logs.map((l) => l.length));
    assert.ok(n >= 8, `enough obstacles to compare (${n})`);
    for (const l of logs) assert.deepEqual(l.slice(0, n), logs[0].slice(0, n));
    await closeAll(ps);
  });

  it('a hidden tab counts as out, and the race still ends', async () => {
    const [a, b] = await joinRace(1);
    await readyAll([a, b]);
    await a.click('#mp-start');
    await b.waitForFunction(() => window.dino.status === 'running');
    await b.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await crashed(b, 3000);
    await a.waitForFunction(() => window.dino.ghosts.some((g) => !g.alive), null, { timeout: 5000 });
    await a.waitForFunction(() => document.getElementById('mp').dataset.view === 'results', null, { timeout: 40000 });
    assert.equal(await view(b), 'results');
    await closeAll([a, b]);
  });

  it('a crash is placed exactly, the course keeps running for the others, and results wait for the last crash', async () => {
    const [a, b, c] = await joinRace(2);
    await readyAll([a, b, c]);
    await invulnerable(b);
    await invulnerable(c);
    for (const p of [b, c]) {
      await p.evaluate(() => {
        window.trace = [];
        const f = () => {
          const v = document.getElementById('mp');
          window.trace.push([performance.now(), window.dino.status, window.dino.travel, !document.getElementById('leave-race').hidden, v.dataset.view + (v.classList.contains('open') ? '+' : '')]);
          requestAnimationFrame(f);
        };
        f();
      });
    }
    await a.evaluate(() => {
      const g = window.dino;
      const onCrash = g.onCrash;
      g.onCrash = (s) => {
        window.deathInfo = { y: g.dinoY, travel: g.travel };
        onCrash(s);
      };
    });
    await a.click('#mp-start');
    await crashed(a);
    const aScore = await a.evaluate(() => window.dino.score);

    // the others see exactly where it happened, and carry on racing
    await sleep(700);
    const died = await a.evaluate(() => window.deathInfo);
    const ghost = await b.evaluate(() => window.dino.ghosts.find((g) => !g.alive));
    assert.equal(ghost.diedAt, died.travel, 'the crash is placed at the same point of the course');
    assert.equal(ghost.y, died.y);
    assert.match(await b.evaluate(() => document.getElementById('hud').textContent), /✕/, 'a red cross marks the player who is out');
    assert.equal(await b.evaluate(() => window.dino.status), 'running');

    // out players keep seeing the course move, and may leave once they have had a moment
    const t0 = await a.evaluate(() => window.dino.groundX);
    await sleep(500);
    assert.notEqual(await a.evaluate(() => window.dino.groundX), t0, 'the course runs on behind Game Over');
    assert.ok(await a.isVisible('#leave-race'), 'Leave race is offered');
    await a.click('#leave-race');
    await sleep(400);
    assert.equal(await a.evaluate(() => window.dino.status), 'idle');

    await vulnerable(b);
    await crashed(b);
    await sleep(1000);
    assert.ok(await b.isVisible('#leave-race'), 'the second to last may leave');

    await vulnerable(c); // the last player
    await crashed(c);
    for (const p of [b, c]) await p.waitForFunction(() => document.getElementById('mp').dataset.view === 'results', null, { timeout: 5000 });

    const cTrace = await c.evaluate(() => window.trace);
    assert.equal(cTrace.filter((r) => r[1] === 'crashed' && r[3]).length, 0, 'the last player never gets a Leave button');
    for (const [name, p] of [['b', b], ['c', c]]) {
      const trace = await p.evaluate(() => window.trace);
      let lastMove = 0;
      for (let i = 1; i < trace.length; i++) if (trace[i][2] !== trace[i - 1][2]) lastMove = trace[i][0];
      const shown = trace.find((r) => r[4].startsWith('results'))[0];
      assert.ok(shown - lastMove > 1200 && shown - lastMove < 2200, `${name}: the course stands still ~1.5s before the results (${Math.round(shown - lastMove)}ms)`);
    }

    const ranking = await c.evaluate(() => [...document.querySelectorAll('#mp-ranking li')].map((l) => l.textContent));
    assert.equal(ranking.length, 3, 'the player who left is still ranked');
    assert.ok(ranking.some((r) => r.includes('(left)') && r.endsWith(String(aScore).padStart(5, '0'))), JSON.stringify(ranking));

    await b.click('#mp-again'); // anyone can start another round; ready is cleared
    await c.waitForFunction(() => document.getElementById('mp').dataset.view === 'lobby');
    const next = await lobby(c);
    assert.deepEqual(next.tags, ['not ready', 'not ready']);
    await closeAll([a, b, c]);
  });

  it('a seventh player is turned away', async () => {
    const six = await joinRace(5);
    const late = await openPage(browser, `${host.url}/?join`);
    await late.waitForFunction(() => document.getElementById('mp').dataset.view === 'error');
    assert.match(await late.textContent('#mp-error'), /full \(6 players\)/);
    await closeAll([...six, late]);
  });

  it('typing the host address from a page with no host (as on GitHub Pages)', async () => {
    const pages = await startStatic();
    try {
      const g = await openPage(browser, pages.url);
      await g.click('#play-friends');
      assert.equal(await view(g), 'guide', 'without a host the guide is shown');
      await g.fill('#join-addr', 'not an address!');
      await g.press('#join-addr', 'Enter');
      assert.match(await g.textContent('#join-note'), /does not look like an address/);
      await g.fill('#join-addr', host.url); // "http://localhost:port"
      await g.press('#join-addr', 'Enter');
      await g.waitForURL(`${host.url}/?join`);
      await g.waitForFunction(() => document.getElementById('mp').dataset.view === 'lobby');
      await g.context().close();
    } finally {
      pages.stop();
    }
  });
});
