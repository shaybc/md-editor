// Rotation and skew geometry for transformed image editor selections.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function centerOfRect(rect) {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  function rotatePoint(point, center, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = point.x - center.x;
    const y = point.y - center.y;
    return {
      x: center.x + x * cosine - y * sine,
      y: center.y + x * sine + y * cosine
    };
  }

  function normalizeSkew(skew) {
    return {
      x: Number(skew?.x) || 0,
      y: Number(skew?.y) || 0
    };
  }

  function skewPoint(point, center, skew) {
    const normalized = normalizeSkew(skew);
    const x = point.x - center.x;
    const y = point.y - center.y;
    return {
      x: center.x + x + normalized.x * y,
      y: center.y + normalized.y * x + y
    };
  }

  function unskewPoint(point, center, skew) {
    const normalized = normalizeSkew(skew);
    const determinant = 1 - normalized.x * normalized.y;
    if (Math.abs(determinant) < .0001) return { ...point };
    const x = point.x - center.x;
    const y = point.y - center.y;
    return {
      x: center.x + (x - normalized.x * y) / determinant,
      y: center.y + (y - normalized.y * x) / determinant
    };
  }

  /** Apply the selection's affine skew followed by its free rotation. */
  function applyContextTransform(context, rect, angle, skew) {
    const center = centerOfRect(rect);
    const normalized = normalizeSkew(skew);
    context.translate(center.x, center.y);
    context.rotate(angle);
    context.transform(1, normalized.y, normalized.x, 1, 0, 0);
    context.translate(-center.x, -center.y);
  }

  function selectionGuidePoints(rect, angle, offset = 0, skew = null) {
    const center = centerOfRect(rect);
    const points = {
      nw: { x: rect.x - offset, y: rect.y - offset },
      n: { x: center.x, y: rect.y - offset },
      ne: { x: rect.x + rect.width + offset, y: rect.y - offset },
      e: { x: rect.x + rect.width + offset, y: center.y },
      se: { x: rect.x + rect.width + offset, y: rect.y + rect.height + offset },
      s: { x: center.x, y: rect.y + rect.height + offset },
      sw: { x: rect.x - offset, y: rect.y + rect.height + offset },
      w: { x: rect.x - offset, y: center.y }
    };
    Object.keys(points).forEach((handle) => {
      points[handle] = rotatePoint(skewPoint(points[handle], center, skew), center, angle);
    });
    return points;
  }

  function pointInSelectionSpace(rect, angle, skew, point) {
    const center = centerOfRect(rect);
    return unskewPoint(rotatePoint(point, center, -angle), center, skew);
  }

  function containsPoint(rect, angle, point, skew = null) {
    const local = pointInSelectionSpace(rect, angle, skew, point);
    return local.x >= rect.x && local.x <= rect.x + rect.width &&
      local.y >= rect.y && local.y <= rect.y + rect.height;
  }

  function resizePointInSelectionSpace(rect, angle, point, skew = null) {
    return pointInSelectionSpace(rect, angle, skew, point);
  }

  function positionResizedRect(rect, resizedRect, angle) {
    const originalCenter = centerOfRect(rect);
    const localCenter = centerOfRect(resizedRect);
    const canvasCenter = rotatePoint(localCenter, originalCenter, angle);
    return {
      x: canvasCenter.x - resizedRect.width / 2,
      y: canvasCenter.y - resizedRect.height / 2,
      width: resizedRect.width,
      height: resizedRect.height
    };
  }

  function drawImage(context, image, rect, angle, skew = null) {
    context.save();
    applyContextTransform(context, rect, angle, skew);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }

  /** Rasterize an affine skew so the transformed pixels remain portable between layers. */
  function rasterizeSkewedImageData(imageData, skew) {
    const normalized = normalizeSkew(skew);
    if ((!normalized.x && !normalized.y) || !global.document?.createElement) {
      return { imageData, width: imageData.width, height: imageData.height };
    }
    const source = global.document.createElement('canvas');
    source.width = imageData.width;
    source.height = imageData.height;
    source.getContext('2d').putImageData(imageData, 0, 0);
    const center = { x: 0, y: 0 };
    const halfWidth = imageData.width / 2;
    const halfHeight = imageData.height / 2;
    const corners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight }
    ].map((point) => skewPoint(point, center, normalized));
    const minimumX = Math.min(...corners.map((point) => point.x));
    const minimumY = Math.min(...corners.map((point) => point.y));
    const maximumX = Math.max(...corners.map((point) => point.x));
    const maximumY = Math.max(...corners.map((point) => point.y));
    const width = Math.max(1, Math.ceil(maximumX - minimumX));
    const height = Math.max(1, Math.ceil(maximumY - minimumY));
    const output = global.document.createElement('canvas');
    output.width = width;
    output.height = height;
    const context = output.getContext('2d');
    context.translate(-minimumX, -minimumY);
    context.transform(1, normalized.y, normalized.x, 1, 0, 0);
    context.drawImage(source, -halfWidth, -halfHeight);
    return { imageData: context.getImageData(0, 0, width, height), width, height };
  }

  function strokeRect(context, rect, angle) {
    const center = centerOfRect(rect);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(angle);
    context.strokeRect(-rect.width / 2 + 0.5, -rect.height / 2 + 0.5, rect.width, rect.height);
    context.restore();
  }

  namespace.ImageEditorSelectionTransform = {
    centerOfRect,
    rotatePoint,
    normalizeSkew,
    skewPoint,
    pointInSelectionSpace,
    applyContextTransform,
    selectionGuidePoints,
    containsPoint,
    resizePointInSelectionSpace,
    positionResizedRect,
    drawImage,
    rasterizeSkewedImageData,
    strokeRect
  };
})(typeof window !== "undefined" ? window : globalThis);
