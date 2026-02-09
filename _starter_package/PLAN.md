# Extract Character Segmenter into Standalone NPM Module

## Context

MojiDoodle's character segmentation system (~1000 lines of algorithm code + types + duplicated utility logic) is currently embedded as an Angular service. It needs to be extracted into a standalone, framework-agnostic NPM module so it can be reused independently and the app migrated to consume it as a dependency.

**Package name:** `mojidoodle-algo-segmenter`

**Future companion:** A `mojidoodle-ai-segmenter` will share the same API but use an AI model instead of the gap-based algorithm. Both packages must conform to the same interface contract, so the types and `Segmenter` class shape defined here are the canonical specification that both will implement.

This plan defines the full public API the module needs, based on analysis of every consumer and integration point in the current codebase.

---

## Current Implementation: What Exists Today

### Files Involved

| File | Lines | Role |
|------|-------|------|
| `src/app/services/character-segmentation.service.ts` | 996 | Core algorithm (Angular service, no deps) |
| `src/app/models/segmentation.types.ts` | 102 | Type definitions |
| `src/app/pages/workbook/workbook.page.ts` | ~1288 | Primary consumer: lasso logic, cell sorting, visualization |
| `src/app/services/collection.service.ts` | 231 | Secondary consumer: data export with lasso containment |
| `src/app/models/collection.types.ts` | 76 | Export types (SelectionLasso, GroundTruthEntry) |

### Algorithm: 10-Step Pipeline

The single public method `segment(strokes, canvasWidth, canvasHeight, protectedGroups?)` runs:

1. **Calculate stroke bounds** - bounding box + center for each stroke
2. **Get content bounds** - overall extent of all strokes
3. **Estimate character dimensions** - median stroke size x2.0, clamped to 8-40% of canvas
4. **Pass 1: Column dividers** - find X-gaps between strokes, create vertical dividers
5. **Inter-lasso column dividers** - force dividers between different protected groups
6. **Column uniformity** - iteratively split/merge until max/min width ratio <= 2.0
7. **Assign strokes to columns** - with Japanese reading order inversion (rightmost = col 0)
8. **Pass 2: Row dividers** - find Y-gaps within each column
9. **Inter-lasso row dividers** - force dividers between groups within each column
10. **Row uniformity** - iteratively split/merge per column
11. **Columns <= maxRows constraint** - merge columns if over-segmented (Japanese vertical writing)
12. **Create cell grid** - assign strokes to cells, compute cell bounds

### Protected Groups (Lassos)

Three mechanisms handle lasso protection:
- **`wouldSplitProtectedGroup()`** - vetoes any gap-based divider that would cross a group
- **`addInterLassoDividers()`** - forces dividers between different groups (with perpendicular overlap detection for side-by-side columns)
- **`addInterLassoRowDividers()`** - forces row dividers between groups within each column

### Duplicated Logic (needs consolidation)

Point-in-polygon + containment checking is implemented **three times**:
1. `workbook.page.ts` - `calculateLassoContainment()`, `isPointInPolygon()` for building ProtectedGroups
2. `workbook.page.ts` - `getStrokeColor()` using same containment for rendering
3. `collection.service.ts` - `findStrokesInLasso()`, `isPointInPolygon()` for data export

Cell sorting in Japanese reading order is done inline in `workbook.page.ts`:
```typescript
cells.sort((a, b) => a.column !== b.column ? a.column - b.column : a.row - b.row);
```

### What Consumers Use from Results

**Workbook page:**
- `grid.cells` → filter non-empty, sort Japanese order, extract `strokeIndices` + `bounds`
- `grid.columnDividers` / `grid.rowDividers` → draw divider lines on canvas
- Divider rendering: columns as `x = slope*y + intercept`, rows as `y = slope*x + intercept`

**Collection service:**
- `grid.columnDividers` / `grid.rowDividers` → export as training data
- `GridCell.strokeIndices` → ground truth inference

### Key Observation: `Point.t` Unused

The `Point` type includes a timestamp `t`, but the segmenter never reads it. Only `x` and `y` are used. The module's input type should only require `{x, y}`.

---

## Proposed Module API: `mojidoodle-algo-segmenter`

### Design Philosophy

The consumer should never deal with grid cells, divider lines, protected groups, reading order sorting, or stroke-to-cell assignment. All of that is internal. The API takes raw user input and returns consumption-ready output.

Both `mojidoodle-algo-segmenter` and the future `mojidoodle-ai-segmenter` will conform to this same input/output contract.

