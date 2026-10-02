import { palette } from './cycle';
import { Renderer, VIEW_W, type RGB } from './renderer';
import { GROUND_W, type Sprite, type SpriteName } from './sprites';

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
const GROUND_Y = 139; // the line the dino stands on (feet end here)
const DINO_H = 47;
const DUCK_H = 30;
const MAX_CLOUDS = 6;

type Box = [number, number, number, number]; // x, y, w, h relative to the sprite

interface ObstacleType {
  sprites: SpriteName[];
  w: number;
  h: number;
  y: number[]; // possible top positions
  minGap: number;
  minSpeed: number;
  multipleSpeed: number;
  boxes: Box[][]; // per sprite frame
}

const TYPES: Record<string, ObstacleType> = {
  cactusSmall: {
    sprites: ['cactusSmall'], w: 17, h: 35, y: [105], minGap: 120, minSpeed: 0, multipleSpeed: 4,
    boxes: [[[5, 0, 7, 35], [0, 10, 5, 10], [12, 6, 5, 10]]],
  },
  cactusLarge: {
    sprites: ['cactusLarge'], w: 25, h: 50, y: [90], minGap: 120, minSpeed: 0, multipleSpeed: 7,
    boxes: [[[8, 0, 9, 50], [0, 13, 9, 15], [16, 9, 9, 15]]],
  },
  ptero: {
    sprites: ['pteroUp', 'pteroDown'], w: 46, h: 40, y: [100, 75, 50], minGap: 150, minSpeed: 8.5, multipleSpeed: 999,
    boxes: [
      [[0, 16, 18, 6], [16, 18, 28, 10], [20, 2, 14, 16]],
      [[0, 16, 18, 6], [16, 18, 28, 10], [20, 28, 14, 10]],
    ],
  },
};

const DINO_BOXES: Box[] = [[22, 0, 20, 16], [8, 16, 24, 22], [12, 38, 16, 9]];
const DUCK_BOXES: Box[] = [[37, 0, 21, 14], [2, 8, 34, 20]];

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
interface Star { x: number; y: number; big: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));

type State = 'idle' | 'running' | 'crashed';

export class Game {
  private state: State = 'idle';
  private speed = START_SPEED;
  private distance = 0;
  private score = 0;
  private highScore = 0;
  private runningTime = 0;
  private crashedAt = 0;
  private now = 0;

