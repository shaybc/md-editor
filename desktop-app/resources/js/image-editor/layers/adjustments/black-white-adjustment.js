// Six-color black-and-white mixing with an optional photographic tint.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const MIXER_NAMES = Object.freeze(["reds", "yellows", "greens", "cyans", "blues", "magentas"]);
  const DEFAULT_MIXERS = Object.freeze({ reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 });

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function luminance(red, green, blue) { return red * .2126 + green * .7152 + blue * .0722; }

  function hueDegrees(red, green, blue, maximum, chroma) {
    if (!chroma) return 0;
    let hue;
    if (maximum === red) hue = ((green - blue) / chroma) % 6;
    else if (maximum === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    return (hue * 60 + 360) % 360;
  }

  function mixerForHue(adjustment, hue) {
    const segment = hue / 60;
    const firstIndex = Math.floor(segment) % MIXER_NAMES.length;
    const secondIndex = (firstIndex + 1) % MIXER_NAMES.length;
    const amount = segment - Math.floor(segment);
    const first = Number(adjustment[MIXER_NAMES[firstIndex]] ?? DEFAULT_MIXERS[MIXER_NAMES[firstIndex]]);
    const second = Number(adjustment[MIXER_NAMES[secondIndex]] ?? DEFAULT_MIXERS[MIXER_NAMES[secondIndex]]);
    return first + (second - first) * amount;
  }

  function parseTintColor(value) {
    const color = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#d8c5a0";
    return [Number.parseInt(color.slice(1, 3), 16) / 255, Number.parseInt(color.slice(3, 5), 16) / 255, Number.parseInt(color.slice(5, 7), 16) / 255];
  }

  function tintGray(gray, tintColor) {
    const hueSaturation = namespace.ImageEditorHueSaturationAdjustment;
    if (!hueSaturation) return [gray, gray, gray];
    const tint = hueSaturation.rgbToHsl(tintColor[0], tintColor[1], tintColor[2]);
    return hueSaturation.hslToRgb(tint.hue, tint.saturation, gray);
  }

  /** Convert source pixels using hue-interpolated channel mixer values. */
  function render(imageData, adjustment = {}) {
    const shouldTint = adjustment.tint === true;
    const tintColor = parseTintColor(adjustment.tintColor);
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const red = imageData.data[index] / 255;
      const green = imageData.data[index + 1] / 255;
      const blue = imageData.data[index + 2] / 255;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const chroma = maximum - minimum;
      const saturation = maximum ? chroma / maximum : 0;
      const mixer = mixerForHue(adjustment, hueDegrees(red, green, blue, maximum, chroma)) / 100;
      const mixedGray = clamp01(luminance(red, green, blue) * (1 - saturation) + maximum * mixer * saturation);
      const result = shouldTint ? tintGray(mixedGray, tintColor) : [mixedGray, mixedGray, mixedGray];
      imageData.data[index] = Math.round(result[0] * 255);
      imageData.data[index + 1] = Math.round(result[1] * 255);
      imageData.data[index + 2] = Math.round(result[2] * 255);
    }
    return imageData;
  }

  namespace.ImageEditorBlackWhiteAdjustment = { DEFAULT_MIXERS, render, mixerForHue };
  namespace.ImageEditorAdjustmentRenderer.register("black-white", render);
})(typeof window !== "undefined" ? window : globalThis);
