import type { StrokeBounds, DividerLine, ProtectedGroup, ContentBounds, ResolvedConfig } from './types.js';
import { wouldSplitProtectedGroup } from './protected-groups.js';
import { assignStrokesToColumns } from './column-detection.js';
import { findAllRowDividers, getColumnXBounds } from './row-detection.js';

/** Calculate the max/min ratio for a set of sizes. */
function calculateRatio(sizes: number[]): number {
  if (sizes.length <= 1) return 1;
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return min > 0 ? max / min : Infinity;
}

/** Enforce column width uniformity: no column should be >maxSizeRatio wider than another. */
export function enforceColumnUniformity(
  columnDividers: DividerLine[],
  strokeBounds: StrokeBounds[],
  contentBounds: ContentBounds,
  protectedGroups: ProtectedGroup[],
  config: ResolvedConfig,
): DividerLine[] {
  if (strokeBounds.length === 0) return columnDividers;

  const MAX_ITERATIONS = 10;
  let dividers = [...columnDividers];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const dividerXs = dividers.map(d => d.intercept).sort((a, b) => a - b);
    const boundaries = [contentBounds.minX, ...dividerXs, contentBounds.maxX];

    const widths: number[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      widths.push(boundaries[i + 1] - boundaries[i]);
    }

    if (widths.length <= 1) break;

    const currentRatio = calculateRatio(widths);
    if (currentRatio <= config.maxSizeRatio) break;

    let bestAction: 'split' | 'merge' | null = null;
    let bestRatio = currentRatio;
    let splitX = 0;
    let mergeIdx = -1;

    // Strategy 1: Split the largest
    const widestIdx = widths.indexOf(Math.max(...widths));
    const candidateSplitX = (boundaries[widestIdx] + boundaries[widestIdx + 1]) / 2;
    const wouldSplitColumn = wouldSplitProtectedGroup(candidateSplitX, 'x', strokeBounds, protectedGroups);

    if (!wouldSplitColumn) {
      const widthsAfterSplit = [...widths];
      const splitWidth = widths[widestIdx] / 2;
      widthsAfterSplit.splice(widestIdx, 1, splitWidth, splitWidth);
      const ratioAfterSplit = calculateRatio(widthsAfterSplit);

      if (ratioAfterSplit < bestRatio) {
        bestRatio = ratioAfterSplit;
        bestAction = 'split';
        splitX = candidateSplitX;
      }
    }

    // Strategy 2: Merge the smallest with a neighbor
    if (dividers.length > 0) {
      const smallestIdx = widths.indexOf(Math.min(...widths));

      if (smallestIdx > 0) {
        const widthsAfterMergeLeft = [...widths];
        widthsAfterMergeLeft[smallestIdx - 1] += widthsAfterMergeLeft[smallestIdx];
        widthsAfterMergeLeft.splice(smallestIdx, 1);
        const ratioAfterMergeLeft = calculateRatio(widthsAfterMergeLeft);

        if (ratioAfterMergeLeft < bestRatio) {
          bestRatio = ratioAfterMergeLeft;
          bestAction = 'merge';
          mergeIdx = smallestIdx - 1;
        }
      }

      if (smallestIdx < widths.length - 1) {
        const widthsAfterMergeRight = [...widths];
        widthsAfterMergeRight[smallestIdx] += widthsAfterMergeRight[smallestIdx + 1];
        widthsAfterMergeRight.splice(smallestIdx + 1, 1);
        const ratioAfterMergeRight = calculateRatio(widthsAfterMergeRight);

        if (ratioAfterMergeRight < bestRatio) {
          bestRatio = ratioAfterMergeRight;
          bestAction = 'merge';
          mergeIdx = smallestIdx;
        }
      }
    }

    if (bestAction === 'split') {
      const newDivider: DividerLine = {
        slope: 0,
        intercept: splitX,
        start: contentBounds.minY - 10,
        end: contentBounds.maxY + 10,
      };
      dividers.push(newDivider);
      dividers.sort((a, b) => a.intercept - b.intercept);
    } else if (bestAction === 'merge' && mergeIdx >= 0 && mergeIdx < dividers.length) {
      const sortedDividers = [...dividers].sort((a, b) => a.intercept - b.intercept);
      sortedDividers.splice(mergeIdx, 1);
      dividers = sortedDividers;
    } else {
      break;
    }
  }

  return dividers;
}

