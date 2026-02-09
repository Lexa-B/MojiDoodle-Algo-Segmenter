/**
 * WORKBOOK PAGE EXCERPTS
 *
 * Key sections from workbook.page.ts showing how the current monolithic app
 * calls the segmenter, builds protected groups from lassos, sorts cells,
 * feeds cells to the recognition API, and renders visualization.
 *
 * ALL OF THIS gets replaced by a single segmenter.segment() call in the new API.
 */

// =============================================================================
// STATE (lines 55-78)
// These fields exist on the workbook page component
// =============================================================================

// Segmentation state
private segmentationResult: SegmentationResult | null = null;
private lastBatchResults: { character: string; score: number }[][] = [];
private lastSortedCells: GridCell[] = [];

// Lasso state
private lassos: { points: {x: number, y: number}[] }[] = [];
private currentLasso: {x: number, y: number}[] = [];

// Lasso color palette — 24 pastel hues in lug-nut pattern
private readonly LASSO_HUES = [
  0, 165, 330, 135, 300, 105, 270, 75, 240, 45, 210, 15,
  180, 345, 150, 315, 120, 285, 90, 255, 60, 225, 30, 195
];


// =============================================================================
// LASSO → PROTECTED GROUPS (lines 843-903)
// This logic moves INSIDE the module. Consumer just passes LassoInput[].
// =============================================================================

/**
 * Point-in-polygon test using ray casting.
 * DUPLICATED in collection.service.ts — needs consolidation.
 */
