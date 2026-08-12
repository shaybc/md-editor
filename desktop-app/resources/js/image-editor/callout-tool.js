// Editable rounded-rectangle callout geometry, guide handles, and rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const MINIMUM_CALLOUT_CORNER_RADIUS = 12;
  const GUIDE_HANDLE_SCREEN_SIZE = 5;
  const GUIDE_HIT_TARGET_SCREEN_RADIUS = 7;
  const MINIMUM_ATTACHMENT_GAP = 4;

  function rectFromPoints(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  /** Owns one rounded callout until its body and three-point tail guide are accepted. */
  class ImageEditorCalloutTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.rect || this.phase === "drawing") return null;
      return {
        rect: { ...this.rect },
        radius: this.radius,
        side: this.side,
        attachmentStart: this.pointOnSide(this.attachmentStart),
        attachmentEnd: this.pointOnSide(this.attachmentEnd),
        tip: { ...this.tip }
      };
    }

    /** Begin the body drag, adjust one tail guide handle, or classify an outside click. */
    begin(point, defaultRadius, bounds) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.rect = rectFromPoints(point, point);
        this.radius = Math.max(MINIMUM_CALLOUT_CORNER_RADIUS, Number(defaultRadius) || 0);
        this.bounds = { width: bounds.width, height: bounds.height };
        this.zoom = Math.max(0.25, Number(bounds.zoom) || 1);
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

    /** Update the body bounds or active tail guide handle. */
    update(point) {
      if (this.phase === "drawing") {
        this.rect = rectFromPoints(this.start, point);
        return;
      }
      if (this.phase !== "adjusting") return;
      if (this.activeHandle === "tip") this.moveTip(point);
      else this.moveAttachment(this.activeHandle, point);
    }

    /** Finish the current body or guide drag while keeping the callout editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase === "drawing") {
        if (!this.rect.width || !this.rect.height) return false;
        this.normalizeRadius();
        this.initializeTail();
        this.phase = "editing";
        return true;
      }
      if (this.phase !== "adjusting") return false;
      this.activeHandle = null;
      this.phase = "editing";
      return true;
    }

    /** Draw the rounded callout plus its three-handle adjustment guide. */
    drawPreview(context, state) {
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      if (this.phase === "drawing" && this.rect) {
        const radius = Math.min(this.radius, this.rect.width / 2, this.rect.height / 2);
        const radii = { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };
        namespace.drawRoundedRectangle(context, this.rect, radii, state);
        return;
      }
      const model = this.model;
      if (!model) return;
      this.drawShape(context, state);
      const midpoint = {
        x: (model.attachmentStart.x + model.attachmentEnd.x) / 2,
        y: (model.attachmentStart.y + model.attachmentEnd.y) / 2
      };
      const guideScale = 1 / Math.max(0.25, Number(state.zoom) || 1);
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.rect.x, model.rect.y, model.rect.width, model.rect.height);
      context.beginPath();
      context.moveTo(midpoint.x, midpoint.y);
      context.lineTo(model.tip.x, model.tip.y);
      context.stroke();
      context.setLineDash([]);
      ["attachmentStart", "attachmentEnd", "tip"].forEach((handle) => {
        const point = model[handle];
        context.fillStyle = handle === this.activeHandle ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Rasterize the accepted callout into a tightly bounded transparent layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(Math.min(model.rect.x, model.tip.x) - padding));
      const top = Math.max(0, Math.floor(Math.min(model.rect.y, model.tip.y) - padding));
      const right = Math.min(bounds.width, Math.ceil(Math.max(model.rect.x + model.rect.width, model.tip.x) + padding));
      const bottom = Math.min(bounds.height, Math.ceil(Math.max(model.rect.y + model.rect.height, model.tip.y) + padding));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (!width || !height) return null;
      const canvas = global.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      this.drawShape(context, state);
      return { imageData: context.getImageData(0, 0, width, height), rect: { x: left, y: top, width, height } };
    }

    /** Discard the editable callout and its guide. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.radius = 0;
      this.bounds = null;
      this.zoom = 1;
      this.side = "bottom";
      this.attachmentStart = 0;
      this.attachmentEnd = 0;
      this.tip = null;
      this.activeHandle = null;
    }

    initializeTail() {
      const range = this.sideRange("bottom");
      const center = (range.minimum + range.maximum) / 2;
      const width = Math.min(range.maximum - range.minimum, Math.max(12, this.rect.width * 0.25));
      this.side = "bottom";
      this.attachmentStart = center - width / 2;
      this.attachmentEnd = center + width / 2;
      this.tip = {
        x: center,
        y: clamp(this.rect.y + this.rect.height + Math.max(16, Math.min(32, this.rect.height * 0.4)), 0, this.bounds.height - 1)
      };
    }

    moveTip(point) {
      const width = Math.max(MINIMUM_ATTACHMENT_GAP, this.attachmentEnd - this.attachmentStart);
      this.tip = {
        x: clamp(point.x, 0, this.bounds.width - 1),
        y: clamp(point.y, 0, this.bounds.height - 1)
      };
      this.side = this.sideFacingPoint(this.tip);
      const range = this.sideRange(this.side);
      const projected = this.side === "top" || this.side === "bottom" ? this.tip.x : this.tip.y;
      const halfWidth = Math.min(width / 2, (range.maximum - range.minimum) / 2);
      const center = clamp(projected, range.minimum + halfWidth, range.maximum - halfWidth);
      this.attachmentStart = center - halfWidth;
      this.attachmentEnd = center + halfWidth;
    }

    moveAttachment(handle, point) {
      const range = this.sideRange(this.side);
      const value = clamp(this.side === "top" || this.side === "bottom" ? point.x : point.y, range.minimum, range.maximum);
      if (handle === "attachmentStart") this.attachmentStart = Math.min(value, this.attachmentEnd - MINIMUM_ATTACHMENT_GAP);
      else this.attachmentEnd = Math.max(value, this.attachmentStart + MINIMUM_ATTACHMENT_GAP);
    }

    sideFacingPoint(point) {
      const rect = this.rect;
      const distances = {
        left: rect.x - point.x,
        right: point.x - (rect.x + rect.width),
        top: rect.y - point.y,
        bottom: point.y - (rect.y + rect.height)
      };
      const outside = Object.entries(distances).sort((first, second) => second[1] - first[1])[0];
      if (outside[1] > 0) return outside[0];
      const insideDistances = {
        left: point.x - rect.x,
        right: rect.x + rect.width - point.x,
        top: point.y - rect.y,
        bottom: rect.y + rect.height - point.y
      };
      return Object.entries(insideDistances).sort((first, second) => first[1] - second[1])[0][0];
    }

    sideRange(side) {
      const horizontal = side === "top" || side === "bottom";
      const minimum = horizontal ? this.rect.x + this.radius : this.rect.y + this.radius;
      const maximum = horizontal ? this.rect.x + this.rect.width - this.radius : this.rect.y + this.rect.height - this.radius;
      return { minimum: Math.min(minimum, maximum), maximum: Math.max(minimum, maximum) };
    }

    pointOnSide(value) {
      if (this.side === "top") return { x: value, y: this.rect.y };
      if (this.side === "right") return { x: this.rect.x + this.rect.width, y: value };
      if (this.side === "bottom") return { x: value, y: this.rect.y + this.rect.height };
      return { x: this.rect.x, y: value };
    }

    drawShape(context, state) {
      const model = this.model;
      if (!model) return;
      namespace.configureStroke(context, state, state.lineWidth);
      this.tracePath(context, model);
      if (state.fillShapes) context.fill();
      context.stroke();
    }

    tracePath(context, model) {
      const { rect, radius, side, attachmentStart, attachmentEnd, tip } = model;
      const right = rect.x + rect.width;
      const bottom = rect.y + rect.height;
      context.beginPath();
      context.moveTo(rect.x + radius, rect.y);
      if (side === "top") this.traceTail(context, attachmentStart, tip, attachmentEnd);
      context.lineTo(right - radius, rect.y);
      context.quadraticCurveTo(right, rect.y, right, rect.y + radius);
      if (side === "right") this.traceTail(context, attachmentStart, tip, attachmentEnd);
      context.lineTo(right, bottom - radius);
      context.quadraticCurveTo(right, bottom, right - radius, bottom);
      if (side === "bottom") this.traceTail(context, attachmentEnd, tip, attachmentStart);
      context.lineTo(rect.x + radius, bottom);
      context.quadraticCurveTo(rect.x, bottom, rect.x, bottom - radius);
      if (side === "left") this.traceTail(context, attachmentEnd, tip, attachmentStart);
      context.lineTo(rect.x, rect.y + radius);
      context.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y);
      context.closePath();
    }

    traceTail(context, first, tip, second) {
      context.lineTo(first.x, first.y);
      context.lineTo(tip.x, tip.y);
      context.lineTo(second.x, second.y);
    }

    normalizeRadius() {
      this.radius = Math.min(this.radius, this.rect.width / 2, this.rect.height / 2);
    }

    contains(point) {
      return point.x >= this.rect.x && point.x <= this.rect.x + this.rect.width &&
        point.y >= this.rect.y && point.y <= this.rect.y + this.rect.height;
    }

    findHandle(point) {
      const model = this.model;
      if (!model) return null;
      return ["tip", "attachmentStart", "attachmentEnd"].find((handle) =>
        Math.hypot(model[handle].x - point.x, model[handle].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom) || null;
    }
  }

  namespace.ImageEditorCalloutTool = ImageEditorCalloutTool;
})(typeof window !== "undefined" ? window : globalThis);
