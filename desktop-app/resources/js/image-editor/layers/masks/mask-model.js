// Mask descriptors and hierarchy lookup for layered image documents.
(function (global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const MASK_TYPES = Object.freeze(["alpha", "vector", "luminance"]);

  /** Return the normalized mask descriptor stored on a mask group. */
  function getDescriptor(group) {
    const descriptor = group?.kind === "group" ? group.extensions?.maskGroup : null;
    if (!descriptor?.maskId) return null;
    return {
      maskId: String(descriptor.maskId),
      type: MASK_TYPES.includes(descriptor.type) ? descriptor.type : "alpha"
    };
  }

  /** Return whether a hierarchy group has a valid mask descriptor. */
  function isMaskGroup(group) { return !!getDescriptor(group); }

  /** Return the child currently used as a group's mask source. */
  function getMaskNode(group) {
    const descriptor = getDescriptor(group);
    return descriptor ? (group.children || []).find((child) => child.id === descriptor.maskId) || null : null;
  }

  function containsItem(node, itemId) {
    if (node?.id === itemId) return true;
    if (node?.kind === "layer") return (node.objects || []).some((object) => object.id === itemId);
    return node?.kind === "group" && (node.children || []).some((child) => containsItem(child, itemId));
  }

  /** Find the nearest mask group containing a hierarchy item. */
  function findContainingMaskGroup(document, itemId) {
    const visit = (nodes) => {
      for (const node of nodes || []) {
        if (node.kind !== "group") continue;
        const nested = visit(node.children || []);
        if (nested) return nested;
        if (isMaskGroup(node) && containsItem(node, itemId)) return node;
      }
      return null;
    };
    return visit(document?.nodes || []);
  }

  namespace.ImageEditorMaskModel = { MASK_TYPES, getDescriptor, isMaskGroup, getMaskNode, findContainingMaskGroup };
})(typeof window !== "undefined" ? window : globalThis);
