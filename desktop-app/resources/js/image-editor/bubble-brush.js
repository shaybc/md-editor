// Scattered transparent bubble-ring rendering for the image editor brush library.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const renderers = namespace.ImageEditorBrushPresetRenderers = namespace.ImageEditorBrushPresetRenderers || {};

  function traceEllipse(context, x, y, radiusX, radiusY, rotation, startAngle = 0, endAngle = Math.PI * 2) {
    context.beginPath();
    if (typeof context.ellipse === "function") context.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle);
    else context.arc(x, y, Math.max(radiusX, radiusY), startAngle, endAngle);
  }

  function drawBubbleRing(context, x, y, radius, roundness, rotation) {
    const radiusX = Math.max(0.75, radius);
    const radiusY = Math.max(0.75, radius * roundness);
    context.globalAlpha = 0.2;
    context.lineWidth = Math.max(1, radius * 0.18);
    traceEllipse(context, x, y, radiusX, radiusY, rotation);
    context.stroke();

    context.globalAlpha = 0.82;
    context.lineWidth = Math.max(0.65, radius * 0.065);
    traceEllipse(context, x, y, radiusX, radiusY, rotation);
    context.stroke();

    context.globalAlpha = 0.95;
    context.lineWidth = Math.max(0.8, radius * 0.1);
    traceEllipse(context, x, y, radiusX * 0.73, radiusY * 0.73, rotation, Math.PI * 1.08, Math.PI * 1.52);
    context.stroke();

    context.globalAlpha = 0.55;
    context.lineWidth = Math.max(0.65, radius * 0.07);
    traceEllipse(context, x, y, radiusX * 0.78, radiusY * 0.78, rotation, Math.PI * 0.08, Math.PI * 0.33);
    context.stroke();
  }

  /**
   * Paint one deterministic bubble-brush segment with size, roundness, and scatter variation.
   * @returns {boolean} True because this renderer owns the Bubble brush preset.
   */
  function drawBubbleBrushSegment(context, from, to, state, pathDistance, distance, rendering) {
    const width = Math.max(1, Number(state.brushSize) || 1);
    const spacing = Math.max(4, width * 0.58);
    const firstOffset = pathDistance === 0 ? 0 : spacing - (pathDistance % spacing);
    context.setLineDash?.([]);
    context.lineCap = "round";

    for (let offset = firstOffset; offset <= distance; offset += spacing) {
      const progress = distance ? offset / distance : 0;
      const seed = from.x * 0.37 + from.y * 0.61 + pathDistance + offset * 1.7;
      const scatterAngle = rendering.seededNoise(seed + 11) * Math.PI * 2;
      const scatterRadius = Math.sqrt(rendering.seededNoise(seed + 23)) * width * 1.25;
      const x = from.x + (to.x - from.x) * progress + Math.cos(scatterAngle) * scatterRadius;
      const y = from.y + (to.y - from.y) * progress + Math.sin(scatterAngle) * scatterRadius;
      const radius = Math.max(1.5, width * (0.12 + rendering.seededNoise(seed + 37) * 0.48));
      const roundness = 0.25 + rendering.seededNoise(seed + 53) * 0.75;
      const rotation = rendering.seededNoise(seed + 71) * Math.PI;
      drawBubbleRing(context, x, y, radius, roundness, rotation);
    }
    return true;
  }

  renderers.bubble = drawBubbleBrushSegment;
})(typeof window !== "undefined" ? window : globalThis);
