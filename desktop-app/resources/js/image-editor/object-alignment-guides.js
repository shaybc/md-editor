// Pure alignment and snapping calculations for Move-tool object gestures.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const AXIS_ANCHORS = Object.freeze({
    x: Object.freeze([
      Object.freeze({ name: "start", value: (bounds) => bounds.x }),
      Object.freeze({ name: "center", value: (bounds) => bounds.x + bounds.width / 2 }),
      Object.freeze({ name: "end", value: (bounds) => bounds.x + bounds.width })
    ]),
    y: Object.freeze([
      Object.freeze({ name: "start", value: (bounds) => bounds.y }),
      Object.freeze({ name: "center", value: (bounds) => bounds.y + bounds.height / 2 }),
      Object.freeze({ name: "end", value: (bounds) => bounds.y + bounds.height })
    ])
  });
  const EXACT_ALIGNMENT_EPSILON = 0.01;

  function movedBounds(bounds, deltaX, deltaY) {
    return { x: bounds.x + deltaX, y: bounds.y + deltaY, width: bounds.width, height: bounds.height };
  }

  function closestAxisCorrection(bounds, targets, axis, threshold) {
    let best = null;
    AXIS_ANCHORS[axis].forEach((movingAnchor) => {
      const movingValue = movingAnchor.value(bounds);
      targets.forEach((target) => {
        AXIS_ANCHORS[axis].forEach((targetAnchor) => {
          const correction = targetAnchor.value(target) - movingValue;
          const distance = Math.abs(correction);
          if (distance > threshold) return;
          const sameAnchorPriority = movingAnchor.name === targetAnchor.name ? 0 : 1;
          if (!best || distance < best.distance ||
              (distance === best.distance && sameAnchorPriority < best.sameAnchorPriority)) {
            best = { correction, distance, sameAnchorPriority };
          }
        });
      });
    });
    return best?.correction || 0;
  }

  function alignedGuides(bounds, targets, axis) {
    const orientation = axis === "x" ? "vertical" : "horizontal";
    const guides = new Map();
    AXIS_ANCHORS[axis].forEach((movingAnchor) => {
      const movingValue = movingAnchor.value(bounds);
      targets.forEach((target) => {
        AXIS_ANCHORS[axis].forEach((targetAnchor) => {
          const position = targetAnchor.value(target);
          if (Math.abs(position - movingValue) > EXACT_ALIGNMENT_EPSILON) return;
          const key = position.toFixed(4);
          const movingStart = axis === "x" ? bounds.y : bounds.x;
          const movingEnd = movingStart + (axis === "x" ? bounds.height : bounds.width);
          const targetStart = axis === "x" ? target.y : target.x;
          const targetEnd = targetStart + (axis === "x" ? target.height : target.width);
          const existing = guides.get(key);
          if (existing) {
            existing.start = Math.min(existing.start, movingStart, targetStart);
            existing.end = Math.max(existing.end, movingEnd, targetEnd);
          } else {
            guides.set(key, {
              orientation,
              position,
              start: Math.min(movingStart, targetStart),
              end: Math.max(movingEnd, targetEnd)
            });
          }
        });
      });
    });
    return [...guides.values()];
  }

  /**
   * Snap translated selection bounds to visible reference-object edges and centers.
   * @param {{x:number,y:number,width:number,height:number}} selectionBounds - Combined bounds at drag start.
   * @param {{x:number,y:number}} requestedDelta - Unsnapped pointer translation in canvas pixels.
   * @param {Array<{x:number,y:number,width:number,height:number}>} targets - Other visible object bounds.
   * @param {number} threshold - Maximum snapping distance in canvas pixels.
   * @returns {{deltaX:number,deltaY:number,bounds:object,guides:Array<object>}} Snapped translation and exact guide spans.
   */
  function resolveObjectAlignment(selectionBounds, requestedDelta, targets, threshold) {
    const references = Array.isArray(targets) ? targets : [];
    const maximumDistance = Math.max(0, Number(threshold) || 0);
    const rawDeltaX = Number(requestedDelta?.x) || 0;
    const rawDeltaY = Number(requestedDelta?.y) || 0;
    const rawBounds = movedBounds(selectionBounds, rawDeltaX, rawDeltaY);
    const deltaX = rawDeltaX + closestAxisCorrection(rawBounds, references, "x", maximumDistance);
    const deltaY = rawDeltaY + closestAxisCorrection(rawBounds, references, "y", maximumDistance);
    const bounds = movedBounds(selectionBounds, deltaX, deltaY);
    return {
      deltaX,
      deltaY,
      bounds,
      guides: alignedGuides(bounds, references, "x").concat(alignedGuides(bounds, references, "y"))
    };
  }

  namespace.resolveObjectAlignment = resolveObjectAlignment;
})(typeof window !== "undefined" ? window : globalThis);
