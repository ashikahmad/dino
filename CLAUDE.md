# Dino

A WebGL (via TWGL) recreation of Chrome's offline dino game with a continuous day → evening → night → dawn cycle,
sounds, and a local-Wi-Fi multiplayer race. Live at https://ashikahmad.github.io/dino/ (GitHub Pages, deployed from `main`).

## Commands

```sh
npm install        # Node 20.19+ or 22.12+
npm run dev        # Vite dev server
npm run build      # type-check (tsc) + production build into dist/
npm run host       # build, then run the race host (server/host.mjs) on :8787; prints a QR code
npm test           # all browser tests (see the dino-testing skill); about 3 minutes
npm run test:colors | test:gameplay | test:ui | test:race   # one area while you work
```

Run the area you touched while working (see the table in the `dino-testing` skill: colours → `test:colors`, rules/speed/drawing →
`test:gameplay`, screens/buttons/touch → `test:ui`, multiplayer → `test:race`), then `npm run build` and `npm test` before pushing.
The skill lives in `.claude/skills/dino-testing/`; CI runs the same tests and blocks the Pages deploy if they fail.

## Layout

| Path | Role |
| --- | --- |
| `src/main.ts` | Wires everything and runs the frame loop; exposes `window.dino` (the `Game`) for debugging and tests |
| `src/game.ts` | The simulation only: physics, obstacles, score, state, race mode. No drawing. |
| `src/scene.ts` | Draws a frame from a read-only `GameView`; ghosts, corpses, countdown, score |
| `src/renderer.ts` | One atlas texture, batched quads, one draw call per flush (scissor for the sun/moon clip) |
| `src/cycle.ts` | Day/night model: sun altitude → sky and content colours (one OKLCH stop table, used both ways), sun, moon |
| `src/theme.ts` | Writes the page background/colour only when the 8-bit colour changes |
| `src/obstacles.ts`, `src/world.ts` | Obstacle types and collision boxes; shared constants, `Ghost`, `seededRandom` |
| `src/sprites.ts`, `src/art.ts` | Pixel art as text rows → atlas. 1-bit sprites, coloured in the shader. |
| `src/input.ts`, `src/panel.ts`, `src/bar.ts` | Keyboard/touch; start screen and About card; sound and fullscreen buttons |
| `src/multiplayer.ts`, `src/net.ts`, `src/qr.ts` | The race: guide, lobby, ready-up, ghosts, scoreboard, results |
| `server/host.mjs` | Plain Node: serves `dist/`, `/lan.json`, and one lobby over WebSocket (`ws`). Protocol is documented at its top. |
| `.github/workflows/deploy.yml` | Build and deploy to Pages on push to `main` |

## Rules this codebase relies on

- **Fixed 60 Hz simulation.** `Game.update` accumulates time and calls `step()`; drawing interpolates (`alpha`) between the
  last two steps and snaps to device pixels. Never advance things by `dt` directly.
- **Obstacles use the seeded RNG only** (`this.rng`, `randInt`). Races depend on every device producing the same course
  from the same seed. Clouds and stars use `Math.random` (cosmetic).
- **Sprites are ink pixels only**: no halo, outline or anti-aliasing. Colour comes from the palette in the shader.
- **Colours are calm and flat.** Edit the stop table at the top of `src/cycle.ts` (OKLCH: lightness, chroma, hue; content is
  the sky's opposite hue). Contrast dips briefly where the content flips dark → light; that is known.
- **No per-frame DOM writes.** Page styles change only when the quantised colour changes; the start and Game Over screens
  are not redrawn. Keep it that way (a test checks style recalculations).
- **Original behaviour** (gravity, jump, speed ramp, scoring, collision boxes) follows Chromium's `dino_game`; see `NOTES.md`
  for the two differences left on purpose (mobile bird heights and slowdown, 1200 ms restart delay).
- CSS: `.pill[hidden]` needs its own `display: none` (class `display` overrides the `hidden` attribute).

## Multiplayer in one paragraph

Pages can't open sockets, so a host (`npm run host`) serves the game and relays messages. Clients join the one lobby,
tap Ready, then anyone starts once all are ready. The host sends a shared seed; each device runs its own game and sends
`state` (~15 Hz) and `dead {s, y, at}`. Others are faint ghosts. After you crash the course keeps running (`Game.race`);
`courseStopped` freezes it when results arrive, 1.5 s before the results card. Leavers keep their score in the ranking.
A hidden tab forfeits. The host is only reachable over plain `http://` on the LAN, so the Pages site just shows the guide.

## Working agreements with the owner

- Discuss a design first when it is a judgment call ("What do you think?"), then build it in small steps.
- Use feature branches (`feature/...`); merge to `main` only when asked. Pushes to `main` deploy the live site.
- Keep it simple, calm and close to the original look. Prefer fewer moving parts.

## Still to do by hand

- Create the `v1` git tag at commit `1904c66` (tag pushes were blocked from the cloud session).
- Set the GitHub repo description and website link.
- Optionally: the deferred differences in `NOTES.md`.
