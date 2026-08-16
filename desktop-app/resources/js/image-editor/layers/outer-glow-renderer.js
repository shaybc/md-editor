// Canvas rendering for non-destructive layer outer glows.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  function createCanvas(width, height) { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas; }
  /** Build a colored, expanded glow and remove pixels covered by the source alpha. */
  function createOuterGlow(source, effect) {
    const silhouette = createCanvas(source.width, source.height); const silhouetteContext = silhouette.getContext("2d");
    const spread = Math.max(0, Number(effect.spread) || 0) * Math.max(1, Number(effect.blur) || 0);
    silhouetteContext.drawImage(source, 0, 0);
    if (spread) { const samples = Math.min(32, Math.max(12, Math.round(spread) * 2)); for (let index = 0; index < samples; index += 1) { const angle = index / samples * Math.PI * 2; silhouetteContext.drawImage(source, Math.cos(angle) * spread, Math.sin(angle) * spread); } }
    silhouetteContext.globalCompositeOperation = "source-in"; silhouetteContext.fillStyle = effect.color; silhouetteContext.fillRect(0, 0, silhouette.width, silhouette.height);
    const glow = createCanvas(source.width, source.height); const glowContext = glow.getContext("2d");
    if ("filter" in glowContext) glowContext.filter = `blur(${Math.max(0, Number(effect.blur) || 0)}px)`;
    glowContext.drawImage(silhouette, 0, 0); glowContext.filter = "none"; glowContext.globalCompositeOperation = "destination-out"; glowContext.drawImage(source, 0, 0); return glow;
  }
  /** Draw a layer's outer glow behind its rendered source pixels. */
  function draw(context, source, effect, layerOpacity = 1) { if (!effect?.enabled || effect.opacity <= 0) return; const glow = createOuterGlow(source, effect); context.save(); context.globalAlpha *= Math.max(0, Math.min(1, Number(layerOpacity))) * Math.max(0, Math.min(1, Number(effect.opacity))); context.globalCompositeOperation = effect.blendMode === "screen" ? "screen" : effect.blendMode === "multiply" ? "multiply" : "source-over"; context.drawImage(glow, 0, 0); context.restore(); }
  namespace.ImageEditorOuterGlowRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
