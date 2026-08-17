// Editable rounded-rectangle callout geometry, guide handles, and rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const CORNERS = Object.freeze(["topLeft", "topRight", "bottomRight", "bottomLeft"]);
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
      const radii = this.currentRadii();
      return {
        rect: { ...this.rect },
        radii,
        radius: radii.topLeft,
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
        const radius = Math.max(0, Number(defaultRadius) || 0);
        this.radii = Object.fromEntries(CORNERS.map((corner) => [corner, radius]));
        this.adjustAllCorners = bounds.adjustAllCorners !== false;
        this.bounds = { width: bounds.width, height: bounds.height };
        this.zoom = Math.max(0.25, Number(bounds.zoom) || 1);
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const handle = this.findHandle(point);
      if (handle) {
        this.activeHandle = handle;
        this.adjustAllCorners = bounds.adjustAllCorners !== false;
        if (handle.startsWith("corner:")) this.activeCorner = handle.slice("corner:".length);
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
      if (this.activeHandle.startsWith("corner:")) this.setRadius(this.radiusFromPoint(this.activeCorner, point), this.adjustAllCorners);
      else if (this.activeHandle === "tip") this.moveTip(point);
      else this.moveAttachment(this.activeHandle, point);
    }

    /** Finish the current body or guide drag while keeping the callout editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase === "drawing") {
        if (!this.rect.width || !this.rect.height) return false;
        this.normalizeRadii();
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
        this.drawBodyPreview(context, state);
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
      CORNERS.forEach((corner) => {
        const point = this.getCornerHandlePoint(corner);
        const active = this.activeHandle === "corner:" + corner;
        context.fillStyle = active ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Draw the body while its initial bounds are being dragged. */
    drawBodyPreview(context, state) {
      namespace.drawRoundedRectangle(context, this.rect, this.currentRadii(), state);
    }

    /** Rasterize the accepted callout into a tightly bounded transparent layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = this.rasterPadding(state, model);
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

    /** Return the transparent margin required around this callout's rasterized geometry. */
    rasterPadding(state) {
      return Math.ceil(state.lineWidth / 2) + 2;
    }

    /** Discard the editable callout and its guide. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.radii = Object.fromEntries(CORNERS.map((corner) => [corner, 0]));
      this.activeCorner = "topLeft";
      this.adjustAllCorners = true;
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
      const gap = Math.min(MINIMUM_ATTACHMENT_GAP, range.maximum - range.minimum);
      if (handle === "attachmentStart") this.attachmentStart = Math.min(value, this.attachmentEnd - gap);
      else this.attachmentEnd = Math.max(value, this.attachmentStart + gap);
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
      const radii = this.currentRadii();
      const values = {
        top: [this.rect.x + radii.topLeft, this.rect.x + this.rect.width - radii.topRight],
        right: [this.rect.y + radii.topRight, this.rect.y + this.rect.height - radii.bottomRight],
        bottom: [this.rect.x + radii.bottomLeft, this.rect.x + this.rect.width - radii.bottomRight],
        left: [this.rect.y + radii.topLeft, this.rect.y + this.rect.height - radii.bottomLeft]
      }[side];
      const [minimum, maximum] = values;
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
      const { rect, radii, side, attachmentStart, attachmentEnd, tip } = model;
      const right = rect.x + rect.width;
      const bottom = rect.y + rect.height;
      context.beginPath();
      context.moveTo(rect.x + radii.topLeft, rect.y);
      if (side === "top") this.traceTail(context, attachmentStart, tip, attachmentEnd);
      context.lineTo(right - radii.topRight, rect.y);
      context.quadraticCurveTo(right, rect.y, right, rect.y + radii.topRight);
      if (side === "right") this.traceTail(context, attachmentStart, tip, attachmentEnd);
      context.lineTo(right, bottom - radii.bottomRight);
      context.quadraticCurveTo(right, bottom, right - radii.bottomRight, bottom);
      if (side === "bottom") this.traceTail(context, attachmentEnd, tip, attachmentStart);
      context.lineTo(rect.x + radii.bottomLeft, bottom);
      context.quadraticCurveTo(rect.x, bottom, rect.x, bottom - radii.bottomLeft);
      if (side === "left") this.traceTail(context, attachmentEnd, tip, attachmentStart);
      context.lineTo(rect.x, rect.y + radii.topLeft);
      context.quadraticCurveTo(rect.x, rect.y, rect.x + radii.topLeft, rect.y);
      context.closePath();
    }

    traceTail(context, first, tip, second) {
      context.lineTo(first.x, first.y);
      context.lineTo(tip.x, tip.y);
      context.lineTo(second.x, second.y);
    }

    /** Set every body corner radius or only the active corner. */
    setRadius(radius, adjustAllCorners) {
      if (!this.rect) return false;
      const value = clamp(Number(radius) || 0, 0, this.maximumRadius());
      if (adjustAllCorners) CORNERS.forEach((corner) => { this.radii[corner] = value; });
      else this.radii[this.activeCorner] = value;
      this.normalizeAttachments();
      return true;
    }

    /** Make all callout corners match the active corner. */
    unifyCorners() {
      return this.setRadius(this.radii[this.activeCorner], true);
    }

    /** Return the on-canvas radius guide for one body corner. */
    getCornerHandlePoint(corner) {
      const model = this.model;
      if (!model) return null;
      const { rect, radii } = model;
      if (corner === "topLeft") return { x: rect.x + radii.topLeft, y: rect.y };
      if (corner === "topRight") return { x: rect.x + rect.width - radii.topRight, y: rect.y };
      if (corner === "bottomRight") return { x: rect.x + rect.width - radii.bottomRight, y: rect.y + rect.height };
      return { x: rect.x + radii.bottomLeft, y: rect.y + rect.height };
    }

    maximumRadius() {
      return this.rect ? Math.max(0, Math.min(this.rect.width, this.rect.height) / 2) : 0;
    }

    currentRadii() {
      const maximum = this.maximumRadius();
      return Object.fromEntries(CORNERS.map((corner) => [corner, Math.min(maximum, Math.max(0, this.radii[corner]))]));
    }

    normalizeRadii() {
      const normalized = this.currentRadii();
      CORNERS.forEach((corner) => { this.radii[corner] = normalized[corner]; });
    }

    normalizeAttachments() {
      if (!this.tip) return;
      const range = this.sideRange(this.side);
      const gap = Math.min(MINIMUM_ATTACHMENT_GAP, range.maximum - range.minimum);
      const center = clamp((this.attachmentStart + this.attachmentEnd) / 2, range.minimum + gap / 2, range.maximum - gap / 2);
      const halfWidth = Math.min(Math.max(gap / 2, (this.attachmentEnd - this.attachmentStart) / 2), (range.maximum - range.minimum) / 2);
      this.attachmentStart = center - halfWidth;
      this.attachmentEnd = center + halfWidth;
    }

    radiusFromPoint(corner, point) {
      if (corner === "topRight" || corner === "bottomRight") return this.rect.x + this.rect.width - point.x;
      return point.x - this.rect.x;
    }

    contains(point) {
      return point.x >= this.rect.x && point.x <= this.rect.x + this.rect.width &&
        point.y >= this.rect.y && point.y <= this.rect.y + this.rect.height;
    }

    findHandle(point) {
      const model = this.model;
      if (!model) return null;
      const corner = CORNERS.find((name) => {
        const handle = this.getCornerHandlePoint(name);
        return Math.hypot(handle.x - point.x, handle.y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom;
      });
      if (corner) return "corner:" + corner;
      return ["tip", "attachmentStart", "attachmentEnd"].find((handle) =>
        Math.hypot(model[handle].x - point.x, model[handle].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom) || null;
    }
  }

  namespace.ImageEditorCalloutTool = ImageEditorCalloutTool;
})(typeof window !== "undefined" ? window : globalThis);
