// Gradient-map-inspired renderer for the non-destructive Contrast B&W layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function highContrastGradient(value) {
    return value * value * (3 - 2 * value);
  }

  /**
   * Convert a layer surface to contrast-enhanced grayscale while preserving source alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Contrast B&W descriptor.
   * @returns {HTMLCanvasElement} Source or a contrast-enhanced grayscale canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorContrastBwEffect.normalize(effect);
    if (descriptor.strength <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue;
      const luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
      const mapped = luminance + (highContrastGradient(luminance) - luminance) * descriptor.smoothness;
      const gray = Math.round(mapped * 255);
      pixels[offset] = Math.round(pixels[offset] + (gray - pixels[offset]) * descriptor.strength);
      pixels[offset + 1] = Math.round(pixels[offset + 1] + (gray - pixels[offset + 1]) * descriptor.strength);
      pixels[offset + 2] = Math.round(pixels[offset + 2] + (gray - pixels[offset + 2]) * descriptor.strength);
    }

    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorContrastBwRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
