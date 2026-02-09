import type { Point, LassoInput, SegmentInput } from '../../src/types.js';

/** Create a Point with optional timestamp. */
export function makePoint(x: number, y: number, t: number = 0): Point {
  return { x, y, t };
}

/** Create a stroke (array of points) from coordinate pairs. */
export function makeStroke(coords: [number, number][]): Point[] {
  return coords.map(([x, y], i) => makePoint(x, y, i * 10));
}

/** Create a simple horizontal stroke at a given y position, spanning x range. */
export function makeHorizontalStroke(y: number, x1: number, x2: number, numPoints: number = 10): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const x = x1 + (x2 - x1) * (i / (numPoints - 1));
    points.push(makePoint(x, y, i * 10));
  }
  return points;
}

/** Create a simple vertical stroke at a given x position, spanning y range. */
export function makeVerticalStroke(x: number, y1: number, y2: number, numPoints: number = 10): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const y = y1 + (y2 - y1) * (i / (numPoints - 1));
    points.push(makePoint(x, y, i * 10));
  }
  return points;
}

/** Create a small cluster of strokes centered at (cx, cy) within a size box. */
export function makeCharacterStrokes(cx: number, cy: number, size: number = 50): Point[][] {
  const half = size / 2;
  return [
    makeHorizontalStroke(cy - half * 0.3, cx - half * 0.5, cx + half * 0.5),
    makeHorizontalStroke(cy + half * 0.3, cx - half * 0.5, cx + half * 0.5),
    makeVerticalStroke(cx, cy - half * 0.5, cy + half * 0.5),
  ];
}

/** Create a lasso (rectangle) around a region. */
export function makeLasso(minX: number, minY: number, maxX: number, maxY: number): LassoInput {
  return {
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  };
}

/** Create a basic SegmentInput with defaults. */
export function makeInput(overrides: Partial<SegmentInput> = {}): SegmentInput {
  return {
    strokes: [],
    lassos: [],
    canvasWidth: 800,
    canvasHeight: 600,
    maxCharacters: 3,
    ...overrides,
  };
}
