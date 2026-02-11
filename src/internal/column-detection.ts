import type { StrokeBounds, DividerLine, ProtectedBound, ResolvedConfig } from './types.js';
import { wouldSplitProtectedBound } from './protected-groups.js';

/** Find vertical dividers between columns by looking for X-gaps. */
export function findColumnDividers(
  strokeBounds: StrokeBounds[],
  charWidth: number,
  config: ResolvedConfig,
  protectedBounds: ProtectedBound[],
): DividerLine[] {
  if (strokeBounds.length < 2) return [];

  const overallMinY = Math.min(...strokeBounds.map(s => s.minY));
  const overallMaxY = Math.max(...strokeBounds.map(s => s.maxY));

  const sortedByX = [...strokeBounds].sort((a, b) => a.centerX - b.centerX);

  const gaps: { gapStart: number; gapEnd: number; gapSize: number }[] = [];
  const minGap = charWidth * config.minColumnGapRatio;

  for (let i = 0; i < sortedByX.length - 1; i++) {
    const current = sortedByX[i];
    const next = sortedByX[i + 1];

    const gapStart = current.maxX;
    const gapEnd = next.minX;
    const gapSize = gapEnd - gapStart;

    if (gapSize >= minGap) {
      gaps.push({ gapStart, gapEnd, gapSize });
    }
  }

  return gaps
    .map(gap => {
      const x = (gap.gapStart + gap.gapEnd) / 2;
      return {
        slope: 0,
        intercept: x,
        start: overallMinY - 10,
        end: overallMaxY + 10,
      };
    })
    .filter(divider => !wouldSplitProtectedBound(divider.intercept, 'x', protectedBounds));
}

/** Assign strokes to columns based on dividers. Returns array indexed by Japanese column order. */
export function assignStrokesToColumns(
  strokeBounds: StrokeBounds[],
  columnDividers: DividerLine[],
): number[][] {
  const numColumns = columnDividers.length + 1;
  const strokesByColumn: number[][] = Array.from({ length: numColumns }, () => []);

  const dividerXs = columnDividers.map(d => d.intercept).sort((a, b) => a - b);

  for (const stroke of strokeBounds) {
    let colIdx = 0;
    for (let i = 0; i < dividerXs.length; i++) {
      if (stroke.centerX > dividerXs[i]) {
        colIdx = i + 1;
      }
    }

    // Japanese reading order: rightmost column is 0
    const japaneseColIdx = numColumns - 1 - colIdx;
    strokesByColumn[japaneseColIdx].push(stroke.strokeIndex);
  }

  return strokesByColumn;
}