### Input

```typescript
interface SegmentInput {
  /** Brush strokes — what the user drew. Each stroke is an array of points. */
  strokes: Point[][];

  /** Lasso polygons — closed shapes the user drew to group strokes. */
  lassos: LassoInput[];

  /** Canvas dimensions in pixels. */
  canvasWidth: number;
  canvasHeight: number;

  /** Max number of characters expected (from the card's answer length). */
  maxCharacters: number;
}

interface Point {
  x: number;
  y: number;
  t: number;  // timestamp relative to drawing start
}

interface LassoInput {
  /** Polygon vertices defining the lasso boundary. */
  points: { x: number; y: number }[];
}
```

The config is set on the `Segmenter` constructor, not passed per-call:

```typescript
interface SegmentationConfig {
  minColumnGapRatio?: number;   // default 0.25
  minRowGapRatio?: number;      // default 0.25
  charSizeMultiplier?: number;  // default 2.0
  minCharSizeRatio?: number;    // default 0.08
  maxCharSizeRatio?: number;    // default 0.40
  maxSizeRatio?: number;        // default 2.0
  /** Min fraction of stroke points inside lasso to count as contained. Default: 0.5 */
  lassoContainmentThreshold?: number;
}
```

### Output

```typescript
interface SegmentResult {
  /** Character slots sorted in Japanese reading order, ready for recognition API. */
  characters: CharacterSlot[];

  /** Input strokes passed through with segmentation metadata added. */
  strokes: AnnotatedStroke[];

  /** Input lassos passed through with computed stroke membership. */
  lassos: AnnotatedLasso[];

  /** SVG string: segmentation divider lines overlay, sized to canvas. */
  segmentationSvg: string;

  /** SVG string: lasso polygons (fills + outlines) overlay, sized to canvas. */
  lassoSvg: string;
}
```

#### `characters: CharacterSlot[]`

Sorted in Japanese reading order (right-to-left columns, top-to-bottom rows). Each slot is one character position, ready to feed to a recognition API.

```typescript
interface CharacterSlot {
  /** Index of this character in reading order (0 = first character read). */
  index: number;

  /** The raw strokes belonging to this character. */
  strokes: Point[][];

  /** Bounding box of this character's strokes. */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
}
```

The consumer just does:
```typescript
const result = segmenter.segment(input);
const apiCells = result.characters.map(c => ({
  strokes: c.strokes,
  bounds: { width: c.bounds.width, height: c.bounds.height }
}));
const recognized = await recognitionApi.recognizeBatch(apiCells);
```

#### `strokes: AnnotatedStroke[]`

Passthrough of every input stroke, same order, with metadata:

```typescript
interface AnnotatedStroke {
  /** Index of this stroke in the original input array. */
  index: number;

  /** Original points (passthrough). */
  points: Point[];

  /** Which character slot this stroke belongs to, or -1 if unassigned. */
  characterIndex: number;
}
```

Consumer uses this to decide rendering (e.g., color by characterIndex, gray out unassigned).

#### `lassos: AnnotatedLasso[]`

Passthrough of every input lasso with computed membership:

```typescript
interface AnnotatedLasso {
  /** Index of this lasso in the original input array. */
  index: number;

  /** Original polygon points (passthrough). */
  points: { x: number; y: number }[];

  /** Indices of strokes contained by this lasso (>= containment threshold). */
  strokeIndices: number[];
}
```

#### `segmentationSvg: string`

An SVG element string sized to the canvas, containing the divider lines as dashed gray paths. The consumer overlays this directly on the canvas.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <!-- Column divider -->
  <line x1="300" y1="40" x2="300" y2="450"
        stroke="rgba(128,128,128,0.8)" stroke-width="2"
        stroke-dasharray="4,4" />
  <!-- Row divider in column 0 -->
  <line x1="310" y1="200" x2="780" y2="200"
        stroke="rgba(128,128,128,0.8)" stroke-width="2"
        stroke-dasharray="4,4" />
</svg>
```

#### `lassoSvg: string`

An SVG element string sized to the canvas, containing lasso polygons with pastel fills (low opacity) and dashed outlines. Each lasso gets a distinct color from the 24-hue palette.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <polygon points="100,50 200,50 200,200 100,200"
           fill="hsla(0,55%,78%,0.15)"
           stroke="hsla(0,55%,78%,0.7)"
           stroke-width="2" stroke-dasharray="6,4" />
</svg>
```

