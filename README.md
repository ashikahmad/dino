# Dino

A WebGL recreation of Chrome's offline dino game, with a twist: the background
drifts through day, afternoon, evening, night and dawn as your score climbs
(one full cycle every 1500 points).

- Rendering: WebGL1 via [TWGL](https://github.com/greggman/twgl.js); every sprite is drawn in one batched call from a single atlas.
- Sprites are hand-drawn 1-bit pixel art in `src/sprites.ts`, tinted in the shader, so there are no dark fringes while the sky changes.
- Day cycle keyframes live in `src/cycle.ts`.

**Controls:** Space / Up to jump (hold for a higher jump), Down to duck or drop faster, tap to jump and swipe down to duck on touch screens.

```
npm install
npm run dev     # local dev server
npm run build   # production build into dist/
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`
(Settings -> Pages -> Source: GitHub Actions).
