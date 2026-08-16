// Canonical document-store mutations for adjustment layers and their masks.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function insertionLocation(store, targetId) {
    const object = namespace.findDocumentObject(store.document, targetId);
    if (object?.layer) return namespace.findDocumentNode(store.document, object.layer.id);
    if (object) return { node: object.object, parent: object.parent, index: object.index, collection: object.collection };
    const node = namespace.findDocumentNode(store.document, targetId);
    if (node) return node;
    const active = namespace.findDocumentNode(store.document, store.document.activeLayerId);
    return active || { index: 0, collection: store.document.nodes };
  }

  /** Add an adjustment directly above the active hierarchy anchor. */
  function add(store, type, options = {}) {
    const defaultName = namespace.ImageEditorAdjustmentModel.nameForType(type);
    const node = namespace.ImageEditorAdjustmentModel.create(type, {
      ...options,
      name: store.uniqueName(options.name || defaultName),
      mask: options.mask || namespace.ImageEditorAdjustmentMaskEditor.createFromSelection(store, options.selectionRegion)
    });
    const location = insertionLocation(store, options.targetId || [...store.selectedIds][0] || store.document.activeLayerId);
    location.collection.splice(location.index, 0, node);
    store.selectedIds = new Set([node.id]);
    store.adjustmentTarget = { nodeId: node.id, part: "adjustment" };
    store.notify({ type: "add-adjustment", ids: [node.id] });
    return node;
  }

  /** Update the typed properties of one unlocked adjustment layer. */
  function update(store, nodeId, patch) {
    const node = namespace.findDocumentNode(store.document, nodeId)?.node;
    if (!namespace.ImageEditorAdjustmentModel.isAdjustment(node) || node.locked) return false;
    node.adjustment = namespace.ImageEditorAdjustmentModel.normalizeAdjustment({ ...node.adjustment, ...(patch || {}) });
    store.notify({ type: "update-adjustment", ids: [nodeId] });
    return true;
  }

  /** Apply a named mask mutation through the adjustment mask editor. */
  function updateMask(store, nodeId, operation = {}) {
    const editor = namespace.ImageEditorAdjustmentMaskEditor;
    let changed = false;
    if (operation.type === "enabled") changed = editor.setEnabled(store, nodeId, operation.enabled);
    else if (operation.type === "invert") changed = editor.invert(store, nodeId);
    else if (operation.type === "white") changed = editor.setUniform(store, nodeId, 255);
    else if (operation.type === "black") changed = editor.setUniform(store, nodeId, 0);
    else if (operation.type === "fill-region") changed = editor.fillRegion(store, nodeId, operation.value, operation.region);
    else if (operation.type === "stroke") changed = editor.paintStroke(store, nodeId, operation.from, operation.to, operation);
    if (changed) store.notify({ type: "update-adjustment-mask", ids: [nodeId] });
    return changed;
  }

  namespace.ImageEditorAdjustmentOperations = { add, update, updateMask };
})(typeof window !== "undefined" ? window : globalThis);
