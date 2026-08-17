// Deterministic motion-streak renderer for the non-destructive Rain layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function createRandom(seed) {
    let state = seed >>> 0 || 0x9e3779b9;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function drawStreak(context, random, width, height, descriptor) {
    const radians = descriptor.angle * Math.PI / 180;
    const length = descriptor.length * (0.45 + random() * 1.1);
    const halfX = Math.cos(radians) * length / 2;
    const halfY = Math.sin(radians) * length / 2;
    const x = random() * width;
    const y = random() * height;
    const alpha = descriptor.brightness * (0.18 + random() * 0.62);
    const gradient = context.createLinearGradient(x - halfX, y - halfY, x + halfX, y + halfY);
    gradient.addColorStop(0, "rgba(210,230,255,0)");
    gradient.addColorStop(0.3, `rgba(220,238,255,${alpha * 0.62})`);
    gradient.addColorStop(1, `rgba(245,250,255,${alpha})`);
    context.strokeStyle = gradient;
    context.lineCap = "round";
    context.lineWidth = Math.max(0.25, descriptor.thickness * (0.55 + random() * 0.9));
    context.beginPath();
    context.moveTo(x - halfX, y - halfY);
    context.lineTo(x + halfX, y + halfY);
    context.stroke();
  }

  /**
   * Overlay deterministic, motion-blurred rain streaks without changing transparent layer pixels.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Rain descriptor.
   * @returns {HTMLCanvasElement} Source or a rain-covered transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorRainEffect.normalize(effect);
    if (descriptor.amount <= 0 || descriptor.brightness <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    context.save();
    context.globalCompositeOperation = "source-atop";
    const random = createRandom(descriptor.seed ^ source.width ^ Math.imul(source.height, 2654435761));
    const total = Math.min(12000, Math.max(1, Math.round(source.width * source.height / 600 * descriptor.amount)));
    for (let index = 0; index < total; index += 1) drawStreak(context, random, source.width, source.height, descriptor);
    context.restore();
    return canvas;
  }

  namespace.ImageEditorRainRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
