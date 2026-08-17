// Colored-dot photo renderer for the non-destructive Dots layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function tuneChannel(channel, lightness, saturation, brightness) {
    return Math.max(0, Math.min(255, (lightness + (channel - lightness) * saturation) * brightness));
  }

  /** Render one sampled image color into each dot over the selected background color. */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorDotsEffect.normalize(effect);
    const columns = Math.max(1, Math.ceil(source.width / descriptor.cellSize));
    const rows = Math.max(1, Math.ceil(source.height / descriptor.cellSize));
    const samples = document.createElement("canvas");
    samples.width = columns;
    samples.height = rows;
    const sampleContext = samples.getContext("2d", { willReadFrequently: true });
    sampleContext.drawImage(source, 0, 0, columns, rows);
    const pixels = sampleContext.getImageData(0, 0, columns, rows).data;

    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = descriptor.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = descriptor.strokeWidth;
    context.strokeStyle = descriptor.strokeColor;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = (row * columns + column) * 4;
        const alpha = pixels[index + 3] / 255;
        if (alpha <= 0) continue;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const lightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const tunedRed = Math.round(tuneChannel(red, lightness, descriptor.saturation, descriptor.brightness));
        const tunedGreen = Math.round(tuneChannel(green, lightness, descriptor.saturation, descriptor.brightness));
        const tunedBlue = Math.round(tuneChannel(blue, lightness, descriptor.saturation, descriptor.brightness));
        const cellWidth = Math.min(descriptor.cellSize, source.width - column * descriptor.cellSize);
        const cellHeight = Math.min(descriptor.cellSize, source.height - row * descriptor.cellSize);
        const radius = Math.max(0.5, Math.min(cellWidth, cellHeight) * descriptor.dotScale / 2 - descriptor.strokeWidth / 2);
        context.beginPath();
        context.arc(column * descriptor.cellSize + cellWidth / 2, row * descriptor.cellSize + cellHeight / 2, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${tunedRed},${tunedGreen},${tunedBlue},${alpha})`;
        context.fill();
        if (descriptor.strokeWidth > 0) context.stroke();
      }
    }
    return canvas;
  }

  namespace.ImageEditorDotsRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
