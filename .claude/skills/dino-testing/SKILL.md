---
name: dino-testing
description: Run and extend the browser tests for the Dino game (solo play, motion and performance, and multiplayer races). Use after changing anything in src/, server/ or index.html, before pushing, or when a bug needs reproducing in a real browser.
---

# Testing the Dino game

The tests drive the real game in headless Chromium with Playwright and check what a player would see.
They start their own servers on free ports, so nothing needs to be running first.

## Run them

```sh
npm install                      # once; includes playwright-core
npm test                         # everything, about 3 minutes
node --test .claude/skills/dino-testing/scripts/solo.test.mjs      # one file
node --test --test-name-pattern="hit flash" .claude/skills/dino-testing/scripts/solo.test.mjs   # one test
```

Chromium is taken from `CHROMIUM_PATH`, else `/opt/pw-browsers/chromium` if it exists, else Playwright's own
download (`npx playwright-core install chromium`). WebGL runs on software rendering, so no GPU is needed.
Also run `npx tsc --noEmit` (or `npm run build`) before pushing; the tests do not type-check.

## What is covered

| File | Covers |
| --- | --- |
| `scripts/solo.test.mjs` | Still start screen, Share/GitHub buttons not starting the game, start → crash → About card → restart, instant card close over Game Over, the hit flash (day, night, reduced motion), touch gestures never leaving the dino ducking, icon bar flush right |
| `scripts/motion.test.mjs` | Cacti move a steady 6px a step despite uneven frames; no page restyle per frame while the sky is steady |
| `scripts/race.test.mjs` | Lobby and ready-up, anyone can start, same obstacles for everyone, hidden tab counts as out, exact crash placement, course keeps running for out players, Leave race rules, the world stops before results, leavers stay ranked (`(left)`), play again clears ready, a seventh player is turned away, typing the host address |
| `scripts/lib.mjs` | Starting `vite` (dev), the host (`server/host.mjs`, after a build) and a plain static server like GitHub Pages; launching Chromium; `openPage`, `crash` |

## How the tests reach into the game

`window.dino` is the `Game` instance (set in `src/main.ts`). TypeScript `private` is not enforced at run time, so tests
read and set fields directly: `status`, `score`, `dinoY`, `obstacles`, `ghosts`, `travel`, `groundX`, `race`,
`courseStopped`, and they replace `collides` to make a player invulnerable. Useful moves:

- Skip ahead the day/night cycle: `dino.skipTo(points)` (1500 points per cycle).
- Make a player unkillable: `dino.collides = () => false`; restore with the saved original.
- Jump to obstacles at once: `dino.runningTime = 99999`.

## Writing a new test

1. Pick the file by the server it needs: dev server (`solo`, `motion`) or host (`race`).
2. Use `openPage(browser, url, contextOptions)`; it fails the test if the game never loads and collects uncaught
   page errors in `page.errors` (assert it is empty at the end of flows).
3. Wait for state with `page.waitForFunction`, not fixed sleeps, except where time itself is the thing measured.
4. For multiplayer, use `joinRace(n)` and `readyAll(pages)` from `race.test.mjs`; always close the pages' contexts.
5. Prove a new test can fail: break the code it guards (comment out the fix) and watch it go red, then restore.

## Known limits

- Real phones, real Wi-Fi and real GPUs are not covered: frame timing here is software-rendered.
- The tests run files in turn (`--test-concurrency=1`) because several browsers at once make timing checks flaky.
