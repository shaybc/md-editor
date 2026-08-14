// Specialty textured brush rendering for the image editor brush library.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function parseHexColor(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(value || "");
    if (!match) return { red: 0, green: 0, blue: 0, alpha: 255 };
    const number = Number.parseInt(match[1], 16);
    return { red: number >> 16, green: (number >> 8) & 255, blue: number & 255, alpha: 255 };
  }

  function sampleColor(context, point, fallback) {
    if (typeof context.getImageData !== "function") return fallback;
    try {
      const pixel = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
      return pixel[3] ? { red: pixel[0], green: pixel[1], blue: pixel[2], alpha: pixel[3] } : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function mixColor(first, second, secondAmount, opacity = 1) {
    const firstAmount = 1 - secondAmount;
    return "rgba(" + Math.round(first.red * firstAmount + second.red * secondAmount) + ", "
      + Math.round(first.green * firstAmount + second.green * secondAmount) + ", "
      + Math.round(first.blue * firstAmount + second.blue * secondAmount) + ", " + opacity + ")";
  }

  function bristles(context, from, to, width, count, alpha, seedOffset, rendering) {
    const length = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
    const normalX = -(to.y - from.y) / length;
    const normalY = (to.x - from.x) / length;
    for (let index = 0; index < count; index += 1) {
      const seed = from.x * 0.31 + from.y * 0.47 + index + seedOffset;
      const offset = (rendering.seededNoise(seed) - 0.5) * width;
      const bristleWidth = width * (0.045 + rendering.seededNoise(seed + 17) * 0.1);
      rendering.line(context, from, to, bristleWidth, alpha * (0.65 + rendering.seededNoise(seed + 29) * 0.35), normalX * offset, normalY * offset);
    }
  }

  function patternStamps(context, from, to, width, pathDistance, distance) {
    const spacing = Math.max(4, width * 0.72);
    const first = pathDistance === 0 ? 0 : spacing - (pathDistance % spacing);
    context.globalAlpha = 0.9;
    context.fillStyle = context.strokeStyle;
    for (let offset = first; offset <= distance; offset += spacing) {
      const progress = distance ? offset / distance : 0;
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      const radius = Math.max(1, width * 0.22);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(x, y, Math.max(0.5, radius * 0.4), 0, Math.PI * 2);
      context.fill();
    }
  }

  /** Render a specialty preset. Returns false when the standard renderer should handle it. */
  function drawSpecialtyBrushPresetSegment(context, from, to, state, preset, pathDistance, distance, rendering) {
    const width = state.brushSize;
    if (preset === "wet-paint") {
      const foreground = parseHexColor(state.foregroundColor);
      const sampled = sampleColor(context, from, foreground);
      context.strokeStyle = mixColor(foreground, sampled, 0.38, namespace.clampImageEditorColorValue(state.foregroundOpacity ?? 1));
      rendering.line(context, from, to, width * 1.2, 0.2);
      bristles(context, from, to, width, 11, 0.48, 101, rendering);
    } else if (preset === "oil-paint") {
      rendering.line(context, from, to, width * 0.92, 0.82, 0, 0, "butt");
      bristles(context, from, to, width, 14, 0.72, 211, rendering);
    } else if (preset === "paint-splatter") {
      rendering.scatter(context, from, to, width, Math.max(12, Math.ceil(distance * 1.4)), 0.72, 0.13, 307);
      rendering.scatter(context, from, to, width * 1.8, Math.max(5, Math.ceil(distance * 0.45)), 0.48, 0.075, 401);
    } else if (preset === "graphite-pencil") {
      rendering.line(context, from, to, width * 0.2, 0.7);
      bristles(context, from, to, width * 0.55, 3, 0.28, 503, rendering);
      rendering.scatter(context, from, to, width * 0.45, Math.max(3, Math.ceil(distance * 0.55)), 0.24, 0.045, 521);
    } else if (preset === "wax-crayon") {
      rendering.line(context, from, to, width * 0.82, 0.5, 0, 0, "butt");
      bristles(context, from, to, width, 9, 0.42, 607, rendering);
      rendering.scatter(context, from, to, width, Math.max(4, Math.ceil(distance * 0.8)), 0.25, 0.06, 631);
    } else if (preset === "chalk") {
      rendering.line(context, from, to, width * 0.75, 0.32);
      bristles(context, from, to, width, 8, 0.3, 701, rendering);
      rendering.scatter(context, from, to, width * 1.1, Math.max(8, Math.ceil(distance * 1.5)), 0.3, 0.055, 733);
    } else if (preset === "pastel") {
      rendering.line(context, from, to, width * 1.05, 0.24);
      rendering.line(context, from, to, width * 0.72, 0.38);
      bristles(context, from, to, width, 7, 0.25, 809, rendering);
      rendering.scatter(context, from, to, width, Math.max(5, Math.ceil(distance)), 0.2, 0.05, 827);
    } else if (preset === "pattern") {
      patternStamps(context, from, to, width, pathDistance, distance);
    } else {
      return false;
    }
    return true;
  }

  namespace.drawSpecialtyBrushPresetSegment = drawSpecialtyBrushPresetSegment;
})(typeof window !== "undefined" ? window : globalThis);
