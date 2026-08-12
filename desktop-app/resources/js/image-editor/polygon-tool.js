// Polygon vector-edit guides, point insertion, and transparent-layer rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const GUIDE_HANDLE_SCREEN_SIZE = 5;
  const GUIDE_HIT_TARGET_SCREEN_RADIUS = 7;

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function normalizedPoints(points) {
    const result = [];
    (points || []).forEach((point) => {
      const previous = result[result.length - 1];
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.5) result.push(clonePoint(point));
    });
    if (result.length > 2 && Math.hypot(result[0].x - result[result.length - 1].x, result[0].y - result[result.length - 1].y) <= 0.5) {
      result.pop();
    }
    return result;
  }

  function selectionRect(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      width: Math.max(1, Math.max(...xs) - x),
      height: Math.max(1, Math.max(...ys) - y)
    };
  }

  function closestPointOnSegment(point, start, end) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const ratio = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared))
      : 0;
    const projection = { x: start.x + deltaX * ratio, y: start.y + deltaY * ratio };
    return { point: projection, distance: Math.hypot(point.x - projection.x, point.y - projection.y) };
  }

  /** Owns a completed polygon while its vertices and side count remain editable. */
  class ImageEditorPolygonTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (this.points.length < 3) return null;
      const points = this.points.map(clonePoint);
      return { points, selectionRect: selectionRect(points) };
    }

    /** Enter vector edit mode for a completed polygon. */
    beginEditing(points) {
      this.points = normalizedPoints(points);
      if (this.points.length < 3) {
        this.reset();
        return false;
      }
      this.selectedPointIndex = this.points.length - 1;
      this.phase = "editing";
      return true;
    }

    /** Begin moving a vertex, insert a point on an edge, or classify an outside click. */
    begin(point) {
      if (this.phase !== "editing") return { action: "ignore", started: false };
      const vertexIndex = this.findVertex(point);
      if (vertexIndex >= 0) {
        this.selectedPointIndex = vertexIndex;
        this.adjustmentKind = "vertex";
        this.adjustmentStart = clonePoint(point);
        this.phase = "adjusting";
        return { action: "adjusting", started: true, pointIndex: vertexIndex };
      }
      const edge = this.findEdge(point);
      if (edge) {
        const pointIndex = edge.index + 1;
        this.points.splice(pointIndex, 0, edge.point);
        this.selectedPointIndex = pointIndex;
        this.adjustmentKind = "inserting";
        this.adjustmentStart = clonePoint(point);
        this.phase = "adjusting";
        return { action: "inserting", started: true, pointIndex };
      }
      return { action: this.contains(point) ? "inside" : "outside", started: false };
    }

    /** Move the active polygon vertex, including beyond the previous bounds. */
    update(point) {
      if (this.phase !== "adjusting" || this.selectedPointIndex < 0) return;
      if (this.adjustmentKind === "inserting" && Math.hypot(point.x - this.adjustmentStart.x, point.y - this.adjustmentStart.y) <= 0.5) return;
      this.points[this.selectedPointIndex] = clonePoint(point);
    }

    /** Finish the current vertex drag while keeping vector edit mode active. */
    completeStage(point) {
      if (this.phase !== "adjusting") return false;
      this.update(point);
      this.phase = "editing";
      this.adjustmentKind = null;
      this.adjustmentStart = null;
      return true;
    }

    /** Remove the selected vertex while preserving a valid closed polygon. */
    removeSelectedPoint() {
      if (!this.isEditing || this.points.length <= 3 || this.selectedPointIndex < 0) return false;
      this.points.splice(this.selectedPointIndex, 1);
      this.selectedPointIndex = Math.min(this.selectedPointIndex, this.points.length - 1);
      this.phase = "editing";
      return true;
    }

    /** Describe the guide beneath a canvas point for cursor feedback. */
    guideAt(point) {
      const vertexIndex = this.findVertex(point);
      if (vertexIndex >= 0) return { type: "vertex", index: vertexIndex };
      const edge = this.findEdge(point);
      return edge ? { type: "edge", index: edge.index } : null;
    }

    /** Draw the polygon, editable vertices, and gentle midpoint insertion guides. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      namespace.drawPolygon(context, model.points, state, true);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.selectionRect.x, model.selectionRect.y, model.selectionRect.width, model.selectionRect.height);
      context.setLineDash([]);
      model.points.forEach((point, index) => {
        context.fillStyle = index === this.selectedPointIndex ? "rgba(255, 255, 255, 0.92)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.82)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        const next = model.points[(index + 1) % model.points.length];
        const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
        context.beginPath();
        context.fillStyle = "rgba(255, 255, 255, 0.82)";
        context.arc(midpoint.x, midpoint.y, halfHandle * 0.82, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      });
      context.restore();
    }

    /** Rasterize the accepted polygon into the editor's existing floating layer. */
    rasterize(state, bounds) {
      return namespace.rasterizePolygonLayer(this.points, state, bounds);
    }

    /** Discard the editable polygon and all of its guides. */
    reset() {
      this.phase = "idle";
      this.points = [];
      this.selectedPointIndex = -1;
      this.adjustmentKind = null;
      this.adjustmentStart = null;
      this.zoom = 1;
    }

    contains(point) {
      const rect = this.model?.selectionRect;
      return !!rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    findVertex(point) {
      const radius = GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom;
      return this.points.findIndex((vertex) => Math.hypot(vertex.x - point.x, vertex.y - point.y) <= radius);
    }

    findEdge(point) {
      const radius = GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom;
      let nearest = null;
      this.points.forEach((start, index) => {
        const end = this.points[(index + 1) % this.points.length];
        const candidate = closestPointOnSegment(point, start, end);
        if (candidate.distance <= radius && (!nearest || candidate.distance < nearest.distance)) {
          nearest = { index, point: candidate.point, distance: candidate.distance };
        }
      });
      return nearest;
    }
  }

  namespace.ImageEditorPolygonTool = ImageEditorPolygonTool;
})(typeof window !== "undefined" ? window : globalThis);
