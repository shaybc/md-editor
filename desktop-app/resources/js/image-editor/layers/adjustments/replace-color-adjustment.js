// Sampled-color matching and HSL replacement for the Replace Color adjustment.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function parseHexColor(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || ""));
    const color = match ? match[1] : "000000";
    return [Number.parseInt(color.slice(0, 2), 16), Number.parseInt(color.slice(2, 4), 16), Number.parseInt(color.slice(4, 6), 16)];
  }

  function adjustUnit(value, amount) { return amount >= 0 ? value + (1 - value) * amount : value * (1 + amount); }

  function adjustedRgb(red, green, blue, adjustment) {
    const source = namespace.ImageEditorHueSaturationAdjustment.rgbToHsl(red / 255, green / 255, blue / 255);
    const hue = source.hue + Math.max(-180, Math.min(180, Number(adjustment.hue) || 0));
    const saturation = clamp01(adjustUnit(source.saturation, Math.max(-100, Math.min(100, Number(adjustment.saturation) || 0)) / 100));
    const lightness = clamp01(adjustUnit(source.lightness, Math.max(-100, Math.min(100, Number(adjustment.lightness) || 0)) / 100));
    return namespace.ImageEditorHueSaturationAdjustment.hslToRgb(hue, saturation, lightness).map((channel) => Math.round(channel * 255));
  }

  /** Return the replacement preview color produced from the sampled color. */
  function resultColor(adjustment = {}) {
    const source = parseHexColor(adjustment.sourceColor);
    const result = adjustedRgb(source[0], source[1], source[2], adjustment);
    return "#" + result.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  }

  /** Replace colors within the configured fuzziness while retaining soft edge weights and source alpha. */
  function render(imageData, adjustment = {}) {
    const source = parseHexColor(adjustment.sourceColor);
    const fuzziness = namespace.ImageEditorColorRangeSelection.normalizeFuzziness(adjustment.fuzziness);
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const color = [imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]];
      const weight = namespace.ImageEditorColorRangeSelection.sampleStrength(color, { color: source }, fuzziness);
      if (!weight) continue;
      const result = adjustedRgb(color[0], color[1], color[2], adjustment);
      imageData.data[index] = Math.round(color[0] + (result[0] - color[0]) * weight);
      imageData.data[index + 1] = Math.round(color[1] + (result[1] - color[1]) * weight);
      imageData.data[index + 2] = Math.round(color[2] + (result[2] - color[2]) * weight);
    }
    return imageData;
  }

  namespace.ImageEditorReplaceColorAdjustment = { parseHexColor, resultColor, render };
  namespace.ImageEditorAdjustmentRenderer.register("replace-color", render);
})(typeof window !== "undefined" ? window : globalThis);
