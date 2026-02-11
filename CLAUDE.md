# CLAUDE.md

## Project Overview

`mojidoodle-algo-segmenter` is a standalone NPM module that segments Japanese handwritten strokes into individual character cells. It takes raw brush strokes and lasso polygons as input and returns consumption-ready character slots, annotated strokes, and SVG overlays.

This is the **algorithmic** segmenter (gap-based). A future `mojidoodle-ai-segmenter` will share the exact same public API but use an ML model internally. The types and class shape defined here are the canonical contract both must implement.

## Key Documents

- `_starter_package/API.md` — Full API specification (types, inputs, outputs, edge cases, examples)
- `_starter_package/CURRENT_IMPLEMENTATION.md` — What existed in the monolith, what was extracted, mapping table
- `_starter_package/PLAN.md` — Design decisions, migration path, architecture context
- `_starter_package/current_source/` — Original source files from the monolithic app
- `_starter_package/current_consumer/workbook-excerpts.ts` — Annotated excerpts showing every integration point

## Architecture

### How it works

Pure synchronous function. No workers, no async, no side effects.

```
segment(input) → result     // ~1ms, pure function
```

### Input

```typescript
segmenter.segment({
  strokes: Point[][],        // brush strokes [{x, y, t}, ...]
  lassos: LassoInput[],      // polygons the user drew to group strokes
  canvasWidth: number,       // canvas size in pixels
  canvasHeight: number,
  maxCharacters: number,     // expected character count (from answer length)
})
```

### Output

```typescript
{
  characters: CharacterSlot[],   // sorted Japanese reading order, each has strokes + bounds
  strokes: AnnotatedStroke[],    // input strokes with characterIndex (-1 if unassigned)
  lassos: AnnotatedLasso[],      // input lassos with computed strokeIndices
  segmentationSvg: string,       // canvas-sized SVG of divider lines (with viewBox)
  lassoSvg: string,              // canvas-sized SVG of lasso polygons (with viewBox)
}
```

### Source Structure

```
src/
  index.ts                      # Barrel export (public API surface)
  types.ts                      # All public types (Point, SegmentInput, SegmentResult, etc.)
  segmenter.ts                  # Segmenter class, segment() convenience fn, DEFAULT_CONFIG
  internal/
    types.ts                    # Internal types (StrokeBounds, DividerLine, GridCell, etc.)
    pipeline.ts                 # Core orchestrator — runPipeline() calling all steps
    stroke-bounds.ts            # calculateStrokeBounds(), estimateCharSize()
    column-detection.ts         # findColumnDividers(), assignStrokesToColumns()
    row-detection.ts            # findAllRowDividers(), getColumnXBounds()
    lasso-containment.ts        # isPointInPolygon(), findStrokesInLasso(), buildProtectedGroups()
    protected-groups.ts         # wouldSplitProtectedGroup(), addInterLassoDividers()
    uniformity.ts               # enforceColumnUniformity(), enforceRowUniformity(), enforceColumnsNotExceedRows()
    cell-grid.ts                # createCellGrid()
    output-builder.ts           # buildCharacterSlots(), buildAnnotatedStrokesFromCells(), buildAnnotatedLassos()
    svg-generator.ts            # generateSegmentationSvg(), generateLassoSvg()
```

### Internal algorithm (10-step pipeline)

1. Calculate stroke bounding boxes
2. Estimate character dimensions (median stroke size x 2, clamped 8-40% of canvas)
3. **Pass 1:** Find column dividers from X-gaps between strokes
4. Add inter-lasso column dividers (force splits between different lassos)
5. Enforce column width uniformity (max/min ratio <= 2.0)
6. Assign strokes to columns (rightmost = column 0, Japanese reading order)
7. **Pass 2:** Find row dividers per column from Y-gaps
8. Add inter-lasso row dividers per column
9. Enforce row height uniformity per column
10. Enforce columns <= maxRows (Japanese vertical writing constraint)
11. Build output: create CharacterSlots from cells, annotate strokes, generate SVGs

### What was extracted from the monolith

