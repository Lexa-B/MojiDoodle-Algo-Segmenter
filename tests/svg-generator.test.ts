import { describe, it, expect } from 'vitest';
import { generateSegmentationSvg, generateLassoSvg } from '../src/internal/svg-generator.js';
import type { DividerLine } from '../src/internal/types.js';

describe('generateSegmentationSvg', () => {
  it('generates empty SVG with no dividers', () => {
    const svg = generateSegmentationSvg([], [], 800, 600);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain('<line');
  });

  it('generates column divider lines', () => {
    const colDividers: DividerLine[] = [
      { slope: 0, intercept: 300, start: 40, end: 450 },
    ];

    const svg = generateSegmentationSvg(colDividers, [[]], 800, 600);
    expect(svg).toContain('<line');
    expect(svg).toContain('x1="300"');
    expect(svg).toContain('y1="40"');
    expect(svg).toContain('x2="300"');
    expect(svg).toContain('y2="450"');
    expect(svg).toContain('stroke="rgba(128,128,128,0.8)"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-dasharray="4,4"');
  });

  it('generates row divider lines', () => {
    const rowDividers: DividerLine[][] = [[
      { slope: 0, intercept: 200, start: 50, end: 750 },
    ]];

    const svg = generateSegmentationSvg([], rowDividers, 800, 600);
    expect(svg).toContain('<line');
    expect(svg).toContain('x1="50"');
    expect(svg).toContain('y1="200"');
    expect(svg).toContain('x2="750"');
    expect(svg).toContain('y2="200"');
  });

  it('generates both column and row dividers', () => {
    const colDividers: DividerLine[] = [
      { slope: 0, intercept: 400, start: 10, end: 590 },
    ];
    const rowDividers: DividerLine[][] = [
      [{ slope: 0, intercept: 300, start: 10, end: 390 }],
      [{ slope: 0, intercept: 250, start: 410, end: 790 }],
    ];

    const svg = generateSegmentationSvg(colDividers, rowDividers, 800, 600);
    const lineCount = (svg.match(/<line/g) || []).length;
    expect(lineCount).toBe(3);
  });
});

describe('generateLassoSvg', () => {
  it('generates empty SVG with no lassos', () => {
    const svg = generateLassoSvg([], 800, 600);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
    expect(svg).not.toContain('polygon');
  });

  it('generates polygon for a single lasso', () => {
    const lassos = [[
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ]];

    const svg = generateLassoSvg(lassos, 800, 600);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('points="100,50 200,50 200,200 100,200"');
    expect(svg).toContain('fill="hsla(0,55%,78%,0.15)"');
    expect(svg).toContain('stroke="hsla(0,55%,78%,0.7)"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-dasharray="6,4"');
  });

  it('uses different hues for multiple lassos', () => {
    const lassos = [
      [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }],
      [{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 150 }],
    ];

    const svg = generateLassoSvg(lassos, 800, 600);
    const polygonCount = (svg.match(/<polygon/g) || []).length;
    expect(polygonCount).toBe(2);

    // First lasso: hue 0, second: hue 165
    expect(svg).toContain('hsla(0,55%,78%');
    expect(svg).toContain('hsla(165,55%,78%');
  });

  it('skips lassos with fewer than 3 points', () => {
    const lassos = [
      [{ x: 10, y: 10 }, { x: 50, y: 50 }], // too few points
      [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }], // valid
    ];

    const svg = generateLassoSvg(lassos, 800, 600);
    const polygonCount = (svg.match(/<polygon/g) || []).length;
    expect(polygonCount).toBe(1);
  });
});
