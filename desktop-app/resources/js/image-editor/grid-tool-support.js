// Shared editable bounds, guide interaction, preview, and rasterization for grid tools.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const HANDLE_SCREEN_SIZE = 5;
  const HIT_SCREEN_RADIUS = 7;

  function rectFromPoints(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }

  /** Convert a divider index and skew percentage into a weighted normalized position. */
  function weightedGridPosition(index, divisions, skew) {
    const position = index / (divisions + 1);
    const exponent = Math.pow(2, Math.max(-100, Math.min(100, skew)) / 50);
    return Math.pow(position, exponent);
  }

  /** Own common editable-grid lifecycle while subclasses provide geometry and guides. */
  class ImageEditorGridTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    begin(point) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.rect = rectFromPoints(point, point);
        this.phase = "drawing";
        return { action: "drawing", started: true };
      }
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const handle = this.findHandle(point);
      if (handle) {
        this.activeHandle = handle;
        this.phase = "adjusting";
        return { action: "adjusting", started: true, handle };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    update(point) {
      if (this.phase === "drawing") this.rect = rectFromPoints(this.start, point);
      else if (this.phase === "adjusting") this.updateGuide(this.activeHandle, point);
    }

    completeStage(point) {
      this.update(point);
      if (!["drawing", "adjusting"].includes(this.phase)) return false;
      if (!this.rect || this.rect.width < 2 || this.rect.height < 2) {
        this.reset();
        return false;
      }
      this.activeHandle = null;
      this.phase = "editing";
      return true;
    }

    drawPreview(context, state) {
      if (!this.rect) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      this.drawGrid(context, state);
      const scale = 1 / this.zoom;
      const size = HANDLE_SCREEN_SIZE * scale;
      context.save();
      context.setLineDash([3 * scale, 3 * scale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * scale;
      context.strokeRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      context.setLineDash([]);
      Object.entries(this.guidePoints()).forEach(([name, point]) => {
        context.fillStyle = name === this.activeHandle ? "rgba(255, 255, 255, 0.9)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.82)";
        context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        context.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
      });
      context.restore();
    }

    rasterize(state, bounds) {
      if (!this.rect) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(this.rect.x - padding));
      const top = Math.max(0, Math.floor(this.rect.y - padding));
      const right = Math.min(bounds.width, Math.ceil(this.rect.x + this.rect.width + padding));
      const bottom = Math.min(bounds.height, Math.ceil(this.rect.y + this.rect.height + padding));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (!width || !height) return null;
      const canvas = global.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      this.drawGrid(context, state);
      return { imageData: context.getImageData(0, 0, width, height), rect: { x: left, y: top, width, height } };
    }

    contains(point) {
      return !!this.rect && point.x >= this.rect.x && point.x <= this.rect.x + this.rect.width &&
        point.y >= this.rect.y && point.y <= this.rect.y + this.rect.height;
    }

    findHandle(point) {
      const radius = HIT_SCREEN_RADIUS / this.zoom;
      return Object.entries(this.guidePoints()).find(([, guide]) =>
        Math.hypot(guide.x - point.x, guide.y - point.y) <= radius
      )?.[0] || null;
    }

    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.activeHandle = null;
      this.zoom = 1;
      this.resetGrid();
    }
  }

  Object.assign(namespace, { ImageEditorGridTool, weightedGridPosition });
})(typeof window !== "undefined" ? window : globalThis);
