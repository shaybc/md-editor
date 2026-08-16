// RGB output-channel matrix mixing with an optional monochrome channel.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const OUTPUT_PREFIXES = Object.freeze(["redOutput", "greenOutput", "blueOutput"]);

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function coefficient(adjustment, property, fallback) {
    const value = Number(adjustment[property]);
    return (Number.isFinite(value) ? value : fallback) / 100;
  }

  function mixChannel(source, adjustment, prefix, defaults) {
    return clamp01(
      source[0] * coefficient(adjustment, prefix + "Red", defaults[0]) +
      source[1] * coefficient(adjustment, prefix + "Green", defaults[1]) +
      source[2] * coefficient(adjustment, prefix + "Blue", defaults[2]) +
      coefficient(adjustment, prefix + "Constant", 0)
    );
  }

  /** Apply the configured RGB matrix or monochrome channel to source pixels. */
  function render(imageData, adjustment = {}) {
    const monochrome = adjustment.monochrome === true;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const source = [imageData.data[index] / 255, imageData.data[index + 1] / 255, imageData.data[index + 2] / 255];
      const result = monochrome
        ? Array(3).fill(mixChannel(source, adjustment, "monochrome", [40, 40, 20]))
        : OUTPUT_PREFIXES.map((prefix, outputIndex) => {
            const defaults = [0, 0, 0];
            defaults[outputIndex] = 100;
            return mixChannel(source, adjustment, prefix, defaults);
          });
      imageData.data[index] = Math.round(result[0] * 255);
      imageData.data[index + 1] = Math.round(result[1] * 255);
      imageData.data[index + 2] = Math.round(result[2] * 255);
    }
    return imageData;
  }

  namespace.ImageEditorChannelMixerAdjustment = { render, mixChannel };
  namespace.ImageEditorAdjustmentRenderer.register("channel-mixer", render);
})(typeof window !== "undefined" ? window : globalThis);