private isPointInPolygon(point: {x: number, y: number}, polygon: {x: number, y: number}[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculate what percentage of a stroke's points are inside a lasso.
 * Returns 0.0 to 1.0.
 */
private calculateLassoContainment(strokeIndex: number, lasso: {x: number, y: number}[]): number {
  const stroke = this.strokes[strokeIndex];
  if (!stroke || stroke.length === 0) return 0;
  let pointsInside = 0;
  for (const point of stroke) {
    if (this.isPointInPolygon(point, lasso)) {
      pointsInside++;
    }
  }
  return pointsInside / stroke.length;
}

/**
 * Convert lassos to ProtectedGroup[] for the segmentation service.
 * In the new API, this happens INSIDE the module — consumer just passes polygons.
 */
private getProtectedGroups(): ProtectedGroup[] {
  const groups: ProtectedGroup[] = [];
  for (const lasso of this.lassos) {
    const strokeIndices: number[] = [];
    for (let i = 0; i < this.strokes.length; i++) {
      const containment = this.calculateLassoContainment(i, lasso.points);
      if (containment >= 0.5) {
        strokeIndices.push(i);
      }
    }
    if (strokeIndices.length > 0) {
      groups.push({ strokeIndices });
    }
  }
  return groups;
}


// =============================================================================
// CALLING THE SEGMENTER (lines 593-663)
// The onCheck() method — segmentation + recognition flow
// =============================================================================

async onCheck() {
  const canvas = this.canvasRef.nativeElement;

  // Calculate max answer length to determine if segmentation is needed
  const maxAnswerLength = Math.max(
    ...this.currentCard.answers.map(a => [...a.replace(/\s+/g, '')].length)
  );

  // Only run segmentation for multi-character answers
  if (maxAnswerLength > 1) {
    // Run segmentation with protected groups from lassos
    if (!this.segmentationResult) {
      this.segmentationResult = this.segmentationService.segment(
        this.strokes,
        canvas.width,
        canvas.height,
        this.getProtectedGroups()  // <-- This becomes internal in new API
      );
    }

    const grid = this.segmentationResult.grid;
    const cellsWithStrokes = grid.cells.filter(c => c.strokeIndices.length > 0);

    // Sort cells in Japanese reading order  <-- This becomes internal in new API
    this.lastSortedCells = [...cellsWithStrokes].sort((a, b) => {
      if (a.column !== b.column) return a.column - b.column;
      return a.row - b.row;
    });
  }

  // --- FEED TO RECOGNITION API ---

  if (this.lastSortedCells.length <= 1) {
    // Single cell — regular recognition
    results = await this.strokeRecognition.recognize(
      this.strokes, canvas.width, canvas.height
    );
  } else {
    // Multiple cells — batch recognition
    // This extraction logic becomes internal in new API (CharacterSlot.strokes)
    const cellData = this.lastSortedCells.map(cell => {
      const cellStrokes = cell.strokeIndices.map(i => this.strokes[i]);
      const width = cell.bounds.maxX - cell.bounds.minX;
      const height = cell.bounds.maxY - cell.bounds.minY;
      return { strokes: cellStrokes, bounds: { width, height } };
    });

    const batchResults = await this.strokeRecognition.recognizeBatch(cellData);
    this.lastBatchResults = batchResults;
  }

  // ... grading logic follows (not part of segmenter module)
}

// NEW API EQUIVALENT of the above:
//
// const result = segmenter.segment({
//   strokes: this.strokes,
//   lassos: this.lassos,
//   canvasWidth: canvas.width,
//   canvasHeight: canvas.height,
//   maxCharacters: maxAnswerLength,
// });
//
// if (result.characters.length <= 1) {
//   results = await this.strokeRecognition.recognize(
//     this.strokes, canvas.width, canvas.height
//   );
// } else {
//   const cellData = result.characters.map(c => ({
//     strokes: c.strokes,
//     bounds: { width: c.bounds.width, height: c.bounds.height }
//   }));
//   batchResults = await this.strokeRecognition.recognizeBatch(cellData);
// }


// =============================================================================
// STROKE COLORING BY LASSO (lines 925-941)
// In new API: consumer uses result.strokes[].characterIndex
// =============================================================================

/**
 * Get stroke color based on lasso assignment.
 * Stroke belongs to whichever lasso contains highest % of its points.
 */
private getStrokeColor(strokeIndex: number): string {
  let bestLassoIndex = -1;
  let bestContainment = 0;
  for (let i = 0; i < this.lassos.length; i++) {
    const containment = this.calculateLassoContainment(strokeIndex, this.lassos[i].points);
    if (containment > bestContainment) {
      bestContainment = containment;
      bestLassoIndex = i;
    }
  }
  if (bestLassoIndex >= 0 && bestContainment >= 0.5) {
    return this.getLassoColor(bestLassoIndex, 1.0);
  }
  return '#fff';
}


// =============================================================================
// LASSO VISUALIZATION (lines 84-87, 986-1008)
// In new API: replaced by lassoSvg output
// =============================================================================

private getLassoColor(index: number, opacity: number = 0.7): string {
  const hue = this.LASSO_HUES[index % this.LASSO_HUES.length];
  return `hsla(${hue}, 55%, 78%, ${opacity})`;
}

private drawLasso(points: {x: number, y: number}[], index: number): void {
  if (points.length < 3) return;
  this.ctx.save();

  // Fill with very faint color (15% opacity)
  this.ctx.fillStyle = this.getLassoColor(index, 0.15);
  this.ctx.beginPath();
  this.ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    this.ctx.lineTo(points[i].x, points[i].y);
  }
  this.ctx.closePath();
  this.ctx.fill();

  // Dashed outline (70% opacity)
  this.ctx.strokeStyle = this.getLassoColor(index, 0.7);
  this.ctx.lineWidth = 2;
  this.ctx.setLineDash([6, 4]);
  this.ctx.stroke();

  this.ctx.restore();
}


// =============================================================================
// SEGMENTATION DIVIDER VISUALIZATION (lines 1218-1253)
// In new API: replaced by segmentationSvg output
// =============================================================================

/**
 * Draw divider lines between columns and rows.
 * Column dividers: x = slope * y + intercept (vertical lines)
 * Row dividers: y = slope * x + intercept (horizontal lines)
 */
private drawDividers(grid: SegmentationGrid): void {
  this.ctx.save();
  this.ctx.strokeStyle = 'rgba(128, 128, 128, 0.8)';
  this.ctx.lineWidth = 2;
  this.ctx.setLineDash([4, 4]);

  // Column dividers (vertical)
  for (const divider of grid.columnDividers) {
    const y1 = divider.start;
    const y2 = divider.end;
    const x1 = divider.slope * y1 + divider.intercept;
    const x2 = divider.slope * y2 + divider.intercept;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  // Row dividers (horizontal, per column)
  for (const columnRows of grid.rowDividers) {
    for (const divider of columnRows) {
      const x1 = divider.start;
      const x2 = divider.end;
      const y1 = divider.slope * x1 + divider.intercept;
      const y2 = divider.slope * x2 + divider.intercept;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }

  this.ctx.restore();
}


// =============================================================================
// CANVAS LAYER ORDER (lines 1116-1145)
// Shows the full redraw — layers from back to front
// =============================================================================

private fullRedraw(): void {
  const canvas = this.canvasRef.nativeElement;
  this.ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Layer 1: Completed lassos (background)  →  lassoSvg in new API
  for (let i = 0; i < this.lassos.length; i++) {
    this.drawLasso(this.lassos[i].points, i);
  }

  // Layer 2: Current lasso being drawn  →  stays in workbook (interactive state)
  if (this.currentLasso.length > 1) {
    this.drawCurrentLasso();
  }

  // Layer 3: Strokes colored by lasso  →  consumer uses result.strokes[].characterIndex
  for (let i = 0; i < this.strokes.length; i++) {
    const color = this.getStrokeColor(i);
    this.drawStrokeWithColor(this.strokes[i], color);
  }

  // Layer 4: Segmentation dividers  →  segmentationSvg in new API
  if (this.segmentationResult) {
    const grid = this.segmentationResult.grid;
    const hasDividers = grid.columnDividers.length > 0 ||
                        grid.rowDividers.some(r => r.length > 0);
    if (hasDividers) {
      this.drawDividers(grid);
    }
  }
}


// =============================================================================
// DATA EXPORT (lines 1259-1286)
// Shows how collection service gets segmentation data
// In new API: uses result.lassos[].strokeIndices directly
// =============================================================================

private exportCollectionSample(success: boolean): void {
  if (!this.currentCard) return;
  const canvas = this.canvasRef.nativeElement;

  let recognitionResults: { character: string; score: number }[][] | null = null;
  if (this.lastBatchResults.length > 0) {
    recognitionResults = this.lastBatchResults;
  } else if (this.topMatches.length > 0) {
    recognitionResults = [this.topMatches];
  }

  this.collectionService.exportSample({
    strokes: this.strokes,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    segmentationResult: this.segmentationResult,  // passes grid internals
    sortedCells: this.lastSortedCells,             // passes cell assignments
    answers: this.currentCard.answers,
    recognitionResults,
    success,
    cardId: this.currentCard.id,
    lassos: this.lassos.length > 0 ? this.lassos : undefined  // raw polygons
  });
}

// NEW API EQUIVALENT:
//
// this.collectionService.exportSample({
//   strokes: this.strokes,
//   canvasWidth: canvas.width,
//   canvasHeight: canvas.height,
//   segmentResult: result,          // the whole result object
//   answers: this.currentCard.answers,
//   recognitionResults,
//   success,
//   cardId: this.currentCard.id,
// });
//
// The collection service can extract:
// - result.lassos → already has strokeIndices
// - result.characters → already has stroke assignments for ground truth
