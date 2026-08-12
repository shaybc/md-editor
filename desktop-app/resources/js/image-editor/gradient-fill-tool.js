// Editable two-color gradient behavior for the image-editor paint bucket.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value)));
  const pointAlong = (start, end, ratio) => ({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
  const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  function projectionRatio(point, start, end) {
    const deltaX = end.x - start.x, deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    return lengthSquared ? ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared : 0.5;
  }
  class ImageEditorGradientFillTool {
    /** Own one editable two-color flood-fill gradient and its on-canvas guides. */
    constructor() { this.reset(); }
    get isEditing() { return Boolean(this.region && this.startPoint && this.endPoint); }
    /** Start a gradient over the contiguous bucket region beneath the pointer. */
    start(context, point, startColor, endColor) {
      this.region = namespace.createFloodFillRegion(context, point);
      const bounds = this.region.bounds;
      const centerY = bounds.y + bounds.height / 2;
      const inset = Math.min(8, Math.max(0, bounds.width / 6));
      this.startPoint = { x: bounds.x + inset, y: centerY };
      this.endPoint = { x: bounds.x + Math.max(bounds.width - 1 - inset, inset + 1), y: centerY };
      if (pointDistance(this.startPoint, this.endPoint) < 12) {
        this.startPoint = { x: point.x - 12, y: point.y };
        this.endPoint = { x: point.x + 12, y: point.y };
      }
      this.startColor = startColor; this.endColor = endColor;
      this.boundary = 0.5; this.transition = 0.5; this.dragHandle = "";
      return true;
    }
    /** Return controls for angle, boundary location, and transition width. */
    guidePoints() {
      const halfTransition = this.transition / 2;
      return {
        start: this.startPoint, end: this.endPoint,
        boundary: pointAlong(this.startPoint, this.endPoint, this.boundary),
        transitionStart: pointAlong(this.startPoint, this.endPoint, this.boundary - halfTransition),
        transitionEnd: pointAlong(this.startPoint, this.endPoint, this.boundary + halfTransition)
      };
    }
    /** Begin dragging a guide, or identify a color side inside the active region. */
    begin(point, zoom) {
      if (!this.isEditing) return { action: "none" };
      const hitRadius = 8 / Math.max(0.25, Number(zoom) || 1);
      const guides = this.guidePoints();
      const handle = ["start", "end", "boundary", "transitionStart", "transitionEnd"].find((name) => pointDistance(point, guides[name]) <= hitRadius);
      if (handle) { this.dragHandle = handle; return { action: "guide", started: true, handle }; }
      return this.contains(point) ? { action: "side", side: this.sideAt(point) } : { action: "outside" };
    }
    /** Update the active guide from a canvas pointer position. */
    update(point) {
      if (!this.dragHandle) return false;
      if (this.dragHandle === "start" || this.dragHandle === "end") {
        this[this.dragHandle + "Point"] = { x: point.x, y: point.y };
        return true;
      }
      const ratio = clamp(projectionRatio(point, this.startPoint, this.endPoint), 0, 1);
      if (this.dragHandle === "boundary") {
        this.boundary = ratio;
        this.transition = Math.min(this.transition, 2 * Math.min(this.boundary, 1 - this.boundary));
      } else {
        this.transition = clamp(Math.abs(ratio - this.boundary) * 2, 0, 2 * Math.min(this.boundary, 1 - this.boundary));
      }
      return true;
    }
    /** Finish the current guide drag while retaining the editable gradient. */
    end() { this.dragHandle = ""; }
    /** Determine whether a point belongs to the active contiguous fill region. */
    contains(point) {
      if (!this.region) return false;
      const x = Math.floor(point.x), y = Math.floor(point.y);
      if (x < 0 || y < 0 || x >= this.region.width || y >= this.region.height) return false;
      const index = y * this.region.width + x;
      return Boolean(this.region.filled[index] || this.region.edgeCoverage[index]);
    }
    /** Resolve which color side contains a point relative to the boundary guide. */
    sideAt(point) { return projectionRatio(point, this.startPoint, this.endPoint) <= this.boundary ? "start" : "end"; }
    /** Change one gradient-side color without altering its geometry. */
    setColor(side, color) { if (side === "start") this.startColor = color; else this.endColor = color; }
    /** Paint the current gradient into its collected flood region. */
    paint(context) {
      if (!this.isEditing) return false;
      const first = namespace.colorToRgba(this.startColor), second = namespace.colorToRgba(this.endColor);
      const transitionStart = this.boundary - this.transition / 2, transitionEnd = this.boundary + this.transition / 2;
      return namespace.paintFloodFillRegion(context, this.region, (x, y) => {
        const ratio = projectionRatio({ x: x + 0.5, y: y + 0.5 }, this.startPoint, this.endPoint);
        if (this.transition <= 0.001) return ratio <= this.boundary ? first : second;
        if (ratio <= transitionStart) return first;
        if (ratio >= transitionEnd) return second;
        const mix = (ratio - transitionStart) / this.transition;
        return first.map((channel, index) => Math.round(channel + (second[index] - channel) * mix));
      });
    }
    /** Draw compact canvas guides over the live gradient preview. */
    drawGuides(context, zoom) {
      if (!this.isEditing) return;
      const scale = Math.max(0.25, Number(zoom) || 1), guides = this.guidePoints();
      const radius = 5 / scale, guideSize = 4 / scale;
      context.save();
      context.lineWidth = 3 / scale; context.strokeStyle = "rgba(255, 255, 255, 0.92)";
      context.beginPath(); context.moveTo(this.startPoint.x, this.startPoint.y); context.lineTo(this.endPoint.x, this.endPoint.y); context.stroke();
      context.lineWidth = 1 / scale; context.strokeStyle = "#1473e6"; context.stroke();
      context.lineWidth = 5 / scale; context.strokeStyle = "rgba(20, 115, 230, 0.28)";
      context.beginPath(); context.moveTo(guides.transitionStart.x, guides.transitionStart.y); context.lineTo(guides.transitionEnd.x, guides.transitionEnd.y); context.stroke();
      [[guides.start, this.startColor], [guides.end, this.endColor]].forEach(([point, color]) => {
        context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = color; context.fill(); context.lineWidth = 2 / scale; context.strokeStyle = "#1473e6"; context.stroke();
      });
      [guides.transitionStart, guides.transitionEnd].forEach((point) => {
        context.fillStyle = "#ffffff"; context.strokeStyle = "#1473e6"; context.lineWidth = 1 / scale;
        context.fillRect(point.x - guideSize, point.y - guideSize, guideSize * 2, guideSize * 2);
        context.strokeRect(point.x - guideSize, point.y - guideSize, guideSize * 2, guideSize * 2);
      });
      context.translate(guides.boundary.x, guides.boundary.y); context.rotate(Math.PI / 4);
      context.fillStyle = "#1473e6"; context.fillRect(-guideSize, -guideSize, guideSize * 2, guideSize * 2);
      context.restore();
    }
    /** Clear the editable gradient and transient guide state. */
    reset() {
      this.region = null; this.startPoint = null; this.endPoint = null;
      this.startColor = "#000000"; this.endColor = "#ffffff";
      this.boundary = 0.5; this.transition = 0.5; this.dragHandle = "";
    }
  }
  namespace.ImageEditorGradientFillTool = ImageEditorGradientFillTool;
})(typeof window !== "undefined" ? window : globalThis);
