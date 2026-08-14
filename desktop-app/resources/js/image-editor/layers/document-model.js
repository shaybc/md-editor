// Versioned document and hierarchy model for layered image-editor projects.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const DOCUMENT_FORMAT = "md-editor-image";
  const DOCUMENT_VERSION = 1;

  function createId(prefix = "node") {
    if (global.crypto?.randomUUID) return `${prefix}_${global.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function commonNode(kind, name) {
    return {
      id: createId(kind), kind, name: String(name || (kind === "group" ? "Group" : "Layer")),
      visible: true, locked: false, opacity: 1, blendMode: "normal",
      effects: [], mask: null, extensions: {}
    };
  }

  /** Create a named compositing layer that owns ordered content objects. */
  function createContentLayer(name = "Layer") {
    return { ...commonNode("layer", name), rasterAssetId: null, pixelEdits: [], objects: [] };
  }

  /** Create a hierarchy group that owns objects, layers, or nested groups. */
  function createLayerGroup(name = "Group") {
    return { ...commonNode("group", name), children: [] };
  }

  /** Create a content object with shared transform and appearance fields. */
  function createContentObject(type, payload = {}, options = {}) {
    return {
      id: createId("object"), kind: "object", type: String(type || "raster"),
      name: String(options.name || type || "Object"), visible: options.visible !== false,
      locked: options.locked === true, opacity: Math.max(0, Math.min(1, Number(options.opacity ?? 1))),
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...(options.transform || {}) },
      bounds: { x: 0, y: 0, width: 1, height: 1, ...(options.bounds || {}) },
      payload: structuredCloneValue(payload), effects: [], mask: null, extensions: {}
    };
  }

  /** Create an empty versioned layered document. */
  function createImageDocument(width, height, backgroundColor = "#ffffff") {
    const layer = createContentLayer("Background");
    layer.extensions.canvasBackground = true;
    return {
      format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION,
      canvas: { width: Math.max(1, Math.round(Number(width) || 1)), height: Math.max(1, Math.round(Number(height) || 1)), backgroundColor },
      nodes: [layer], activeLayerId: layer.id, extensions: {}
    };
  }

  function structuredCloneValue(value) {
    if (value == null) return value;
    if (typeof global.structuredClone === "function") return global.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  /** Deep-clone document metadata without copying separately owned raster assets. */
  function cloneImageDocument(document) {
    return structuredCloneValue(document);
  }

  /** Walk every group and layer in panel order. */
  function walkDocumentNodes(document, visitor, nodes = document?.nodes || [], parent = null) {
    nodes.forEach((node, index) => {
      visitor(node, parent, index);
      if (node.kind === "group") walkDocumentNodes(document, visitor, node.children || [], node);
    });
  }

  /** Locate a layer or group and its parent collection. */
  function findDocumentNode(document, id) {
    let result = null;
    walkDocumentNodes(document, (node, parent, index) => {
      if (!result && node.kind !== "object" && node.id === id) result = { node, parent, index, collection: parent ? parent.children : document.nodes };
    });
    return result;
  }

  /** Walk content objects whether they belong to a layer or directly to the hierarchy. */
  function walkDocumentObjects(document, visitor, items = document?.nodes || [], parent = null, inheritedVisible = true, inheritedLocked = false) {
    items.forEach((item, index) => {
      const visible = inheritedVisible && item.visible !== false;
      const locked = inheritedLocked || item.locked === true;
      if (item.kind === "object") {
        visitor(item, { object: item, layer: null, parent, index, collection: items, visible, locked });
        return;
      }
      if (item.kind === "group") {
        walkDocumentObjects(document, visitor, item.children || [], item, visible, locked);
        return;
      }
      (item.objects || []).forEach((object, objectIndex) => visitor(object, {
        object, layer: item, parent: item, index: objectIndex, collection: item.objects,
        visible: visible && object.visible !== false, locked: locked || object.locked === true
      }));
    });
  }

  /** Locate a content object and its actual owning collection. */
  function findDocumentObject(document, id) {
    let result = null;
    walkDocumentObjects(document, (object, location) => { if (!result && object.id === id) result = location; });
    return result;
  }

  /** Return whether a hierarchy node is the permanent canvas background layer. */
  function isCanvasBackgroundLayer(node) {
    return node?.kind === "layer" && node.extensions?.canvasBackground === true;
  }

  /** Migrate and place the permanent canvas background as the final root node. */
  function normalizeCanvasBackgroundLayer(document) {
    const marked = [];
    walkDocumentNodes(document, (node) => {
      if (isCanvasBackgroundLayer(node)) marked.push(node);
    });
    let background = marked[0] || null;
    marked.slice(1).forEach((node) => { delete node.extensions.canvasBackground; });
    if (!background) {
      walkDocumentNodes(document, (node) => {
        if (!background && node.kind === "layer" && node.name === "Background") background = node;
      });
    }
    if (!background) background = createContentLayer("Background");
    const location = findDocumentNode(document, background.id);
    if (location) location.collection.splice(location.index, 1);
    background.extensions = { ...(background.extensions || {}), canvasBackground: true };
    background.visible = true;
    document.nodes.push(background);
    if (!findDocumentNode(document, document.activeLayerId)) document.activeLayerId = background.id;
    return background;
  }

  /** Return all asset identifiers referenced by raster objects. */
  function referencedAssetIds(document) {
    const ids = new Set();
    walkDocumentObjects(document, (object) => {
      if (object.type === "raster" && object.payload?.assetId) ids.add(object.payload.assetId);
      if (object.payload?.fallbackAssetId) ids.add(object.payload.fallbackAssetId);
    });
    walkDocumentNodes(document, (node) => {
      if (node.kind === "layer") {
        if (node.rasterAssetId) ids.add(node.rasterAssetId);
        (node.pixelEdits || []).forEach((edit) => { if (edit.assetId) ids.add(edit.assetId); });
      }
    });
    return ids;
  }

  /** Validate hierarchy invariants before rendering or saving. */
  function validateImageDocument(document) {
    if (document?.format !== DOCUMENT_FORMAT || Number(document?.version) !== DOCUMENT_VERSION) throw new Error("Unsupported layered image document.");
    if (!Number.isFinite(document.canvas?.width) || !Number.isFinite(document.canvas?.height) || document.canvas.width < 1 || document.canvas.height < 1) throw new Error("The layered image canvas dimensions are invalid.");
    const ids = new Set();
    const ancestors = new Set();
    const validateNodes = (nodes) => (nodes || []).forEach((node) => {
      if (ancestors.has(node)) throw new Error("The layered image hierarchy contains a cycle.");
      if (!node?.id || ids.has(node.id)) throw new Error("The layered image contains duplicate or missing node identifiers.");
      ids.add(node.id);
      if (node.kind !== "layer" && node.kind !== "group" && node.kind !== "object") throw new Error("The layered image contains an unsupported hierarchy node.");
      if (node.kind === "object") return;
      (node.objects || []).forEach((object) => {
        if (!object?.id || ids.has(object.id)) throw new Error("The layered image contains duplicate or missing object identifiers.");
        ids.add(object.id);
      });
      if (node.kind === "group") {
        ancestors.add(node);
        validateNodes(node.children || []);
        ancestors.delete(node);
      }
    });
    validateNodes(document.nodes);
    const backgroundNodes = [];
    walkDocumentNodes(document, (node) => { if (isCanvasBackgroundLayer(node)) backgroundNodes.push(node); });
    if (backgroundNodes.length !== 1 || document.nodes.at(-1) !== backgroundNodes[0] || backgroundNodes[0].visible === false) throw new Error("The canvas background must be the visible final root layer.");
    return true;
  }

  Object.assign(namespace, {
    IMAGE_DOCUMENT_FORMAT: DOCUMENT_FORMAT,
    IMAGE_DOCUMENT_VERSION: DOCUMENT_VERSION,
    createImageEditorId: createId,
    createImageDocument,
    createContentLayer,
    createLayerGroup,
    createContentObject,
    cloneImageDocument,
    walkDocumentNodes,
    walkDocumentObjects,
    findDocumentNode,
    findDocumentObject,
    isCanvasBackgroundLayer,
    normalizeCanvasBackgroundLayer,
    referencedAssetIds,
    validateImageDocument
  });
})(typeof window !== "undefined" ? window : globalThis);
