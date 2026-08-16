// Hue, saturation, lightness, color-range, and colorize image adjustment.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const RANGE_CENTERS = Object.freeze({ reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 });

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function wrapHue(value) { return ((value % 360) + 360) % 360; }

  function rgbToHsl(red, green, blue) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 2;
    const chroma = maximum - minimum;
    if (!chroma) return { hue: 0, saturation: 0, lightness };
    const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
    let hue;
    if (maximum === red) hue = 60 * (((green - blue) / chroma) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / chroma + 2);
    else hue = 60 * ((red - green) / chroma + 4);
    return { hue: wrapHue(hue), saturation, lightness };
  }

  function hueChannel(p, q, hue) {
    const wrapped = ((hue % 1) + 1) % 1;
    if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
    if (wrapped < 1 / 2) return q;
    if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
    return p;
  }

  function hslToRgb(hue, saturation, lightness) {
    if (!saturation) return [lightness, lightness, lightness];
    const normalizedHue = wrapHue(hue) / 360;
    const q = lightness < .5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    return [hueChannel(p, q, normalizedHue + 1 / 3), hueChannel(p, q, normalizedHue), hueChannel(p, q, normalizedHue - 1 / 3)];
  }

  function circularDistance(first, second) {
    const distance = Math.abs(wrapHue(first) - wrapHue(second));
    return Math.min(distance, 360 - distance);
  }

  function rangeWeight(hue, saturation, range) {
    if (range === "master") return 1;
    if (!saturation || RANGE_CENTERS[range] === undefined) return 0;
    const distance = circularDistance(hue, RANGE_CENTERS[range]);
    if (distance <= 30) return 1;
    return distance >= 60 ? 0 : 1 - (distance - 30) / 30;
  }

  function adjustUnit(value, amount) {
    return amount >= 0 ? value + (1 - value) * amount : value * (1 + amount);
  }

  /** Apply Photoshop-style Hue/Saturation controls to opaque source pixels. */
  function render(imageData, adjustment = {}) {
    const hueShift = Math.max(-180, Math.min(180, Number(adjustment.hue) || 0));
    const saturationChange = Math.max(-100, Math.min(100, Number(adjustment.saturation) || 0)) / 100;
    const lightnessChange = Math.max(-100, Math.min(100, Number(adjustment.lightness) || 0)) / 100;
    const colorize = adjustment.colorize === true;
    const range = namespace.ImageEditorAdjustmentModel.HUE_RANGES.includes(adjustment.range) ? adjustment.range : "master";
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const source = rgbToHsl(imageData.data[index] / 255, imageData.data[index + 1] / 255, imageData.data[index + 2] / 255);
      const weight = colorize ? 1 : rangeWeight(source.hue, source.saturation, range);
      if (!weight) continue;
      const hue = colorize ? wrapHue(hueShift) : wrapHue(source.hue + hueShift * weight);
      const saturation = colorize
        ? clamp01((saturationChange + 1) / 2)
        : clamp01(adjustUnit(source.saturation, saturationChange * weight));
      const lightness = clamp01(adjustUnit(source.lightness, lightnessChange * weight));
      const result = hslToRgb(hue, saturation, lightness);
      imageData.data[index] = Math.round(result[0] * 255);
      imageData.data[index + 1] = Math.round(result[1] * 255);
      imageData.data[index + 2] = Math.round(result[2] * 255);
    }
    return imageData;
  }

  namespace.ImageEditorHueSaturationAdjustment = { render, rgbToHsl, hslToRgb, rangeWeight };
  namespace.ImageEditorAdjustmentRenderer.register("hue-saturation", render);
})(typeof window !== "undefined" ? window : globalThis);
