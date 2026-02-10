import {
  Component, Input, Output, EventEmitter,
  ElementRef, ViewChild, AfterViewInit, OnChanges, OnDestroy, SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { Point, SegmentResult } from 'mojidoodle-algo-segmenter';

/** Minimum total path distance (canvas px) for a lasso to register. */
const MIN_LASSO_DISTANCE = 30;

const LASSO_HUES = [
  0, 165, 330, 135, 300, 105, 270, 75, 240, 45, 210, 15,
  180, 345, 150, 315, 120, 285, 90, 255, 60, 225, 30, 195,
];

@Component({
  selector: 'app-canvas',
  standalone: true,
  templateUrl: './canvas.component.html',
  styleUrl: './canvas.component.css',
})
export class CanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('drawCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() strokes: Point[][] = [];
  @Input() lassos: { points: { x: number; y: number }[] }[] = [];
  @Input() mode: 'draw' | 'lasso' = 'draw';
  @Input() result: SegmentResult | null = null;

  @Output() strokeAdded = new EventEmitter<Point[]>();
  @Output() lassoAdded = new EventEmitter<{ x: number; y: number }[]>();
  @Output() lassoDeleted = new EventEmitter<number>();
  @Output() canvasSizeChanged = new EventEmitter<{ width: number; height: number }>();

  segSvgHtml: SafeHtml = '';
  lassoSvgHtml: SafeHtml = '';

  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private currentPoints: Point[] = [];
  private currentLassoPoints: { x: number; y: number }[] = [];
  private startTime = 0;
  private pointerDownPos: { x: number; y: number } | null = null;
  private resizeObserver!: ResizeObserver;

  constructor(private sanitizer: DomSanitizer) {}

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.syncCanvasSize();

    this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
    this.resizeObserver.observe(canvas);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.ctx) {
      this.redraw();
    }
    if (changes['result'] && this.result) {
      this.segSvgHtml = this.sanitizer.bypassSecurityTrustHtml(this.result.segmentationSvg);
      this.lassoSvgHtml = this.sanitizer.bypassSecurityTrustHtml(this.result.lassoSvg);
    } else if (changes['result'] && !this.result) {
      this.segSvgHtml = '';
      this.lassoSvgHtml = '';
    }
  }

  onPointerDown(event: PointerEvent) {
    const pos = this.getCanvasPos(event);
    this.pointerDownPos = pos;
    this.isDrawing = true;
    this.startTime = Date.now();

    if (this.mode === 'draw') {
      this.currentPoints = [{ x: pos.x, y: pos.y, t: 0 }];
    } else {
      this.currentLassoPoints = [{ x: pos.x, y: pos.y }];
    }

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent) {
    if (!this.isDrawing) return;
    const pos = this.getCanvasPos(event);

    if (this.mode === 'draw') {
      const t = Date.now() - this.startTime;
      this.currentPoints.push({ x: pos.x, y: pos.y, t });
      this.drawCurrentStroke();
    } else {
      this.currentLassoPoints.push({ x: pos.x, y: pos.y });
      this.drawCurrentLasso();
    }
  }

  onPointerUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.mode === 'draw' && this.currentPoints.length > 1) {
      this.strokeAdded.emit([...this.currentPoints]);
    } else if (this.mode === 'lasso') {
      const dist = this.lassoDrawDistance();
      // Short drag = click — try to delete a lasso under the cursor
      if (dist < MIN_LASSO_DISTANCE && this.pointerDownPos) {
        const hitIdx = this.findLassoAtPoint(this.pointerDownPos);
        if (hitIdx >= 0) {
          this.lassoDeleted.emit(hitIdx);
          this.currentLassoPoints = [];
          this.pointerDownPos = null;
          return;
        }
      }
      // Only emit if the lasso covers enough ground
      if (this.currentLassoPoints.length > 2 && dist >= MIN_LASSO_DISTANCE) {
        this.lassoAdded.emit([...this.currentLassoPoints]);
      }
    }

    this.currentPoints = [];
    this.currentLassoPoints = [];
    this.pointerDownPos = null;
  }

  private lassoDrawDistance(): number {
    const pts = this.currentLassoPoints;
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      dist += Math.sqrt(dx * dx + dy * dy);
    }
    return dist;
  }

  private findLassoAtPoint(pos: { x: number; y: number }): number {
    // Check lassos in reverse order (topmost first)
    for (let i = this.lassos.length - 1; i >= 0; i--) {
      if (this.isPointInPolygon(pos, this.lassos[i].points)) {
        return i;
      }
    }
    return -1;
  }

  private isPointInPolygon(
    point: { x: number; y: number },
    polygon: { x: number; y: number }[],
  ): boolean {
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

  private syncCanvasSize() {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.canvasSizeChanged.emit({ width: w, height: h });
      this.redraw();
    }
  }

  private getCanvasPos(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private redraw() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Build stroke → color maps
    const strokeLassoColor = this.buildStrokeLassoColorMap();
    const strokeCharColor = this.buildStrokeCharacterColorMap();

    for (let i = 0; i < this.strokes.length; i++) {
      const charColor = strokeCharColor.get(i) ?? '#ffffff';
      const lassoColor = strokeLassoColor.get(i) ?? '#ffffff';
      this.drawStroke(this.strokes[i], charColor, lassoColor);
    }
  }

  private buildStrokeLassoColorMap(): Map<number, string> {
    const map = new Map<number, string>();
    if (!this.result) return map;

    for (const lasso of this.result.lassos) {
      const hue = LASSO_HUES[lasso.index % LASSO_HUES.length];
      const color = `hsl(${hue}, 55%, 78%)`;
      for (const strokeIdx of lasso.strokeIndices) {
        map.set(strokeIdx, color);
      }
    }
    return map;
  }

  private buildStrokeCharacterColorMap(): Map<number, string> {
    const map = new Map<number, string>();
    if (!this.result) return map;

    for (const stroke of this.result.strokes) {
      if (stroke.characterIndex >= 0) {
        const hue = LASSO_HUES[stroke.characterIndex % LASSO_HUES.length];
        map.set(stroke.index, `hsl(${hue}, 95%, 55%)`);
      }
    }
    return map;
  }

  private drawStroke(points: Point[] | { x: number; y: number }[], color1: string, color2: string) {
    if (points.length < 2) return;
    const SEGMENT_LEN = 10; // px per dash
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    let dist = 0;
    let useFirst = true;
    let segStart = 0;

    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      dist += Math.sqrt(dx * dx + dy * dy);

      if (dist >= SEGMENT_LEN || i === points.length - 1) {
        this.ctx.strokeStyle = useFirst ? color1 : color2;
        this.ctx.beginPath();
        this.ctx.moveTo(points[segStart].x, points[segStart].y);
        for (let j = segStart + 1; j <= i; j++) {
          this.ctx.lineTo(points[j].x, points[j].y);
        }
        this.ctx.stroke();
        segStart = i;
        dist = 0;
        useFirst = !useFirst;
      }
    }
  }

  private drawCurrentStroke() {
    this.redraw();
    this.drawStroke(this.currentPoints, '#ffffff', '#ffffff');
  }

  private drawCurrentLasso() {
    this.redraw();
    if (this.currentLassoPoints.length < 2) return;

    this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.currentLassoPoints[0].x, this.currentLassoPoints[0].y);
    for (let i = 1; i < this.currentLassoPoints.length; i++) {
      this.ctx.lineTo(this.currentLassoPoints[i].x, this.currentLassoPoints[i].y);
    }
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
    this.ctx.fill();
  }
}
