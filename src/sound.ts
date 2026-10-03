// Sounds are synthesised with the Web Audio API, so there are no audio files to ship.
// The jump is a soft whoosh; the hit and the chime are short square-wave blips in the spirit
// of the original game's sounds.

const MUTE_KEY = 'dino-muted';
const JUMP_LEVEL = 0.3; // matches the audition page at its default 60% volume

/** Schedule a pitch sweep with a quick decay on `ctx`, starting at time `t`. */
function blip(
  ctx: BaseAudioContext,
  t: number,
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  peak: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A burst of low-passed noise, for the thud of a hit. */
function thud(ctx: BaseAudioContext, t: number, dur: number, peak: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
}

/** A short puff of band-passed noise whose pitch sweeps, for a soft whoosh. */
function air(ctx: BaseAudioContext, t: number, from: number, to: number, dur: number, peak: number, k = 1): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'bandpass';
  filter.Q.value = 2.5;
  filter.frequency.setValueAtTime(from * k, t);
  filter.frequency.exponentialRampToValueAtTime(to * k, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
}

export const effects = {
  /** A soft whoosh, with a slight random pitch change so repeated jumps do not sound identical. */
  jump(ctx: BaseAudioContext, t = 0): void {
    air(ctx, t, 400, 1500, 0.13, JUMP_LEVEL, 1 + (Math.random() - 0.5) * 0.08);
  },
  /** A falling buzz with a thud underneath. */
  hit(ctx: BaseAudioContext, t = 0): void {
    blip(ctx, t, 'square', 240, 60, 0.28, 0.09);
    thud(ctx, t, 0.18, 0.2);
  },
  /** Two quick rising beeps. */
  score(ctx: BaseAudioContext, t = 0): void {
    blip(ctx, t, 'square', 880, 880, 0.07, 0.06);
    blip(ctx, t + 0.09, 'square', 1320, 1320, 0.1, 0.06);
  },
};

export class Sound {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage unavailable */
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  /** Browsers only allow audio after a tap or key press, so call this from those handlers. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private play(effect: (ctx: BaseAudioContext, t: number) => void): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    effect(this.ctx, this.ctx.currentTime);
  }

  jump(): void {
    this.play(effects.jump);
  }
  hit(): void {
    this.play(effects.hit);
  }
  score(): void {
    this.play(effects.score);
  }
}
