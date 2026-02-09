# Current Implementation — What to Extract

This document describes the existing monolithic implementation that needs to be extracted into the `mojidoodle-algo-segmenter` NPM module.

## Source Files

All files are in `current_source/`. Here's what each contains and what to do with it.

---

### `character-segmentation.service.ts` (996 lines) — THE CORE

This is the main algorithm. It's an Angular `@Injectable` service but has **zero dependencies** — the Angular decorator is the only framework coupling.

**Extract entirely into the module.** Strip the `@Injectable` decorator and Angular import.

#### Public API (current)
```typescript
segment(
  strokes: Point[][],
  canvasWidth: number,
  canvasHeight: number,
  protectedGroups?: ProtectedGroup[]
): SegmentationResult
```

#### Internal Methods to Preserve

| Method | Lines | Purpose |
|--------|-------|---------|
| `calculateStrokeBounds()` | 150-175 | Bounding box + center for each stroke |
| `estimateCharSize()` | 180-205 | Median stroke size x multiplier, clamped |
| `findColumnDividers()` | 215-260 | Pass 1: X-gaps → vertical dividers |
| `assignStrokesToColumns()` | 269-296 | Map strokes to columns (with Japanese order inversion) |
| `findAllRowDividers()` | 302-317 | Pass 2: Y-gaps per column |
| `findRowDividers()` | 355-397 | Y-gaps → horizontal dividers |
| `getColumnXBounds()` | 322-349 | Physical X range of a column |
| `createCellGrid()` | 406-464 | Assign strokes to cells, compute bounds |
| `calculateRatio()` | 473-478 | Max/min ratio for uniformity check |
| `wouldSplitProtectedGroup()` | 487-515 | Check if divider would cross a lasso |
| `addInterLassoDividers()` | 521-610 | Force dividers between different lassos |
| `addInterLassoRowDividers()` | 615-688 | Force row dividers between lassos per column |
| `enforceColumnUniformity()` | 695-806 | Iterative split/merge for columns |
| `enforceRowUniformity()` | 813-929 | Iterative split/merge for rows |
| `enforceColumnsNotExceedRows()` | 936-995 | Japanese constraint: cols ≤ rows |

#### Algorithm Flow (10 steps)

```
Input: strokes[][], canvasWidth, canvasHeight, protectedGroups[]

1. Calculate stroke bounds (bounding box + center per stroke)
2. Get overall content bounds
3. Estimate char dimensions (median stroke size × 2.0, clamped 8-40% canvas)
4. PASS 1: Find column dividers from X-gaps (filtered by protected groups)
5. Add inter-lasso column dividers (force splits between different lassos)
6. Enforce column uniformity (max/min width ratio ≤ 2.0)
7. Assign strokes to columns (rightmost = column 0, Japanese reading order)
8. PASS 2: Find row dividers per column from Y-gaps
9. Add inter-lasso row dividers per column
10. Enforce row uniformity per column
11. Enforce columns ≤ maxRows constraint (merge over-segmented columns)
12. Create cell grid (stroke → cell assignment)

Output: SegmentationResult { grid, estimatedCharWidth, estimatedCharHeight }
```

#### What Changes in the New API

The current method takes `protectedGroups` (pre-computed stroke indices). In the new API, the module receives raw `lassos` (polygon points) and computes protected groups internally using point-in-polygon containment.

The current method returns a `SegmentationGrid` with cells, dividers, etc. In the new API, the module post-processes this into:
- `characters[]` — sorted cells with actual strokes extracted
- `strokes[]` — annotated with characterIndex
- `lassos[]` — annotated with strokeIndices
- SVG strings for visualization

---

### `segmentation.types.ts` (102 lines) — TYPES

Current internal types. Most become internal-only in the new module. The new public types are defined in `API.md`.

**Key types to keep internally:**

