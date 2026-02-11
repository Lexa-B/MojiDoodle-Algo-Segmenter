import type { Point } from '../types.js';

/** Point-in-polygon test using ray casting algorithm. */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[],
): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Find which stroke indices are inside a lasso polygon (>= threshold of points contained). */
export function findStrokesInLasso(
  strokes: Point[][],
  polygon: { x: number; y: number }[],
  threshold: number,
): number[] {
  const indices: number[] = [];

  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    if (stroke.length === 0) continue;

    let pointsInside = 0;
    for (const point of stroke) {
      if (isPointInPolygon(point, polygon)) {
        pointsInside++;
      }
    }

    const containment = pointsInside / stroke.length;
    if (containment >= threshold) {
      indices.push(i);
    }
  }

  return indices;
}

/** Build protected groups from lassos — each lasso that contains strokes becomes a group. */
export function buildProtectedGroups(
  strokes: Point[][],
  lassoPolygons: { x: number; y: number }[][],
  threshold: number,
): { strokeIndices: number[] }[] {
  const groups: { strokeIndices: number[] }[] = [];
  for (const polygon of lassoPolygons) {
    const strokeIndices = findStrokesInLasso(strokes, polygon, threshold);
    if (strokeIndices.length > 0) {
      groups.push({ strokeIndices });
    }
  }
  return groups;
}