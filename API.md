# mojidoodle-algo-segmenter — API Specification

This is the canonical API that both `mojidoodle-algo-segmenter` (gap-based algorithm) and the future `mojidoodle-ai-segmenter` (ML model) must implement. Consumers can swap implementations by changing the import path.

## Quick Start

```typescript
import { Segmenter } from 'mojidoodle-algo-segmenter';

const segmenter = new Segmenter();

const result = segmenter.segment({
  strokes: myStrokes,
  lassos: myLassos,
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

---

## Input Types

### `SegmentInput`

Single object passed to `segment()`.

```typescript
interface SegmentInput {
  /** Brush strokes the user drew. Each stroke is an array of points. */
  strokes: Point[][];

  /** Lasso polygons the user drew to group strokes together. */
  lassos: LassoInput[];

  /** Width of the drawing canvas in pixels. */
  canvasWidth: number;

  /** Height of the drawing canvas in pixels. */
  canvasHeight: number;

  /**
   * Maximum number of characters expected in the drawing.
   * Used to constrain segmentation (e.g., skip for 1, limit grid for 3).
   * Typically derived from the longest valid answer for the current card.
   */
  maxCharacters: number;
}
```

### `Point`

A single point in a brush stroke.

```typescript
interface Point {
  /** X coordinate in canvas pixels. */
  x: number;
  /** Y coordinate in canvas pixels. */
  y: number;
  /**
   * Timestamp in milliseconds relative to drawing start.
   * NOT used by the algo-segmenter, but included for compatibility with
   * recognition APIs and data collection. The AI segmenter may use it.
   */
  t: number;
}
```

### `LassoInput`

A closed polygon the user drew to group strokes.

```typescript
interface LassoInput {
  /** Vertices of the closed polygon (minimum 3 points). */
  points: { x: number; y: number }[];
}
```

### `SegmentationConfig`

Optional tuning knobs, set on the `Segmenter` constructor. All fields optional — omitted fields use defaults.

```typescript
interface SegmentationConfig {
  /** Min gap between columns as fraction of estimated char width. Default: 0.25 */
  minColumnGapRatio?: number;

  /** Min gap between rows as fraction of estimated char height. Default: 0.25 */
  minRowGapRatio?: number;

  /** Multiplier applied to median stroke size for character size estimation. Default: 2.0 */
  charSizeMultiplier?: number;

  /** Min character size as fraction of canvas dimension. Default: 0.08 */
  minCharSizeRatio?: number;

  /** Max character size as fraction of canvas dimension. Default: 0.40 */
  maxCharSizeRatio?: number;

  /**
   * Max allowed ratio between largest and smallest cell dimension
   * before uniformity enforcement kicks in. Default: 2.0
   */
  maxSizeRatio?: number;

  /**
   * Min fraction of a stroke's points that must be inside a lasso polygon
   * for the stroke to be considered "contained". Default: 0.5
   */
  lassoContainmentThreshold?: number;
}
```

---

## Output Types

### `SegmentResult`

The complete result returned by `segment()`.

```typescript
interface SegmentResult {
  /** Character slots sorted in Japanese reading order, ready for recognition. */
  characters: CharacterSlot[];

  /** Every input stroke with segmentation metadata added. Same order as input. */
  strokes: AnnotatedStroke[];

  /** Every input lasso with computed stroke membership. Same order as input. */
  lassos: AnnotatedLasso[];

  /** SVG string: divider lines overlay, sized to canvas dimensions. */
  segmentationSvg: string;

  /** SVG string: lasso polygons overlay, sized to canvas dimensions. */
  lassoSvg: string;
}
```

### `CharacterSlot`

One character position in the segmented grid. Sorted in Japanese reading order: right-to-left columns, top-to-bottom rows.

```typescript
interface CharacterSlot {
  /** Index of this character in reading order (0 = first character read). */
  index: number;

  /** The actual strokes belonging to this character (copies from input). */
  strokes: Point[][];

  /** Bounding box of this character's strokes in canvas coordinates. */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    /** maxX - minX */
    width: number;
    /** maxY - minY */
    height: number;
  };
}
```

**Usage:** Feed directly to a recognition API.
```typescript
const apiCells = result.characters.map(c => ({
  strokes: c.strokes,
  bounds: { width: c.bounds.width, height: c.bounds.height }
}));
```

### `AnnotatedStroke`

Input stroke passed through with metadata.

```typescript
interface AnnotatedStroke {
  /** Index of this stroke in the original input array. */
  index: number;

