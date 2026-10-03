import { MOON, NIGHT_START, mix, palette, safeAfter, type Palette } from './cycle';
import { Renderer, VIEW_W, type RGB } from './renderer';
import { Sound } from './sound';
import type { Sprite, SpriteName } from './sprites';

// Constants follow the original Chrome game (units: px per 60Hz frame).
const GRAVITY = 0.6;
const INITIAL_JUMP_VELOCITY = -10;
const DROP_VELOCITY = -5;
const SPEED_DROP_COEFFICIENT = 3;
const MIN_JUMP_HEIGHT = 30;
const MAX_JUMP_HEIGHT = 30;
const START_SPEED = 6;
const MAX_SPEED = 13;
const ACCELERATION = 0.001;
const SCORE_COEFFICIENT = 0.025;
const GAP_COEFFICIENT = 0.6;
const CLEAR_TIME = 3000;
const GAP_RESPAWN = 750;
const FRAME_MS = 1000 / 60;
const DINO_X = 50;
const DINO_W = 44;
const DINO_H = 47;
const DINO_GROUND_Y = 93; // 150 - 47 - 10, as in the original
const HORIZON_Y = 127; // top of the ground sprite
const GROUND_LINE_Y = 133; // the line itself: the sun and moon are cut off here
const GROUND_W = 1200;
const FLASH_MS = 100; // one negative flash when the dino is hit
const NUDGE_MS = 500; // game-over transition that steps the sky out of a low-contrast moment
const MAX_CLOUDS = 6;
const SKY_BODY_FADE = 0.4; // the sun is backdrop: blend it toward the sky colour
const MOON_FADE = 0.55; // the moon is blended less, so it reads a little brighter against the night

type Box = [number, number, number, number]; // x, y, w, h relative to the sprite

interface ObstacleType {
  sprites: SpriteName[]; // cacti: one sprite per group size; pterodactyl: the wing frames
  grouped: boolean;
  w: number; // width of one unit
  h: number;
  y: number[]; // possible top positions
  minGap: number;
  minSpeed: number;
  multipleSpeed: number;
  boxes: Box[]; // collision boxes for a single unit
}

// Sizes, positions and collision boxes are the original game's.
const TYPES: Record<string, ObstacleType> = {
  cactusSmall: {
    sprites: ['cactusSmall1', 'cactusSmall2', 'cactusSmall3'], grouped: true,
    w: 17, h: 35, y: [105], minGap: 120, minSpeed: 0, multipleSpeed: 4,
    boxes: [[0, 7, 5, 27], [4, 0, 6, 34], [10, 4, 7, 14]],
  },
  cactusLarge: {
    sprites: ['cactusLarge1', 'cactusLarge2', 'cactusLarge3'], grouped: true,
    w: 25, h: 50, y: [90], minGap: 120, minSpeed: 0, multipleSpeed: 7,
    boxes: [[0, 12, 7, 38], [8, 0, 7, 49], [13, 10, 10, 38]],
  },
  ptero: {
    sprites: ['ptero1', 'ptero2'], grouped: false,
    w: 46, h: 40, y: [100, 75, 50], minGap: 150, minSpeed: 8.5, multipleSpeed: 999,
    boxes: [[15, 15, 16, 5], [18, 21, 24, 6], [2, 14, 4, 3], [6, 10, 4, 7], [10, 8, 6, 9]],
  },
};

const DINO_BOXES: Box[] = [[22, 0, 17, 16], [1, 18, 30, 9], [10, 35, 14, 8], [1, 24, 29, 5], [5, 30, 21, 4], [9, 34, 15, 4]];
const DUCK_BOXES: Box[] = [[1, 18, 55, 25]];

/** A group of cacti shares one set of boxes: the middle one stretches, the right one moves out. */
function obstacleBoxes(type: ObstacleType, size: number): Box[] {
  const boxes = type.boxes.map((b) => [...b] as Box);
  if (size > 1 && type.grouped) {
    const width = size * type.w;
    boxes[1][2] = width - boxes[0][2] - boxes[2][2];
    boxes[2][0] = width - boxes[2][2];
  }
  return boxes;
}

const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

interface Obstacle {
  type: ObstacleType;
  size: number;
  x: number;
  y: number;
  gap: number;
  speedOffset: number;
  frame: number;
  frameTimer: number;
  followed: boolean;
}

