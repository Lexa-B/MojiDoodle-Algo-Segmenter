import type { Point, SegmentInput, CharacterSlot, AnnotatedStroke, AnnotatedLasso } from '../types.js';
import type { ResolvedConfig, DividerLine, ProtectedBound } from './types.js';
import { calculateStrokeBounds, estimateCharSize } from './stroke-bounds.js';
import { findStrokesInLasso } from './lasso-containment.js';
import { convexHull } from './convex-hull.js';
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
  /** Convex hulls shrink-wrapped to each lasso's strokes (keyed by lasso index). */
  protectedBounds: Map<number, { x: number; y: number }[]>;
}

/** Run the full segmentation pipeline. */
export function runPipeline(
  input: SegmentInput,
  config: ResolvedConfig,
): PipelineResult {
  const { strokes, lassos, canvasWidth, canvasHeight } = input;

  // Build manual groups — only lassos that contain strokes ever enter the pipeline.
  // Later lassos win: if a stroke is claimed by a new lasso, it's removed from the old group.
  // If an old group loses all its strokes, it's overwritten.
  const claimedBy: Map<number, number> = new Map(); // strokeIndex -> lassoIdx
  const lassoPolygons: { x: number; y: number }[][] = [];
  const manualGroups: Map<number, number[]> = new Map();
  for (const lasso of lassos) {
    const strokeIndices = findStrokesInLasso(strokes, lasso.points, config.lassoContainmentThreshold);
    const idx = lassoPolygons.length;
    lassoPolygons.push(lasso.points);

    if (strokeIndices.length === 0) continue;

    // Steal strokes from prior groups
    for (const si of strokeIndices) {
      const prevOwner = claimedBy.get(si);
      if (prevOwner !== undefined) {
        const prevGroup = manualGroups.get(prevOwner)!;
        const updated = prevGroup.filter(idx => idx !== si);
        if (updated.length === 0) {
          manualGroups.delete(prevOwner);
        } else {
          manualGroups.set(prevOwner, updated);
        }
      }
      claimedBy.set(si, idx);
    }

    manualGroups.set(idx, strokeIndices);
  }
  // eslint-disable-next-line no-console
  (globalThis as unknown as { console?: { log: (...args: unknown[]) => void } }).console?.log('[MANUAL_GROUPS]', Object.fromEntries(manualGroups));

  // Handle empty strokes
  if (strokes.length === 0) {
    return {
      characters: [],
      strokes: [],
      lassos: buildAnnotatedLassos(lassoPolygons, manualGroups),
      columnDividers: [],
      rowDividers: [],
      protectedBounds: new Map(),
    };
  }

  // maxCharacters: 1 shortcut
  if (input.maxCharacters === 1) {
    return buildSingleCharResult(strokes, lassoPolygons, manualGroups);
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

  // Step 2c: Shrink-wrap each manual group to a convex hull of its strokes
  const protectedBounds: Map<number, { x: number; y: number }[]> = new Map();
  for (const [lassoIdx, strokeIndices] of manualGroups) {
    const allPoints: { x: number; y: number }[] = [];
    for (const si of strokeIndices) {
      for (const p of strokes[si]) {
        allPoints.push({ x: p.x, y: p.y });
      }
    }
    const hull = convexHull(allPoints);
    protectedBounds.set(lassoIdx, hull);
  }
  // eslint-disable-next-line no-console
  (globalThis as unknown as { console?: { log: (...args: unknown[]) => void } }).console?.log(
    '[PROTECTED_BOUNDS]',
    Object.fromEntries([...protectedBounds].map(([k, hull]) => [k, hull.map(p => `(${p.x},${p.y})`)])),
  );

  // Step 3: Estimate character dimensions
  const charWidth = estimateCharSize(strokeBounds, canvasWidth, 'width', config);
  const charHeight = estimateCharSize(strokeBounds, canvasHeight, 'height', config);

  // Build ProtectedBound[] — only groups that produced a valid hull
  const protectedBoundsList: ProtectedBound[] = [];
  for (const [lassoIdx, strokeIndices] of manualGroups) {
    const hull = protectedBounds.get(lassoIdx);
    if (hull) {
      protectedBoundsList.push({ strokeIndices, hull });
    }
  }

  // Step 4: PASS 1 - Find column dividers
  let columnDividers = findColumnDividers(strokeBounds, charWidth, config, protectedBoundsList);

  // Step 4b: Add inter-lasso column dividers
  columnDividers = addInterLassoDividers(columnDividers, strokeBounds, protectedBoundsList, 'x');

  // Step 5: Enforce column width uniformity
  columnDividers = enforceColumnUniformity(columnDividers, strokeBounds, contentBounds, protectedBoundsList, config);

  // Step 6: Assign strokes to columns
  let strokesByColumn = assignStrokesToColumns(strokeBounds, columnDividers);

  // Step 7: PASS 2 - Find row dividers within each column
  let rowDividers = findAllRowDividers(strokesByColumn, strokeBounds, columnDividers, charHeight, config, protectedBoundsList);

  // Step 7b: Add inter-lasso row dividers
  rowDividers = addInterLassoRowDividers(
    rowDividers, strokesByColumn, strokeBounds, columnDividers, protectedBoundsList, getColumnXBounds,
  );

  // Step 8: Enforce row height uniformity
  rowDividers = enforceRowUniformity(rowDividers, strokesByColumn, strokeBounds, columnDividers, protectedBoundsList, config);

  // Step 9: Enforce columns <= maxRows
  const enforceResult = enforceColumnsNotExceedRows(
    columnDividers, rowDividers, strokeBounds, charHeight, contentBounds, protectedBoundsList, config,
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
  const annotatedLassos = buildAnnotatedLassos(lassoPolygons, manualGroups);

  return {
    characters,
    strokes: annotatedStrokes,
    lassos: annotatedLassos,
    columnDividers,
    rowDividers,
    protectedBounds,
  };
}

/** Build result for maxCharacters: 1 case. */
function buildSingleCharResult(
  strokes: Point[][],
  lassoPolygons: { x: number; y: number }[][],
  manualGroups: Map<number, number[]>,
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

  const annotatedLassos = buildAnnotatedLassos(lassoPolygons, manualGroups);

  return {
    characters: [character],
    strokes: annotatedStrokes,
    lassos: annotatedLassos,
    columnDividers: [],
    rowDividers: [],
    protectedBounds: new Map(),
  };
}
