import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { SegmentResult } from 'mojidoodle-algo-segmenter';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './results.component.html',
  styleUrl: './results.component.css',
})
export class ResultsComponent {
  @Input() result!: SegmentResult;
}