interface Cloud { x: number; y: number }
interface Star { x: number; y: number; alt: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

type State = 'idle' | 'running' | 'crashed';

export class Game {
  readonly sound = new Sound();
  private state: State = 'idle';
  private speed = START_SPEED;
  private distance = 0;
  private score = 0;
  // Where on the day/night cycle this run began. Runs carry on from where the last one ended.
  private clockBase = 0;
  private crashClock = 0;
  private nudgeTo = 0;
  private nudgeT = NUDGE_MS;
  private flashOnCrash = true;
  private highScore = 0;
  private runningTime = 0;
  private crashedAt = 0;
  private now = 0;

  // dino
  private dinoY = DINO_GROUND_Y;
  private jumping = false;
  private jumpVelocity = 0;
  private reachedMinHeight = false;
  private speedDrop = false;
  private ducking = false;
  private downHeld = false;
  private animTimer = 0;
  private animFrame = 0;

  private obstacles: Obstacle[] = [];
  private lastTypes: string[] = [];
  private clouds: Cloud[] = [];
  private stars: Star[] = [];
  private groundX = 0;
  private starDrift = 0;
  private cloudGap = 0;

  // score flash
  private milestone = 0;
  private flashing = false;
  private flashTimer = 0;
  private flashIter = 0;

  constructor(private r: Renderer) {
    try {
      this.highScore = Number(localStorage.getItem('dino-hi')) || 0;
    } catch {
      /* storage unavailable */
    }
    for (let i = 0; i < 14; i++) {
      this.stars.push({ x: rand(0, VIEW_W), y: rand(0, 70), alt: Math.random() < 0.5 });
    }
    this.clouds.push({ x: rand(100, 500), y: rand(30, 71) });
    this.cloudGap = rand(100, 400);
  }

  /** Before the first run, start in the night for dark-mode users and in the day otherwise. */
  setPreferDark(dark: boolean): void {
    if (this.state === 'idle') this.clockBase = dark ? NIGHT_START : 0;
  }

  private clock(): number {
    if (this.state !== 'crashed') return this.clockBase + this.score;
    const k = this.nudgeT / NUDGE_MS;
    const ease = 1 - (1 - k) ** 3;
    return this.crashClock + (this.nudgeTo - this.crashClock) * ease;
  }

  /** Jump ahead in score (used for testing the day cycle). */
  skipTo(points: number): void {
    this.distance = points / SCORE_COEFFICIENT;
    this.score = points;
    this.milestone = Math.floor(points / 100);
  }

  // ------------------------------------------------------------------ input

  pressJump(): void {
    this.sound.unlock();
    if (this.state === 'crashed') {
      if (this.now - this.crashedAt >= GAP_RESPAWN) this.restart();
      return;
    }
    if (this.state === 'idle') this.state = 'running';
    if (!this.jumping && !this.ducking) {
      this.jumping = true;
      this.sound.jump();
      this.jumpVelocity = INITIAL_JUMP_VELOCITY - this.speed / 10;
      this.reachedMinHeight = false;
      this.speedDrop = false;
    }
  }

  releaseJump(): void {
    if (this.jumping && this.reachedMinHeight && this.jumpVelocity < DROP_VELOCITY) {
      this.jumpVelocity = DROP_VELOCITY;
    }
  }

  pressDown(): void {
    this.sound.unlock();
    this.downHeld = true;
    if (this.state !== 'running') return;
    if (this.jumping) this.speedDrop = true;
    else this.ducking = true;
  }

  releaseDown(): void {
    this.downHeld = false;
    this.speedDrop = false;
    this.ducking = false;
  }

  private restart(): void {
    this.clockBase = this.clock();
    this.state = 'running';
    this.speed = START_SPEED;
    this.distance = 0;
    this.score = 0;
    this.runningTime = 0;
    this.obstacles = [];
    this.lastTypes = [];
    this.dinoY = DINO_GROUND_Y;
    this.jumping = false;
    this.speedDrop = false;
    this.ducking = this.downHeld;
    this.milestone = 0;
    this.flashing = false;
  }

  // ----------------------------------------------------------------- update

  update(dtMs: number): void {
    dtMs = Math.min(dtMs, 100);
    this.now += dtMs;
    if (this.state === 'crashed') {
      this.nudgeT = Math.min(NUDGE_MS, this.nudgeT + dtMs);
      return;
    }
    if (this.state !== 'running') return; // the idle screen is frozen
    const df = dtMs / FRAME_MS;

    this.updateClouds(df);
    this.starDrift = (this.starDrift + 0.3 * df) % VIEW_W;

    this.runningTime += dtMs;
    this.groundX = (this.groundX + this.speed * df) % GROUND_W;
    this.updateDino(df, dtMs);

    if (this.runningTime > CLEAR_TIME) this.updateObstacles(df, dtMs);

    if (this.obstacles.length && this.collides()) {
      this.state = 'crashed';
      this.sound.hit();
      this.crashedAt = this.now;
      this.flashOnCrash = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.crashClock = this.clockBase + this.score;
      this.nudgeTo = safeAfter(this.crashClock);
      this.nudgeT = 0;
      this.flashing = false;
      this.jumping = false;
      this.ducking = false;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        try {
          localStorage.setItem('dino-hi', String(this.highScore));
        } catch {
          /* storage unavailable */
        }
      }
      return;
    }

