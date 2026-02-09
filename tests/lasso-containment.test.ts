import { describe, it, expect } from 'vitest';
import { isPointInPolygon, findStrokesInLasso, buildProtectedGroups } from '../src/internal/lasso-containment.js';
import { makePoint, makeHorizontalStroke } from './fixtures/helpers.js';

describe('isPointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('returns true for a point inside a square', () => {
    expect(isPointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it('returns false for a point outside a square', () => {
    expect(isPointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('returns false for a point above the polygon', () => {
    expect(isPointInPolygon({ x: 50, y: -10 }, square)).toBe(false);
  });

  it('returns false for a polygon with fewer than 3 points', () => {
    expect(isPointInPolygon({ x: 50, y: 50 }, [{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(false);
  });

  it('handles a triangle', () => {
    const triangle = [
      { x: 50, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(isPointInPolygon({ x: 50, y: 50 }, triangle)).toBe(true);
    expect(isPointInPolygon({ x: 5, y: 5 }, triangle)).toBe(false);
  });

  it('handles a concave polygon', () => {
    // L-shaped polygon
    const lShape = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Point in the bottom-right area (inside the L)
    expect(isPointInPolygon({ x: 75, y: 75 }, lShape)).toBe(true);
    // Point in the upper-right area (outside the L's notch)
    expect(isPointInPolygon({ x: 75, y: 25 }, lShape)).toBe(false);
  });
});

describe('findStrokesInLasso', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('finds strokes fully inside the polygon', () => {
    const strokes = [
      makeHorizontalStroke(50, 20, 80), // fully inside
      makeHorizontalStroke(200, 20, 80), // fully outside
    ];

    const result = findStrokesInLasso(strokes, square, 0.5);
    expect(result).toEqual([0]);
  });

  it('includes strokes with >= threshold containment', () => {
    // Stroke that's mostly inside (80% of points inside)
    const stroke = makeHorizontalStroke(50, -10, 80, 10);
    const result = findStrokesInLasso([stroke], square, 0.5);
    expect(result).toEqual([0]);
  });

  it('excludes strokes below threshold', () => {
    // Stroke that's mostly outside (only ~20% inside)
    const stroke = makeHorizontalStroke(50, -80, 10, 10);
    const result = findStrokesInLasso([stroke], square, 0.5);
    expect(result).toEqual([]);
  });

  it('skips empty strokes', () => {
    const result = findStrokesInLasso([[]], square, 0.5);
    expect(result).toEqual([]);
  });
});

describe('buildProtectedGroups', () => {
  it('builds groups from multiple lassos', () => {
    const strokes = [
      makeHorizontalStroke(50, 20, 80), // in lasso 1
      makeHorizontalStroke(250, 220, 280), // in lasso 2
      makeHorizontalStroke(500, 20, 80), // not in any lasso
    ];

    const lasso1 = [
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    const lasso2 = [
      { x: 200, y: 200 }, { x: 300, y: 200 },
      { x: 300, y: 300 }, { x: 200, y: 300 },
    ];

    const groups = buildProtectedGroups(strokes, [lasso1, lasso2], 0.5);
    expect(groups.length).toBe(2);
    expect(groups[0].strokeIndices).toEqual([0]);
    expect(groups[1].strokeIndices).toEqual([1]);
  });

  it('returns empty for no lassos', () => {
    const strokes = [makeHorizontalStroke(50, 20, 80)];
    const groups = buildProtectedGroups(strokes, [], 0.5);
    expect(groups).toEqual([]);
  });

  it('skips lassos with no contained strokes', () => {
    const strokes = [makeHorizontalStroke(50, 20, 80)];
    const lasso = [
      { x: 500, y: 500 }, { x: 600, y: 500 },
      { x: 600, y: 600 }, { x: 500, y: 600 },
    ];

    const groups = buildProtectedGroups(strokes, [lasso], 0.5);
    expect(groups).toEqual([]);
  });
});
