// Pure cubic path geometry for the image editor's editable Path tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clonePoint(point) {
    return point ? { x: point.x, y: point.y } : null;
  }

  function lerp(first, second, ratio) {
    return {
      x: first.x + (second.x - first.x) * ratio,
      y: first.y + (second.y - first.y) * ratio
    };
  }

  function segmentControls(startAnchor, endAnchor) {
    return [
      startAnchor.point,
      startAnchor.outHandle || startAnchor.point,
      endAnchor.inHandle || endAnchor.point,
      endAnchor.point
    ];
  }

  /** Evaluate a cubic path segment at a normalized parameter. */
  function pathPointAt(startAnchor, endAnchor, ratio) {
    const [first, control1, control2, end] = segmentControls(startAnchor, endAnchor);
    const inverse = 1 - ratio;
    return {
      x: inverse ** 3 * first.x + 3 * inverse ** 2 * ratio * control1.x + 3 * inverse * ratio ** 2 * control2.x + ratio ** 3 * end.x,
      y: inverse ** 3 * first.y + 3 * inverse ** 2 * ratio * control1.y + 3 * inverse * ratio ** 2 * control2.y + ratio ** 3 * end.y
    };
  }

  /** Find the nearest sampled path segment and parameter within a canvas tolerance. */
  function nearestPathSegment(anchors, closed, point, tolerance) {
    const segmentCount = closed ? anchors.length : anchors.length - 1;
    let nearest = null;
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const start = anchors[segmentIndex];
      const end = anchors[(segmentIndex + 1) % anchors.length];
      for (let sample = 0; sample <= 60; sample += 1) {
        const ratio = sample / 60;
        const candidate = pathPointAt(start, end, ratio);
        const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (distance <= tolerance && (!nearest || distance < nearest.distance)) {
          nearest = { segmentIndex, ratio, point: candidate, distance };
        }
      }
    }
    return nearest;
  }

  /** Split one cubic segment without changing the path's rendered shape. */
  function splitPathSegment(anchors, segmentIndex, ratio, closed) {
    const endIndex = (segmentIndex + 1) % anchors.length;
    if (!closed && endIndex === 0) return -1;
    const start = anchors[segmentIndex];
    const end = anchors[endIndex];
    const [first, control1, control2, last] = segmentControls(start, end);
    const firstSplit = lerp(first, control1, ratio);
    const middleSplit = lerp(control1, control2, ratio);
    const lastSplit = lerp(control2, last, ratio);
    const firstInner = lerp(firstSplit, middleSplit, ratio);
    const lastInner = lerp(middleSplit, lastSplit, ratio);
    const pathPoint = lerp(firstInner, lastInner, ratio);
    start.outHandle = clonePoint(firstSplit);
    end.inHandle = clonePoint(lastSplit);
    const anchor = { point: pathPoint, inHandle: firstInner, outHandle: lastInner, smooth: true };
    const insertionIndex = endIndex === 0 ? anchors.length : endIndex;
    anchors.splice(insertionIndex, 0, anchor);
    return insertionIndex;
  }

  /** Calculate sampled bounds for anchors and their curved segments. */
  function pathBounds(anchors, closed) {
    const points = anchors.map((anchor) => anchor.point);
    const segmentCount = closed ? anchors.length : Math.max(0, anchors.length - 1);
    for (let index = 0; index < segmentCount; index += 1) {
      for (let sample = 1; sample < 40; sample += 1) {
        points.push(pathPointAt(anchors[index], anchors[(index + 1) % anchors.length], sample / 40));
      }
    }
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  /** Constrain a pointer to 45-degree increments around an origin. */
  function constrainPathPoint(origin, point) {
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
    const constrainedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: origin.x + Math.cos(constrainedAngle) * distance, y: origin.y + Math.sin(constrainedAngle) * distance };
  }

  Object.assign(namespace, { pathPointAt, nearestPathSegment, splitPathSegment, pathBounds, constrainPathPoint });
})(typeof window !== "undefined" ? window : globalThis);
