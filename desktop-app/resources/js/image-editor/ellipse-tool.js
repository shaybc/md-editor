// Editable ellipse, pie-opening guides, inner radius, and transparent rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const ANGLE_HANDLES = Object.freeze(["openingStart", "openingEnd"]);
  const GUIDE_HANDLE_SCREEN_SIZE = 5;
  const GUIDE_HIT_TARGET_SCREEN_RADIUS = 7;
  const FULL_ELLIPSE_ANGLE_TOLERANCE = 0.02;
  const MAXIMUM_INNER_RATIO = 0.85;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function rectFromPoints(start, end) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }

  function ellipseGeometry(rect) {
    return {
      center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      radiusX: Math.max(0.5, rect.width / 2),
      radiusY: Math.max(0.5, rect.height / 2)
    };
  }

  function normalizeAngle(angle) {
    const turn = Math.PI * 2;
    return ((angle % turn) + turn) % turn;
  }

  function angleDistance(first, second) {
    const difference = Math.abs(normalizeAngle(first) - normalizeAngle(second));
    return Math.min(difference, Math.PI * 2 - difference);
  }

  function pointAtAngle(model, angle, radiusRatio) {
    return {
      x: model.center.x + Math.cos(angle) * model.radiusX * radiusRatio,
      y: model.center.y + Math.sin(angle) * model.radiusY * radiusRatio
    };
  }

  function openingMidAngle(model) {
    if (model.fullEllipse) return -Math.PI / 2;
    const sweep = normalizeAngle(model.openingEnd - model.openingStart);
    return model.openingStart + sweep / 2;
  }

  function guidePoints(model) {
    return {
      openingStart: pointAtAngle(model, model.openingStart, 1),
      openingEnd: pointAtAngle(model, model.openingEnd, 1),
      innerRadius: model.innerRatio > 0
        ? pointAtAngle(model, openingMidAngle(model), model.innerRatio)
        : { ...model.center }
    };
  }

  /**
   * Trace a full ellipse, pie sector, or open-center ring sector.
   * @param {CanvasRenderingContext2D} context - Canvas path receiving the ellipse or pie.
   * @param {{center:object,radiusX:number,radiusY:number,openingStart:number,openingEnd:number,innerRatio:number,fullEllipse:boolean}} model - Current editable geometry.
   */
  function traceEllipsePie(context, model) {
    const { center, radiusX, radiusY, innerRatio } = model;
    if (model.fullEllipse) {
      context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      if (innerRatio > 0) {
        context.moveTo(center.x + radiusX * innerRatio, center.y);
        context.ellipse(center.x, center.y, radiusX * innerRatio, radiusY * innerRatio, 0, 0, Math.PI * 2, true);
      }
      context.closePath();
      return;
    }

    const bodyStart = model.openingEnd;
    let bodyEnd = model.openingStart;
    while (bodyEnd <= bodyStart) bodyEnd += Math.PI * 2;
    const outerStart = pointAtAngle(model, bodyStart, 1);
    context.moveTo(outerStart.x, outerStart.y);
    context.ellipse(center.x, center.y, radiusX, radiusY, 0, bodyStart, bodyEnd);
    if (innerRatio <= 0) {
      context.lineTo(center.x, center.y);
    } else {
      const innerEnd = pointAtAngle(model, bodyEnd, innerRatio);
      context.lineTo(innerEnd.x, innerEnd.y);
      context.ellipse(center.x, center.y, radiusX * innerRatio, radiusY * innerRatio, 0, bodyEnd, bodyStart, true);
    }
    context.closePath();
  }

  function drawEllipsePie(context, model, state) {
    context.save();
    namespace.configureStroke(context, state, state.lineWidth);
    context.beginPath();
    traceEllipsePie(context, model);
    if (state.fillShapes) context.fill();
    context.stroke();
    context.restore();
  }

  /** Owns one ellipse until its opening angles and inner radius are accepted or cancelled. */
  class ImageEditorEllipseTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.rect) return null;
      return {
        rect: { ...this.rect },
        ...ellipseGeometry(this.rect),
        openingStart: this.openingStart,
        openingEnd: this.openingEnd,
        innerRatio: this.innerRatio,
        fullEllipse: this.fullEllipse
      };
    }

    /** Begin the ellipse bounds, adjust one pie guide, or classify an outside click. */
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

    /** Update the initial ellipse bounds or the active pie guide. */
    update(point) {
      if (this.phase === "drawing") {
        this.rect = rectFromPoints(this.start, point);
        return;
      }
      if (this.phase !== "adjusting") return;
      const model = this.model;
      if (this.activeHandle === "innerRadius") {
        const normalizedX = (point.x - model.center.x) / model.radiusX;
        const normalizedY = (point.y - model.center.y) / model.radiusY;
        this.innerRatio = clamp(Math.hypot(normalizedX, normalizedY), 0, MAXIMUM_INNER_RATIO);
        return;
      }
      const angle = Math.atan2(
        (point.y - model.center.y) / model.radiusY,
        (point.x - model.center.x) / model.radiusX
      );
      this[this.activeHandle] = angle;
      this.fullEllipse = false;
    }

    /** Finish the current bounds or guide drag while leaving the ellipse editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      if (!this.rect.width || !this.rect.height) {
        this.reset();
        return false;
      }
      if (ANGLE_HANDLES.includes(this.activeHandle) &&
          angleDistance(this.openingStart, this.openingEnd) <= FULL_ELLIPSE_ANGLE_TOLERANCE) {
        this.fullEllipse = true;
      }
      this.phase = "editing";
      return true;
    }

    /** Draw the ellipse or pie plus its opening-angle and inner-radius guides. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      drawEllipsePie(context, model, state);
      const points = guidePoints(model);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.48)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.rect.x, model.rect.y, model.rect.width, model.rect.height);
      context.setLineDash([]);
      const handles = ["openingStart", "openingEnd", "innerRadius"]
        .filter((handle) => handle !== this.activeHandle);
      handles.push(this.activeHandle);
      handles.forEach((handle) => {
        const point = points[handle];
        context.fillStyle = handle === this.activeHandle ? "rgba(255, 255, 255, 0.88)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.72)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Rasterize the accepted ellipse or pie into a transparent floating layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(model.rect.x - padding));
      const top = Math.max(0, Math.floor(model.rect.y - padding));
      const right = Math.min(bounds.width, Math.ceil(model.rect.x + model.rect.width + padding));
      const bottom = Math.min(bounds.height, Math.ceil(model.rect.y + model.rect.height + padding));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      drawEllipsePie(context, model, state);
      return {
        imageData: context.getImageData(0, 0, width, height),
        rect: { x: left, y: top, width, height }
      };
    }

    /** Discard the editable ellipse and its pie guides. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.openingStart = -Math.PI / 2;
      this.openingEnd = -Math.PI / 2;
      this.innerRatio = 0;
      this.fullEllipse = true;
      this.activeHandle = "openingStart";
      this.zoom = 1;
    }

    contains(point) {
      return !!this.rect &&
        point.x >= this.rect.x && point.x <= this.rect.x + this.rect.width &&
        point.y >= this.rect.y && point.y <= this.rect.y + this.rect.height;
    }

    findHandle(point) {
      const points = guidePoints(this.model);
      return ["openingStart", "openingEnd", "innerRadius"].find((handle) =>
        Math.hypot(points[handle].x - point.x, points[handle].y - point.y) <= GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom
      ) || null;
    }
  }

  namespace.traceEllipsePie = traceEllipsePie;
  namespace.ImageEditorEllipseTool = ImageEditorEllipseTool;
})(typeof window !== "undefined" ? window : globalThis);
