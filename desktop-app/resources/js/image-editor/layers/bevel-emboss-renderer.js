// Canvas rendering for non-destructive image-editor Bevel & Emboss effects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function coloredMask(source, color, offsetX = 0, offsetY = 0) {
    const canvas = createCanvas(source.width, source.height);
    const context = canvas.getContext("2d");
    context.drawImage(source, offsetX, offsetY);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /** Build the lit edge that remains inside the layer alpha. */
  function innerEdge(source, color, offsetX, offsetY, blur) {
    const inverse = createCanvas(source.width, source.height);
    const inverseContext = inverse.getContext("2d");
    inverseContext.fillStyle = color;
    inverseContext.fillRect(0, 0, inverse.width, inverse.height);
    inverseContext.globalCompositeOperation = "destination-out";
    inverseContext.drawImage(source, offsetX, offsetY);

    const edge = createCanvas(source.width, source.height);
    const edgeContext = edge.getContext("2d");
    if ("filter" in edgeContext && blur > 0) edgeContext.filter = `blur(${blur}px)`;
    edgeContext.drawImage(inverse, 0, 0);
    edgeContext.filter = "none";
    edgeContext.globalCompositeOperation = "destination-in";
    edgeContext.drawImage(source, 0, 0);
    return edge;
  }

  /** Build the lit edge that remains outside the layer alpha. */
  function outerEdge(source, color, offsetX, offsetY, blur) {
    const shifted = coloredMask(source, color, offsetX, offsetY);
    const edge = createCanvas(source.width, source.height);
    const edgeContext = edge.getContext("2d");
    if ("filter" in edgeContext && blur > 0) edgeContext.filter = `blur(${blur}px)`;
    edgeContext.drawImage(shifted, 0, 0);
    edgeContext.filter = "none";
    edgeContext.globalCompositeOperation = "destination-out";
    edgeContext.drawImage(source, 0, 0);
    return edge;
  }

  function compositeOperation(mode) {
    return mode === "screen" ? "screen" : mode === "multiply" ? "multiply" : "source-over";
  }

  function contourOpacity(effect, baseOpacity) {
    if (effect.glossContour === "cone") return Math.min(1, baseOpacity * 1.15);
    if (effect.glossContour === "ring") return Math.min(1, baseOpacity * 0.9);
    return baseOpacity;
  }

  function techniqueBlur(effect) {
    const size = Math.max(0, Number(effect.size) || 0);
    const soften = Math.max(0, Number(effect.soften) || 0);
    if (effect.technique === "chisel-hard") return soften;
    if (effect.technique === "chisel-soft") return soften + size * 0.12;
    return soften + size * 0.35;
  }

  function drawEdge(context, canvas, mode, opacity, layerOpacity) {
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, layerOpacity)) * Math.max(0, Math.min(1, opacity));
    context.globalCompositeOperation = compositeOperation(mode);
    context.drawImage(canvas, 0, 0);
    context.restore();
  }

  /** Draw highlight and shadow edge relief over a rendered layer. */
  function draw(context, source, effect, layerOpacity = 1) {
    if (!effect?.enabled) return;
    const radians = Number(effect.angle) * Math.PI / 180;
    const altitude = Math.max(0.15, Math.sin((Number(effect.altitude) || 0) * Math.PI / 180));
    const depth = Math.max(0.01, Number(effect.depth) / 100);
    const distance = Math.max(1, Number(effect.size) * altitude);
    let offsetX = -Math.cos(radians) * distance;
    let offsetY = Math.sin(radians) * distance;
    if (effect.direction === "down") { offsetX *= -1; offsetY *= -1; }
    if (effect.style === "pillow-emboss") { offsetX *= -1; offsetY *= -1; }
    const blur = techniqueBlur(effect);
    const highlightOpacity = contourOpacity(effect, Number(effect.highlightOpacity) * depth);
    const shadowOpacity = contourOpacity(effect, Number(effect.shadowOpacity) * depth);
    const drawInner = ["inner-bevel", "emboss", "pillow-emboss", "stroke-emboss"].includes(effect.style);
    const drawOuter = ["outer-bevel", "emboss", "stroke-emboss"].includes(effect.style);

    if (drawOuter) {
      drawEdge(context, outerEdge(source, effect.highlightColor, -offsetX, -offsetY, blur), effect.highlightBlendMode, highlightOpacity, layerOpacity);
      drawEdge(context, outerEdge(source, effect.shadowColor, offsetX, offsetY, blur), effect.shadowBlendMode, shadowOpacity, layerOpacity);
    }
    if (drawInner) {
      drawEdge(context, innerEdge(source, effect.highlightColor, offsetX, offsetY, blur), effect.highlightBlendMode, highlightOpacity, layerOpacity);
      drawEdge(context, innerEdge(source, effect.shadowColor, -offsetX, -offsetY, blur), effect.shadowBlendMode, shadowOpacity, layerOpacity);
    }
  }

  namespace.ImageEditorBevelEmbossRenderer = Object.freeze({ draw });
})(typeof window !== "undefined" ? window : globalThis);
