// Local pixel averaging for the image editor's Blur tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function brushWeight(x, y, size, hardness) {
    const radius = size / 2;
    const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
    if (distance >= radius) return 0;
    const hardRadius = radius * clamp(hardness, 0, 1);
    if (distance <= hardRadius || hardRadius >= radius) return 1;
    return 1 - (distance - hardRadius) / (radius - hardRadius);
  }

  function averagePremultipliedPixel(pixels, centerX, centerY, radius) {
    let alphaTotal = 0;
    const colorTotals = [0, 0, 0];
    let samples = 0;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
      const offset = (y * pixels.width + x) * 4;
      const alpha = pixels.data[offset + 3] / 255;
      alphaTotal += alpha;
      for (let channel = 0; channel < 3; channel += 1) colorTotals[channel] += pixels.data[offset + channel] * alpha;
      samples += 1;
    }
    const alpha = samples ? alphaTotal / samples : 0;
    return [
      alphaTotal ? colorTotals[0] / alphaTotal : 0,
      alphaTotal ? colorTotals[1] / alphaTotal : 0,
      alphaTotal ? colorTotals[2] / alphaTotal : 0,
      alpha * 255
    ];
  }

  class ImageEditorBlurStroke {
    /** Apply local blur stamps throughout one pointer gesture. */
    constructor(target, point, settings) {
      this.target = target;
      this.size = Math.max(1, Math.round(Number(settings.size) || 1));
      this.hardness = clamp(Number(settings.hardness), 0, 1);
      this.strength = clamp(Number(settings.strength), 0, 1);
      this.blurRadius = Math.max(1, Math.round(this.size / 8));
      this.lastPoint = { x: point.x, y: point.y };
      this.stamp(point);
    }

    stamp(point) {
      const source = new ImageData(new Uint8ClampedArray(this.target.data), this.target.width, this.target.height);
      for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
        const weight = brushWeight(x, y, this.size, this.hardness);
        if (weight <= 0) continue;
        const targetX = Math.floor(point.x - this.size / 2 + x);
        const targetY = Math.floor(point.y - this.size / 2 + y);
        if (targetX < 0 || targetY < 0 || targetX >= this.target.width || targetY >= this.target.height) continue;
        const offset = (targetY * this.target.width + targetX) * 4;
        const blurred = averagePremultipliedPixel(source, targetX, targetY, this.blurRadius);
        const amount = this.strength * weight;
        for (let channel = 0; channel < 4; channel += 1) {
          this.target.data[offset + channel] = Math.round(source.data[offset + channel] + (blurred[channel] - source.data[offset + channel]) * amount);
        }
      }
    }

    /** Interpolate stamps closely enough to keep fast drags continuous. */
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

  class ImageEditorBlurTool {
    /** Own the transient pixels and preview for one blur gesture. */
    constructor() {
      this.stroke = null;
      this.previewCanvas = null;
    }

    begin(point, targetCanvas, settings) {
      if (!targetCanvas) return false;
      const context = targetCanvas.getContext("2d", { willReadFrequently: true });
      const target = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
      this.stroke = new ImageEditorBlurStroke(target, point, settings);
      this.previewCanvas = document.createElement("canvas");
      this.previewCanvas.width = target.width;
      this.previewCanvas.height = target.height;
      this.refreshPreview();
      return true;
    }

    refreshPreview() {
      if (this.stroke && this.previewCanvas) this.previewCanvas.getContext("2d").putImageData(this.stroke.target, 0, 0);
    }

    update(point) {
      if (!this.stroke) return false;
      this.stroke.update(point);
      this.refreshPreview();
      return true;
    }

    finish() {
      if (!this.stroke) return null;
      const pixels = this.stroke.target;
      this.cancel();
      return pixels;
    }

    cancel() {
      this.stroke = null;
      this.previewCanvas = null;
    }
  }

  namespace.ImageEditorBlurStroke = ImageEditorBlurStroke;
  namespace.ImageEditorBlurTool = ImageEditorBlurTool;
})(typeof window !== "undefined" ? window : globalThis);
