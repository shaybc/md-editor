// Source sampling and raster stroke generation for the image-editor Clone Stamp tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function cloneCanvas(source) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext("2d").drawImage(source, 0, 0);
    return canvas;
  }

  function brushMask(context, size, hardness) {
    const radius = size / 2;
    const hardRadius = radius * Math.max(0, Math.min(1, hardness));
    if (hardRadius >= radius - 0.01) {
      context.fillStyle = "#000";
    } else {
      const gradient = context.createRadialGradient(radius, radius, hardRadius, radius, radius, radius);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
    }
    context.beginPath();
    context.arc(radius, radius, radius, 0, Math.PI * 2);
    context.fill();
  }

  class ImageEditorCloneStampTool {
    /** Maintain the clone source and build one transparent destination stroke. */
    constructor() {
      this.sourcePoint = null;
      this.offset = null;
      this.strokeCanvas = null;
      this.sourceCanvas = null;
      this.lastPoint = null;
      this.settings = null;
    }

    /** Set the pixel source anchor selected with Alt/Option-click. */
    setSource(point) {
      this.sourcePoint = { x: point.x, y: point.y };
      this.offset = null;
    }

    /** Begin a stroke using an immutable snapshot of the requested sampling surface. */
    begin(point, sourceCanvas, settings) {
      if (!this.sourcePoint || !sourceCanvas) return false;
      this.sourceCanvas = cloneCanvas(sourceCanvas);
      this.strokeCanvas = document.createElement("canvas");
      this.strokeCanvas.width = sourceCanvas.width;
      this.strokeCanvas.height = sourceCanvas.height;
      this.settings = settings;
      if (!settings.aligned || !this.offset) this.offset = {
        x: this.sourcePoint.x - point.x,
        y: this.sourcePoint.y - point.y
      };
      this.lastPoint = { x: point.x, y: point.y };
      this.paintPoint(point);
      return true;
    }

    paintPoint(point) {
      const size = Math.max(1, Number(this.settings.size) || 1);
      const radius = size / 2;
      const stamp = document.createElement("canvas");
      stamp.width = stamp.height = Math.max(1, Math.ceil(size));
      const context = stamp.getContext("2d");
      context.drawImage(this.sourceCanvas,
        point.x + this.offset.x - radius, point.y + this.offset.y - radius, size, size,
        0, 0, size, size);
      context.globalCompositeOperation = "destination-in";
      brushMask(context, size, Number(this.settings.hardness));
      const destination = this.strokeCanvas.getContext("2d");
      destination.globalAlpha = Math.max(0, Math.min(1, Number(this.settings.opacity)));
      destination.drawImage(stamp, point.x - radius, point.y - radius);
      destination.globalAlpha = 1;
    }

    /** Extend the current stroke with evenly spaced clone stamps. */
    update(point) {
      if (!this.strokeCanvas || !this.lastPoint) return false;
      const dx = point.x - this.lastPoint.x;
      const dy = point.y - this.lastPoint.y;
      const distance = Math.hypot(dx, dy);
      const spacing = Math.max(1, Number(this.settings.size) * 0.12);
      const steps = Math.max(1, Math.ceil(distance / spacing));
      for (let step = 1; step <= steps; step += 1) this.paintPoint({
        x: this.lastPoint.x + dx * step / steps,
        y: this.lastPoint.y + dy * step / steps
      });
      this.lastPoint = { x: point.x, y: point.y };
      return true;
    }

    /** Return the completed transparent stroke and preserve only aligned source state. */
    finish() {
      if (!this.strokeCanvas) return null;
      const pixels = this.strokeCanvas.getContext("2d").getImageData(0, 0, this.strokeCanvas.width, this.strokeCanvas.height);
      this.strokeCanvas = null;
      this.sourceCanvas = null;
      this.lastPoint = null;
      this.settings = null;
      return pixels;
    }

    cancel() {
      this.strokeCanvas = null;
      this.sourceCanvas = null;
      this.lastPoint = null;
      this.settings = null;
    }
  }

  namespace.ImageEditorCloneStampTool = ImageEditorCloneStampTool;
})(typeof window !== "undefined" ? window : globalThis);
