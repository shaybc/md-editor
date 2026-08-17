// Normalized non-destructive Collage descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "collage";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
  }

  function seedForId(id) {
    return [...String(id || "collage")].reduce((seed, character) => ((seed * 33) ^ character.charCodeAt(0)) >>> 0, 5381);
  }

  /** Create a complete Collage descriptor from optional persisted values. */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      gridSize: Math.round(clamp(effect.gridSize, 2, 6, 3)),
      gap: clamp(effect.gap, 0, 120, 18),
      rotation: clamp(effect.rotation, 0, 30, 7),
      scatter: clamp(effect.scatter, 0, 100, 10),
      backgroundColor: normalizeColor(effect.backgroundColor, "#171717"),
      borderSize: clamp(effect.borderSize, 0, 40, 6),
      borderColor: normalizeColor(effect.borderColor, "#FFFFFF"),
      shadowOpacity: clamp(effect.shadowOpacity, 0, 1, 0.3),
      shadowDistance: clamp(effect.shadowDistance, 0, 60, 8),
      shadowBlur: clamp(effect.shadowBlur, 0, 60, 12),
      seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) >>> 0 : seedForId(id)
    };
  }

  /** Return the normalized Collage effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Collage effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Collage without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Collage descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorCollageEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
