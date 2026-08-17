// Grayscale color-dodge renderer for the non-destructive Pencil-Sketch layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createGrayscaleSurface(source, inverted) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const gray = Math.round(image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722);
      const value = inverted ? 255 - gray : gray;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  function blurSurface(source, radius) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.filter = `blur(${radius}px)`;
    context.drawImage(source, 0, 0);
    context.filter = "none";
    return canvas;
  }

  function parseColor(color) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  }

  /**
   * Convert a layer surface into pencil lines over a configurable paper color.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Pencil-Sketch descriptor.
   * @returns {HTMLCanvasElement} Source or a pencil-sketch canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPencilSketchEffect.normalize(effect);
    if (descriptor.strength <= 0) return source;
    const graySurface = createGrayscaleSurface(source, false);
    const blurredInversion = blurSurface(createGrayscaleSurface(source, true), descriptor.radius);
    const gray = graySurface.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
    const blurred = blurredInversion.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const output = context.getImageData(0, 0, canvas.width, canvas.height);
    const paper = parseColor(descriptor.paperColor);
    const lineMultiplier = 0.5 + descriptor.darkness * 1.5;

    for (let offset = 0; offset < output.data.length; offset += 4) {
      if (output.data[offset + 3] === 0) continue;
      const denominator = 255 - blurred.data[offset];
      const dodge = denominator <= 0 ? 255 : Math.min(255, gray.data[offset] * 255 / denominator);
      const sketch = Math.max(0, 255 - (255 - dodge) * lineMultiplier);
      for (let channel = 0; channel < 3; channel += 1) {
        const mapped = paper[channel] * sketch / 255;
        output.data[offset + channel] = Math.round(output.data[offset + channel] + (mapped - output.data[offset + channel]) * descriptor.strength);
      }
    }

    context.putImageData(output, 0, 0);
    return canvas;
  }

  namespace.ImageEditorPencilSketchRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
