// Soft radial-spectrum renderer for the non-destructive Rainbow layer effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
  }

  function spectrumColor(position) {
    const stops = [
      [255, 52, 52], [255, 152, 25], [255, 232, 45], [62, 218, 92],
      [45, 181, 255], [68, 92, 235], [156, 65, 220]
    ];
    const scaled = Math.max(0, Math.min(1, position)) * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const amount = scaled - index;
    return stops[index].map((channel, channelIndex) => channel + (stops[index + 1][channelIndex] - channel) * amount);
  }

  /**
   * Blend a soft upper rainbow arc into opaque source pixels while preserving source alpha.
   * @param {HTMLCanvasElement} source - Fully rendered transparent layer surface.
   * @param {object|null} effect - Normalized Rainbow descriptor.
   * @returns {HTMLCanvasElement} Source or a rainbow-covered transparent canvas.
   */
  function apply(source, effect) {
    if (!source || !effect?.enabled || source.width < 1 || source.height < 1) return source;
    const descriptor = namespace.ImageEditorRainbowEffect.normalize(effect);
    if (descriptor.intensity <= 0 || descriptor.thickness <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    const centerX = canvas.width * descriptor.positionX / 100;
    const centerY = canvas.height * descriptor.positionY / 100;
    const radius = Math.max(1, Math.min(canvas.width, canvas.height) * descriptor.scale / 100);
    const band = Math.max(1, radius * descriptor.thickness / 100);
    const softness = Math.max(0.75, band * descriptor.softness / 50);
    const fadeDistance = Math.max(1, radius * descriptor.fade / 100);
    const innerRadius = radius - band;

    for (let y = 0; y < canvas.height; y += 1) {
      const vertical = centerY - y;
      if (vertical < -softness) continue;
      const horizonFade = descriptor.fade <= 0 ? (vertical >= 0 ? 1 : 0) : smoothstep(-softness, fadeDistance, vertical);
      if (horizonFade <= 0) continue;
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset + 3] === 0) continue;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance < innerRadius - softness || distance > radius + softness) continue;
        const outerEdge = 1 - smoothstep(radius, radius + softness, distance);
        const innerEdge = smoothstep(innerRadius - softness, innerRadius, distance);
        const alpha = descriptor.intensity * horizonFade * outerEdge * innerEdge;
        if (alpha <= 0) continue;
        const color = spectrumColor((radius - distance) / band);
        for (let channel = 0; channel < 3; channel += 1) {
          const base = pixels[offset + channel];
          const screened = 255 - (255 - base) * (255 - color[channel]) / 255;
          pixels[offset + channel] = Math.round(base + (screened - base) * alpha);
        }
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  namespace.ImageEditorRainbowRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
