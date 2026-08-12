// Microsoft Paint-style two-bend curve interaction and rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /** Owns the staged straight-line and two-bend curve editing lifecycle. */
  class ImageEditorCurveTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.start || !this.end) return null;
      return {
        start: { ...this.start },
        end: { ...this.end },
        bends: this.activeBend ? [...this.bends, this.activeBend] : [...this.bends]
      };
    }

    /** Begin the initial endpoint drag or a bend drag that starts on the visible curve. */
    begin(point, lineWidth) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.end = { ...point };
        this.bends = [];
        this.activeBend = null;
        this.phase = "drawing-line";
        return true;
      }
      if (this.phase !== "awaiting-bend") return false;
      const parameter = this.findNearestParameter(point, Math.max(8, lineWidth + 5));
      if (parameter === null) return false;
      this.activeBend = { t: parameter, point: { ...point } };
      this.phase = "dragging-bend";
      return true;
    }

    /** Update the endpoint or active bend during a pointer drag. */
    update(point) {
      if (this.phase === "drawing-line") this.end = { ...point };
      else if (this.phase === "dragging-bend") this.activeBend.point = { ...point };
    }

    /** Finish one stage and report when the second bend completes the curve. */
    completeStage(point) {
      this.update(point);
      if (this.phase === "drawing-line") {
        this.phase = "awaiting-bend";
        return { accepted: true, complete: false };
      }
      if (this.phase !== "dragging-bend") return { accepted: false, complete: false };
      this.bends.push(this.activeBend);
      this.activeBend = null;
      const complete = this.bends.length >= 2;
      this.phase = complete ? "complete" : "awaiting-bend";
      return { accepted: true, complete };
    }

    /** Draw the editable curve plus visible endpoint and bend markers. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      namespace.drawCurve(context, model, state);
      const markers = [model.start, model.end, ...model.bends.map((bend) => bend.point)];
      context.save();
      context.fillStyle = "#1473e6";
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      markers.forEach((point) => {
        context.fillRect(Math.round(point.x) - 3, Math.round(point.y) - 3, 7, 7);
        context.strokeRect(Math.round(point.x) - 3.5, Math.round(point.y) - 3.5, 8, 8);
      });
      context.restore();
    }

    /** Rasterize the completed curve into a tightly bounded transparent layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const points = [];
      for (let index = 0; index <= 160; index += 1) points.push(namespace.curvePointAt(model, index / 160));
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x)) - padding));
      const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y)) - padding));
      const right = Math.min(bounds.width, Math.ceil(Math.max(...points.map((point) => point.x)) + padding));
      const bottom = Math.min(bounds.height, Math.ceil(Math.max(...points.map((point) => point.y)) + padding));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (!width || !height) return null;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      namespace.drawCurve(context, model, state);
      return { imageData: context.getImageData(0, 0, width, height), rect: { x: left, y: top, width, height } };
    }

    /** Discard the editable curve and return to the initial stage. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.end = null;
      this.bends = [];
      this.activeBend = null;
    }

    findNearestParameter(point, tolerance) {
      const model = this.model;
      let nearest = null;
      let nearestDistance = Infinity;
      for (let index = 0; index <= 160; index += 1) {
        const t = index / 160;
        const candidate = namespace.curvePointAt(model, t);
        const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (distance < nearestDistance) {
          nearest = t;
          nearestDistance = distance;
        }
      }
      return nearestDistance <= tolerance ? nearest : null;
    }
  }

  namespace.ImageEditorCurveTool = ImageEditorCurveTool;
})(typeof window !== "undefined" ? window : globalThis);
