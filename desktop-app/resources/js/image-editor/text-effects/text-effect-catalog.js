// Built-in non-destructive visual presets for editable image-editor text objects.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const PRESET_STYLES = namespace.ImageEditorTextEffectPresetStyles || Object.freeze({});

  const PRESETS = Object.freeze([
    { id: "snail-stack", label: "Snail", fill: ["#54e7e7", "#0096a6"], stroke: ["#073f4d", 2], outlineLayers: [["#ff9a57", 5], ["#102f45", 7]], extrusions: [["#102f45", 9, 1, 1], ["#d66f43", 5, 1, 1]], shadow: ["#031821", 5, 7, 9], highlight: "#bfffff" },
    { id: "pink-relief", label: "Pink", fill: ["#fff5f1", "#ffb8b0", "#ed7f78"], stroke: ["#fff0e9", 1], outlineLayers: [["#d95e69", 3], ["#8a3845", 5]], extrusions: [["#71323d", 7, 1, 1], ["#ef8d83", 3, 1, 1]], shadow: ["#6d2936", 5, 6, 8], highlight: "#ffffff" },
    { id: "white-prism", label: "White", fill: ["#ffffff", "#dff7ff", "#e6d8ff"], stroke: ["#ffffff", 1], outlineLayers: [["#6d48c7", 3], ["#14205e", 5]], extrusions: [["#101747", 10, 1, 1], ["#f130a6", 6, 1, 1], ["#42d9f5", 3, 1, 1]], shadow: ["#060b2b", 7, 8, 10], highlight: "#ffffff" },
    { id: "king-gold", label: "King", fill: ["#fff4a6", "#ffcb3d", "#c77600", "#fff0a0"], stroke: ["#6e2700", 2], outlineLayers: [["#f2b421", 4], ["#6e190d", 6]], extrusions: [["#4c100a", 8, 1, 1], ["#b34313", 4, 1, 1]], shadow: ["#2d0605", 7, 7, 9], highlight: "#ffffff", texture: "noise" },
    { id: "good-vibes-stack", label: "Good Vibes Only", fill: ["#fff36a", "#ff70ae", "#60e8f2"], stroke: ["#fffdf2", 2], outlineLayers: [["#172a66", 5], ["#ff4f91", 7]], extrusions: [["#11204d", 10, 1, 1], ["#26bad0", 6, 1, 1], ["#f33688", 3, 1, 1]], shadow: ["#071334", 3, 7, 9] },
    { id: "jokes-pop", label: "Jokes", fill: ["#ff8c93", "#ff405e"], stroke: ["#fff09c", 2], outlineLayers: [["#e43546", 4], ["#731c34", 6]], extrusions: [["#67152d", 9, 1, 1], ["#ffae45", 5, 1, 1]], shadow: ["#401024", 5, 7, 9], highlight: "#ffffff" },
    { id: "buck-script", label: "Buck", fill: ["#eff5cf", "#73c89a"], stroke: ["#d72821", 2], outlineLayers: [["#f7a726", 4], ["#0d5961", 6]], extrusions: [["#06383e", 8, 1, 1], ["#dc4b24", 4, 1, 1]], shadow: ["#052c31", 5, 7, 8], highlight: "#ffffff" },
    { id: "magic-script", label: "Magic", fill: ["#ffe148", "#ff9d00"], stroke: ["#fff7c7", 1], outlineLayers: [["#ef3b1f", 4], ["#8c1912", 6]], extrusions: [["#71130e", 8, 1, 1], ["#f45a20", 4, 1, 1]], glow: ["#ffb52d", 3], shadow: ["#4f0b0b", 5, 7, 9] },
    { id: "sticky-paper", label: "Sticky Paper", fill: ["#fff45f", "#ffc928"], stroke: ["#ff8f21", 2], outlineLayers: [["#d93b32", 5], ["#671a31", 7]], extrusions: [["#56162b", 10, 1, 1], ["#e23b43", 5, 1, 1]], shadow: ["#350c20", 4, 8, 10], texture: "dots" },
    { id: "upward-stack", label: "Upward", fill: ["#ffd3dc", "#ff668b", "#d92e69"], stroke: ["#fff1f3", 1], outlineLayers: [["#ff7c93", 3], ["#8f215a", 5]], extrusions: [["#651744", 9, 1, 1], ["#ff7f9b", 4, 1, 1]], shadow: ["#3f1232", 5, 7, 9], highlight: "#ffffff" },
    { id: "vintage-ribbon", label: "Vintage", fill: ["#fffdf4", "#ffe8dc"], stroke: ["#e9364a", 2], outlineLayers: [["#ffffff", 4], ["#51b8ca", 6]], extrusions: [["#116779", 9, 1, 1], ["#f06b77", 5, 1, 1]], shadow: ["#0c4c5a", 5, 7, 9] },
    { id: "vibes-script", label: "Vibes", fill: ["#ffb7dd", "#f05eae"], stroke: ["#fff0fa", 1], outlineLayers: [["#1e1526", 3], ["#97538d", 5]], extrusions: [["#26152f", 8, 1, 1], ["#e987c5", 4, 1, 1]], shadow: ["#160c1d", 5, 7, 9], highlight: "#ffffff" },
    { id: "shop-now-prism", label: "Shop Now", fill: ["#ffffff", "#f7b3ff", "#64e5f4"], stroke: ["#fff7ff", 2], outlineLayers: [["#ee499f", 4], ["#243a83", 6]], extrusions: [["#19265e", 10, 1, 1], ["#27bad4", 6, 1, 1], ["#e3429d", 3, 1, 1]], glow: ["#75e7ff", 4], shadow: ["#111c4e", 6, 8, 10] },
    { id: "heat-cutout", label: "Heat", fill: ["#fff0f3", "#ff7195", "#d92d5a"], stroke: ["#fff6ed", 2], outlineLayers: [["#e1375f", 4], ["#842044", 6]], extrusions: [["#681735", 10, 1, 1], ["#ec5a76", 5, 1, 1]], shadow: ["#3e0d25", 6, 8, 10], texture: "noise" },
    { id: "paper-print", label: "Paper Print", fill: ["#ffffff", "#e8e5ff"], stroke: ["#fefcff", 2], outlineLayers: [["#9e78ed", 4], ["#49308d", 6]], extrusions: [["#342071", 11, 1, 1], ["#8359d1", 5, 1, 1]], shadow: ["#25164f", 6, 8, 11], texture: "dots" },
    { id: "curve", label: "Curve", kind: "curve", defaults: Object.freeze({ curve: 33 }), fill: ["#9b4dff"] },
    { id: "transparent", label: "Transparent", transparentFill: true, fill: ["transparent"], stroke: ["#ffffff", 4], shadow: ["rgba(0,0,0,.72)", 7, 4, 5] },
    { id: "neon-lights", label: "Neon Lights", fill: ["#fff0ff", "#ff4de1"], stroke: ["#ff8cf0", 1], glow: ["#ff3cda", 13], shadow: ["#7c2cff", 8, 0, 0] },
    { id: "tv-static", label: "TV Static", fill: ["#ffffff", "#d9fbff"], stroke: ["#101827", 1], glitch: true, texture: "scanlines", shadow: ["#00e5ff", 0, -3, 0] },
    { id: "retro-70s", label: "Retro 70s", fill: ["#fff06a", "#f59e0b"], stroke: ["#8a3b12", 2], shadow: ["#7c2d12", 1, 4, 4], highlight: "#fff7bd" },
    { id: "sci-fi", label: "Sci-fi", fill: ["#f4ffcf", "#9dff70"], stroke: ["#eaffc8", 1], glow: ["#8cff5c", 12], texture: "scanlines" },
    { id: "screenprint", label: "Screenprint", fill: ["#fff1f7", "#f7a5ca"], stroke: ["#8f2859", 2], shadow: ["#d64f8c", 0, 4, 4], texture: "stripes" },
    { id: "western", label: "Western", fill: ["#fff0df", "#ee8d72"], stroke: ["#9d382f", 2], shadow: ["#61251f", 2, 3, 3], highlight: "#ffffff" },
    { id: "graffiti", label: "Graffiti", fill: ["#f7fff6", "#cce9d6"], stroke: ["#173c31", 3], shadow: ["#6f9f83", 0, 3, 3], texture: "dots" },
    { id: "bubble", label: "Bubble", fill: ["#bdf5ff", "#4cc9f0"], stroke: ["#155e75", 3], shadow: ["#083344", 0, 3, 3], highlight: "#ffffff" },
    { id: "aerobics", label: "Aerobics", fill: ["#fff5ff", "#f0a8ff"], stroke: ["#f8d6ff", 1], glow: ["#dd7cff", 10], shadow: ["#8b5cf6", 5, 2, 2] },
    { id: "arcade", label: "Arcade", fill: ["#39ff88", "#00e5ff"], stroke: ["#ff00bf", 2], glitch: true, pixelate: 3, shadow: ["#7c00ff", 0, 3, 3] },
    { id: "cosmic", label: "Cosmic", fill: ["#ffffff", "#bfc7ff", "#f0abfc"], stroke: ["#eef2ff", 1], glow: ["#8b8cff", 11], shadow: ["#4c1d95", 5, 2, 3] },
    { id: "pixel", label: "Pixel", fill: ["#00f5d4", "#9b5de5"], stroke: ["#111827", 1], pixelate: 4, glitch: true, shadow: ["#f15bb5", 0, 3, 2] },
    { id: "gold-foil", label: "Gold Foil", fill: ["#fff4a3", "#f5b700", "#9a5a00"], stroke: ["#74420b", 2], shadow: ["#3f2508", 3, 4, 5], highlight: "#ffffff", texture: "noise" },
    { id: "spring-bloom", label: "Spring Bloom", fill: ["#ffb18f", "#ff6f61"], stroke: ["#2f9e67", 1], shadow: ["#176b48", 0, 3, 3], texture: "dots" },
    { id: "soft-white", label: "Soft White", fill: ["#ffffff", "#e5e7eb"], stroke: ["#cbd5e1", 1], shadow: ["#64748b", 5, 3, 4], highlight: "#ffffff" },
    { id: "bold-shadow", label: "Bold Shadow", fill: ["#ffffff", "#e2e8f0"], stroke: ["#0f172a", 1], shadow: ["#020617", 5, 7, 8] },
    { id: "super-pop", label: "Super Pop", fill: ["#fff7cc", "#ffd166"], stroke: ["#2a6f68", 3], extrusion: ["#d29f52", 5, 1, 1], shadow: ["#102a2a", 3, 4, 5] },
    { id: "candy-gloss", label: "Candy Gloss", fill: ["#fff0f7", "#ff4f9a", "#d4145a"], stroke: ["#8f1247", 2], shadow: ["#54072b", 4, 3, 4], highlight: "#ffffff" },
    { id: "pink-dose", label: "Pink Dose", fill: ["#ff86b8", "#ff4f8b"], stroke: ["#ffe1ef", 1], shadow: ["#00a6a6", 0, 4, 4], highlight: "#ffffff" },
    { id: "comic-boom", label: "Comic Boom", fill: ["#fff36a", "#ffbd00"], stroke: ["#b81d3b", 3], extrusion: ["#7a1029", 6, 1, 1], shadow: ["#3d0714", 2, 5, 6] },
    { id: "vintage-script", label: "Vintage Script", fill: ["#fff8e7", "#ffe0b5"], stroke: ["#e16b67", 2], shadow: ["#7f3a38", 4, 4, 5], highlight: "#ffffff" },
    { id: "pastel-3d", label: "Pastel 3D", fill: ["#a7f3d0", "#bfdbfe", "#fbcfe8"], stroke: ["#ffffff", 1], extrusion: ["#9b87d3", 6, 1, 1], shadow: ["#6d5a9c", 4, 5, 6] },
    { id: "stone", label: "Stone", fill: ["#d6d3d1", "#78716c"], stroke: ["#44403c", 2], shadow: ["#1c1917", 5, 4, 5], texture: "noise" },
    { id: "cracked-concrete", label: "Cracked Concrete", fill: ["#d6d3c8", "#8a857b"], stroke: ["#292524", 2], shadow: ["#1c1917", 4, 4, 5], texture: "stripes" },
    { id: "sticker", label: "Sticker", fill: ["#fffef2", "#ffffff"], stroke: ["#ef3340", 4], shadow: ["#111827", 1, 5, 5], highlight: "#ffffff" },
    { id: "long-shadow", label: "Long Shadow", fill: ["#ffffff", "#f8fafc"], stroke: ["#111827", 1], extrusion: ["#172033", 12, 1, 1], shadow: ["#020617", 2, 5, 6] },
    { id: "chrome", label: "Chrome", fill: ["#ffffff", "#94a3b8", "#f8fafc", "#475569"], stroke: ["#334155", 2], shadow: ["#0f172a", 4, 4, 5], highlight: "#ffffff" },
    { id: "retro-outline", label: "Retro Outline", fill: ["#fff7dc", "#fde68a"], stroke: ["#ef4444", 4], shadow: ["#38bdf8", 0, 4, 4], texture: "dots" },
    { id: "paper-cut", label: "Paper Cut", fill: ["#ffffff", "#f5f3ff"], stroke: ["#ddd6fe", 1], extrusion: ["#c4b5fd", 4, 1, 1], shadow: ["#7c3aed", 5, 4, 5] },
    { id: "rainbow-stack", label: "Rainbow Stack", fill: ["#ffe66d", "#ff9f1c"], stroke: ["#d90479", 2], extrusion: ["#5f27cd", 8, 1, 1], shadow: ["#00a8e8", 0, -3, 3] },
    { id: "electric-blue", label: "Electric Blue", fill: ["#ecfeff", "#22d3ee", "#2563eb"], stroke: ["#0c4a6e", 2], glow: ["#00d9ff", 11], shadow: ["#312e81", 5, 2, 3] },
    { id: "firelight", label: "Firelight", fill: ["#fff7a8", "#ff9f1c", "#ef233c"], stroke: ["#7f1d1d", 2], glow: ["#ff5a1f", 9], shadow: ["#450a0a", 4, 3, 4] }
  ].map((preset) => {
    const style = PRESET_STYLES[preset.id] || {};
    return Object.freeze({
      ...preset,
      ...style,
      outlineLayers: Object.freeze([...(preset.outlineLayers || []), ...(style.outlineLayers || [])])
    });
  }));

  const BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]));
  const DISPLAY_PRESETS = Object.freeze([
    BY_ID.get("curve"),
    BY_ID.get("transparent"),
    ...PRESETS.filter((preset) => preset.id !== "curve" && preset.id !== "transparent")
  ]);

  /** Return all built-in text-effect presets in display order. */
  function all() { return DISPLAY_PRESETS; }

  /** Resolve one persisted preset identifier. */
  function get(id) { return BY_ID.get(String(id || "")) || null; }

  /** Create a normalized persisted descriptor for one preset. */
  function descriptor(id, values = {}) {
    const preset = get(id);
    if (!preset) return null;
    const defaultCurve = preset.kind === "curve" ? preset.defaults.curve : preset.typography?.curve;
    if (!Number.isFinite(defaultCurve) && !Number.isFinite(Number(values.curve))) return { id: preset.id };
    return { id: preset.id, curve: Math.max(-100, Math.min(100, Number(values.curve ?? defaultCurve) || 0)) };
  }

  /** Normalize settings restored from a layered image document. */
  function normalize(value = {}) {
    return descriptor(value.id, value);
  }

  /** Return inline preview variables derived from the same colors used by the compositor. */
  function previewStyle(preset) {
    const colors = preset.fill || ["#ffffff", "#ffffff"];
    const fill = colors.length === 1 ? colors[0] : "linear-gradient(" + (Number(preset.gradientAngle) || 135) + "deg," + colors.join(",") + ")";
    const shadows = [];
    [...(preset.extrusions || []), ...(preset.extrusion ? [preset.extrusion] : [])].forEach(([color, depth, x, y]) => {
      for (let step = 1; step <= Math.min(4, depth); step += 1) shadows.push((x * step) + "px " + (y * step) + "px 0 " + color);
    });
    if (preset.glow) shadows.push("0 0 " + preset.glow[1] + "px " + preset.glow[0]);
    [...(preset.shadows || []), ...(preset.shadow ? [preset.shadow] : [])]
      .forEach((shadow) => shadows.push(shadow[2] + "px " + shadow[3] + "px " + shadow[1] + "px " + shadow[0]));
    if (preset.glitch) shadows.unshift("-2px 0 #00e5ff", "2px 0 #ff00bf");
    const typography = preset.typography || {};
    const background = preset.background;
    const backgroundColors = background?.colors || [];
    const backgroundStyle = backgroundColors.length > 1
      ? ";--text-effect-preview-background-image:linear-gradient(" + (Number(background.angle) || 135) + "deg," + backgroundColors.join(",") + ")"
      : backgroundColors.length === 1 ? ";--text-effect-preview-background-color:" + backgroundColors[0] : "";
    return "--text-effect-preview-fill:" + fill + ";--text-effect-preview-stroke:" + (preset.stroke?.[0] || "transparent") +
      ";--text-effect-preview-stroke-width:" + (preset.stroke?.[1] || 0) + "px;--text-effect-preview-shadow:" + (shadows.join(",") || "none") +
      ";--text-effect-preview-font:" + (typography.fontFamily || "Georgia") +
      ";--text-effect-preview-size:" + (Number(typography.previewSize) || 25) + "px" +
      ";--text-effect-preview-weight:" + (typography.fontBold ? "800" : "500") +
      ";--text-effect-preview-style:" + (typography.fontItalic ? "italic" : "normal") +
      ";--text-effect-preview-angle:" + (Number(typography.rotationDegrees) || 0) + "deg" + backgroundStyle;
  }

  namespace.ImageEditorTextEffectCatalog = Object.freeze({ all, get, descriptor, normalize, previewStyle });
})(typeof window !== "undefined" ? window : globalThis);
