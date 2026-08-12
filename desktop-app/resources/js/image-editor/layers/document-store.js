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
      namespace.validateImageDocument(document);
      this.document = namespace.cloneImageDocument(document);
      this.assets = new Map(assets);
      this.selectedIds = new Set([this.document.activeLayerId].filter(Boolean));
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
      if (object) this.document.activeLayerId = object.layer.id;
      else if (node?.kind === "layer") this.document.activeLayerId = node.id;
      this.notify({ type: "selection" });
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

    /** Add a hierarchy group above the active layer. */
    addGroup(name = "Group") {
      const group = namespace.createLayerGroup(this.uniqueName(name));
      const target = namespace.findDocumentNode(this.document, this.document.activeLayerId);
      if (target) target.collection.splice(target.index, 0, group);
      else this.document.nodes.unshift(group);
      this.selectedIds = new Set([group.id]);
      this.notify({ type: "add-group", ids: [group.id] });
      return group;
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
          copy.name = this.uniqueObjectName(objectResult.layer, `${copy.name} copy`);
          objectResult.layer.objects.splice(objectResult.index, 0, copy);
          duplicated.push(copy.id);
          return;
        }
        const nodeResult = namespace.findDocumentNode(this.document, id);
        if (!nodeResult) return;
        const copy = namespace.cloneImageDocument(nodeResult.node);
        this.refreshNodeIds(copy);
        copy.name = this.uniqueName(`${copy.name} copy`);
        nodeResult.collection.splice(nodeResult.index, 0, copy);
        duplicated.push(copy.id);
      });
      if (!duplicated.length) return false;
      this.selectedIds = new Set(duplicated);
      this.notify({ type: "duplicate", ids: duplicated });
      return true;
    }

    refreshNodeIds(node) {
      node.id = namespace.createImageEditorId(node.kind);
      (node.objects || []).forEach((object) => { object.id = namespace.createImageEditorId("object"); });
      (node.children || []).forEach((child) => this.refreshNodeIds(child));
    }

    uniqueObjectName(layer, base) {
      const used = new Set((layer.objects || []).map((object) => object.name));
      if (!used.has(base)) return base;
      let index = 2;
      while (used.has(`${base} ${index}`)) index += 1;
      return `${base} ${index}`;
    }

    /** Group selected sibling hierarchy nodes while preserving their panel order. */
    groupSelected() {
      const locations = [...this.selectedIds].map((id) => namespace.findDocumentNode(this.document, id)).filter(Boolean);
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

    /** Move one hierarchy node before another while rejecting recursive group drops. */
    moveNode(sourceId, targetId) {
      if (sourceId === targetId) return false;
      const source = namespace.findDocumentNode(this.document, sourceId);
      const target = namespace.findDocumentNode(this.document, targetId);
      if (!source || !target) return false;
      if (source.node.kind === "group") {
        let containsTarget = false;
        namespace.walkDocumentNodes({ nodes: source.node.children || [] }, (node) => { if (node.id === targetId) containsTarget = true; });
        if (containsTarget) return false;
      }
      source.collection.splice(source.index, 1);
      const refreshedTarget = namespace.findDocumentNode(this.document, targetId);
      refreshedTarget.collection.splice(refreshedTarget.index, 0, source.node);
      this.notify({ type: "reorder", ids: [sourceId] });
      return true;
    }

    /** Move selected sibling hierarchy rows as one stable block before a target row. */
    moveNodes(sourceIds, targetId) {
      const ids = [...new Set(sourceIds || [])].filter((id) => id !== targetId);
      if (!ids.length) return false;
      const sources = ids.map((id) => namespace.findDocumentNode(this.document, id)).filter(Boolean);
      const target = namespace.findDocumentNode(this.document, targetId);
      if (!target || sources.length !== ids.length || sources.some((source) => source.collection !== sources[0].collection || source.collection !== target.collection)) return false;
      for (const source of sources) {
        if (source.node.kind !== "group") continue;
        let containsTarget = false;
        namespace.walkDocumentNodes({ nodes: source.node.children || [] }, (node) => { if (node.id === targetId) containsTarget = true; });
        if (containsTarget) return false;
      }
      const ordered = sources.sort((a, b) => a.index - b.index).map((source) => source.node);
      [...sources].sort((a, b) => b.index - a.index).forEach((source) => source.collection.splice(source.index, 1));
      const refreshed = namespace.findDocumentNode(this.document, targetId);
      refreshed.collection.splice(refreshed.index, 0, ...ordered);
      this.selectedIds = new Set(ordered.map((node) => node.id));
      this.notify({ type: "reorder", ids: [...this.selectedIds] });
      return true;
    }

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
      if (item.locked && Object.keys(patch).some((key) => key !== "visible" && key !== "locked")) return false;
      ["name", "visible", "locked", "opacity"].forEach((key) => {
        if (!(key in patch)) return;
        item[key] = key === "opacity" ? Math.max(0, Math.min(1, Number(patch[key]))) : patch[key];
      });
      this.notify({ type: "update", ids: [id] });
      return true;
    }

    /** Remove selected objects and hierarchy nodes, retaining at least one layer. */
    deleteSelected() {
      const ids = new Set(this.selectedIds);
      let changed = false;
      namespace.walkDocumentNodes(this.document, (node) => {
        if (node.kind !== "layer") return;
        const before = node.objects.length;
        node.objects = node.objects.filter((object) => !ids.has(object.id) || object.locked);
        changed ||= before !== node.objects.length;
      });
      const removeNodes = (nodes) => nodes.filter((node) => {
        if (ids.has(node.id) && !node.locked) { changed = true; return false; }
        if (node.kind === "group") node.children = removeNodes(node.children || []);
        return true;
      });
      this.document.nodes = removeNodes(this.document.nodes);
      if (!this.document.nodes.some((node) => node.kind === "layer") && !this.document.nodes.some((node) => node.kind === "group" && node.children?.length)) this.document.nodes.push(namespace.createContentLayer("Layer"));
      const active = this.activeLayer();
      this.document.activeLayerId = active?.id || this.document.nodes[0]?.id;
      this.selectedIds = new Set([this.document.activeLayerId].filter(Boolean));
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
      namespace.walkDocumentNodes(this.document, (node) => used.add(node.name));
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
      this.notify({ type: "restore" });
    }

    /** Capture metadata and asset references for transactional history. */
    snapshot() {
      return { document: namespace.cloneImageDocument(this.document), assets: new Map(this.assets), selectedIds: [...this.selectedIds] };
    }
  }

  Object.assign(namespace, { ImageEditorDocumentCommand, ImageEditorDocumentStore });
})(typeof window !== "undefined" ? window : globalThis);
