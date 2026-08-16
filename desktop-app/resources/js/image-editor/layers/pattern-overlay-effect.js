// Normalized non-destructive pattern-overlay descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "pattern-overlay";
  const PATTERN_TYPES = ["crosshatch", "halftone", "grain", "mosaic", "stained-glass", "pointillize"];

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback;
  }

  /** Create a complete pattern-overlay descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || "effect-" + Date.now(),
      type: TYPE,
      enabled: effect.enabled !== false,
      blendMode: ["normal", "screen", "multiply"].includes(effect.blendMode) ? effect.blendMode : "normal",
      patternType: PATTERN_TYPES.includes(effect.patternType) ? effect.patternType : "crosshatch",
      foregroundColor: normalizeColor(effect.foregroundColor, "#000000"),
      backgroundColor: normalizeColor(effect.backgroundColor, "#FFFFFF"),
      opacity: clamp(effect.opacity, 0, 1, 1),
      scale: clamp(effect.scale, 10, 400, 100),
      angle: clamp(effect.angle, 0, 359, 0),
      density: clamp(effect.density, 10, 90, 50),
      offsetX: clamp(effect.offsetX, -4096, 4096, 0),
      offsetY: clamp(effect.offsetY, -4096, 4096, 0),
      linkWithLayer: effect.linkWithLayer !== false
    };
  }

  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  function upsert(layer, effect) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const overlay = node.effects.find((entry) => entry?.type === TYPE);
      if (overlay) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(overlay)];
    });
    return document;
  }

  namespace.ImageEditorPatternOverlayEffect = Object.freeze({ TYPE, PATTERN_TYPES, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