    this.distance += this.speed * df;
    this.score = Math.floor(this.distance * SCORE_COEFFICIENT);
    if (this.speed < MAX_SPEED) this.speed = Math.min(MAX_SPEED, this.speed + ACCELERATION * df);

    const m = Math.floor(this.score / 100);
    if (m > this.milestone && m > 0) {
      this.sound.score();
      this.flashing = true;
      this.flashTimer = 0;
      this.flashIter = 0;
    }
    this.milestone = m;
    if (this.flashing) {
      this.flashTimer += dtMs;
      if (this.flashTimer > 500) {
        this.flashTimer = 0;
        if (++this.flashIter >= 3) this.flashing = false;
      }
    }
  }

  private updateDino(df: number, dtMs: number): void {
    this.animTimer += dtMs;
    if (this.animTimer >= 1000 / 12) {
      this.animTimer = 0;
      this.animFrame ^= 1;
    }
    if (!this.jumping) return;

    const groundY = DINO_GROUND_Y;
    this.dinoY += this.jumpVelocity * (this.speedDrop ? SPEED_DROP_COEFFICIENT : 1) * df;
    this.jumpVelocity += GRAVITY * df;

    if (this.dinoY < groundY - MIN_JUMP_HEIGHT || this.speedDrop) this.reachedMinHeight = true;
    if (this.dinoY < MAX_JUMP_HEIGHT || this.speedDrop) this.releaseJump();
    if (this.dinoY >= groundY) {
      this.dinoY = groundY;
      this.jumping = false;
      this.speedDrop = false;
      this.ducking = this.downHeld;
    }
  }

