// Editable rectangular grid geometry, divider skew guides, and drawing.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /** Draw and edit a rectangular grid with weighted horizontal and vertical dividers. */
  class ImageEditorRectangularGridTool extends namespace.ImageEditorGridTool {
    resetGrid() {
      this.horizontalSkew = 0;
      this.verticalSkew = 0;
    }

    guidePoints() {
      if (!this.rect) return {};
      return {
        horizontalSkew: {
          x: this.rect.x,
          y: this.rect.y + this.rect.height * (this.horizontalSkew + 100) / 200
        },
        verticalSkew: {
          x: this.rect.x + this.rect.width * (this.verticalSkew + 100) / 200,
          y: this.rect.y + this.rect.height
        }
      };
    }

    updateGuide(handle, point) {
      if (handle === "horizontalSkew") {
        this.horizontalSkew = Math.max(-100, Math.min(100, ((point.y - this.rect.y) / this.rect.height * 200) - 100));
      } else {
        this.verticalSkew = Math.max(-100, Math.min(100, ((point.x - this.rect.x) / this.rect.width * 200) - 100));
      }
    }

    drawGrid(context, state) {
      const horizontal = Math.max(0, Math.min(100, Number(state.rectangularGridHorizontalDividers) || 0));
      const vertical = Math.max(0, Math.min(100, Number(state.rectangularGridVerticalDividers) || 0));
      context.save();
      namespace.configureStroke(context, state, state.lineWidth);
      if (state.fillShapes) context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      context.beginPath();
      if (state.rectangularGridFrame !== false) context.rect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
      for (let index = 1; index <= horizontal; index += 1) {
        const y = this.rect.y + this.rect.height * namespace.weightedGridPosition(index, horizontal, this.horizontalSkew);
        context.moveTo(this.rect.x, y);
        context.lineTo(this.rect.x + this.rect.width, y);
      }
      for (let index = 1; index <= vertical; index += 1) {
        const x = this.rect.x + this.rect.width * namespace.weightedGridPosition(index, vertical, this.verticalSkew);
        context.moveTo(x, this.rect.y);
        context.lineTo(x, this.rect.y + this.rect.height);
      }
      context.stroke();
      context.restore();
    }
  }

  namespace.ImageEditorRectangularGridTool = ImageEditorRectangularGridTool;
})(typeof window !== "undefined" ? window : globalThis);
