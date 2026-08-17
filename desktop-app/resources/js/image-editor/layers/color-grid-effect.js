// Normalized non-destructive ColorGrid descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "color-grid";

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
   * Create a complete ColorGrid descriptor from optional persisted values.
   * @param {object} effect - Persisted or newly entered ColorGrid values.
   * @returns {object} Valid ColorGrid descriptor suitable for rendering and storage.
   */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      columns: Math.round(clamp(effect.columns, 2, 24, 10)),
      rows: Math.round(clamp(effect.rows, 2, 24, 10)),
      lineWidth: clamp(effect.lineWidth, 0, 20, 2),
      lineColor: normalizeColor(effect.lineColor, "#FFFFFF"),
      colorStrength: clamp(effect.colorStrength, 0, 1, 0.62),
      colorCoverage: clamp(effect.colorCoverage, 0, 1, 0.58),
      borderLightening: clamp(effect.borderLightening, 0, 1, 0.72),
      seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) >>> 0 : seedForId(id)
    };
  }

  /** Return the normalized ColorGrid effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single ColorGrid effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove ColorGrid without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted ColorGrid descriptors throughout a layered document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorColorGridEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
