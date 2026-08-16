// Optical color-filter presets and non-destructive Photo Filter pixel rendering.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const PRESETS = Object.freeze([
    Object.freeze({ id: "warming-85", name: "Warming Filter (85)", color: "#ec8a00" }),
    Object.freeze({ id: "warming-81", name: "Warming Filter (81)", color: "#e9a123" }),
    Object.freeze({ id: "cooling-80", name: "Cooling Filter (80)", color: "#006dff" }),
    Object.freeze({ id: "cooling-82", name: "Cooling Filter (82)", color: "#00b5ff" }),
    Object.freeze({ id: "red", name: "Red", color: "#ff0000" }),
    Object.freeze({ id: "orange", name: "Orange", color: "#ff7a00" }),
    Object.freeze({ id: "yellow", name: "Yellow", color: "#fff000" }),
    Object.freeze({ id: "green", name: "Green", color: "#00b050" }),
    Object.freeze({ id: "cyan", name: "Cyan", color: "#00ffff" }),
    Object.freeze({ id: "blue", name: "Blue", color: "#0000ff" }),
    Object.freeze({ id: "violet", name: "Violet", color: "#8a2be2" }),
    Object.freeze({ id: "magenta", name: "Magenta", color: "#ff00ff" }),
    Object.freeze({ id: "sepia", name: "Sepia", color: "#ac7a4a" }),
    Object.freeze({ id: "deep-emerald", name: "Deep Emerald", color: "#006b54" }),
    Object.freeze({ id: "underwater", name: "Underwater", color: "#00a8c6" })
  ]);

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function parseColor(value) {
    const normalized = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#ec8a00";
    return [1, 3, 5].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  }

  function luminance(color) { return color[0] * .2126 + color[1] * .7152 + color[2] * .0722; }

  function preserveLuminance(color, target) {
    const current = luminance(color);
    if (Math.abs(current - target) < .000001) return color;
    if (current > target) {
      const scale = current ? target / current : 0;
      return color.map((channel) => channel * scale);
    }
    const amount = current < 1 ? (target - current) / (1 - current) : 0;
    return color.map((channel) => channel + (1 - channel) * amount);
  }

  /** Resolve the active filter color from a preset or the custom color swatch. */
  function resolveColor(adjustment = {}) {
    if (adjustment.filterMode === "color") return /^#[0-9a-f]{6}$/i.test(String(adjustment.color || "")) ? String(adjustment.color).toLowerCase() : "#ec8a00";
    return PRESETS.find((preset) => preset.id === adjustment.filter)?.color || PRESETS[0].color;
  }

  /** Apply Photo Filter color and density while preserving alpha and optional luminosity. */
  function render(imageData, adjustment = {}) {
    const filter = parseColor(resolveColor(adjustment));
    const density = Math.max(1, Math.min(100, Number(adjustment.density) || 25)) / 100;
    const preserve = adjustment.preserveLuminosity !== false;
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      const source = [imageData.data[index] / 255, imageData.data[index + 1] / 255, imageData.data[index + 2] / 255];
      let filtered = source.map((channel, colorIndex) => channel + (filter[colorIndex] - channel) * density);
      if (preserve) filtered = preserveLuminance(filtered, luminance(source));
      imageData.data[index] = Math.round(clamp01(filtered[0]) * 255);
      imageData.data[index + 1] = Math.round(clamp01(filtered[1]) * 255);
      imageData.data[index + 2] = Math.round(clamp01(filtered[2]) * 255);
    }
    return imageData;
  }

  namespace.ImageEditorPhotoFilterAdjustment = { PRESETS, render, resolveColor };
  namespace.ImageEditorAdjustmentRenderer.register("photo-filter", render);
})(typeof window !== "undefined" ? window : globalThis);
