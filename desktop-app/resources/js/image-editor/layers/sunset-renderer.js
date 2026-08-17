// Warm red-to-gold tonal-map renderer for the non-destructive Sunset layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function parseColor(color) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  }

  function mix(first, second, amount) {
    return first + (second - first) * amount;
  }

  function overlay(base, blend) {
    return base <= 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend);
  }

  function mappedTone(luminance, shadow, highlight, balance) {
    const position = luminance < balance
      ? 0.5 * luminance / balance
      : 0.5 + 0.5 * (luminance - balance) / (1 - balance);
    return shadow.map((channel, index) => mix(channel, highlight[index], position));
  }

  /**
   * Map layer tones from saturated red to golden yellow and blend them using an overlay treatment.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Sunset descriptor.
   * @returns {HTMLCanvasElement} Source or a warm sunset-toned canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorSunsetEffect.normalize(effect);
    if (descriptor.strength <= 0) return source;

    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const shadow = parseColor(descriptor.shadowColor);
    const highlight = parseColor(descriptor.highlightColor);

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue;
      const original = [pixels[offset] / 255, pixels[offset + 1] / 255, pixels[offset + 2] / 255];
      const luminance = original[0] * 0.2126 + original[1] * 0.7152 + original[2] * 0.0722;
      const gradient = mappedTone(luminance, shadow, highlight, descriptor.balance);
      const contrasted = original.map((channel) => Math.max(0, Math.min(1, 0.5 + (channel - 0.5) * (1 + descriptor.contrast))));
      const warm = contrasted.map((channel, index) => overlay(channel, gradient[index]));
      const warmAverage = warm.reduce((sum, channel) => sum + channel, 0) / 3;
      const saturated = warm.map((channel) => Math.max(0, Math.min(1, warmAverage + (channel - warmAverage) * (1 + descriptor.saturation))));
      pixels[offset] = Math.round(mix(original[0], saturated[0], descriptor.strength) * 255);
      pixels[offset + 1] = Math.round(mix(original[1], saturated[1], descriptor.strength) * 255);
      pixels[offset + 2] = Math.round(mix(original[2], saturated[2], descriptor.strength) * 255);
    }

    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorSunsetRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
