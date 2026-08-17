// Normalized non-destructive Polaroids descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "polaroids";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
  }

  function seedForId(id) {
    return [...String(id || TYPE)].reduce((seed, character) => ((seed * 33) ^ character.charCodeAt(0)) >>> 0, 5381);
  }

  /**
   * Create a complete Polaroids descriptor from optional persisted values.
   * @param {object} effect - Persisted or newly entered collage values.
   * @returns {object} Valid descriptor suitable for rendering and storage.
   */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      cardCount: Math.round(clamp(effect.cardCount, 3, 20, 10)),
      cardSize: clamp(effect.cardSize, 12, 45, 27),
      scatter: clamp(effect.scatter, 0, 100, 34),
      rotation: clamp(effect.rotation, 0, 25, 9),
      frameWidth: clamp(effect.frameWidth, 2, 24, 8),
      bottomBorder: clamp(effect.bottomBorder, 2, 36, 16),
      frameColor: normalizeColor(effect.frameColor, "#FFFFFF"),
      shadowStrength: clamp(effect.shadowStrength, 0, 1, 0.42),
      shadowBlur: clamp(effect.shadowBlur, 0, 40, 12),
      backgroundColor: normalizeColor(effect.backgroundColor, "#1F1F1F"),
      seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) >>> 0 : seedForId(id)
    };
  }

  /** Return the normalized Polaroids effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Polaroids effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Polaroids without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Polaroids descriptors throughout a layered document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorPolaroidsEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
