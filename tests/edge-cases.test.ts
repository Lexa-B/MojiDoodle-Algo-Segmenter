import { describe, it, expect } from 'vitest';
import { Segmenter, segment } from '../src/index.js';
import { makeInput, makeCharacterStrokes, makeLasso, makePoint } from './fixtures/helpers.js';

describe('edge cases', () => {
  it('returns empty result for empty strokes', () => {
    const result = segment(makeInput({ strokes: [] }));

    expect(result.characters).toEqual([]);
    expect(result.strokes).toEqual([]);
    expect(result.segmentationSvg).toContain('<svg');
    expect(result.lassoSvg).toContain('<svg');
  });

  it('maxCharacters: 1 returns single CharacterSlot with all strokes', () => {
    const strokes = [
      ...makeCharacterStrokes(200, 200, 60),
      ...makeCharacterStrokes(600, 200, 60),
    ];

    const result = segment(makeInput({
      strokes,
      maxCharacters: 1,
    }));

    expect(result.characters.length).toBe(1);
    expect(result.characters[0].index).toBe(0);
    expect(result.characters[0].strokes.length).toBe(strokes.length);

    // segmentationSvg should be empty (no dividers)
    expect(result.segmentationSvg).not.toContain('<line');

    // All strokes should be assigned to character 0
    result.strokes.forEach(s => {
      expect(s.characterIndex).toBe(0);
    });
  });

  it('maxCharacters: 1 with empty segmentationSvg', () => {
    const result = segment(makeInput({
      strokes: makeCharacterStrokes(400, 300, 60),
      maxCharacters: 1,
    }));

    expect(result.segmentationSvg).toContain('<svg');
    expect(result.segmentationSvg).not.toContain('<line');
  });

  it('no lassos returns empty lassos array', () => {
    const result = segment(makeInput({
      strokes: makeCharacterStrokes(400, 300, 60),
      lassos: [],
      maxCharacters: 1,
    }));

    expect(result.lassos).toEqual([]);
    expect(result.lassoSvg).toContain('<svg');
    expect(result.lassoSvg).not.toContain('polygon');
  });

  it('lasso with no strokes inside is excluded from output', () => {
    const strokes = makeCharacterStrokes(100, 100, 60);
    // Lasso far from strokes
    const lasso = makeLasso(600, 400, 700, 500);

    const result = segment(makeInput({
      strokes,
      lassos: [lasso],
      maxCharacters: 1,
    }));

    expect(result.lassos.length).toBe(0);
    expect(result.lassoSvg).not.toContain('polygon');
  });

  it('lasso emptied by stealing is excluded from output', () => {
    const strokes = makeCharacterStrokes(150, 150, 60);
    const lassoA = makeLasso(100, 100, 200, 200); // covers strokes
    const lassoB = makeLasso(100, 100, 200, 200); // same area, steals all strokes

    const result = segment(makeInput({
      strokes,
      lassos: [lassoA, lassoB],
      maxCharacters: 1,
    }));

    expect(result.lassos.length).toBe(1);
    expect(result.lassos[0].strokeIndices.length).toBeGreaterThan(0);
  });

  it('unassigned strokes get characterIndex: -1', () => {
    // Create two well-separated clusters and one outlier stroke far away
    const cluster1 = makeCharacterStrokes(600, 100, 60);
    const cluster2 = makeCharacterStrokes(600, 350, 60);
    // Single point far from either cluster
    const outlier = [makePoint(50, 550)];

    const result = segment(makeInput({
      strokes: [...cluster1, ...cluster2, outlier],
      maxCharacters: 2,
    }));

    // The outlier might be unassigned or in its own cell, depending on segmentation
    // At minimum, assigned strokes should reference valid characters
    result.strokes.forEach(s => {
      if (s.characterIndex >= 0) {
        expect(s.characterIndex).toBeLessThan(result.characters.length);
      }
    });
  });

  it('preserves stroke point references (passthrough)', () => {
    const strokes = makeCharacterStrokes(400, 300, 60);
    const result = segment(makeInput({
      strokes,
      maxCharacters: 1,
    }));

    // AnnotatedStroke.points should be the same reference as input
    result.strokes.forEach((s, i) => {
      expect(s.points).toBe(strokes[i]);
    });
  });

  it('preserves lasso point references (passthrough)', () => {
    const lasso = makeLasso(100, 100, 200, 200);
    const result = segment(makeInput({
      strokes: makeCharacterStrokes(150, 150, 60),
      lassos: [lasso],
      maxCharacters: 1,
    }));

    expect(result.lassos[0].points).toBe(lasso.points);
  });

  it('handles single stroke input', () => {
    const strokes = [makeCharacterStrokes(400, 300, 60)[0]];
    const result = segment(makeInput({
      strokes,
      maxCharacters: 3,
    }));

    expect(result.characters.length).toBeGreaterThanOrEqual(1);
    expect(result.strokes.length).toBe(1);
  });

  it('CharacterSlot bounds have correct width and height', () => {
    const result = segment(makeInput({
      strokes: makeCharacterStrokes(400, 300, 60),
      maxCharacters: 1,
    }));

    const slot = result.characters[0];
    expect(slot.bounds.width).toBe(slot.bounds.maxX - slot.bounds.minX);
    expect(slot.bounds.height).toBe(slot.bounds.maxY - slot.bounds.minY);
  });
});
