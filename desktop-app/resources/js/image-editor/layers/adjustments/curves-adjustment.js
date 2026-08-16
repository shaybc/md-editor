// Smooth editable tone curves for composite RGB and individual color channels.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const CHANNEL_NAMES = Object.freeze(["red", "green", "blue"]);

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function tangent(points, index) {
    if (index === 0) return (points[1].y - points[0].y) / Math.max(1, points[1].x - points[0].x);
    if (index === points.length - 1) {
      return (points[index].y - points[index - 1].y) / Math.max(1, points[index].x - points[index - 1].x);
    }
    return (points[index + 1].y - points[index - 1].y) / Math.max(1, points[index + 1].x - points[index - 1].x);
  }

  /** Build a 256-value cubic Hermite lookup table from ordered control points. */
  function createLookup(value) {
    const points = namespace.ImageEditorAdjustmentModel.normalizeCurvePoints(value);
    const lookup = new Uint8ClampedArray(256);
    let segment = 0;
    for (let input = 0; input < 256; input += 1) {
      while (segment < points.length - 2 && input > points[segment + 1].x) segment += 1;
      const first = points[segment];
      const second = points[segment + 1];
      const width = Math.max(1, second.x - first.x);
      const amount = clamp((input - first.x) / width, 0, 1);
      const amount2 = amount * amount;
      const amount3 = amount2 * amount;
      const firstSlope = tangent(points, segment) * width;
      const secondSlope = tangent(points, segment + 1) * width;
      const output = (2 * amount3 - 3 * amount2 + 1) * first.y +
        (amount3 - 2 * amount2 + amount) * firstSlope +
        (-2 * amount3 + 3 * amount2) * second.y +
        (amount3 - amount2) * secondSlope;
      lookup[input] = Math.round(clamp(output, 0, 255));
    }
    return lookup;
  }

  /** Apply the composite curve first and then each individual channel curve. */
  function render(imageData, adjustment = {}) {
    const composite = createLookup(adjustment.rgbPoints);
    const channels = CHANNEL_NAMES.map((channel) => createLookup(adjustment[channel + "Points"]));
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      CHANNEL_NAMES.forEach((channel, channelIndex) => {
        imageData.data[index + channelIndex] = channels[channelIndex][composite[imageData.data[index + channelIndex]]];
      });
    }
    return imageData;
  }

  namespace.ImageEditorCurvesAdjustment = { render, createLookup };
  namespace.ImageEditorAdjustmentRenderer.register("curves", render);
})(typeof window !== "undefined" ? window : globalThis);
