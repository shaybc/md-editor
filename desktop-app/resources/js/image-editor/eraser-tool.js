// Alpha-mask generation for the image editor's Eraser tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function eraserWeight(x, y, size, hardness) {
    const radius = size / 2;
    const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
    if (distance >= radius) return 0;
    const hardRadius = radius * clamp(hardness, 0, 1);
    if (distance <= hardRadius || hardRadius >= radius) return 1;
    return 1 - (distance - hardRadius) / (radius - hardRadius);
  }

  class ImageEditorEraserStroke {
    /**
     * Build one destination-out mask for a complete pointer gesture.
     * @param {number} width - Layer surface width in pixels.
     * @param {number} height - Layer surface height in pixels.
     * @param {{x:number,y:number}} point - Initial canvas-space point.
     * @param {{size:number,hardness:number}} settings - Eraser tip settings.
     */
    constructor(width, height, point, settings) {
      this.mask = new ImageData(width, height);
      this.size = Math.max(1, Math.round(Number(settings.size) || 1));
      this.hardness = clamp(Number(settings.hardness), 0, 1);
      this.lastPoint = { x: point.x, y: point.y };
      this.stamp(point);
    }

    stamp(point) {
      for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
        const weight = eraserWeight(x, y, this.size, this.hardness);
        if (weight <= 0) continue;
        const targetX = Math.floor(point.x - this.size / 2 + x);
        const targetY = Math.floor(point.y - this.size / 2 + y);
        if (targetX < 0 || targetY < 0 || targetX >= this.mask.width || targetY >= this.mask.height) continue;
        const alphaOffset = (targetY * this.mask.width + targetX) * 4 + 3;
        this.mask.data[alphaOffset] = Math.max(this.mask.data[alphaOffset], Math.round(weight * 255));
      }
    }

    /** Extend the gesture with closely spaced stamps so fast drags remain continuous. */
    update(point) {
      const dx = point.x - this.lastPoint.x;
      const dy = point.y - this.lastPoint.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, this.size * 0.12)));
      for (let step = 1; step <= steps; step += 1) this.stamp({
        x: this.lastPoint.x + dx * step / steps,
        y: this.lastPoint.y + dy * step / steps
      });
      this.lastPoint = { x: point.x, y: point.y };
    }
  }

  class ImageEditorEraserTool {
    /** Own the transient mask for one eraser gesture. */
    constructor() {
      this.stroke = null;
    }

    begin(point, width, height, settings) {
      if (!(width > 0 && height > 0)) return false;
      this.stroke = new ImageEditorEraserStroke(width, height, point, settings);
      return true;
    }

    update(point) {
      if (!this.stroke) return false;
      this.stroke.update(point);
      return true;
    }

    finish() {
      if (!this.stroke) return null;
      const mask = this.stroke.mask;
      this.cancel();
      return mask;
    }

    cancel() {
      this.stroke = null;
    }
  }

  namespace.ImageEditorEraserStroke = ImageEditorEraserStroke;
  namespace.ImageEditorEraserTool = ImageEditorEraserTool;
})(typeof window !== "undefined" ? window : globalThis);
