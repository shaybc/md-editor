// Destructive pixel-region edits that remain attached to their owning layer objects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function cloneImageData(imageData) {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }

  function canvasBackgroundLayer(store) {
    let fallback = null;
    namespace.walkDocumentNodes(store.document, (node) => {
      if (node.kind !== "layer") return;
      if (node.extensions?.canvasBackground) fallback = node;
      else if (!fallback && node.name === "Background") fallback = node;
    });
    return fallback;
  }

  function objectSourcePixels(object, assets) {
    const assetId = object.type === "raster" ? object.payload?.assetId : object.payload?.fallbackAssetId;
    const stored = assetId ? assets.get(assetId) : null;
    if (stored) return cloneImageData(stored);
    const bounds = object.bounds || {};
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(Number(bounds.width) || 1));
    canvas.height = Math.max(1, Math.ceil(Number(bounds.height) || 1));
    const localObject = {
      ...object,
      opacity: 1,
      bounds: { ...bounds, x: 0, y: 0 },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    };
    namespace.imageEditorContentRenderers.render(canvas.getContext("2d"), localObject, assets);
    return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  }

  function objectSourcePoint(point, object, imageData) {
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    const width = Math.max(1, Math.abs((Number(bounds.width) || 1) * (Number(transform.scaleX) || 1)));
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const height = Math.max(1, Math.abs((Number(bounds.height) || 1) * (Number(transform.scaleY) || 1)));
    const centerX = (Number(transform.x ?? bounds.x) || 0) + width / 2;
    const centerY = (Number(transform.y ?? bounds.y) || 0) + height / 2;
    const rotation = -(Number(transform.rotation) || 0);
    const deltaX = point.x - centerX;
    const deltaY = point.y - centerY;
    const localX = (deltaX * Math.cos(rotation) - deltaY * Math.sin(rotation)) * Math.sign(scaleX) + width / 2;
    const localY = (deltaX * Math.sin(rotation) + deltaY * Math.cos(rotation)) * Math.sign(scaleY) + height / 2;
    if (localX < 0 || localY < 0 || localX >= width || localY >= height) return null;
    return {
      x: Math.max(0, Math.min(imageData.width - 1, Math.floor(localX * imageData.width / width))),
      y: Math.max(0, Math.min(imageData.height - 1, Math.floor(localY * imageData.height / height)))
    };
  }

  function fillTargetObject(store, layer, point) {
    const selected = [...store.selectedIds]
      .map((id) => namespace.findDocumentObject(store.document, id))
      .find((found) => found?.layer.id === layer.id && found.object.visible !== false && !found.object.locked);
    if (selected) {
      const pixels = objectSourcePixels(selected.object, store.assets);
      if (objectSourcePoint(point, selected.object, pixels)) return { object: selected.object, pixels };
    }
    for (const object of layer.objects || []) {
      if (object.visible === false || object.locked) continue;
      const pixels = objectSourcePixels(object, store.assets);
      if (objectSourcePoint(point, object, pixels)) return { object, pixels };
    }
    return null;
  }

  function selectedEditableObject(store, layer) {
    return [...store.selectedIds]
      .map((id) => namespace.findDocumentObject(store.document, id))
      .find((found) => found?.layer.id === layer.id && found.object.visible !== false && !found.object.locked)?.object || null;
  }

  function imageDataCanvas(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
    return canvas;
  }

  function opaquePixelBounds(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height);
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!pixels.data[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return right < left || bottom < top ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }

  /** Composite floating selection pixels into their selected object without creating a detached layer edit. */
  function applySelectionPatchToLayerObject(store, layer, imageData, rect, rotation = 0) {
    if (!store || !layer || layer.locked || !imageData || !rect) return false;
    const object = selectedEditableObject(store, layer);
    if (!object) return false;
    const width = store.document.canvas.width;
    const height = store.document.canvas.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    namespace.imageEditorContentRenderers.render(context, { ...object, opacity: 1 }, store.assets);
    context.save();
    context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    context.rotate(Number(rotation) || 0);
    context.drawImage(imageDataCanvas(imageData), -rect.width / 2, -rect.height / 2, rect.width, rect.height);
    context.restore();
    const combinedBounds = opaquePixelBounds(context, width, height);
    if (!combinedBounds) return false;
    const pixels = context.getImageData(combinedBounds.x, combinedBounds.y, combinedBounds.width, combinedBounds.height);
    object.type = "raster";
    object.payload = { assetId: store.addRasterAsset(pixels) };
    object.bounds = { ...combinedBounds };
    object.transform = { x: combinedBounds.x, y: combinedBounds.y, scaleX: 1, scaleY: 1, rotation: 0 };
    store.notify({ type: "edit-object-pixels", ids: [layer.id, object.id] });
    return true;
  }

  function eraseObjectPixels(imageData, object, rect) {
    const bounds = object.bounds || {};
    const transform = object.transform || {};
    const width = Math.max(1, Math.abs((Number(bounds.width) || 1) * (Number(transform.scaleX) || 1)));
    const height = Math.max(1, Math.abs((Number(bounds.height) || 1) * (Number(transform.scaleY) || 1)));
    const centerX = (Number(transform.x ?? bounds.x) || 0) + width / 2;
    const scaleX = Number(transform.scaleX) || 1;
    const scaleY = Number(transform.scaleY) || 1;
    const centerY = (Number(transform.y ?? bounds.y) || 0) + height / 2;
    const rotation = Number(transform.rotation) || 0;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    let changed = false;
    for (let sourceY = 0; sourceY < imageData.height; sourceY += 1) {
      const localY = ((sourceY + 0.5) / imageData.height - 0.5) * height;
      for (let sourceX = 0; sourceX < imageData.width; sourceX += 1) {
        const alphaIndex = (sourceY * imageData.width + sourceX) * 4 + 3;
        if (!imageData.data[alphaIndex]) continue;
        const localX = ((sourceX + 0.5) / imageData.width - 0.5) * width;
        const canvasX = centerX + localX * Math.sign(scaleX) * cosine - localY * Math.sign(scaleY) * sine;
        const canvasY = centerY + localX * Math.sign(scaleX) * sine + localY * Math.sign(scaleY) * cosine;
        if (!namespace.ImageEditorSelectionShapes.contains(rect, { x: canvasX, y: canvasY })) continue;
        imageData.data[alphaIndex] = 0;
        changed = true;
      }
    }
    return changed;
  }

  function eraseCanvasPixels(imageData, rect) {
    const shaped = rect.shape && rect.shape !== "rectangle";
    const left = rect.inverted || shaped ? 0 : Math.max(0, Math.floor(rect.x));
    const top = rect.inverted || shaped ? 0 : Math.max(0, Math.floor(rect.y));
    const right = rect.inverted || shaped ? imageData.width : Math.min(imageData.width, Math.ceil(rect.x + rect.width));
    const bottom = rect.inverted || shaped ? imageData.height : Math.min(imageData.height, Math.ceil(rect.y + rect.height));
    let changed = false;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        if (!namespace.ImageEditorSelectionShapes.contains(rect, { x: x + .5, y: y + .5 })) continue;
        const alphaIndex = (y * imageData.width + x) * 4 + 3;
        if (!imageData.data[alphaIndex]) continue;
        imageData.data[alphaIndex] = 0;
        changed = true;
      }
    }
    return changed;
  }

  /** Erase pixels from existing content in one layer without creating a detached mask or panel item. */
  function eraseLayerRegion(store, layer, rect) {
    if (!store || !layer || layer.locked || !rect || rect.width <= 0 || rect.height <= 0) return false;
    let changed = false;
    (layer.objects || []).forEach((object) => {
      if (object.locked || object.visible === false) return;
      const pixels = objectSourcePixels(object, store.assets);
      if (!eraseObjectPixels(pixels, object, rect)) return;
      object.type = "raster";
      object.payload = { assetId: store.addRasterAsset(pixels) };
      changed = true;
    });
    if (layer.rasterAssetId) {
      const stored = store.assets.get(layer.rasterAssetId);
      if (stored) {
        const pixels = cloneImageData(stored);
        if (eraseCanvasPixels(pixels, rect)) {
          layer.rasterAssetId = store.addRasterAsset(pixels);
          changed = true;
        }
      }
    }
    (layer.pixelEdits || []).forEach((edit) => {
      if (edit.compositeOperation === "destination-out") return;
      const stored = store.assets.get(edit.assetId);
      if (!stored) return;
      const pixels = cloneImageData(stored);
      if (!eraseCanvasPixels(pixels, rect)) return;
      edit.assetId = store.addRasterAsset(pixels);
      changed = true;
    });
    if (changed) store.notify({ type: "edit-layer-pixels", ids: [layer.id] });
    return changed;
  }

  /**
   * Fill the selected object under a canvas point while keeping the pixels attached to its transform.
   * @returns An object indicating whether an object owned the point and whether its pixels changed.
   */
  function fillLayerObjectAtPoint(store, layer, point, state, mode) {
    if (!store || !layer || layer.locked || !point) return { handled: false, changed: false };
    const target = fillTargetObject(store, layer, point);
    if (!target) return { handled: false, changed: false };
    const sourcePoint = objectSourcePoint(point, target.object, target.pixels);
    const canvas = document.createElement("canvas");
    canvas.width = target.pixels.width;
    canvas.height = target.pixels.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.putImageData(target.pixels, 0, 0);
    const changed = mode === "pattern"
      ? namespace.patternFill(context, sourcePoint, state)
      : namespace.floodFill(context, sourcePoint, state);
    if (!changed) return { handled: true, changed: false };
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    target.object.type = "raster";
    target.object.payload = { assetId: store.addRasterAsset(pixels) };
    return { handled: true, changed: true, objectId: target.object.id };
  }

  /** Extend the designated background raster into newly added canvas space without scaling existing pixels. */
  function resizeCanvasBackground(store, previousWidth, previousHeight, nextWidth, nextHeight, backgroundColor) {
    const layer = canvasBackgroundLayer(store);
    if (!layer || layer.locked || (nextWidth <= previousWidth && nextHeight <= previousHeight)) return false;
    const object = (layer.objects || []).find((candidate) => {
      const transform = candidate.transform || {};
      const bounds = candidate.bounds || {};
      return candidate.type === "raster"
        && (Number(transform.x ?? bounds.x) || 0) === 0
        && (Number(transform.y ?? bounds.y) || 0) === 0
        && (Number(transform.rotation) || 0) === 0
        && (Number(transform.scaleX) || 1) === 1
        && (Number(transform.scaleY) || 1) === 1
        && Number(bounds.width) === previousWidth
        && Number(bounds.height) === previousHeight;
    });
    if (!object || object.locked) return false;
    const source = store.assets.get(object.payload?.assetId);
    if (!source) return false;
    const width = Math.max(source.width, nextWidth);
    const height = Math.max(source.height, nextHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    const canvasBackgroundColor = backgroundColor || store.document.canvas.backgroundColor || "#ffffff";
    if (canvasBackgroundColor !== "transparent") {
      context.fillStyle = canvasBackgroundColor;
      context.fillRect(0, 0, width, height);
    }
    context.putImageData(source, 0, 0);
    object.payload = { assetId: store.addRasterAsset(context.getImageData(0, 0, width, height)) };
    object.bounds = { ...object.bounds, width, height };
    store.notify({ type: "resize-background", ids: [layer.id, object.id] });
    return true;
  }

  namespace.ImageEditorObjectPixelEditor = { eraseLayerRegion, fillLayerObjectAtPoint, applySelectionPatchToLayerObject, resizeCanvasBackground };
})(typeof window !== "undefined" ? window : globalThis);
