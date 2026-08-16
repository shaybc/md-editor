// Photoshop-style non-legacy Brightness/Contrast pixel adjustment.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  /** Apply deterministic Brightness/Contrast curves while preserving pixel alpha. */
  function render(imageData, adjustment = {}) {
    const brightness = Math.max(-150, Math.min(150, Number(adjustment.brightness) || 0)) / 150;
    const contrastValue = Math.max(-50, Math.min(100, Number(adjustment.contrast) || 0));
    const contrast = contrastValue >= 0 ? Math.min(.999, contrastValue / 100) : contrastValue / 50;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        let value = imageData.data[index + channel] / 255;
        value = brightness >= 0 ? value + (1 - value) * brightness : value * (1 + brightness);
        value = contrast >= 0 ? .5 + (value - .5) / (1 - contrast) : .5 + (value - .5) * (1 + contrast);
        imageData.data[index + channel] = Math.round(clamp01(value) * 255);
      }
    }
    return imageData;
  }

  namespace.ImageEditorBrightnessContrastAdjustment = { render };
  namespace.ImageEditorAdjustmentRenderer.register("brightness-contrast", render);
})(typeof window !== "undefined" ? window : globalThis);
