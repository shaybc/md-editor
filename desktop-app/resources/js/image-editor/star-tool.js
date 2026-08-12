// Editable point-count, inner-ratio, and corner-radius guides for star shapes.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const HANDLES = Object.freeze(["count", "ratio", "radius"]);
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

  function pointBetween(start, end, ratio) {
    return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
  }

  function drawStar(context, model, state) {
    context.save();
    context.strokeStyle = state.foregroundColor;
    context.fillStyle = state.backgroundColor;
    context.lineWidth = state.lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    namespace.traceStar(
      context,
      { x: model.rect.x, y: model.rect.y },
      { x: model.rect.x + model.rect.width, y: model.rect.y + model.rect.height },
      model.pointCount,
      model.innerRatio,
      model.cornerRadius
    );
    if (state.fillShapes) context.fill();
    context.stroke();
    context.restore();
  }

  /** Owns one star until its count, ratio, and corner-radius guides are accepted. */
  class ImageEditorStarTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.rect) return null;
      const geometry = namespace.starVertices(
        { x: this.rect.x, y: this.rect.y },
        { x: this.rect.x + this.rect.width, y: this.rect.y + this.rect.height },
        this.pointCount,
        this.innerRatio
      );
      return {
        rect: { ...this.rect },
        pointCount: geometry.pointCount,
        innerRatio: geometry.innerRatio,
        cornerRadius: Math.min(this.cornerRadius, this.maximumCornerRadius()),
        geometry
      };
    }

    /** Begin drawing, adjust one Figma-style guide, or classify an outside click. */
    begin(point, pointCount) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.rect = rectFromPoints(point, point);
        this.pointCount = Math.max(3, Math.min(60, Math.round(Number(pointCount) || 5)));
        this.innerRatio = namespace.defaultStarInnerRatio(this.pointCount);
        this.cornerRadius = 0;
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const handle = this.findHandle(point);
      if (handle) {
        this.activeHandle = handle;
        this.adjustmentStart = { point: { ...point }, pointCount: this.pointCount };
        this.phase = "adjusting";
        return { action: "adjusting", started: true, handle };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    /** Update initial bounds or the active count, ratio, or radius guide. */
    update(point) {
      if (this.phase === "drawing") {
        this.rect = rectFromPoints(this.start, point);
        return;
      }
      if (this.phase !== "adjusting") return;
      const model = this.model;
      if (this.activeHandle === "count") {
        const step = 5 / this.zoom;
        this.pointCount = Math.max(3, Math.min(60,
          this.adjustmentStart.pointCount + Math.round((this.adjustmentStart.point.y - point.y) / step)
        ));
        this.cornerRadius = Math.min(this.cornerRadius, this.maximumCornerRadius());
      } else if (this.activeHandle === "ratio") {
        this.innerRatio = Math.max(0.05, Math.min(0.95, Math.hypot(
          (point.x - model.geometry.center.x) / model.geometry.radiusX,
          (point.y - model.geometry.center.y) / model.geometry.radiusY
        )));
      } else if (this.activeHandle === "radius") {
        const outer = model.geometry.vertices[0];
        const inner = model.geometry.vertices[1];
        const vector = { x: inner.x - outer.x, y: inner.y - outer.y };
        const projection = ((point.x - outer.x) * vector.x + (point.y - outer.y) * vector.y) /
          Math.max(0.001, vector.x * vector.x + vector.y * vector.y);
        this.cornerRadius = Math.max(0, Math.min(this.maximumCornerRadius(), projection / 0.65 * this.maximumCornerRadius()));
      }
    }

    /** Finish the current draw or guide drag while leaving the star editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      if (!this.rect || this.rect.width <= 1 || this.rect.height <= 1) {
        this.reset();
        return false;
      }
      this.phase = "editing";
      return true;
    }

    /** Apply a toolbar point-count preset to the star currently being edited. */
    setPointCount(pointCount) {
      if (!this.isEditing) return false;
      this.pointCount = Math.max(3, Math.min(60, Math.round(Number(pointCount) || 5)));
      this.cornerRadius = Math.min(this.cornerRadius, this.maximumCornerRadius());
      return true;
    }

    guidePoints() {
      const model = this.model;
      if (!model) return {};
      const outer = model.geometry.vertices[0];
      const inner = model.geometry.vertices[1];
      const radiusRatio = this.maximumCornerRadius() > 0 ? model.cornerRadius / this.maximumCornerRadius() : 0;
      return {
        count: { x: model.geometry.center.x + model.geometry.radiusX, y: model.geometry.center.y },
        ratio: { ...inner },
        radius: pointBetween(outer, inner, radiusRatio * 0.65)
      };
    }

    /** Draw the vector star, three small guides, and their current values. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      drawStar(context, model, state);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      const points = this.guidePoints();
      const labels = {
        count: `Count ${model.pointCount}`,
        ratio: `Ratio ${Math.round(model.innerRatio * 100)}%`,
        radius: `Radius ${Math.round(model.cornerRadius)}`
      };
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.rect.x, model.rect.y, model.rect.width, model.rect.height);
      context.setLineDash([]);
      context.font = `${10 * guideScale}px sans-serif`;
      HANDLES.forEach((handle) => {
        const point = points[handle];
        context.fillStyle = handle === this.activeHandle ? "rgba(255, 255, 255, 0.92)" : "rgba(20, 115, 230, 0.78)";
        context.strokeStyle = "rgba(20, 115, 230, 0.82)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.fillStyle = "rgba(20, 115, 230, 0.92)";
        context.fillText(labels[handle], point.x + 6 * guideScale, point.y - 5 * guideScale);
      });
      context.restore();
    }

    /** Rasterize the accepted star into a transparent floating layer. */
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
      drawStar(context, model, state);
      return { imageData: context.getImageData(0, 0, width, height), rect: { x: left, y: top, width, height } };
    }

    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.pointCount = 5;
      this.innerRatio = 0.45;
      this.cornerRadius = 0;
      this.activeHandle = "ratio";
      this.adjustmentStart = null;
      this.zoom = 1;
    }

    maximumCornerRadius() {
      if (!this.rect) return 0;
      const vertices = namespace.starVertices(
        { x: this.rect.x, y: this.rect.y },
        { x: this.rect.x + this.rect.width, y: this.rect.y + this.rect.height },
        this.pointCount,
        this.innerRatio
      ).vertices;
      return Math.min(...vertices.map((vertex, index) => {
        const next = vertices[(index + 1) % vertices.length];
        return Math.hypot(next.x - vertex.x, next.y - vertex.y) / 2;
      }));
    }

    contains(point) {
      return !!this.rect && point.x >= this.rect.x && point.x <= this.rect.x + this.rect.width &&
        point.y >= this.rect.y && point.y <= this.rect.y + this.rect.height;
    }

    findHandle(point) {
      const points = this.guidePoints();
      return HANDLES.find((handle) =>
        Math.hypot(points[handle].x - point.x, points[handle].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom
      ) || null;
    }
  }

  namespace.ImageEditorStarTool = ImageEditorStarTool;
})(typeof window !== "undefined" ? window : globalThis);
