// Editable rounded-rectangle bounds and independent corner-radius handles.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const CORNERS = Object.freeze(["topLeft", "topRight", "bottomRight", "bottomLeft"]);
  const GUIDE_HANDLE_SCREEN_SIZE = 5;
  const GUIDE_HIT_TARGET_SCREEN_RADIUS = 7;

  function rectFromPoints(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }

  /** Owns one editable rounded rectangle until it is committed or cancelled. */
  class ImageEditorRoundedRectangleTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.rect) return null;
      const maximum = this.maximumRadius();
      return {
        rect: { ...this.rect },
        radii: Object.fromEntries(CORNERS.map((corner) => [corner, Math.min(maximum, this.radii[corner])]))
      };
    }

    /** Begin drawing, adjust a radius handle, or classify an outside click. */
    begin(point, defaultRadius, adjustAllCorners) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.rect = rectFromPoints(point, point);
        this.radii = Object.fromEntries(CORNERS.map((corner) => [corner, defaultRadius]));
        this.activeCorner = "topLeft";
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const corner = this.findHandle(point);
      if (corner) {
        this.activeCorner = corner;
        this.adjustAllCorners = adjustAllCorners;
        this.phase = "adjusting";
        return { action: "adjusting", started: true, corner };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    /** Update the rectangle bounds or the active corner radius. */
    update(point) {
      if (this.phase === "drawing") {
        this.rect = rectFromPoints(this.start, point);
      } else if (this.phase === "adjusting") {
        this.setRadius(this.radiusFromPoint(this.activeCorner, point), this.adjustAllCorners);
      }
    }

    /** Finish the current draw or radius-adjustment drag. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      this.normalizeRadii();
      this.phase = "editing";
      return true;
    }

    /** Set every corner radius or only the currently active corner. */
    setRadius(radius, adjustAllCorners) {
      if (!this.rect) return false;
      const value = Math.max(0, Math.min(this.maximumRadius(), Number(radius) || 0));
      if (adjustAllCorners) CORNERS.forEach((corner) => { this.radii[corner] = value; });
      else this.radii[this.activeCorner] = value;
      return true;
    }

    /** Make all corners match the currently active corner. */
    unifyCorners() {
      return this.setRadius(this.radii[this.activeCorner], true);
    }

    /** Return the on-canvas drag handle for one corner. */
    getHandlePoint(corner) {
      const model = this.model;
      if (!model) return null;
      const { rect, radii } = model;
      if (corner === "topLeft") return { x: rect.x + radii.topLeft, y: rect.y };
      if (corner === "topRight") return { x: rect.x + rect.width - radii.topRight, y: rect.y };
      if (corner === "bottomRight") return { x: rect.x + rect.width - radii.bottomRight, y: rect.y + rect.height };
      return { x: rect.x + radii.bottomLeft, y: rect.y + rect.height };
    }

    /** Draw the editable shape, bounds, and four radius handles. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      namespace.drawRoundedRectangle(context, model.rect, model.radii, state);
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.rect.x, model.rect.y, model.rect.width, model.rect.height);
      context.setLineDash([]);
      CORNERS.forEach((corner) => {
        const point = this.getHandlePoint(corner);
        context.fillStyle = corner === this.activeCorner ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Discard the editable rectangle. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.radii = Object.fromEntries(CORNERS.map((corner) => [corner, 0]));
      this.activeCorner = "topLeft";
      this.adjustAllCorners = true;
      this.zoom = 1;
    }

    maximumRadius() {
      return this.rect ? Math.max(0, Math.min(this.rect.width, this.rect.height) / 2) : 0;
    }

    normalizeRadii() {
      const maximum = this.maximumRadius();
      CORNERS.forEach((corner) => { this.radii[corner] = Math.min(maximum, this.radii[corner]); });
    }

    contains(point) {
      const rect = this.rect;
      return !!rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    findHandle(point) {
      return CORNERS.find((corner) => {
        const handle = this.getHandlePoint(corner);
        return Math.hypot(handle.x - point.x, handle.y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom;
      }) || null;
    }

    radiusFromPoint(corner, point) {
      if (corner === "topRight" || corner === "bottomRight") return this.rect.x + this.rect.width - point.x;
      return point.x - this.rect.x;
    }
  }

  namespace.ImageEditorRoundedRectangleTool = ImageEditorRoundedRectangleTool;
})(typeof window !== "undefined" ? window : globalThis);
