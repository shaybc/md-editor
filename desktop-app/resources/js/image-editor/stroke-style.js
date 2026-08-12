// Global line-type presets for image-editor brushes and shape outlines.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const STROKE_TYPES = Object.freeze(["solid", "dash", "center", "dotted", "dash-dot", "dash-double-dot"]);
  const PATTERN_RATIOS = Object.freeze({
    solid: Object.freeze([]),
    dash: Object.freeze([4, 2]),
    center: Object.freeze([8, 2, 2, 2]),
    dotted: Object.freeze([0, 2.25]),
    "dash-dot": Object.freeze([6, 2, 0, 2]),
    "dash-double-dot": Object.freeze([6, 2, 0, 2, 0, 2])
  });

  /** Return a supported global stroke type, falling back to a solid line. */
  function normalizeStrokeType(strokeType) {
    return STROKE_TYPES.includes(strokeType) ? strokeType : "solid";
  }

  /** Resolve the canvas dash sequence for a stroke type and line width. */
  function strokeDashPattern(strokeType, lineWidth) {
    const scale = Math.max(1, Number(lineWidth) || 1);
    return PATTERN_RATIOS[normalizeStrokeType(strokeType)].map((part) => part * scale);
  }

  /** Apply one global stroke type to a canvas context at a continuous path distance. */
  function applyStrokeType(context, strokeType, lineWidth, pathDistance = 0) {
    const pattern = strokeDashPattern(strokeType, lineWidth);
    const distance = Math.max(0, Number(pathDistance) || 0);
    context.setLineDash(pattern);
    context.lineDashOffset = pattern.length && distance ? -distance : 0;
    return pattern;
  }

  Object.assign(namespace, { strokeTypes: STROKE_TYPES, normalizeStrokeType, strokeDashPattern, applyStrokeType });
})(typeof window !== "undefined" ? window : globalThis);
