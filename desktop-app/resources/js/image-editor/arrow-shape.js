// Scalable geometry for directional block-arrow shapes in the image editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const DIRECTIONS = Object.freeze(["up", "down", "left", "right"]);
  const HEAD_ANGLES = Object.freeze([30, 45, 60, 90]);
  const MAXIMUM_HEAD_LENGTH_FACTOR = 0.62;
  const SHAFT_HALF_WIDTH_FACTOR = 0.46;

  /**
   * Trace a directional block arrow inside the rectangle defined by two drag points.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the arrow vertices.
   * @param {{x:number,y:number}} start - First drag point in image pixels.
   * @param {{x:number,y:number}} end - Current or final drag point in image pixels.
   * @param {string} requestedDirection - Supported direction: up, down, left, or right.
   * @param {number} requestedHeadAngle - Included arrowhead angle in degrees.
   */
  function traceArrow(context, start, end, requestedDirection, requestedHeadAngle) {
    const direction = DIRECTIONS.includes(requestedDirection) ? requestedDirection : "right";
    const numericAngle = Number(requestedHeadAngle);
    const headAngle = HEAD_ANGLES.includes(numericAngle) ? numericAngle : 90;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.max(1, Math.abs(end.x - start.x));
    const height = Math.max(1, Math.abs(end.y - start.y));
    const vertical = direction === "up" || direction === "down";
    const length = vertical ? height : width;
    const crossSpan = vertical ? width : height;
    const tangent = Math.tan(headAngle * Math.PI / 360);
    const maximumHeadLength = length * MAXIMUM_HEAD_LENGTH_FACTOR;
    const headHalfWidth = Math.min(crossSpan / 2, maximumHeadLength * tangent);
    const headLength = headHalfWidth / tangent;
    const shaftHalfWidth = Math.max(0.5, headHalfWidth * SHAFT_HALF_WIDTH_FACTOR);
    const headBase = length - headLength;
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const mapPoint = (forward, cross) => {
      if (direction === "left") return { x: left + width - forward, y: centerY + cross };
      if (direction === "up") return { x: centerX + cross, y: top + height - forward };
      if (direction === "down") return { x: centerX + cross, y: top + forward };
      return { x: left + forward, y: centerY + cross };
    };
    const points = [
      mapPoint(0, -shaftHalfWidth),
      mapPoint(headBase, -shaftHalfWidth),
      mapPoint(headBase, -headHalfWidth),
      mapPoint(length, 0),
      mapPoint(headBase, headHalfWidth),
      mapPoint(headBase, shaftHalfWidth),
      mapPoint(0, shaftHalfWidth)
    ];
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
  }

  namespace.traceArrow = traceArrow;
})(typeof window !== "undefined" ? window : globalThis);
