# mojidoodle-algo-segmenter

Gap-based Japanese handwriting stroke segmenter. Takes raw brush strokes and lasso polygons as input, returns consumption-ready character slots, annotated strokes, and SVG overlays.

This is the **algorithmic** segmenter. A future `mojidoodle-ai-segmenter` will share the exact same public API but use an ML model internally.

## Install

```bash
npm install mojidoodle-algo-segmenter
```

## Quick Start

```typescript
import { Segmenter } from 'mojidoodle-algo-segmenter';

const segmenter = new Segmenter();

const result = segmenter.segment({
  strokes: myStrokes,          // Point[][] — [{x, y, t}, ...]
  lassos: myLassos,            // LassoInput[] — polygons grouping strokes
  canvasWidth: 800,
  canvasHeight: 600,
  maxCharacters: 3,
});

// Ready for recognition API
result.characters.forEach(char => {
  recognize(char.strokes, char.bounds.width, char.bounds.height);
});

// Overlay on canvas
document.getElementById('seg-overlay').innerHTML = result.segmentationSvg;
document.getElementById('lasso-overlay').innerHTML = result.lassoSvg;

// Color strokes by character assignment
result.strokes.forEach(s => {
  const color = s.characterIndex >= 0 ? palette[s.characterIndex] : '#fff';
  drawStroke(s.points, color);
});
```

## API

### `new Segmenter(config?)`

Create a configured segmenter. Reusable, stateless between calls.

```typescript
const segmenter = new Segmenter({
  minColumnGapRatio: 0.25,        // Min gap between columns as fraction of char width
  minRowGapRatio: 0.25,           // Min gap between rows as fraction of char height
  charSizeMultiplier: 2.0,        // Multiplier for character size estimation
  minCharSizeRatio: 0.08,         // Min char size as fraction of canvas
  maxCharSizeRatio: 0.40,         // Max char size as fraction of canvas
  maxSizeRatio: 2.0,              // Max ratio before uniformity enforcement
  lassoContainmentThreshold: 0.5, // Min fraction of points inside lasso
});
```

All fields optional — omitted fields use defaults shown above.

### `segmenter.segment(input): SegmentResult`

Pure function, no side effects, ~1ms.

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| `strokes` | `Point[][]` | Brush strokes, each an array of `{x, y, t}` |
| `lassos` | `LassoInput[]` | Polygons grouping strokes together |
| `canvasWidth` | `number` | Canvas width in pixels |
| `canvasHeight` | `number` | Canvas height in pixels |
| `maxCharacters` | `number` | Expected character count |

**Output:**

| Field | Type | Description |
|-------|------|-------------|
| `characters` | `CharacterSlot[]` | Sorted Japanese reading order, each has strokes + bounds |
| `strokes` | `AnnotatedStroke[]` | Input strokes with `characterIndex` (-1 if unassigned) |
| `lassos` | `AnnotatedLasso[]` | Input lassos with computed `strokeIndices` |
| `segmentationSvg` | `string` | Canvas-sized SVG of divider lines |
| `lassoSvg` | `string` | Canvas-sized SVG of lasso polygons |

### `segment(input): SegmentResult`

Convenience function using default config.

### `DEFAULT_CONFIG`

```typescript
{
  minColumnGapRatio: 0.25,
  minRowGapRatio: 0.25,
  charSizeMultiplier: 2.0,
  minCharSizeRatio: 0.08,
  maxCharSizeRatio: 0.40,
  maxSizeRatio: 2.0,
  lassoContainmentThreshold: 0.5,
}
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty strokes (`[]`) | Empty `characters`, empty `strokes`, passthrough `lassos`, empty SVGs |
| `maxCharacters: 1` | Single `CharacterSlot` with all strokes. Empty `segmentationSvg`. |
| No lassos | Empty `lassos` array. No lasso SVG content. Segmentation runs without protected groups. |
| Lasso with no strokes inside | Lasso in output with empty `strokeIndices`. Still rendered in `lassoSvg`. |
| Strokes not in any cell | `characterIndex: -1` in annotated strokes. Not in any `CharacterSlot`. |

## How It Works

Two-pass column-based segmentation for Japanese vertical writing (top-to-bottom, right-to-left):

1. Calculate stroke bounding boxes
2. Estimate character dimensions from median stroke size
3. **Pass 1:** Find column dividers from X-gaps
4. Add inter-protected-bound column dividers (mandatory)
5. Enforce column width uniformity (skips mandatory dividers)
6. Assign strokes to columns (rightmost = column 0)
7. **Pass 2:** Find row dividers per column from Y-gaps
8. Add inter-protected-bound row dividers (mandatory)
9. Enforce row height uniformity (skips mandatory dividers)
10. Enforce columns <= maxRows constraint (skips mandatory dividers)
11. Re-add inter-protected-bound row dividers lost in step 10
12. Build CharacterSlots, annotate strokes, generate SVGs

## Example App

An interactive Angular 19 demo lives in `example/`.

```bash
cd example
npm install
npx ng serve
```

Open `http://localhost:4201` to draw strokes, create lassos, and see live segmentation results. Segmentation runs automatically every 250ms. Strokes are colored by their lasso membership. Click on a lasso to delete it.

## Development

```bash
npm install          # Install dependencies
npm run build        # Build (tsc -> dist/)
npm run typecheck    # Type check
npm test             # Run tests (44 tests, vitest)
npm run test:watch   # Watch mode
```

## Exports

```typescript
// Core
export { Segmenter, segment, DEFAULT_CONFIG } from './segmenter';

// Types
export type {
  Point, LassoInput, SegmentInput, SegmentationConfig,
  CharacterSlot, AnnotatedStroke, AnnotatedLasso, SegmentResult,
} from './types';
```

## License

MIT
