// Scalable geometry for drag-defined image-editor star shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const INNER_RADIUS_FACTORS = Object.freeze({ 4: 0.25, 5: 0.45, 6: 0.58 });

  /**
   * Trace a centered star inside the rectangle defined by two drag points.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the star vertices.
   * @param {{x:number,y:number}} start - First drag point in image pixels.
   * @param {{x:number,y:number}} end - Current or final drag point in image pixels.
   * @param {number} requestedPointCount - Supported outer-point count: 4, 5, or 6.
   */
  function traceStar(context, start, end, requestedPointCount) {
    const pointCount = [4, 5, 6].includes(Number(requestedPointCount)) ? Number(requestedPointCount) : 5;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const radiusX = Math.max(0.5, Math.abs(end.x - start.x) / 2);
    const radiusY = Math.max(0.5, Math.abs(end.y - start.y) / 2);
    const centerX = left + radiusX;
    const centerY = top + radiusY;
    const innerRadiusFactor = INNER_RADIUS_FACTORS[pointCount];
    const vertexCount = pointCount * 2;

    for (let index = 0; index < vertexCount; index += 1) {
      const radiusFactor = index % 2 === 0 ? 1 : innerRadiusFactor;
      const angle = -Math.PI / 2 + index * Math.PI / pointCount;
      const x = centerX + Math.cos(angle) * radiusX * radiusFactor;
      const y = centerY + Math.sin(angle) * radiusY * radiusFactor;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }

  namespace.traceStar = traceStar;
})(typeof window !== "undefined" ? window : globalThis);
