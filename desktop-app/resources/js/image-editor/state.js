// State model for raster image-editor documents.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TOOLS = Object.freeze(["select", "move", "pencil", "brush", "eraser", "blur", "clone-stamp", "smudge", "line", "curve", "path", "arc", "spiral", "rectangular-grid", "polar-grid", "rectangle", "rounded-rectangle", "callout", "oval-callout", "cloud-callout", "ellipse", "polygon", "triangle", "diamond", "star", "arrow", "lightning", "heart", "bucket", "text"]);

  class ImageEditorState {
    /**
     * Own the non-pixel state for one image-editor tab.
     * @param {object} options - Initial dimensions, MIME type, and tool preferences.
     */
    constructor(options = {}) {
      this.width = Math.max(1, Number(options.width || 1));
      this.height = Math.max(1, Number(options.height || 1));
      this.mimeType = options.mimeType || "image/png";
      const requestedTool = TOOLS.includes(options.tool) ? options.tool : "pencil";
      this.tool = requestedTool === "select" && options.selectionMode === "object" ? "move" : requestedTool;
      this.selectionMode = this.tool === "move" ? "object" : "pixel";
      this.selectionShape = namespace.ImageEditorSelectionShapes?.normalize(options.selectionShape) || "rectangle";
      this.foregroundColor = options.foregroundColor || "#111111";
      this.backgroundColor = options.backgroundColor || "#ffffff";
      this.brushSize = Math.max(1, Math.min(64, Number(options.brushSize || 8)));
      this.brushType = namespace.normalizeBrushPreset ? namespace.normalizeBrushPreset(options.brushType) : "round";
      this.eraserHardness = Math.max(0, Math.min(100, Number(options.eraserHardness ?? 100)));
      this.blurHardness = Math.max(0, Math.min(100, Number(options.blurHardness ?? 50)));
      this.blurStrength = Math.max(1, Math.min(100, Number(options.blurStrength ?? 50)));
      this.cloneStampHardness = Math.max(0, Math.min(100, Number(options.cloneStampHardness ?? 75)));
      this.cloneStampOpacity = Math.max(1, Math.min(100, Number(options.cloneStampOpacity ?? 100)));
      this.cloneStampAligned = options.cloneStampAligned !== false;
      this.cloneStampSample = options.cloneStampSample === "all" ? "all" : "current";
      this.smudgeHardness = Math.max(0, Math.min(100, Number(options.smudgeHardness ?? 25)));
      this.smudgeStrength = Math.max(1, Math.min(100, Number(options.smudgeStrength ?? 50)));
      this.smudgeSampleAllLayers = options.smudgeSampleAllLayers === true;
      this.smudgeFingerPainting = options.smudgeFingerPainting === true;
      this.lineWidth = Math.max(1, Math.min(64, Number(options.lineWidth || 2)));
      this.strokeType = namespace.normalizeStrokeType ? namespace.normalizeStrokeType(options.strokeType) : "solid";
      this.fillShapes = options.fillShapes === true;
      this.bucketFillMode = ["gradient", "pattern"].includes(options.bucketFillMode) ? options.bucketFillMode : "solid";
      this.gradientStartColor = options.gradientStartColor || this.foregroundColor;
      this.gradientEndColor = options.gradientEndColor || this.backgroundColor;
      this.patternFillType = ["crosshatch", "halftone", "grain", "mosaic", "stained-glass", "pointillize"].includes(options.patternFillType) ? options.patternFillType : "crosshatch";
      this.patternScale = Math.max(4, Math.min(64, Number(options.patternScale || 16)));
      this.patternAngle = Math.max(0, Math.min(180, Number(options.patternAngle || 45)));
      this.patternDensity = Math.max(10, Math.min(90, Number(options.patternDensity || 50)));
      this.spiralDirection = options.spiralDirection === "counter-clockwise" ? "counter-clockwise" : "clockwise";
      this.spiralCapInside = options.spiralCapInside === true;
      this.rectangularGridHorizontalDividers = Math.max(0, Math.min(100, Math.round(Number(options.rectangularGridHorizontalDividers ?? 4))));
      this.rectangularGridVerticalDividers = Math.max(0, Math.min(100, Math.round(Number(options.rectangularGridVerticalDividers ?? 4))));
      this.rectangularGridFrame = options.rectangularGridFrame !== false;
      this.polarGridConcentricDividers = Math.max(0, Math.min(100, Math.round(Number(options.polarGridConcentricDividers ?? 4))));
      this.polarGridRadialDividers = Math.max(0, Math.min(100, Math.round(Number(options.polarGridRadialDividers ?? 8))));
      this.polarGridCompoundRings = options.polarGridCompoundRings === true;
      this.starPoints = [4, 5, 6].includes(Number(options.starPoints)) ? Number(options.starPoints) : 5;
      this.arrowDirection = ["up", "down", "left", "right"].includes(options.arrowDirection) ? options.arrowDirection : "right";
      this.arrowHeadAngle = [30, 45, 60, 90].includes(Number(options.arrowHeadAngle)) ? Number(options.arrowHeadAngle) : 90;
      this.cornerRadius = Math.max(0, Math.min(100, Number(options.cornerRadius ?? 16)));
      this.adjustAllCorners = options.adjustAllCorners !== false;
      this.fontFamily = options.fontFamily || "Arial";
      this.fontSize = Math.max(8, Math.min(144, Number(options.fontSize || 24)));
      this.fontBold = options.fontBold === true;
      this.fontItalic = options.fontItalic === true;
      this.zoom = Math.max(0.25, Math.min(8, Number(options.zoom || 1)));
      this.revision = 0;
      this.savedRevision = 0;
      this._isDirty = options.dirty === true;
    }

    get isDirty() {
      return this._isDirty;
    }

    setTool(tool) {
      if (!TOOLS.includes(tool)) throw new RangeError(`Unsupported image tool: ${tool}`);
      this.tool = tool;
      if (tool === "select") this.selectionMode = "pixel";
      if (tool === "move") this.selectionMode = "object";
      return tool;
    }

    setZoom(zoom) {
      this.zoom = Math.max(0.25, Math.min(8, Number(zoom || 1)));
      return this.zoom;
    }

    markChanged() {
      this.revision += 1;
      this._isDirty = true;
      return this.revision;
    }

    markSaved() {
      this.savedRevision = this.revision;
      this._isDirty = false;
    }

    setDirty(dirty) {
      this._isDirty = dirty === true;
    }

    getCommandState(history, selection) {
      return {
        canUndo: history?.canUndo === true,
        canRedo: history?.canRedo === true,
        canCut: selection?.hasSelection === true,
        canCopy: selection?.hasSelection === true,
        canDelete: selection?.hasSelection === true,
        canSave: this.isDirty
      };
    }
  }

  namespace.ImageEditorState = ImageEditorState;
  namespace.tools = TOOLS;
})(typeof window !== "undefined" ? window : globalThis);
