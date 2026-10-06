# Dino

A WebGL recreation of Chrome's offline dino game, with a twist: the background
drifts through day, afternoon, evening, night and dawn as your score climbs
(one full cycle every 1500 points).

- Rendering: WebGL1 via [TWGL](https://github.com/greggman/twgl.js); every sprite is drawn in one batched call from a single atlas.
- Sprites are 1-bit pixel art in `src/art.ts` (one text row per pixel row, easy to edit), tinted in the shader, so there are no dark fringes while the sky changes. The art is traced from the sprite sheet of Chromium's offline dino game, keeping only the ink pixels and leaving out the sheet's white halo. The sun and moon are drawn in `src/sprites.ts`.
- Day cycle keyframes live in `src/cycle.ts`.

**Start screen:** a pixel-art title, short instructions, Share and GitHub buttons and credits. After a crash, the info button (or the I key) shows the same card again.

**Controls:** Space / Up to jump (hold for a higher jump), Down to duck or drop faster, M for sound, F for fullscreen (where the browser allows it), tap to jump and swipe down to duck on touch screens.

```
npm install
npm run dev     # local dev server
npm run build   # production build into dist/
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`
(Settings -> Pages -> Source: GitHub Actions).

## Credits

Made by Ashik uddin Ahmad, with Claude.

Sprite shapes, sizes, collision boxes and game constants follow Chromium's offline dino game
(BSD-3-Clause, Copyright 2013 The Chromium Authors).

## Race friends on your Wi-Fi

Up to six players can race the same course, each on their own device. Everyone gets the same
obstacles and sees the others as faint dinos running just behind theirs; the highest score wins.

GitHub Pages cannot connect devices to each other, so one person hosts from a laptop:

```sh
git clone https://github.com/ashikahmad/dino && cd dino && npm install && npm run host
```

It prints an address and a QR code. Open the address on the laptop and choose **Play with
friends**; friends on the same Wi-Fi scan the code with their camera, or on a laptop type the address
(*Play with friends* → *Joining a friend?*). Everyone taps **I'm ready**; once all are ready, anyone can
tap **Start race**. (The same steps are in the game, under *Play with friends*.)

Needs Node 20.19+ or 22.12+. Run `npm install` again after pulling updates.

Guest Wi-Fi networks often stop devices from seeing each other; use a normal network or a phone hotspot.
`PORT=9000 npm run host` picks another port.

## Tests

`npm test` runs the browser tests in `.claude/skills/dino-testing/` (headless Chromium via Playwright; see the `SKILL.md` there). See `CLAUDE.md` for the project's rules and layout.

## Code layout

| File | Role |
| --- | --- |
| `src/main.ts` | Wires everything together and runs the frame loop |
| `src/game.ts` | The simulation: physics, obstacles, score, state (no drawing) |
| `src/obstacles.ts`, `src/world.ts` | Obstacle types and collision boxes; shared layout constants |
| `src/scene.ts` | Draws a frame from the game's state |
| `src/theme.ts` | Tints the page around the canvas, only when the colour changes |
| `src/cycle.ts` | The day/night model: sun, moon, sky and sprite colours |
| `src/renderer.ts`, `src/sprites.ts`, `src/art.ts` | WebGL batching, atlas building, pixel art |
| `src/input.ts`, `src/panel.ts`, `src/bar.ts` | Keyboard/touch input, start screen and About card, sound and fullscreen buttons |
| `src/sound.ts` | Synthesised sound effects |
| `src/multiplayer.ts`, `src/net.ts`, `src/qr.ts` | The race: guide, lobby, ghosts, scoreboard, results |
| `server/host.mjs` | The host: serves the built game and relays messages between players |
