// Document mutations used by the image-editor canvas context menu.
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

  function opaqueBounds(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!pixels[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }

  function flipRegion(context, rect, horizontal) {
    const selected = context.getImageData(rect.x, rect.y, rect.width, rect.height);
    if (!selected.data.some((value, index) => index % 4 === 3 && value)) return false;
    context.clearRect(rect.x, rect.y, rect.width, rect.height);
    context.putImageData(namespace.flipImageEditorImageData(selected, horizontal), rect.x, rect.y);
    return true;
  }

  /** Flip requested canvas regions within existing objects on selected layers. */
  function flipSelectedLayerRegions(store, layers, regions, horizontal) {
    let changed = false;
    layers.forEach((layer) => {
      (layer.objects || []).forEach((object) => {
        if (object.locked || object.visible === false) return;
        const canvas = document.createElement("canvas");
        canvas.width = store.document.canvas.width;
        canvas.height = store.document.canvas.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        namespace.imageEditorContentRenderers.render(context, { ...object, opacity: 1 }, store.assets);
        let objectChanged = false;
        regions.forEach((rect) => { if (flipRegion(context, rect, horizontal)) objectChanged = true; });
        if (!objectChanged) return;
        const bounds = opaqueBounds(context, canvas.width, canvas.height);
        if (!bounds) return;
        object.type = "raster";
        object.payload = { assetId: store.addRasterAsset(context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height)) };
        object.bounds = { ...bounds };
        object.transform = { x: bounds.x, y: bounds.y, scaleX: 1, scaleY: 1, rotation: 0 };
        changed = true;
      });
    });
    if (changed) store.notify({ type: "flip-selected-pixels", ids: layers.map((layer) => layer.id) });
    return changed;
  }

  function cropAsset(store, assetId, rect) {
    const source = store.assets.get(assetId);
    if (!source) return assetId;
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.getContext("2d").drawImage(imageDataCanvas(source), -rect.x, -rect.y);
    return store.addRasterAsset(canvas.getContext("2d").getImageData(0, 0, rect.width, rect.height));
  }

  /** Move the crop origin to zero and resize canvas-owned raster surfaces. */
  function cropDocument(store, rect) {
    namespace.walkDocumentNodes(store.document, (node) => {
      if (node.kind !== "layer") return;
      (node.objects || []).forEach((object) => {
        object.transform = { ...(object.transform || {}), x: (Number(object.transform?.x ?? object.bounds?.x) || 0) - rect.x, y: (Number(object.transform?.y ?? object.bounds?.y) || 0) - rect.y };
      });
      if (node.rasterAssetId) node.rasterAssetId = cropAsset(store, node.rasterAssetId, rect);
      (node.pixelEdits || []).forEach((edit) => { edit.assetId = cropAsset(store, edit.assetId, rect); });
    });
    store.document.canvas.width = rect.width;
    store.document.canvas.height = rect.height;
    store.notify({ type: "crop-canvas" });
    return true;
  }

  namespace.ImageEditorCanvasEditActions = { flipSelectedLayerRegions, cropDocument };
})(typeof window !== "undefined" ? window : globalThis);
