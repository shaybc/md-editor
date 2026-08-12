// Rectangular pixel selection operations for the raster image editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const CORNER_RESIZE_HANDLES = new Set(['nw', 'ne', 'se', 'sw']);

  function resizeGuidePoints(rect, offset = 0) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return {
      nw: { x: rect.x - offset, y: rect.y - offset },
      n: { x: centerX, y: rect.y - offset },
      ne: { x: rect.x + rect.width + offset, y: rect.y - offset },
      e: { x: rect.x + rect.width + offset, y: centerY },
      se: { x: rect.x + rect.width + offset, y: rect.y + rect.height + offset },
      s: { x: centerX, y: rect.y + rect.height + offset },
      sw: { x: rect.x - offset, y: rect.y + rect.height + offset },
      w: { x: rect.x - offset, y: centerY }
    };
  }

  function proportionalResizeRect(rect, handle, point) {
    const points = resizeGuidePoints(rect);
    const opposite = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }[handle];
    const anchor = points[opposite];
    const original = points[handle];
    const vectorX = original.x - anchor.x;
    const vectorY = original.y - anchor.y;
    const scale = Math.max(
      Math.max(1 / rect.width, 1 / rect.height),
      ((point.x - anchor.x) * vectorX + (point.y - anchor.y) * vectorY) /
        (vectorX * vectorX + vectorY * vectorY)
    );
    const resizedPoint = { x: anchor.x + vectorX * scale, y: anchor.y + vectorY * scale };
    return {
      x: Math.round(Math.min(anchor.x, resizedPoint.x)),
      y: Math.round(Math.min(anchor.y, resizedPoint.y)),
      width: Math.max(1, Math.round(Math.abs(resizedPoint.x - anchor.x))),
      height: Math.max(1, Math.round(Math.abs(resizedPoint.y - anchor.y)))
    };
  }

  function edgeResizeRect(rect, handle, point) {
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    if (handle === 'w') {
      const x = Math.min(Math.round(point.x), right - 1);
      return { ...rect, x, width: right - x };
    }
    if (handle === 'e') return { ...rect, width: Math.max(1, Math.round(point.x - rect.x)) };
    if (handle === 'n') {
      const y = Math.min(Math.round(point.y), bottom - 1);
      return { ...rect, y, height: bottom - y };
    }
    return { ...rect, height: Math.max(1, Math.round(point.y - rect.y)) };
  }

  function resizeImageData(imageData, width, height) {
    if (imageData.width === width && imageData.height === height) return imageData;
    const source = global.document.createElement('canvas');
    source.width = imageData.width;
    source.height = imageData.height;
    source.getContext('2d').putImageData(imageData, 0, 0);
    const resized = global.document.createElement('canvas');
    resized.width = width;
    resized.height = height;
    resized.getContext('2d').drawImage(source, 0, 0, width, height);
    return resized.getContext('2d').getImageData(0, 0, width, height);
  }

  /** Owns the complete outlined, pending-paste, and floating pixel selection lifecycle. */
  class ImageEditorSelection {
    constructor() {
      this.rect = null;
      this.imageData = null;
      this.floating = false;
      this.internalClipboard = null;
      this.phase = "idle";
      this.origin = null;
      this.pointerGesture = null;
      this.moveGesture = null;
      this.pasteRevision = 0;
      this.savedFloatingLayer = null;
      this.returnToolAfterPlacement = null;
    }

    get hasSelection() {
      return !!(this.rect && this.rect.width > 0 && this.rect.height > 0);
    }

    get isPasting() {
      return this.phase === "pasting";
    }

    get isMoving() {
      return this.pointerGesture?.type === "move";
    }

    get isTransforming() {
      return this.pointerGesture?.type === 'move' || this.pointerGesture?.type === 'resize';
    }

    /** Return the canvas positions of all corner and edge resize guides. */
    resizeGuidePoints(offset = 0) {
      return this.rect ? resizeGuidePoints(this.rect, offset) : {};
    }

    /** Find the resize guide under a canvas point at the current zoom. */
    findResizeHandle(point, zoom = 1) {
      if (!this.hasSelection) return null;
      const normalizedZoom = Math.max(0.25, Number(zoom) || 1);
      const hitRadius = 4 / normalizedZoom;
      const boundaryPoints = this.resizeGuidePoints();
      const visualPoints = this.resizeGuidePoints(4 / normalizedZoom);
      const isInside = point.x > this.rect.x && point.x < this.rect.x + this.rect.width &&
        point.y > this.rect.y && point.y < this.rect.y + this.rect.height;
      let nearestHandle = null;
      let nearestDistance = Infinity;
      RESIZE_HANDLES.forEach((handle) => {
        const visualDistance = Math.hypot(visualPoints[handle].x - point.x, visualPoints[handle].y - point.y);
        const boundaryDistance = isInside ? Infinity :
          Math.hypot(boundaryPoints[handle].x - point.x, boundaryPoints[handle].y - point.y);
        const distance = Math.min(visualDistance, boundaryDistance);
        if (distance <= hitRadius && distance < nearestDistance) {
          nearestHandle = handle;
          nearestDistance = distance;
        }
      });
      return nearestHandle;
    }

    setRect(start, end, bounds) {
      const left = Math.max(0, Math.floor(Math.min(start.x, end.x)));
      const top = Math.max(0, Math.floor(Math.min(start.y, end.y)));
      const right = Math.min(bounds.width, Math.ceil(Math.max(start.x, end.x)));
      const bottom = Math.min(bounds.height, Math.ceil(Math.max(start.y, end.y)));
      this.rect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      this.imageData = null;
      this.floating = false;
      this.phase = "outlined";
      this.origin = "canvas";
      this.returnToolAfterPlacement = null;
      return this.rect;
    }

    contains(point) {
      const rect = this.rect;
      return !!rect && point.x >= rect.x && point.y >= rect.y &&
        point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
    }

    lift(context, backgroundColor, clearSource, origin = "canvas") {
      if (!this.hasSelection) return false;
      this.imageData = context.getImageData(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      this.floating = true;
      this.phase = "floating";
      this.origin = origin;
      this.returnToolAfterPlacement = null;
      if (clearSource) {
        context.fillStyle = backgroundColor || "#ffffff";
        context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      }
      return true;
    }

    /** Begin one canonical move operation for pointer or keyboard input. */
    beginMove(context, backgroundColor, modifiers = {}) {
      if (!this.hasSelection || this.isPasting) return { started: false, sourceCleared: false, stamp: false };
      const wasFloating = this.floating;
      const clone = !wasFloating && !!(modifiers.ctrl || modifiers.meta || modifiers.shift);
      const stamp = !!modifiers.shift && (!wasFloating || this.origin === "canvas-stamp");
      if (!wasFloating) {
        const origin = stamp ? "canvas-stamp" : (clone ? "canvas-clone" : "canvas-cut");
        this.lift(context, backgroundColor, !clone, origin);
      }
      this.moveGesture = { stamp };
      return { started: true, sourceCleared: !wasFloating && !clone, stamp };
    }

    /** Move the active floating pixels without implicitly committing them. */
    moveSelection(deltaX, deltaY, bounds, allowOutsideCanvas = false) {
      if (!this.moveGesture || !this.hasSelection) return { moved: false, stamp: false };
      const previousX = this.rect.x;
      const previousY = this.rect.y;
      this.moveBy(deltaX, deltaY, bounds, allowOutsideCanvas);
      const moved = this.rect.x !== previousX || this.rect.y !== previousY;
      return { moved, stamp: moved && this.moveGesture.stamp };
    }

    /** Finish movement while leaving the selected pixels floating. */
    endMove() {
      this.moveGesture = null;
    }

    /** Classify and begin a selection pointer gesture from the current lifecycle state. */
    beginPointerGesture(point, context, backgroundColor, modifiers = {}) {
      const resizeHandle = this.findResizeHandle(point, modifiers.zoom);
      if (resizeHandle) {
        const wasFloating = this.floating;
        if (!wasFloating) this.lift(context, backgroundColor, true, 'canvas-resize');
        const normalizedZoom = Math.max(0.25, Number(modifiers.zoom) || 1);
        const boundaryPoint = this.resizeGuidePoints()[resizeHandle];
        const visualPoint = this.resizeGuidePoints(4 / normalizedZoom)[resizeHandle];
        const grabbedPoint = Math.hypot(visualPoint.x - point.x, visualPoint.y - point.y) <
          Math.hypot(boundaryPoint.x - point.x, boundaryPoint.y - point.y) ? visualPoint : boundaryPoint;
        this.pointerGesture = {
          type: 'resize',
          handle: resizeHandle,
          startRect: { ...this.rect },
          pointerOffset: { x: grabbedPoint.x - boundaryPoint.x, y: grabbedPoint.y - boundaryPoint.y }
        };
        return { action: 'resize', sourceCleared: !wasFloating };
      }
      if (this.isPasting) return { action: "ignore" };
      if (this.hasSelection && !this.contains(point)) return { action: "drop" };
      if (!this.hasSelection) {
        this.pointerGesture = { type: "outline", start: { ...point } };
        return { action: "outline" };
      }
      const move = this.beginMove(context, backgroundColor, modifiers);
      if (!move.started) return { action: "ignore" };
      this.pointerGesture = { type: "move", last: { ...point } };
      return { action: "move", ...move };
    }

    /** Advance the current outline, movement, or resize pointer gesture. */
    updatePointerGesture(point, bounds) {
      const gesture = this.pointerGesture;
      if (!gesture) return { action: "ignore", moved: false, stamp: false };
      if (gesture.type === "outline") {
        this.setRect(gesture.start, point, bounds);
        return { action: "outline", moved: true, stamp: false };
      }
      if (gesture.type === 'resize') {
        const resizePoint = {
          x: point.x - gesture.pointerOffset.x,
          y: point.y - gesture.pointerOffset.y
        };
        this.rect = CORNER_RESIZE_HANDLES.has(gesture.handle)
          ? proportionalResizeRect(gesture.startRect, gesture.handle, resizePoint)
          : edgeResizeRect(gesture.startRect, gesture.handle, resizePoint);
        return { action: 'resize', moved: true, stamp: false };
      }
      const result = this.moveSelection(point.x - gesture.last.x, point.y - gesture.last.y, bounds, true);
      gesture.last = { ...point };
      return { action: "move", ...result };
    }

    /** End the current pointer gesture and retain resized pixels as the floating source. */
    endPointerGesture() {
      const gesture = this.pointerGesture;
      this.pointerGesture = null;
      if (!gesture) return { action: "ignore" };
      if (gesture.type === "move") this.endMove();
      if (gesture.type === 'resize' && this.imageData) {
        this.imageData = resizeImageData(this.imageData, this.rect.width, this.rect.height);
      }
      return { action: gesture.type };
    }

    /** Enter the non-interactive clipboard-read state and invalidate the old outline. */
    beginPaste() {
      this.pasteRevision += 1;
      this.rect = null;
      this.imageData = null;
      this.floating = false;
      this.phase = "pasting";
      this.origin = null;
      this.returnToolAfterPlacement = null;
      this.pointerGesture = null;
      this.moveGesture = null;
      return this.pasteRevision;
    }

    /** Check that an asynchronous clipboard result still belongs to the active paste. */
    isPastePending(revision) {
      return this.isPasting && revision === this.pasteRevision;
    }

    /** Record the current floating position represented by the most recent saved file. */
    markSavedFloatingLayer() {
      this.savedFloatingLayer = this.floating && this.imageData && this.rect ? {
        imageData: this.imageData,
        x: this.rect.x,
        y: this.rect.y,
        width: this.rect.width,
        height: this.rect.height
      } : null;
    }

    /** Check whether dropping the layer would preserve the most recently saved pixels. */
    matchesSavedFloatingLayer() {
      const saved = this.savedFloatingLayer;
      return !!saved && this.floating && saved.imageData === this.imageData &&
        saved.x === this.rect?.x && saved.y === this.rect?.y &&
        saved.width === this.rect?.width && saved.height === this.rect?.height;
    }

    moveBy(deltaX, deltaY, bounds, allowOutsideCanvas = false) {
      if (!this.hasSelection) return false;
      if (allowOutsideCanvas) {
        this.rect.x += Math.round(deltaX);
        this.rect.y += Math.round(deltaY);
        return true;
      }
      this.rect.x = Math.max(0, Math.min(bounds.width - this.rect.width, this.rect.x + Math.round(deltaX)));
      this.rect.y = Math.max(0, Math.min(bounds.height - this.rect.height, this.rect.y + Math.round(deltaY)));
      return true;
    }

    /** Alpha-composite floating pixels without clearing destination pixels beneath transparency. */
    drawFloatingLayer(context) {
      if (!this.floating || !this.imageData || !this.rect) return false;
      const layer = global.document.createElement('canvas');
      layer.width = this.imageData.width;
      layer.height = this.imageData.height;
      layer.getContext('2d').putImageData(this.imageData, 0, 0);
      context.drawImage(layer, this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      return true;
    }

    commit(context) {
      this.drawFloatingLayer(context);
      this.floating = false;
      this.imageData = null;
      this.phase = this.hasSelection ? "outlined" : "idle";
      this.origin = this.hasSelection ? "canvas" : null;
      this.pointerGesture = null;
      this.moveGesture = null;
      this.savedFloatingLayer = null;
    }

    delete(context, backgroundColor) {
      if (!this.hasSelection) return false;
      context.fillStyle = backgroundColor || "#ffffff";
      context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      this.clear();
      return true;
    }

    copy(context) {
      if (!this.hasSelection) return null;
      this.internalClipboard = this.imageData ||
        context.getImageData(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      return this.internalClipboard;
    }

    cut(context, backgroundColor) {
      const copied = this.copy(context);
      if (!copied) return null;
      this.delete(context, backgroundColor);
      return copied;
    }

    /**
     * Adopt clipboard pixels as a floating selection at the requested canvas origin.
     * @param {CanvasRenderingContext2D} context - Canvas context retained for API compatibility.
     * @param {ImageData} imageData - Clipboard pixels, or null to use the internal clipboard.
     * @param {{width:number,height:number}} bounds - Current canvas dimensions.
     * @param {number} pasteRevision - Active asynchronous paste revision.
     * @param {{x:number,y:number}} origin - Top-left canvas coordinate for the floating content.
     * @returns {boolean} Whether clipboard pixels became the active floating selection.
     */
    paste(context, imageData, bounds, pasteRevision = this.pasteRevision, origin = { x: 0, y: 0 }) {
      const data = imageData || this.internalClipboard;
      if (!data || !this.isPastePending(pasteRevision)) return false;
      const x = Math.max(0, Math.min(bounds.width - 1, Math.floor(Number(origin.x) || 0)));
      const y = Math.max(0, Math.min(bounds.height - 1, Math.floor(Number(origin.y) || 0)));
      this.imageData = data;
      this.rect = {
        x,
        y,
        width: Math.min(data.width, bounds.width - x),
        height: Math.min(data.height, bounds.height - y)
      };
      this.floating = true;
      this.phase = "floating";
      this.origin = "paste";
      this.returnToolAfterPlacement = null;
      return true;
    }

    /** Adopt generated transparent pixels as the active floating selection. */
    setFloatingLayer(imageData, rect, origin = "generated", returnToolAfterPlacement = null) {
      if (!imageData || !rect?.width || !rect?.height) return false;
      this.imageData = imageData;
      this.rect = { ...rect };
      this.floating = true;
      this.phase = "floating";
      this.origin = origin;
      this.returnToolAfterPlacement = returnToolAfterPlacement;
      this.pointerGesture = null;
      this.moveGesture = null;
      return true;
    }

    /** Recolor nontransparent pixels in a generated floating layer. */
    recolorFloatingLayer(color, requiredOrigin = null) {
      if (!this.floating || !this.imageData || (requiredOrigin && this.origin !== requiredOrigin)) return false;
      const replacement = namespace.colorToRgba(color);
      const pixels = this.imageData.data;
      for (let index = 0; index < pixels.length; index += 4) {
        if (!pixels[index + 3]) continue;
        pixels[index] = replacement[0];
        pixels[index + 1] = replacement[1];
        pixels[index + 2] = replacement[2];
      }
      return true;
    }

    clear() {
      this.pasteRevision += 1;
      this.rect = null;
      this.imageData = null;
      this.floating = false;
      this.phase = "idle";
      this.origin = null;
      this.pointerGesture = null;
      this.moveGesture = null;
      this.savedFloatingLayer = null;
      this.returnToolAfterPlacement = null;
    }
  }

  namespace.ImageEditorSelection = ImageEditorSelection;
})(typeof window !== "undefined" ? window : globalThis);
