// Layout and timing shared by the simulation (game.ts) and the drawing (scene.ts).

export const DINO_X = 50;
export const DINO_GROUND_Y = 93; // 150 - 47 - 10, as in the original
export const GROUND_W = 1200;
export const FLASH_MS = 100; // one negative flash when the dino is hit

export interface Cloud { x: number; prevX: number; y: number }
export interface Star { x: number; y: number; alt: boolean }
