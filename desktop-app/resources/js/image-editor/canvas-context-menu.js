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
    { id: "use-as-mask", icon: "bi-layers-half", label: "Use as mask" },
    { id: "set-mask-type", icon: "bi-sliders", label: "Set mask type", children: [
      { id: "set-mask-type-alpha", icon: "bi-circle", label: "Alpha" },
      { id: "set-mask-type-vector", icon: "bi-vector-pen", label: "Vector" },
      { id: "set-mask-type-luminance", icon: "bi-brightness-high", label: "Luminance" }
    ] },
    { id: "remove-mask", icon: "bi-x-square", label: "Remove mask" },
    { separator: true },
    { id: "select-all", icon: "bi-bounding-box", label: "Select all" },
    { id: "deselect", icon: "bi-x-square", label: "Deselect" },
    { id: "inverse-select", icon: "bi-intersect", label: "Inverse select" },
    { separator: true },
    { effectIcon: "effects", label: "Layer Style", children: [
      { id: "edit-blending-options", effectIcon: "compositing", label: "Layer Compositing…" },
      { id: "edit-bevel-emboss", effectIcon: "raised-edge", label: "Raised Edge…" },
      { separator: true },
      { id: "edit-drop-shadow", effectIcon: "cast-shadow", label: "Cast Shadow…" },
      { id: "edit-inner-shadow", effectIcon: "inset-shadow", label: "Inset Shadow…" },
      { separator: true },
      { id: "edit-inner-glow", effectIcon: "inner-aura", label: "Inner Aura…" },
      { id: "edit-outer-glow", effectIcon: "outer-aura", label: "Outer Aura…" },
      { separator: true },
      { id: "edit-color-overlay", effectIcon: "color-coat", label: "Color Coat…" },
      { id: "edit-gradient-overlay", effectIcon: "gradient-coat", label: "Gradient Coat…" },
      { id: "edit-pattern-overlay", effectIcon: "pattern-coat", label: "Pattern Coat…" },
      { id: "edit-blur", effectIcon: "blur", label: "Blur\u2026" },
      { id: "edit-grain", effectIcon: "grain", label: "Grain\u2026" },
      { id: "edit-newspaper", effectIcon: "newspaper", label: "Newspaper\u2026" },
      { id: "edit-painted-texture", effectIcon: "painted-texture", label: "Painted Texture\u2026" },
      { id: "edit-retro-3d", effectIcon: "retro-3d", label: "Retro 3D\u2026" },
      { id: "edit-snow", effectIcon: "snow", label: "Snow\u2026" },
      { id: "edit-rain", effectIcon: "rain", label: "Rain\u2026" },
      { id: "edit-rainbow", effectIcon: "rainbow", label: "Rainbow\u2026" },
      { id: "edit-spotlight", effectIcon: "spotlight", label: "Spotlight\u2026" },
      { id: "edit-vignette", effectIcon: "vignette", label: "Vignette\u2026" },
      { id: "edit-vortex", effectIcon: "vortex", label: "Vortex\u2026" },
      { id: "edit-ripple-field", effectIcon: "ripple-field", label: "Ripple Field\u2026" },
      { id: "edit-flare", effectIcon: "flare", label: "Flare\u2026" },
      { id: "edit-gust", effectIcon: "gust", label: "Gust\u2026" },
      { id: "apply-grayscale", effectIcon: "grayscale", label: "Grayscale" },
      { separator: true },
      { icon: "bi-x-square", label: "Remove", children: [
        { id: "remove-bevel-emboss", effectIcon: "raised-edge", label: "Raised Edge" },
        { id: "remove-drop-shadow", effectIcon: "cast-shadow", label: "Cast Shadow" },
        { id: "remove-inner-shadow", effectIcon: "inset-shadow", label: "Inset Shadow" },
        { id: "remove-inner-glow", effectIcon: "inner-aura", label: "Inner Aura" },
        { id: "remove-outer-glow", effectIcon: "outer-aura", label: "Outer Aura" },
        { id: "remove-color-overlay", effectIcon: "color-coat", label: "Color Coat" },
        { id: "remove-gradient-overlay", effectIcon: "gradient-coat", label: "Gradient Coat" },
        { id: "remove-pattern-overlay", effectIcon: "pattern-coat", label: "Pattern Coat" },
        { id: "remove-blur", effectIcon: "blur", label: "Blur" },
        { id: "remove-grain", effectIcon: "grain", label: "Grain" },
        { id: "remove-newspaper", effectIcon: "newspaper", label: "Newspaper" },
        { id: "remove-painted-texture", effectIcon: "painted-texture", label: "Painted Texture" },
        { id: "remove-retro-3d", effectIcon: "retro-3d", label: "Retro 3D" },
        { id: "remove-snow", effectIcon: "snow", label: "Snow" },
        { id: "remove-rain", effectIcon: "rain", label: "Rain" },
        { id: "remove-rainbow", effectIcon: "rainbow", label: "Rainbow" },
        { id: "remove-spotlight", effectIcon: "spotlight", label: "Spotlight" },
        { id: "remove-vignette", effectIcon: "vignette", label: "Vignette" },
        { id: "remove-vortex", effectIcon: "vortex", label: "Vortex" },
        { id: "remove-ripple-field", effectIcon: "ripple-field", label: "Ripple Field" },
        { id: "remove-flare", effectIcon: "flare", label: "Flare" },
        { id: "remove-gust", effectIcon: "gust", label: "Gust" },
        { id: "remove-grayscale", effectIcon: "grayscale", label: "Grayscale" }
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
