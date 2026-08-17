// Bristle-border and canvas-texture renderer for the non-destructive Paint Edge effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function parseColor(color) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  }

  function randomAt(x, y, seed) {
    let value = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + seed) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function edgeVariation(x, y, seed) {
    const broad = randomAt(Math.floor(x / 19), Math.floor(y / 19), seed) * 2 - 1;
    const bristle = randomAt(Math.floor(x / 4), Math.floor(y / 4), seed ^ 0x9e3779b9) * 2 - 1;
    return broad * 0.72 + bristle * 0.28;
  }

  /** Apply an irregular bristle-painted border and subtle canvas weave to a layer surface. */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPaintEdgeEffect.normalize(effect);
    if (descriptor.borderWidth <= 0 && descriptor.texture <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const border = parseColor(descriptor.borderColor);
    const maximumWidth = Math.min(canvas.width, canvas.height) / 2;
    const width = Math.min(descriptor.borderWidth, maximumWidth);

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const edgeDistance = Math.min(x, y, canvas.width - 1 - x, canvas.height - 1 - y);
        const variation = edgeVariation(x, y, descriptor.seed);
        const threshold = width * (1 + variation * descriptor.roughness * 0.58);
        const transition = Math.max(2, width * (0.05 + descriptor.splatter * 0.18));
        const speckle = randomAt(x, y, descriptor.seed ^ 0x85ebca6b);
        const painted = edgeDistance < threshold || (edgeDistance < threshold + transition && speckle < descriptor.splatter * 0.42);
        if (painted) {
          image.data[offset] = border[0];
          image.data[offset + 1] = border[1];
          image.data[offset + 2] = border[2];
          image.data[offset + 3] = 255;
        }
        if (image.data[offset + 3] && descriptor.texture > 0) {
          const weave = (((x + y) % 4 === 0 ? -1 : 1) + ((x - y) % 7 === 0 ? -0.7 : 0.3)) * descriptor.texture * 13;
          image.data[offset] = Math.max(0, Math.min(255, image.data[offset] + weave));
          image.data[offset + 1] = Math.max(0, Math.min(255, image.data[offset + 1] + weave));
          image.data[offset + 2] = Math.max(0, Math.min(255, image.data[offset + 2] + weave));
        }
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorPaintEdgeRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
