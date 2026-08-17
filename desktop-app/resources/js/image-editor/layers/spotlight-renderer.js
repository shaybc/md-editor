// Feathered elliptical-light renderer for the non-destructive Spotlight layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
  }

  function parseColor(color) {
    return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  }

  /**
   * Blend a colored elliptical spotlight into opaque source pixels while preserving source alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Spotlight descriptor.
   * @returns {HTMLCanvasElement} Source or a spotlight-lit transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorSpotlightEffect.normalize(effect);
    if (descriptor.brightness <= 0) return source;
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
    const hardEdge = Math.max(0, Math.min(0.98, 1 - descriptor.feather / 100));
    const light = parseColor(descriptor.color);

    for (let y = 0; y < canvas.height; y += 1) {
      const vertical = (y - centerY) / radiusY;
      if (Math.abs(vertical) > 1) continue;
      for (let x = 0; x < canvas.width; x += 1) {
        const horizontal = (x - centerX) / radiusX;
        const distance = Math.hypot(horizontal, vertical);
        if (distance >= 1) continue;
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset + 3] === 0) continue;
        const mask = 1 - smoothstep(hardEdge, 1, distance);
        const strength = Math.min(1, descriptor.brightness * mask);
        if (strength <= 0) continue;
        for (let channel = 0; channel < 3; channel += 1) {
          const base = pixels[offset + channel];
          const screened = 255 - (255 - base) * (255 - light[channel]) / 255;
          pixels[offset + channel] = Math.round(base + (screened - base) * strength);
        }
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorSpotlightRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
