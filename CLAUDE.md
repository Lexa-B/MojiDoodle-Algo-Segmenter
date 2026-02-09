# CLAUDE.md

## Project Overview

`mojidoodle-algo-segmenter` is a standalone NPM module that segments Japanese handwritten strokes into individual character cells. It takes raw brush strokes and lasso polygons as input and returns consumption-ready character slots, annotated strokes, and SVG overlays.

This is the **algorithmic** segmenter (gap-based). A future `mojidoodle-ai-segmenter` will share the exact same public API but use an ML model internally. The types and class shape defined here are the canonical contract both must implement.

## Key Documents

- `API.md` — Full API specification (types, inputs, outputs, edge cases, examples)
- `CURRENT_IMPLEMENTATION.md` — What exists in the monolith today, what to extract, mapping table
- `PLAN.md` — Design decisions, migration path, architecture context
- `current_source/` — Complete source files from the monolithic app
- `current_consumer/workbook-excerpts.ts` — Annotated excerpts showing every integration point

**Read `API.md` first.** It defines the exact public interface to implement.

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
  segmentationSvg: string,       // canvas-sized SVG of divider lines
  lassoSvg: string,              // canvas-sized SVG of lasso polygons
}
```

### Internal algorithm (10-step pipeline)

1. Calculate stroke bounding boxes
2. Estimate character dimensions (median stroke size × 2, clamped 8-40% of canvas)
3. **Pass 1:** Find column dividers from X-gaps between strokes
4. Add inter-lasso column dividers (force splits between different lassos)
5. Enforce column width uniformity (max/min ratio ≤ 2.0)
6. Assign strokes to columns (rightmost = column 0, Japanese reading order)
7. **Pass 2:** Find row dividers per column from Y-gaps
8. Add inter-lasso row dividers per column
9. Enforce row height uniformity per column
10. Enforce columns ≤ maxRows (Japanese vertical writing constraint)
11. Build output: create CharacterSlots from cells, annotate strokes, generate SVGs

The full algorithm is in `current_source/character-segmentation.service.ts` (996 lines). Strip the Angular `@Injectable` decorator — everything else is pure TypeScript with zero dependencies.

### What moves into this module (was scattered across the monolith)

| Logic | Was in | Becomes |
|-------|--------|---------|
| Segmentation algorithm | `character-segmentation.service.ts` | Core of the module |
| Point-in-polygon (ray casting) | Duplicated 3x in workbook + collection service | Internal utility |
| Lasso containment (≥50% threshold) | Duplicated in workbook + collection service | Internal utility |
| Lasso → ProtectedGroup conversion | `workbook.page.ts` `getProtectedGroups()` | Internal (module receives raw polygons) |
| Cell sorting (Japanese reading order) | Inline in `workbook.page.ts` | Internal (output is pre-sorted) |
| Stroke-to-cell extraction | Inline in `workbook.page.ts` `onCheck()` | Internal (`CharacterSlot.strokes` has actual strokes) |
| Divider line rendering | `workbook.page.ts` `drawDividers()` | `segmentationSvg` output |
| Lasso polygon rendering | `workbook.page.ts` `drawLasso()` | `lassoSvg` output |
| Lasso color palette (24 hues) | `workbook.page.ts` `LASSO_HUES` | Internal for SVG generation |

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
npm run build        # Build
npm test             # Run tests
```

## Critical Rules

- **The public API is frozen.** `SegmentInput` and `SegmentResult` are the shared contract with the future AI segmenter. Do not add fields without considering both implementations.
- **No framework dependencies.** No Angular, no React, no DOM APIs. Must work in browser and Node.js.
- **`Point.t` is passed through but not used.** The algo-segmenter only reads `x` and `y`. The timestamp exists for recognition APIs and the future AI segmenter.
- **`maxCharacters: 1` skips segmentation.** Return a single CharacterSlot with all strokes, empty segmentationSvg.
- **Japanese reading order is baked into output.** `characters[0]` is the first character read (top of rightmost column). Consumer never sorts.
- **SVGs are canvas-sized.** `<svg width="W" height="H">` matches input canvas dimensions. Consumer overlays directly with `pointer-events: none`.
- **Lasso colors use the 24-hue pastel palette.** See `current_consumer/workbook-excerpts.ts` for the exact `LASSO_HUES` array and `hsla(hue, 55%, 78%, opacity)` formula.
- **Protected groups are internal.** Consumer passes `LassoInput[]` (polygon points). The module computes stroke containment internally using ray-casting with a configurable threshold (default 0.5).
