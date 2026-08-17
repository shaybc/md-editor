// Single-hue renderer for the non-destructive Monochromatic layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function hueToRgb(first, second, hue) {
    let normalizedHue = hue;
    if (normalizedHue < 0) normalizedHue += 1;
    if (normalizedHue > 1) normalizedHue -= 1;
    if (normalizedHue < 1 / 6) return first + (second - first) * 6 * normalizedHue;
    if (normalizedHue < 1 / 2) return second;
    if (normalizedHue < 2 / 3) return first + (second - first) * (2 / 3 - normalizedHue) * 6;
    return first;
  }

  function rgbToHueSaturation(red, green, blue) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const difference = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    if (difference === 0) return { hue: 0, saturation: 0 };
    const saturation = difference / (1 - Math.abs(2 * lightness - 1));
    const hue = maximum === red
      ? ((green - blue) / difference + (green < blue ? 6 : 0)) / 6
      : maximum === green
        ? ((blue - red) / difference + 2) / 6
        : ((red - green) / difference + 4) / 6;
    return { hue, saturation };
  }

  function hslToRgb(hue, saturation, lightness) {
    if (saturation === 0) return [lightness, lightness, lightness];
    const second = lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
    const first = 2 * lightness - second;
    return [
      hueToRgb(first, second, hue + 1 / 3),
      hueToRgb(first, second, hue),
      hueToRgb(first, second, hue - 1 / 3)
    ];
  }

  function parseColor(color) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  }

  /**
   * Replace source hue and saturation while retaining each pixel's tonal lightness.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Monochromatic descriptor.
   * @returns {HTMLCanvasElement} Source or a single-hue canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorMonochromaticEffect.normalize(effect);
    if (descriptor.strength <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const target = parseColor(descriptor.color);
    const tone = rgbToHueSaturation(target[0], target[1], target[2]);

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue;
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const lightness = (maximum + minimum) / 2;
      const mapped = hslToRgb(tone.hue, tone.saturation, lightness);
      pixels[offset] = Math.round((red + (mapped[0] - red) * descriptor.strength) * 255);
      pixels[offset + 1] = Math.round((green + (mapped[1] - green) * descriptor.strength) * 255);
      pixels[offset + 2] = Math.round((blue + (mapped[2] - blue) * descriptor.strength) * 255);
    }

    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorMonochromaticRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
