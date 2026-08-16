// Photoshop-style Exposure, Offset, and Gamma Correction pixel adjustment.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  /** Apply exposure stops, linear offset, and gamma correction while preserving alpha. */
  function render(imageData, adjustment = {}) {
    const exposure = Math.max(-20, Math.min(20, Number(adjustment.exposure) || 0));
    const offset = Math.max(-.5, Math.min(.5, Number(adjustment.offset) || 0));
    const gamma = Math.max(.01, Math.min(9.99, Number(adjustment.gamma) || 1));
    const exposureMultiplier = 2 ** exposure;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const linearValue = imageData.data[index + channel] / 255 * exposureMultiplier + offset;
        imageData.data[index + channel] = Math.round(clamp01(Math.max(0, linearValue) ** (1 / gamma)) * 255);
      }
    }
    return imageData;
  }

  namespace.ImageEditorExposureAdjustment = { render };
  namespace.ImageEditorAdjustmentRenderer.register("exposure", render);
})(typeof window !== "undefined" ? window : globalThis);
