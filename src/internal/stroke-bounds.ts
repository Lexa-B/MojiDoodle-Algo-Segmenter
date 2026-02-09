import type { Point } from '../types.js';
import type { StrokeBounds, ResolvedConfig } from './types.js';

/** Calculate bounding box for a single stroke. */
export function calculateStrokeBounds(stroke: Point[], index: number): StrokeBounds {
  if (stroke.length === 0) {
    return {
      strokeIndex: index,
      minX: 0, maxX: 0, minY: 0, maxY: 0,
      centerX: 0, centerY: 0,
    };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const p of stroke) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return {
    strokeIndex: index,
    minX, maxX, minY, maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/** Estimate character size from stroke dimensions. */
export function estimateCharSize(
  strokeBounds: StrokeBounds[],
  canvasDimension: number,
  dimension: 'width' | 'height',
  config: ResolvedConfig,
): number {
  if (strokeBounds.length === 0) {
    return canvasDimension * 0.15;
  }

  const sizes = strokeBounds
    .map(s => dimension === 'width' ? s.maxX - s.minX : s.maxY - s.minY)
    .filter(size => size > 5);

  if (sizes.length === 0) {
    return canvasDimension * 0.15;
  }

  sizes.sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)];
  const estimated = medianSize * config.charSizeMultiplier;

  const minSize = canvasDimension * config.minCharSizeRatio;
  const maxSize = canvasDimension * config.maxCharSizeRatio;

  return Math.max(minSize, Math.min(maxSize, estimated));
}
