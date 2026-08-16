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
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const width = Math.max(1, Math.abs(bounds.width * scaleX));
    const height = Math.max(1, Math.abs(bounds.height * scaleY));
    const x = Number(transform.x ?? bounds.x) || 0;
    const y = Number(transform.y ?? bounds.y) || 0;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
    context.translate(x + width / 2, y + height / 2);
    context.rotate(Number(transform.rotation) || 0);
    context.scale(Math.sign(scaleX), Math.sign(scaleY));
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
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const width = Math.max(1, Math.abs(source.width * scaleX));
    const height = Math.max(1, Math.abs(source.height * scaleY));
    const x = Number(transform.x ?? bounds.x) || 0;
    const y = Number(transform.y ?? bounds.y) || 0;
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, Number(object.opacity ?? 1)));
    context.translate(x + width / 2, y + height / 2);
    context.rotate(Number(transform.rotation) || 0);
    context.scale(Math.sign(scaleX), Math.sign(scaleY));
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
      const layerPixels = this.store.assets.get(layer.rasterAssetId);
      if (layerPixels) context.drawImage(imageDataCanvas(layerPixels), 0, 0);
      [...(layer.objects || [])].reverse().forEach((object) => drawObject(context, object, this.store.assets));
      (layer.pixelEdits || []).forEach((edit) => {
        const pixels = this.store.assets.get(edit.assetId);
        if (!pixels) return;
        context.save();
        context.globalCompositeOperation = edit.compositeOperation === "destination-out" ? "destination-out" : "source-over";
        context.drawImage(imageDataCanvas(pixels), 0, 0);
        context.restore();
      });
      return canvas;
    }

    /** Composite a rendered layer together with its non-destructive effects. */
    drawStyledLayer(context, layer) {
      const source = this.renderLayer(layer);
      const opacity = Math.max(0, Math.min(1, Number(layer.opacity ?? 1)));
      namespace.ImageEditorDropShadowRenderer?.draw(context, source, namespace.ImageEditorDropShadowEffect?.get(layer), opacity);
      context.save();
      context.globalAlpha *= opacity;
      context.globalCompositeOperation = layer.blendMode === "normal" ? "source-over" : "source-over";
      context.drawImage(source, 0, 0);
      context.restore();
    }

    /** Render only the supplied content layers for layer-scoped pixel editing. */
    renderLayers(layers) {
      const canvas = document.createElement("canvas");
      canvas.width = this.store.document.canvas.width;
      canvas.height = this.store.document.canvas.height;
      const context = canvas.getContext("2d");
      [...(layers || [])].reverse().forEach((layer) => {
        if (!layer || layer.visible === false) return;
        context.save();
        context.globalAlpha *= Math.max(0, Math.min(1, Number(layer.opacity ?? 1)));
        context.globalCompositeOperation = layer.blendMode === "normal" ? "source-over" : "source-over";
        context.drawImage(this.renderLayer(layer), 0, 0);
        context.restore();
      });
      return canvas;
    }

    renderNodes(context, nodes) {
      [...nodes].reverse().forEach((node) => {
        if (!node.visible) return;
        if (node.kind === "object") {
          drawObject(context, node, this.store.assets);
          return;
        }
        if (node.kind === "layer") {
          this.drawStyledLayer(context, node);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = this.store.document.canvas.width;
        canvas.height = this.store.document.canvas.height;
        const childContext = canvas.getContext("2d");
        this.renderNodes(childContext, node.children || []);
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
