// Canvas rendering for non-destructive layer inner shadows.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /** Build a colored inverse-alpha shadow and clip it back inside the source pixels. */
  function createInnerShadow(source, effect) {
    const inverse = createCanvas(source.width, source.height);
    const inverseContext = inverse.getContext("2d");
    const radians = Number(effect.angle) * Math.PI / 180;
    const offsetX = -Math.cos(radians) * Number(effect.distance || 0);
    const offsetY = Math.sin(radians) * Number(effect.distance || 0);
    inverseContext.fillStyle = effect.color;
    inverseContext.fillRect(0, 0, inverse.width, inverse.height);
    inverseContext.globalCompositeOperation = "destination-out";
    inverseContext.drawImage(source, offsetX, offsetY);

    const shadow = createCanvas(source.width, source.height);
    const shadowContext = shadow.getContext("2d");
    const blur = Math.max(0, Number(effect.blur) || 0) * (1 - Math.max(0, Math.min(1, Number(effect.choke) || 0)));
    if ("filter" in shadowContext) shadowContext.filter = `blur(${blur}px)`;
    shadowContext.drawImage(inverse, 0, 0);
    shadowContext.filter = "none";
    shadowContext.globalCompositeOperation = "destination-in";
    shadowContext.drawImage(source, 0, 0);
    return shadow;
  }

  /** Draw a layer's inner shadow over its already-rendered source pixels. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled || effect.opacity <= 0) return;
    const shadow = createInnerShadow(source, effect);
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity)));
    context.globalCompositeOperation = effect.blendMode === "multiply" ? "multiply" : "source-over";
    context.drawImage(shadow, 0, 0);
    context.restore();
  }

  namespace.ImageEditorInnerShadowRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
