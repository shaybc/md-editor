// Editable logarithmic spiral geometry, parameter guides, and rasterization.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const START_ANGLE = -Math.PI / 2;
  const MINIMUM_ARC_ANGLE = Math.PI / 12;
  const MAXIMUM_ARC_ANGLE = Math.PI * 23 / 12;
  const MINIMUM_DECAY = 0.25;
  const MAXIMUM_DECAY = 0.98;
  const MAXIMUM_TURNS = 24;
  const GUIDE_HANDLE_SCREEN_SIZE = 5;
  const GUIDE_HIT_TARGET_SCREEN_RADIUS = 7;
  const GUIDE_NAMES = Object.freeze(["decayPerArc", "decayPerTurn", "arcAngle", "innerRadius"]);

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

  function normalizeAngle(angle) {
    const fullTurn = Math.PI * 2;
    return ((angle % fullTurn) + fullTurn) % fullTurn;
  }

  function spiralDecayRate(model) {
    return Math.log(model.decayPerTurn) / (Math.PI * 2) + Math.log(model.decayPerArc) / model.arcAngle;
  }

  function totalSpiralAngle(model) {
    const rate = spiralDecayRate(model);
    const requested = Math.log(model.innerRadius / model.outerRadius) / rate;
    return clamp(requested, model.arcAngle, Math.PI * 2 * MAXIMUM_TURNS);
  }

  function radiusAtAngle(model, angle) {
    return Math.max(model.innerRadius, model.outerRadius * Math.exp(spiralDecayRate(model) * angle));
  }

  function pointAtAngle(model, radius, angle) {
    const direction = model.direction === "counter-clockwise" ? -1 : 1;
    const canvasAngle = START_ANGLE + direction * angle;
    return {
      x: model.center.x + Math.cos(canvasAngle) * radius,
      y: model.center.y + Math.sin(canvasAngle) * radius
    };
  }

  function traceSpiral(context, model, capInsideWithCircle) {
    const totalAngle = totalSpiralAngle(model);
    const steps = Math.max(48, Math.ceil(totalAngle / (Math.PI / 48)));
    for (let index = 0; index <= steps; index += 1) {
      const angle = totalAngle * index / steps;
      const point = pointAtAngle(model, radiusAtAngle(model, angle), angle);
      if (!index) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    if (capInsideWithCircle) {
      context.moveTo(model.center.x + model.innerRadius, model.center.y);
      context.arc(model.center.x, model.center.y, model.innerRadius, 0, Math.PI * 2);
    }
  }

  function drawSpiral(context, model, state) {
    context.save();
    namespace.configureStroke(context, state, state.lineWidth);
    context.beginPath();
    traceSpiral(context, model, state.spiralCapInside === true);
    context.stroke();
    context.restore();
  }

  /** Owns one parametric spiral until it is converted or placed as a floating layer. */
  class ImageEditorSpiralTool {
    constructor() {
      this.reset();
    }

    get isEditing() {
      return this.phase !== "idle";
    }

    get model() {
      if (!this.rect) return null;
      const outerRadius = Math.min(this.rect.width, this.rect.height) / 2;
      if (outerRadius <= 1) return null;
      const center = {
        x: this.rect.x + this.rect.width / 2,
        y: this.rect.y + this.rect.height / 2
      };
      const innerRadius = clamp(this.innerRadius, Math.max(1, outerRadius * 0.01), outerRadius * 0.75);
      return {
        center,
        outerRadius,
        innerRadius,
        decayPerArc: this.decayPerArc,
        decayPerTurn: this.decayPerTurn,
        arcAngle: this.arcAngle,
        direction: this.direction,
        selectionRect: {
          x: center.x - outerRadius,
          y: center.y - outerRadius,
          width: outerRadius * 2,
          height: outerRadius * 2
        }
      };
    }

    /** Begin the spiral bounds, adjust a parameter guide, or classify an outside click. */
    begin(point, state) {
      if (this.phase === "idle") {
        this.start = { ...point };
        this.rect = rectFromPoints(point, point);
        this.direction = state?.spiralDirection === "counter-clockwise" ? "counter-clockwise" : "clockwise";
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

    /** Update the initial bounds or the active spiral parameter guide. */
    update(point) {
      if (this.phase === "drawing") {
        this.rect = rectFromPoints(this.start, point);
        const radius = Math.min(this.rect.width, this.rect.height) / 2;
        this.innerRadius = Math.max(1, radius * 0.08);
        return;
      }
      if (this.phase !== "adjusting") return;
      const model = this.model;
      if (!model) return;
      const distance = Math.hypot(point.x - model.center.x, point.y - model.center.y);
      if (this.activeHandle === "innerRadius") {
        this.innerRadius = clamp(distance, Math.max(1, model.outerRadius * 0.01), model.outerRadius * 0.75);
        return;
      }
      if (this.activeHandle === "arcAngle") {
        const pointerAngle = Math.atan2(point.y - model.center.y, point.x - model.center.x);
        const direction = model.direction === "counter-clockwise" ? -1 : 1;
        this.arcAngle = clamp(normalizeAngle((pointerAngle - START_ANGLE) * direction), MINIMUM_ARC_ANGLE, MAXIMUM_ARC_ANGLE);
        return;
      }
      if (this.activeHandle === "decayPerArc") {
        const turnContribution = Math.pow(this.decayPerTurn, this.arcAngle / (Math.PI * 2));
        this.decayPerArc = clamp(distance / model.outerRadius / turnContribution, MINIMUM_DECAY, MAXIMUM_DECAY);
        return;
      }
      const arcContribution = Math.pow(this.decayPerArc, Math.PI * 2 / this.arcAngle);
      this.decayPerTurn = clamp(distance / model.outerRadius / arcContribution, MINIMUM_DECAY, MAXIMUM_DECAY);
    }

    /** Finish the current bounds or guide drag while leaving the spiral editable. */
    completeStage(point) {
      this.update(point);
      if (this.phase !== "drawing" && this.phase !== "adjusting") return false;
      if (!this.model) {
        this.reset();
        return false;
      }
      this.activeHandle = null;
      this.phase = "editing";
      return true;
    }

    /** Change the live spiral winding direction without rebuilding its parameters. */
    setDirection(direction) {
      this.direction = direction === "counter-clockwise" ? "counter-clockwise" : "clockwise";
    }

    /** Draw the spiral, its selection bounds, and four gentle parameter guides. */
    drawPreview(context, state) {
      const model = this.model;
      if (!model) return;
      this.zoom = Math.max(0.25, Number(state.zoom) || 1);
      drawSpiral(context, model, state);
      const guides = this.guidePoints(model);
      const guideScale = 1 / this.zoom;
      const handleSize = GUIDE_HANDLE_SCREEN_SIZE * guideScale;
      const halfHandle = handleSize / 2;
      context.save();
      context.setLineDash([3 * guideScale, 3 * guideScale]);
      context.strokeStyle = "rgba(20, 115, 230, 0.42)";
      context.lineWidth = 0.75 * guideScale;
      context.strokeRect(model.selectionRect.x, model.selectionRect.y, model.selectionRect.width, model.selectionRect.height);
      context.beginPath();
      GUIDE_NAMES.forEach((name) => {
        context.moveTo(model.center.x, model.center.y);
        context.lineTo(guides[name].x, guides[name].y);
      });
      context.stroke();
      context.setLineDash([]);
      GUIDE_NAMES.forEach((name) => {
        const point = guides[name];
        context.fillStyle = name === this.activeHandle ? "rgba(255, 255, 255, 0.9)" : "rgba(20, 115, 230, 0.72)";
        context.strokeStyle = "rgba(20, 115, 230, 0.82)";
        context.fillRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
        context.strokeRect(point.x - halfHandle, point.y - halfHandle, handleSize, handleSize);
      });
      context.restore();
    }

    /** Rasterize the accepted spiral into a tightly bounded transparent layer. */
    rasterize(state, bounds) {
      const model = this.model;
      if (!model) return null;
      const padding = Math.ceil(state.lineWidth / 2) + 2;
      const left = Math.max(0, Math.floor(model.selectionRect.x - padding));
      const top = Math.max(0, Math.floor(model.selectionRect.y - padding));
      const right = Math.min(bounds.width, Math.ceil(model.selectionRect.x + model.selectionRect.width + padding));
      const bottom = Math.min(bounds.height, Math.ceil(model.selectionRect.y + model.selectionRect.height + padding));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if (!width || !height) return null;
      const canvas = global.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.translate(-left, -top);
      drawSpiral(context, model, state);
      return { imageData: context.getImageData(0, 0, width, height), rect: { x: left, y: top, width, height } };
    }

    /** Discard the editable spiral and its parameter guides. */
    reset() {
      this.phase = "idle";
      this.start = null;
      this.rect = null;
      this.decayPerArc = 0.84;
      this.decayPerTurn = 0.72;
      this.arcAngle = Math.PI / 2;
      this.innerRadius = 1;
      this.direction = "clockwise";
      this.activeHandle = null;
      this.zoom = 1;
    }

    contains(point) {
      const rect = this.model?.selectionRect;
      return !!rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    guidePoints(model = this.model) {
      const totalAngle = totalSpiralAngle(model);
      return {
        decayPerArc: pointAtAngle(model, radiusAtAngle(model, model.arcAngle), model.arcAngle),
        decayPerTurn: pointAtAngle(model, radiusAtAngle(model, Math.PI * 2), Math.PI * 2),
        arcAngle: pointAtAngle(model, model.outerRadius, model.arcAngle),
        innerRadius: pointAtAngle(model, model.innerRadius, totalAngle)
      };
    }

    findHandle(point) {
      const guides = this.guidePoints();
      const radius = GUIDE_HIT_TARGET_SCREEN_RADIUS / this.zoom;
      return GUIDE_NAMES.find((name) => Math.hypot(guides[name].x - point.x, guides[name].y - point.y) <= radius) || null;
    }
  }

  namespace.traceSpiral = traceSpiral;
  namespace.ImageEditorSpiralTool = ImageEditorSpiralTool;
})(typeof window !== "undefined" ? window : globalThis);
