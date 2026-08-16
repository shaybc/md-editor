// Grayscale raster creation and editing for adjustment-layer masks.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function imageData(width, height, value) {
    const pixels = new ImageData(width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    return pixels;
  }

  function adjustmentNode(store, nodeId) {
    const node = namespace.findDocumentNode(store.document, nodeId)?.node;
    return namespace.ImageEditorAdjustmentModel.isAdjustment(node) ? node : null;
  }

  function unionBounds(mask, document) {
    const current = mask?.bounds;
    if (!current) return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
    const left = Math.min(0, current.x);
    const top = Math.min(0, current.y);
    const right = Math.max(document.canvas.width, current.x + current.width);
    const bottom = Math.max(document.canvas.height, current.y + current.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function materialize(store, node) {
    const mask = namespace.ImageEditorAdjustmentModel.normalizeMask(node.mask);
    const bounds = unionBounds(mask, store.document);
    const pixels = imageData(bounds.width, bounds.height, mask.defaultValue);
    const source = mask.assetId ? store.assets.get(mask.assetId) : null;
    if (source && mask.bounds) {
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = source.width;
      sourceCanvas.height = source.height;
      sourceCanvas.getContext("2d").putImageData(source, 0, 0);
      const targetCanvas = document.createElement("canvas");
      targetCanvas.width = bounds.width;
      targetCanvas.height = bounds.height;
      targetCanvas.getContext("2d").putImageData(pixels, 0, 0);
      targetCanvas.getContext("2d").imageSmoothingEnabled = false;
      targetCanvas.getContext("2d").drawImage(sourceCanvas, mask.bounds.x - bounds.x, mask.bounds.y - bounds.y, mask.bounds.width, mask.bounds.height);
      return { bounds, pixels: targetCanvas.getContext("2d").getImageData(0, 0, bounds.width, bounds.height) };
    }
    return { bounds, pixels };
  }

  function save(store, node, pixels, bounds, defaultValue = node.mask?.defaultValue ?? 255) {
    const assetId = store.addRasterAsset(pixels);
    node.mask = namespace.ImageEditorAdjustmentModel.normalizeMask({
      ...node.mask,
      assetId,
      bounds,
      defaultValue
    });
    return node.mask;
  }

  /** Create a full-canvas grayscale mask from the active shaped selection. */
  function createFromSelection(store, region) {
    if (!region) return namespace.ImageEditorAdjustmentModel.normalizeMask({ defaultValue: 255 });
    const width = store.document.canvas.width;
    const height = store.document.canvas.height;
    const pixels = imageData(width, height, 0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = Math.round(255 * namespace.ImageEditorSelectionShapes.strength(region, { x: x + .5, y: y + .5 }));
        const index = (y * width + x) * 4;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      }
    }
    return {
      type: "raster",
      enabled: true,
      assetId: store.addRasterAsset(pixels),
      bounds: { x: 0, y: 0, width, height },
      defaultValue: 0
    };
  }

  /** Replace a mask with one uniform value without allocating raster bytes. */
  function setUniform(store, nodeId, value) {
    const node = adjustmentNode(store, nodeId);
    if (!node || node.locked) return false;
    node.mask = namespace.ImageEditorAdjustmentModel.normalizeMask({ enabled: node.mask?.enabled, defaultValue: value });
    store.pruneAssets();
    return true;
  }

  /** Invert both stored mask pixels and its off-bounds default. */
  function invert(store, nodeId) {
    const node = adjustmentNode(store, nodeId);
    if (!node || node.locked) return false;
    if (!node.mask?.assetId) {
      node.mask = namespace.ImageEditorAdjustmentModel.normalizeMask({ ...node.mask, defaultValue: 255 - Number(node.mask?.defaultValue ?? 255) });
      return true;
    }
    const { bounds, pixels } = materialize(store, node);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const value = 255 - pixels.data[index];
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
    }
    save(store, node, pixels, bounds, 255 - Number(node.mask.defaultValue ?? 255));
    store.pruneAssets();
    return true;
  }

  /** Enable or bypass an adjustment mask without deleting it. */
  function setEnabled(store, nodeId, enabled) {
    const node = adjustmentNode(store, nodeId);
    if (!node || node.locked) return false;
    node.mask = namespace.ImageEditorAdjustmentModel.normalizeMask({ ...node.mask, enabled });
    return true;
  }

  function paintPixel(pixels, bounds, x, y, value, opacity) {
    const localX = Math.floor(x - bounds.x);
    const localY = Math.floor(y - bounds.y);
    if (localX < 0 || localY < 0 || localX >= pixels.width || localY >= pixels.height) return;
    const index = (localY * pixels.width + localX) * 4;
    const next = Math.round(pixels.data[index] + (value - pixels.data[index]) * opacity);
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = next;
    pixels.data[index + 3] = 255;
  }

  /** Paint a circular grayscale stroke, optionally constrained by a pixel selection. */
  function paintStroke(store, nodeId, from, to, options = {}) {
    const node = adjustmentNode(store, nodeId);
    if (!node || node.locked) return false;
    const { bounds, pixels } = materialize(store, node);
    const radius = Math.max(.5, Number(options.size || 1) / 2);
    const value = Math.max(0, Math.min(255, Math.round(Number(options.value ?? 255))));
    const opacity = Math.max(0, Math.min(1, Number(options.opacity ?? 1)));
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
    for (let step = 0; step <= steps; step += 1) {
      const centerX = from.x + (to.x - from.x) * step / steps;
      const centerY = from.y + (to.y - from.y) * step / steps;
      const left = Math.floor(centerX - radius);
      const right = Math.ceil(centerX + radius);
      const top = Math.floor(centerY - radius);
      const bottom = Math.ceil(centerY + radius);
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          if (Math.hypot(x + .5 - centerX, y + .5 - centerY) > radius) continue;
          const selectionAmount = options.region ? namespace.ImageEditorSelectionShapes.strength(options.region, { x: x + .5, y: y + .5 }) : 1;
          if (selectionAmount) paintPixel(pixels, bounds, x, y, value, opacity * selectionAmount);
        }
      }
    }
    save(store, node, pixels, bounds);
    return true;
  }

  /** Paint a selected mask region with one grayscale value. */
  function fillRegion(store, nodeId, value, region = null) {
    const node = adjustmentNode(store, nodeId);
    if (!node || node.locked) return false;
    if (!region) return setUniform(store, nodeId, value);
    const { bounds, pixels } = materialize(store, node);
    for (let y = 0; y < store.document.canvas.height; y += 1) {
      for (let x = 0; x < store.document.canvas.width; x += 1) {
        const amount = namespace.ImageEditorSelectionShapes.strength(region, { x: x + .5, y: y + .5 });
        if (amount) paintPixel(pixels, bounds, x, y, value, amount);
      }
    }
    save(store, node, pixels, bounds);
    return true;
  }

  namespace.ImageEditorAdjustmentMaskEditor = { createFromSelection, setUniform, invert, setEnabled, paintStroke, fillRegion };
})(typeof window !== "undefined" ? window : globalThis);
