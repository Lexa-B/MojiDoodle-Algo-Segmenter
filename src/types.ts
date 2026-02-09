/** A single point in a brush stroke. */
export interface Point {
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

/** A closed polygon the user drew to group strokes. */
export interface LassoInput {
  /** Vertices of the closed polygon (minimum 3 points). */
  points: { x: number; y: number }[];
}

/** Single object passed to segment(). */
export interface SegmentInput {
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

/** Optional tuning knobs, set on the Segmenter constructor. */
export interface SegmentationConfig {
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

/** One character position in the segmented grid. */
export interface CharacterSlot {
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

/** Input stroke passed through with metadata. */
export interface AnnotatedStroke {
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

/** Input lasso passed through with computed membership. */
export interface AnnotatedLasso {
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

/** The complete result returned by segment(). */
export interface SegmentResult {
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
