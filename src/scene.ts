// Draws a frame of the game: sky, sun and moon, clouds, ground, obstacles, dino and score.
// It only reads the game's state (GameView); nothing here changes the simulation.

import { MOON, mix, palette, type Palette } from './cycle';
import { VIEW_W, type Renderer, type RGB } from './renderer';
import type { Sprite } from './sprites';
import type { Obstacle } from './obstacles';
import { applyTheme } from './theme';
import { DINO_X, FLASH_MS, GROUND_W, type Cloud, type Star } from './world';

const HORIZON_Y = 127; // top of the ground sprite
const GROUND_LINE_Y = 133; // the line itself: the sun and moon are cut off here
const SKY_BODY_FADE = 0.4; // the sun is backdrop: blend it toward the sky colour
const GROUND_FADE = 0.6; // the ground is drawn a little lighter than the sprites so the dino stands out from it
const MOON_FADE = 0.55; // the moon is blended less, so it reads a little brighter against the night

/** What the scene needs to know about the game. */
export interface GameView {
  readonly status: 'idle' | 'running' | 'crashed';
  readonly clock: number; // position on the day/night cycle
  readonly now: number;
  readonly crashedAt: number;
  readonly flashOnCrash: boolean;
  readonly score: number;
  readonly highScore: number;
  readonly milestone: number;
  readonly scoreFlashing: boolean;
  readonly scoreFlashTimer: number;
  readonly dinoY: number;
  readonly jumping: boolean;
  readonly ducking: boolean;
  readonly animFrame: number;
  readonly groundX: number;
  readonly starDrift: number;
  readonly clouds: readonly Cloud[];
  readonly stars: readonly Star[];
  readonly obstacles: readonly Obstacle[];
}

export class Scene {
  constructor(private r: Renderer) {}

  render(g: GameView): void {
    const r = this.r;
    const S = r.sprites;
    const pal = this.withHitFlash(g, palette(g.clock));
    applyTheme(pal.sky, pal.fg);
    r.begin(pal.sky);

    // sky: stars, sun and moon, clipped so they rise from behind the ground line
    // the stars use the moon's tone so the two sit together
    const moonTone = mix(pal.sky, MOON, MOON_FADE);
    if (pal.night > 0.01) {
      for (const s of g.stars) {
        const x = (((s.x - g.starDrift) % VIEW_W) + VIEW_W) % VIEW_W;
        r.draw(s.alt ? S.star2 : S.star1, x, s.y, moonTone, pal.night);
      }
    }
    if (pal.sun) r.draw(S.sun, pal.sun.x, pal.sun.y, mix(pal.sky, pal.sun.color, SKY_BODY_FADE));
    if (pal.moon) r.draw(S.moon, pal.moon.x, pal.moon.y, moonTone);
    r.flush(GROUND_LINE_Y);

    for (const c of g.clouds) r.draw(S.cloud, c.x, c.y, pal.cloud);

    // ground: two tiles so it wraps seamlessly
    const gx = -g.groundX;
    const groundTone = mix(pal.sky, pal.fg, GROUND_FADE);
    r.draw(S.ground, gx, HORIZON_Y, groundTone);
    r.draw(S.ground, gx + GROUND_W, HORIZON_Y, groundTone);

    for (const o of g.obstacles) {
      const spr = S[o.type.grouped ? o.type.sprites[o.size - 1] : o.type.sprites[o.frame % o.type.sprites.length]];
      r.draw(spr, o.x, o.y, pal.fg);
    }

    this.renderDino(g, pal.fg);
    this.renderScore(g, pal.fg, pal.dim);

    if (g.status === 'crashed') {
      r.draw(S.gameOver, Math.round((VIEW_W - 191) / 2), 42, pal.fg);
      r.draw(S.restart, (VIEW_W - 36) / 2, 75, pal.fg);
    }
    r.flush();
  }

  /**
   * For a split second after a hit, swap the sky and sprite colours (a negative frame,
   * like the Duck Hunt screen flash). Softer at night so it is not a white-out.
   */
  private withHitFlash(g: GameView, pal: Palette): Palette {
    if (g.status !== 'crashed' || !g.flashOnCrash || g.now - g.crashedAt >= FLASH_MS) return pal;
    const k = 1 - 0.4 * pal.night;
    const sky = mix(pal.sky, pal.fg, k);
    const fg = mix(pal.fg, pal.sky, k);
    return { ...pal, sky, fg, cloud: mix(sky, fg, 0.25), dim: mix(sky, fg, 0.75) };
  }

  private renderDino(g: GameView, c: RGB): void {
    const S = this.r.sprites;
    let spr: Sprite;
    if (g.status === 'crashed') spr = S.dinoDead;
    else if (g.jumping || g.status === 'idle') spr = S.dinoStand;
    else if (g.ducking) spr = g.animFrame ? S.duck2 : S.duck1;
    else spr = g.animFrame ? S.dinoRun2 : S.dinoRun1;
    this.r.draw(spr, DINO_X, g.dinoY, c);
  }

  private text(str: string, x: number, y: number, c: RGB): void {
    for (const ch of str) {
      const glyph: Sprite | undefined = this.r.sprites.glyphs[ch];
      if (glyph) this.r.draw(glyph, x, y, c);
      x += 11;
    }
  }

  private renderScore(g: GameView, fg: RGB, dim: RGB): void {
    const pad = (n: number) => String(Math.min(n, 99999)).padStart(5, '0');
    const x0 = VIEW_W - 11 * 6; // the original's score position
    if (!g.scoreFlashing || g.scoreFlashTimer >= 250) {
      this.text(pad(g.scoreFlashing ? g.milestone * 100 : g.score), x0, 5, fg);
    }
    if (g.highScore > 0) {
      const hx = x0 - 100;
      this.text('HI', hx, 5, dim);
      this.text(pad(g.highScore), hx + 33, 5, dim);
    }
  }
}
