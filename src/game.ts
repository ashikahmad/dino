import { NIGHT_START, safeAfter } from './cycle';
import { DINO_BOXES, DINO_H, DINO_W, DUCK_BOXES, TYPES, TYPE_NAMES, obstacleBoxes, overlap, type Obstacle } from './obstacles';
import { VIEW_W } from './renderer';
import type { GameView } from './scene';
import { Sound } from './sound';
import { DINO_GROUND_Y, DINO_X, FLASH_MS, GROUND_W, seededRandom, type Cloud, type Ghost, type Star } from './world';

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
const NUDGE_MS = 500; // game-over transition that steps the sky out of a low-contrast moment
const MAX_CLOUDS = 6;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type State = 'idle' | 'countdown' | 'running' | 'crashed';

export class Game implements GameView {
  readonly sound = new Sound();
  private state: State = 'idle'; // read through `status`
  private speed = START_SPEED;
  private distance = 0;
  score = 0;
  // Where on the day/night cycle this run began. Runs carry on from where the last one ended.
  private clockBase = 0;
  private crashClock = 0;
  private nudgeTo = 0;
  private nudgeT = NUDGE_MS;
  flashOnCrash = true;
  highScore = 0;
  private runningTime = 0;
  crashedAt = 0;
  now = 0;

  // dino
  dinoY = DINO_GROUND_Y;
  jumping = false;
  private jumpVelocity = 0;
  private reachedMinHeight = false;
  private speedDrop = false;
  ducking = false;
  private downHeld = false;
  private animTimer = 0;
  animFrame = 0;

  obstacles: Obstacle[] = [];
  private lastTypes: string[] = [];
  clouds: Cloud[] = [];
  stars: Star[] = [];
  groundX = 0;
  starDrift = 0;
  private cloudGap = 0;

  // racing: everyone gets the same obstacles (a shared seed) and sees the others as ghosts
  race = false;
  ghosts: Ghost[] = [];
  private countdownMs = 0;
  // how far the course has scrolled (px), and where it was when this player crashed: the dino is left behind
  travel = 0;
  prevTravel = 0;
  deathTravel = 0;
  /** The race is over: the course stops where it is, so the last crash can be looked at. */
  courseStopped = false;
  worldScore = 0; // the course's score: equal to `score` until the player crashes, then it carries on
  private rng: () => number = Math.random; // drives the obstacles only; clouds and stars stay cosmetic
  /** Called once when the dino is hit, with the final score. */
  onCrash?: (score: number) => void;

  // score flash
  milestone = 0;
  scoreFlashing = false;
  scoreFlashTimer = 0;
  private flashIter = 0;

  constructor() {
    try {
      this.highScore = Number(localStorage.getItem('dino-hi')) || 0;
    } catch {
      /* storage unavailable */
    }
    for (let i = 0; i < 14; i++) {
      this.stars.push({ x: rand(0, VIEW_W), y: rand(0, 70), alt: Math.random() < 0.5 });
    }
    {
      const x = rand(100, 500);
      this.clouds.push({ x, prevX: x, y: rand(30, 71) });
    }
    this.cloudGap = rand(100, 400);
  }

  get status(): State {
    return this.state;
  }

  private dirty = true;
  private accumulator = 0;
  alpha = 1; // how far between the last two steps the picture is
  prevGroundX = 0;
  prevStarDrift = 0;
  prevDinoY = DINO_GROUND_Y;

  /** Ask for the next frame to be drawn (the canvas was resized, the colours changed, ...). */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Whether the picture can have changed since the last frame. The start screen and the
   * game-over screen are still, so nothing is drawn (and no page style is touched) for them.
   */
  needsRender(): boolean {
    if (this.dirty) {
      this.dirty = false;
      return true;
    }
    return this.state === 'running' || this.state === 'countdown' || (this.state === 'crashed' && this.race && !this.courseStopped);
  }

  /** Before the first run, start in the night for dark-mode users and in the day otherwise. */
  setPreferDark(dark: boolean): void {
    if (this.state === 'idle') {
      this.clockBase = dark ? NIGHT_START : 0;
      this.dirty = true;
    }
  }

  get clock(): number {
    if (this.state !== 'crashed') return this.clockBase + this.score;
    if (this.race) return this.clockBase + this.worldScore; // the sky follows the course, which goes on
    const k = this.nudgeT / NUDGE_MS;
    const ease = 1 - (1 - k) ** 3;
    return this.crashClock + (this.nudgeTo - this.crashClock) * ease;
  }

