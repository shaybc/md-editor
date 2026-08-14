// Pixel transport for the image editor's Smudge tool.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function mixPixel(target, targetOffset, source, sourceOffset, amount) {
    const targetAlpha = target[targetOffset + 3] / 255;
    const sourceAlpha = source[sourceOffset + 3] / 255;
    const alpha = targetAlpha + (sourceAlpha - targetAlpha) * amount;
    for (let channel = 0; channel < 3; channel += 1) {
      const targetPremultiplied = target[targetOffset + channel] * targetAlpha;
      const sourcePremultiplied = source[sourceOffset + channel] * sourceAlpha;
      const premultiplied = targetPremultiplied + (sourcePremultiplied - targetPremultiplied) * amount;
      target[targetOffset + channel] = alpha > 0 ? Math.round(premultiplied / alpha) : 0;
    }
    target[targetOffset + 3] = Math.round(alpha * 255);
  }

  function brushWeight(x, y, size, hardness) {
    const radius = size / 2;
    const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
    if (distance >= radius) return 0;
    const hardRadius = radius * clamp(hardness, 0, 1);
    if (distance <= hardRadius || hardRadius >= radius) return 1;
    return 1 - (distance - hardRadius) / (radius - hardRadius);
  }

  function samplePatch(pixels, point, size, fingerColor) {
    const patch = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const patchOffset = (y * size + x) * 4;
      if (fingerColor) {
        patch.set(fingerColor, patchOffset);
        continue;
      }
      const sourceX = Math.floor(point.x - size / 2 + x);
      const sourceY = Math.floor(point.y - size / 2 + y);
      if (sourceX < 0 || sourceY < 0 || sourceX >= pixels.width || sourceY >= pixels.height) continue;
      const sourceOffset = (sourceY * pixels.width + sourceX) * 4;
      patch.set(pixels.data.subarray(sourceOffset, sourceOffset + 4), patchOffset);
    }
    return patch;
  }

  class ImageEditorSmudgeStroke {
    /** Carry sampled pixels through one smudge gesture. */
    constructor(target, source, point, settings) {
      this.target = target;
      this.size = Math.max(1, Math.round(Number(settings.size) || 1));
      this.hardness = clamp(Number(settings.hardness), 0, 1);
      this.strength = clamp(Number(settings.strength), 0, 1);
      this.carry = samplePatch(source, point, this.size, settings.fingerColor || null);
      this.lastPoint = { x: point.x, y: point.y };
      this.stamp(point);
    }

    stamp(point) {
      const pickup = 0.2 + this.strength * 0.3;
      for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) {
        const weight = brushWeight(x, y, this.size, this.hardness);
        if (weight <= 0) continue;
        const targetX = Math.floor(point.x - this.size / 2 + x);
        const targetY = Math.floor(point.y - this.size / 2 + y);
        if (targetX < 0 || targetY < 0 || targetX >= this.target.width || targetY >= this.target.height) continue;
        const targetOffset = (targetY * this.target.width + targetX) * 4;
        const carryOffset = (y * this.size + x) * 4;
        const original = this.target.data.slice(targetOffset, targetOffset + 4);
        mixPixel(this.target.data, targetOffset, this.carry, carryOffset, this.strength * weight);
        mixPixel(this.carry, carryOffset, original, 0, pickup * weight);
      }
    }

    /** Extend the gesture with stamps spaced closely enough to avoid gaps. */
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

  class ImageEditorSmudgeTool {
    /** Own the transient pixels and preview canvas for one gesture. */
    constructor() {
      this.stroke = null;
      this.previewCanvas = null;
    }

    begin(point, targetCanvas, sourceCanvas, settings) {
      if (!targetCanvas || !sourceCanvas) return false;
      const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
      const target = targetContext.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
      const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      this.stroke = new ImageEditorSmudgeStroke(target, source, point, settings);
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

  namespace.ImageEditorSmudgeStroke = ImageEditorSmudgeStroke;
  namespace.ImageEditorSmudgeTool = ImageEditorSmudgeTool;
})(typeof window !== "undefined" ? window : globalThis);
