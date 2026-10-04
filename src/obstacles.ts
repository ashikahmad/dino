// Obstacle types and collision boxes. Sizes, positions and boxes are the original game's.

import type { SpriteName } from './sprites';

export type Box = [number, number, number, number]; // x, y, w, h relative to the sprite

export interface ObstacleType {
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

export const TYPES: Record<string, ObstacleType> = {
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

export const TYPE_NAMES = Object.keys(TYPES);

export const DINO_W = 44;
export const DINO_H = 47;
export const DINO_BOXES: Box[] = [[22, 0, 17, 16], [1, 18, 30, 9], [10, 35, 14, 8], [1, 24, 29, 5], [5, 30, 21, 4], [9, 34, 15, 4]];
export const DUCK_BOXES: Box[] = [[1, 18, 55, 25]];

/** A group of cacti shares one set of boxes: the middle one stretches, the right one moves out. */
function buildBoxes(type: ObstacleType, size: number): Box[] {
  const boxes = type.boxes.map((b) => [...b] as Box);
  if (size > 1 && type.grouped) {
    const width = size * type.w;
    boxes[1][2] = width - boxes[0][2] - boxes[2][2];
    boxes[2][0] = width - boxes[2][2];
  }
  return boxes;
}

const boxCache = new Map<ObstacleType, Box[][]>();

/** The boxes for a group of `size` units, built once per type and size. */
export function obstacleBoxes(type: ObstacleType, size: number): Box[] {
  let bySize = boxCache.get(type);
  if (!bySize) boxCache.set(type, (bySize = []));
  return (bySize[size] ??= buildBoxes(type, size));
}

export const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

export interface Obstacle {
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
