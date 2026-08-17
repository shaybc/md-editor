// Canvas renderer for the non-destructive layer Blur effect.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /**
   * Return a Gaussian-like blurred copy of a rendered layer while preserving alpha.
   * @param {HTMLCanvasElement} source - Fully rendered source layer.
   * @param {object|null} effect - Normalized Blur descriptor.
   * @returns {HTMLCanvasElement} Source or a blurred transparent canvas.
   */
  function apply(source, effect) {
    const radius = Math.max(0, Math.min(250, Number(effect?.radius) || 0));
    if (!source || !effect?.enabled || radius <= 0) return source;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.filter = `blur(${radius}px)`;
    context.drawImage(source, 0, 0);
    context.filter = "none";
    return canvas;
  }

  namespace.ImageEditorBlurRenderer = Object.freeze({ apply });
})(typeof window !== "undefined" ? window : globalThis);
