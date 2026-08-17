// Multi-scale pointillist renderer for the non-destructive Points layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function tuneChannel(channel, lightness, saturation) {
    return Math.max(0, Math.min(255, lightness + (channel - lightness) * saturation));
  }

  /** Paint multiple offset fields of sampled color points to mimic layered pointillist marks. */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorPointsEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = descriptor.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let pass = 0; pass < descriptor.passes; pass += 1) {
      const cellSize = Math.max(4, Math.round(descriptor.cellSize * (1 - pass * 0.18)));
      const columns = Math.max(1, Math.ceil(source.width / cellSize));
      const rows = Math.max(1, Math.ceil(source.height / cellSize));
      const samples = document.createElement("canvas");
      samples.width = columns;
      samples.height = rows;
      const sampleContext = samples.getContext("2d", { willReadFrequently: true });
      sampleContext.drawImage(source, 0, 0, columns, rows);
      const pixels = sampleContext.getImageData(0, 0, columns, rows).data;
      context.globalAlpha = 0.82 - pass * 0.08;
      context.globalCompositeOperation = pass === 0 ? "source-over" : pass % 2 ? "multiply" : "screen";
      context.filter = descriptor.softness > 0 ? `blur(${descriptor.softness}px)` : "none";

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const pointIndex = pass * 1000003 + row * columns + column;
          if (randomAt(pointIndex * 4, descriptor.seed) > descriptor.density) continue;
          const pixelIndex = (row * columns + column) * 4;
          const alpha = pixels[pixelIndex + 3] / 255;
          if (alpha <= 0) continue;
          const red = pixels[pixelIndex];
          const green = pixels[pixelIndex + 1];
          const blue = pixels[pixelIndex + 2];
          const lightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
          const radiusVariation = 1 + (randomAt(pointIndex * 4 + 1, descriptor.seed) * 2 - 1) * descriptor.sizeVariation;
          const radius = Math.max(0.75, cellSize * 0.48 * radiusVariation);
          const jitter = cellSize * 0.3;
          const x = column * cellSize + cellSize / 2 + (randomAt(pointIndex * 4 + 2, descriptor.seed) * 2 - 1) * jitter;
          const y = row * cellSize + cellSize / 2 + (randomAt(pointIndex * 4 + 3, descriptor.seed) * 2 - 1) * jitter;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fillStyle = `rgba(${Math.round(tuneChannel(red, lightness, descriptor.saturation))},${Math.round(tuneChannel(green, lightness, descriptor.saturation))},${Math.round(tuneChannel(blue, lightness, descriptor.saturation))},${alpha})`;
          context.fill();
        }
      }
    }
    context.filter = "none";
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    return canvas;
  }

  namespace.ImageEditorPointsRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
