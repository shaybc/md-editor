// Canvas rendering for non-destructive layer drop shadows.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function colorize(source, color, spread) {
    const canvas = createCanvas(source.width, source.height);
    const context = canvas.getContext("2d");
    const radius = Math.max(0, Math.round(spread));
    context.drawImage(source, 0, 0);
    if (radius) {
      const samples = Math.min(32, Math.max(12, radius * 2));
      for (let index = 0; index < samples; index += 1) {
        const angle = index / samples * Math.PI * 2;
        context.drawImage(source, Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
    }
    context.globalCompositeOperation = "source-in";
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /** Draw a layer's shadow behind its already-rendered source pixels. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled || effect.opacity <= 0) return;
    const radians = Number(effect.angle) * Math.PI / 180;
    const offsetX = -Math.cos(radians) * Number(effect.distance || 0);
    const offsetY = Math.sin(radians) * Number(effect.distance || 0);
    const spread = Number(effect.spread || 0) * Math.max(1, Number(effect.blur || 0));
    const shadow = colorize(source, effect.color, spread);
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity)));
    context.globalCompositeOperation = effect.blendMode === "multiply" ? "multiply" : "source-over";
    if ("filter" in context) context.filter = `blur(${Math.max(0, Number(effect.blur) || 0)}px)`;
    context.drawImage(shadow, offsetX, offsetY);
    context.restore();
  }

  namespace.ImageEditorDropShadowRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
