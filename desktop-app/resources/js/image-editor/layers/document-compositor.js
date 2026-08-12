// Deterministic canvas compositor for layered image-editor documents.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function imageDataCanvas(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
    return canvas;
  }

  function drawRasterObject(context, object, assets) {
    const imageData = assets.get(object.payload?.assetId);
    if (!imageData) return;
    const bounds = object.bounds;
    const transform = object.transform || {};
    const width = Math.max(1, bounds.width * (Number(transform.scaleX) || 1));
    const height = Math.max(1, bounds.height * (Number(transform.scaleY) || 1));
    const x = Number(transform.x ?? bounds.x) || 0;
    const y = Number(transform.y ?? bounds.y) || 0;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
    context.translate(x + width / 2, y + height / 2);
    context.rotate(Number(transform.rotation) || 0);
    context.drawImage(imageDataCanvas(imageData), -width / 2, -height / 2, width, height);
    context.restore();
  }

  function drawTextObject(context, object) {
    const payload = object.payload || {};
    const state = payload.style || {};
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.ceil(Number(bounds.width) || 1));
    source.height = Math.max(1, Math.ceil(Number(bounds.height) || 1));
    namespace.drawText?.(source.getContext("2d"), { x: 0, y: 0, width: source.width, height: source.height, lineHeight: payload.box?.lineHeight }, payload.text || "", state);
    const width = Math.max(1, source.width * (Number(transform.scaleX) || 1));
    const height = Math.max(1, source.height * (Number(transform.scaleY) || 1));
    const x = Number(transform.x ?? bounds.x) || 0;
    const y = Number(transform.y ?? bounds.y) || 0;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
    context.translate(x + width / 2, y + height / 2);
    context.rotate(Number(transform.rotation) || 0);
    context.drawImage(source, -width / 2, -height / 2, width, height);
    context.restore();
  }

  function drawFallbackObject(context, object, assets) {
    const assetId = object.payload?.fallbackAssetId;
    if (!assetId) return;
    drawRasterObject(context, { ...object, type: "raster", payload: { assetId } }, assets);
  }

  function drawObject(context, object, assets) {
    namespace.imageEditorContentRenderers.render(context, object, assets);
  }

  class ImageEditorCompositor {
    /** Composite visible hierarchy nodes to presentation or export canvases. */
    constructor(store) {
      this.store = store;
      this.layerCache = new Map();
    }

    renderLayer(layer) {
      const width = this.store.document.canvas.width;
      const height = this.store.document.canvas.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      [...(layer.objects || [])].reverse().forEach((object) => drawObject(context, object, this.store.assets));
      return canvas;
    }

    renderNodes(context, nodes) {
      [...nodes].reverse().forEach((node) => {
        if (!node.visible) return;
        const canvas = document.createElement("canvas");
        canvas.width = this.store.document.canvas.width;
        canvas.height = this.store.document.canvas.height;
        const childContext = canvas.getContext("2d");
        if (node.kind === "group") this.renderNodes(childContext, node.children || []);
        else childContext.drawImage(this.renderLayer(node), 0, 0);
        context.save();
        context.globalAlpha *= Math.max(0, Math.min(1, Number(node.opacity ?? 1)));
        context.globalCompositeOperation = node.blendMode === "normal" ? "source-over" : "source-over";
        context.drawImage(canvas, 0, 0);
        context.restore();
      });
    }

    /** Render the visible document without changing the model. */
    render(options = {}) {
      const canvas = options.canvas || document.createElement("canvas");
      canvas.width = this.store.document.canvas.width;
      canvas.height = this.store.document.canvas.height;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (options.backgroundColor) {
        context.fillStyle = options.backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      this.renderNodes(context, this.store.document.nodes);
      return canvas;
    }
  }

  namespace.ImageEditorCompositor = ImageEditorCompositor;
})(typeof window !== "undefined" ? window : globalThis);
