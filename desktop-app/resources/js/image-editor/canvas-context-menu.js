// Right-click actions for canvas objects and pixel-marquee selections.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const MENU_ITEMS = [
    { id: "copy", icon: "bi-copy", label: "Copy" },
    { id: "paste", icon: "bi-clipboard", label: "Paste" },
    { id: "delete", icon: "bi-trash", label: "Delete", danger: true },
    { id: "lift-new-layer", icon: "bi-layer-forward", label: "Lift to new layer" },
    { separator: true },
    { id: "crop", icon: "bi-crop", label: "Crop image" },
    { id: "flip-horizontal", icon: "bi-symmetry-vertical", label: "Flip horizontal" },
    { id: "flip-vertical", icon: "bi-symmetry-horizontal", label: "Flip vertical" },
    { separator: true },
    { id: "select-all", icon: "bi-bounding-box", label: "Select all" },
    { id: "deselect", icon: "bi-x-square", label: "Deselect" },
    { id: "inverse-select", icon: "bi-intersect", label: "Inverse select" },
    { separator: true },
    { icon: "bi-stars", label: "Layer Style", children: [
      { id: "edit-blending-options", icon: "bi-layers", label: "Blending Options…" },
      { id: "edit-bevel-emboss", icon: "bi-badge-3d", label: "Bevel & Emboss…" },
      { separator: true },
      { id: "edit-drop-shadow", icon: "bi-square-fill", label: "Drop Shadow…" },
      { id: "edit-inner-shadow", icon: "bi-square", label: "Inner Shadow…" },
      { separator: true },
      { id: "edit-inner-glow", icon: "bi-brightness-high", label: "Inner Glow…" },
      { id: "edit-outer-glow", icon: "bi-brightness-high-fill", label: "Outer Glow…" },
      { separator: true },
      { id: "edit-color-overlay", icon: "bi-palette-fill", label: "Color Overlay…" },
      { id: "edit-gradient-overlay", icon: "bi-circle-half", label: "Gradient Overlay…" },
      { id: "edit-pattern-overlay", icon: "bi-grid-3x3-gap", label: "Pattern Overlay…" },
      { id: "apply-grayscale", icon: "bi-circle-half", label: "Grayscale" },
      { separator: true },
      { icon: "bi-x-square", label: "Remove", children: [
        { id: "remove-bevel-emboss", icon: "bi-badge-3d", label: "Bevel & Emboss" },
        { id: "remove-drop-shadow", icon: "bi-square-fill", label: "Drop Shadow" },
        { id: "remove-inner-shadow", icon: "bi-square", label: "Inner Shadow" },
        { id: "remove-inner-glow", icon: "bi-brightness-high", label: "Inner Glow" },
        { id: "remove-outer-glow", icon: "bi-brightness-high-fill", label: "Outer Glow" },
        { id: "remove-color-overlay", icon: "bi-palette-fill", label: "Color Overlay" },
        { id: "remove-gradient-overlay", icon: "bi-circle-half", label: "Gradient Overlay" },
        { id: "remove-pattern-overlay", icon: "bi-grid-3x3-gap", label: "Pattern Overlay" },
        { id: "remove-grayscale", icon: "bi-circle-half", label: "Grayscale" }
      ] }
    ] }
  ];

  /** Reuse the application context-menu surface with canvas-specific actions. */
  class ImageEditorCanvasContextMenu {
    constructor() {
      this.menu = new namespace.ImageEditorLayerContextMenu();
      this.menu.element.classList.add("image-editor-canvas-context-menu");
    }

    show(x, y, capabilities, onAction) {
      const resolveItems = (items) => items.map((item) => {
        if (item.separator) return item;
        const children = Array.isArray(item.children) ? resolveItems(item.children) : undefined;
        return {
          ...item,
          ...(children ? { children } : {}),
          disabled: capabilities?.[item.id] === false || (children && children.every((child) => child.disabled))
        };
      });
      const items = resolveItems(MENU_ITEMS);
      this.menu.show(x, y, items, onAction);
    }

    hide() { this.menu.hide(); }
    destroy() { this.menu.destroy(); }
  }

  /** Return the rectangular canvas regions outside a marquee. */
  function inverseSelectionRects(rect, bounds) {
    if (!rect || !bounds) return [];
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    return [
      { x: 0, y: 0, width: bounds.width, height: rect.y },
      { x: 0, y: bottom, width: bounds.width, height: bounds.height - bottom },
      { x: 0, y: rect.y, width: rect.x, height: rect.height },
      { x: right, y: rect.y, width: bounds.width - right, height: rect.height }
    ].filter((region) => region.width > 0 && region.height > 0);
  }

  /** Return whether a point belongs to the active pixel selection. */
  function selectionContainsPoint(selection, point) {
    return !!selection?.hasSelection && selection.contains(point);
  }

  /** Flip an ImageData payload without changing its dimensions. */
  function flipImageData(imageData, horizontal) {
    if (!imageData) return null;
    const result = new ImageData(imageData.width, imageData.height);
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const sourceX = horizontal ? imageData.width - 1 - x : x;
        const sourceY = horizontal ? y : imageData.height - 1 - y;
        const source = (sourceY * imageData.width + sourceX) * 4;
        const destination = (y * imageData.width + x) * 4;
        result.data.set(imageData.data.subarray(source, source + 4), destination);
      }
    }
    return result;
  }

  namespace.ImageEditorCanvasContextMenu = ImageEditorCanvasContextMenu;
  namespace.imageEditorInverseSelectionRects = inverseSelectionRects;
  namespace.imageEditorSelectionContainsPoint = selectionContainsPoint;
  namespace.flipImageEditorImageData = flipImageData;
})(typeof window !== "undefined" ? window : globalThis);
