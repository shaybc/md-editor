// State model for raster image-editor documents.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TOOLS = Object.freeze(["select", "pencil", "brush", "line", "curve", "rectangle", "ellipse", "polygon", "bucket", "text"]);

  class ImageEditorState {
    /**
     * Own the non-pixel state for one image-editor tab.
     * @param {object} options - Initial dimensions, MIME type, and tool preferences.
     */
    constructor(options = {}) {
      this.width = Math.max(1, Number(options.width || 1));
      this.height = Math.max(1, Number(options.height || 1));
      this.mimeType = options.mimeType || "image/png";
      this.tool = TOOLS.includes(options.tool) ? options.tool : "pencil";
      this.foregroundColor = options.foregroundColor || "#111111";
      this.backgroundColor = options.backgroundColor || "#ffffff";
      this.brushSize = Math.max(1, Math.min(64, Number(options.brushSize || 8)));
      this.lineWidth = Math.max(1, Math.min(64, Number(options.lineWidth || 2)));
      this.fillShapes = options.fillShapes === true;
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
