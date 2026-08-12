// Rotation geometry and transformed rendering for image editor selections.
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

  function selectionGuidePoints(rect, angle, offset = 0) {
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
      points[handle] = rotatePoint(points[handle], center, angle);
    });
    return points;
  }

  function containsPoint(rect, angle, point) {
    const local = rotatePoint(point, centerOfRect(rect), -angle);
    return local.x >= rect.x && local.x <= rect.x + rect.width &&
      local.y >= rect.y && local.y <= rect.y + rect.height;
  }

  function resizePointInSelectionSpace(rect, angle, point) {
    return rotatePoint(point, centerOfRect(rect), -angle);
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

  function drawImage(context, image, rect, angle) {
    const center = centerOfRect(rect);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(angle);
    context.drawImage(image, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    context.restore();
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
    selectionGuidePoints,
    containsPoint,
    resizePointInSelectionSpace,
    positionResizedRect,
    drawImage,
    strokeRect
  };
})(typeof window !== "undefined" ? window : globalThis);
