// Normalized non-destructive color-overlay descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "color-overlay";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : "#FF0000";
  }

  /** Create a complete color-overlay descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      blendMode: ["normal", "screen", "multiply"].includes(effect.blendMode) ? effect.blendMode : "normal",
      color: normalizeColor(effect.color),
      opacity: clamp(effect.opacity, 0, 1, 1)
    };
  }

  /** Return the normalized color overlay currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single color-overlay effect. */
  function upsert(layer, effect) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove the color-overlay effect without changing other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted color-overlay descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const overlay = node.effects.find((entry) => entry?.type === TYPE);
      if (overlay) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(overlay)];
    });
    return document;
  }

  namespace.ImageEditorColorOverlayEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