  /** Jump ahead in score (used for testing the day cycle). */
  skipTo(points: number): void {
    this.distance = points / SCORE_COEFFICIENT;
    this.score = points;
    this.worldScore = points;
    this.milestone = Math.floor(points / 100);
    this.dirty = true;
  }

  // ------------------------------------------------------------------ input

  pressJump(): void {
    this.sound.unlock();
    if (this.state === 'crashed') {
      if (!this.race && this.now - this.crashedAt >= GAP_RESPAWN) this.restart();
      return;
    }
    if (this.state === 'countdown') return; // wait for the start
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
    if (this.jumping) {
      // Speed drop cancels the jump at once, as in the original: stop rising and fall fast.
      this.speedDrop = true;
      this.jumpVelocity = 1;
    } else {
      this.ducking = true;
    }
  }

  releaseDown(): void {
    this.downHeld = false;
    this.speedDrop = false;
    this.ducking = false;
  }

  private restart(): void {
    this.clockBase = this.clock;
    this.state = 'running';
    this.reset();
  }

  /** Get a race ready: same obstacles for everyone (from `seed`), then run once the countdown ends. */
  startRace(seed: number, startInMs: number): void {
    this.race = true;
    this.rng = seededRandom(seed);
    this.clockBase = 0; // everyone starts at the same time of day
    this.state = 'countdown';
    this.countdownMs = startInMs;
    this.reset();
  }

  /** Back to the start screen after a race. */
  leaveRace(): void {
    this.race = false;
    this.rng = Math.random;
    this.ghosts = [];
    this.state = 'idle';
    this.clockBase = 0;
    this.reset();
    this.dirty = true;
  }

  /** Stop the course where it is (the last player has crashed). */
  stopCourse(): void {
    this.courseStopped = true;
    this.accumulator = 0;
    this.alpha = 1;
    this.dirty = true;
  }

  /** Whole seconds left before a race starts (0 when not counting down). */
  get countdown(): number {
    return this.state === 'countdown' ? Math.ceil(this.countdownMs / 1000) : 0;
  }

  private reset(): void {
    this.courseStopped = false;
    this.speed = START_SPEED;
    this.distance = 0;
    this.score = 0;
    this.worldScore = 0;
    this.travel = this.prevTravel = this.deathTravel = 0;
    this.runningTime = 0;
    this.obstacles = [];
    this.lastTypes = [];
    this.dinoY = DINO_GROUND_Y;
    this.jumping = false;
    this.speedDrop = false;
    this.ducking = this.downHeld;
    this.milestone = 0;
    this.scoreFlashing = false;
    this.accumulator = 0;
    this.alpha = 1;
    this.prevDinoY = this.dinoY;
    this.prevGroundX = this.groundX;
    this.prevStarDrift = this.starDrift;
  }

  // ----------------------------------------------------------------- update

  update(dtMs: number): void {
    dtMs = Math.min(dtMs, 100);
    this.now += dtMs;
    if (this.state === 'crashed') {
      // after a hit the negative flash and the sky nudge are all that move; draw them (and the frame that ends them)
      if (this.nudgeT < NUDGE_MS || this.now - this.crashedAt <= FLASH_MS + dtMs) this.dirty = true;
      this.nudgeT = Math.min(NUDGE_MS, this.nudgeT + dtMs);
      if (!this.race) return;
      // in a race the course keeps running behind the Game Over screen, so you see the others play on
    }
    if (this.state === 'countdown') {
      this.countdownMs -= dtMs;
      if (this.countdownMs <= 0) {
        this.state = 'running';
        this.accumulator = 0;
      }
      return;
    }
    if (this.state !== 'running' && !(this.state === 'crashed' && this.race)) return; // the idle screen is frozen

    // The simulation advances in fixed 60 Hz steps, so every step moves things by exactly the
    // same distance whatever the frame times are. Drawing blends between the last two steps (alpha).
    this.accumulator += dtMs;
    const stepping = () => this.state === 'running' || (this.state === 'crashed' && this.race && !this.courseStopped);
    for (let n = 0; this.accumulator >= FRAME_MS && n < 6 && stepping(); n++) {
      this.accumulator -= FRAME_MS;
      this.rememberPositions();
      this.step();
    }
    this.alpha = stepping() ? Math.min(1, this.accumulator / FRAME_MS) : 1;
  }

  /** Where things were before the latest step, for drawing between steps. */
  private rememberPositions(): void {
    this.prevGroundX = this.groundX;
    this.prevStarDrift = this.starDrift;
    this.prevDinoY = this.dinoY;
    this.prevTravel = this.travel;
    for (const o of this.obstacles) o.prevX = o.x;
    for (const c of this.clouds) c.prevX = c.x;
  }

