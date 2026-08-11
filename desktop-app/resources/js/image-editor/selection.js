// Rectangular pixel selection operations for the raster image editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorSelection {
    constructor() {
      this.rect = null;
      this.imageData = null;
      this.floating = false;
      this.internalClipboard = null;
    }

    get hasSelection() {
      return !!(this.rect && this.rect.width > 0 && this.rect.height > 0);
    }

    setRect(start, end, bounds) {
      const left = Math.max(0, Math.floor(Math.min(start.x, end.x)));
      const top = Math.max(0, Math.floor(Math.min(start.y, end.y)));
      const right = Math.min(bounds.width, Math.ceil(Math.max(start.x, end.x)));
      const bottom = Math.min(bounds.height, Math.ceil(Math.max(start.y, end.y)));
      this.rect = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      this.imageData = null;
      this.floating = false;
      return this.rect;
    }

    contains(point) {
      const rect = this.rect;
      return !!rect && point.x >= rect.x && point.y >= rect.y &&
        point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
    }

    lift(context, backgroundColor, clearSource) {
      if (!this.hasSelection) return false;
      this.imageData = context.getImageData(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      this.floating = true;
      if (clearSource) {
        context.fillStyle = backgroundColor || "#ffffff";
        context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      }
      return true;
    }

    moveBy(deltaX, deltaY, bounds) {
      if (!this.hasSelection) return false;
      this.rect.x = Math.max(0, Math.min(bounds.width - this.rect.width, this.rect.x + Math.round(deltaX)));
      this.rect.y = Math.max(0, Math.min(bounds.height - this.rect.height, this.rect.y + Math.round(deltaY)));
      return true;
    }

    commit(context) {
      if (this.floating && this.imageData && this.rect) {
        context.putImageData(this.imageData, this.rect.x, this.rect.y);
      }
      this.floating = false;
      this.imageData = null;
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

    paste(context, imageData, bounds) {
      const data = imageData || this.internalClipboard;
      if (!data) return false;
      this.imageData = data;
      this.rect = {
        x: 0,
        y: 0,
        width: Math.min(data.width, bounds.width),
        height: Math.min(data.height, bounds.height)
      };
      this.floating = true;
      return true;
    }

    clear() {
      this.rect = null;
      this.imageData = null;
      this.floating = false;
    }
  }

  namespace.ImageEditorSelection = ImageEditorSelection;
})(typeof window !== "undefined" ? window : globalThis);
