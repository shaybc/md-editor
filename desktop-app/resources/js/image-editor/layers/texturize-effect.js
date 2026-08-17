// Normalized non-destructive Texturize descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "texturize";

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
  }

  /**
   * Create a complete Texturize descriptor from optional persisted values.
   * @param {object} effect - Persisted or newly entered text-portrait values.
   * @returns {object} Valid descriptor suitable for rendering and storage.
   */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      text: String(effect.text || "CREATE • INSPIRE • IMAGINE • DESIGN • ").slice(0, 500),
      fontFamily: String(effect.fontFamily || "Arial, sans-serif").slice(0, 120),
      fontSize: clamp(effect.fontSize, 4, 48, 12),
      lineSpacing: clamp(effect.lineSpacing, 70, 200, 112),
      stagger: clamp(effect.stagger, 0, 100, 50),
      brightness: clamp(effect.brightness, -100, 100, 5),
      contrast: clamp(effect.contrast, -100, 100, 35),
      textColor: normalizeColor(effect.textColor, "#FFFFFF"),
      backgroundColor: normalizeColor(effect.backgroundColor, "#000000"),
      backgroundOpacity: clamp(effect.backgroundOpacity, 0, 1, 1),
      useSourceColor: effect.useSourceColor === true,
      invert: effect.invert === true
    };
  }

  /** Return the normalized Texturize effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Texturize effect. */
  function upsert(layer, effect = {}) {
    if (!layer) return false;
    layer.effects = [...(layer.effects || []).filter((entry) => entry?.type !== TYPE), normalize(effect)];
    return true;
  }

  /** Remove Texturize without changing any other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Texturize descriptors throughout a layered document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (effect) node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorTexturizeEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
