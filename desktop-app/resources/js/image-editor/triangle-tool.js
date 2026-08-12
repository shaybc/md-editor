// Editable triangle vertices, guide handles, and transparent-layer rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const VERTICES = Object.freeze(["top", "bottomRight", "bottomLeft"]);
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

  function defaultVertices(rect) {
    return {
      top: { x: rect.x + rect.width / 2, y: rect.y },
      bottomRight: { x: rect.x + rect.width, y: rect.y + rect.height },
      bottomLeft: { x: rect.x, y: rect.y + rect.height }
    };
  }

  function selectionRect(vertices) {
    const points = VERTICES.map((vertex) => vertices[vertex]);
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

  function traceTriangle(context, model) {
    context.moveTo(model.top.x, model.top.y);
    context.lineTo(model.bottomRight.x, model.bottomRight.y);
    context.lineTo(model.bottomLeft.x, model.bottomLeft.y);
    context.closePath();
  }

  function drawTriangle(context, model, state) {
    context.save();
    namespace.configureStroke(context, state, state.lineWidth);
    context.beginPath();
    traceTriangle(context, model);
    if (state.fillShapes) context.fill();
    context.stroke();
    context.restore();
  }

  /** Owns one triangle until its three guide-adjusted vertices are accepted or cancelled. */
  class ImageEditorTriangleTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.vertices) return null;
      const model = Object.fromEntries(VERTICES.map((vertex) => [vertex, { ...this.vertices[vertex] }]));
      model.selectionRect = selectionRect(model);
      return model;
    }

    /** Begin the triangle bounds, adjust one vertex, or classify an outside click. */
    begin(point) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.vertices = defaultVertices(rectFromPoints(point, point));
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const vertex = this.findVertex(point);
      if (vertex) {
        this.activeVertex = vertex;
        this.phase = "adjusting";
        return { action: "adjusting", started: true, vertex };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    /** Update the initial triangle bounds or the active vertex guide. */
    update(point) {
      if (this.phase === "drawing") {
        this.vertices = defaultVertices(rectFromPoints(this.start, point));
      } else if (this.phase === "adjusting") {
        this.vertices[this.activeVertex] = { x: point.x, y: point.y };
      }
    }

    /** Finish the current bounds or vertex drag while leaving the triangle editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      const rect = this.model?.selectionRect;
      if (!rect || rect.width <= 1 || rect.height <= 1) {
        this.reset();
        return false;
      }
      this.phase = "editing";
      return true;
    }

    /** Draw the vector triangle, current bounds, and its three small vertex guides. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      drawTriangle(context, model, state);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.selectionRect.x, model.selectionRect.y, model.selectionRect.width, model.selectionRect.height);
      context.setLineDash([]);
      VERTICES.forEach((vertex) => {
        const point = model[vertex];
        context.fillStyle = vertex === this.activeVertex ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Rasterize the accepted triangle into a tightly bounded transparent layer. */
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
      drawTriangle(context, model, state);
      return {
        imageData: context.getImageData(0, 0, width, height),
        rect: { x: left, y: top, width, height }
      };
    }

    /** Discard the editable triangle and its vertex guides. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.vertices = null;
      this.activeVertex = "top";
      this.zoom = 1;
    }

    contains(point) {
      const rect = this.model?.selectionRect;
      return !!rect &&
        point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    findVertex(point) {
      return VERTICES.find((vertex) =>
        Math.hypot(this.vertices[vertex].x - point.x, this.vertices[vertex].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom
      ) || null;
    }
  }

  namespace.traceTriangle = traceTriangle;
  namespace.ImageEditorTriangleTool = ImageEditorTriangleTool;
})(typeof window !== "undefined" ? window : globalThis);
