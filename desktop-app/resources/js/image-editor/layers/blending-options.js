(function (global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const MODE_GROUPS = Object.freeze([
    { label: "Normal", modes: [["normal", "Normal"], ["dissolve", "Dissolve"]] },
    { label: "Darken", modes: [["darken", "Darken"], ["multiply", "Multiply"], ["color-burn", "Color Burn"], ["linear-burn", "Linear Burn"], ["darker-color", "Darker Color"]] },
    { label: "Lighten", modes: [["lighten", "Lighten"], ["screen", "Screen"], ["color-dodge", "Color Dodge"], ["linear-dodge", "Linear Dodge (Add)"], ["lighter-color", "Lighter Color"]] },
    { label: "Contrast", modes: [["overlay", "Overlay"], ["soft-light", "Soft Light"], ["hard-light", "Hard Light"], ["vivid-light", "Vivid Light"], ["linear-light", "Linear Light"], ["pin-light", "Pin Light"], ["hard-mix", "Hard Mix"]] },
    { label: "Comparative", modes: [["difference", "Difference"], ["exclusion", "Exclusion"]] },
    { label: "Color", modes: [["hue", "Hue"], ["saturation", "Saturation"], ["color", "Color"], ["luminosity", "Luminosity"]] }
  ]);
  const SUPPORTED_MODES = new Set(MODE_GROUPS.flatMap((group) => group.modes.map(([value]) => value)));

  function clampOpacity(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  }

  /** Normalize persisted layer blending settings and legacy documents. */
  function normalize(settings = {}) {
    return {
      blendMode: SUPPORTED_MODES.has(settings.blendMode) ? settings.blendMode : "normal",
      opacity: clampOpacity(settings.opacity),
      fillOpacity: clampOpacity(settings.fillOpacity)
    };
  }

  function apply(layer, settings) {
    if (!layer || layer.kind !== "layer") return false;
    const next = normalize(settings);
    const changed = layer.blendMode !== next.blendMode || layer.opacity !== next.opacity || layer.fillOpacity !== next.fillOpacity;
    layer.blendMode = next.blendMode;
    layer.opacity = next.opacity;
    layer.fillOpacity = next.fillOpacity;
    return changed;
  }

  function normalizeDocument(document) {
    const visit = (nodes) => (nodes || []).forEach((node) => {
      if (node.kind === "layer") apply(node, node);
      if (node.kind === "group") visit(node.children);
    });
    visit(document?.nodes);
    return document;
  }

  namespace.ImageEditorBlendingOptions = { MODE_GROUPS, SUPPORTED_MODES, clampOpacity, normalize, apply, normalizeDocument };
})(typeof window !== "undefined" ? window : globalThis);