  private updateObstacles(df: number, dtMs: number): void {
    for (const o of this.obstacles) {
      o.x -= (this.speed + o.speedOffset) * df;
      if (!o.type.grouped) {
        o.frameTimer += dtMs;
        if (o.frameTimer >= 1000 / 6) {
          o.frameTimer = 0;
          o.frame ^= 1;
        }
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.size * o.type.w > 0);

    const last = this.obstacles[this.obstacles.length - 1];
    if (!last) {
      this.addObstacle();
    } else if (!last.followed && last.x + last.size * last.type.w + last.gap < VIEW_W) {
      last.followed = true;
      this.addObstacle();
    }
  }

  private addObstacle(): void {
    const names = Object.keys(TYPES).filter((n) => {
      if (TYPES[n].minSpeed > this.speed) return false;
      const l = this.lastTypes;
      return !(l.length >= 2 && l[l.length - 1] === n && l[l.length - 2] === n);
    });
    const name = names[randInt(0, names.length - 1)];
    const type = TYPES[name];
    const size = this.speed >= type.multipleSpeed ? randInt(1, 3) : 1;
    const width = size * type.w;
    const minGap = Math.round(width * this.speed + type.minGap * GAP_COEFFICIENT);
    this.obstacles.push({
      type,
      size,
      x: VIEW_W,
      y: type.y[randInt(0, type.y.length - 1)],
      gap: randInt(minGap, Math.round(minGap * 1.5)),
      speedOffset: !type.grouped ? (Math.random() < 0.5 ? -0.8 : 0.8) : 0,
      frame: 0,
      frameTimer: 0,
      followed: false,
    });
    this.lastTypes.push(name);
    if (this.lastTypes.length > 2) this.lastTypes.shift();
  }

  private updateClouds(df: number): void {
    for (const c of this.clouds) c.x -= df;
    this.clouds = this.clouds.filter((c) => c.x > -46);
    const last = this.clouds[this.clouds.length - 1];
    if (this.clouds.length < MAX_CLOUDS && (!last || VIEW_W - last.x > this.cloudGap)) {
      this.clouds.push({ x: VIEW_W, y: rand(30, 71) });
      this.cloudGap = rand(100, 400);
    }
  }

  private collides(): boolean {
    const dBoxes = this.ducking && !this.jumping ? DUCK_BOXES : DINO_BOXES;
    const dx = DINO_X, dy = this.dinoY;
    for (const o of this.obstacles) {
      const width = o.size * o.type.w;
      // cheap outer test first, then the detailed boxes
      if (!overlap(dx + 1, dy + 1, DINO_W - 2, DINO_H - 2, o.x + 1, o.y + 1, width - 2, o.type.h - 2)) continue;
      for (const ob of obstacleBoxes(o.type, o.size)) {
        for (const db of dBoxes) {
          if (overlap(dx + db[0], dy + db[1], db[2], db[3], o.x + ob[0], o.y + ob[1], ob[2], ob[3])) return true;
        }
      }
    }
    return false;
  }

  // ----------------------------------------------------------------- render

  render(): void {
    const r = this.r;
    const S = r.sprites;
    // Cycle is score-based: frozen on game over, restarts with the score.
    const pal = this.withHitFlash(palette(this.clock()));
    document.body.style.background = rgbCss(pal.sky);
    document.body.style.color = rgbCss(pal.fg); // the mute button follows the sprite colour
    r.begin(pal.sky);

    // sky: stars, sun and moon, clipped so they rise from behind the ground line
    // the stars use the moon's tone so the two sit together
    const moonTone = mix(pal.sky, MOON, MOON_FADE);
    if (pal.night > 0.01) {
      for (const s of this.stars) {
        const x = (((s.x - this.starDrift) % VIEW_W) + VIEW_W) % VIEW_W;
        r.draw(s.alt ? S.star2 : S.star1, x, s.y, moonTone, pal.night);
      }
    }
    if (pal.sun) r.draw(S.sun, pal.sun.x, pal.sun.y, mix(pal.sky, pal.sun.color, SKY_BODY_FADE));
    if (pal.moon) r.draw(S.moon, pal.moon.x, pal.moon.y, moonTone);
    r.flush(GROUND_LINE_Y);

    for (const c of this.clouds) r.draw(S.cloud, c.x, c.y, pal.cloud);

    // ground: two tiles so it wraps seamlessly
    const gx = -this.groundX;
    r.draw(S.ground, gx, HORIZON_Y, pal.fg);
    r.draw(S.ground, gx + GROUND_W, HORIZON_Y, pal.fg);

    for (const o of this.obstacles) {
      const spr = S[o.type.grouped ? o.type.sprites[o.size - 1] : o.type.sprites[o.frame % o.type.sprites.length]];
      r.draw(spr, o.x, o.y, pal.fg);
    }

    this.renderDino(pal.fg);
    this.renderScore(pal.fg, pal.dim);

    if (this.state === 'crashed') {
      r.draw(S.gameOver, Math.round((VIEW_W - 191) / 2), 42, pal.fg);
      r.draw(S.restart, (VIEW_W - 36) / 2, 75, pal.fg);
    }
    r.flush();
  }

  /**
   * For a split second after a hit, swap the sky and sprite colours (a negative frame,
   * like the Duck Hunt screen flash). Softer at night so it is not a white-out.
   */
  private withHitFlash(pal: Palette): Palette {
    if (this.state !== 'crashed' || !this.flashOnCrash || this.now - this.crashedAt >= FLASH_MS) return pal;
    const k = 1 - 0.4 * pal.night;
    const sky = mix(pal.sky, pal.fg, k);
    const fg = mix(pal.fg, pal.sky, k);
    return { ...pal, sky, fg, cloud: mix(sky, fg, 0.25), dim: mix(sky, fg, 0.75) };
  }

  private renderDino(c: RGB): void {
    const S = this.r.sprites;
    let spr: Sprite;
    if (this.state === 'crashed') spr = S.dinoDead;
    else if (this.jumping || this.state === 'idle') spr = S.dinoStand;
    else if (this.ducking) spr = this.animFrame ? S.duck2 : S.duck1;
    else spr = this.animFrame ? S.dinoRun2 : S.dinoRun1;
    this.r.draw(spr, DINO_X, this.dinoY, c);
  }

  private text(str: string, x: number, y: number, c: RGB): void {
    for (const ch of str) {
      const g: Sprite | undefined = this.r.sprites.glyphs[ch];
      if (g) this.r.draw(g, x, y, c);
      x += 11;
    }
  }

  private renderScore(fg: RGB, dim: RGB): void {
    const pad = (n: number) => String(Math.min(n, 99999)).padStart(5, '0');
    const x0 = VIEW_W - 11 * 6; // the original's score position
    const showScore = !this.flashing || this.flashTimer >= 250;
    if (showScore) {
      const shown = this.flashing ? this.milestone * 100 : this.score;
      this.text(pad(shown), x0, 5, fg);
    }
    if (this.highScore > 0) {
      const hx = x0 - 100;
      this.text('HI', hx, 5, dim);
      this.text(pad(this.highScore), hx + 33, 5, dim);
    }
  }
}

function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}
