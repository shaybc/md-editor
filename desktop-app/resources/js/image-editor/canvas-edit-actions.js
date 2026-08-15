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

  function selectionBounds(region, width, height) {
    const source = region.inverted ? { x: 0, y: 0, width, height } : region;
    const x = Math.max(0, Math.floor(source.x));
    const y = Math.max(0, Math.floor(source.y));
    const right = Math.min(width, Math.ceil(source.x + source.width));
    const bottom = Math.min(height, Math.ceil(source.y + source.height));
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  }

  function flipRegion(context, region, horizontal) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    const bounds = selectionBounds(region, width, height);
    if (!bounds.width || !bounds.height) return false;
    const canvasPixels = context.getImageData(0, 0, width, height);
    const selected = context.createImageData(bounds.width, bounds.height);
    let changed = false;
    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const canvasX = bounds.x + x;
        const canvasY = bounds.y + y;
        const strength = namespace.ImageEditorSelectionShapes.strength(region, { x: canvasX + .5, y: canvasY + .5 });
        if (!strength) continue;
        const sourceIndex = (canvasY * width + canvasX) * 4;
        const destinationIndex = (y * bounds.width + x) * 4;
        const alpha = canvasPixels.data[sourceIndex + 3];
        if (!alpha) continue;
        selected.data[destinationIndex] = canvasPixels.data[sourceIndex];
        selected.data[destinationIndex + 1] = canvasPixels.data[sourceIndex + 1];
        selected.data[destinationIndex + 2] = canvasPixels.data[sourceIndex + 2];
        selected.data[destinationIndex + 3] = Math.round(alpha * strength);
        canvasPixels.data[sourceIndex + 3] = Math.round(alpha * (1 - strength));
        changed = true;
      }
    }
    if (!changed) return false;
    context.putImageData(canvasPixels, 0, 0);
    const flipped = namespace.flipImageEditorImageData(selected, horizontal);
    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        const strength = namespace.ImageEditorSelectionShapes.strength(region, { x: bounds.x + x + .5, y: bounds.y + y + .5 });
        const alphaIndex = (y * bounds.width + x) * 4 + 3;
        flipped.data[alphaIndex] = Math.round(flipped.data[alphaIndex] * strength);
      }
    }
    context.drawImage(imageDataCanvas(flipped), bounds.x, bounds.y);
    return true;
  }

  function flipRasterAssetRegions(store, assetId, regions, horizontal) {
    const source = store.assets.get(assetId);
    if (!source) return { assetId, changed: false };
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.putImageData(source, 0, 0);
    let changed = false;
    regions.forEach((region) => { if (flipRegion(context, region, horizontal)) changed = true; });
    return {
      assetId: changed ? store.addRasterAsset(context.getImageData(0, 0, canvas.width, canvas.height)) : assetId,
      changed
    };
  }

  function flipObjectRegions(store, object, regions, horizontal) {
    if (!object || object.locked || object.visible === false) return false;
    const canvas = document.createElement("canvas");
    canvas.width = store.document.canvas.width;
    canvas.height = store.document.canvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    namespace.imageEditorContentRenderers.render(context, { ...object, opacity: 1 }, store.assets);
    let changed = false;
    regions.forEach((region) => { if (flipRegion(context, region, horizontal)) changed = true; });
    if (!changed) return false;
    const bounds = opaqueBounds(context, canvas.width, canvas.height);
    if (!bounds) return false;
    object.type = "raster";
    object.payload = { assetId: store.addRasterAsset(context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height)) };
    object.bounds = { ...bounds };
    object.transform = { x: bounds.x, y: bounds.y, scaleX: 1, scaleY: 1, rotation: 0 };
    return true;
  }

  /** Flip requested canvas regions within existing objects on selected layers. */
  function flipSelectedLayerRegions(store, layers, regions, horizontal, objects = []) {
    let changed = false;
    layers.forEach((layer) => {
      (layer.objects || []).forEach((object) => {
        if (flipObjectRegions(store, object, regions, horizontal)) changed = true;
      });
      if (layer.rasterAssetId) {
        const result = flipRasterAssetRegions(store, layer.rasterAssetId, regions, horizontal);
        layer.rasterAssetId = result.assetId;
        changed = result.changed || changed;
      }
      (layer.pixelEdits || []).forEach((edit) => {
        if (edit.compositeOperation === "destination-out") return;
        const result = flipRasterAssetRegions(store, edit.assetId, regions, horizontal);
        edit.assetId = result.assetId;
        changed = result.changed || changed;
      });
    });
    objects.forEach((object) => {
      if (flipObjectRegions(store, object, regions, horizontal)) changed = true;
    });
    if (changed) store.notify({ type: "flip-selected-pixels", ids: [...layers.map((layer) => layer.id), ...objects.map((object) => object.id)] });
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

  function retainAssetRegion(store, assetId, region) {
    const source = store.assets.get(assetId);
    if (!source) return assetId;
    const canvas = document.createElement("canvas");
    canvas.width = store.document.canvas.width;
    canvas.height = store.document.canvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(imageDataCanvas(source), 0, 0);
    return store.addRasterAsset(maskedSelectionPixels(context, region, canvas.width, canvas.height));
  }

  function cropObjectToRegion(store, object, region) {
    const canvas = document.createElement("canvas");
    canvas.width = store.document.canvas.width;
    canvas.height = store.document.canvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    namespace.imageEditorContentRenderers.render(context, { ...object, opacity: 1 }, store.assets);
    context.putImageData(maskedSelectionPixels(context, region, canvas.width, canvas.height), 0, 0);
    const bounds = opaqueBounds(context, canvas.width, canvas.height);
    if (!bounds) return false;
    object.type = "raster";
    object.payload = { assetId: store.addRasterAsset(context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height)) };
    object.bounds = { ...bounds };
    object.transform = { x: bounds.x, y: bounds.y, scaleX: 1, scaleY: 1, rotation: 0 };
    return true;
  }

  function maskedSelectionPixels(context, region, width, height) {
    const pixels = context.getImageData(0, 0, width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const strength = namespace.ImageEditorSelectionShapes.strength(region, { x: x + .5, y: y + .5 });
        const alphaIndex = (y * width + x) * 4 + 3;
        pixels.data[alphaIndex] = Math.round(pixels.data[alphaIndex] * strength);
      }
    }
    return pixels;
  }

  /** Cut selected pixels from editable source layers into one new raster layer without changing canvas coordinates. */
  function liftSelectedLayerRegion(store, layers, region, objects = []) {
    if (!store || !region || (!layers.length && !objects.length)) return null;
    const width = store.document.canvas.width;
    const height = store.document.canvas.height;
    const selectedCanvas = new namespace.ImageEditorCompositor(store).renderLayers(layers);
    const selectedContext = selectedCanvas.getContext("2d", { willReadFrequently: true });
    const objectIds = new Set(objects.map((object) => object.id));
    namespace.walkDocumentObjects(store.document, (object) => {
      if (objectIds.has(object.id)) namespace.imageEditorContentRenderers.render(selectedContext, { ...object, opacity: 1 }, store.assets);
    });
    const selectedPixels = maskedSelectionPixels(selectedContext, region, width, height);
    const selectedBounds = opaqueBounds(imageDataCanvas(selectedPixels).getContext("2d", { willReadFrequently: true }), width, height);
    if (!selectedBounds) return null;
    let changed = false;
    layers.forEach((layer) => {
      if (namespace.ImageEditorObjectPixelEditor.eraseLayerRegion(store, layer, region)) changed = true;
    });
    objects.forEach((object) => {
      if (namespace.ImageEditorObjectPixelEditor.eraseObjectRegion(store, object, region)) changed = true;
    });
    if (!changed) return null;
    const liftedPixels = selectedContext.createImageData(selectedBounds.width, selectedBounds.height);
    const sourcePixels = selectedPixels.data;
    for (let y = 0; y < selectedBounds.height; y += 1) {
      const sourceStart = ((selectedBounds.y + y) * width + selectedBounds.x) * 4;
      const destinationStart = y * selectedBounds.width * 4;
      liftedPixels.data.set(sourcePixels.subarray(sourceStart, sourceStart + selectedBounds.width * 4), destinationStart);
    }
    const layer = store.addLayer("Lifted selection", layers[0]?.id || store.document.activeLayerId);
    const object = store.addRasterObject(liftedPixels, selectedBounds, { name: "Lifted selection", layerId: layer.id });
    return { layer, object };
  }

  /** Retain only the requested document region in the selected content layers. */
  function cropSelectedLayers(store, layers, region, objects = []) {
    let changed = false;
    layers.forEach((layer) => {
      if (!layer || layer.locked || layer.visible === false || namespace.isCanvasBackgroundLayer(layer)) return;
      const retainedObjects = [];
      (layer.objects || []).forEach((object) => {
        if (object.locked || object.visible === false) {
          retainedObjects.push(object);
          return;
        }
        if (cropObjectToRegion(store, object, region)) retainedObjects.push(object);
        changed = true;
      });
      layer.objects = retainedObjects;
      if (layer.rasterAssetId) {
        layer.rasterAssetId = retainAssetRegion(store, layer.rasterAssetId, region);
        changed = true;
      }
      (layer.pixelEdits || []).forEach((edit) => {
        edit.assetId = retainAssetRegion(store, edit.assetId, region);
        changed = true;
      });
    });
    objects.forEach((object) => {
      if (!object || object.locked || object.visible === false) return;
      if (!cropObjectToRegion(store, object, region)) {
        const location = namespace.findDocumentObject(store.document, object.id);
        if (location) location.collection.splice(location.index, 1);
      }
      changed = true;
    });
    if (changed) store.notify({ type: "crop-selected-layers", ids: [...layers.map((layer) => layer.id), ...objects.map((object) => object.id)] });
    return changed;
  }

  /** Move the crop origin to zero and resize canvas-owned raster surfaces. */
  function cropDocument(store, rect) {
    namespace.walkDocumentObjects(store.document, (object) => {
      object.transform = { ...(object.transform || {}), x: (Number(object.transform?.x ?? object.bounds?.x) || 0) - rect.x, y: (Number(object.transform?.y ?? object.bounds?.y) || 0) - rect.y };
    });
    namespace.walkDocumentNodes(store.document, (node) => {
      if (node.kind !== "layer") return;
      if (node.rasterAssetId) node.rasterAssetId = cropAsset(store, node.rasterAssetId, rect);
      (node.pixelEdits || []).forEach((edit) => { edit.assetId = cropAsset(store, edit.assetId, rect); });
    });
    store.document.canvas.width = rect.width;
    store.document.canvas.height = rect.height;
    store.notify({ type: "crop-canvas" });
    return true;
  }

  namespace.ImageEditorCanvasEditActions = { flipSelectedLayerRegions, cropSelectedLayers, cropDocument, liftSelectedLayerRegion };
})(typeof window !== "undefined" ? window : globalThis);
