// Tone-aware Cyan/Red, Magenta/Green, and Yellow/Blue color balancing.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function luminance(red, green, blue) { return red * .2126 + green * .7152 + blue * .0722; }

  /** Return smoothly overlapping Shadows, Midtones, and Highlights weights. */
  function toneWeights(value) {
    const shadows = clamp01((.5 - value) * 2);
    const highlights = clamp01((value - .5) * 2);
    return { shadows, midtones: 1 - shadows - highlights, highlights };
  }

  function balanceForAxis(adjustment, weights, axis) {
    return namespace.ImageEditorAdjustmentModel.COLOR_BALANCE_TONES.reduce((total, tone) => {
      return total + weights[tone] * (Number(adjustment[tone + axis]) || 0) / 100;
    }, 0);
  }

  function preserveSourceLuminosity(source, balanced) {
    const correction = luminance(source[0], source[1], source[2]) - luminance(balanced[0], balanced[1], balanced[2]);
    return balanced.map((channel) => clamp01(channel + correction));
  }

  /** Apply tone-weighted channel balance while preserving source alpha. */
  function render(imageData, adjustment = {}) {
    const preserveLuminosity = adjustment.preserveLuminosity !== false;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const source = [imageData.data[index] / 255, imageData.data[index + 1] / 255, imageData.data[index + 2] / 255];
      const weights = toneWeights(luminance(source[0], source[1], source[2]));
      let balanced = [
        clamp01(source[0] + balanceForAxis(adjustment, weights, "CyanRed")),
        clamp01(source[1] + balanceForAxis(adjustment, weights, "MagentaGreen")),
        clamp01(source[2] + balanceForAxis(adjustment, weights, "YellowBlue"))
      ];
      if (preserveLuminosity) balanced = preserveSourceLuminosity(source, balanced);
      imageData.data[index] = Math.round(balanced[0] * 255);
      imageData.data[index + 1] = Math.round(balanced[1] * 255);
      imageData.data[index + 2] = Math.round(balanced[2] * 255);
    }
    return imageData;
  }

  namespace.ImageEditorColorBalanceAdjustment = { render, toneWeights };
  namespace.ImageEditorAdjustmentRenderer.register("color-balance", render);
})(typeof window !== "undefined" ? window : globalThis);
