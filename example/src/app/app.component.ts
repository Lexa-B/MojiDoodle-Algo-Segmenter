import { Component, OnInit, OnDestroy } from '@angular/core';
import { CanvasComponent } from './canvas/canvas.component';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { ResultsComponent } from './results/results.component';
import { Segmenter, type SegmentInput, type SegmentResult, type Point } from 'mojidoodle-algo-segmenter';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CanvasComponent, ToolbarComponent, ResultsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private segmenter = new Segmenter();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  strokes: Point[][] = [];
  lassos: { points: { x: number; y: number }[] }[] = [];
  result: SegmentResult | null = null;
  mode: 'draw' | 'lasso' = 'draw';
  maxCharacters = 3;
  canvasWidth = 0;
  canvasHeight = 0;

  ngOnInit() {
    this.intervalId = setInterval(() => {
      if (this.dirty) {
        this.dirty = false;
        this.runSegmentation();
      }
    }, 250);
  }

  ngOnDestroy() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }
  }

  onModeChange(mode: 'draw' | 'lasso') {
    this.mode = mode;
  }

  onMaxCharactersChange(n: number) {
    this.maxCharacters = n;
    this.dirty = true;
  }

  onStrokeAdded(stroke: Point[]) {
    this.strokes = [...this.strokes, stroke];
    this.dirty = true;
  }

  onLassoAdded(lasso: { x: number; y: number }[]) {
    this.lassos = [...this.lassos, { points: lasso }];
    this.dirty = true;
  }

  onLassoDeleted(index: number) {
    this.lassos = this.lassos.filter((_, i) => i !== index);
    this.dirty = true;
  }

  onUndo() {
    if (this.mode === 'lasso' && this.lassos.length > 0) {
      this.lassos = this.lassos.slice(0, -1);
    } else if (this.strokes.length > 0) {
      this.strokes = this.strokes.slice(0, -1);
    }
    this.dirty = true;
  }

  onClear() {
    this.strokes = [];
    this.lassos = [];
    this.result = null;
    this.dirty = false;
  }

  onCanvasSizeChanged(size: { width: number; height: number }) {
    this.canvasWidth = size.width;
    this.canvasHeight = size.height;
    this.dirty = true;
  }

  private runSegmentation() {
    if (this.strokes.length === 0 || this.canvasWidth === 0 || this.canvasHeight === 0) {
      this.result = null;
      return;
    }

    const input: SegmentInput = {
      strokes: this.strokes,
      lassos: this.lassos,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      maxCharacters: this.maxCharacters,
    };

    this.result = this.segmenter.segment(input);
  }
}
