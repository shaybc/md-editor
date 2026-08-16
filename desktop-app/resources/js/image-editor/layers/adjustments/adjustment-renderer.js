// Registry and compositor bridge for non-destructive image adjustments.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const renderers = new Map();

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  /** Register the pure pixel renderer for one adjustment type. */
  function register(type, renderer) {
    if (!type || typeof renderer !== "function") throw new TypeError("An adjustment renderer requires a type and function.");
    renderers.set(type, renderer);
  }

  /** Resolve the mask influence for one canvas pixel. */
  function maskStrength(node, assets, x, y) {
    const mask = node.mask;
    if (!mask || mask.enabled === false) return 1;
    const fallback = clamp(Number(mask.defaultValue ?? 255), 0, 255) / 255;
    const bounds = mask.bounds;
    const pixels = mask.assetId ? assets.get(mask.assetId) : null;
    if (!pixels || !bounds || x < bounds.x || y < bounds.y || x >= bounds.x + bounds.width || y >= bounds.y + bounds.height) return fallback;
    const localX = Math.floor((x - bounds.x) * pixels.width / bounds.width);
    const localY = Math.floor((y - bounds.y) * pixels.height / bounds.height);
    return pixels.data[(localY * pixels.width + localX) * 4] / 255;
  }

  /** Apply one adjustment to pixels already composited beneath its hierarchy position. */
  function apply(context, node, assets) {
    const renderer = renderers.get(node?.adjustment?.type);
    if (!renderer || node?.visible === false) return false;
    const width = context.canvas.width;
    const height = context.canvas.height;
    if (!width || !height) return false;
    const original = context.getImageData(0, 0, width, height);
    const adjusted = new ImageData(new Uint8ClampedArray(original.data), width, height);
    renderer(adjusted, node.adjustment);
    const opacity = clamp(Number(node.opacity ?? 1), 0, 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (!original.data[index + 3]) continue;
        const amount = opacity * maskStrength(node, assets, x, y);
        for (let channel = 0; channel < 3; channel += 1) {
          original.data[index + channel] = Math.round(original.data[index + channel] + (adjusted.data[index + channel] - original.data[index + channel]) * amount);
        }
      }
    }
    context.putImageData(original, 0, 0);
    return true;
  }

  namespace.ImageEditorAdjustmentRenderer = { register, apply, maskStrength };
})(typeof window !== "undefined" ? window : globalThis);
