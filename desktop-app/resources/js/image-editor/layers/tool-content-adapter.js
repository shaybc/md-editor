// Conversion between completed tool output and editable document objects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TOOL_CONTENT_NAMES = Object.freeze({
    callout: "Rounded rectangular callout",
    "oval-callout": "Oval callout",
    "cloud-callout": "Cloud callout"
  });

  /** Return the user-facing name assigned to layers and objects created by a drawing tool. */
  function toolContentName(tool) {
    const identifier = String(tool || "shape");
    if (TOOL_CONTENT_NAMES[identifier]) return TOOL_CONTENT_NAMES[identifier];
    const words = identifier.replace(/-/g, " ");
    return words[0].toUpperCase() + words.slice(1);
  }

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
        name: options.name || descriptor.name || toolContentName(descriptor.tool),
        bounds: { ...rect },
        transform: { x: rect.x, y: rect.y, scaleX: 1, scaleY: 1, rotation: Number(options.rotation) || 0 }
      });
    }
  }

  Object.assign(namespace, { captureImageEditorToolStyle: captureToolStyle, imageEditorToolContentName: toolContentName, ImageEditorToolContentAdapter });
})(typeof window !== "undefined" ? window : globalThis);
