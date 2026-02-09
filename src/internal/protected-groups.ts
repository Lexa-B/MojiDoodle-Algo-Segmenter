import type { StrokeBounds, DividerLine, ProtectedGroup } from './types.js';

/** Check if a divider at the given position would split any protected group. */
export function wouldSplitProtectedGroup(
  dividerPosition: number,
  dimension: 'x' | 'y',
  strokeBounds: StrokeBounds[],
  protectedGroups: ProtectedGroup[],
): boolean {
  for (const group of protectedGroups) {
    if (group.strokeIndices.length < 2) continue;

    const groupStrokes = group.strokeIndices
      .filter(i => i < strokeBounds.length)
      .map(i => strokeBounds[i]);

    if (groupStrokes.length < 2) continue;

    const positions = groupStrokes.map(s =>
      dimension === 'x' ? s.centerX : s.centerY
    );
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);

    if (dividerPosition > minPos && dividerPosition < maxPos) {
      return true;
    }
  }
  return false;
}

/** Add dividers between different lassos based on their bounding boxes. */
export function addInterLassoDividers(
  dividers: DividerLine[],
  strokeBounds: StrokeBounds[],
  protectedGroups: ProtectedGroup[],
  dimension: 'x' | 'y',
): DividerLine[] {
  if (protectedGroups.length < 2) return dividers;

  const lassoBounds: { lassoIdx: number; min: number; max: number; perpMin: number; perpMax: number }[] = [];
  for (let i = 0; i < protectedGroups.length; i++) {
    const group = protectedGroups[i];
    if (group.strokeIndices.length === 0) continue;

    const groupStrokes = group.strokeIndices
      .filter(idx => idx < strokeBounds.length)
      .map(idx => strokeBounds[idx]);

    if (groupStrokes.length === 0) continue;

    const min = Math.min(...groupStrokes.map(s => dimension === 'x' ? s.minX : s.minY));
    const max = Math.max(...groupStrokes.map(s => dimension === 'x' ? s.maxX : s.maxY));
    const perpMin = Math.min(...groupStrokes.map(s => dimension === 'x' ? s.minY : s.minX));
    const perpMax = Math.max(...groupStrokes.map(s => dimension === 'x' ? s.maxY : s.maxX));
    lassoBounds.push({ lassoIdx: i, min, max, perpMin, perpMax });
  }

  if (lassoBounds.length < 2) return dividers;

  lassoBounds.sort((a, b) => a.min - b.min);

  const result = [...dividers];
  const dividerPositions = new Set(dividers.map(d => d.intercept));

  const perpExtentMin = dimension === 'x'
    ? Math.min(...strokeBounds.map(s => s.minY))
    : Math.min(...strokeBounds.map(s => s.minX));
  const perpExtentMax = dimension === 'x'
    ? Math.max(...strokeBounds.map(s => s.maxY))
    : Math.max(...strokeBounds.map(s => s.maxX));

  for (let i = 0; i < lassoBounds.length - 1; i++) {
    const current = lassoBounds[i];
    const next = lassoBounds[i + 1];

    const overlap = current.max - next.min;
    const currentSize = current.max - current.min;
    const nextSize = next.max - next.min;
    const smallerSize = Math.min(currentSize, nextSize);

    const perpOverlap = Math.min(current.perpMax, next.perpMax) - Math.max(current.perpMin, next.perpMin);
    const currentPerpSize = current.perpMax - current.perpMin;
    const nextPerpSize = next.perpMax - next.perpMin;
    const smallerPerpSize = Math.min(currentPerpSize, nextPerpSize);

    const areSideBySide = smallerPerpSize > 0 && perpOverlap > smallerPerpSize * 0.3;

    if (smallerSize > 0 && overlap > smallerSize * 0.5 && !areSideBySide) {
      continue;
    }

    const boundary = (current.max + next.min) / 2;

    const hasNearbyDivider = [...dividerPositions].some(pos => Math.abs(pos - boundary) < 10);

    if (!hasNearbyDivider) {
      result.push({
        slope: 0,
        intercept: boundary,
        start: perpExtentMin - 10,
        end: perpExtentMax + 10,
      });
      dividerPositions.add(boundary);
    }
  }

  return result.sort((a, b) => a.intercept - b.intercept);
}

/** Add inter-lasso row dividers within each column. */
export function addInterLassoRowDividers(
  rowDividers: DividerLine[][],
  strokesByColumn: number[][],
  strokeBounds: StrokeBounds[],
  columnDividers: DividerLine[],
  protectedGroups: ProtectedGroup[],
  getColumnXBounds: (colIdx: number, columnDividers: DividerLine[], numColumns: number, colStrokes: StrokeBounds[]) => { minX: number; maxX: number },
): DividerLine[][] {
  if (protectedGroups.length < 2) return rowDividers;

  return rowDividers.map((colRowDividers, colIdx) => {
    const colStrokeIndices = strokesByColumn[colIdx];
    if (colStrokeIndices.length < 2) return colRowDividers;

    const colStrokes = colStrokeIndices.map(i => strokeBounds[i]);
    const colBounds = getColumnXBounds(colIdx, columnDividers, strokesByColumn.length, colStrokes);

    const lassoBounds: { lassoIdx: number; minY: number; maxY: number }[] = [];
    for (let i = 0; i < protectedGroups.length; i++) {
      const group = protectedGroups[i];
      const lassoStrokesInCol = group.strokeIndices.filter(idx => colStrokeIndices.includes(idx));
      if (lassoStrokesInCol.length === 0) continue;

      const lassoStrokes = lassoStrokesInCol.map(idx => strokeBounds[idx]);
      const minY = Math.min(...lassoStrokes.map(s => s.minY));
      const maxY = Math.max(...lassoStrokes.map(s => s.maxY));
      lassoBounds.push({ lassoIdx: i, minY, maxY });
    }

    if (lassoBounds.length < 2) return colRowDividers;

    lassoBounds.sort((a, b) => a.minY - b.minY);

    const result = [...colRowDividers];
    const dividerPositions = new Set(colRowDividers.map(d => d.intercept));

    for (let i = 0; i < lassoBounds.length - 1; i++) {
      const current = lassoBounds[i];
      const next = lassoBounds[i + 1];

      const overlap = current.maxY - next.minY;
      const currentSize = current.maxY - current.minY;
      const nextSize = next.maxY - next.minY;
      const smallerSize = Math.min(currentSize, nextSize);

      if (smallerSize > 0 && overlap > smallerSize * 0.5) {
        continue;
      }

      const boundary = (current.maxY + next.minY) / 2;

      const hasNearbyDivider = [...dividerPositions].some(pos => Math.abs(pos - boundary) < 10);

      if (!hasNearbyDivider) {
        result.push({
          slope: 0,
          intercept: boundary,
          start: colBounds.minX - 10,
          end: colBounds.maxX + 10,
        });
        dividerPositions.add(boundary);
      }
    }

    return result.sort((a, b) => a.intercept - b.intercept);
  });
}
