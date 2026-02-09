import type { StrokeBounds, DividerLine, GridCell } from './types.js';

/** Create the grid of cells from column/row dividers. */
export function createCellGrid(
  strokesByColumn: number[][],
  strokeBounds: StrokeBounds[],
  _columnDividers: DividerLine[],
  rowDividers: DividerLine[][],
): GridCell[] {
  const cells: GridCell[] = [];
  const numColumns = strokesByColumn.length;

  for (let colIdx = 0; colIdx < numColumns; colIdx++) {
    const colStrokeIndices = strokesByColumn[colIdx];
    const colRowDividers = rowDividers[colIdx] || [];

    if (colStrokeIndices.length === 0) continue;

    const colStrokes = colStrokeIndices.map(i => strokeBounds[i]);

    const colMinY = Math.min(...colStrokes.map(s => s.minY));
    const colMaxY = Math.max(...colStrokes.map(s => s.maxY));

    const rowYs = colRowDividers.map(d => d.intercept).sort((a, b) => a - b);
    const numRows = rowYs.length + 1;

    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      const topY = rowIdx === 0 ? colMinY - 5 : rowYs[rowIdx - 1];
      const bottomY = rowIdx === numRows - 1 ? colMaxY + 5 : rowYs[rowIdx];

      const cellStrokeIndices = colStrokeIndices.filter(i => {
        const s = strokeBounds[i];
        return s.centerY >= topY && s.centerY <= bottomY;
      });

      if (cellStrokeIndices.length === 0) continue;

      const cellStrokes = cellStrokeIndices.map(i => strokeBounds[i]);
      const bounds = {
        minX: Math.min(...cellStrokes.map(s => s.minX)),
        maxX: Math.max(...cellStrokes.map(s => s.maxX)),
        minY: Math.min(...cellStrokes.map(s => s.minY)),
        maxY: Math.max(...cellStrokes.map(s => s.maxY)),
      };

      cells.push({
        column: colIdx,
        row: rowIdx,
        strokeIndices: cellStrokeIndices,
        bounds,
      });
    }
  }

  return cells;
}
