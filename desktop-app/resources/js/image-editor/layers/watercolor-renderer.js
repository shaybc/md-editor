// Layered color-wash renderer for the non-destructive Watercolor layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function randomAt(index, seed) {
    let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function tuneChannel(channel, lightness, pigment) {
    return Math.max(0, Math.min(255, lightness + (channel - lightness) * pigment));
  }

  function parseHexColor(color) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  }

  /** Blend simplified color washes, dry-brush detail and paper grain into one painting surface. */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorWatercolorEffect.normalize(effect);
    const washScale = Math.max(1, descriptor.washRadius / 2);
    const wash = document.createElement("canvas");
    wash.width = Math.max(1, Math.round(source.width / washScale));
    wash.height = Math.max(1, Math.round(source.height / washScale));
    wash.getContext("2d").drawImage(source, 0, 0, wash.width, wash.height);

    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.filter = descriptor.washRadius > 0 ? `blur(${Math.min(4, descriptor.washRadius / 6)}px)` : "none";
    context.drawImage(wash, 0, 0, canvas.width, canvas.height);
    context.filter = "none";

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const sourceData = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height).data;
    const paper = parseHexColor(descriptor.paperColor);
    const step = 255 / Math.max(1, descriptor.colorLevels - 1);
    for (let index = 0; index < data.length; index += 4) {
      const alpha = sourceData[index + 3];
      data[index + 3] = alpha;
      if (!alpha) continue;
      const lightness = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
      data[index] = Math.round(tuneChannel(Math.round(data[index] / step) * step, lightness, descriptor.pigment));
      data[index + 1] = Math.round(tuneChannel(Math.round(data[index + 1] / step) * step, lightness, descriptor.pigment));
      data[index + 2] = Math.round(tuneChannel(Math.round(data[index + 2] / step) * step, lightness, descriptor.pigment));
      const grain = (randomAt(index, descriptor.seed) * 2 - 1) * descriptor.paperTexture * 22;
      const paperMix = descriptor.paperTexture * 0.12;
      data[index] = Math.max(0, Math.min(255, data[index] * (1 - paperMix) + paper[0] * paperMix + grain));
      data[index + 1] = Math.max(0, Math.min(255, data[index + 1] * (1 - paperMix) + paper[1] * paperMix + grain));
      data[index + 2] = Math.max(0, Math.min(255, data[index + 2] * (1 - paperMix) + paper[2] * paperMix + grain));
    }
    context.putImageData(image, 0, 0);

    context.globalAlpha = descriptor.brushDetail;
    context.globalCompositeOperation = "screen";
    context.filter = "contrast(1.15) saturate(0.9)";
    context.drawImage(source, 0, 0);
    context.globalAlpha = descriptor.edgeDefinition;
    context.globalCompositeOperation = "soft-light";
    context.filter = "contrast(1.6) grayscale(0.25)";
    context.drawImage(source, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    return canvas;
  }

  namespace.ImageEditorWatercolorRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
