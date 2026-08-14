// Geometry and pixel masking for image-editor marquee selection shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const SHAPES = Object.freeze(["rectangle", "ellipse", "triangle", "lasso", "color-range"]);

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

  function colorRangeStrength(region, point) {
    const local = localPoint(region, point);
    const x = (local.x - region.x) / region.width;
    const y = (local.y - region.y) / region.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return region.inverted ? 1 : 0;
    const width = Math.max(1, Number(region.maskWidth) || 1);
    const height = Math.max(1, Number(region.maskHeight) || 1);
    const column = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
    const row = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
    const strength = (region.mask?.[row * width + column] || 0) / 255;
    return region.inverted ? 1 - strength : strength;
  }

  /** Return the fractional membership of a canvas point in a shaped selection. */
  function selectionRegionStrength(region, point) {
    if (!region || region.width <= 0 || region.height <= 0) return false;
    if (normalizeSelectionShape(region.shape) === "color-range") return colorRangeStrength(region, point);
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
    return region.inverted ? Number(!inside) : Number(inside);
  }

  /** Determine whether a canvas point belongs to a shaped selection region. */
  function selectionRegionContains(region, point) {
    return selectionRegionStrength(region, point) > 0;
  }

  /** Make pixels outside the shaped selection transparent. */
  function maskSelectionImageData(imageData, region) {
    if (!imageData || !region) return imageData;
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const canvasPoint = { x: region.x + x + .5, y: region.y + y + .5 };
        const strength = selectionRegionStrength({ ...region, rotation: 0, inverted: false }, canvasPoint);
        const alphaIndex = (y * imageData.width + x) * 4 + 3;
        imageData.data[alphaIndex] = Math.round(imageData.data[alphaIndex] * strength);
      }
    }
    return imageData;
  }

  /** Trace a selection shape in its canvas position and rotation. */
  function paintSelectionRegion(context, region, operation) {
    const shape = normalizeSelectionShape(region.shape);
    if (shape === "color-range") {
      const width = Math.max(1, Number(region.maskWidth) || 1);
      const height = Math.max(1, Number(region.maskHeight) || 1);
      const mask = region.mask || [];
      const centerX = region.x + region.width / 2;
      const centerY = region.y + region.height / 2;
      context.save();
      context.translate(centerX, centerY);
      context.rotate(Number(region.rotation) || 0);
      context.translate(-centerX, -centerY);
      context.beginPath();
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if ((mask[y * width + x] || 0) < 128) continue;
          const left = region.x + x * region.width / width;
          const top = region.y + y * region.height / height;
          const right = region.x + (x + 1) * region.width / width;
          const bottom = region.y + (y + 1) * region.height / height;
          if (x === 0 || (mask[y * width + x - 1] || 0) < 128) { context.moveTo(left, top); context.lineTo(left, bottom); }
          if (x === width - 1 || (mask[y * width + x + 1] || 0) < 128) { context.moveTo(right, top); context.lineTo(right, bottom); }
          if (y === 0 || (mask[(y - 1) * width + x] || 0) < 128) { context.moveTo(left, top); context.lineTo(right, top); }
          if (y === height - 1 || (mask[(y + 1) * width + x] || 0) < 128) { context.moveTo(left, bottom); context.lineTo(right, bottom); }
        }
      }
      context[operation]();
      context.restore();
      return;
    }
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
    if (normalizeSelectionShape(region.shape) === "color-range") {
      const pixels = context.getImageData(region.x, region.y, region.width, region.height);
      const replacement = /^#([0-9a-f]{6})$/i.exec(color || "#ffffff");
      const rgb = replacement ? [0, 1, 2].map((index) => parseInt(replacement[1].slice(index * 2, index * 2 + 2), 16)) : [255, 255, 255];
      for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
          const strength = selectionRegionStrength({ ...region, rotation: 0 }, { x: region.x + x + .5, y: region.y + y + .5 });
          if (!strength) continue;
          const index = (y * pixels.width + x) * 4;
          pixels.data[index] = rgb[0];
          pixels.data[index + 1] = rgb[1];
          pixels.data[index + 2] = rgb[2];
          pixels.data[index + 3] = Math.round(255 * strength);
        }
      }
      context.putImageData(pixels, region.x, region.y);
      return;
    }
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
    strength: selectionRegionStrength,
    contains: selectionRegionContains,
    maskImageData: maskSelectionImageData,
    trace: traceSelectionRegion,
    fill: fillSelectionRegion
  };
})(typeof window !== "undefined" ? window : globalThis);
