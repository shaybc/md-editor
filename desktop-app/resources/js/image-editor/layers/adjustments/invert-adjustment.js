// Non-destructive RGB channel inversion for adjustment-layer compositing.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /** Invert visible RGB pixels while retaining their original alpha values. */
  function render(imageData) {
    for (let index = 0; index < imageData.data.length; index += 4) {
      if (!imageData.data[index + 3]) continue;
      imageData.data[index] = 255 - imageData.data[index];
      imageData.data[index + 1] = 255 - imageData.data[index + 1];
      imageData.data[index + 2] = 255 - imageData.data[index + 2];
    }
    return imageData;
  }

  namespace.ImageEditorInvertAdjustment = { render };
  namespace.ImageEditorAdjustmentRenderer.register("invert", render);
})(typeof window !== "undefined" ? window : globalThis);
