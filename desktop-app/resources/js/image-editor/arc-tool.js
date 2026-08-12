// Editable elliptical arc size, curvature, displayed sweep, fill segment, and rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const GUIDE_HANDLE_SCREEN_SIZE = 5;
  const GUIDE_HIT_TARGET_SCREEN_RADIUS = 7;
  const MINIMUM_SWEEP = 0.05;
  const MAXIMUM_SWEEP = Math.PI * 2 - MINIMUM_SWEEP;

  function rectFromPoints(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }

  function normalizeAngle(angle) {
    const turn = Math.PI * 2;
    return ((angle % turn) + turn) % turn;
  }

  function angleFromPoint(model, point) {
    return Math.atan2(
      (point.y - model.center.y) / model.radiusY,
      (point.x - model.center.x) / model.radiusX
    );
  }

  function pointAtAngle(model, angle) {
    return {
      x: model.center.x + Math.cos(angle) * model.radiusX,
      y: model.center.y + Math.sin(angle) * model.radiusY
    };
  }

  function arcModel(center, radiusX, radiusY, startAngle, sweep) {
    return {
      rect: {
        x: center.x - radiusX,
        y: center.y - radiusY,
        width: radiusX * 2,
        height: radiusY * 2
      },
      center: { ...center },
      radiusX: Math.max(0.5, radiusX),
      radiusY: Math.max(0.5, radiusY),
      startAngle,
      sweep,
      endAngle: startAngle + sweep,
      midpointAngle: startAngle + sweep / 2
    };
  }

  function guidePoints(model) {
    return {
      size: pointAtAngle(model, model.startAngle),
      curvature: pointAtAngle(model, model.midpointAngle),
      sweep: pointAtAngle(model, model.endAngle)
    };
  }

  /**
   * Trace an elliptical arc and optionally close its endpoints with a chord.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the arc.
   * @param {{center:object,radiusX:number,radiusY:number,startAngle:number,endAngle:number,sweep:number}} model - Current arc geometry.
   * @param {boolean} closeSegment - Whether to close the arc for segment filling.
   */
  function traceArc(context, model, closeSegment) {
    context.ellipse(
      model.center.x,
      model.center.y,
      model.radiusX,
      model.radiusY,
      0,
      model.startAngle,
      model.endAngle,
      model.sweep < 0
    );
    if (closeSegment) context.closePath();
  }

  function drawArc(context, model, state) {
    context.save();
    namespace.configureStroke(context, state, state.lineWidth);
    context.beginPath();
    traceArc(context, model, state.fillShapes);
    if (state.fillShapes) context.fill();
    context.stroke();
    context.restore();
  }

  /** Owns one arc until its size, curvature, and displayed sweep are accepted or cancelled. */
  class ImageEditorArcTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      return this.center ? arcModel(this.center, this.radiusX, this.radiusY, this.startAngle, this.sweep) : null;
    }

    /** Begin the arc bounds, adjust one guide, or classify an outside click. */
    begin(point) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.setBounds(rectFromPoints(point, point));
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const handle = this.findHandle(point);
      if (handle) {
        this.activeHandle = handle;
        this.adjustmentStart = {
          radiusX: this.radiusX,
          radiusY: this.radiusY
        };
        this.phase = "adjusting";
        return { action: "adjusting", started: true, handle };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    /** Update the initial bounds, proportional size, ellipse curvature, or displayed sweep. */
    update(point) {
      if (this.phase === "drawing") {
        this.setBounds(rectFromPoints(this.start, point));
        return;
      }
      if (this.phase !== "adjusting") return;
      const model = this.model;
      if (this.activeHandle === "size") {
        const normalizedDistance = Math.hypot(
          (point.x - model.center.x) / this.adjustmentStart.radiusX,
          (point.y - model.center.y) / this.adjustmentStart.radiusY
        );
        const scale = Math.max(0.02, normalizedDistance);
        this.radiusX = Math.max(0.5, this.adjustmentStart.radiusX * scale);
        this.radiusY = Math.max(0.5, this.adjustmentStart.radiusY * scale);
      } else if (this.activeHandle === "curvature") {
        const sine = Math.sin(model.midpointAngle);
        const cosine = Math.cos(model.midpointAngle);
        if (Math.abs(sine) >= Math.abs(cosine)) {
          this.radiusY = Math.max(0.5, Math.abs((point.y - model.center.y) / sine));
        } else {
          this.radiusX = Math.max(0.5, Math.abs((point.x - model.center.x) / cosine));
        }
      } else if (this.activeHandle === "sweep") {
        const displayed = normalizeAngle(this.startAngle - angleFromPoint(model, point));
        this.sweep = -Math.max(MINIMUM_SWEEP, Math.min(MAXIMUM_SWEEP, displayed));
      }
    }

    /** Finish the current bounds or guide drag while leaving the arc editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      if (!this.center || this.radiusX <= 0.5 || this.radiusY <= 0.5) {
        this.reset();
        return false;
      }
      this.phase = "editing";
      return true;
    }

    /** Draw the arc, dynamic ellipse bounds, and its size, curvature, and sweep guides. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      drawArc(context, model, state);
      const points = guidePoints(model);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.rect.x, model.rect.y, model.rect.width, model.rect.height);
      context.setLineDash([]);
      ["size", "curvature", "sweep"].forEach((handle) => {
        const point = points[handle];
        context.fillStyle = handle === this.activeHandle ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Rasterize the accepted open or filled arc into a transparent floating layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(model.rect.x - padding));
      const top = Math.max(0, Math.floor(model.rect.y - padding));
      const right = Math.min(bounds.width, Math.ceil(model.rect.x + model.rect.width + padding));
      const bottom = Math.min(bounds.height, Math.ceil(model.rect.y + model.rect.height + padding));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      drawArc(context, model, state);
      return {
        imageData: context.getImageData(0, 0, width, height),
        rect: { x: left, y: top, width, height }
      };
    }

    /** Discard the editable arc and its guides. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.center = null;
      this.radiusX = 0;
      this.radiusY = 0;
      this.startAngle = -2.2;
      this.sweep = -3.5;
      this.activeHandle = "curvature";
      this.adjustmentStart = null;
      this.zoom = 1;
    }

    contains(point) {
      const rect = this.model?.rect;
      return !!rect &&
        point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    findHandle(point) {
      const points = guidePoints(this.model);
      return ["size", "curvature", "sweep"].find((handle) =>
        Math.hypot(points[handle].x - point.x, points[handle].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom
      ) || null;
    }

    setBounds(rect) {
      this.center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      this.radiusX = Math.max(0.5, rect.width / 2);
      this.radiusY = Math.max(0.5, rect.height / 2);
    }
  }

  namespace.traceArc = traceArc;
  namespace.ImageEditorArcTool = ImageEditorArcTool;
})(typeof window !== "undefined" ? window : globalThis);
