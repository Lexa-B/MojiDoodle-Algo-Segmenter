import type { SegmentInput, SegmentationConfig, SegmentResult } from './types.js';
import type { ResolvedConfig } from './internal/types.js';
import { runPipeline } from './internal/pipeline.js';
import { generateSegmentationSvg, generateLassoSvg } from './internal/svg-generator.js';

/** Default configuration values. */
export const DEFAULT_CONFIG: Readonly<Required<SegmentationConfig>> = {
  minColumnGapRatio: 0.25,
  minRowGapRatio: 0.25,
  charSizeMultiplier: 2.0,
  minCharSizeRatio: 0.08,
  maxCharSizeRatio: 0.40,
  maxSizeRatio: 2.0,
  lassoContainmentThreshold: 0.5,
};

/** Resolve a partial config into a full config with defaults. */
function resolveConfig(config?: SegmentationConfig): ResolvedConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

/** Reusable, stateless segmenter. */
export class Segmenter {
  readonly config: Readonly<Required<SegmentationConfig>>;

  constructor(config?: SegmentationConfig) {
    this.config = resolveConfig(config);
  }

  /** Run segmentation on the given input. Pure function — no side effects. */
  segment(input: SegmentInput): SegmentResult {
    const pipelineResult = runPipeline(input, this.config);

    const segmentationSvg = input.maxCharacters === 1
      ? generateSegmentationSvg([], [], input.canvasWidth, input.canvasHeight)
      : generateSegmentationSvg(
          pipelineResult.columnDividers,
          pipelineResult.rowDividers,
          input.canvasWidth,
          input.canvasHeight,
        );

    // Debug: draw protected_bounds (convex hulls) instead of raw lasso polygons
    const hullPolygons: { x: number; y: number }[][] = [];
    for (let i = 0; i < input.lassos.length; i++) {
      const hull = pipelineResult.protectedBounds.get(i);
      if (hull && hull.length >= 3) {
        hullPolygons.push(hull);
      }
    }
    const lassoSvg = generateLassoSvg(
      hullPolygons,
      input.canvasWidth,
      input.canvasHeight,
    );

    return {
      characters: pipelineResult.characters,
      strokes: pipelineResult.strokes,
      lassos: pipelineResult.lassos,
      segmentationSvg,
      lassoSvg,
    };
  }
}

/** Segment with default config. For repeated use, prefer creating a Segmenter instance. */
export function segment(input: SegmentInput): SegmentResult {
  const defaultSegmenter = new Segmenter();
  return defaultSegmenter.segment(input);
}
