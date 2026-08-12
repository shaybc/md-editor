// Oval-specific body geometry for the shared editable callout guide lifecycle.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const ATTACHMENT_RANGE_FACTOR = 0.7;

  /** Draws and rasterizes an oval callout while reusing the shared three-handle guide. */
  class ImageEditorOvalCalloutTool extends namespace.ImageEditorCalloutTool {
    /** Draw the oval body while its initial bounds are being dragged. */
    drawBodyPreview(context, state) {
      namespace.drawShape(context, "ellipse", { x: this.rect.x, y: this.rect.y }, {
        x: this.rect.x + this.rect.width,
        y: this.rect.y + this.rect.height
      }, state);
    }

    sideRange(side) {
      const horizontal = side === "top" || side === "bottom";
      const center = horizontal ? this.rect.x + this.rect.width / 2 : this.rect.y + this.rect.height / 2;
      const radius = (horizontal ? this.rect.width : this.rect.height) * ATTACHMENT_RANGE_FACTOR / 2;
      return { minimum: center - radius, maximum: center + radius };
    }

    pointOnSide(value) {
      const centerX = this.rect.x + this.rect.width / 2;
      const centerY = this.rect.y + this.rect.height / 2;
      const radiusX = Math.max(0.5, this.rect.width / 2);
      const radiusY = Math.max(0.5, this.rect.height / 2);
      if (this.side === "top" || this.side === "bottom") {
        const normalized = Math.max(-1, Math.min(1, (value - centerX) / radiusX));
        const offsetY = radiusY * Math.sqrt(Math.max(0, 1 - normalized * normalized));
        return { x: value, y: centerY + (this.side === "bottom" ? offsetY : -offsetY) };
      }
      const normalized = Math.max(-1, Math.min(1, (value - centerY) / radiusY));
      const offsetX = radiusX * Math.sqrt(Math.max(0, 1 - normalized * normalized));
      return { x: centerX + (this.side === "right" ? offsetX : -offsetX), y: value };
    }

    tracePath(context, model) {
      const { rect, side, attachmentStart, attachmentEnd, tip } = model;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const radiusX = Math.max(0.5, rect.width / 2);
      const radiusY = Math.max(0.5, rect.height / 2);
      const angle = (point) => {
        const value = Math.atan2((point.y - centerY) / radiusY, (point.x - centerX) / radiusX);
        return value < 0 ? value + Math.PI * 2 : value;
      };
      const reversed = side === "bottom" || side === "left";
      const first = reversed ? attachmentEnd : attachmentStart;
      const second = reversed ? attachmentStart : attachmentEnd;
      context.beginPath();
      context.moveTo(first.x, first.y);
      context.lineTo(tip.x, tip.y);
      context.lineTo(second.x, second.y);
      context.ellipse(centerX, centerY, radiusX, radiusY, 0, angle(second), angle(first), false);
      context.closePath();
    }
  }

  namespace.ImageEditorOvalCalloutTool = ImageEditorOvalCalloutTool;
})(typeof window !== "undefined" ? window : globalThis);
