// Layout and timing shared by the simulation (game.ts) and the drawing (scene.ts).

export const DINO_X = 50;
export const DINO_GROUND_Y = 93; // 150 - 47 - 10, as in the original
export const GROUND_W = 1200;
export const FLASH_MS = 100; // one negative flash when the dino is hit

export interface Cloud { x: number; prevX: number; y: number }
export interface Star { x: number; y: number; alt: boolean }

/** Another player in a race, drawn as a faint dino running behind yours. */
export interface Ghost {
  id: number;
  name: string;
  y: number; // where the player's dino is (updated a few times a second)
  shownY: number; // eased toward y, so it moves smoothly between updates
  score: number;
  alive: boolean;
  slot: number; // how far behind the player's own dino it is drawn (in steps of 10 px)
  diedAt: number; // where the course had scrolled to when it crashed
  jumping: boolean;
  ducking: boolean;
}

/** A small, fast seeded random generator (mulberry32): the same seed always gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
