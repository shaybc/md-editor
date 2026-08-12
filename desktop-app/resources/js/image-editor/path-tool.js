// Pen-style editable anchor and segment workflow for the image editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const GUIDE_SCREEN_SIZE = 6;
  const HIT_SCREEN_RADIUS = 8;

  const clonePoint = (point) => point ? { x: point.x, y: point.y } : null;
  const cloneAnchor = (anchor) => ({
    point: clonePoint(anchor.point),
    inHandle: clonePoint(anchor.inHandle),
    outHandle: clonePoint(anchor.outHandle),
    smooth: anchor.smooth === true
  });
  const interpolate = (first, second, ratio) => ({
    x: first.x + (second.x - first.x) * ratio,
    y: first.y + (second.y - first.y) * ratio
  });

  class ImageEditorPathTool {
    /** Own an editable open or closed path until it becomes a floating raster layer. */
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.anchors.length > 0;
    }

    get model() {
      return this.anchors.length >= 2
        ? { anchors: this.anchors.map(cloneAnchor), closed: this.closed, bounds: namespace.pathBounds(this.anchors, this.closed) }
        : null;
    }

    /** Begin adding or directly adjusting an anchor, handle, or segment. */
    begin(point, state) {
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      const handleHit = this.findDirectionHandle(point);
      if (handleHit) {
        this.selectedAnchorIndex = handleHit.anchorIndex;
        this.startDrag("handle", point, handleHit);
        return { action: "handle", started: true };
      }
      const anchorIndex = this.findAnchor(point);
      if (anchorIndex >= 0) {
        if (!this.closed && anchorIndex === 0 && this.anchors.length >= 3) {
          this.closed = true;
          this.selectedAnchorIndex = 0;
          return { action: "closed", started: false };
        }
        this.selectedAnchorIndex = anchorIndex;
        this.startDrag("anchor", point, { anchorIndex, anchor: cloneAnchor(this.anchors[anchorIndex]) });
        return { action: "anchor", started: true };
      }
      const segment = this.findSegment(point);
      if (segment) {
        this.selectedSegmentIndex = segment.segmentIndex;
        this.selectedAnchorIndex = -1;
        const startIndex = segment.segmentIndex;
        const endIndex = (startIndex + 1) % this.anchors.length;
        this.startDrag("segment", point, {
          segmentIndex: startIndex,
          startIndex,
          endIndex,
          startAnchor: cloneAnchor(this.anchors[startIndex]),
          endAnchor: cloneAnchor(this.anchors[endIndex])
        });
        return { action: "segment", started: true };
      }
      if (this.closed) return { action: this.contains(point) ? "inside" : "outside", started: false };
      const anchor = { point: clonePoint(point), inHandle: null, outHandle: null, smooth: false };
      this.anchors.push(anchor);
      this.selectedAnchorIndex = this.anchors.length - 1;
      this.selectedSegmentIndex = -1;
      this.startDrag("new-anchor", point, { anchorIndex: this.selectedAnchorIndex });
      return { action: "new-anchor", started: true };
    }

    /** Update the active anchor, direction point, or path segment drag. */
    update(point, shiftKey = false) {
      if (!this.drag) return false;
      if (this.drag.kind === "new-anchor") {
        const anchor = this.anchors[this.drag.anchorIndex];
        const target = shiftKey ? namespace.constrainPathPoint(anchor.point, point) : point;
        if (Math.hypot(target.x - anchor.point.x, target.y - anchor.point.y) <= 2 / this.zoom) return true;
        anchor.outHandle = clonePoint(target);
        anchor.inHandle = { x: anchor.point.x * 2 - target.x, y: anchor.point.y * 2 - target.y };
        anchor.smooth = true;
        return true;
      }
      if (this.drag.kind === "handle") {
        const anchor = this.anchors[this.drag.anchorIndex];
        const target = shiftKey ? namespace.constrainPathPoint(anchor.point, point) : point;
        anchor[this.drag.handleName] = clonePoint(target);
        anchor.smooth = Boolean(anchor.inHandle || anchor.outHandle);
        return true;
      }
      const constrainedPoint = shiftKey ? namespace.constrainPathPoint(this.drag.pointerStart, point) : point;
      const delta = { x: constrainedPoint.x - this.drag.pointerStart.x, y: constrainedPoint.y - this.drag.pointerStart.y };
      if (this.drag.kind === "anchor") {
        const original = this.drag.anchor;
        const anchor = this.anchors[this.drag.anchorIndex];
        anchor.point = { x: original.point.x + delta.x, y: original.point.y + delta.y };
        anchor.inHandle = original.inHandle ? { x: original.inHandle.x + delta.x, y: original.inHandle.y + delta.y } : null;
        anchor.outHandle = original.outHandle ? { x: original.outHandle.x + delta.x, y: original.outHandle.y + delta.y } : null;
        return true;
      }
      if (this.drag.kind === "segment") {
        const start = this.anchors[this.drag.startIndex];
        const end = this.anchors[this.drag.endIndex];
        const originalStart = this.drag.startAnchor;
        const originalEnd = this.drag.endAnchor;
        const isCurved = Boolean(originalStart.outHandle || originalEnd.inHandle);
        if (isCurved) {
          const startControl = originalStart.outHandle || interpolate(originalStart.point, originalEnd.point, 1 / 3);
          const endControl = originalEnd.inHandle || interpolate(originalStart.point, originalEnd.point, 2 / 3);
          start.outHandle = { x: startControl.x + delta.x, y: startControl.y + delta.y };
          end.inHandle = { x: endControl.x + delta.x, y: endControl.y + delta.y };
        } else {
          this.translateAnchorFrom(start, originalStart, delta);
          this.translateAnchorFrom(end, originalEnd, delta);
        }
        return true;
      }
      return false;
    }

    /** Finish one pointer adjustment while retaining editable path guides. */
    completeStage(point, shiftKey = false) {
      if (!this.drag) return false;
      this.update(point, shiftKey);
      this.drag = null;
      return true;
    }

    /** Insert an anchor on a segment or toggle a clicked anchor between corner and smooth. */
    doubleClick(point) {
      const anchorIndex = this.findAnchor(point);
      if (anchorIndex >= 0) {
        this.selectedAnchorIndex = anchorIndex;
        this.toggleAnchorKind(anchorIndex);
        return true;
      }
      const segment = this.findSegment(point);
      if (!segment) return false;
      const index = namespace.splitPathSegment(this.anchors, segment.segmentIndex, segment.ratio, this.closed);
      if (index < 0) return false;
      this.selectedAnchorIndex = index;
      this.selectedSegmentIndex = -1;
      return true;
    }

    /** Remove the selected anchor while preserving a drawable path. */
    removeSelectedAnchor() {
      const minimum = this.closed ? 3 : 2;
      if (this.selectedAnchorIndex < 0 || this.anchors.length <= minimum) return false;
      this.anchors.splice(this.selectedAnchorIndex, 1);
      this.selectedAnchorIndex = Math.min(this.selectedAnchorIndex, this.anchors.length - 1);
      return true;
    }

    /** Nudge the selected anchor and both of its direction points. */
    nudgeSelectedAnchor(deltaX, deltaY) {
      if (this.selectedAnchorIndex < 0) return false;
      const anchor = this.anchors[this.selectedAnchorIndex];
      anchor.point.x += deltaX;
      anchor.point.y += deltaY;
      if (anchor.inHandle) { anchor.inHandle.x += deltaX; anchor.inHandle.y += deltaY; }
      if (anchor.outHandle) { anchor.outHandle.x += deltaX; anchor.outHandle.y += deltaY; }
      return true;
    }

    /** Report the editable guide beneath a canvas point for cursor feedback. */
    guideAt(point) {
      const handle = this.findDirectionHandle(point);
      if (handle) return { type: "handle", ...handle };
      const anchorIndex = this.findAnchor(point);
      if (anchorIndex >= 0) return { type: "anchor", anchorIndex };
      const segment = this.findSegment(point);
      return segment ? { type: "segment", ...segment } : null;
    }

    /** Draw the path plus anchor and direction-point editing guides. */
    drawPreview(context, state) {
      if (!this.anchors.length) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      if (this.anchors.length >= 2) this.trace(context, state);
      const size = GUIDE_SCREEN_SIZE / this.zoom;
      const half = size / 2;
      context.save();
      context.lineWidth = 1 / this.zoom;
      context.strokeStyle = "rgba(20, 115, 230, 0.82)";
      this.anchors.forEach((anchor, index) => {
        if (index === this.selectedAnchorIndex) {
          [anchor.inHandle, anchor.outHandle].filter(Boolean).forEach((handle) => {
            context.beginPath();
            context.moveTo(anchor.point.x, anchor.point.y);
            context.lineTo(handle.x, handle.y);
            context.stroke();
            context.fillStyle = "#ffffff";
            context.beginPath();
            context.arc(handle.x, handle.y, half * 0.85, 0, Math.PI * 2);
            context.fill();
            context.stroke();
          });
        }
        context.fillStyle = index === this.selectedAnchorIndex ? "#ffffff" : "rgba(20, 115, 230, 0.78)";
        context.fillRect(anchor.point.x - half, anchor.point.y - half, size, size);
        context.strokeRect(anchor.point.x - half, anchor.point.y - half, size, size);
      });
      context.restore();
    }

    /** Rasterize the accepted path into a tightly bounded transparent floating layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 3;
      const left = Math.max(0, Math.floor(model.bounds.minX - padding));
      const top = Math.max(0, Math.floor(model.bounds.minY - padding));
      const right = Math.min(bounds.width, Math.ceil(model.bounds.maxX + padding));
      const bottom = Math.min(bounds.height, Math.ceil(model.bounds.maxY + padding));
      if (right <= left || bottom <= top) return null;
      const canvas = document.createElement("canvas");
      canvas.width = right - left;
      canvas.height = bottom - top;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      this.trace(context, state);
      return { imageData: context.getImageData(0, 0, canvas.width, canvas.height), rect: { x: left, y: top, width: canvas.width, height: canvas.height } };
    }

    /** Discard all anchors and editable path state. */
    reset() {
      this.anchors = [];
      this.closed = false;
      this.selectedAnchorIndex = -1;
      this.selectedSegmentIndex = -1;
      this.drag = null;
      this.zoom = 1;
    }

    trace(context, state) {
      namespace.configureStroke(context, state, state.lineWidth);
      context.beginPath();
      context.moveTo(this.anchors[0].point.x, this.anchors[0].point.y);
      const segmentCount = this.closed ? this.anchors.length : this.anchors.length - 1;
      for (let index = 0; index < segmentCount; index += 1) {
        const start = this.anchors[index];
        const end = this.anchors[(index + 1) % this.anchors.length];
        if (start.outHandle || end.inHandle) {
          const firstControl = start.outHandle || start.point;
          const secondControl = end.inHandle || end.point;
          context.bezierCurveTo(firstControl.x, firstControl.y, secondControl.x, secondControl.y, end.point.x, end.point.y);
        } else context.lineTo(end.point.x, end.point.y);
      }
      if (this.closed) {
        context.closePath();
        if (state.fillShapes) context.fill();
      }
      context.stroke();
    }

    startDrag(kind, point, details) {
      this.drag = { kind, pointerStart: clonePoint(point), ...details };
    }

    translateAnchorFrom(target, original, delta) {
      target.point = { x: original.point.x + delta.x, y: original.point.y + delta.y };
      target.inHandle = original.inHandle ? { x: original.inHandle.x + delta.x, y: original.inHandle.y + delta.y } : null;
      target.outHandle = original.outHandle ? { x: original.outHandle.x + delta.x, y: original.outHandle.y + delta.y } : null;
    }

    toggleAnchorKind(index) {
      const anchor = this.anchors[index];
      if (anchor.inHandle || anchor.outHandle) {
        anchor.inHandle = null;
        anchor.outHandle = null;
        anchor.smooth = false;
        return;
      }
      const previous = this.anchors[index - 1] || (this.closed ? this.anchors[this.anchors.length - 1] : null);
      const next = this.anchors[index + 1] || (this.closed ? this.anchors[0] : null);
      if (!previous && !next) return;
      const start = previous?.point || anchor.point;
      const end = next?.point || anchor.point;
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const handleLength = Math.min(40, Math.max(12, length / 6));
      const unitX = deltaX / length;
      const unitY = deltaY / length;
      anchor.inHandle = { x: anchor.point.x - unitX * handleLength, y: anchor.point.y - unitY * handleLength };
      anchor.outHandle = { x: anchor.point.x + unitX * handleLength, y: anchor.point.y + unitY * handleLength };
      anchor.smooth = true;
    }

    contains(point) {
      const bounds = this.model?.bounds;
      return Boolean(bounds && point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY);
    }

    findAnchor(point) {
      const radius = HIT_SCREEN_RADIUS / this.zoom;
      return this.anchors.findIndex((anchor) => Math.hypot(anchor.point.x - point.x, anchor.point.y - point.y) <= radius);
    }

    findDirectionHandle(point) {
      if (this.selectedAnchorIndex < 0) return null;
      const anchor = this.anchors[this.selectedAnchorIndex];
      const radius = HIT_SCREEN_RADIUS / this.zoom;
      for (const handleName of ["inHandle", "outHandle"]) {
        const handle = anchor[handleName];
        if (handle && Math.hypot(handle.x - point.x, handle.y - point.y) <= radius) {
          return { anchorIndex: this.selectedAnchorIndex, handleName };
        }
      }
      return null;
    }

    findSegment(point) {
      if (this.anchors.length < 2) return null;
      return namespace.nearestPathSegment(this.anchors, this.closed, point, HIT_SCREEN_RADIUS / this.zoom);
    }
  }

  namespace.ImageEditorPathTool = ImageEditorPathTool;
})(typeof window !== "undefined" ? window : globalThis);
