// Canvas rendering for non-destructive layer inner glows.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /** Build a colored glow from transparent pixels and clip it inside the source alpha. */
  function createInnerGlow(source, effect) {
    const inverse = createCanvas(source.width, source.height);
    const inverseContext = inverse.getContext("2d");
    inverseContext.fillStyle = effect.color;
    inverseContext.fillRect(0, 0, inverse.width, inverse.height);
    inverseContext.globalCompositeOperation = "destination-out";
    inverseContext.drawImage(source, 0, 0);

    const glow = createCanvas(source.width, source.height);
    const glowContext = glow.getContext("2d");
    const blur = Math.max(0, Number(effect.blur) || 0) * (1 - Math.max(0, Math.min(1, Number(effect.choke) || 0)));
    if ("filter" in glowContext) glowContext.filter = `blur(${blur}px)`;
    glowContext.drawImage(inverse, 0, 0);
    glowContext.filter = "none";
    glowContext.globalCompositeOperation = "destination-in";
    glowContext.drawImage(source, 0, 0);
    return glow;
  }

  /** Draw a layer's inner glow over its already-rendered source pixels. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled || effect.opacity <= 0) return;
    const glow = createInnerGlow(source, effect);
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity)));
    context.globalCompositeOperation = effect.blendMode === "screen" ? "screen" : effect.blendMode === "multiply" ? "multiply" : "source-over";
    context.drawImage(glow, 0, 0);
    context.restore();
  }

  namespace.ImageEditorInnerGlowRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
