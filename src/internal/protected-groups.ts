import type { StrokeBounds, DividerLine, ProtectedBound } from './types.js';

/** Check if a divider at the given position would split any protected bound's convex hull. */
export function wouldSplitProtectedBound(
  dividerPosition: number,
  dimension: 'x' | 'y',
  protectedBounds: ProtectedBound[],
): boolean {
  for (const bound of protectedBounds) {
    if (bound.hull.length < 3) continue;

    const values = bound.hull.map(p => dimension === 'x' ? p.x : p.y);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (dividerPosition > min && dividerPosition < max) {
      return true;
    }
  }
  return false;
}

/** Add dividers between different protected bounds based on their hull bounding boxes. */
export function addInterLassoDividers(
  dividers: DividerLine[],
  strokeBounds: StrokeBounds[],
  protectedBounds: ProtectedBound[],
  dimension: 'x' | 'y',
): DividerLine[] {
  if (protectedBounds.length < 2) return dividers;

  const lassoBounds: { idx: number; min: number; max: number; perpMin: number; perpMax: number }[] = [];
  for (let i = 0; i < protectedBounds.length; i++) {
    const hull = protectedBounds[i].hull;
    if (hull.length < 3) continue;

    const min = Math.min(...hull.map(p => dimension === 'x' ? p.x : p.y));
    const max = Math.max(...hull.map(p => dimension === 'x' ? p.x : p.y));
    const perpMin = Math.min(...hull.map(p => dimension === 'x' ? p.y : p.x));
    const perpMax = Math.max(...hull.map(p => dimension === 'x' ? p.y : p.x));
    lassoBounds.push({ idx: i, min, max, perpMin, perpMax });
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

    const boundary = (current.max + next.min) / 2;

    // If this divider would split a protected bound's hull, skip it —
    // the bounds are in the same column and row dividers will handle them.
    if (wouldSplitProtectedBound(boundary, dimension, protectedBounds)) {
      continue;
    }

    const nearbyDivider = result.find(d => Math.abs(d.intercept - boundary) < 10);

    if (nearbyDivider) {
      nearbyDivider.mandatory = true;
    } else {
      result.push({
        slope: 0,
        intercept: boundary,
        start: perpExtentMin - 10,
        end: perpExtentMax + 10,
        mandatory: true,
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
  protectedBounds: ProtectedBound[],
  getColumnXBounds: (colIdx: number, columnDividers: DividerLine[], numColumns: number, colStrokes: StrokeBounds[]) => { minX: number; maxX: number },
): DividerLine[][] {
  if (protectedBounds.length < 2) return rowDividers;

  return rowDividers.map((colRowDividers, colIdx) => {
    const colStrokeIndices = strokesByColumn[colIdx];
    if (colStrokeIndices.length < 2) return colRowDividers;

    const colStrokes = colStrokeIndices.map(i => strokeBounds[i]);
    const colBounds = getColumnXBounds(colIdx, columnDividers, strokesByColumn.length, colStrokes);

    const lassoBounds: { idx: number; minY: number; maxY: number }[] = [];
    for (let i = 0; i < protectedBounds.length; i++) {
      const bound = protectedBounds[i];
      const lassoStrokesInCol = bound.strokeIndices.filter(idx => colStrokeIndices.includes(idx));
      if (lassoStrokesInCol.length === 0) continue;

      const lassoStrokes = lassoStrokesInCol.map(idx => strokeBounds[idx]);
      const minY = Math.min(...lassoStrokes.map(s => s.minY));
      const maxY = Math.max(...lassoStrokes.map(s => s.maxY));
      lassoBounds.push({ idx: i, minY, maxY });
    }

    if (lassoBounds.length < 2) return colRowDividers;

    lassoBounds.sort((a, b) => a.minY - b.minY);

    const result = [...colRowDividers];
    const dividerPositions = new Set(colRowDividers.map(d => d.intercept));

    for (let i = 0; i < lassoBounds.length - 1; i++) {
      const current = lassoBounds[i];
      const next = lassoBounds[i + 1];

      const boundary = (current.maxY + next.minY) / 2;

      const nearbyDivider = result.find(d => Math.abs(d.intercept - boundary) < 10);

      if (nearbyDivider) {
        nearbyDivider.mandatory = true;
      } else {
        result.push({
          slope: 0,
          intercept: boundary,
          start: colBounds.minX - 10,
          end: colBounds.maxX + 10,
          mandatory: true,
        });
        dividerPositions.add(boundary);
      }
    }

    return result.sort((a, b) => a.intercept - b.intercept);
  });
}
