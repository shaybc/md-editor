// Transaction-ready hierarchy operations for creating and editing masks.
(function (global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  function hierarchyLocation(store, id) {
    const node = namespace.findDocumentNode(store.document, id);
    if (node) return node;
    const object = namespace.findDocumentObject(store.document, id);
    if (!object) return null;
    if (object.layer) return namespace.findDocumentNode(store.document, object.layer.id);
    return { node: object.object, parent: object.parent, index: object.index, collection: object.collection };
  }

  function selectedLocations(store, ids = [...store.selectedIds]) {
    const unique = [];
    ids.forEach((id) => {
      const location = hierarchyLocation(store, id);
      if (location && !namespace.isCanvasBackgroundLayer(location.node) && !unique.some((item) => item.node.id === location.node.id)) unique.push(location);
    });
    return unique;
  }

  function selectedMaskGroups(store, ids = [...store.selectedIds]) {
    const groups = [];
    ids.forEach((id) => {
      const node = namespace.findDocumentNode(store.document, id)?.node;
      const group = namespace.ImageEditorMaskModel.isMaskGroup(node)
        ? node
        : namespace.ImageEditorMaskModel.findContainingMaskGroup(store.document, id);
      if (group && !groups.some((item) => item.id === group.id)) groups.push(group);
    });
    return groups;
  }

  /** Describe which mask actions are valid for the current hierarchy selection. */
  function getState(store, ids = [...store.selectedIds]) {
    const locations = selectedLocations(store, ids);
    const sameCollection = locations.length > 1 && locations.every((item) => item.collection === locations[0].collection);
    const maskCandidate = sameCollection ? [...locations].sort((left, right) => right.index - left.index)[0]?.node : null;
    const groups = selectedMaskGroups(store, ids);
    return {
      canCreate: sameCollection && maskCandidate?.kind !== "adjustment" && locations.every((item) => !item.node.locked && !namespace.ImageEditorMaskModel.isMaskGroup(item.node)),
      canChangeType: groups.length > 0 && groups.every((group) => !group.locked),
      canRemove: groups.length > 0 && groups.every((group) => !group.locked),
      groups
    };
  }

  /** Group selected siblings and use the bottom selected item as a non-destructive mask. */
  function create(store) {
    const locations = selectedLocations(store);
    if (!getState(store).canCreate) return false;
    const collection = locations[0].collection;
    const indices = locations.map((item) => item.index).sort((a, b) => a - b);
    const children = indices.map((index) => collection[index]);
    const mask = children.at(-1);
    const group = namespace.createLayerGroup(store.uniqueName("Mask group"));
    group.children = children;
    group.extensions.maskGroup = { maskId: mask.id, type: "alpha" };
    [...indices].reverse().forEach((index) => collection.splice(index, 1));
    collection.splice(indices[0], 0, group);
    store.selectedIds = new Set([group.id]);
    store.notify({ type: "create-mask", ids: [group.id] });
    return true;
  }

  /** Change the selected mask groups to Alpha, Vector, or Luminance behavior. */
  function setType(store, type) {
    if (!namespace.ImageEditorMaskModel.MASK_TYPES.includes(type)) return false;
    const state = getState(store);
    if (!state.canChangeType) return false;
    state.groups.forEach((group) => { group.extensions.maskGroup.type = type; });
    store.notify({ type: "change-mask-type", ids: state.groups.map((group) => group.id) });
    return true;
  }

  /** Remove selected mask groups while preserving their children and panel order. */
  function remove(store) {
    const state = getState(store);
    if (!state.canRemove) return false;
    const selected = [];
    state.groups.forEach((group) => {
      const location = namespace.findDocumentNode(store.document, group.id);
      if (!location) return;
      const children = group.children || [];
      location.collection.splice(location.index, 1, ...children);
      selected.push(...children.map((child) => child.id));
    });
    if (!selected.length) return false;
    store.selectedIds = new Set(selected);
    store.notify({ type: "remove-mask", ids: selected });
    return true;
  }

  namespace.ImageEditorMaskOperations = { getState, create, setType, remove };
})(typeof window !== "undefined" ? window : globalThis);
