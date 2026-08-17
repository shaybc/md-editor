// Normalized non-destructive Miniature descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "miniature";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  /**
   * Create a complete Miniature descriptor from optional persisted values.
   * @param {object} effect - Persisted or newly entered shallow-focus values.
   * @returns {object} Valid descriptor suitable for rendering and storage.
   */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      focusPosition: clamp(effect.focusPosition, 0, 100, 50),
      focusWidth: clamp(effect.focusWidth, 2, 80, 20),
      transition: clamp(effect.transition, 1, 60, 18),
      angle: clamp(effect.angle, -45, 45, 0),
      blurRadius: clamp(effect.blurRadius, 0, 40, 12),
      distortion: clamp(effect.distortion, -100, 100, 0),
      symmetricDistortion: effect.symmetricDistortion !== false,
      saturation: clamp(effect.saturation, -100, 100, 20)
    };
  }

  /** Return the normalized Miniature effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Miniature effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Miniature without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Miniature descriptors throughout a layered document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorMiniatureEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
