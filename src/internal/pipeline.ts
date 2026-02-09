import type { Point, SegmentInput, CharacterSlot, AnnotatedStroke, AnnotatedLasso } from '../types.js';
import type { ResolvedConfig, DividerLine } from './types.js';
import { calculateStrokeBounds, estimateCharSize } from './stroke-bounds.js';
import { buildProtectedGroups } from './lasso-containment.js';
import { findColumnDividers, assignStrokesToColumns } from './column-detection.js';
import { findAllRowDividers, getColumnXBounds } from './row-detection.js';
import { addInterLassoDividers, addInterLassoRowDividers } from './protected-groups.js';
import { enforceColumnUniformity, enforceRowUniformity, enforceColumnsNotExceedRows } from './uniformity.js';
import { createCellGrid } from './cell-grid.js';
import { buildCharacterSlots, buildAnnotatedStrokesFromCells, buildAnnotatedLassos } from './output-builder.js';

export interface PipelineResult {
  characters: CharacterSlot[];
  strokes: AnnotatedStroke[];
  lassos: AnnotatedLasso[];
  columnDividers: DividerLine[];
  rowDividers: DividerLine[][];
}

/** Run the full segmentation pipeline. */
export function runPipeline(
  input: SegmentInput,
  config: ResolvedConfig,
): PipelineResult {
  const { strokes, lassos, canvasWidth, canvasHeight } = input;
  const lassoPolygons = lassos.map(l => l.points);

  // Handle empty strokes
  if (strokes.length === 0) {
    return {
      characters: [],
      strokes: [],
      lassos: buildAnnotatedLassos(strokes, lassoPolygons, config.lassoContainmentThreshold),
      columnDividers: [],
      rowDividers: [],
    };
  }

  // maxCharacters: 1 shortcut
  if (input.maxCharacters === 1) {
    return buildSingleCharResult(strokes, lassoPolygons, config);
  }

  // Step 1: Calculate bounds for each stroke
  const strokeBounds = strokes.map((stroke, index) => calculateStrokeBounds(stroke, index));

  // Step 2: Content bounds
  const contentBounds = {
    minX: Math.min(...strokeBounds.map(s => s.minX)),
    maxX: Math.max(...strokeBounds.map(s => s.maxX)),
    minY: Math.min(...strokeBounds.map(s => s.minY)),
    maxY: Math.max(...strokeBounds.map(s => s.maxY)),
  };

  // Step 3: Estimate character dimensions
  const charWidth = estimateCharSize(strokeBounds, canvasWidth, 'width', config);
  const charHeight = estimateCharSize(strokeBounds, canvasHeight, 'height', config);

  // Build protected groups from lassos
  const protectedGroups = buildProtectedGroups(strokes, lassoPolygons, config.lassoContainmentThreshold);

  // Step 4: PASS 1 - Find column dividers
  let columnDividers = findColumnDividers(strokeBounds, charWidth, config, protectedGroups);

  // Step 4b: Add inter-lasso column dividers
  columnDividers = addInterLassoDividers(columnDividers, strokeBounds, protectedGroups, 'x');

  // Step 5: Enforce column width uniformity
  columnDividers = enforceColumnUniformity(columnDividers, strokeBounds, contentBounds, protectedGroups, config);

  // Step 6: Assign strokes to columns
  let strokesByColumn = assignStrokesToColumns(strokeBounds, columnDividers);

  // Step 7: PASS 2 - Find row dividers within each column
  let rowDividers = findAllRowDividers(strokesByColumn, strokeBounds, columnDividers, charHeight, config, protectedGroups);

  // Step 7b: Add inter-lasso row dividers
  rowDividers = addInterLassoRowDividers(
    rowDividers, strokesByColumn, strokeBounds, columnDividers, protectedGroups, getColumnXBounds,
  );

  // Step 8: Enforce row height uniformity
  rowDividers = enforceRowUniformity(rowDividers, strokesByColumn, strokeBounds, columnDividers, protectedGroups, config);

  // Step 9: Enforce columns <= maxRows
  const enforceResult = enforceColumnsNotExceedRows(
    columnDividers, rowDividers, strokeBounds, charHeight, contentBounds, protectedGroups, config,
  );
  columnDividers = enforceResult.columnDividers;
  rowDividers = enforceResult.rowDividers;

  // Re-assign after potential column changes
  strokesByColumn = assignStrokesToColumns(strokeBounds, columnDividers);

  // Step 10: Create cell grid
  const cells = createCellGrid(strokesByColumn, strokeBounds, columnDividers, rowDividers);

  // Build output
  const characters = buildCharacterSlots(cells, strokes);
  const annotatedStrokes = buildAnnotatedStrokesFromCells(strokes, cells);
  const annotatedLassos = buildAnnotatedLassos(strokes, lassoPolygons, config.lassoContainmentThreshold);

  return {
    characters,
    strokes: annotatedStrokes,
    lassos: annotatedLassos,
    columnDividers,
    rowDividers,
  };
}

/** Build result for maxCharacters: 1 case. */
function buildSingleCharResult(
  strokes: Point[][],
  lassoPolygons: { x: number; y: number }[][],
  config: ResolvedConfig,
): PipelineResult {
  // Calculate bounds from all strokes
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const stroke of strokes) {
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

  const character: CharacterSlot = {
    index: 0,
    strokes: [...strokes],
    bounds: {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };

  const annotatedStrokes: AnnotatedStroke[] = strokes.map((points, index) => ({
    index,
    points,
    characterIndex: 0,
  }));

  const annotatedLassos = buildAnnotatedLassos(strokes, lassoPolygons, config.lassoContainmentThreshold);

  return {
    characters: [character],
    strokes: annotatedStrokes,
    lassos: annotatedLassos,
    columnDividers: [],
    rowDividers: [],
  };
}
