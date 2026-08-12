// Cloud-specific body and thought-bubble tail geometry for the shared editable callout guide.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const ATTACHMENT_RANGE_FACTOR = 0.72;
  const MINIMUM_BUBBLE_RADIUS = 2;
  const MAXIMUM_BUBBLE_RADIUS_FACTOR = 0.12;

  /** Draws and rasterizes a cloud callout while reusing the shared three-handle guide. */
  class ImageEditorCloudCalloutTool extends namespace.ImageEditorCalloutTool {
    /** Draw the cloud body while its initial bounds are being dragged. */
    drawBodyPreview(context, state) {
      namespace.configureStroke(context, state, state.lineWidth);
      this.traceCloudBody(context, this.rect);
      if (state.fillShapes) context.fill();
      context.stroke();
    }

    /** Limit tail attachment handles to the central portion of each cloud side. */
    sideRange(side) {
      const horizontal = side === "top" || side === "bottom";
      const center = horizontal ? this.rect.x + this.rect.width / 2 : this.rect.y + this.rect.height / 2;
      const radius = (horizontal ? this.rect.width : this.rect.height) * ATTACHMENT_RANGE_FACTOR / 2;
      return { minimum: center - radius, maximum: center + radius };
    }

    /** Trace the cloud body and its graduated thought bubbles as one paintable path. */
    tracePath(context, model) {
      this.traceCloudBody(context, model.rect);
      this.traceThoughtBubbles(context, model);
    }

    /** Include the largest thought bubble in the transparent raster layer bounds. */
    rasterPadding(state, model) {
      const maximumBubbleRadius = Math.min(model.rect.width, model.rect.height) * MAXIMUM_BUBBLE_RADIUS_FACTOR;
      return super.rasterPadding(state, model) + Math.ceil(maximumBubbleRadius);
    }

    /** Trace a scalable ten-lobe cloud inside the requested body rectangle. */
    traceCloudBody(context, rect) {
      const point = (x, y) => ({ x: rect.x + rect.width * x, y: rect.y + rect.height * y });
      const start = point(0.2, 0.13);
      context.beginPath();
      context.moveTo(start.x, start.y);
      this.traceCloudCurve(context, rect, 0.13, 0.02, 0.3, 0.01, 0.35, 0.1);
      this.traceCloudCurve(context, rect, 0.42, 0.01, 0.58, 0.01, 0.61, 0.1);
      this.traceCloudCurve(context, rect, 0.72, 0.03, 0.84, 0.09, 0.8, 0.2);
      this.traceCloudCurve(context, rect, 0.94, 0.18, 0.99, 0.34, 0.88, 0.42);
      this.traceCloudCurve(context, rect, 1, 0.5, 0.92, 0.66, 0.81, 0.64);
      this.traceCloudCurve(context, rect, 0.82, 0.8, 0.67, 0.87, 0.58, 0.78);
      this.traceCloudCurve(context, rect, 0.49, 0.92, 0.33, 0.91, 0.3, 0.78);
      this.traceCloudCurve(context, rect, 0.18, 0.86, 0.07, 0.77, 0.13, 0.65);
      this.traceCloudCurve(context, rect, 0.01, 0.63, 0.01, 0.47, 0.11, 0.41);
      this.traceCloudCurve(context, rect, 0.03, 0.31, 0.08, 0.17, 0.2, 0.13);
      context.closePath();
    }

    /** Append one normalized cubic lobe to the cloud outline. */
    traceCloudCurve(context, rect, controlOneX, controlOneY, controlTwoX, controlTwoY, endX, endY) {
      context.bezierCurveTo(
        rect.x + rect.width * controlOneX,
        rect.y + rect.height * controlOneY,
        rect.x + rect.width * controlTwoX,
        rect.y + rect.height * controlTwoY,
        rect.x + rect.width * endX,
        rect.y + rect.height * endY
      );
    }

    /** Append three bubbles whose direction, spacing, and size follow the tail guide. */
    traceThoughtBubbles(context, model) {
      const midpoint = {
        x: (model.attachmentStart.x + model.attachmentEnd.x) / 2,
        y: (model.attachmentStart.y + model.attachmentEnd.y) / 2
      };
      const attachmentSpan = Math.hypot(
        model.attachmentEnd.x - model.attachmentStart.x,
        model.attachmentEnd.y - model.attachmentStart.y
      );
      const maximumRadius = Math.min(model.rect.width, model.rect.height) * MAXIMUM_BUBBLE_RADIUS_FACTOR;
      const baseRadius = Math.max(MINIMUM_BUBBLE_RADIUS, Math.min(maximumRadius, attachmentSpan * 0.28));
      [
        { progress: 0.24, radius: baseRadius },
        { progress: 0.58, radius: baseRadius * 0.65 },
        { progress: 1, radius: baseRadius * 0.4 }
      ].forEach(({ progress, radius }) => {
        const center = {
          x: midpoint.x + (model.tip.x - midpoint.x) * progress,
          y: midpoint.y + (model.tip.y - midpoint.y) * progress
        };
        context.moveTo(center.x + radius, center.y);
        context.ellipse(center.x, center.y, radius, radius * 0.82, 0, 0, Math.PI * 2);
      });
    }
  }

  namespace.ImageEditorCloudCalloutTool = ImageEditorCloudCalloutTool;
})(typeof window !== "undefined" ? window : globalThis);
