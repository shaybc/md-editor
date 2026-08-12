// Scalable geometry for drag-defined image-editor star shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const INNER_RADIUS_FACTORS = Object.freeze({ 4: 0.25, 5: 0.45, 6: 0.58 });

  function normalizedPointCount(value) {
    return Math.max(3, Math.min(60, Math.round(Number(value) || 5)));
  }

  function defaultInnerRatio(pointCount) {
    return INNER_RADIUS_FACTORS[pointCount] || 0.45;
  }

  function starVertices(start, end, requestedPointCount, requestedInnerRatio) {
    const pointCount = normalizedPointCount(requestedPointCount);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const radiusX = Math.max(0.5, Math.abs(end.x - start.x) / 2);
    const radiusY = Math.max(0.5, Math.abs(end.y - start.y) / 2);
    const center = { x: left + radiusX, y: top + radiusY };
    const innerRatio = Math.max(0.05, Math.min(0.95,
      Number.isFinite(Number(requestedInnerRatio)) ? Number(requestedInnerRatio) : defaultInnerRatio(pointCount)
    ));
    const vertices = [];
    for (let index = 0; index < pointCount * 2; index += 1) {
      const radiusFactor = index % 2 === 0 ? 1 : innerRatio;
      const angle = -Math.PI / 2 + index * Math.PI / pointCount;
      vertices.push({
        x: center.x + Math.cos(angle) * radiusX * radiusFactor,
        y: center.y + Math.sin(angle) * radiusY * radiusFactor
      });
    }
    return { pointCount, innerRatio, center, radiusX, radiusY, vertices };
  }

  /**
   * Trace a centered star inside the rectangle defined by two drag points.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the star vertices.
   * @param {{x:number,y:number}} start - First drag point in image pixels.
   * @param {{x:number,y:number}} end - Current or final drag point in image pixels.
   * @param {number} requestedPointCount - Outer-point count from 3 through 60.
   * @param {number} requestedInnerRatio - Inner vertex distance as a fraction of outer radius.
   * @param {number} requestedCornerRadius - Rounding distance applied at every vertex.
   */
  function traceStar(context, start, end, requestedPointCount, requestedInnerRatio, requestedCornerRadius = 0) {
    const model = starVertices(start, end, requestedPointCount, requestedInnerRatio);
    const cornerRadius = Math.max(0, Number(requestedCornerRadius) || 0);
    const corners = model.vertices.map((vertex, index, vertices) => {
      const previous = vertices[(index - 1 + vertices.length) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const previousLength = Math.hypot(previous.x - vertex.x, previous.y - vertex.y);
      const nextLength = Math.hypot(next.x - vertex.x, next.y - vertex.y);
      const distance = Math.min(cornerRadius, previousLength / 2, nextLength / 2);
      const toward = (target, length) => ({
        x: vertex.x + (target.x - vertex.x) * distance / Math.max(0.001, length),
        y: vertex.y + (target.y - vertex.y) * distance / Math.max(0.001, length)
      });
      return { vertex, entry: toward(previous, previousLength), exit: toward(next, nextLength), distance };
    });
    context.moveTo(corners[0].entry.x, corners[0].entry.y);
    corners.forEach((corner, index) => {
      if (corner.distance > 0) context.quadraticCurveTo(corner.vertex.x, corner.vertex.y, corner.exit.x, corner.exit.y);
      else context.lineTo(corner.vertex.x, corner.vertex.y);
      const next = corners[(index + 1) % corners.length];
      context.lineTo(next.entry.x, next.entry.y);
    });
    context.closePath();
  }

  namespace.starVertices = starVertices;
  namespace.defaultStarInnerRatio = defaultInnerRatio;
  namespace.traceStar = traceStar;
})(typeof window !== "undefined" ? window : globalThis);
