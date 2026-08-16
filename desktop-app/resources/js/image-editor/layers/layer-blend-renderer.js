(function (global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const NATIVE_MODES = new Set(["normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]);

  function burn(base, blend) { return blend <= 0 ? 0 : 1 - Math.min(1, (1 - base) / blend); }
  function dodge(base, blend) { return blend >= 1 ? 1 : Math.min(1, base / (1 - blend)); }
  function channel(mode, base, blend) {
    if (mode === "linear-burn") return Math.max(0, base + blend - 1);
    if (mode === "linear-dodge") return Math.min(1, base + blend);
    if (mode === "vivid-light") return blend < 0.5 ? burn(base, 2 * blend) : dodge(base, 2 * blend - 1);
    if (mode === "linear-light") return Math.max(0, Math.min(1, base + 2 * blend - 1));
    if (mode === "pin-light") return blend < 0.5 ? Math.min(base, 2 * blend) : Math.max(base, 2 * blend - 1);
    if (mode === "hard-mix") return channel("vivid-light", base, blend) < 0.5 ? 0 : 1;
    return blend;
  }

  /** Blend one source RGB triplet over a destination triplet for non-native Canvas modes. */
  function blendRgb(mode, base, blend) {
    if (mode === "darker-color" || mode === "lighter-color") {
      const baseLuminosity = base[0] + base[1] + base[2];
      const blendLuminosity = blend[0] + blend[1] + blend[2];
      return mode === "darker-color" ? (blendLuminosity < baseLuminosity ? blend : base) : (blendLuminosity > baseLuminosity ? blend : base);
    }
    return base.map((value, index) => channel(mode, value, blend[index]));
  }

  function drawCustom(context, source, mode, alpha) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const destination = context.getImageData(0, 0, width, height);
    const sourcePixels = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
    for (let index = 0; index < destination.data.length; index += 4) {
      let sourceAlpha = sourcePixels.data[index + 3] / 255 * alpha;
      if (mode === "dissolve") {
        const threshold = ((index * 1103515245 + 12345) >>> 16) & 255;
        sourceAlpha = threshold < sourceAlpha * 255 ? 1 : 0;
      }
      if (sourceAlpha <= 0) continue;
      const destinationAlpha = destination.data[index + 3] / 255;
      const base = [destination.data[index] / 255, destination.data[index + 1] / 255, destination.data[index + 2] / 255];
      const blend = [sourcePixels.data[index] / 255, sourcePixels.data[index + 1] / 255, sourcePixels.data[index + 2] / 255];
      const mixed = mode === "dissolve" ? blend : blendRgb(mode, base, blend);
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      for (let channelIndex = 0; channelIndex < 3; channelIndex += 1) {
        const premultiplied = mixed[channelIndex] * sourceAlpha * destinationAlpha + blend[channelIndex] * sourceAlpha * (1 - destinationAlpha) + base[channelIndex] * destinationAlpha * (1 - sourceAlpha);
        destination.data[index + channelIndex] = Math.round(255 * (outputAlpha ? premultiplied / outputAlpha : 0));
      }
      destination.data[index + 3] = Math.round(255 * outputAlpha);
    }
    context.putImageData(destination, 0, 0);
  }

  /** Draw layer pixels using the selected Photoshop-compatible blending settings. */
  function draw(context, source, settings = {}) {
    const normalized = namespace.ImageEditorBlendingOptions.normalize(settings);
    const alpha = normalized.opacity * normalized.fillOpacity;
    if (alpha <= 0) return;
    if (NATIVE_MODES.has(normalized.blendMode)) {
      context.save();
      context.globalAlpha *= alpha;
      context.globalCompositeOperation = normalized.blendMode === "normal" ? "source-over" : normalized.blendMode;
      context.drawImage(source, 0, 0);
      context.restore();
      return;
    }
    try {
      drawCustom(context, source, normalized.blendMode, alpha);
    } catch (_error) {
      context.save();
      context.globalAlpha *= alpha;
      context.globalCompositeOperation = "source-over";
      context.drawImage(source, 0, 0);
      context.restore();
    }
  }

  namespace.ImageEditorLayerBlendRenderer = { NATIVE_MODES, blendRgb, draw };
})(typeof window !== "undefined" ? window : globalThis);
