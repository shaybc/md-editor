// Conversion between completed tool output and editable document objects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function captureToolStyle(state) {
    return {
      foregroundColor: state.foregroundColor,
      backgroundColor: state.backgroundColor,
      lineWidth: state.lineWidth,
      strokeType: state.strokeType,
      fillShapes: state.fillShapes
    };
  }

  class ImageEditorToolContentAdapter {
    /** Convert transparent tool pixels into a semantic object with a raster fallback. */
    static createShapeObject(store, imageData, rect, descriptor = {}, options = {}) {
      const assetId = store.addRasterAsset(imageData);
      const type = descriptor.tool === "path" || descriptor.tool === "curve" ? "path" : "shape";
      return namespace.createContentObject(type, {
        tool: descriptor.tool || "shape",
        geometry: descriptor.geometry || null,
        style: descriptor.style || {},
        fallbackAssetId: assetId
      }, {
        name: options.name || descriptor.name || "Shape",
        bounds: { ...rect },
        transform: { x: rect.x, y: rect.y, scaleX: 1, scaleY: 1, rotation: Number(options.rotation) || 0 }
      });
    }
  }

  Object.assign(namespace, { captureImageEditorToolStyle: captureToolStyle, ImageEditorToolContentAdapter });
})(typeof window !== "undefined" ? window : globalThis);
