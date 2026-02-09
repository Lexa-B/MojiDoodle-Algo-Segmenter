/** Bounding box for a single stroke. */
export interface StrokeBounds {
  strokeIndex: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/**
 * A dividing line between columns or rows.
 * Column dividers: x = slope * y + intercept (mostly vertical, slope always 0)
 * Row dividers: y = slope * x + intercept (mostly horizontal, slope always 0)
 */
export interface DividerLine {
  slope: number;
  intercept: number;
  start: number;
  end: number;
}

/** A cell in the segmentation grid representing a single character. */
export interface GridCell {
  column: number;       // 0 = rightmost (Japanese reading order)
  row: number;          // 0 = topmost
  strokeIndices: number[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

/** A group of strokes that should not be split by segmentation. */
export interface ProtectedGroup {
  strokeIndices: number[];
}

/** Resolved config with all defaults applied. */
export interface ResolvedConfig {
  minColumnGapRatio: number;
  minRowGapRatio: number;
  charSizeMultiplier: number;
  minCharSizeRatio: number;
  maxCharSizeRatio: number;
  maxSizeRatio: number;
  lassoContainmentThreshold: number;
}

/** Content bounds of all strokes. */
export interface ContentBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
