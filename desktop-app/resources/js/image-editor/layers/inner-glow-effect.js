// Normalized non-destructive inner-glow descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "inner-glow";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : "#FFF5B1";
  }

  /** Create a complete inner-glow descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      blendMode: ["screen", "normal", "multiply"].includes(effect.blendMode) ? effect.blendMode : "screen",
      color: normalizeColor(effect.color),
      opacity: clamp(effect.opacity, 0, 1, 0.75),
      choke: clamp(effect.choke, 0, 1, 0),
      blur: clamp(effect.blur, 0, 1000, 5)
    };
  }

  /** Return the normalized inner glow currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single inner-glow effect. */
  function upsert(layer, effect) {
    if (!layer) return false;
    const normalized = normalize(effect);
    const remaining = (layer.effects || []).filter((entry) => entry?.type !== TYPE);
    layer.effects = [...remaining, normalized];
    return true;
  }

  /** Remove the inner-glow effect without changing other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted inner-glow descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const glow = node.effects.find((entry) => entry?.type === TYPE);
      if (!glow) return;
      node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(glow)];
    });
    return document;
  }

  namespace.ImageEditorInnerGlowEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
