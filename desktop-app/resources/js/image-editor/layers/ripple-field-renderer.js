// Canvas renderer for the non-destructive layer Ripple Field effect.
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

  function randomBetween(random, minimum, maximum) {
    return minimum + (maximum - minimum) * random();
  }

  function waveValue(type, radians) {
    const sine = Math.sin(radians);
    if (type === "triangle") return 2 / Math.PI * Math.asin(sine);
    if (type === "square") return sine < 0 ? -1 : 1;
    return sine;
  }

  function resolveCoordinate(value, size, mode) {
    if (mode === "wrap") return ((value % size) + size) % size;
    return Math.max(0, Math.min(size - 1, value));
  }

  function samplePixel(pixels, width, height, x, y, mode, target, targetIndex) {
    const resolvedX = resolveCoordinate(x, width, mode);
    const resolvedY = resolveCoordinate(y, height, mode);
    const x0 = Math.floor(resolvedX);
    const y0 = Math.floor(resolvedY);
    const x1 = mode === "wrap" ? (x0 + 1) % width : Math.min(width - 1, x0 + 1);
    const y1 = mode === "wrap" ? (y0 + 1) % height : Math.min(height - 1, y0 + 1);
    const horizontal = resolvedX - x0;
    const vertical = resolvedY - y0;
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

  function createGenerators(effect) {
    const random = createRandom(effect.seed);
    return Array.from({ length: effect.generators }, () => ({
      wavelengthX: randomBetween(random, effect.wavelengthMinimum, effect.wavelengthMaximum),
      wavelengthY: randomBetween(random, effect.wavelengthMinimum, effect.wavelengthMaximum),
      amplitudeX: randomBetween(random, effect.amplitudeMinimum, effect.amplitudeMaximum) * effect.horizontalScale / 100,
      amplitudeY: randomBetween(random, effect.amplitudeMinimum, effect.amplitudeMaximum) * effect.verticalScale / 100,
      phaseX: random() * Math.PI * 2,
      phaseY: random() * Math.PI * 2
    }));
  }

  function createDisplacementFields(effect, generators, width, height) {
    const horizontal = new Float32Array(height);
    const vertical = new Float32Array(width);
    generators.forEach((generator) => {
      for (let y = 0; y < height; y += 1) {
        horizontal[y] += generator.amplitudeX * waveValue(effect.waveType, y / generator.wavelengthX * Math.PI * 2 + generator.phaseX);
      }
      for (let x = 0; x < width; x += 1) {
        vertical[x] += generator.amplitudeY * waveValue(effect.waveType, x / generator.wavelengthY * Math.PI * 2 + generator.phaseY);
      }
    });
    const scale = 1 / Math.max(1, generators.length);
    for (let y = 0; y < height; y += 1) horizontal[y] *= scale;
    for (let x = 0; x < width; x += 1) vertical[x] *= scale;
    return { horizontal, vertical };
  }

  /**
   * Return a deterministic multi-wave displacement of a rendered layer.
   * @param {HTMLCanvasElement} source - Fully rendered source layer.
   * @param {object|null} effect - Normalized Ripple Field descriptor.
   * @returns {HTMLCanvasElement} Source or a wave-displaced transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 2 || source.height < 2) return source;
    const descriptor = namespace.ImageEditorRippleFieldEffect.normalize(effect);
    if (descriptor.amplitudeMaximum <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const displaced = context.createImageData(canvas.width, canvas.height);
    const generators = createGenerators(descriptor);
    const fields = createDisplacementFields(descriptor, generators, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const targetIndex = (y * canvas.width + x) * 4;
        samplePixel(original.data, canvas.width, canvas.height, x + fields.horizontal[y], y + fields.vertical[x], descriptor.undefinedAreas, displaced.data, targetIndex);
      }
    }
    context.putImageData(displaced, 0, 0);
    return canvas;
  }

  namespace.ImageEditorRippleFieldRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
