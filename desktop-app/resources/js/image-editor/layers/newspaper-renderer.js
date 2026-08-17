// Luminance-driven dot-screen renderer for the non-destructive Newspaper layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function rgb(hex) {
    return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  }

  function luminance(data, index) {
    return (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
  }

  /**
   * Return a classic ink-on-paper halftone rendering while preserving source alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Newspaper effect descriptor.
   * @returns {HTMLCanvasElement} Source or a dot-screen-rendered transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorNewspaperEffect.normalize(effect);
    const sourcePixels = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    const output = context.createImageData(source.width, source.height);
    const ink = rgb(descriptor.inkColor);
    const paper = rgb(descriptor.paperColor);
    const size = descriptor.dotSize;
    const radians = descriptor.angle * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const centerX = (source.width - 1) / 2;
    const centerY = (source.height - 1) / 2;
    const contrastScale = 1 + descriptor.contrast * 3;
    const maximumRadius = size * Math.SQRT1_2;

    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const index = (y * source.width + x) * 4;
        const alpha = sourcePixels.data[index + 3];
        if (alpha === 0) continue;
        const deltaX = x - centerX;
        const deltaY = y - centerY;
        const screenX = deltaX * cosine + deltaY * sine;
        const screenY = -deltaX * sine + deltaY * cosine;
        const cellX = Math.round(screenX / size) * size;
        const cellY = Math.round(screenY / size) * size;
        const sampleX = Math.max(0, Math.min(source.width - 1, Math.round(centerX + cellX * cosine - cellY * sine)));
        const sampleY = Math.max(0, Math.min(source.height - 1, Math.round(centerY + cellX * sine + cellY * cosine)));
        const sampleIndex = (sampleY * source.width + sampleX) * 4;
        const tone = clamp((luminance(sourcePixels.data, sampleIndex) - 0.5) * contrastScale + 0.5);
        const darkness = 1 - tone;
        const radius = darkness <= 0.001 ? 0 : maximumRadius * Math.sqrt(darkness);
        const distance = Math.hypot(screenX - cellX, screenY - cellY);
        const coverage = radius === 0 ? 0 : clamp(radius - distance + 0.5);
        output.data[index] = Math.round(paper[0] + (ink[0] - paper[0]) * coverage);
        output.data[index + 1] = Math.round(paper[1] + (ink[1] - paper[1]) * coverage);
        output.data[index + 2] = Math.round(paper[2] + (ink[2] - paper[2]) * coverage);
        output.data[index + 3] = alpha;
      }
    }
    context.putImageData(output, 0, 0);
    return canvas;
  }

  namespace.ImageEditorNewspaperRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
