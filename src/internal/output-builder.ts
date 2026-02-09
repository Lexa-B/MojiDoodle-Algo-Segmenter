import type { Point, CharacterSlot, AnnotatedStroke, AnnotatedLasso } from '../types.js';
import type { GridCell } from './types.js';
import { findStrokesInLasso } from './lasso-containment.js';

/** Build CharacterSlots from grid cells, sorted in Japanese reading order. */
export function buildCharacterSlots(
  cells: GridCell[],
  strokes: Point[][],
): CharacterSlot[] {
  // Sort in Japanese reading order: column ascending (0=rightmost first), then row ascending
  const sorted = [...cells].sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column;
    return a.row - b.row;
  });

  return sorted.map((cell, idx) => {
    const cellStrokes = cell.strokeIndices.map(i => strokes[i]);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const stroke of cellStrokes) {
      for (const p of stroke) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }

    if (minX === Infinity) {
      minX = maxX = minY = maxY = 0;
    }

    return {
      index: idx,
      strokes: cellStrokes,
      bounds: {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  });
}

/** Build AnnotatedStrokes with character assignment from cells. */
export function buildAnnotatedStrokesFromCells(
  strokes: Point[][],
  cells: GridCell[],
): AnnotatedStroke[] {
  const strokeToChar = new Map<number, number>();

  // Sort cells same way as buildCharacterSlots to match indices
  const sorted = [...cells].sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column;
    return a.row - b.row;
  });

  sorted.forEach((cell, charIdx) => {
    for (const strokeIdx of cell.strokeIndices) {
      strokeToChar.set(strokeIdx, charIdx);
    }
  });

  return strokes.map((points, index) => ({
    index,
    points,
    characterIndex: strokeToChar.get(index) ?? -1,
  }));
}

/** Build AnnotatedLassos from input lassos and strokes. */
export function buildAnnotatedLassos(
  strokes: Point[][],
  lassoPolygons: { x: number; y: number }[][],
  threshold: number,
): AnnotatedLasso[] {
  return lassoPolygons.map((points, index) => ({
    index,
    points,
    strokeIndices: findStrokesInLasso(strokes, points, threshold),
  }));
}
