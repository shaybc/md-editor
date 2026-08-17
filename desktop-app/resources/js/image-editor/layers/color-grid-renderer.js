// Random colorized-cell renderer for the non-destructive ColorGrid layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const HUES = [0, 40, 120, 200, 300];

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function hueToRgb(hue) {
    const sector = ((hue % 360) + 360) % 360 / 60;
    const secondary = 1 - Math.abs(sector % 2 - 1);
    if (sector < 1) return [1, secondary, 0];
    if (sector < 2) return [secondary, 1, 0];
    if (sector < 3) return [0, 1, secondary];
    if (sector < 4) return [0, secondary, 1];
    if (sector < 5) return [secondary, 0, 1];
    return [1, 0, secondary];
  }

  /**
   * Colorize deterministic grid cells while retaining their original luminance, then draw grid lines.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized ColorGrid descriptor.
   * @returns {HTMLCanvasElement} Source or a color-grid canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorColorGridEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const cellWidth = canvas.width / descriptor.columns;
    const cellHeight = canvas.height / descriptor.rows;

    for (let row = 0; row < descriptor.rows; row += 1) {
      for (let column = 0; column < descriptor.columns; column += 1) {
        const cellIndex = row * descriptor.columns + column;
        const colorize = randomAt(cellIndex * 2, descriptor.seed) <= descriptor.colorCoverage;
        const hue = HUES[Math.floor(randomAt(cellIndex * 2 + 1, descriptor.seed) * HUES.length) % HUES.length];
        const target = hueToRgb(hue);
        const isBorder = row === 0 || column === 0 || row === descriptor.rows - 1 || column === descriptor.columns - 1;
        const startX = Math.floor(column * cellWidth);
        const endX = Math.ceil((column + 1) * cellWidth);
        const startY = Math.floor(row * cellHeight);
        const endY = Math.ceil((row + 1) * cellHeight);
        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const offset = (y * canvas.width + x) * 4;
            if (pixels[offset + 3] === 0) continue;
            const luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
            if (colorize) {
              pixels[offset] += (target[0] * luminance * 255 - pixels[offset]) * descriptor.colorStrength;
              pixels[offset + 1] += (target[1] * luminance * 255 - pixels[offset + 1]) * descriptor.colorStrength;
              pixels[offset + 2] += (target[2] * luminance * 255 - pixels[offset + 2]) * descriptor.colorStrength;
            }
            if (isBorder && descriptor.borderLightening > 0) {
              pixels[offset] += (255 - pixels[offset]) * descriptor.borderLightening;
              pixels[offset + 1] += (255 - pixels[offset + 1]) * descriptor.borderLightening;
              pixels[offset + 2] += (255 - pixels[offset + 2]) * descriptor.borderLightening;
            }
          }
        }
      }
    }
    context.putImageData(image, 0, 0);

    if (descriptor.lineWidth > 0) {
      context.strokeStyle = descriptor.lineColor;
      context.lineWidth = descriptor.lineWidth;
      context.beginPath();
      for (let column = 1; column < descriptor.columns; column += 1) {
        const x = Math.round(column * cellWidth);
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
      }
      for (let row = 1; row < descriptor.rows; row += 1) {
        const y = Math.round(row * cellHeight);
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
      }
      context.stroke();

      const sourceAlpha = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height).data;
      const result = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let offset = 3; offset < result.data.length; offset += 4) result.data[offset] = sourceAlpha[offset];
      context.putImageData(result, 0, 0);
    }
    return canvas;
  }

  namespace.ImageEditorColorGridRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
