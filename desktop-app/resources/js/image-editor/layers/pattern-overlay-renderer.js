// Canvas rendering for non-destructive layer pattern overlays.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function colorToRgba(color) {
    const value = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "000000";
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16), 255];
  }

  function alphaBounds(pixels, width, height) {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }

  function fallbackPattern(x, y, settings, foreground, background) {
    const scale = settings.patternScale;
    const line = Math.max(1, Math.round(scale * 0.12));
    return Math.abs((x + y) % scale) < line || Math.abs((x - y) % scale) < line ? foreground : background;
  }

  /** Build a two-color pattern surface clipped to the rendered layer's alpha. */
  function createOverlay(source, effect) {
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    const bounds = alphaBounds(sourcePixels.data, source.width, source.height);
    const overlay = createCanvas(source.width, source.height);
    if (!bounds) return overlay;
    const context = overlay.getContext("2d");
    const image = context.createImageData(bounds.width, bounds.height);
    const foreground = colorToRgba(effect.foregroundColor);
    const background = colorToRgba(effect.backgroundColor);
    const patternColorAt = namespace.imageEditorPatternColorAt || fallbackPattern;
    const settings = {
      patternScale: Math.max(4, Math.min(64, Math.round(16 * effect.scale / 100))),
      patternDensity: effect.density,
      patternAngle: effect.angle
    };
    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const canvasX = bounds.x + x;
        const canvasY = bounds.y + y;
        const patternX = (effect.linkWithLayer ? x : canvasX) - effect.offsetX;
        const patternY = (effect.linkWithLayer ? y : canvasY) - effect.offsetY;
        const color = patternColorAt(effect.patternType, patternX, patternY, settings, foreground, background);
        const target = (y * bounds.width + x) * 4;
        image.data[target] = color[0]; image.data[target + 1] = color[1]; image.data[target + 2] = color[2]; image.data[target + 3] = color[3] ?? 255;
      }
    }
    context.putImageData(image, bounds.x, bounds.y);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(source, 0, 0);
    return overlay;
  }

  /** Draw a pattern overlay over source pixels while preserving their transparency. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled || effect.opacity <= 0) return;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity)));
    context.globalCompositeOperation = effect.blendMode === "screen" ? "screen" : effect.blendMode === "multiply" ? "multiply" : "source-over";
    context.drawImage(createOverlay(source, effect), 0, 0);
    context.restore();
  }

  namespace.ImageEditorPatternOverlayRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
