// Transparent raster-layer generation for completed image-editor shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function rasterizeBounds(minX, minY, maxX, maxY, state, bounds, draw) {
    const padding = Math.ceil(state.lineWidth / 2) + 2;
    const left = Math.max(0, Math.floor(minX - padding));
    const top = Math.max(0, Math.floor(minY - padding));
    const right = Math.min(bounds.width, Math.ceil(maxX + padding));
    const bottom = Math.min(bounds.height, Math.ceil(maxY + padding));
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.translate(-left, -top);
    draw(context);
    return { imageData: context.getImageData(0, 0, width, height), rect: { x: left, y: top, width, height } };
  }

  /** Rasterize a completed drag-defined shape into a transparent floating layer. */
  function rasterizeShapeLayer(tool, start, end, state, bounds) {
    return rasterizeBounds(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.max(start.x, end.x),
      Math.max(start.y, end.y),
      state,
      bounds,
      (context) => namespace.drawShape(context, tool, start, end, state)
    );
  }

  /** Rasterize a completed polygon into a transparent floating layer. */
  function rasterizePolygonLayer(points, state, bounds) {
    if (!points?.length) return null;
    return rasterizeBounds(
      Math.min(...points.map((point) => point.x)),
      Math.min(...points.map((point) => point.y)),
      Math.max(...points.map((point) => point.x)),
      Math.max(...points.map((point) => point.y)),
      state,
      bounds,
      (context) => namespace.drawPolygon(context, points, state, true)
    );
  }

  /** Rasterize an edited rounded rectangle into a transparent floating layer. */
  function rasterizeRoundedRectangleLayer(model, state, bounds) {
    if (!model?.rect) return null;
    const { rect } = model;
    return rasterizeBounds(
      rect.x,
      rect.y,
      rect.x + rect.width,
      rect.y + rect.height,
      state,
      bounds,
      (context) => namespace.drawRoundedRectangle(context, rect, model.radii, state)
    );
  }

  Object.assign(namespace, { rasterizeShapeLayer, rasterizePolygonLayer, rasterizeRoundedRectangleLayer });
})(typeof window !== "undefined" ? window : globalThis);
