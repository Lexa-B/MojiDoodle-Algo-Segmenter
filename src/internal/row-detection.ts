import type { StrokeBounds, DividerLine, ProtectedGroup, ResolvedConfig } from './types.js';
import { wouldSplitProtectedGroup } from './protected-groups.js';

/** Get the X bounds for a column. */
export function getColumnXBounds(
  colIdx: number,
  columnDividers: DividerLine[],
  numColumns: number,
  colStrokes: StrokeBounds[],
): { minX: number; maxX: number } {
  if (columnDividers.length === 0 || colStrokes.length === 0) {
    return {
      minX: Math.min(...colStrokes.map(s => s.minX)),
      maxX: Math.max(...colStrokes.map(s => s.maxX)),
    };
  }

  const dividerXs = columnDividers.map(d => d.intercept).sort((a, b) => a - b);

  // Column 0 is rightmost in Japanese order
  const physicalColIdx = numColumns - 1 - colIdx;

  const strokeMinX = Math.min(...colStrokes.map(s => s.minX));
  const strokeMaxX = Math.max(...colStrokes.map(s => s.maxX));

  const leftBound = physicalColIdx > 0 ? dividerXs[physicalColIdx - 1] : strokeMinX;
  const rightBound = physicalColIdx < dividerXs.length ? dividerXs[physicalColIdx] : strokeMaxX;

  return { minX: leftBound, maxX: rightBound };
}

/** Find horizontal dividers within a single column by looking for Y-gaps. */
function findRowDividers(
  colStrokes: StrokeBounds[],
  charHeight: number,
  colBounds: { minX: number; maxX: number },
  allStrokeBounds: StrokeBounds[],
  config: ResolvedConfig,
  protectedGroups: ProtectedGroup[],
): DividerLine[] {
  if (colStrokes.length < 2) return [];

  const sortedByY = [...colStrokes].sort((a, b) => a.centerY - b.centerY);

  const gaps: { gapStart: number; gapEnd: number; gapSize: number }[] = [];
  const minGap = charHeight * config.minRowGapRatio;

  for (let i = 0; i < sortedByY.length - 1; i++) {
    const current = sortedByY[i];
    const next = sortedByY[i + 1];

    const gapStart = current.maxY;
    const gapEnd = next.minY;
    const gapSize = gapEnd - gapStart;

    if (gapSize >= minGap) {
      gaps.push({ gapStart, gapEnd, gapSize });
    }
  }

  return gaps
    .map(gap => {
      const y = (gap.gapStart + gap.gapEnd) / 2;
      return {
        slope: 0,
        intercept: y,
        start: colBounds.minX - 10,
        end: colBounds.maxX + 10,
      };
    })
    .filter(divider => !wouldSplitProtectedGroup(divider.intercept, 'y', allStrokeBounds, protectedGroups));
}

/** Find row dividers for all columns. */
export function findAllRowDividers(
  strokesByColumn: number[][],
  strokeBounds: StrokeBounds[],
  columnDividers: DividerLine[],
  charHeight: number,
  config: ResolvedConfig,
  protectedGroups: ProtectedGroup[],
): DividerLine[][] {
  return strokesByColumn.map((colStrokeIndices, colIdx) => {
    if (colStrokeIndices.length < 2) return [];

    const colStrokes = colStrokeIndices.map(i => strokeBounds[i]);
    const colBounds = getColumnXBounds(colIdx, columnDividers, strokesByColumn.length, colStrokes);

    return findRowDividers(colStrokes, charHeight, colBounds, strokeBounds, config, protectedGroups);
  });
}
