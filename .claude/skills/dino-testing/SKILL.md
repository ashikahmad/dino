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
npm run test:colors              # one area (see below)
node --test --test-name-pattern="hit flash" .claude/skills/dino-testing/scripts/solo.test.mjs   # one test
```

Chromium is taken from `CHROMIUM_PATH`, else `/opt/pw-browsers/chromium` if it exists, else Playwright's own
download (`npx playwright-core install chromium`). WebGL runs on software rendering, so no GPU is needed.
Also run `npm run build` (it type-checks) before pushing; the tests do not.

## Pick tests by what you changed

Each area is a group of files with its own `npm run` script. Run the area you touched while working, and `npm test` before pushing.

| You changed | Run | Takes | What it protects |
| --- | --- | --- | --- |
| `src/cycle.ts` (colours, sun, moon) | `npm run test:colors` | seconds, no browser | Smooth sky, readable content, dawn = dusk reversed, sun and moon never together, safe restarts |
| `src/game.ts`, `src/obstacles.ts`, `src/world.ts` (rules, speed, jumping), `src/renderer.ts`, `src/scene.ts` (drawing, frame cost) | `npm run test:gameplay` | ~30 s | Jump, speed drop, speed ramp and score match the original; steady 6px steps; no per-frame restyling |
| `index.html`, `src/panel.ts`, `src/bar.ts`, `src/input.ts`, `src/main.ts` (screens, buttons, touch) | `npm run test:ui` | ~1.5 min | Start screen, About card, restart flow, hit flash, touch gestures, icon bar, phone layouts |
| `src/multiplayer.ts`, `src/net.ts`, `server/host.mjs`, race code in `src/game.ts`/`src/scene.ts` | `npm run test:race` | ~1 min | Lobby and ready-up, shared course, crashes, spectating, results, leavers, join by address |

If you are unsure, or changed shared code (`src/game.ts`, `index.html`), run `npm test`.

## What is covered, file by file

| File | Area | Covers |
| --- | --- | --- |
| `scripts/palette.test.mjs` | colors | Sky continuity (no hue wrapping the wrong way), contrast with short allowed flips, day/night extremes, symmetry around noon, sun and moon never together, `safeAfter`. Needs Node 22.18+ (skips on older Node). |
| `scripts/physics.test.mjs` | gameplay | Jump height and air time at speeds 6, 9 and 13 against a port of the original `Trex.updateJump`; speed drop; speed ramp and cap; score |
| `scripts/motion.test.mjs` | gameplay | Cacti move a steady 6px a step despite uneven frames; no page restyle per frame while the sky is steady |
| `scripts/solo.test.mjs` | ui | Still start screen, Share/GitHub not starting the game, start, crash, About card, restart; instant card close over Game Over; hit flash (day, night, reduced motion); touch gestures; icon bar |
| `scripts/layout.test.mjs` | ui | Start screen by room (big window, phone landscape, short landscape, portrait); the About card on a short phone |
| `scripts/race.test.mjs` | race | Lobby and ready-up, anyone can start, same obstacles, hidden tab forfeits, exact crash placement, course runs on for out players, Leave race rules, world stops before results, leavers stay ranked, play again, a seventh player turned away, typing the host address |
| `scripts/lib.mjs` | (helpers) | Starting `vite` (dev), the host (`server/host.mjs`, after a build) and a plain static server like GitHub Pages; launching Chromium; `openPage`, `crash` |

Not covered: sound effects, fullscreen, real phones, real Wi-Fi, real GPUs (frame timing here is software-rendered).

## How the tests reach into the game

`window.dino` is the `Game` instance (set in `src/main.ts`). TypeScript `private` is not enforced at run time, so tests
read and set fields directly: `status`, `score`, `dinoY`, `obstacles`, `ghosts`, `travel`, `groundX`, `race`,
`courseStopped`, and they replace `collides` to make a player invulnerable. Useful moves:

- Skip ahead the day/night cycle: `dino.skipTo(points)` (1500 points per cycle).
- Make a player unkillable: `dino.collides = () => false`; restore with the saved original.
- Jump to obstacles at once: `dino.runningTime = 99999`.

## Writing a new test

1. Pick the file by area and server: dev server (`physics`, `motion`, `solo`, `layout`), host (`race`), or no server (`palette`). New area? Add an npm script in `package.json` and a row in the table above.
2. Use `openPage(browser, url, contextOptions)`; it fails the test if the game never loads and collects uncaught
   page errors in `page.errors` (assert it is empty at the end of flows).
3. Wait for state with `page.waitForFunction`, not fixed sleeps, except where time itself is the thing measured.
4. For multiplayer, use `joinRace(n)` and `readyAll(pages)` from `race.test.mjs`; always close the pages' contexts.
5. Prove a new test can fail: break the code it guards (comment out the fix) and watch it go red, then restore.

## Known limits

- CI (`.github/workflows/test.yml`) runs `npm test` on every push and pull request, and the deploy workflow will not publish unless the tests pass.
- The tests run files in turn (`--test-concurrency=1`) because several browsers at once make timing checks flaky.
