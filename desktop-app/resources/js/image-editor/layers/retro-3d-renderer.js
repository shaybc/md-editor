// Channel displacement renderer for the non-destructive Retro 3D layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const CHANNEL_BY_PAIR = Object.freeze({ "red-cyan": 0, "green-magenta": 1, "blue-yellow": 2 });

  function sampleChannel(pixels, width, height, x, y, channel) {
    if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return { channel: 0, alpha: 0 };
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const horizontal = x - x0;
    const vertical = y - y0;
    const indexes = [
      (y0 * width + x0) * 4,
      (y0 * width + x1) * 4,
      (y1 * width + x0) * 4,
      (y1 * width + x1) * 4
    ];
    function interpolate(offset) {
      const top = pixels[indexes[0] + offset] * (1 - horizontal) + pixels[indexes[1] + offset] * horizontal;
      const bottom = pixels[indexes[2] + offset] * (1 - horizontal) + pixels[indexes[3] + offset] * horizontal;
      return top * (1 - vertical) + bottom * vertical;
    }
    return { channel: interpolate(channel), alpha: interpolate(3) };
  }

  /**
   * Offset one color channel to create complementary anaglyph edges around layer content.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Retro 3D descriptor.
   * @returns {HTMLCanvasElement} Source or a channel-displaced transparent canvas.
   */
  function apply(source, effect) {
    const descriptor = namespace.ImageEditorRetro3DEffect.normalize(effect || {});
    if (!source || !effect?.enabled || descriptor.separation <= 0 || descriptor.strength <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const output = context.createImageData(canvas.width, canvas.height);
    output.data.set(original.data);
    const radians = descriptor.angle * Math.PI / 180;
    const offsetX = Math.cos(radians) * descriptor.separation;
    const offsetY = Math.sin(radians) * descriptor.separation;
    const displacedChannel = CHANNEL_BY_PAIR[descriptor.colorPair];

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        const originalAlpha = original.data[index + 3];
        const displaced = sampleChannel(original.data, canvas.width, canvas.height, x + offsetX, y + offsetY, displacedChannel);
        if (displaced.alpha <= 0) {
          if (originalAlpha > 0) output.data[index + displacedChannel] = Math.round(original.data[index + displacedChannel] * (1 - descriptor.strength));
          continue;
        }
        const blend = descriptor.strength * displaced.alpha / 255;
        output.data[index + displacedChannel] = originalAlpha > 0
          ? Math.round(original.data[index + displacedChannel] * (1 - blend) + displaced.channel * blend)
          : Math.round(displaced.channel);
        if (originalAlpha === 0) {
          for (let channel = 0; channel < 3; channel += 1) {
            if (channel !== displacedChannel) output.data[index + channel] = 0;
          }
        }
        output.data[index + 3] = Math.max(originalAlpha, Math.round(displaced.alpha * descriptor.strength));
      }
    }
    context.putImageData(output, 0, 0);
    return canvas;
  }

  namespace.ImageEditorRetro3DRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
