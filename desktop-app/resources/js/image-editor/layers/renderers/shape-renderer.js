// Shape and path renderer using the stored transparent fallback asset.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor;
  const render = (context, object, assets) => namespace.renderImageEditorRasterObject(context, object, assets, object.payload?.fallbackAssetId);
  namespace.imageEditorContentRenderers.register("shape", render).register("path", render).register("fallback", render);
})(typeof window !== "undefined" ? window : globalThis);
