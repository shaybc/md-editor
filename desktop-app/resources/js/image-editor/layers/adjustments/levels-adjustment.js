// Per-channel input, gamma, output, and histogram processing for Levels.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const CHANNEL_NAMES = Object.freeze(["red", "green", "blue"]);

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function property(adjustment, prefix, name, fallback) {
    const value = Number(adjustment[prefix + name]);
    return Number.isFinite(value) ? value : fallback;
  }

  /** Map one normalized channel through Levels input, gamma, and output controls. */
  function mapLevel(value, adjustment, prefix) {
    const inputBlack = property(adjustment, prefix, "InputBlack", 0);
    const inputWhite = Math.max(inputBlack + 1, property(adjustment, prefix, "InputWhite", 255));
    const gamma = clamp(property(adjustment, prefix, "Gamma", 1), .1, 9.99);
    const outputBlack = property(adjustment, prefix, "OutputBlack", 0) / 255;
    const outputWhite = property(adjustment, prefix, "OutputWhite", 255) / 255;
    const normalized = clamp((value * 255 - inputBlack) / (inputWhite - inputBlack), 0, 1);
    return clamp(outputBlack + Math.pow(normalized, 1 / gamma) * (outputWhite - outputBlack), 0, 1);
  }

  /** Apply composite RGB Levels followed by each individual channel mapping. */
  function render(imageData, adjustment = {}) {
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      CHANNEL_NAMES.forEach((channel, channelIndex) => {
        const composite = mapLevel(imageData.data[index + channelIndex] / 255, adjustment, "rgb");
        imageData.data[index + channelIndex] = Math.round(mapLevel(composite, adjustment, channel) * 255);
      });
    }
    return imageData;
  }

  /** Count opaque source pixels into a 256-bin histogram for one displayed channel. */
  function histogram(imageData, channel = "rgb") {
    const bins = new Array(256).fill(0);
    const channelIndex = CHANNEL_NAMES.indexOf(channel);
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const value = channelIndex >= 0
        ? imageData.data[index + channelIndex]
        : Math.round(imageData.data[index] * .2126 + imageData.data[index + 1] * .7152 + imageData.data[index + 2] * .0722);
      bins[value] += 1;
    }
    return bins;
  }

  namespace.ImageEditorLevelsAdjustment = { render, histogram, mapLevel };
  namespace.ImageEditorAdjustmentRenderer.register("levels", render);
})(typeof window !== "undefined" ? window : globalThis);
