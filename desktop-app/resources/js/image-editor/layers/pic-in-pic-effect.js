// Normalized non-destructive Pic-in-Pic descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "pic-in-pic";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : "#FFFFFF";
  }

  /** Create a complete Pic-in-Pic descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      positionX: clamp(effect.positionX, 0, 100, 52),
      positionY: clamp(effect.positionY, 0, 100, 50),
      width: clamp(effect.width, 10, 100, 58),
      height: clamp(effect.height, 10, 100, 62),
      cropX: clamp(effect.cropX, 0, 100, 50),
      cropY: clamp(effect.cropY, 0, 100, 50),
      zoom: clamp(effect.zoom, 100, 300, 135),
      rotation: clamp(effect.rotation, -45, 45, -6),
      backgroundBw: clamp(effect.backgroundBw, 0, 1, 1),
      borderSize: clamp(effect.borderSize, 0, 40, 6),
      borderColor: normalizeColor(effect.borderColor),
      shadowOpacity: clamp(effect.shadowOpacity, 0, 1, 0.35),
      shadowDistance: clamp(effect.shadowDistance, 0, 100, 18),
      shadowBlur: clamp(effect.shadowBlur, 0, 60, 15),
      shadowAngle: clamp(effect.shadowAngle, -180, 180, 45)
    };
  }

  /** Return the normalized Pic-in-Pic effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Pic-in-Pic effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Pic-in-Pic without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Pic-in-Pic descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorPicInPicEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
