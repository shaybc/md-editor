// Directional horizontal streak renderer for the non-destructive Gust layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const PROFILES = Object.freeze({
    drift: { minimumLength: 10, lengthRange: 24, edgeThreshold: 24, opacity: 0.58, decay: 1.3 },
    burst: { minimumLength: 28, lengthRange: 44, edgeThreshold: 10, opacity: 0.82, decay: 0.75 },
    stagger: { minimumLength: 14, lengthRange: 42, edgeThreshold: 16, opacity: 0.7, decay: 1.05 }
  });

  function deterministicNoise(x, y) {
    let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function luminance(data, index) {
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  }

  function blendTrailPixel(output, index, red, green, blue, trailAlpha) {
    const sourceAlpha = output[index + 3] / 255;
    const overlayAlpha = Math.max(0, Math.min(1, trailAlpha));
    const resultAlpha = overlayAlpha + sourceAlpha * (1 - overlayAlpha);
    if (resultAlpha <= 0) return;
    output[index] = Math.round((red * overlayAlpha + output[index] * sourceAlpha * (1 - overlayAlpha)) / resultAlpha);
    output[index + 1] = Math.round((green * overlayAlpha + output[index + 1] * sourceAlpha * (1 - overlayAlpha)) / resultAlpha);
    output[index + 2] = Math.round((blue * overlayAlpha + output[index + 2] * sourceAlpha * (1 - overlayAlpha)) / resultAlpha);
    output[index + 3] = Math.round(resultAlpha * 255);
  }

  function shouldStartTrail(source, currentIndex, incomingIndex, profile) {
    const currentAlpha = source[currentIndex + 3];
    const incomingAlpha = source[incomingIndex + 3];
    if (incomingAlpha > currentAlpha + 18) return true;
    return incomingAlpha > 20 && luminance(source, incomingIndex) > luminance(source, currentIndex) + profile.edgeThreshold;
  }

  function renderRow(source, output, width, y, descriptor, profile) {
    const step = descriptor.direction === "right" ? -1 : 1;
    const start = step < 0 ? width - 1 : 0;
    const end = step < 0 ? -1 : width;
    let previousIndex = -1;
    let remaining = 0;
    let trailLength = 1;
    let trailRed = 0;
    let trailGreen = 0;
    let trailBlue = 0;
    let trailAlpha = 0;

    for (let x = start; x !== end; x += step) {
      const index = (y * width + x) * 4;
      if (previousIndex >= 0 && shouldStartTrail(source, index, previousIndex, profile)) {
        const noise = deterministicNoise(x, y);
        trailLength = Math.round(profile.minimumLength + noise * profile.lengthRange);
        if (descriptor.method === "stagger") trailLength = Math.max(3, Math.round(trailLength * (0.45 + deterministicNoise(y, x) * 0.9)));
        remaining = trailLength;
        trailRed = source[previousIndex];
        trailGreen = source[previousIndex + 1];
        trailBlue = source[previousIndex + 2];
        trailAlpha = source[previousIndex + 3] / 255;
      }

      if (remaining > 0) {
        const progress = remaining / trailLength;
        const staggerGate = descriptor.method !== "stagger" || deterministicNoise(x >> 2, y >> 1) > 0.18;
        if (staggerGate) blendTrailPixel(output, index, trailRed, trailGreen, trailBlue, trailAlpha * profile.opacity * Math.pow(progress, profile.decay));
        remaining -= 1;
      }
      previousIndex = index;
    }
  }

  /**
   * Return a rendered layer with deterministic edge-driven horizontal streaks.
   * @param {HTMLCanvasElement} source - Fully rendered source layer.
   * @param {object|null} effect - Normalized Gust descriptor.
   * @returns {HTMLCanvasElement} Source or a gust-stylized transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 2 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorGustEffect.normalize(effect);
    const profile = PROFILES[descriptor.method] || PROFILES.drift;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const imageData = sourceContext.getImageData(0, 0, source.width, source.height);
    const output = new Uint8ClampedArray(imageData.data);
    for (let y = 0; y < source.height; y += 1) renderRow(imageData.data, output, source.width, y, descriptor, profile);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    const rendered = context.createImageData(source.width, source.height);
    rendered.data.set(output);
    context.putImageData(rendered, 0, 0);
    return canvas;
  }

  namespace.ImageEditorGustRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
