// Canvas renderer for the non-destructive layer Vortex effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function copyPixel(source, target, sourceIndex, targetIndex) {
    target[targetIndex] = source[sourceIndex];
    target[targetIndex + 1] = source[sourceIndex + 1];
    target[targetIndex + 2] = source[sourceIndex + 2];
    target[targetIndex + 3] = source[sourceIndex + 3];
  }

  function samplePixel(pixels, width, height, x, y, target, targetIndex) {
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const horizontal = x - x0;
    const vertical = y - y0;
    const topLeft = (y0 * width + x0) * 4;
    const topRight = (y0 * width + x1) * 4;
    const bottomLeft = (y1 * width + x0) * 4;
    const bottomRight = (y1 * width + x1) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const top = pixels[topLeft + channel] * (1 - horizontal) + pixels[topRight + channel] * horizontal;
      const bottom = pixels[bottomLeft + channel] * (1 - horizontal) + pixels[bottomRight + channel] * horizontal;
      target[targetIndex + channel] = Math.round(top * (1 - vertical) + bottom * vertical);
    }
  }

  /**
   * Return a smoothly twisted copy of a rendered layer while preserving transparent pixels.
   * @param {HTMLCanvasElement} source - Fully rendered source layer.
   * @param {object|null} effect - Normalized Vortex descriptor with an angle in degrees.
   * @returns {HTMLCanvasElement} Source or a vortex-distorted transparent canvas.
   */
  function apply(source, effect) {
    const angle = Math.max(-999, Math.min(999, Number(effect?.angle) || 0));
    if (!source || !effect?.enabled || angle === 0 || source.width < 2 || source.height < 2) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const distorted = context.createImageData(canvas.width, canvas.height);
    const centerX = (canvas.width - 1) / 2;
    const centerY = (canvas.height - 1) / 2;
    const radiusX = Math.max(1, centerX);
    const radiusY = Math.max(1, centerY);
    const radians = angle * Math.PI / 180;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const targetIndex = (y * canvas.width + x) * 4;
        const normalizedX = (x - centerX) / radiusX;
        const normalizedY = (y - centerY) / radiusY;
        const radius = Math.hypot(normalizedX, normalizedY);
        if (radius >= 1) {
          copyPixel(original.data, distorted.data, targetIndex, targetIndex);
          continue;
        }
        const falloff = (1 - radius) * (1 - radius);
        const sourceAngle = Math.atan2(normalizedY, normalizedX) - radians * falloff;
        const sourceX = centerX + Math.cos(sourceAngle) * radius * radiusX;
        const sourceY = centerY + Math.sin(sourceAngle) * radius * radiusY;
        samplePixel(original.data, canvas.width, canvas.height, sourceX, sourceY, distorted.data, targetIndex);
      }
    }
    context.putImageData(distorted, 0, 0);
    return canvas;
  }

  namespace.ImageEditorVortexRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
