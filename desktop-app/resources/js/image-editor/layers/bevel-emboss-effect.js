// Normalized non-destructive Bevel & Emboss descriptors for image-editor layers.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const TYPE = "bevel-emboss";
  const STYLES = new Set(["inner-bevel", "outer-bevel", "emboss", "pillow-emboss", "stroke-emboss"]);
  const TECHNIQUES = new Set(["smooth", "chisel-hard", "chisel-soft"]);
  const DIRECTIONS = new Set(["up", "down"]);
  const CONTOURS = new Set(["linear", "cone", "ring"]);

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback;
  }

  function normalizeBlendMode(value, fallback) {
    return ["normal", "multiply", "screen"].includes(value) ? value : fallback;
  }

  /** Create a complete Bevel & Emboss descriptor from optional persisted values. */
  function normalize(effect = {}) {
    return {
      id: effect.id || namespace.createImageEditorId?.("effect") || `effect-${Date.now()}`,
      type: TYPE,
      enabled: effect.enabled !== false,
      style: STYLES.has(effect.style) ? effect.style : "inner-bevel",
      technique: TECHNIQUES.has(effect.technique) ? effect.technique : "smooth",
      depth: clamp(effect.depth, 1, 1000, 100),
      direction: DIRECTIONS.has(effect.direction) ? effect.direction : "up",
      size: clamp(effect.size, 0, 250, 5),
      soften: clamp(effect.soften, 0, 50, 0),
      angle: ((clamp(effect.angle, -3600, 3600, 120) % 360) + 360) % 360,
      altitude: clamp(effect.altitude, 0, 90, 30),
      useGlobalLight: effect.useGlobalLight === true,
      glossContour: CONTOURS.has(effect.glossContour) ? effect.glossContour : "linear",
      antialiased: effect.antialiased !== false,
      highlightBlendMode: normalizeBlendMode(effect.highlightBlendMode, "screen"),
      highlightColor: normalizeColor(effect.highlightColor, "#FFFFFF"),
      highlightOpacity: clamp(effect.highlightOpacity, 0, 1, 0.75),
      shadowBlendMode: normalizeBlendMode(effect.shadowBlendMode, "multiply"),
      shadowColor: normalizeColor(effect.shadowColor, "#000000"),
      shadowOpacity: clamp(effect.shadowOpacity, 0, 1, 0.75)
    };
  }

  /** Return the normalized Bevel & Emboss effect currently attached to a layer. */
  function get(layer) {
    const effect = (layer?.effects || []).find((entry) => entry?.type === TYPE);
    return effect ? normalize(effect) : null;
  }

  /** Add or replace a layer's single Bevel & Emboss effect. */
  function upsert(layer, effect) {
    if (!layer) return false;
    const remaining = (layer.effects || []).filter((entry) => entry?.type !== TYPE);
    layer.effects = [...remaining, normalize(effect)];
    return true;
  }

  /** Remove Bevel & Emboss without changing other layer effects. */
  function remove(layer) {
    if (!layer) return false;
    const effects = layer.effects || [];
    const next = effects.filter((entry) => entry?.type !== TYPE);
    if (next.length === effects.length) return false;
    layer.effects = next;
    return true;
  }

  /** Normalize persisted Bevel & Emboss descriptors throughout a document. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes?.(document, (node) => {
      if (node.kind !== "layer" || !Array.isArray(node.effects)) return;
      const effect = node.effects.find((entry) => entry?.type === TYPE);
      if (!effect) return;
      node.effects = [...node.effects.filter((entry) => entry?.type !== TYPE), normalize(effect)];
    });
    return document;
  }

  namespace.ImageEditorBevelEmbossEffect = Object.freeze({ TYPE, normalize, get, upsert, remove, normalizeDocument });
})(typeof window !== "undefined" ? window : globalThis);