  /** Original points (passthrough, same reference). */
  points: Point[];

  /**
   * Which CharacterSlot this stroke belongs to, or -1 if unassigned.
   * Corresponds to CharacterSlot.index.
   */
  characterIndex: number;
}
```

**Usage:** Color strokes by character assignment.
```typescript
result.strokes.forEach(s => {
  const color = s.characterIndex >= 0 ? myPalette[s.characterIndex] : '#ffffff';
  drawStroke(s.points, color);
});
```

### `AnnotatedLasso`

Input lasso passed through with computed membership.

```typescript
interface AnnotatedLasso {
  /** Index of this lasso in the original input array. */
  index: number;

  /** Original polygon points (passthrough). */
  points: { x: number; y: number }[];

  /**
   * Indices into the input strokes array for strokes contained by this lasso
   * (meeting the containment threshold).
   */
  strokeIndices: number[];
}
```

**Usage:** Data export, or building UI that shows which strokes belong to which lasso.

---

## SVG Outputs

### `segmentationSvg`

Canvas-sized SVG containing divider lines between character cells. Dashed gray lines.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <line x1="300" y1="40" x2="300" y2="450"
        stroke="rgba(128,128,128,0.8)" stroke-width="2"
        stroke-dasharray="4,4" />
</svg>
```

- Column dividers are vertical lines
- Row dividers are horizontal lines within each column
- Empty SVG (no children) when maxCharacters is 1 or no dividers needed

**Overlay usage:**
```html
<div style="position: relative;">
  <canvas id="drawing"></canvas>
  <div id="seg-overlay" style="position: absolute; top: 0; left: 0; pointer-events: none;"
       [innerHTML]="result.segmentationSvg"></div>
</div>
```

### `lassoSvg`

Canvas-sized SVG containing lasso polygons with pastel fills and dashed outlines. Each lasso gets a distinct color from a 24-hue palette.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <polygon points="100,50 200,50 200,200 100,200"
           fill="hsla(0,55%,78%,0.15)"
           stroke="hsla(0,55%,78%,0.7)"
           stroke-width="2" stroke-dasharray="6,4" />
</svg>
```

- 24 pastel colors distributed around the color wheel in lug-nut pattern
- Fill: 15% opacity (faint background)
- Outline: 70% opacity, dashed
- Empty SVG when no lassos

---

## Class API

### `Segmenter`

```typescript
class Segmenter {
  /** Resolved config (defaults merged with constructor arg). */
  readonly config: Readonly<Required<SegmentationConfig>>;

  /** Create a configured segmenter. Reusable, stateless between calls. */
  constructor(config?: SegmentationConfig);

  /** Run segmentation on the given input. Pure function — no side effects. */
  segment(input: SegmentInput): SegmentResult;
}
```

### `segment()` (convenience)

```typescript
/** Segment with default config. For repeated use, prefer creating a Segmenter instance. */
function segment(input: SegmentInput): SegmentResult;
```

### `DEFAULT_CONFIG`

```typescript
const DEFAULT_CONFIG: Readonly<Required<SegmentationConfig>> = {
  minColumnGapRatio: 0.25,
  minRowGapRatio: 0.25,
  charSizeMultiplier: 2.0,
  minCharSizeRatio: 0.08,
  maxCharSizeRatio: 0.40,
  maxSizeRatio: 2.0,
  lassoContainmentThreshold: 0.5,
};
```

---

## Full Exports

```typescript
// Core
export { Segmenter, segment, DEFAULT_CONFIG } from './segmenter';

// All public types
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

No utility functions are exported. Everything (point-in-polygon, reading order sorting, stroke bounds, lasso containment) is internal implementation detail.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty strokes (`[]`) | Returns empty `characters`, empty `strokes`, passthrough `lassos`, empty SVGs |
| `maxCharacters: 1` | Skips segmentation. Single `CharacterSlot` with all strokes. Empty `segmentationSvg`. |
| No lassos | `lassos` output is empty array. No lasso SVG content. Segmentation runs without protected groups. |
| Lasso with no strokes inside | Lasso appears in `lassos` output with empty `strokeIndices`. Still rendered in `lassoSvg`. |
| Strokes not in any cell | `characterIndex: -1` in annotated strokes. Not included in any `CharacterSlot`. |