| Logic | Was in | Now in |
|-------|--------|--------|
| Segmentation algorithm | `character-segmentation.service.ts` | `pipeline.ts` + algorithm modules |
| Point-in-polygon (ray casting) | Duplicated 3x in workbook + collection service | `lasso-containment.ts` |
| Lasso containment (>=50% threshold) | Duplicated in workbook + collection service | `lasso-containment.ts` |
| Lasso -> ProtectedGroup conversion | `workbook.page.ts` `getProtectedGroups()` | `lasso-containment.ts` (internal) |
| Cell sorting (Japanese reading order) | Inline in `workbook.page.ts` | `output-builder.ts` (output is pre-sorted) |
| Stroke-to-cell extraction | Inline in `workbook.page.ts` `onCheck()` | `output-builder.ts` (`CharacterSlot.strokes`) |
| Divider line rendering | `workbook.page.ts` `drawDividers()` | `svg-generator.ts` -> `segmentationSvg` |
| Lasso polygon rendering | `workbook.page.ts` `drawLasso()` | `svg-generator.ts` -> `lassoSvg` |
| Lasso color palette (24 hues) | `workbook.page.ts` `LASSO_HUES` | `svg-generator.ts` (internal) |

## Public Exports

```typescript
// Core
export { Segmenter, segment, DEFAULT_CONFIG } from './segmenter';

// Types
export type {
  Point, LassoInput, SegmentInput, SegmentationConfig,
  CharacterSlot, AnnotatedStroke, AnnotatedLasso, SegmentResult,
} from './types';
```

No utility functions exported. Everything is internal.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build (tsc -> dist/)
npm run typecheck    # Type check without emitting
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
```

### Example App

```bash
cd example
npm install
npx ng serve         # Dev server at http://localhost:4201
npx ng build --base-href /MojiDoodle-Algo-Segmenter/   # Production build for GitHub Pages
```

## Tests

41 tests across 4 suites:

- `tests/segmenter.test.ts` — Integration: full segment() input->output (10 tests)
- `tests/edge-cases.test.ts` — Edge cases from API.md: empty input, maxCharacters:1, passthrough refs (10 tests)
- `tests/lasso-containment.test.ts` — Point-in-polygon, containment threshold, protected groups (13 tests)
- `tests/svg-generator.test.ts` — SVG output correctness, viewBox, dividers, lasso polygons (8 tests)
- `tests/fixtures/helpers.ts` — Test utilities: makePoint(), makeStroke(), makeCharacterStrokes(), makeLasso(), makeInput()

## Example App

Angular 19 standalone app in `example/` that demonstrates the module. Uses TypeScript path mapping (`"mojidoodle-algo-segmenter": ["../src/index.ts"]`) to import directly from source — no npm link or build step needed during development.

### Components

- **AppComponent** — Root shell. Holds Segmenter instance, strokes/lassos state. Runs segmentation automatically every 250ms on changes (dirty flag).
- **CanvasComponent** — HTML5 Canvas with pointer events. Draw mode captures freehand strokes, Lasso mode captures closed polygons. SVG overlays positioned absolutely over canvas. Strokes colored by lasso membership (pastel hue) or white if unassigned. Click on a lasso to delete it.
- **ToolbarComponent** — Mode toggle (Draw/Lasso), maxCharacters input, Undo/Clear buttons.
- **ResultsComponent** — Displays character count, per-character details (stroke count, bounds), lasso membership.

### Deployment

GitHub Actions workflow at `.github/workflows/deploy-example.yml` builds the module and example, deploys to GitHub Pages on push to `main` or manual dispatch.

## Critical Rules

- **The public API is frozen.** `SegmentInput` and `SegmentResult` are the shared contract with the future AI segmenter. Do not add fields without considering both implementations.
- **No framework dependencies.** No Angular, no React, no DOM APIs. Must work in browser and Node.js.
- **`Point.t` is passed through but not used.** The algo-segmenter only reads `x` and `y`. The timestamp exists for recognition APIs and the future AI segmenter.
- **`maxCharacters: 1` skips segmentation.** Return a single CharacterSlot with all strokes, empty segmentationSvg.
- **Japanese reading order is baked into output.** `characters[0]` is the first character read (top of rightmost column). Consumer never sorts.
- **SVGs are canvas-sized with viewBox.** `<svg width="W" height="H" viewBox="0 0 W H">` matches input canvas dimensions. Consumer overlays directly with `pointer-events: none`. The viewBox ensures coordinates scale correctly when CSS resizes the SVG.
- **Lasso colors use the 24-hue pastel palette.** `LASSO_HUES` array with `hsla(hue, 55%, 78%, opacity)` formula. Fill at 15% opacity, stroke at 70% opacity.
- **Protected groups are internal.** Consumer passes `LassoInput[]` (polygon points). The module computes stroke containment internally using ray-casting with a configurable threshold (default 0.5).
