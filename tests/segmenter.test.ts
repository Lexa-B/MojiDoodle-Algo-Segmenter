import { describe, it, expect } from 'vitest';
import { Segmenter, segment, DEFAULT_CONFIG } from '../src/index.js';
import { makeInput, makeCharacterStrokes, makeLasso } from './fixtures/helpers.js';

describe('Segmenter', () => {
  it('exports DEFAULT_CONFIG with correct values', () => {
    expect(DEFAULT_CONFIG.minColumnGapRatio).toBe(0.25);
    expect(DEFAULT_CONFIG.minRowGapRatio).toBe(0.25);
    expect(DEFAULT_CONFIG.charSizeMultiplier).toBe(2.0);
    expect(DEFAULT_CONFIG.minCharSizeRatio).toBe(0.08);
    expect(DEFAULT_CONFIG.maxCharSizeRatio).toBe(0.40);
    expect(DEFAULT_CONFIG.maxSizeRatio).toBe(2.0);
    expect(DEFAULT_CONFIG.lassoContainmentThreshold).toBe(0.5);
  });

  it('creates a Segmenter with default config', () => {
    const s = new Segmenter();
    expect(s.config).toEqual(DEFAULT_CONFIG);
  });

  it('creates a Segmenter with custom config merged with defaults', () => {
    const s = new Segmenter({ minColumnGapRatio: 0.5 });
    expect(s.config.minColumnGapRatio).toBe(0.5);
    expect(s.config.minRowGapRatio).toBe(0.25); // default preserved
  });

  it('convenience segment() function works', () => {
    const result = segment(makeInput());
    expect(result).toBeDefined();
    expect(result.characters).toEqual([]);
  });
});

