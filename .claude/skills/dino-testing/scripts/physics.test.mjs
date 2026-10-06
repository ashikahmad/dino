// Gameplay rules that must match Chromium's original dino game: the jump, the speed drop, the speed ramp, scoring.
// The reference below is a direct port of the original `Trex.updateJump` (Chromium, components/neterror/resources/dino_game).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { launch, openPage, startDev } from './lib.mjs';

let dev, browser, page;
before(async () => {
  dev = await startDev();
  browser = await launch();
  page = await openPage(browser, dev.url);
});
after(async () => {
  await browser?.close();
  dev?.stop();
});

/** The original's jump, one 60 Hz frame at a time. Returns the highest point reached and the frames in the air. */
function originalJump(speed, { dropAfter = null } = {}) {
  const GROUND = 93, GRAVITY = 0.6, MIN_JUMP = 30, MAX_JUMP_HEIGHT = 30, DROP_VELOCITY = -5, SPEED_DROP = 3;
  let y = GROUND, v = -10 - speed / 10, reachedMin = false, speedDrop = false, apex = GROUND, frames = 0;
  const endJump = () => { if (reachedMin && v < DROP_VELOCITY) v = DROP_VELOCITY; };
  for (; frames < 300; ) {
    frames++;
    if (dropAfter === frames) { speedDrop = true; v = 1; }
    y += Math.round(v * (speedDrop ? SPEED_DROP : 1));
    v += GRAVITY;
    if (y < GROUND - MIN_JUMP || speedDrop) reachedMin = true;
    if (y < MAX_JUMP_HEIGHT || speedDrop) endJump();
    apex = Math.min(apex, y);
    if (y > GROUND) break;
  }
  return { apex, frames };
}

/** Our jump, driven one fixed step at a time with nothing in the way. */
const ourJump = (speed, dropAfter = null) =>
  page.evaluate(
    ([speed, dropAfter]) => {
      const g = window.dino;
      g.leaveRace();
      g.pressJump(); // starts running with a jump
      g.releaseJump();
      g.obstacles = [];
      g.speed = speed;
      g.jumping = false;
      g.pressJump(); // a fresh jump at this speed
      let apex = g.dinoY, frames = 0, yAtDrop = null, lowestAfterDrop = null;
      while (g.jumping && frames < 300) {
        frames++;
        if (dropAfter === frames) { g.pressDown(); yAtDrop = g.dinoY; }
        g.runningTime = 0; // keep obstacles away
        g.rememberPositions();
        g.step();
        apex = Math.min(apex, g.dinoY);
        if (yAtDrop !== null) lowestAfterDrop = Math.min(lowestAfterDrop ?? 1e9, g.dinoY);
      }
      g.releaseDown();
      return { apex, frames, yAtDrop, lowestAfterDrop };
    },
    [speed, dropAfter],
  );

describe('gameplay matches the original', () => {
  for (const speed of [6, 9, 13]) {
    it(`a jump at speed ${speed} reaches the same height and takes the same time`, async () => {
      const want = originalJump(speed);
      const got = await ourJump(speed);
      assert.ok(Math.abs(got.apex - want.apex) <= 2, `apex ${got.apex.toFixed(1)} vs original ${want.apex}`);
      assert.ok(Math.abs(got.frames - want.frames) <= 2, `${got.frames} frames in the air vs original ${want.frames}`);
    });
  }

  it('pressing down in mid-air drops the dino at once and never lifts it higher', async () => {
    const got = await ourJump(6, 6);
    assert.ok(got.lowestAfterDrop >= got.yAtDrop - 1, `after the press it went up from ${got.yAtDrop.toFixed(1)} to ${got.lowestAfterDrop.toFixed(1)}`);
    const want = originalJump(6, { dropAfter: 6 });
    assert.ok(Math.abs(got.frames - want.frames) <= 2, `${got.frames} frames vs original ${want.frames}`);
  });

  it('speed ramps from 6 by 0.001 a step and stops at 13', async () => {
    const r = await page.evaluate(() => {
      const g = window.dino;
      g.leaveRace();
      g.pressJump();
      g.collides = () => false;
      g.speed = 6;
      for (let i = 0; i < 1000; i++) { g.rememberPositions(); g.step(); }
      const after1000 = g.speed;
      g.speed = 12.9995;
      for (let i = 0; i < 20; i++) { g.rememberPositions(); g.step(); }
      return { after1000, capped: g.speed };
    });
    assert.ok(Math.abs(r.after1000 - 7) < 0.01, `speed after 1000 steps: ${r.after1000}`);
    assert.equal(r.capped, 13);
  });

  it('score is distance x 0.025: about 94 points in the first 10 seconds', async () => {
    const r = await page.evaluate(() => {
      const g = window.dino;
      g.leaveRace();
      g.pressJump();
      g.collides = () => false;
      g.speed = 6;
      g.distance = 0;
      g.score = 0;
      for (let i = 0; i < 600; i++) { g.rememberPositions(); g.step(); } // 10 seconds
      return { score: g.score, distance: g.distance };
    });
    assert.equal(r.score, Math.floor(r.distance * 0.025));
    // 600 steps at speed 6 rising by 0.001 a step: 600 x 6.3 x 0.025
    assert.ok(r.score >= 90 && r.score <= 98, `score after 10s: ${r.score}`);
  });
});
