// Scalable polygon geometry for image-editor lightning-bolt shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const NORMALIZED_POINTS = Object.freeze([
    [0.39, 0],
    [0.59, 0.28],
    [0.51, 0.33],
    [0.75, 0.55],
    [0.67, 0.59],
    [1, 1],
    [0.47, 0.69],
    [0.56, 0.64],
    [0.24, 0.45],
    [0.35, 0.39],
    [0, 0.2]
  ]);

  /**
   * Trace a diagonal lightning bolt inside the rectangle defined by two drag points.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the bolt vertices.
   * @param {{x:number,y:number}} start - First drag point in image pixels.
   * @param {{x:number,y:number}} end - Current or final drag point in image pixels.
   */
  function traceLightning(context, start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.max(1, Math.abs(end.x - start.x));
    const height = Math.max(1, Math.abs(end.y - start.y));
    NORMALIZED_POINTS.forEach(([normalizedX, normalizedY], index) => {
      const x = left + width * normalizedX;
      const y = top + height * normalizedY;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  }

  namespace.traceLightning = traceLightning;
})(typeof window !== "undefined" ? window : globalThis);
