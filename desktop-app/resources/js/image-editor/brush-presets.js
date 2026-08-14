// Brush preset definitions and raster stroke rendering for the image editor.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const PRESETS = Object.freeze([
    { id: "round", label: "Round brush", category: "Drawing" },
    { id: "flat", label: "Flat brush", category: "Painting" },
    { id: "marker", label: "Marker", category: "Drawing" },
    { id: "ink", label: "Inking brush", category: "Inking" },
    { id: "calligraphy", label: "Calligraphy", category: "Calligraphy" },
    { id: "airbrush", label: "Airbrush", category: "Airbrushing" },
    { id: "charcoal", label: "Charcoal", category: "Charcoals" },
    { id: "watercolor", label: "Watercolor", category: "Painting" },
    { id: "spray", label: "Spray paint", category: "Spraypaints" },
    { id: "wet-paint", label: "Wet paint", category: "Painting" },
    { id: "oil-paint", label: "Oil paint", category: "Painting" },
    { id: "paint-splatter", label: "Paint splatter", category: "Spraypaints" },
    { id: "graphite-pencil", label: "Graphite pencil", category: "Pencils" },
    { id: "wax-crayon", label: "Wax crayon", category: "Crayons" },
    { id: "chalk", label: "Chalk", category: "Chalks" },
    { id: "pastel", label: "Pastel", category: "Pastels" },
    { id: "pattern", label: "Pattern brush", category: "Patterns" }
  ]);
  const PRESET_IDS = new Set(PRESETS.map((preset) => preset.id));

  /** Return a supported brush preset identifier. */
  function normalizeBrushPreset(value) {
    return PRESET_IDS.has(value) ? value : "round";
  }

  function line(context, from, to, width, alpha = 1, offsetX = 0, offsetY = 0, lineCap = "round") {
    context.globalAlpha = alpha;
    context.lineWidth = Math.max(0.5, width);
    context.lineCap = lineCap;
    context.beginPath();
    context.moveTo(from.x + offsetX, from.y + offsetY);
    context.lineTo(to.x + offsetX, to.y + offsetY);
    context.stroke();
  }

  function seededNoise(seed) {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  }

  function scatter(context, from, to, width, count, alpha, radiusFactor, seedOffset) {
    context.globalAlpha = alpha;
    context.fillStyle = context.strokeStyle;
    for (let index = 0; index < count; index += 1) {
      const seed = from.x * 0.37 + from.y * 0.61 + to.x * 0.17 + to.y * 0.29 + index + seedOffset;
      const progress = seededNoise(seed);
      const angle = seededNoise(seed + 19) * Math.PI * 2;
      const radius = Math.sqrt(seededNoise(seed + 41)) * width * 0.7;
      const x = from.x + (to.x - from.x) * progress + Math.cos(angle) * radius;
      const y = from.y + (to.y - from.y) * progress + Math.sin(angle) * radius;
      const dotRadius = Math.max(0.45, width * radiusFactor * (0.45 + seededNoise(seed + 73) * 0.55));
      context.beginPath();
      context.arc(x, y, dotRadius, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** Draw one segment using the selected brush preset and return its accumulated path distance. */
  function drawBrushPresetSegment(context, from, to, state, pathDistance = 0) {
    const width = state.brushSize;
    const preset = normalizeBrushPreset(state.brushType);
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    context.save();
    namespace.configureStroke(context, state, width, pathDistance);
    const specialtyRendered = namespace.drawSpecialtyBrushPresetSegment?.(
      context, from, to, state, preset, pathDistance, distance, { line, scatter, seededNoise }
    );
    if (specialtyRendered) {
      context.restore();
      return pathDistance + distance;
    }
    if (preset === "flat") line(context, from, to, width, 1, 0, 0, "butt");
    else if (preset === "marker") line(context, from, to, width * 1.35, 0.55, 0, 0, "square");
    else if (preset === "ink") line(context, from, to, width * (0.55 + Math.min(0.45, distance / 30)), 1);
    else if (preset === "calligraphy") {
      line(context, from, to, width * 0.38, 1, -width * 0.28, width * 0.28, "butt");
      line(context, from, to, width * 0.38, 1, 0, 0, "butt");
      line(context, from, to, width * 0.38, 1, width * 0.28, -width * 0.28, "butt");
    } else if (preset === "airbrush") scatter(context, from, to, width, Math.max(12, Math.ceil(distance * 2)), 0.055, 0.28, 3);
    else if (preset === "charcoal") {
      line(context, from, to, width * 0.32, 0.35, -width * 0.24, width * 0.12);
      line(context, from, to, width * 0.46, 0.5, 0, 0);
      line(context, from, to, width * 0.28, 0.3, width * 0.2, -width * 0.18);
      scatter(context, from, to, width, Math.max(5, Math.ceil(distance)), 0.28, 0.09, 11);
    } else if (preset === "watercolor") {
      line(context, from, to, width * 1.55, 0.1, 0, 0);
      line(context, from, to, width * 1.15, 0.14, -width * 0.12, width * 0.08);
      line(context, from, to, width * 0.72, 0.2, width * 0.1, -width * 0.06);
    } else if (preset === "spray") scatter(context, from, to, width, Math.max(18, Math.ceil(distance * 3)), 0.5, 0.055, 23);
    else line(context, from, to, width);
    context.restore();
    return pathDistance + distance;
  }

  namespace.ImageEditorBrushPresets = PRESETS;
  namespace.normalizeBrushPreset = normalizeBrushPreset;
  namespace.drawBrushPresetSegment = drawBrushPresetSegment;
})(typeof window !== "undefined" ? window : globalThis);
