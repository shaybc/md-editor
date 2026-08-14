// Raster-object renderer for the layered image compositor.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor;

  function imageDataCanvas(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
    return canvas;
  }

  function renderRaster(context, object, assets, requestedAssetId) {
    const imageData = assets.get(requestedAssetId || object.payload?.assetId);
    if (!imageData) return;
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const width = Math.max(1, Math.abs((Number(bounds.width) || 1) * scaleX));
    const height = Math.max(1, Math.abs((Number(bounds.height) || 1) * scaleY));
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

  namespace.renderImageEditorRasterObject = renderRaster;
  namespace.imageEditorContentRenderers.register("raster", renderRaster);
})(typeof window !== "undefined" ? window : globalThis);