  // dino
  private dinoY = GROUND_Y - DINO_H;
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
      this.stars.push({ x: rand(0, VIEW_W), y: rand(8, 80), big: Math.random() < 0.35 });
    }
    this.clouds.push({ x: rand(100, 500), y: rand(30, 71) });
    this.cloudGap = rand(100, 400);
  }

  /** Jump ahead in score (used for testing the day cycle). */
  skipTo(points: number): void {
    this.distance = points / SCORE_COEFFICIENT;
    this.score = points;
    this.milestone = Math.floor(points / 100);
  }

  // ------------------------------------------------------------------ input

  pressJump(): void {
    if (this.state === 'crashed') {
      if (this.now - this.crashedAt >= GAP_RESPAWN) this.restart();
      return;
    }
    if (this.state === 'idle') this.state = 'running';
    if (!this.jumping && !this.ducking) {
      this.jumping = true;
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
    this.state = 'running';
    this.speed = START_SPEED;
    this.distance = 0;
    this.score = 0;
    this.runningTime = 0;
    this.obstacles = [];
    this.lastTypes = [];
    this.dinoY = GROUND_Y - DINO_H;
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
    if (this.state === 'crashed') return;
    const df = dtMs / FRAME_MS;

    // clouds and stars keep drifting even before the first jump
    this.updateClouds(df);
    this.starDrift = (this.starDrift + 0.3 * df * (this.state === 'running' ? 1 : 0.3)) % VIEW_W;

    if (this.state !== 'running') return;

    this.runningTime += dtMs;
    this.groundX = (this.groundX + this.speed * df) % GROUND_W;
    this.updateDino(df, dtMs);

    if (this.runningTime > CLEAR_TIME) this.updateObstacles(df, dtMs);

    if (this.obstacles.length && this.collides()) {
      this.state = 'crashed';
      this.crashedAt = this.now;
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

    const groundY = GROUND_Y - DINO_H;
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
      if (o.type.sprites.length > 1) {
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
      speedOffset: type.sprites.length > 1 ? (Math.random() < 0.5 ? -0.8 : 0.8) : 0,
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
    const duck = this.ducking && !this.jumping;
    const dx = DINO_X;
    const dy = duck ? GROUND_Y - DUCK_H : this.dinoY;
    const dBoxes = duck ? DUCK_BOXES : DINO_BOXES;
    for (const o of this.obstacles) {
      const frameBoxes = o.type.boxes[o.frame % o.type.boxes.length];
      for (let i = 0; i < o.size; i++) {
        const ox = o.x + i * o.type.w;
        for (const ob of frameBoxes) {
          for (const db of dBoxes) {
            if (
              dx + db[0] < ox + ob[0] + ob[2] &&
              dx + db[0] + db[2] > ox + ob[0] &&
              dy + db[1] < o.y + ob[1] + ob[3] &&
              dy + db[1] + db[3] > o.y + ob[1]
            ) {
              return true;
            }
          }
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
    const pal = palette(this.score);
    document.body.style.background = rgbCss(pal.sky);
    r.begin(pal.sky);

    // stars + moon (night only)
    if (pal.night > 0.01) {
      for (const s of this.stars) {
        const x = (((s.x - this.starDrift) % VIEW_W) + VIEW_W) % VIEW_W;
        r.draw(s.big ? S.starBig : S.starSmall, x, s.y, pal.fg, pal.night);
      }
      const t = Math.min(1, Math.max(0, (pal.p - 0.5) / 0.45));
      r.draw(S.moon, 520 - t * 460, 22, pal.fg, pal.night);
    }

    for (const c of this.clouds) r.draw(S.cloud, c.x, c.y, pal.cloud);

    // ground: two tiles so it wraps seamlessly
    const gx = -this.groundX;
    r.draw(S.ground, gx, GROUND_Y, pal.fg);
    r.draw(S.ground, gx + GROUND_W, GROUND_Y, pal.fg);

    for (const o of this.obstacles) {
      const spr = S[o.type.sprites[o.frame % o.type.sprites.length]];
      for (let i = 0; i < o.size; i++) r.draw(spr, o.x + i * o.type.w, o.y, pal.fg);
    }

    this.renderDino(pal.fg);
    this.renderScore(pal.fg, pal.dim);

    if (this.state === 'crashed') {
      this.text('GAME OVER', Math.round((VIEW_W - 9 * 12 + 2) / 2), 40, pal.fg);
      r.draw(S.restart, (VIEW_W - 36) / 2, 70, pal.fg);
    }
    r.end();
  }

  private renderDino(c: RGB): void {
    const S = this.r.sprites;
    if (this.state === 'crashed') {
      this.r.draw(S.dinoDead, DINO_X, this.dinoY, c);
    } else if (this.jumping || this.state === 'idle') {
      this.r.draw(S.dinoStand, DINO_X, this.dinoY, c);
    } else if (this.ducking) {
      this.r.draw(this.animFrame ? S.duckRight : S.duckLeft, DINO_X, GROUND_Y - DUCK_H, c);
    } else {
      this.r.draw(this.animFrame ? S.dinoRight : S.dinoLeft, DINO_X, this.dinoY, c);
    }
  }

  private text(str: string, x: number, y: number, c: RGB): void {
    for (const ch of str) {
      const g: Sprite | undefined = this.r.sprites.glyphs[ch];
      if (g) this.r.draw(g, x, y, c);
      x += 12;
    }
  }

  private renderScore(fg: RGB, dim: RGB): void {
    const pad = (n: number) => String(Math.min(n, 99999)).padStart(5, '0');
    const x0 = 532;
    const showScore = !this.flashing || this.flashTimer >= 250;
    if (showScore) {
      const shown = this.flashing ? this.milestone * 100 : this.score;
      this.text(pad(shown), x0, 8, fg);
    }
    if (this.highScore > 0) {
      this.text('HI', x0 - 72 - 36, 8, dim);
      this.text(pad(this.highScore), x0 - 72, 8, dim);
    }
  }
}

function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}
