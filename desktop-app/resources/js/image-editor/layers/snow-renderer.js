// Deterministic falling-flake renderer for the non-destructive Snow layer effect.
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

  function drawFlake(context, random, width, height, descriptor, isNear) {
    const depthScale = isNear ? 1.25 + descriptor.depth * 1.75 : 0.3 + random() * 0.55;
    const radius = Math.max(0.4, descriptor.flakeSize * depthScale * (0.55 + random() * 0.75));
    const motion = descriptor.motion * (isNear ? 0.8 + descriptor.depth : 0.25 + random() * 0.45);
    const radians = descriptor.angle * Math.PI / 180;
    const halfX = Math.cos(radians) * motion / 2;
    const halfY = Math.sin(radians) * motion / 2;
    const x = random() * width;
    const y = random() * height;
    const alpha = descriptor.brightness * (isNear ? 0.62 + random() * 0.34 : 0.32 + random() * 0.46);

    context.strokeStyle = `rgba(255,255,255,${alpha})`;
    context.fillStyle = `rgba(255,255,255,${Math.min(1, alpha * 1.12)})`;
    context.lineCap = "round";
    context.lineWidth = Math.max(0.7, radius * (isNear ? 0.62 : 0.45));
    if (motion > 0.5) {
      context.beginPath();
      context.moveTo(x - halfX, y - halfY);
      context.lineTo(x + halfX, y + halfY);
      context.stroke();
    }
    context.beginPath();
    context.arc(x + halfX, y + halfY, Math.max(0.45, radius * 0.46), 0, Math.PI * 2);
    context.fill();
  }

  /**
   * Overlay two deterministic depths of falling snow while preserving source alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Snow descriptor.
   * @returns {HTMLCanvasElement} Source or a snow-covered transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorSnowEffect.normalize(effect);
    if (descriptor.density <= 0 || descriptor.brightness <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    context.save();
    context.globalCompositeOperation = "source-atop";
    const random = createRandom(descriptor.seed ^ source.width ^ Math.imul(source.height, 2654435761));
    const total = Math.min(6000, Math.max(1, Math.round(source.width * source.height / 2600 * descriptor.density)));
    const nearCount = Math.round(total * descriptor.depth * 0.28);
    const farCount = total - nearCount;
    for (let index = 0; index < farCount; index += 1) {
      drawFlake(context, random, source.width, source.height, descriptor, false);
    }
    for (let index = 0; index < nearCount; index += 1) {
      drawFlake(context, random, source.width, source.height, descriptor, true);
    }
    context.restore();
    return canvas;
  }

  namespace.ImageEditorSnowRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
