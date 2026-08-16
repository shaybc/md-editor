// Adaptive Vibrance and uniform Saturation color adjustment.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function hueDegrees(red, green, blue, maximum, minimum) {
    const chroma = maximum - minimum;
    if (!chroma) return 0;
    let hue;
    if (maximum === red) hue = ((green - blue) / chroma) % 6;
    else if (maximum === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    return (hue * 60 + 360) % 360;
  }

  function warmHueProtection(hue) {
    if (hue < 15 || hue > 55) return 0;
    return 1 - Math.abs(hue - 35) / 20;
  }

  function applyChroma(red, green, blue, factor) {
    const luminance = red * .2126 + green * .7152 + blue * .0722;
    return [red, green, blue].map((channel) => clamp01(luminance + (channel - luminance) * factor));
  }

  /** Increase muted-color chroma adaptively, then apply the requested uniform saturation. */
  function render(imageData, adjustment = {}) {
    const vibrance = Math.max(-100, Math.min(100, Number(adjustment.vibrance) || 0)) / 100;
    const saturation = Math.max(-100, Math.min(100, Number(adjustment.saturation) || 0)) / 100;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const original = [imageData.data[index] / 255, imageData.data[index + 1] / 255, imageData.data[index + 2] / 255];
      const maximum = Math.max(...original);
      const minimum = Math.min(...original);
      const chroma = maximum - minimum;
      const hue = hueDegrees(original[0], original[1], original[2], maximum, minimum);
      const positiveProtection = vibrance > 0 ? 1 - warmHueProtection(hue) * .5 : 1;
      const vibranceFactor = vibrance >= 0
        ? 1 + vibrance * (1 - chroma) * positiveProtection
        : 1 + vibrance;
      const vibranceColor = applyChroma(original[0], original[1], original[2], vibranceFactor);
      const saturationFactor = saturation >= 0 ? 1 + saturation : 1 + saturation;
      const result = applyChroma(vibranceColor[0], vibranceColor[1], vibranceColor[2], saturationFactor);
      imageData.data[index] = Math.round(result[0] * 255);
      imageData.data[index + 1] = Math.round(result[1] * 255);
      imageData.data[index + 2] = Math.round(result[2] * 255);
    }
    return imageData;
  }

  namespace.ImageEditorVibranceAdjustment = { render };
  namespace.ImageEditorAdjustmentRenderer.register("vibrance", render);
})(typeof window !== "undefined" ? window : globalThis);
