// Canvas renderer for the non-destructive layer Grain effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createRandom(seed) {
    let state = seed >>> 0 || 0x9e3779b9;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function gaussianSample(random) {
    const first = Math.max(Number.EPSILON, random());
    const second = random();
    return Math.max(-1, Math.min(1, Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second) / 3));
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  /**
   * Return a deterministic noisy copy of a rendered layer while preserving alpha.
   * @param {HTMLCanvasElement} source - Fully rendered source layer.
   * @param {object|null} effect - Normalized Grain descriptor.
   * @returns {HTMLCanvasElement} Source or a grain-adjusted transparent canvas.
   */
  function apply(source, effect) {
    const amount = Math.max(0, Math.min(1, Number(effect?.amount) || 0));
    if (!source || !effect?.enabled || amount <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const random = createRandom((Number(effect.seed) >>> 0) ^ canvas.width ^ Math.imul(canvas.height, 2654435761));
    const sample = effect.distribution === "uniform"
      ? () => random() * 2 - 1
      : () => gaussianSample(random);
    const amplitude = amount * 255;
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3] === 0) continue;
      if (effect.monochromatic) {
        const noise = sample() * amplitude;
        pixels.data[index] = clampChannel(pixels.data[index] + noise);
        pixels.data[index + 1] = clampChannel(pixels.data[index + 1] + noise);
        pixels.data[index + 2] = clampChannel(pixels.data[index + 2] + noise);
      } else {
        pixels.data[index] = clampChannel(pixels.data[index] + sample() * amplitude);
        pixels.data[index + 1] = clampChannel(pixels.data[index + 1] + sample() * amplitude);
        pixels.data[index + 2] = clampChannel(pixels.data[index + 2] + sample() * amplitude);
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  namespace.ImageEditorGrainRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
