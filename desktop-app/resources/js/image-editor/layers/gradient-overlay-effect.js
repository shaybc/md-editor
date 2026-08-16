// Normalized non-destructive gradient-overlay descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "gradient-overlay";
  const STYLES = ["linear", "radial", "angle", "reflected", "diamond"];

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback;
  }

  /** Create a complete gradient-overlay descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || "effect-" + Date.now(),
      type: TYPE,
      enabled: effect.enabled !== false,
      blendMode: ["normal", "screen", "multiply"].includes(effect.blendMode) ? effect.blendMode : "normal",
      startColor: normalizeColor(effect.startColor, "#000000"),
      endColor: normalizeColor(effect.endColor, "#FFFFFF"),
      opacity: clamp(effect.opacity, 0, 1, 1),
      style: STYLES.includes(effect.style) ? effect.style : "linear",
      angle: clamp(effect.angle, 0, 359, 90),
      scale: clamp(effect.scale, 10, 400, 100),
      reverse: effect.reverse === true,
      alignWithLayer: effect.alignWithLayer !== false,
      offsetX: clamp(effect.offsetX, -4096, 4096, 0),
      offsetY: clamp(effect.offsetY, -4096, 4096, 0)
    };
  }

  /** Return the normalized gradient overlay attached to a layer, if present. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's gradient overlay without changing its other effects. */
  function upsert(layer, effect) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove a layer's gradient overlay while preserving its other effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted gradient overlays throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const overlay = node.effects.find((entry) => entry?.type === TYPE);
      if (overlay) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(overlay)];
    });
    return document;
  }

  namespace.ImageEditorGradientOverlayEffect = Object.freeze({ TYPE, STYLES, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