/** Enforce row height uniformity per column: no cell should be >maxSizeRatio taller than another. */
export function enforceRowUniformity(
  rowDividers: DividerLine[][],
  strokesByColumn: number[][],
  strokeBounds: StrokeBounds[],
  columnDividers: DividerLine[],
  protectedGroups: ProtectedGroup[],
  config: ResolvedConfig,
): DividerLine[][] {
  const MAX_ITERATIONS = 10;

  return rowDividers.map((colRowDividers, colIdx) => {
    const colStrokeIndices = strokesByColumn[colIdx];
    if (colStrokeIndices.length === 0) return colRowDividers;

    const colStrokes = colStrokeIndices.map(i => strokeBounds[i]);
    const colMinY = Math.min(...colStrokes.map(s => s.minY));
    const colMaxY = Math.max(...colStrokes.map(s => s.maxY));
    const colBounds = getColumnXBounds(colIdx, columnDividers, strokesByColumn.length, colStrokes);

    let dividers = [...colRowDividers];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const dividerYs = dividers.map(d => d.intercept).sort((a, b) => a - b);
      const boundaries = [colMinY, ...dividerYs, colMaxY];

      const heights: number[] = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        heights.push(boundaries[i + 1] - boundaries[i]);
      }

      if (heights.length <= 1) break;

      const currentRatio = calculateRatio(heights);
      if (currentRatio <= config.maxSizeRatio) break;

      let bestAction: 'split' | 'merge' | null = null;
      let bestRatio = currentRatio;
      let splitY = 0;
      let mergeIdx = -1;

      // Strategy 1: Split the tallest
      const tallestIdx = heights.indexOf(Math.max(...heights));
      const candidateSplitY = (boundaries[tallestIdx] + boundaries[tallestIdx + 1]) / 2;
      const wouldSplitRow = wouldSplitProtectedGroup(candidateSplitY, 'y', strokeBounds, protectedGroups);

      if (!wouldSplitRow) {
        const heightsAfterSplit = [...heights];
        const splitHeight = heights[tallestIdx] / 2;
        heightsAfterSplit.splice(tallestIdx, 1, splitHeight, splitHeight);
        const ratioAfterSplit = calculateRatio(heightsAfterSplit);

        if (ratioAfterSplit < bestRatio) {
          bestRatio = ratioAfterSplit;
          bestAction = 'split';
          splitY = candidateSplitY;
        }
      }

      // Strategy 2: Merge the smallest with a neighbor
      if (dividers.length > 0) {
        const smallestIdx = heights.indexOf(Math.min(...heights));

        if (smallestIdx > 0) {
          const heightsAfterMergeTop = [...heights];
          heightsAfterMergeTop[smallestIdx - 1] += heightsAfterMergeTop[smallestIdx];
          heightsAfterMergeTop.splice(smallestIdx, 1);
          const ratioAfterMergeTop = calculateRatio(heightsAfterMergeTop);

          if (ratioAfterMergeTop < bestRatio) {
            bestRatio = ratioAfterMergeTop;
            bestAction = 'merge';
            mergeIdx = smallestIdx - 1;
          }
        }

        if (smallestIdx < heights.length - 1) {
          const heightsAfterMergeBottom = [...heights];
          heightsAfterMergeBottom[smallestIdx] += heightsAfterMergeBottom[smallestIdx + 1];
          heightsAfterMergeBottom.splice(smallestIdx + 1, 1);
          const ratioAfterMergeBottom = calculateRatio(heightsAfterMergeBottom);

          if (ratioAfterMergeBottom < bestRatio) {
            bestRatio = ratioAfterMergeBottom;
            bestAction = 'merge';
            mergeIdx = smallestIdx;
          }
        }
      }

      if (bestAction === 'split') {
        const newDivider: DividerLine = {
          slope: 0,
          intercept: splitY,
          start: colBounds.minX - 10,
          end: colBounds.maxX + 10,
        };
        dividers.push(newDivider);
        dividers.sort((a, b) => a.intercept - b.intercept);
      } else if (bestAction === 'merge' && mergeIdx >= 0 && mergeIdx < dividers.length) {
        const sortedDividers = [...dividers].sort((a, b) => a.intercept - b.intercept);
        sortedDividers.splice(mergeIdx, 1);
        dividers = sortedDividers;
      } else {
        break;
      }
    }

    return dividers;
  });
}

/** Enforce that columns never exceed maxRows (Japanese writing constraint). */
export function enforceColumnsNotExceedRows(
  columnDividers: DividerLine[],
  rowDividers: DividerLine[][],
  strokeBounds: StrokeBounds[],
  charHeight: number,
  contentBounds: ContentBounds,
  protectedGroups: ProtectedGroup[],
  config: ResolvedConfig,
): { columnDividers: DividerLine[]; rowDividers: DividerLine[][] } {
  const MAX_ITERATIONS = 10;
  let dividers = [...columnDividers];
  let rows = [...rowDividers];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const numColumns = dividers.length + 1;
    const maxRows = Math.max(...rows.map(r => r.length + 1), 1);

    if (numColumns <= maxRows) break;

    if (dividers.length === 0) break;

    const sortedDividers = [...dividers].sort((a, b) => a.intercept - b.intercept);
    const boundaries = [contentBounds.minX, ...sortedDividers.map(d => d.intercept), contentBounds.maxX];

    let smallestGapIdx = 0;
    let smallestGap = Infinity;
    for (let i = 0; i < sortedDividers.length; i++) {
      const leftWidth = boundaries[i + 1] - boundaries[i];
      const rightWidth = boundaries[i + 2] - boundaries[i + 1];
      const combinedWidth = leftWidth + rightWidth;

      if (combinedWidth < smallestGap) {
        smallestGap = combinedWidth;
        smallestGapIdx = i;
      }
    }

    sortedDividers.splice(smallestGapIdx, 1);
    dividers = sortedDividers;

    const strokesByColumn = assignStrokesToColumns(strokeBounds, dividers);
    rows = findAllRowDividers(strokesByColumn, strokeBounds, dividers, charHeight, config, protectedGroups);
    rows = enforceRowUniformity(rows, strokesByColumn, strokeBounds, dividers, protectedGroups, config);
  }

  return { columnDividers: dividers, rowDividers: rows };
}
