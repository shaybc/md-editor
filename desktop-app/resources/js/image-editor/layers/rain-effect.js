// Normalized non-destructive Rain descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "rain";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function seedForId(id) {
    let seed = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
      seed ^= id.charCodeAt(index);
      seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
  }

  /** Create a complete Rain descriptor from optional persisted values. */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      amount: clamp(effect.amount, 0, 1, 0.35),
      length: clamp(effect.length, 1, 250, 75),
      thickness: clamp(effect.thickness, 0.25, 8, 1.25),
      angle: clamp(effect.angle, -180, 180, 65),
      brightness: clamp(effect.brightness, 0, 1, 0.75),
      seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) >>> 0 : seedForId(id)
    };
  }

  /** Return the normalized Rain effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Rain effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Rain without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Rain descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorRainEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
