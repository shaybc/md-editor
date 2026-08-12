// Extensible content-renderer registry for layered image objects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorContentRendererRegistry {
    constructor() { this.renderers = new Map(); }
    register(type, renderer) { this.renderers.set(type, renderer); return this; }
    render(context, object, assets) {
      const renderer = this.renderers.get(object.type) || this.renderers.get("fallback");
      if (renderer && object.visible !== false) renderer(context, object, assets);
    }
  }

  namespace.ImageEditorContentRendererRegistry = ImageEditorContentRendererRegistry;
  namespace.imageEditorContentRenderers = new ImageEditorContentRendererRegistry();
})(typeof window !== "undefined" ? window : globalThis);
