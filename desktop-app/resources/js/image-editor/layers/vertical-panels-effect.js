// Normalized non-destructive Vertical Panels descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "vertical-panels";

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
   * Create a complete Vertical Panels descriptor from optional persisted values.
   * @param {object} effect - Persisted or newly entered panel values.
   * @returns {object} Valid descriptor suitable for rendering and storage.
   */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      panelCount: Math.round(clamp(effect.panelCount, 2, 12, 7)),
      gap: clamp(effect.gap, 0, 40, 8),
      stagger: clamp(effect.stagger, 0, 80, 22),
      rotation: clamp(effect.rotation, 0, 15, 4),
      borderWidth: clamp(effect.borderWidth, 0, 24, 5),
      borderColor: normalizeColor(effect.borderColor, "#FFFFFF"),
      shadowStrength: clamp(effect.shadowStrength, 0, 1, 0.55),
      shadowBlur: clamp(effect.shadowBlur, 0, 40, 12),
      backgroundColor: normalizeColor(effect.backgroundColor, "#FFFFFF"),
      seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) >>> 0 : seedForId(id)
    };
  }

  /** Return the normalized Vertical Panels effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Vertical Panels effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Vertical Panels without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Vertical Panels descriptors throughout a layered document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorVerticalPanelsEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
