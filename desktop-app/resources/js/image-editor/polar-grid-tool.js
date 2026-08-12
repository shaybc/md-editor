// Editable polar grid geometry, concentric/radial skew guides, and drawing.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TAU = Math.PI * 2;

  /** Draw and edit a polar grid with weighted concentric and radial dividers. */
  class ImageEditorPolarGridTool extends namespace.ImageEditorGridTool {
    resetGrid() {
      this.concentricSkew = 0;
      this.radialSkew = 0;
    }

    guidePoints() {
      if (!this.rect) return {};
      const center = this.center();
      const radiusX = this.rect.width / 2;
      const radiusY = this.rect.height / 2;
      const ringRatio = (this.concentricSkew + 100) / 200;
      const angle = -Math.PI / 2 + this.radialSkew / 100 * Math.PI;
      return {
        concentricSkew: { x: center.x + radiusX * ringRatio, y: center.y },
        radialSkew: { x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY }
      };
    }

    updateGuide(handle, point) {
      const center = this.center();
      if (handle === "concentricSkew") {
        const ratio = Math.hypot((point.x - center.x) / (this.rect.width / 2), (point.y - center.y) / (this.rect.height / 2));
        this.concentricSkew = Math.max(-100, Math.min(100, ratio * 200 - 100));
      } else {
        const angle = Math.atan2((point.y - center.y) / (this.rect.height / 2), (point.x - center.x) / (this.rect.width / 2));
        let offset = angle + Math.PI / 2;
        while (offset > Math.PI) offset -= TAU;
        while (offset < -Math.PI) offset += TAU;
        this.radialSkew = Math.max(-100, Math.min(100, offset / Math.PI * 100));
      }
    }

    drawGrid(context, state) {
      const center = this.center();
      const radiusX = this.rect.width / 2;
      const radiusY = this.rect.height / 2;
      const concentric = Math.max(0, Math.min(100, Number(state.polarGridConcentricDividers) || 0));
      const radial = Math.max(0, Math.min(100, Number(state.polarGridRadialDividers) || 0));
      context.save();
      namespace.configureStroke(context, state, state.lineWidth);
      if (state.fillShapes) {
        if (state.polarGridCompoundRings) {
          for (let index = concentric + 1; index >= 1; index -= 2) {
            const ratio = index === concentric + 1
              ? 1
              : namespace.weightedGridPosition(index, concentric, this.concentricSkew);
            context.beginPath();
            context.ellipse(center.x, center.y, radiusX * ratio, radiusY * ratio, 0, 0, TAU);
            if (index > 1) {
              const inner = namespace.weightedGridPosition(index - 1, concentric, this.concentricSkew);
              context.ellipse(center.x, center.y, radiusX * inner, radiusY * inner, 0, 0, TAU, true);
            }
            context.fill("evenodd");
          }
        } else {
          context.beginPath();
          context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, TAU);
          context.fill();
        }
      }
      context.beginPath();
      context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, TAU);
      for (let index = 1; index <= concentric; index += 1) {
        const ratio = namespace.weightedGridPosition(index, concentric, this.concentricSkew);
        context.moveTo(center.x + radiusX * ratio, center.y);
        context.ellipse(center.x, center.y, radiusX * ratio, radiusY * ratio, 0, 0, TAU);
      }
      for (let index = 0; index < radial; index += 1) {
        const angle = -Math.PI / 2 + TAU * namespace.weightedGridPosition(index + 1, radial, this.radialSkew);
        context.moveTo(center.x, center.y);
        context.lineTo(center.x + Math.cos(angle) * radiusX, center.y + Math.sin(angle) * radiusY);
      }
      context.stroke();
      context.restore();
    }

    center() {
      return { x: this.rect.x + this.rect.width / 2, y: this.rect.y + this.rect.height / 2 };
    }
  }

  namespace.ImageEditorPolarGridTool = ImageEditorPolarGridTool;
})(typeof window !== "undefined" ? window : globalThis);
