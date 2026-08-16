// Canvas rendering for non-destructive layer color overlays.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /** Build a solid color surface clipped to the rendered layer's alpha. */
  function createOverlay(source, effect) {
    const overlay = createCanvas(source.width, source.height);
    const context = overlay.getContext("2d");
    context.fillStyle = effect.color;
    context.fillRect(0, 0, overlay.width, overlay.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(source, 0, 0);
    return overlay;
  }

  /** Draw a color overlay over source pixels while preserving their transparency. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled || effect.opacity <= 0) return;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity)));
    context.globalCompositeOperation = effect.blendMode === "screen" ? "screen" : effect.blendMode === "multiply" ? "multiply" : "source-over";
    context.drawImage(createOverlay(source, effect), 0, 0);
    context.restore();
  }

  namespace.ImageEditorColorOverlayRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
