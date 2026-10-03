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
