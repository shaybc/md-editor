// Dense repeated-type renderer for the non-destructive Texturize layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function parseColor(hex) {
    return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  }

  function createTextCoverage(width, height, descriptor) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const fontSize = descriptor.fontSize;
    const lineHeight = Math.max(1, fontSize * descriptor.lineSpacing / 100);
    const text = descriptor.text.trim() || "TEXT ";
    context.fillStyle = "#FFFFFF";
    context.font = `700 ${fontSize}px ${descriptor.fontFamily}`;
    context.textBaseline = "top";
    const measuredWidth = Math.max(1, context.measureText(text).width);
    for (let row = 0, y = 0; y < height + lineHeight; row += 1, y += lineHeight) {
      const stagger = row % 2 ? measuredWidth * descriptor.stagger / 100 : 0;
      for (let x = -measuredWidth - stagger; x < width + measuredWidth; x += measuredWidth) context.fillText(text, x, y);
    }
    return context.getImageData(0, 0, width, height).data;
  }

  function adjustedLuminance(red, green, blue, descriptor) {
    let value = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    value = clamp(value + descriptor.brightness / 100);
    const factor = descriptor.contrast >= 0 ? 1 + descriptor.contrast / 45 : 1 + descriptor.contrast / 100;
    value = clamp((value - 0.5) * factor + 0.5);
    return descriptor.invert ? 1 - value : value;
  }

  /**
   * Rebuild a rendered layer from repeated text whose visibility follows source luminance.
   * @param {HTMLCanvasElement} source - Fully rendered layer surface.
   * @param {object|null} effect - Normalized Texturize descriptor.
   * @returns {HTMLCanvasElement} Source or a text-portrait canvas with matching dimensions.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorTexturizeEffect.normalize(effect);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const sourceImage = context.getImageData(0, 0, canvas.width, canvas.height);
    const output = context.createImageData(canvas.width, canvas.height);
    const coverage = createTextCoverage(canvas.width, canvas.height, descriptor);
    const textColor = parseColor(descriptor.textColor);
    const backgroundColor = parseColor(descriptor.backgroundColor);

    for (let index = 0; index < sourceImage.data.length; index += 4) {
      const sourceAlpha = sourceImage.data[index + 3] / 255;
      if (!sourceAlpha) continue;
      const tone = adjustedLuminance(sourceImage.data[index], sourceImage.data[index + 1], sourceImage.data[index + 2], descriptor);
      const textAlpha = coverage[index + 3] / 255 * tone * sourceAlpha;
      const backgroundAlpha = descriptor.backgroundOpacity * sourceAlpha;
      const outputAlpha = textAlpha + backgroundAlpha * (1 - textAlpha);
      const foreground = descriptor.useSourceColor
        ? [sourceImage.data[index], sourceImage.data[index + 1], sourceImage.data[index + 2]]
        : textColor;
      for (let channel = 0; channel < 3; channel += 1) {
        const premultiplied = foreground[channel] * textAlpha + backgroundColor[channel] * backgroundAlpha * (1 - textAlpha);
        output.data[index + channel] = outputAlpha ? premultiplied / outputAlpha : 0;
      }
      output.data[index + 3] = outputAlpha * 255;
    }
    context.putImageData(output, 0, 0);
    return canvas;
  }

  namespace.ImageEditorTexturizeRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
