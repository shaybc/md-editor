// Normalized non-destructive inner-shadow descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "inner-shadow";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : "#000000";
  }

  /** Create a complete inner-shadow descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      blendMode: effect.blendMode === "normal" ? "normal" : "multiply",
      color: normalizeColor(effect.color),
      opacity: clamp(effect.opacity, 0, 1, 0.35),
      angle: ((clamp(effect.angle, -3600, 3600, 135) % 360) + 360) % 360,
      useGlobalLight: effect.useGlobalLight === true,
      distance: clamp(effect.distance, 0, 1000, 5),
      choke: clamp(effect.choke, 0, 1, 0),
      blur: clamp(effect.blur, 0, 1000, 5)
    };
  }

  /** Return the normalized inner shadow currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single inner-shadow effect. */
  function upsert(layer, effect) {
    if (!layer) return false;
    const normalized = normalize(effect);
    const remaining = (layer.effects || []).filter((entry) => entry?.type !== TYPE);
    layer.effects = [...remaining, normalized];
    return true;
  }

  /** Remove the inner-shadow effect without changing other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted inner-shadow descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const shadow = node.effects.find((entry) => entry?.type === TYPE);
      if (!shadow) return;
      node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(shadow)];
    });
    return document;
  }

  namespace.ImageEditorInnerShadowEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
