// Color-family classification and CMYK correction for Selective Color adjustments.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const HUE_CENTERS = Object.freeze({ reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 });

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function hueOf(red, green, blue, maximum, chroma) {
    if (!chroma) return 0;
    let hue = maximum === red
      ? ((green - blue) / chroma) % 6
      : maximum === green
        ? (blue - red) / chroma + 2
        : (red - green) / chroma + 4;
    hue *= 60;
    return hue < 0 ? hue + 360 : hue;
  }

  /** Return how strongly one source color belongs to a Selective Color family. */
  function rangeWeight(range, source) {
    const maximum = Math.max(...source);
    const minimum = Math.min(...source);
    const chroma = maximum - minimum;
    const saturation = maximum ? chroma / maximum : 0;
    const luminance = source[0] * .2126 + source[1] * .7152 + source[2] * .0722;
    if (Object.prototype.hasOwnProperty.call(HUE_CENTERS, range)) {
      const hue = hueOf(source[0], source[1], source[2], maximum, chroma);
      const distance = Math.abs(((hue - HUE_CENTERS[range] + 540) % 360) - 180);
      return clamp01(1 - distance / 60) * saturation;
    }
    if (range === "whites") return clamp01((luminance - .5) * 2) * (1 - saturation);
    if (range === "blacks") return clamp01((.5 - luminance) * 2) * (1 - saturation);
    return clamp01(1 - Math.abs(luminance - .5) * 2) * (1 - saturation * .5);
  }

  function applyInk(value, amount, relative) {
    if (relative) return amount >= 0 ? value * (1 - amount) : value + (1 - value) * -amount;
    return value - amount;
  }

  function correctedColor(source, adjustment, range) {
    const cyan = Number(adjustment[range + "Cyan"] || 0) / 100;
    const magenta = Number(adjustment[range + "Magenta"] || 0) / 100;
    const yellow = Number(adjustment[range + "Yellow"] || 0) / 100;
    const black = Number(adjustment[range + "Black"] || 0) / 100;
    const relative = adjustment.relative !== false;
    return [
      applyInk(applyInk(source[0], cyan, relative), black, relative),
      applyInk(applyInk(source[1], magenta, relative), black, relative),
      applyInk(applyInk(source[2], yellow, relative), black, relative)
    ].map(clamp01);
  }

  /** Apply all stored color-family corrections while preserving transparent pixels. */
  function render(imageData, adjustment = {}) {
    const ranges = namespace.ImageEditorAdjustmentModel.SELECTIVE_COLOR_RANGES;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const source = [imageData.data[index] / 255, imageData.data[index + 1] / 255, imageData.data[index + 2] / 255];
      const result = [...source];
      ranges.forEach((range) => {
        const weight = rangeWeight(range, source);
        if (!weight) return;
        const corrected = correctedColor(source, adjustment, range);
        result.forEach((value, channel) => { result[channel] = value + (corrected[channel] - source[channel]) * weight; });
      });
      imageData.data[index] = Math.round(clamp01(result[0]) * 255);
      imageData.data[index + 1] = Math.round(clamp01(result[1]) * 255);
      imageData.data[index + 2] = Math.round(clamp01(result[2]) * 255);
    }
    return imageData;
  }

  namespace.ImageEditorSelectiveColorAdjustment = { render, rangeWeight };
  namespace.ImageEditorAdjustmentRenderer.register("selective-color", render);
})(typeof window !== "undefined" ? window : globalThis);
