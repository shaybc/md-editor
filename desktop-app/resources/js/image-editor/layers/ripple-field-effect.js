// Normalized non-destructive Ripple Field descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "ripple-field";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    const normalized = Number.isFinite(number) ? number : fallback;
    return Math.max(minimum, Math.min(maximum, normalized));
  }

  function seedForId(id) {
    let seed = 2166136261;
    for (let index = 0; index < id.length; index += 1) {
      seed ^= id.charCodeAt(index);
      seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
  }

  /** Create a complete Ripple Field descriptor from optional persisted values. */
  function normalize(effect = {}) {
    const id = effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`;
    const wavelengthMinimum = clamp(effect.wavelengthMinimum, 1, 999, 10);
    const amplitudeMinimum = clamp(effect.amplitudeMinimum, 0, 999, 5);
    return {
      id,
      type: TYPE,
      enabled: effect.enabled !== false,
      generators: Math.round(clamp(effect.generators, 1, 999, 5)),
      wavelengthMinimum,
      wavelengthMaximum: clamp(effect.wavelengthMaximum, wavelengthMinimum, 999, 120),
      amplitudeMinimum,
      amplitudeMaximum: clamp(effect.amplitudeMaximum, amplitudeMinimum, 999, 35),
      horizontalScale: clamp(effect.horizontalScale, 1, 100, 100),
      verticalScale: clamp(effect.verticalScale, 1, 100, 100),
      waveType: ["sine", "triangle", "square"].includes(effect.waveType) ? effect.waveType : "sine",
      undefinedAreas: ["wrap", "repeat"].includes(effect.undefinedAreas) ? effect.undefinedAreas : "repeat",
      seed: Number.isFinite(Number(effect.seed)) ? Number(effect.seed) >>> 0 : seedForId(id)
    };
  }

  /** Return the normalized Ripple Field effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Ripple Field effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Ripple Field without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Ripple Field descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorRippleFieldEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
