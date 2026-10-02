# Dino: WebGL recreation of Chrome's offline game

## Decisions (confirmed)
- Sprites: hand-drawn pixel data in code, close to the original (not the Chromium PNG).
- Sky: flat colour that tweens between phases (no gradient).
- Day cycle: score-based, ~1500 points per full loop.
- Repo: public, GitHub Pages for the live demo.

## Stack
- Vanilla TypeScript + Vite. No framework, no WebGL library. Raw WebGL1.
- Deploy: GitHub Actions workflow builds and publishes to Pages on push to `main`.
  Vite `base` set to `/dino/`.

## Rendering
- Logical canvas 600x150, integer-scaled to fit the window, DPR-aware, nearest filtering.
- Sprites authored as ASCII/bitmap arrays in `src/sprites.ts`, packed at startup into
  one atlas texture (canvas -> `texImage2D`). No image assets.
- One shader program: textured quad batch with a `uTint` uniform. One dynamic vertex
  buffer, one draw call per frame.
- Sky: clear colour set from the day-cycle each frame.
- Foreground is `#535353` on day, lerped to `#f7f7f7`-ish at night via the tint.

## Game (original mechanics)
- Dino: idle, run (2 frames), jump, duck (2 frames), dead.
- Obstacles: small cactus (1-3 group), large cactus (1-3 group), pterodactyl
  (3 heights, 2 wing frames, appears after ~700 points).
- Scenery: ground line with bumps, clouds, moon + stars (night only).
- Constants from the original: gravity 0.6, jump velocity -10, speed 6 -> 13,
  acceleration 0.001, min gap scaling with speed.
- Score: 5 digits, flashes every 100 points, `HI 00000` high score (localStorage).
- Game over: "GAME OVER" text sprite + restart icon. Restart on Space/Up/tap.
- Input: Space/Up jump, Down duck, tap/swipe on touch.
- Collision: AABB with per-sprite sub-boxes. Fixed timestep loop on rAF.
- Start on first key press. Pause when the tab is hidden.
- Sound: out of scope for v1 (optional later).

## Day cycle
Keyframes by cycle position `p = (score mod 1500) / 1500`:

| p     | Phase     | Sky       | Foreground |
|-------|-----------|-----------|------------|
| 0.00  | Day       | #f7f7f7   | #535353    |
| 0.25  | Afternoon | #f3e3c3   | #535353    |
| 0.45  | Evening   | #e8a67c   | #4a3f4b    |
| 0.60  | Night     | #202124   | #acacac    |
| 0.85  | Dawn      | #8fa3c4   | #535353    |
| 1.00  | Day       | #f7f7f7   | #535353    |

(Exact colours get tuned by eye while building.)
Linear RGB lerp between neighbouring keyframes. Moon and stars fade in around
p 0.5-0.6 and out around 0.85. Cycle freezes on death and resets on restart.

## Milestones
1. Scaffold: Vite + TS, WebGL context, atlas packer, sprite batch, resize handling, Pages workflow.
2. Sprites: dino, cacti, pterodactyl, ground, cloud, moon, stars, digits, game-over text.
3. Core loop: ground scroll, dino physics, obstacle spawning, collision, score, restart.
4. Pterodactyl, ducking, speed ramp, high score, touch input.
5. Day cycle: keyframe table, tint uniform, moon/stars.
6. Polish and verify: compare against the original side by side, test in headless Chromium
   (Playwright), tune colours, README with the demo link.

## Risks
- Hand-drawn sprites need tuning to look like the original. Iterate with screenshots.
- Pages needs the repo public (confirmed) and Pages source set to "GitHub Actions".
