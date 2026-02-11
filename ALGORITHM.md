Here's the full algorithm walkthrough, from entry point to final output.

  ---
  Entry Point: Segmenter.segment() (segmenter.ts)

  The caller creates a Segmenter (optionally with config overrides) and calls
  .segment(input). There's also a convenience segment() function that creates a default
  Segmenter internally.

  The config defaults are:
  - minColumnGapRatio: 0.25 — minimum horizontal gap (as fraction of estimated char
  width) to count as a column break
  - minRowGapRatio: 0.25 — same for vertical/row breaks
  - charSizeMultiplier: 2.0 — median stroke size x this = estimated character size
  - minCharSizeRatio: 0.08 — char size floor (fraction of canvas)
  - maxCharSizeRatio: 0.40 — char size ceiling (fraction of canvas)
  - maxSizeRatio: 2.0 — max allowed ratio between largest/smallest cell before
  uniformity kicks in
  - lassoContainmentThreshold: 0.5 — fraction of stroke points that must be inside a
  lasso polygon

  segment() calls runPipeline() to do all the computation, then generates SVGs from the
  pipeline's divider data. If maxCharacters === 1, the segmentation SVG is empty (no
  dividers).

  ---
  The Pipeline: runPipeline() (pipeline.ts)

  Step 0: Build Manual Groups (lasso-containment.ts:findStrokesInLasso)

  Before anything else, the pipeline resolves lasso ownership. This runs before the
  early exits so that manual groups and annotated lassos are always available.

  For each input lasso polygon, determine which strokes it "mostly covers" using
  ray-casting point-in-polygon containment. A stroke belongs to a lasso if the fraction
  of its points inside the polygon >= lassoContainmentThreshold (default 0.5).

  Ownership rules:
  - Lassos are processed in input order. Later lassos win.
  - If a stroke is already claimed by a prior lasso, it is removed from the old group.
  - If this causes the old group to lose all its strokes, that group is deleted entirely.
  - Lassos that contain zero strokes (after containment check) are never created — they
  don't enter any data structure.

  The result is two parallel structures:
  - lassoPolygons: {x,y}[][] — only polygons that have at least one stroke
  - manualGroups: Map<lassoIndex, strokeIndex[]> — stroke assignments, keyed by index
  into lassoPolygons

  Each stroke belongs to at most one group. Logged as [MANUAL_GROUPS] for debugging.

  Early exits

  Empty strokes — returns immediately: no characters, no strokes, annotated lassos from
  manualGroups (typically empty since no strokes means no containment).

  maxCharacters === 1 — calls buildSingleCharResult(): computes a single bounding box
  across all stroke points, creates one CharacterSlot at index 0 containing all strokes,
  marks every stroke with characterIndex: 0, and builds annotated lassos from
  manualGroups. No dividers are produced.

  Step 1: Calculate Stroke Bounding Boxes (stroke-bounds.ts:calculateStrokeBounds)

  For each input stroke, iterates through every Point to find minX, maxX, minY, maxY.
  Computes centerX and centerY as the midpoint of the bounding box. Empty strokes get
  all-zeros. Returns a StrokeBounds per stroke, tagged with its original index.

  Step 2: Compute Content Bounds

  Takes the min/max across all StrokeBounds to get the overall bounding rectangle of
  everything drawn on the canvas. This is used later as the outer boundary when
  computing column widths.

  Step 2c: Compute Protected Bounds (convex-hull.ts:convexHull)

  For each manual group, collect all points from all of its strokes and compute the
  convex hull — the tightest convex polygon that encompasses every point. This
  "shrink-wraps" the lasso to the actual ink, discarding any empty space the user's
  freehand lasso included.

  Uses Andrew's monotone chain algorithm: sort points by X then Y, build lower and upper
  hulls by walking left-to-right and right-to-left, rejecting points that make a
  clockwise turn (cross product <= 0). Returns vertices in counter-clockwise order.

  The result is protectedBounds: a Map<lassoIndex, {x,y}[]>. Each entry is a convex hull
  polygon. Logged as [PROTECTED_BOUNDS] for debugging. These hulls are also used for the
  lasso SVG overlay (see SVG Generation below).

  A ProtectedBound[] array is then built by combining each manual group's strokeIndices
  with its hull. This is the structure passed to all downstream steps to prevent
  dividers from splitting user-grouped strokes.

  Step 3: Estimate Character Dimensions (stroke-bounds.ts:estimateCharSize)

  Called twice — once for width, once for height. The logic:

  1. Compute the width (or height) of every stroke's bounding box.
  2. Filter out tiny strokes (size <= 5px) — these are dots/ticks that would skew the
  estimate.
  3. Sort the remaining sizes and take the median.
  4. Multiply by charSizeMultiplier (default 2.0) — the idea is that a typical stroke is
   roughly half a character's width/height.
  5. Clamp between minCharSizeRatio * canvasDimension (default 8%) and maxCharSizeRatio
  * canvasDimension (default 40%).

  If there are no strokes or no strokes > 5px, falls back to 15% of the canvas
  dimension.

  The result charWidth and charHeight are the estimated dimensions of a single
  character. These are used as the ruler for deciding what constitutes a "big enough
  gap" to split columns/rows.

  ---
  Step 4: Find Column Dividers — Pass 1 (column-detection.ts:findColumnDividers)

  This finds vertical dividing lines between columns of characters.

  1. Sort all strokes by centerX (left to right).
  2. Walk consecutive pairs. Compute the gap between current.maxX and next.minX.
  3. If the gap >= charWidth * minColumnGapRatio (default: 25% of estimated char width),
  it's a candidate column break.
  4. Place a vertical divider at the midpoint of each gap: x = (gapStart + gapEnd) / 2.
  5. Filter: Reject any divider that would split a protected bound. This is checked by
  wouldSplitProtectedBound: if the divider's X falls between the min and max X of a
  hull's vertices, it would cut through that group — so it's rejected.

  The divider is stored as a DividerLine with slope: 0 and intercept: x, meaning it's a
  perfectly vertical line at x. The start/end values are the Y extent (overall minY - 10
   to maxY + 10, with 10px padding).

  Step 4b: Add Inter-Lasso Column Dividers

  If there are 2+ protected bounds, force dividers between groups that are side-by-side
  horizontally (even if the natural gap was too small to trigger in step 4).

  1. For each protected bound, compute its axis-aligned bounding box from its hull
  vertices (min/max in both the primary and perpendicular dimensions).
  1. Sort bounds by their min position on the primary axis.
  2. Walk consecutive pairs. Skip if they overlap significantly (> 50% of the smaller
  group's size) on the primary axis — unless they also overlap > 30% on the
  perpendicular axis (meaning they're truly side-by-side, not stacked). This heuristic
  distinguishes "two groups in separate columns" from "two groups representing
  characters in the same column."
  1. For qualifying pairs, place a divider at (current.max + next.min) / 2.
  2. Skip if a divider already exists within 10px of that position.

  Step 5: Enforce Column Width Uniformity (uniformity.ts:enforceColumnUniformity)

  Ensures no column is more than maxSizeRatio (default 2.0) times wider than any other.
  Iterates up to 10 times:

  1. Compute column widths from the content bounds and divider positions (the regions
  between consecutive dividers, plus the outer edges).
  2. If max(widths) / min(widths) <= maxSizeRatio, done.
  3. Otherwise, try two strategies and pick whichever reduces the ratio more:
    - Split: Place a new divider at the midpoint of the widest column (rejected if it
  would split a protected bound).
    - Merge: Remove the divider bordering the narrowest column (tries merging left
  neighbor, then right neighbor, picks the better one).
  4. Apply the best action and repeat.

  Step 6: Assign Strokes to Columns (column-detection.ts:assignStrokesToColumns)

  With column dividers finalized, each stroke is placed into a column based on its
  centerX.

  1. Sort divider X positions left to right.
  2. For each stroke, find which column region its centerX falls into (which pair of
  consecutive dividers it sits between).
  3. Flip to Japanese reading order: the rightmost physical column becomes column 0, the
   next-rightmost becomes column 1, etc. This is because Japanese vertical text reads
  right-to-left.

  Returns strokesByColumn[colIdx] = array of stroke indices.

  ---
  Step 7: Find Row Dividers — Pass 2 (row-detection.ts:findAllRowDividers)

  For each column independently, find horizontal dividers between rows (characters
  stacked vertically).

  Within each column (findRowDividers):
  1. Get the strokes assigned to this column.
  2. Sort by centerY (top to bottom).
  3. Walk consecutive pairs, compute Y-gaps.
  4. If gap >= charHeight * minRowGapRatio, place a horizontal divider at the gap's
  midpoint.
  5. Filter out any divider that would split a protected bound (same hull-extent check
  as columns, but on the Y axis).

  Row dividers are bounded horizontally by the column's X bounds (computed by
  getColumnXBounds, which uses the divider positions to determine the left/right edges
  of each column).

  Step 7b: Add Inter-Lasso Row Dividers (protected-groups.ts:addInterLassoRowDividers)

  Same concept as step 4b, but for rows within each column. For each column:
  1. Find which protected bounds have strokes in this column (using strokeIndices).
  2. Compute each group's Y bounds within this column from its strokes' bounding boxes.
  3. Force dividers between groups that are stacked vertically (not overlapping > 50% in
   Y).

  Step 8: Enforce Row Height Uniformity (uniformity.ts:enforceRowUniformity)

  Same logic as column uniformity (step 5), but applied per-column to row heights. For
  each column:
  1. Compute row heights from the column's Y extent and row divider positions.
  2. If ratio > maxSizeRatio, split the tallest or merge the smallest, whichever helps
  more.
  3. Repeat up to 10 times.

  Step 9: Enforce Columns <= Max Rows (uniformity.ts:enforceColumnsNotExceedRows)

  Japanese vertical writing constraint: you shouldn't have more columns than the maximum
   number of rows in any column. For example, if all columns have 3 rows, you shouldn't
  have 4 columns — that implies the grid was split incorrectly.

  Iterates up to 10 times:
  1. Count columns (columnDividers.length + 1) and the max rows across all columns.
  2. If columns <= maxRows, done.
  3. Otherwise, remove a column divider — specifically the one where the two adjacent
  columns have the smallest combined width (merge the two thinnest neighboring columns).
  4. After removing a column divider, re-run stroke assignment and row
  detection/uniformity for the new column layout.

  ---
  Step 10: Create Cell Grid (cell-grid.ts:createCellGrid)

  Converts the column/row divider structure into discrete cells, each representing one
  character position.

  For each column:
  1. Get the row dividers for this column, sorted by Y.
  2. Divide the column into rowDividers.length + 1 row regions.
  3. For each row region: find which strokes fall in it (stroke's centerY is between the
   top and bottom boundaries, with 5px padding on the outer edges).
  4. If a cell has strokes, compute its bounding box from those strokes and emit a
  GridCell with column, row, strokeIndices, and bounds.
  5. Empty cells are skipped entirely.

  ---
  Output Building (output-builder.ts)

  buildCharacterSlots(cells, strokes)

  1. Sort cells in Japanese reading order: first by column ascending (column 0 =
  rightmost = first read), then by row ascending (top = first in column).
  2. For each cell, create a CharacterSlot:
    - index: its position in reading order (0, 1, 2, ...)
    - strokes: the actual Point[][] arrays from the input (by reference)
    - bounds: tight bounding box computed from all points in all strokes of this cell

  buildAnnotatedStrokesFromCells(strokes, cells)

  1. Sort cells the same way as above.
  2. Build a map: strokeIndex -> characterIndex.
  3. For each input stroke, emit an AnnotatedStroke with its original index, original
  points (same reference), and characterIndex from the map (or -1 if the stroke didn't
  land in any cell).

  buildAnnotatedLassos(lassoPolygons, manualGroups)

  Directly emits AnnotatedLasso entries from the pre-computed manualGroups. No
  re-computation of containment — the group assignments from step 0 (including
  last-lasso-wins stealing) are used as-is. Each AnnotatedLasso gets its index, original
  polygon points, and the final strokeIndices from manualGroups.

  ---
  SVG Generation (svg-generator.ts)

  generateSegmentationSvg(columnDividers, rowDividers, canvasWidth, canvasHeight)

  Creates an SVG element sized to the canvas with a matching viewBox.

  - Column dividers: rendered as vertical dashed lines (stroke-dasharray="4,4", gray at
  80% opacity). Since slope is always 0, the line is simply x = intercept from start to
  end Y.
  - Row dividers: rendered as horizontal dashed lines with the same style. Each row
  divider set is scoped to its column's X bounds (start to end).

  generateLassoSvg(hullPolygons, canvasWidth, canvasHeight)

  Creates an SVG element with filled/stroked polygons. Renders the protectedBounds
  convex hulls (from step 2c) instead of the raw lasso polygons. Only groups that have
  strokes and a valid hull produce a polygon.

  - Uses the LASSO_HUES array (24 values in a spread-out "lug-nut" pattern so adjacent
  lassos get very different colors): [0, 165, 330, 135, 300, ...]
  - Each polygon: fill="hsla(hue, 55%, 78%, 0.075)" (subtle pastel fill),
  stroke="hsla(hue, 55%, 78%, 0.7)" (more visible border), dashed stroke.
  - Polygons skip any input with fewer than 3 points.

  ---
  Back in Segmenter.segment()

  The pipeline result and both SVG strings are assembled into the final SegmentResult:

  {
    characters,        // CharacterSlot[] — sorted Japanese reading order
    strokes,           // AnnotatedStroke[] — same order as input, with characterIndex
    lassos,            // AnnotatedLasso[] — only lassos with strokes, with final strokeIndices
    segmentationSvg,   // SVG overlay of divider lines
    lassoSvg,          // SVG overlay of protected bounds (convex hulls)
  }

  The entire operation is pure and synchronous — no state mutation, no async, no DOM.
  Typically completes in ~1ms.
