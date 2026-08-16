// Canvas renderer for the non-destructive layer grayscale effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /** Return a grayscale copy of a rendered layer while preserving alpha. */
  function apply(source, effect) {
    if (!source || !effect || effect.enabled === false) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = Math.round(pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114);
      pixels.data[index] = gray;
      pixels.data[index + 1] = gray;
      pixels.data[index + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  }

  namespace.ImageEditorGrayscaleRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