  private step(): void {
    const df = 1;
    const dtMs = FRAME_MS;
    const alive = this.state === 'running'; // after a crash in a race only the world carries on

    this.updateClouds(df);
    this.starDrift = (this.starDrift + 0.3 * df) % VIEW_W;

    this.runningTime += dtMs;
    this.groundX = (this.groundX + this.speed * df) % GROUND_W;
    this.travel += this.speed * df;
    if (alive) this.updateDino(df, dtMs);

    if (this.runningTime > CLEAR_TIME) this.updateObstacles(df, dtMs);

    if (alive && this.obstacles.length && this.collides()) {
      this.crash(true);
      return;
    }

    this.distance += this.speed * df;
    this.worldScore = Math.floor(this.distance * SCORE_COEFFICIENT);
    if (alive) this.score = this.worldScore; // the player's own score stops at the crash
    if (this.speed < MAX_SPEED) this.speed = Math.min(MAX_SPEED, this.speed + ACCELERATION * df);
    if (!alive) return;

    const m = Math.floor(this.score / 100);
    if (m > this.milestone && m > 0) {
      this.sound.score();
      this.scoreFlashing = true;
      this.scoreFlashTimer = 0;
      this.flashIter = 0;
    }
    this.milestone = m;
    if (this.scoreFlashing) {
      this.scoreFlashTimer += dtMs;
      if (this.scoreFlashTimer > 500) {
        this.scoreFlashTimer = 0;
        if (++this.flashIter >= 3) this.scoreFlashing = false;
      }
    }
  }

  /** The run ends: the dino was hit (with the sound), or the player gave up (without it). */
  private crash(hit: boolean): void {
    this.state = 'crashed';
    if (hit) this.sound.hit();
    this.crashedAt = this.now;
    this.deathTravel = this.travel;
    this.flashOnCrash = hit && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.crashClock = this.clockBase + this.score;
    this.onCrash?.(this.score);
    this.nudgeTo = safeAfter(this.crashClock);
    this.nudgeT = 0;
    this.scoreFlashing = false;
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
  }

  /** Leave a race in progress (the tab was hidden, so the game stopped moving): counts as out. */
  forfeit(): void {
    if (this.race && (this.state === 'running' || this.state === 'countdown')) this.crash(false);
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
    while (this.obstacles.length && this.obstacles[0].x + this.obstacles[0].size * this.obstacles[0].type.w <= 0) {
      this.obstacles.shift(); // they leave in the order they came in
    }

    const last = this.obstacles[this.obstacles.length - 1];
    if (!last) {
      this.addObstacle();
    } else if (!last.followed && last.x + last.size * last.type.w + last.gap < VIEW_W) {
      last.followed = true;
      this.addObstacle();
    }
  }

  private randInt(a: number, b: number): number {
    return Math.floor(a + this.rng() * (b - a + 1));
  }

  private addObstacle(): void {
    const names = TYPE_NAMES.filter((n) => {
      if (TYPES[n].minSpeed > this.speed) return false;
      const l = this.lastTypes;
      return !(l.length >= 2 && l[l.length - 1] === n && l[l.length - 2] === n);
    });
    const name = names[this.randInt(0, names.length - 1)];
    const type = TYPES[name];
    const size = this.speed >= type.multipleSpeed ? this.randInt(1, 3) : 1;
    const width = size * type.w;
    const minGap = Math.round(width * this.speed + type.minGap * GAP_COEFFICIENT);
    this.obstacles.push({
      type,
      size,
      x: VIEW_W,
      prevX: VIEW_W,
      y: type.y[this.randInt(0, type.y.length - 1)],
      gap: this.randInt(minGap, Math.round(minGap * 1.5)),
      speedOffset: !type.grouped ? (this.rng() < 0.5 ? -0.8 : 0.8) : 0,
      frame: 0,
      frameTimer: 0,
      followed: false,
    });
    this.lastTypes.push(name);
    if (this.lastTypes.length > 2) this.lastTypes.shift();
  }

  private updateClouds(df: number): void {
    for (const c of this.clouds) c.x -= df;
    while (this.clouds.length && this.clouds[0].x <= -46) this.clouds.shift();
    const last = this.clouds[this.clouds.length - 1];
    if (this.clouds.length < MAX_CLOUDS && (!last || VIEW_W - last.x > this.cloudGap)) {
      this.clouds.push({ x: VIEW_W, prevX: VIEW_W, y: rand(30, 71) });
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
}
