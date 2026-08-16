// Canvas rendering for non-destructive layer gradient overlays.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function colorToRgb(color) {
    const value = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "000000";
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
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

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  /** Resolve a normalized gradient position for one canvas pixel. */
  function gradientPosition(x, y, bounds, effect) {
    const scale = Math.max(0.1, effect.scale / 100);
    const centerX = bounds.x + bounds.width / 2 + effect.offsetX;
    const centerY = bounds.y + bounds.height / 2 + effect.offsetY;
    const normalizedX = (x - centerX) / Math.max(1, bounds.width / 2 * scale);
    const normalizedY = (y - centerY) / Math.max(1, bounds.height / 2 * scale);
    const angle = effect.angle * Math.PI / 180;
    const rotatedX = normalizedX * Math.cos(angle) + normalizedY * Math.sin(angle);
    const rotatedY = -normalizedX * Math.sin(angle) + normalizedY * Math.cos(angle);
    let value;
    if (effect.style === "radial") value = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    else if (effect.style === "angle") value = ((Math.atan2(normalizedY, normalizedX) - angle) / (Math.PI * 2) + 1) % 1;
    else if (effect.style === "reflected") value = Math.abs(rotatedX);
    else if (effect.style === "diamond") value = Math.abs(rotatedX) + Math.abs(rotatedY);
    else value = 0.5 + rotatedX / 2;
    value = clamp01(value);
    return effect.reverse ? 1 - value : value;
  }

  /** Build a two-color gradient surface clipped to the rendered layer's alpha. */
  function createOverlay(source, effect) {
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    const contentBounds = alphaBounds(sourcePixels.data, source.width, source.height);
    const overlay = createCanvas(source.width, source.height);
    if (!contentBounds) return overlay;
    const gradientBounds = effect.alignWithLayer ? contentBounds : { x: 0, y: 0, width: source.width, height: source.height };
    const context = overlay.getContext("2d");
    const image = context.createImageData(contentBounds.width, contentBounds.height);
    const start = colorToRgb(effect.startColor);
    const end = colorToRgb(effect.endColor);
    for (let y = 0; y < contentBounds.height; y += 1) {
      for (let x = 0; x < contentBounds.width; x += 1) {
        const amount = gradientPosition(contentBounds.x + x, contentBounds.y + y, gradientBounds, effect);
        const target = (y * contentBounds.width + x) * 4;
        image.data[target] = Math.round(start[0] + (end[0] - start[0]) * amount);
        image.data[target + 1] = Math.round(start[1] + (end[1] - start[1]) * amount);
        image.data[target + 2] = Math.round(start[2] + (end[2] - start[2]) * amount);
        image.data[target + 3] = 255;
      }
    }
    context.putImageData(image, contentBounds.x, contentBounds.y);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(source, 0, 0);
    return overlay;
  }

  /** Draw a gradient overlay over source pixels while preserving their transparency. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled || effect.opacity <= 0) return;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity)));
    context.globalCompositeOperation = effect.blendMode === "screen" ? "screen" : effect.blendMode === "multiply" ? "multiply" : "source-over";
    context.drawImage(createOverlay(source, effect), 0, 0);
    context.restore();
  }

  namespace.ImageEditorGradientOverlayRenderer = Object.freeze({ draw, gradientPosition });
})(typeof window !== "undefined" ? window : globalThis);
