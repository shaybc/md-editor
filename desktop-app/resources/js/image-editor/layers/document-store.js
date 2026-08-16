// Canonical mutation store for layered image-editor documents and raster assets.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  class ImageEditorDocumentCommand {
    constructor(label, apply, revert) {
      this.label = label || "Document change";
      this.apply = apply;
      this.revert = revert;
    }
  }

  function cloneImageData(imageData) {
    if (!imageData) return null;
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }

  function contentAssetId(imageData) {
    let hash = 2166136261;
    for (let index = 0; index < imageData.data.length; index += 1) {
      hash ^= imageData.data[index];
      hash = Math.imul(hash, 16777619);
    }
    return `asset_${(hash >>> 0).toString(16)}_${imageData.width}x${imageData.height}`;
  }

  class ImageEditorDocumentStore {
    /** Own a validated document, immutable raster assets, selection, and render revisions. */
    constructor(document, assets = new Map()) {
      this.document = namespace.cloneImageDocument(document);
      namespace.migrateImageDocument(this.document);
      namespace.normalizeCanvasBackgroundLayer(this.document);
      namespace.ImageEditorAdjustmentModel?.normalizeDocument(this.document);
      namespace.validateImageDocument(this.document);
      this.assets = new Map(assets);
      this.selectedIds = new Set([this.document.activeLayerId].filter(Boolean));
      this.adjustmentTarget = null;
      this.revision = 0;
      this.listeners = new Set();
    }

    /** Subscribe to semantic document changes. */
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notify(change = {}) {
      this.revision += 1;
      this.listeners.forEach((listener) => listener({ revision: this.revision, ...change }));
    }

    /** Return the currently active content layer, falling back to the first unlocked layer. */
    activeLayer() {
      const active = namespace.findDocumentNode(this.document, this.document.activeLayerId)?.node;
      if (active?.kind === "layer") return active;
      let first = null;
      namespace.walkDocumentNodes(this.document, (node) => { if (!first && node.kind === "layer") first = node; });
      return first;
    }

    /**
     * Resolve selected layers, object owners, and selected groups into one deduplicated layer target list.
     * @param {{ editableOnly?: boolean, fallbackToActive?: boolean }} options - Filtering and fallback behavior.
     * @returns {Array<object>} Layers affected by a content-editing action in panel selection order.
     */
    selectedContentLayers(options = {}) {
      const layers = [];
      const seen = new Set();
      let hasExplicitContentSelection = false;
      const includeLayer = (layer, inheritedVisible = true, inheritedLocked = false) => {
        if (!layer || seen.has(layer.id)) return;
        if (options.editableOnly && (!inheritedVisible || inheritedLocked || layer.visible === false || layer.locked)) return;
        seen.add(layer.id);
        layers.push(layer);
      };
      const includeNode = (node, inheritedVisible = true, inheritedLocked = false) => {
        if (!node) return;
        const visible = inheritedVisible && node.visible !== false;
        const locked = inheritedLocked || node.locked === true;
        if (node.kind === "layer") { includeLayer(node, visible, locked); return; }
        (node.children || []).forEach((child) => includeNode(child, visible, locked));
      };
      this.selectedIds.forEach((id) => {
        const object = namespace.findDocumentObject(this.document, id);
        if (object) { hasExplicitContentSelection = true; includeLayer(object.layer); return; }
        const node = namespace.findDocumentNode(this.document, id)?.node;
        if (node) hasExplicitContentSelection = true;
        includeNode(node);
      });
      if (!layers.length && !hasExplicitContentSelection && options.fallbackToActive !== false) includeLayer(this.activeLayer());
      return layers;
    }

    /** Apply a command only when it leaves the document hierarchy valid. */
    applyCommand(command) {
      if (!command || typeof command.apply !== "function" || typeof command.revert !== "function") throw new TypeError("A document command must provide apply and revert functions.");
      const before = this.snapshot();
      try {
        command.apply(this.document, this);
        namespace.validateImageDocument(this.document);
        this.notify({ type: "command", label: command.label });
        return true;
      } catch (error) {
        this.restore(before);
        throw error;
      }
    }

    /** Select hierarchy or object identifiers and synchronize the active layer. */
    select(ids, options = {}) {
      const next = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
      this.selectedIds = new Set(options.additive ? [...this.selectedIds, ...next] : next);
      const selected = next[0];
      const object = namespace.findDocumentObject(this.document, selected);
      const node = namespace.findDocumentNode(this.document, selected)?.node;
      if (object?.layer) this.document.activeLayerId = object.layer.id;
      else if (node?.kind === "layer") this.document.activeLayerId = node.id;
      this.adjustmentTarget = node?.kind === "adjustment" ? { nodeId: node.id, part: "adjustment" } : null;
      this.notify({ type: "selection" });
    }

    /** Select an adjustment's properties or mask without changing hierarchy selection. */
    selectAdjustmentPart(nodeId, part = "adjustment") {
      const node = namespace.findDocumentNode(this.document, nodeId)?.node;
      if (!namespace.ImageEditorAdjustmentModel.isAdjustment(node) || !["adjustment", "mask"].includes(part)) return false;
      this.selectedIds = new Set([nodeId]);
      this.adjustmentTarget = { nodeId, part };
      this.notify({ type: "selection", ids: [nodeId], adjustmentPart: part });
      return true;
    }

    /** Register immutable raster pixels and return their asset identifier. */
    addRasterAsset(imageData, requestedId) {
      const id = requestedId || contentAssetId(imageData);
      if (!this.assets.has(id)) this.assets.set(id, cloneImageData(imageData));
      return id;
    }

    /** Add a new named layer above the active layer or inside a selected group. */
    addLayer(name = "Layer", targetId = this.document.activeLayerId) {
      const layer = namespace.createContentLayer(this.uniqueName(name));
      const target = namespace.findDocumentNode(this.document, targetId);
      if (target?.node.kind === "group") target.node.children.unshift(layer);
      else if (target) target.collection.splice(target.index, 0, layer);
      else this.document.nodes.unshift(layer);
      this.document.activeLayerId = layer.id;
      this.selectedIds = new Set([layer.id]);
      this.notify({ type: "add-layer", ids: [layer.id] });
      return layer;
    }

    /** Add a hierarchy group above a requested node, or at the root when no target is provided. */
    addGroup(name = "Group", targetId = this.document.activeLayerId) {
      const group = namespace.createLayerGroup(this.uniqueName(name));
      const target = targetId ? namespace.findDocumentNode(this.document, targetId) : null;
      if (target) target.collection.splice(target.index, 0, group);
      else this.document.nodes.unshift(group);
      this.selectedIds = new Set([group.id]);
      this.notify({ type: "add-group", ids: [group.id] });
      return group;
    }

    /** Add a supported adjustment layer above the active hierarchy anchor. */
    addAdjustmentLayer(type, options = {}) {
      return namespace.ImageEditorAdjustmentOperations.add(this, type, options);
    }

    /** Update an adjustment descriptor through its type normalizer. */
    updateAdjustment(id, patch) {
      return namespace.ImageEditorAdjustmentOperations.update(this, id, patch);
    }

    /** Update an adjustment mask through a named mask operation. */
    updateAdjustmentMask(id, operation) {
      return namespace.ImageEditorAdjustmentOperations.updateMask(this, id, operation);
    }

    /** Duplicate selected sibling nodes or objects with fresh stable identifiers. */
    duplicateSelected() {
      const selected = [...this.selectedIds];
      const duplicated = [];
      selected.forEach((id) => {
        const objectResult = namespace.findDocumentObject(this.document, id);
        if (objectResult) {
          const copy = namespace.cloneImageDocument(objectResult.object);
          copy.id = namespace.createImageEditorId("object");
          copy.name = this.uniqueObjectName(objectResult.collection, `${copy.name} copy`);
          objectResult.collection.splice(objectResult.index, 0, copy);
          duplicated.push(copy.id);
          return;
        }
        const nodeResult = namespace.findDocumentNode(this.document, id);
        if (!nodeResult || namespace.isCanvasBackgroundLayer(nodeResult.node)) return;
        const copy = namespace.cloneImageDocument(nodeResult.node);
        this.refreshNodeIds(copy);
        copy.name = this.uniqueName(`${copy.name} copy`);
        nodeResult.collection.splice(nodeResult.index, 0, copy);
        duplicated.push(copy.id);
      });
      if (!duplicated.length) return false;
      this.selectedIds = new Set(duplicated);
      const duplicatedAdjustment = duplicated.map((id) => namespace.findDocumentNode(this.document, id)?.node).find((node) => node?.kind === "adjustment");
      this.adjustmentTarget = duplicatedAdjustment ? { nodeId: duplicatedAdjustment.id, part: "adjustment" } : null;
      this.notify({ type: "duplicate", ids: duplicated });
      return true;
    }

    refreshNodeIds(node) {
      if (node.kind === "object") { node.id = namespace.createImageEditorId("object"); return; }
      node.id = namespace.createImageEditorId(node.kind);
      (node.objects || []).forEach((object) => { object.id = namespace.createImageEditorId("object"); });
      (node.children || []).forEach((child) => this.refreshNodeIds(child));
    }

    uniqueObjectName(owner, base) {
      const used = new Set((Array.isArray(owner) ? owner : owner?.objects || []).filter((item) => item.kind === "object").map((object) => object.name));
      if (!used.has(base)) return base;
      let index = 2;
      while (used.has(`${base} ${index}`)) index += 1;
      return `${base} ${index}`;
    }

    /** Group selected sibling hierarchy nodes while preserving their panel order. */
    groupSelected() {
      const locations = [...this.selectedIds].map((id) => {
        const node = namespace.findDocumentNode(this.document, id);
        if (node) return namespace.isCanvasBackgroundLayer(node.node) ? null : node;
        const object = namespace.findDocumentObject(this.document, id);
        return object && !object.layer ? { node: object.object, ...object } : null;
      }).filter(Boolean);
      if (locations.length < 1 || locations.some((item) => item.collection !== locations[0].collection)) return false;
      const collection = locations[0].collection;
      const indices = locations.map((item) => item.index).sort((a, b) => a - b);
      const insertionIndex = indices[0];
      const group = namespace.createLayerGroup(this.uniqueName("Group"));
      group.children = indices.map((index) => collection[index]);
      [...indices].reverse().forEach((index) => collection.splice(index, 1));
      collection.splice(insertionIndex, 0, group);
      this.selectedIds = new Set([group.id]);
      this.notify({ type: "group", ids: [group.id] });
      return true;
    }

    /** Replace a selected group with its children without changing their order. */
    ungroupSelected() {
      const id = [...this.selectedIds][0];
      const found = namespace.findDocumentNode(this.document, id);
      if (!found || found.node.kind !== "group" || found.node.locked) return false;
      found.collection.splice(found.index, 1, ...(found.node.children || []));
      this.selectedIds = new Set((found.node.children || []).map((node) => node.id));
      this.notify({ type: "ungroup", ids: [...this.selectedIds] });
      return true;
    }

    /** Move selected layer-panel rows to a before, after, or inside destination. */
    moveItems(sourceIds, targetId, placement = "before") {
      const ids = [...new Set(sourceIds || [])];
      if (!ids.length || ids.includes(targetId) || !["before", "after", "inside"].includes(placement)) return false;
      const objectSources = ids.map((id) => namespace.findDocumentObject(this.document, id));
      const nodeSources = ids.map((id) => namespace.findDocumentNode(this.document, id));
      if (objectSources.every(Boolean)) return this.moveObjects(objectSources, targetId, placement);
      if (nodeSources.every(Boolean)) return this.moveHierarchyNodes(nodeSources, targetId, placement);
      return false;
    }

    /** Move hierarchy nodes across root and group collections while preserving panel order. */
    moveHierarchyNodes(sources, targetId, placement) {
      const target = namespace.findDocumentNode(this.document, targetId);
      if (!target || (placement === "inside" && target.node.kind !== "group")) return false;
      if (sources.some((source) => namespace.isCanvasBackgroundLayer(source.node))) return false;
      if (namespace.isCanvasBackgroundLayer(target.node) && placement !== "before") return false;
      const selectedIds = new Set(sources.map((source) => source.node.id));
      const topLevelSources = sources.filter((source) => {
        let parent = source.parent;
        while (parent) {
          if (selectedIds.has(parent.id)) return false;
          parent = namespace.findDocumentNode(this.document, parent.id)?.parent;
        }
        return true;
      });
      for (const source of topLevelSources) {
        if (source.node.kind !== "group") continue;
        let containsTarget = false;
        namespace.walkDocumentNodes({ nodes: source.node.children || [] }, (node) => { if (node.id === targetId) containsTarget = true; });
        if (containsTarget) return false;
      }
      const panelOrder = new Map();
      namespace.walkDocumentNodes(this.document, (node) => panelOrder.set(node.id, panelOrder.size));
      const ordered = [...topLevelSources].sort((left, right) => panelOrder.get(left.node.id) - panelOrder.get(right.node.id)).map((source) => source.node);
      [...topLevelSources].sort((left, right) => right.index - left.index).forEach((source) => source.collection.splice(source.index, 1));
      const refreshed = namespace.findDocumentNode(this.document, targetId);
      if (!refreshed) return false;
      const collection = placement === "inside" ? refreshed.node.children : refreshed.collection;
      const insertionIndex = placement === "inside" ? 0 : refreshed.index + (placement === "after" ? 1 : 0);
      collection.splice(insertionIndex, 0, ...ordered);
      this.selectedIds = new Set(ordered.map((node) => node.id));
      this.notify({ type: "reorder", ids: [...this.selectedIds] });
      return true;
    }

    /** Move objects between layers, groups, and the document root while preserving panel order. */
    moveObjects(sources, targetId, placement) {
      if (sources.some((source) => source.object.locked || source.layer?.locked || source.parent?.locked)) return false;
      const targetObject = namespace.findDocumentObject(this.document, targetId);
      const targetNodeResult = namespace.findDocumentNode(this.document, targetId);
      const targetNode = targetNodeResult?.node;
      if (!targetObject && !targetNode) return false;
      if (targetNode?.locked || targetObject?.locked || targetObject?.parent?.locked) return false;
      if (placement === "inside" && targetNode?.kind !== "layer" && targetNode?.kind !== "group") return false;
      if (namespace.isCanvasBackgroundLayer(targetNode) && placement !== "before") return false;
      const objectOrder = new Map();
      namespace.walkDocumentObjects(this.document, (object) => objectOrder.set(object.id, objectOrder.size));
      const ordered = [...sources].sort((left, right) => objectOrder.get(left.object.id) - objectOrder.get(right.object.id)).map((source) => source.object);
      const removals = new Map();
      sources.forEach((source) => {
        if (!removals.has(source.collection)) removals.set(source.collection, []);
        removals.get(source.collection).push(source.index);
      });
      removals.forEach((indices, collection) => [...indices].sort((left, right) => right - left).forEach((index) => collection.splice(index, 1)));
      const refreshedObject = namespace.findDocumentObject(this.document, targetId);
      const refreshedNode = namespace.findDocumentNode(this.document, targetId);
      let collection;
      let insertionIndex;
      let targetLayer = null;
      if (refreshedObject) {
        collection = refreshedObject.collection;
        insertionIndex = refreshedObject.index + (placement === "after" ? 1 : 0);
        targetLayer = refreshedObject.layer;
      } else if (placement === "inside" && refreshedNode?.node.kind === "layer") {
        collection = refreshedNode.node.objects;
        insertionIndex = 0;
        targetLayer = refreshedNode.node;
      } else if (placement === "inside" && refreshedNode?.node.kind === "group") {
        collection = refreshedNode.node.children;
        insertionIndex = 0;
      } else if (refreshedNode) {
        collection = refreshedNode.collection;
        insertionIndex = refreshedNode.index + (placement === "after" ? 1 : 0);
      }
      if (!collection || !Number.isInteger(insertionIndex)) return false;
      collection.splice(insertionIndex, 0, ...ordered);
      if (targetLayer) this.document.activeLayerId = targetLayer.id;
      this.selectedIds = new Set(ordered.map((object) => object.id));
      this.notify({ type: "reorder", ids: [...this.selectedIds] });
      return true;
    }

    /** Move one hierarchy node before another. */
    moveNode(sourceId, targetId) { return this.moveItems([sourceId], targetId, "before"); }

    /** Move selected hierarchy nodes as one stable block before another. */
    moveNodes(sourceIds, targetId) { return this.moveItems(sourceIds, targetId, "before"); }

    /** Append an object to a target layer and select it. */
    addObject(object, layerId = this.document.activeLayerId) {
      let layer = namespace.findDocumentNode(this.document, layerId)?.node;
      if (layer?.kind !== "layer" || layer.locked || !layer.visible) layer = this.addLayer(object.name || "Layer");
      layer.objects = layer.objects || [];
      layer.objects.unshift(object);
      this.document.activeLayerId = layer.id;
      this.selectedIds = new Set([object.id]);
      this.notify({ type: "add-object", ids: [object.id], layerId: layer.id });
      return object;
    }

    /** Create and add a raster object backed by immutable asset pixels. */
    addRasterObject(imageData, rect, options = {}) {
      const assetId = this.addRasterAsset(imageData);
      const object = namespace.createContentObject("raster", { assetId }, {
        name: options.name || "Raster content", bounds: { ...rect },
        transform: { x: rect.x, y: rect.y, scaleX: 1, scaleY: 1, rotation: Number(options.rotation) || 0 }
      });
      return this.addObject(object, options.layerId);
    }

    /** Change supported node/object properties through one validated path. */
    updateItem(id, patch) {
      const foundNode = namespace.findDocumentNode(this.document, id)?.node;
      const foundObject = namespace.findDocumentObject(this.document, id)?.object;
      const item = foundNode || foundObject;
      if (!item) return false;
      if (namespace.isCanvasBackgroundLayer(item)) return false;
      if (item.locked && Object.keys(patch).some((key) => key !== "visible" && key !== "locked")) return false;
      ["name", "visible", "locked", "opacity"].forEach((key) => {
        if (!(key in patch)) return;
        item[key] = key === "opacity" ? Math.max(0, Math.min(1, Number(patch[key]))) : patch[key];
      });
      this.notify({ type: "update", ids: [id] });
      return true;
    }

    /** Remove selected objects and hierarchy nodes while preserving the canvas background. */
    deleteSelected() {
      const ids = new Set(this.selectedIds);
      let changed = false;
      namespace.walkDocumentNodes(this.document, (node) => {
        if (node.kind !== "layer") return;
        const before = (node.objects || []).length;
        node.objects = (node.objects || []).filter((object) => !ids.has(object.id) || object.locked);
        changed ||= before !== node.objects.length;
      });
      const removeNodes = (nodes) => nodes.filter((item) => {
        if (item.kind === "object") {
          if (ids.has(item.id) && !item.locked) { changed = true; return false; }
          return true;
        }
        if (ids.has(item.id) && !item.locked && !namespace.isCanvasBackgroundLayer(item)) { changed = true; return false; }
        if (item.kind === "group") item.children = removeNodes(item.children || []);
        return true;
      });
      this.document.nodes = removeNodes(this.document.nodes);
      namespace.normalizeCanvasBackgroundLayer(this.document);
      const active = this.activeLayer();
      this.document.activeLayerId = active?.id || this.document.nodes[0]?.id;
      this.selectedIds = new Set([this.document.activeLayerId].filter(Boolean));
      this.adjustmentTarget = null;
      if (changed) {
        this.pruneAssets();
        this.notify({ type: "delete" });
      }
      return changed;
    }

    /** Remove raster bytes no longer referenced by the current document. */
    pruneAssets() {
      const referenced = namespace.referencedAssetIds(this.document);
      [...this.assets.keys()].forEach((id) => { if (!referenced.has(id)) this.assets.delete(id); });
    }

    uniqueName(base) {
      const used = new Set();
      namespace.walkDocumentNodes(this.document, (node) => { if (node.kind !== "object") used.add(node.name); });
      if (!used.has(base)) return base;
      let index = 2;
      while (used.has(`${base} ${index}`)) index += 1;
      return `${base} ${index}`;
    }

    /** Replace the complete document during undo, redo, or project loading. */
    restore(snapshot) {
      namespace.validateImageDocument(snapshot.document);
      this.document = namespace.cloneImageDocument(snapshot.document);
      this.assets = new Map(snapshot.assets);
      this.selectedIds = new Set(snapshot.selectedIds || [this.document.activeLayerId]);
      this.adjustmentTarget = snapshot.adjustmentTarget ? { ...snapshot.adjustmentTarget } : null;
      this.notify({ type: "restore" });
    }

    /** Capture metadata and asset references for transactional history. */
    snapshot() {
      return { document: namespace.cloneImageDocument(this.document), assets: new Map(this.assets), selectedIds: [...this.selectedIds], adjustmentTarget: this.adjustmentTarget ? { ...this.adjustmentTarget } : null };
    }
  }

  Object.assign(namespace, { ImageEditorDocumentCommand, ImageEditorDocumentStore });
})(typeof window !== "undefined" ? window : globalThis);