describe('segment() integration', () => {
  it('segments two characters in a single column (vertical writing)', () => {
    // Two characters stacked vertically, right side of canvas
    const topStrokes = makeCharacterStrokes(600, 100, 60);
    const bottomStrokes = makeCharacterStrokes(600, 350, 60);

    const input = makeInput({
      strokes: [...topStrokes, ...bottomStrokes],
      maxCharacters: 2,
    });

    const s = new Segmenter();
    const result = s.segment(input);

    expect(result.characters.length).toBe(2);
    // Characters should be in reading order (top to bottom within column)
    expect(result.characters[0].index).toBe(0);
    expect(result.characters[1].index).toBe(1);
    // Top character should have lower Y values
    expect(result.characters[0].bounds.minY).toBeLessThan(result.characters[1].bounds.minY);
  });

  it('segments four characters in two columns (right-to-left, Japanese order)', () => {
    // Two columns, two rows each — valid for Japanese vertical writing
    // Right column (read first): top-right, bottom-right
    // Left column (read second): top-left, bottom-left
    const topRight = makeCharacterStrokes(650, 100, 60);
    const bottomRight = makeCharacterStrokes(650, 350, 60);
    const topLeft = makeCharacterStrokes(150, 100, 60);
    const bottomLeft = makeCharacterStrokes(150, 350, 60);

    const input = makeInput({
      strokes: [...topRight, ...bottomRight, ...topLeft, ...bottomLeft],
      canvasWidth: 800,
      canvasHeight: 600,
      maxCharacters: 4,
    });

    const s = new Segmenter();
    const result = s.segment(input);

    expect(result.characters.length).toBe(4);
    // Japanese reading order: right column top-to-bottom, then left column top-to-bottom
    // Character 0 = top-right, 1 = bottom-right, 2 = top-left, 3 = bottom-left
    expect(result.characters[0].bounds.minX).toBeGreaterThan(result.characters[2].bounds.minX);
    expect(result.characters[0].bounds.minY).toBeLessThan(result.characters[1].bounds.minY);
  });

  it('annotates all strokes with characterIndex', () => {
    const strokes = [
      ...makeCharacterStrokes(600, 100, 60),
      ...makeCharacterStrokes(600, 350, 60),
    ];

    const input = makeInput({
      strokes,
      maxCharacters: 2,
    });

    const result = segment(input);

    expect(result.strokes.length).toBe(strokes.length);
    // Each stroke should have an index matching its position
    result.strokes.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.points).toBe(strokes[i]); // Same reference
    });
    // All strokes should be assigned
    const assigned = result.strokes.filter(s => s.characterIndex >= 0);
    expect(assigned.length).toBe(strokes.length);
  });

  it('generates segmentationSvg with correct dimensions', () => {
    const strokes = [
      ...makeCharacterStrokes(600, 100, 60),
      ...makeCharacterStrokes(600, 350, 60),
    ];

    const input = makeInput({
      strokes,
      canvasWidth: 800,
      canvasHeight: 600,
      maxCharacters: 2,
    });

    const result = segment(input);

    expect(result.segmentationSvg).toContain('width="800"');
    expect(result.segmentationSvg).toContain('height="600"');
    expect(result.segmentationSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('generates lassoSvg when lassos are provided', () => {
    const strokes = makeCharacterStrokes(400, 300, 60);
    const lasso = makeLasso(350, 250, 450, 350);

    const input = makeInput({
      strokes,
      lassos: [lasso],
      maxCharacters: 1,
    });

    const result = segment(input);

    expect(result.lassoSvg).toContain('polygon');
    expect(result.lassoSvg).toContain('hsla(');
    expect(result.lassos.length).toBe(1);
    expect(result.lassos[0].strokeIndices.length).toBeGreaterThan(0);
  });

  it('handles lassos that keep strokes together', () => {
    // Two strokes that might otherwise be split, grouped by a lasso
    const stroke1 = makeCharacterStrokes(500, 100, 60);
    const stroke2 = makeCharacterStrokes(500, 200, 60);
    const separateStroke = makeCharacterStrokes(500, 450, 60);

    const lasso = makeLasso(440, 50, 560, 260);

    const input = makeInput({
      strokes: [...stroke1, ...stroke2, ...separateStroke],
      lassos: [lasso],
      maxCharacters: 2,
    });

    const result = segment(input);

    // The lasso should contain strokes from stroke1 and stroke2
    expect(result.lassos[0].strokeIndices.length).toBeGreaterThan(0);
  });
});

describe('adjacent protected bounds segmentation', () => {
  it('separates two adjacent protected bounds in the same column', () => {
    // Two character clusters stacked vertically, each with its own lasso
    const topStrokes = makeCharacterStrokes(500, 100, 60);
    const bottomStrokes = makeCharacterStrokes(500, 300, 60);

    const topLasso = makeLasso(440, 50, 560, 160);
    const bottomLasso = makeLasso(440, 240, 560, 360);

    const input = makeInput({
      strokes: [...topStrokes, ...bottomStrokes],
      lassos: [topLasso, bottomLasso],
      maxCharacters: 2,
    });

    const result = segment(input);

    expect(result.characters.length).toBe(2);
    // Each protected bound should get its own character slot
    expect(result.characters[0].bounds.minY).toBeLessThan(result.characters[1].bounds.minY);
  });

  it('separates three adjacent protected bounds (い/っ/て pattern)', () => {
    // Three clusters where the middle one is small (like っ)
    const topStrokes = makeCharacterStrokes(500, 80, 80);     // い - large
    const midStrokes = makeCharacterStrokes(500, 210, 30);    // っ - small
    const bottomStrokes = makeCharacterStrokes(500, 330, 80); // て - large

    const topLasso = makeLasso(430, 20, 570, 140);
    const midLasso = makeLasso(470, 185, 530, 235);
    const bottomLasso = makeLasso(430, 270, 570, 390);

    const input = makeInput({
      strokes: [...topStrokes, ...midStrokes, ...bottomStrokes],
      lassos: [topLasso, midLasso, bottomLasso],
      maxCharacters: 3,
    });

    const result = segment(input);

    expect(result.characters.length).toBe(3);
    // All three should be separated in reading order (top to bottom)
    expect(result.characters[0].bounds.minY).toBeLessThan(result.characters[1].bounds.minY);
    expect(result.characters[1].bounds.minY).toBeLessThan(result.characters[2].bounds.minY);
  });

  it('separates protected bounds with overlapping Y extents', () => {
    // Two protected bounds whose strokes overlap in Y but are distinct groups
    const topStrokes = makeCharacterStrokes(500, 150, 100);
    const bottomStrokes = makeCharacterStrokes(500, 240, 100);

    // Lassos tightly wrap each group — strokes overlap in Y range
    const topLasso = makeLasso(420, 80, 580, 220);
    const bottomLasso = makeLasso(420, 170, 580, 310);

    const input = makeInput({
      strokes: [...topStrokes, ...bottomStrokes],
      lassos: [topLasso, bottomLasso],
      maxCharacters: 2,
    });

    const result = segment(input);

    expect(result.characters.length).toBe(2);
  });
});
