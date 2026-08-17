// Limited-tone renderer for the non-destructive Posterize layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function quantize(value, levels) {
    return Math.round(value * (levels - 1)) / (levels - 1);
  }

  function rgbToHsl(red, green, blue) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 2;
    if (maximum === minimum) return [0, 0, lightness];
    const difference = maximum - minimum;
    const saturation = lightness > 0.5 ? difference / (2 - maximum - minimum) : difference / (maximum + minimum);
    const hue = maximum === red
      ? ((green - blue) / difference + (green < blue ? 6 : 0)) / 6
      : maximum === green
        ? ((blue - red) / difference + 2) / 6
        : ((red - green) / difference + 4) / 6;
    return [hue, saturation, lightness];
  }

  function hueToRgb(p, q, hue) {
    let channel = hue;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
    return p;
  }

  function hslToRgb(hue, saturation, lightness) {
    if (saturation === 0) return [lightness, lightness, lightness];
    const q = lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    return [
      hueToRgb(p, q, hue + 1 / 3),
      hueToRgb(p, q, hue),
      hueToRgb(p, q, hue - 1 / 3)
    ];
  }

  /**
   * Reduce a layer surface to a configurable number of channel or luminosity levels.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Posterize descriptor.
   * @returns {HTMLCanvasElement} Source or a posterized transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPosterizeEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue;
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      const result = descriptor.mode === "luminosity"
        ? (() => {
            const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
            return hslToRgb(hue, saturation, quantize(lightness, descriptor.levels));
          })()
        : [
            quantize(red, descriptor.levels),
            quantize(green, descriptor.levels),
            quantize(blue, descriptor.levels)
          ];
      pixels[offset] = Math.round(result[0] * 255);
      pixels[offset + 1] = Math.round(result[1] * 255);
      pixels[offset + 2] = Math.round(result[2] * 255);
    }

    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorPosterizeRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
