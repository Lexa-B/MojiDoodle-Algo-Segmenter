import type { DividerLine } from './types.js';

/** 24 pastel hues in lug-nut pattern. */
const LASSO_HUES = [
  0, 165, 330, 135, 300, 105, 270, 75, 240, 45, 210, 15,
  180, 345, 150, 315, 120, 285, 90, 255, 60, 225, 30, 195,
];

/** Generate SVG string for segmentation divider lines. */
export function generateSegmentationSvg(
  columnDividers: DividerLine[],
  rowDividers: DividerLine[][],
  canvasWidth: number,
  canvasHeight: number,
): string {
  const lines: string[] = [];

  // Column dividers (vertical): x = slope * y + intercept
  for (const divider of columnDividers) {
    const y1 = divider.start;
    const y2 = divider.end;
    const x1 = divider.slope * y1 + divider.intercept;
    const x2 = divider.slope * y2 + divider.intercept;
    lines.push(
      `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(128,128,128,0.8)" stroke-width="2" stroke-dasharray="4,4" />`
    );
  }

  // Row dividers (horizontal, per column): y = slope * x + intercept
  for (const columnRows of rowDividers) {
    for (const divider of columnRows) {
      const x1 = divider.start;
      const x2 = divider.end;
      const y1 = divider.slope * x1 + divider.intercept;
      const y2 = divider.slope * x2 + divider.intercept;
      lines.push(
        `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(128,128,128,0.8)" stroke-width="2" stroke-dasharray="4,4" />`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">\n${lines.join('\n')}\n</svg>`;
}

/** Generate SVG string for lasso polygon overlays. */
export function generateLassoSvg(
  lassoPolygons: { x: number; y: number }[][],
  canvasWidth: number,
  canvasHeight: number,
): string {
  const polygons: string[] = [];

  for (let i = 0; i < lassoPolygons.length; i++) {
    const polygon = lassoPolygons[i];
    if (polygon.length < 3) continue;

    const hue = LASSO_HUES[i % LASSO_HUES.length];
    const pointsStr = polygon.map(p => `${p.x},${p.y}`).join(' ');

    polygons.push(
      `  <polygon points="${pointsStr}" fill="hsla(${hue},55%,78%,0.15)" stroke="hsla(${hue},55%,78%,0.7)" stroke-width="2" stroke-dasharray="6,4" />`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">\n${polygons.join('\n')}\n</svg>`;
}
