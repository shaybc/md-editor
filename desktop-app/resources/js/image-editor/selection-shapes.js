// Geometry and pixel masking for image-editor marquee selection shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const SHAPES = Object.freeze(["rectangle", "ellipse", "triangle", "lasso"]);

  /** Normalize an image-editor selection shape identifier. */
  function normalizeSelectionShape(shape) {
    return SHAPES.includes(shape) ? shape : "rectangle";
  }

  function localPoint(region, point) {
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    const rotation = -(Number(region.rotation) || 0);
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return {
      x: centerX + dx * cosine - dy * sine,
      y: centerY + dx * sine + dy * cosine
    };
  }

  function polygonContains(points, x, y) {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
      const first = points[index];
      const second = points[previous];
      if (((first.y > y) !== (second.y > y)) &&
          x < (second.x - first.x) * (y - first.y) / ((second.y - first.y) || Number.EPSILON) + first.x) inside = !inside;
    }
    return inside;
  }

  function normalizedPolygon(region) {
    if (normalizeSelectionShape(region.shape) === "triangle") return [{ x: .5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    return Array.isArray(region.points) ? region.points : [];
  }

  /** Determine whether a canvas point belongs to a shaped selection region. */
  function selectionRegionContains(region, point) {
    if (!region || region.width <= 0 || region.height <= 0) return false;
    const local = localPoint(region, point);
    const x = (local.x - region.x) / region.width;
    const y = (local.y - region.y) / region.height;
    let inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    const shape = normalizeSelectionShape(region.shape);
    if (inside && shape === "ellipse") inside = ((x - .5) / .5) ** 2 + ((y - .5) / .5) ** 2 <= 1;
    else if (inside && (shape === "triangle" || shape === "lasso")) {
      const points = normalizedPolygon(region);
      inside = points.length >= 3 && polygonContains(points, x, y);
    }
    return region.inverted ? !inside : inside;
  }

  /** Make pixels outside the shaped selection transparent. */
  function maskSelectionImageData(imageData, region) {
    if (!imageData || !region) return imageData;
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const canvasPoint = { x: region.x + x + .5, y: region.y + y + .5 };
        if (selectionRegionContains({ ...region, rotation: 0, inverted: false }, canvasPoint)) continue;
        imageData.data[(y * imageData.width + x) * 4 + 3] = 0;
      }
    }
    return imageData;
  }

  /** Trace a selection shape in its canvas position and rotation. */
  function paintSelectionRegion(context, region, operation) {
    const shape = normalizeSelectionShape(region.shape);
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    context.save();
    context.translate(centerX, centerY);
    context.rotate(Number(region.rotation) || 0);
    context.translate(-centerX, -centerY);
    context.beginPath();
    if (shape === "ellipse") context.ellipse(centerX, centerY, region.width / 2, region.height / 2, 0, 0, Math.PI * 2);
    else if (shape === "triangle" || shape === "lasso") {
      const points = normalizedPolygon(region);
      points.forEach((point, index) => {
        const x = region.x + point.x * region.width;
        const y = region.y + point.y * region.height;
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.closePath();
    } else context.rect(region.x, region.y, region.width, region.height);
    context[operation]();
    context.restore();
  }

  /** Trace a selection shape in its canvas position and rotation. */
  function traceSelectionRegion(context, region) {
    paintSelectionRegion(context, region, "stroke");
  }

  /** Paint only the pixels covered by a shaped selection region. */
  function fillSelectionRegion(context, region, color) {
    if (normalizeSelectionShape(region.shape) === "rectangle" && !(Number(region.rotation) || 0)) {
      context.fillStyle = color;
      context.fillRect(region.x, region.y, region.width, region.height);
      return;
    }
    context.fillStyle = color;
    paintSelectionRegion(context, region, "fill");
  }

  namespace.ImageEditorSelectionShapes = {
    normalize: normalizeSelectionShape,
    contains: selectionRegionContains,
    maskImageData: maskSelectionImageData,
    trace: traceSelectionRegion,
    fill: fillSelectionRegion
  };
})(typeof window !== "undefined" ? window : globalThis);