### Class API

```typescript
class Segmenter {
  readonly config: Readonly<Required<SegmentationConfig>>;
  constructor(config?: SegmentationConfig);
  segment(input: SegmentInput): SegmentResult;
}

// One-shot convenience with default config
function segment(input: SegmentInput): SegmentResult;

const DEFAULT_CONFIG: Readonly<Required<SegmentationConfig>>;
```

### Full Exports

```typescript
// Core
export { Segmenter, segment, DEFAULT_CONFIG } from './segmenter';

// Types (shared contract for algo-segmenter and future ai-segmenter)
export type {
  Point,
  LassoInput,
  SegmentInput,
  SegmentationConfig,
  CharacterSlot,
  AnnotatedStroke,
  AnnotatedLasso,
  SegmentResult,
} from './types';
```

Note: No utility functions exported. Everything that was previously a utility (point-in-polygon, containment, reading order sort, stroke bounds) is now internal implementation detail. The consumer never needs them because the module does all that work and returns ready-to-use results.

> **Shared interface contract:** Both `mojidoodle-algo-segmenter` and `mojidoodle-ai-segmenter` will export the same `Segmenter` class shape, `SegmentInput`, and `SegmentResult` types. MojiDoodle can swap implementations by changing the import path.

---

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Single input object | `SegmentInput` bundles strokes, lassos, canvas, maxChars | Clean call site, easy to extend, matches the future AI segmenter signature |
| Lassos are a first-class input | Not a utility; passed directly to `segment()` | Lasso→ProtectedGroup conversion is internal. Consumer just passes polygon points. |
| Characters array as primary output | Pre-sorted, pre-sliced, with actual `Point[][]` strokes | Consumer feeds directly to recognition API. No grid/cell/index juggling. |
| Annotated strokes: characterIndex only | No color, no lasso index | Consumer decides rendering. Module just says "this stroke belongs to character N." |
| SVG outputs | Canvas-sized SVG strings for dividers and lassos | Consumer overlays directly. No need to understand divider line math or lasso color logic. |
| No utility exports | Everything is internal | The old utilities (point-in-polygon, reading order sort, stroke bounds) are now implementation details. Output is consumption-ready. |
| `maxCharacters` input | Replaces old "answer length" check in workbook | Module can use it for validation, skip segmentation for 1, and constrain grid size. |
| Config on constructor | Tuning knobs set once, not per-call | Canvas size and strokes change per call; gap ratios and thresholds don't. |

---

## Starter Package

Create `./_starter_package/` with everything needed to bootstrap the external module:

```
_starter_package/
├── PLAN.md                              # This plan document
├── API.md                               # Detailed API spec (types, I/O, examples)
├── CURRENT_IMPLEMENTATION.md            # How it works today, what to extract
├── current_source/
│   ├── character-segmentation.service.ts  # Full algorithm (~996 lines)
│   ├── segmentation.types.ts              # Current type definitions
│   ├── collection.types.ts                # Collection types (SelectionLasso, etc.)
│   ├── collection.service.ts              # Shows lasso containment + ground truth
│   └── stroke-recognition.service.ts      # Shows how characters feed to recognition API
└── current_consumer/
    └── workbook-excerpts.ts               # Key excerpts showing how workbook calls segmenter,
                                           # builds protected groups, sorts cells, draws SVGs
```

---

## Migration Path for MojiDoodle

After the module is published:

1. **Delete** `src/app/models/segmentation.types.ts` — types come from the module
2. **Delete** `src/app/services/character-segmentation.service.ts` — algorithm lives in the module
3. **Workbook page** — massive simplification:
   - Delete: `isPointInPolygon`, `calculateLassoContainment`, `getProtectedGroups`, `getStrokeColor`, `drawDividers`, `drawLasso`, cell sorting logic
   - Replace with: call `segmenter.segment(input)`, use `result.characters` for recognition, `result.strokes` for rendering colors, overlay `result.segmentationSvg` and `result.lassoSvg`
4. **Collection service** — use `result.lassos` (already has `strokeIndices`) instead of its own `findStrokesInLasso`/`isPointInPolygon`
5. **Thin Angular wrapper** (optional, for DI):
   ```typescript
   @Injectable({ providedIn: 'root' })
   export class CharacterSegmentationService {
     private segmenter = new Segmenter();
     segment(input: SegmentInput) { return this.segmenter.segment(input); }
   }
   ```
