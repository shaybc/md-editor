// Normalized non-destructive Sunset descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "sunset";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
  }

  /**
   * Create a complete warm tonal-map descriptor from optional persisted values.
   * @param {object} effect - Persisted or newly entered Sunset values.
   * @returns {object} Valid Sunset descriptor suitable for rendering and storage.
   */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      shadowColor: normalizeColor(effect.shadowColor, "#F00F0F"),
      highlightColor: normalizeColor(effect.highlightColor, "#F5DC0A"),
      strength: clamp(effect.strength, 0, 1, 0.5),
      balance: clamp(effect.balance, 0.1, 0.9, 0.5),
      contrast: clamp(effect.contrast, 0, 1, 0.3),
      saturation: clamp(effect.saturation, 0, 1, 0.25)
    };
  }

  /** Return the normalized Sunset effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Sunset effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Sunset without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Sunset descriptors throughout a layered document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorSunsetEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
