// Reversed radial-gradient renderer for the non-destructive Vignette layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
  }

  function parseColor(color) {
    return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  }

  function softLight(base, blend) {
    return blend <= 0.5
      ? base - (1 - 2 * blend) * base * (1 - base)
      : base + (2 * blend - 1) * ((base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base)) - base);
  }

  /**
   * Darken opaque source edges with an editable radial gradient while preserving source alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Vignette descriptor.
   * @returns {HTMLCanvasElement} Source or a vignette-treated transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorVignetteEffect.normalize(effect);
    if (descriptor.amount <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const centerX = canvas.width * descriptor.positionX / 100;
    const centerY = canvas.height * descriptor.positionY / 100;
    const radiusX = Math.max(1, canvas.width * descriptor.width / 200);
    const radiusY = Math.max(1, canvas.height * descriptor.height / 200);
    const clearCenter = descriptor.clearCenter / 100;
    const fullEdge = clearCenter + Math.max(0.001, (1 - clearCenter) * descriptor.feather / 100);
    const color = parseColor(descriptor.color);

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset + 3] === 0) continue;
        const distance = Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY);
        const gradient = smoothstep(clearCenter, fullEdge, distance);
        if (gradient <= 0) continue;
        const luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
        const highlightFactor = 1 - descriptor.highlightProtection * luminance;
        const strength = descriptor.amount * gradient * highlightFactor;
        for (let channel = 0; channel < 3; channel += 1) {
          const base = pixels[offset + channel] / 255;
          const treated = softLight(base, color[channel]);
          pixels[offset + channel] = Math.round((base + (treated - base) * strength) * 255);
        }
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorVignetteRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