```typescript
// Still needed internally for the algorithm
interface StrokeBounds { strokeIndex, minX, maxX, minY, maxY, centerX, centerY }
interface DividerLine { slope, intercept, start, end }
interface GridCell { column, row, strokeIndices[], bounds }
interface SegmentationGrid { columnDividers, rowDividers[][], cells, columns, maxRows }
interface SegmentationConfig { ... }  // Becomes the public config
interface ProtectedGroup { strokeIndices[] }  // Built internally from lassos
```

**`Point { x, y, t }`** — In the new API, `Point` is a public type. The segmenter only uses x/y internally but passes t through in output.

---

### `collection.service.ts` (231 lines) — LASSO CONTAINMENT REFERENCE

Contains duplicated point-in-polygon and containment logic. This is the same code that needs to be internalized in the module.

**Key methods to internalize:**

```typescript
// Point-in-polygon (ray casting) — lines 176-190
private isPointInPolygon(point, polygon): boolean

// Stroke containment (≥50% threshold) — lines 150-171
private findStrokesInLasso(strokes, lasso): number[]
```

This service also shows how the collection/export system uses segmentation results — the `buildSample()` method (lines 81-145) extracts dividers and infers ground truth from cell assignments. After migration, it will use `result.lassos[].strokeIndices` instead of computing containment itself.

---

### `collection.types.ts` (76 lines) — EXPORT TYPES REFERENCE

Shows the data export format. The `SelectionLasso` type maps to `AnnotatedLasso` in the new API:

```typescript
// Current
interface SelectionLasso {
  points: { x: number; y: number }[];
  strokeIndices: number[];
}

// New module equivalent: AnnotatedLasso (same shape, different name)
```

The `GroundTruthEntry` type is not part of the segmenter module — it stays in MojiDoodle's collection system.

---

### `stroke-recognition.service.ts` (232 lines) — CONSUMER REFERENCE

Shows how segmentation results feed into the Google handwriting recognition API. **Not part of the module** — this is a consumer.

**Key pattern: how `recognizeBatch()` consumes cells (lines 117-148):**
```typescript
async recognizeBatch(
  cells: { strokes: Point[][]; bounds: { width: number; height: number } }[]
): Promise<{ character: string; score: number }[][]>
```

Each cell becomes one request in the batch API call. The new module's `CharacterSlot` output maps directly to this:
```typescript
// New usage
const apiCells = result.characters.map(c => ({
  strokes: c.strokes,
  bounds: { width: c.bounds.width, height: c.bounds.height }
}));
const recognized = await recognitionService.recognizeBatch(apiCells);
```

---

## Logic That Moves Into the Module

Currently scattered across the workbook page (see `current_consumer/workbook-excerpts.ts`):

| Logic | Current Location | Becomes |
|-------|-----------------|---------|
| Lasso → ProtectedGroup conversion | `workbook.page.ts` `getProtectedGroups()` | Internal: module does this from `LassoInput[]` |
| Point-in-polygon test | `workbook.page.ts` + `collection.service.ts` (duplicated) | Internal utility |
| Lasso containment calculation | `workbook.page.ts` `calculateLassoContainment()` | Internal utility |
| Cell sorting (Japanese reading order) | `workbook.page.ts` inline sort | Internal: `characters[]` is pre-sorted |
| Stroke-to-cell extraction | `workbook.page.ts` `onCheck()` lines 641-646 | Internal: `CharacterSlot.strokes` has actual strokes |
| Divider line rendering | `workbook.page.ts` `drawDividers()` | `segmentationSvg` output |
| Lasso polygon rendering | `workbook.page.ts` `drawLasso()` | `lassoSvg` output |
| Lasso color palette (24 hues) | `workbook.page.ts` `LASSO_HUES` + `getLassoColor()` | Internal for SVG generation |
| Stroke color by lasso | `workbook.page.ts` `getStrokeColor()` | `AnnotatedStroke.characterIndex` (consumer decides color) |
