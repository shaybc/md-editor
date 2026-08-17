// Scalable contours for cloud and teardrop shapes in the image editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const ORGANIC_SHAPE_TOOLS = Object.freeze(["cloud-cluster", "cloud", "teardrop", "curved-teardrop"]);

  const traceCloudCluster = (context, point) => {
    context.moveTo(...point(0.14, 0.36));
    context.bezierCurveTo(...point(0.05, 0.32), ...point(0.04, 0.22), ...point(0.15, 0.18));
    context.bezierCurveTo(...point(0.14, 0.10), ...point(0.25, 0.04), ...point(0.36, 0.08));
    context.bezierCurveTo(...point(0.45, 0.00), ...point(0.60, 0.01), ...point(0.66, 0.11));
    context.bezierCurveTo(...point(0.79, 0.07), ...point(0.91, 0.15), ...point(0.89, 0.27));
    context.bezierCurveTo(...point(0.99, 0.33), ...point(0.98, 0.44), ...point(0.90, 0.50));
    context.bezierCurveTo(...point(0.91, 0.61), ...point(0.78, 0.68), ...point(0.66, 0.62));
    context.bezierCurveTo(...point(0.57, 0.70), ...point(0.43, 0.70), ...point(0.35, 0.62));
    context.bezierCurveTo(...point(0.22, 0.68), ...point(0.10, 0.61), ...point(0.11, 0.51));
    context.bezierCurveTo(...point(0.01, 0.48), ...point(0.02, 0.39), ...point(0.14, 0.36));
    context.closePath();
  };

  const traceCloud = (context, point) => {
    context.moveTo(...point(0.11, 0.72));
    context.bezierCurveTo(...point(0.02, 0.72), ...point(0.00, 0.59), ...point(0.07, 0.51));
    context.bezierCurveTo(...point(0.03, 0.39), ...point(0.14, 0.29), ...point(0.26, 0.33));
    context.bezierCurveTo(...point(0.31, 0.14), ...point(0.46, 0.07), ...point(0.59, 0.15));
    context.bezierCurveTo(...point(0.68, 0.20), ...point(0.73, 0.29), ...point(0.72, 0.39));
    context.bezierCurveTo(...point(0.85, 0.32), ...point(0.96, 0.42), ...point(0.95, 0.54));
    context.bezierCurveTo(...point(1.00, 0.61), ...point(0.95, 0.72), ...point(0.86, 0.72));
    context.lineTo(...point(0.11, 0.72));
    context.closePath();
  };

  const traceTeardrop = (context, point) => {
    context.moveTo(...point(0.50, 0.00));
    context.bezierCurveTo(...point(0.43, 0.19), ...point(0.20, 0.56), ...point(0.20, 0.73));
    context.bezierCurveTo(...point(0.20, 0.91), ...point(0.33, 1.00), ...point(0.50, 1.00));
    context.bezierCurveTo(...point(0.67, 1.00), ...point(0.80, 0.91), ...point(0.80, 0.73));
    context.bezierCurveTo(...point(0.80, 0.56), ...point(0.57, 0.19), ...point(0.50, 0.00));
    context.closePath();
  };

  const traceCurvedTeardrop = (context, point) => {
    context.moveTo(...point(0.36, 0.00));
    context.bezierCurveTo(...point(0.43, 0.18), ...point(0.52, 0.33), ...point(0.62, 0.49));
    context.bezierCurveTo(...point(0.74, 0.68), ...point(0.72, 0.84), ...point(0.61, 0.94));
    context.bezierCurveTo(...point(0.49, 1.01), ...point(0.29, 1.00), ...point(0.17, 0.92));
    context.bezierCurveTo(...point(0.04, 0.83), ...point(0.05, 0.68), ...point(0.16, 0.54));
    context.bezierCurveTo(...point(0.34, 0.34), ...point(0.39, 0.18), ...point(0.36, 0.00));
    context.closePath();
  };

  const SHAPE_TRACERS = Object.freeze({
    "cloud-cluster": Object.freeze({ trace: traceCloudCluster, minX: 0.01, minY: 0.00, maxX: 0.99, maxY: 0.70 }),
    cloud: Object.freeze({ trace: traceCloud, minX: 0.00, minY: 0.07, maxX: 1.00, maxY: 0.72 }),
    teardrop: Object.freeze({ trace: traceTeardrop, minX: 0.20, minY: 0.00, maxX: 0.80, maxY: 1.00 }),
    "curved-teardrop": Object.freeze({ trace: traceCurvedTeardrop, minX: 0.04, minY: 0.00, maxX: 0.74, maxY: 1.01 })
  });

  /**
   * Trace one supported organic silhouette inside the rectangle defined by two drag points.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the shape contour.
   * @param {string} tool - Cloud or teardrop tool identifier.
   * @param {{x:number,y:number}} start - First drag point in image pixels.
   * @param {{x:number,y:number}} end - Current or final drag point in image pixels.
   * @returns {boolean} Whether a supported contour was traced.
   */
  function traceOrganicShape(context, tool, start, end) {
    const definition = SHAPE_TRACERS[tool];
    if (!definition) return false;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.max(1, Math.abs(end.x - start.x));
    const height = Math.max(1, Math.abs(end.y - start.y));
    const normalizedWidth = definition.maxX - definition.minX;
    const normalizedHeight = definition.maxY - definition.minY;
    const point = (x, y) => [
      left + width * (x - definition.minX) / normalizedWidth,
      top + height * (y - definition.minY) / normalizedHeight
    ];
    definition.trace(context, point);
    return true;
  }

  Object.assign(namespace, { organicShapeTools: ORGANIC_SHAPE_TOOLS, traceOrganicShape });
})(typeof window !== "undefined" ? window : globalThis);
