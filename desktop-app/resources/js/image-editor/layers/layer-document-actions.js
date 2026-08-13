// Layer-only compositing and merge-visible document operations.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  /** Render selected hierarchy layers on a transparent full-canvas surface. */
  function renderLayers(store, layerIds) {
    const source = store.document;
    const document = namespace.createImageDocument(source.canvas.width, source.canvas.height, "transparent");
    const background = document.nodes.find((node) => namespace.isCanvasBackgroundLayer(node));
    const layers = (layerIds || []).map((id) => namespace.findDocumentNode(source, id)?.node)
      .filter((node) => node?.kind === "layer")
      .map((node) => namespace.cloneImageDocument(node));
    document.nodes = [...layers, background].filter(Boolean);
    document.activeLayerId = layers[0]?.id || background?.id;
    return new namespace.ImageEditorCompositor(new namespace.ImageEditorDocumentStore(document, store.assets)).render();
  }

  function retainHiddenNodes(nodes, ancestorVisible = true) {
    return (nodes || []).flatMap((node) => {
      if (namespace.isCanvasBackgroundLayer(node)) return [node];
      const visible = ancestorVisible && node.visible !== false;
      if (node.kind === "layer") return visible ? [] : [node];
      if (!visible) return [node];
      const children = retainHiddenNodes(node.children || [], true);
      if (!children.length) return [];
      node.children = children;
      return [node];
    });
  }

  /** Merge all visible user layers into one raster layer while retaining hidden content. */
  function mergeVisible(store) {
    const visibleLayerIds = [];
    namespace.walkDocumentNodes(store.document, (node, parent) => {
      if (node.kind !== "layer" || namespace.isCanvasBackgroundLayer(node)) return;
      let visible = node.visible !== false;
      let ancestor = parent;
      while (visible && ancestor) {
        visible = ancestor.visible !== false;
        ancestor = namespace.findDocumentNode(store.document, ancestor.id)?.parent;
      }
      if (visible) visibleLayerIds.push(node.id);
    });
    if (visibleLayerIds.length < 2) return false;
    const canvas = renderLayers(store, visibleLayerIds);
    const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const mergedLayer = namespace.createContentLayer("Merged visible");
    const assetId = store.addRasterAsset(imageData);
    mergedLayer.objects.push(namespace.createContentObject("raster", { assetId }, {
      name: "Merged visible",
      bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height }
    }));
    const retained = retainHiddenNodes(store.document.nodes);
    const backgroundIndex = retained.findIndex((node) => namespace.isCanvasBackgroundLayer(node));
    retained.splice(backgroundIndex < 0 ? retained.length : backgroundIndex, 0, mergedLayer);
    store.document.nodes = retained;
    store.document.activeLayerId = mergedLayer.id;
    store.selectedIds = new Set([mergedLayer.id]);
    store.notify({ type: "merge-visible", ids: [mergedLayer.id] });
    return true;
  }

  namespace.ImageEditorLayerDocumentActions = { renderLayers, mergeVisible };
})(typeof window !== "undefined" ? window : globalThis);
