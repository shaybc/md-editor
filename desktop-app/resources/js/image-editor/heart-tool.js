// Editable heart geometry, guide handles, and transparent-layer rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const HANDLES = Object.freeze(["leftLobe", "cleft", "rightLobe", "tip"]);
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

  function defaultHandles(rect) {
    return {
      leftLobe: { x: rect.x + rect.width * 0.25, y: rect.y },
      cleft: { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.28 },
      rightLobe: { x: rect.x + rect.width * 0.75, y: rect.y },
      tip: { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.96 }
    };
  }

  function heartPath(model) {
    const { rect, leftLobe, cleft, rightLobe, tip } = model;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const width = rect.width;
    const height = rect.height;
    const leftEdge = { x: left, y: top + height * 0.27 };
    const rightEdge = { x: right, y: top + height * 0.27 };
    return {
      start: cleft,
      curves: [
        [
          { x: cleft.x - width * 0.08, y: cleft.y - height * 0.16 },
          { x: leftLobe.x + width * 0.08, y: leftLobe.y },
          leftLobe
        ],
        [
          { x: leftLobe.x - width * 0.15, y: leftLobe.y },
          { x: left, y: top + height * 0.08 },
          leftEdge
        ],
        [
          { x: left, y: top + height * 0.58 },
          { x: tip.x - width * 0.22, y: tip.y - height * 0.12 },
          tip
        ],
        [
          { x: tip.x + width * 0.22, y: tip.y - height * 0.12 },
          { x: right, y: top + height * 0.58 },
          rightEdge
        ],
        [
          { x: right, y: top + height * 0.08 },
          { x: rightLobe.x + width * 0.15, y: rightLobe.y },
          rightLobe
        ],
        [
          { x: rightLobe.x - width * 0.08, y: rightLobe.y },
          { x: cleft.x + width * 0.08, y: cleft.y - height * 0.16 },
          cleft
        ]
      ]
    };
  }

  function heartSelectionRect(model) {
    const path = heartPath(model);
    const points = [path.start, ...path.curves.flat()];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      width: Math.max(1, Math.max(...xs) - x),
      height: Math.max(1, Math.max(...ys) - y)
    };
  }

  /**
   * Trace a heart whose lobes, cleft, and tip are controlled by editable guide points.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the heart curves.
   * @param {{rect:object,leftLobe:object,cleft:object,rightLobe:object,tip:object}} model - Current heart geometry.
   */
  function traceHeart(context, model) {
    const path = heartPath(model);
    context.moveTo(path.start.x, path.start.y);
    path.curves.forEach(([control1, control2, end]) => {
      context.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
    });
    context.closePath();
  }

  function drawHeart(context, model, state) {
    context.save();
    context.strokeStyle = state.foregroundColor;
    context.fillStyle = state.backgroundColor;
    context.lineWidth = state.lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    traceHeart(context, model);
    if (state.fillShapes) context.fill();
    context.stroke();
    context.restore();
  }

  /** Owns one heart until its guide-adjusted shape is accepted or cancelled. */
  class ImageEditorHeartTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.rect || !this.handles) return null;
      const model = {
        rect: { ...this.rect },
        ...Object.fromEntries(HANDLES.map((handle) => [handle, { ...this.handles[handle] }]))
      };
      model.selectionRect = heartSelectionRect(model);
      return model;
    }

    /** Begin the heart bounds, adjust a guide point, or classify an outside click. */
    begin(point) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.rect = rectFromPoints(point, point);
        this.handles = defaultHandles(this.rect);
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const handle = this.findHandle(point);
      if (handle) {
        this.activeHandle = handle;
        this.phase = "adjusting";
        return { action: "adjusting", started: true, handle };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    /** Update the heart bounds or the active shape guide. */
    update(point) {
      if (this.phase === "drawing") {
        this.rect = rectFromPoints(this.start, point);
        this.handles = defaultHandles(this.rect);
      } else if (this.phase === "adjusting") {
        this.moveHandle(this.activeHandle, point);
      }
    }

    /** Finish the current bounds or guide drag while leaving the heart editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      if (!this.rect.width || !this.rect.height) {
        this.reset();
        return false;
      }
      this.phase = "editing";
      return true;
    }

    /** Draw the vector heart and its small on-canvas customization guides. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      drawHeart(context, model, state);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.selectionRect.x, model.selectionRect.y, model.selectionRect.width, model.selectionRect.height);
      context.setLineDash([]);
      HANDLES.forEach((handle) => {
        const point = model[handle];
        context.fillStyle = handle === this.activeHandle ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Rasterize the accepted heart into a tightly bounded transparent layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(model.selectionRect.x - padding));
      const top = Math.max(0, Math.floor(model.selectionRect.y - padding));
      const right = Math.min(bounds.width, Math.ceil(model.selectionRect.x + model.selectionRect.width + padding));
      const bottom = Math.min(bounds.height, Math.ceil(model.selectionRect.y + model.selectionRect.height + padding));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      drawHeart(context, model, state);
      return {
        imageData: context.getImageData(0, 0, width, height),
        rect: { x: left, y: top, width, height }
      };
    }

    /** Discard the editable heart and its guide points. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.handles = null;
      this.activeHandle = "cleft";
      this.zoom = 1;
    }

    contains(point) {
      const rect = this.model?.selectionRect;
      return !!rect &&
        point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    findHandle(point) {
      return HANDLES.find((handle) =>
        Math.hypot(this.handles[handle].x - point.x, this.handles[handle].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom
      ) || null;
    }

    moveHandle(handle, point) {
      if (HANDLES.includes(handle)) this.handles[handle] = { x: point.x, y: point.y };
    }
  }

  namespace.traceHeart = traceHeart;
  namespace.ImageEditorHeartTool = ImageEditorHeartTool;
})(typeof window !== "undefined" ? window : globalThis);
