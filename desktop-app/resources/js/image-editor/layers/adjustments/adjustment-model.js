// Persistent document descriptors for non-destructive image adjustments.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};
  const SELECTIVE_COLOR_RANGES = Object.freeze(["reds", "yellows", "greens", "cyans", "blues", "magentas", "whites", "neutrals", "blacks"]);
  const SELECTIVE_COLOR_COMPONENTS = Object.freeze(["Cyan", "Magenta", "Yellow", "Black"]);

  function createSelectiveColorDefaults() {
    const defaults = { selectedColor: "reds", relative: true };
    SELECTIVE_COLOR_RANGES.forEach((range) => SELECTIVE_COLOR_COMPONENTS.forEach((component) => { defaults[range + component] = 0; }));
    return defaults;
  }

  const DEFINITIONS = Object.freeze({
    "brightness-contrast": Object.freeze({ name: "Brightness/Contrast", defaults: Object.freeze({ brightness: 0, contrast: 0 }) }),
    exposure: Object.freeze({ name: "Exposure Control", defaults: Object.freeze({ exposure: 0, offset: 0, gamma: 1 }) }),
    vibrance: Object.freeze({ name: "Smart Saturation", defaults: Object.freeze({ vibrance: 0, saturation: 0 }) }),
    "hue-saturation": Object.freeze({ name: "Hue/Saturation", defaults: Object.freeze({ hue: 0, saturation: 0, lightness: 0, colorize: false, range: "master" }) }),
    "color-balance": Object.freeze({
      name: "Color Balance",
      defaults: Object.freeze({
        tone: "midtones",
        preserveLuminosity: true,
        shadowsCyanRed: 0, shadowsMagentaGreen: 0, shadowsYellowBlue: 0,
        midtonesCyanRed: 0, midtonesMagentaGreen: 0, midtonesYellowBlue: 0,
        highlightsCyanRed: 0, highlightsMagentaGreen: 0, highlightsYellowBlue: 0
      })
    }),
    "black-white": Object.freeze({
      name: "Monochrome Mixer",
      defaults: Object.freeze({ reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, tint: false, tintColor: "#d8c5a0" })
    }),
    "channel-mixer": Object.freeze({
      name: "Channel Blend",
      defaults: Object.freeze({
        outputChannel: "red", monochrome: false,
        redOutputRed: 100, redOutputGreen: 0, redOutputBlue: 0, redOutputConstant: 0,
        greenOutputRed: 0, greenOutputGreen: 100, greenOutputBlue: 0, greenOutputConstant: 0,
        blueOutputRed: 0, blueOutputGreen: 0, blueOutputBlue: 100, blueOutputConstant: 0,
        monochromeRed: 40, monochromeGreen: 40, monochromeBlue: 20, monochromeConstant: 0
      })
    }),
    levels: Object.freeze({
      name: "Tonal Range",
      defaults: Object.freeze({
        channel: "rgb",
        rgbInputBlack: 0, rgbGamma: 1, rgbInputWhite: 255, rgbOutputBlack: 0, rgbOutputWhite: 255,
        redInputBlack: 0, redGamma: 1, redInputWhite: 255, redOutputBlack: 0, redOutputWhite: 255,
        greenInputBlack: 0, greenGamma: 1, greenInputWhite: 255, greenOutputBlack: 0, greenOutputWhite: 255,
        blueInputBlack: 0, blueGamma: 1, blueInputWhite: 255, blueOutputBlack: 0, blueOutputWhite: 255
      })
    }),
    curves: Object.freeze({
      name: "Tone Curve",
      defaults: Object.freeze({
        channel: "rgb",
        rgbPoints: Object.freeze([{ x: 0, y: 0 }, { x: 255, y: 255 }]),
        redPoints: Object.freeze([{ x: 0, y: 0 }, { x: 255, y: 255 }]),
        greenPoints: Object.freeze([{ x: 0, y: 0 }, { x: 255, y: 255 }]),
        bluePoints: Object.freeze([{ x: 0, y: 0 }, { x: 255, y: 255 }])
      })
    }),
    "photo-filter": Object.freeze({
      name: "Lens Tint",
      defaults: Object.freeze({ filterMode: "filter", filter: "warming-85", color: "#ec8a00", density: 25, preserveLuminosity: true })
    }),
    invert: Object.freeze({ name: "Invert", defaults: Object.freeze({}) }),
    "selective-color": Object.freeze({ name: "Color Components", defaults: Object.freeze(createSelectiveColorDefaults()) }),
    "match-color": Object.freeze({
      name: "Palette Match",
      defaults: Object.freeze({
        sourceNodeId: null, sourceName: "None",
        sourceRedMean: 0, sourceGreenMean: 0, sourceBlueMean: 0,
        sourceRedDeviation: 0, sourceGreenDeviation: 0, sourceBlueDeviation: 0,
        luminance: 100, colorIntensity: 100, fade: 0, neutralize: false
      })
    }),
    "replace-color": Object.freeze({
      name: "Color Swap",
      defaults: Object.freeze({ sourceColor: "#000000", fuzziness: 40, hue: 0, saturation: 0, lightness: 0 })
    })
  });
  const TYPES = Object.freeze(Object.keys(DEFINITIONS));
  const HUE_RANGES = Object.freeze(["master", "reds", "yellows", "greens", "cyans", "blues", "magentas"]);
  const COLOR_BALANCE_TONES = Object.freeze(["shadows", "midtones", "highlights"]);
  const COLOR_BALANCE_AXES = Object.freeze(["CyanRed", "MagentaGreen", "YellowBlue"]);
  const CHANNEL_MIXER_OUTPUTS = Object.freeze(["red", "green", "blue"]);
  const CHANNEL_MIXER_INPUTS = Object.freeze(["Red", "Green", "Blue", "Constant"]);
  const LEVELS_CHANNELS = Object.freeze(["rgb", "red", "green", "blue"]);
  const LEVELS_PROPERTIES = Object.freeze(["InputBlack", "Gamma", "InputWhite", "OutputBlack", "OutputWhite"]);
  const LEGACY_DEFAULT_NAMES = Object.freeze({
    exposure: "Exposure", vibrance: "Vibrance", "black-white": "Black & White", "channel-mixer": "Channel Mixer",
    levels: "Levels", curves: "Curves", "photo-filter": "Photo Filter", "selective-color": "Selective Color",
    "match-color": "Match Color", "replace-color": "Replace Color"
  });

  function clamp(value, minimum, maximum, fallback = 0) {
    const number = Number(value);
    return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
  }

  function rounded(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function normalizeHexColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  }

  function normalizeCurvePoints(value) {
    const pointsByInput = new Map();
    (Array.isArray(value) ? value : []).forEach((point) => {
      const x = Math.round(clamp(point?.x, 0, 255, Number.NaN));
      const y = Math.round(clamp(point?.y, 0, 255, Number.NaN));
      if (Number.isFinite(x) && Number.isFinite(y)) pointsByInput.set(x, y);
    });
    if (!pointsByInput.has(0)) pointsByInput.set(0, 0);
    if (!pointsByInput.has(255)) pointsByInput.set(255, 255);
    return [...pointsByInput.entries()].map(([x, y]) => ({ x, y })).sort((first, second) => first.x - second.x).slice(0, 32);
  }

  /** Return the user-facing name for a registered adjustment type. */
  function nameForType(type) { return DEFINITIONS[type]?.name || DEFINITIONS["brightness-contrast"].name; }

  /** Return a mutable copy of the default properties for a registered adjustment type. */
  function defaultsForType(type) {
    const normalizedType = TYPES.includes(type) ? type : "brightness-contrast";
    return { type: normalizedType, ...DEFINITIONS[normalizedType].defaults };
  }

  /** Normalize the editable properties for a supported adjustment type. */
  function normalizeAdjustment(adjustment = {}) {
    const type = TYPES.includes(adjustment.type) ? adjustment.type : "brightness-contrast";
    if (type === "brightness-contrast") {
      return {
        type,
        brightness: Math.round(clamp(adjustment.brightness, -150, 150)),
        contrast: Math.round(clamp(adjustment.contrast, -50, 100))
      };
    }
    if (type === "exposure") {
      return {
        type,
        exposure: rounded(clamp(adjustment.exposure, -20, 20), 2),
        offset: rounded(clamp(adjustment.offset, -.5, .5), 4),
        gamma: rounded(clamp(adjustment.gamma, .01, 9.99, 1), 2)
      };
    }
    if (type === "hue-saturation") {
      return {
        type,
        hue: Math.round(clamp(adjustment.hue, -180, 180)),
        saturation: Math.round(clamp(adjustment.saturation, -100, 100)),
        lightness: Math.round(clamp(adjustment.lightness, -100, 100)),
        colorize: adjustment.colorize === true,
        range: HUE_RANGES.includes(adjustment.range) ? adjustment.range : "master"
      };
    }
    if (type === "color-balance") {
      const normalized = {
        type,
        tone: COLOR_BALANCE_TONES.includes(adjustment.tone) ? adjustment.tone : "midtones",
        preserveLuminosity: adjustment.preserveLuminosity !== false
      };
      COLOR_BALANCE_TONES.forEach((tone) => {
        COLOR_BALANCE_AXES.forEach((axis) => {
          const property = tone + axis;
          normalized[property] = Math.round(clamp(adjustment[property], -100, 100));
        });
      });
      return normalized;
    }
    if (type === "black-white") {
      return {
        type,
        reds: Math.round(clamp(adjustment.reds, -200, 300, 40)),
        yellows: Math.round(clamp(adjustment.yellows, -200, 300, 60)),
        greens: Math.round(clamp(adjustment.greens, -200, 300, 40)),
        cyans: Math.round(clamp(adjustment.cyans, -200, 300, 60)),
        blues: Math.round(clamp(adjustment.blues, -200, 300, 20)),
        magentas: Math.round(clamp(adjustment.magentas, -200, 300, 80)),
        tint: adjustment.tint === true,
        tintColor: normalizeHexColor(adjustment.tintColor, "#d8c5a0")
      };
    }
    if (type === "channel-mixer") {
      const normalized = {
        type,
        outputChannel: CHANNEL_MIXER_OUTPUTS.includes(adjustment.outputChannel) ? adjustment.outputChannel : "red",
        monochrome: adjustment.monochrome === true
      };
      CHANNEL_MIXER_OUTPUTS.forEach((output) => {
        const prefix = output + "Output";
        CHANNEL_MIXER_INPUTS.forEach((input) => {
          const property = prefix + input;
          const fallback = input === output[0].toUpperCase() + output.slice(1) ? 100 : 0;
          normalized[property] = Math.round(clamp(adjustment[property], -200, 200, fallback));
        });
      });
      normalized.monochromeRed = Math.round(clamp(adjustment.monochromeRed, -200, 200, 40));
      normalized.monochromeGreen = Math.round(clamp(adjustment.monochromeGreen, -200, 200, 40));
      normalized.monochromeBlue = Math.round(clamp(adjustment.monochromeBlue, -200, 200, 20));
      normalized.monochromeConstant = Math.round(clamp(adjustment.monochromeConstant, -200, 200));
      return normalized;
    }
    if (type === "levels") {
      const normalized = { type, channel: LEVELS_CHANNELS.includes(adjustment.channel) ? adjustment.channel : "rgb" };
      LEVELS_CHANNELS.forEach((channel) => {
        const inputBlack = Math.round(clamp(adjustment[channel + "InputBlack"], 0, 254));
        const inputWhite = Math.round(clamp(adjustment[channel + "InputWhite"], inputBlack + 1, 255, 255));
        const outputBlack = Math.round(clamp(adjustment[channel + "OutputBlack"], 0, 254));
        const outputWhite = Math.round(clamp(adjustment[channel + "OutputWhite"], outputBlack + 1, 255, 255));
        normalized[channel + "InputBlack"] = inputBlack;
        normalized[channel + "Gamma"] = rounded(clamp(adjustment[channel + "Gamma"], .1, 9.99, 1), 2);
        normalized[channel + "InputWhite"] = inputWhite;
        normalized[channel + "OutputBlack"] = outputBlack;
        normalized[channel + "OutputWhite"] = outputWhite;
      });
      return normalized;
    }
    if (type === "curves") {
      const normalized = { type, channel: LEVELS_CHANNELS.includes(adjustment.channel) ? adjustment.channel : "rgb" };
      LEVELS_CHANNELS.forEach((channel) => { normalized[channel + "Points"] = normalizeCurvePoints(adjustment[channel + "Points"]); });
      return normalized;
    }
    if (type === "photo-filter") {
      return {
        type,
        filterMode: adjustment.filterMode === "color" ? "color" : "filter",
        filter: String(adjustment.filter || "warming-85"),
        color: normalizeHexColor(adjustment.color, "#ec8a00"),
        density: Math.round(clamp(adjustment.density, 1, 100, 25)),
        preserveLuminosity: adjustment.preserveLuminosity !== false
      };
    }
    if (type === "invert") return { type };
    if (type === "selective-color") {
      const normalized = {
        type,
        selectedColor: SELECTIVE_COLOR_RANGES.includes(adjustment.selectedColor) ? adjustment.selectedColor : "reds",
        relative: adjustment.relative !== false
      };
      SELECTIVE_COLOR_RANGES.forEach((range) => {
        SELECTIVE_COLOR_COMPONENTS.forEach((component) => {
          const property = range + component;
          normalized[property] = Math.round(clamp(adjustment[property], -100, 100));
        });
      });
      return normalized;
    }
    if (type === "match-color") {
      return {
        type,
        sourceNodeId: adjustment.sourceNodeId ? String(adjustment.sourceNodeId) : null,
        sourceName: String(adjustment.sourceName || "None"),
        sourceRedMean: rounded(clamp(adjustment.sourceRedMean, 0, 1), 6),
        sourceGreenMean: rounded(clamp(adjustment.sourceGreenMean, 0, 1), 6),
        sourceBlueMean: rounded(clamp(adjustment.sourceBlueMean, 0, 1), 6),
        sourceRedDeviation: rounded(clamp(adjustment.sourceRedDeviation, 0, 1), 6),
        sourceGreenDeviation: rounded(clamp(adjustment.sourceGreenDeviation, 0, 1), 6),
        sourceBlueDeviation: rounded(clamp(adjustment.sourceBlueDeviation, 0, 1), 6),
        luminance: Math.round(clamp(adjustment.luminance, 1, 200, 100)),
        colorIntensity: Math.round(clamp(adjustment.colorIntensity, 1, 200, 100)),
        fade: Math.round(clamp(adjustment.fade, 0, 100)),
        neutralize: adjustment.neutralize === true
      };
    }
    if (type === "replace-color") {
      return {
        type,
        sourceColor: normalizeHexColor(adjustment.sourceColor, "#000000"),
        fuzziness: Math.round(clamp(adjustment.fuzziness, 0, 200, 40)),
        hue: Math.round(clamp(adjustment.hue, -180, 180)),
        saturation: Math.round(clamp(adjustment.saturation, -100, 100)),
        lightness: Math.round(clamp(adjustment.lightness, -100, 100))
      };
    }
    return {
      type,
      vibrance: Math.round(clamp(adjustment.vibrance, -100, 100)),
      saturation: Math.round(clamp(adjustment.saturation, -100, 100))
    };
  }

  /** Normalize the grayscale raster mask attached to an adjustment layer. */
  function normalizeMask(mask = {}) {
    const bounds = mask.bounds && Number.isFinite(Number(mask.bounds.width)) && Number.isFinite(Number(mask.bounds.height))
      ? {
          x: Math.round(Number(mask.bounds.x) || 0),
          y: Math.round(Number(mask.bounds.y) || 0),
          width: Math.max(1, Math.round(Number(mask.bounds.width) || 1)),
          height: Math.max(1, Math.round(Number(mask.bounds.height) || 1))
        }
      : null;
    return {
      type: "raster",
      enabled: mask.enabled !== false,
      assetId: mask.assetId ? String(mask.assetId) : null,
      bounds,
      defaultValue: Math.round(clamp(mask.defaultValue, 0, 255, 255))
    };
  }

  /** Create a hierarchy node representing a supported adjustment layer. */
  function create(type = "brightness-contrast", options = {}) {
    const adjustment = normalizeAdjustment({ type, ...(options.adjustment || {}) });
    return {
      id: namespace.createImageEditorId("adjustment"),
      kind: "adjustment",
      name: String(options.name || nameForType(adjustment.type)),
      visible: options.visible !== false,
      locked: options.locked === true,
      opacity: clamp(options.opacity, 0, 1, 1),
      blendMode: "normal",
      adjustment,
      mask: normalizeMask(options.mask),
      effects: [],
      extensions: { ...(options.extensions || {}) }
    };
  }

  /** Normalize adjustment nodes loaded from native projects. */
  function normalizeDocument(document) {
    namespace.walkDocumentNodes(document, (node) => {
      if (node.kind !== "adjustment") return;
      node.adjustment = normalizeAdjustment(node.adjustment);
      if (node.name === LEGACY_DEFAULT_NAMES[node.adjustment.type]) node.name = nameForType(node.adjustment.type);
      node.mask = normalizeMask(node.mask);
      node.opacity = clamp(node.opacity, 0, 1, 1);
      node.visible = node.visible !== false;
      node.locked = node.locked === true;
      node.blendMode = "normal";
      node.effects = Array.isArray(node.effects) ? node.effects : [];
      node.extensions = node.extensions && typeof node.extensions === "object" ? node.extensions : {};
    });
    return document;
  }

  /** Return whether a hierarchy node is a valid supported adjustment layer. */
  function validate(node) {
    if (node?.kind !== "adjustment" || !TYPES.includes(node.adjustment?.type)) return false;
    const normalized = normalizeAdjustment(node.adjustment);
    const properties = {
      "brightness-contrast": ["brightness", "contrast"],
      exposure: ["exposure", "offset", "gamma"],
      vibrance: ["vibrance", "saturation"],
      "hue-saturation": ["hue", "saturation", "lightness"],
      "color-balance": COLOR_BALANCE_TONES.flatMap((tone) => COLOR_BALANCE_AXES.map((axis) => tone + axis)),
      "black-white": ["reds", "yellows", "greens", "cyans", "blues", "magentas"],
      "channel-mixer": [
        ...CHANNEL_MIXER_OUTPUTS.flatMap((output) => CHANNEL_MIXER_INPUTS.map((input) => output + "Output" + input)),
        "monochromeRed", "monochromeGreen", "monochromeBlue", "monochromeConstant"
      ],
      levels: LEVELS_CHANNELS.flatMap((channel) => LEVELS_PROPERTIES.map((property) => channel + property)),
      curves: [],
      "photo-filter": ["density"],
      invert: [],
      "selective-color": SELECTIVE_COLOR_RANGES.flatMap((range) => SELECTIVE_COLOR_COMPONENTS.map((component) => range + component)),
      "match-color": ["sourceRedMean", "sourceGreenMean", "sourceBlueMean", "sourceRedDeviation", "sourceGreenDeviation", "sourceBlueDeviation", "luminance", "colorIntensity", "fade"],
      "replace-color": ["fuzziness", "hue", "saturation", "lightness"]
    }[normalized.type];
    if (properties.some((property) => normalized[property] !== Number(node.adjustment[property]))) return false;
    if (normalized.type === "hue-saturation" && (normalized.colorize !== node.adjustment.colorize || normalized.range !== node.adjustment.range)) return false;
    if (normalized.type === "color-balance" && (normalized.tone !== node.adjustment.tone || normalized.preserveLuminosity !== node.adjustment.preserveLuminosity)) return false;
    if (normalized.type === "black-white" && (normalized.tint !== node.adjustment.tint || normalized.tintColor !== node.adjustment.tintColor)) return false;
    if (normalized.type === "channel-mixer" && (normalized.outputChannel !== node.adjustment.outputChannel || normalized.monochrome !== node.adjustment.monochrome)) return false;
    if (normalized.type === "levels" && normalized.channel !== node.adjustment.channel) return false;
    if (normalized.type === "curves") {
      if (normalized.channel !== node.adjustment.channel) return false;
      if (LEVELS_CHANNELS.some((channel) => JSON.stringify(normalized[channel + "Points"]) !== JSON.stringify(node.adjustment[channel + "Points"]))) return false;
    }
    if (normalized.type === "photo-filter" && (normalized.filterMode !== node.adjustment.filterMode || normalized.filter !== node.adjustment.filter || normalized.color !== node.adjustment.color || normalized.preserveLuminosity !== node.adjustment.preserveLuminosity)) return false;
    if (normalized.type === "selective-color" && (normalized.selectedColor !== node.adjustment.selectedColor || normalized.relative !== node.adjustment.relative)) return false;
    if (normalized.type === "match-color" && (normalized.sourceNodeId !== node.adjustment.sourceNodeId || normalized.sourceName !== node.adjustment.sourceName || normalized.neutralize !== node.adjustment.neutralize)) return false;
    if (normalized.type === "replace-color" && normalized.sourceColor !== node.adjustment.sourceColor) return false;
    const mask = normalizeMask(node.mask);
    if (mask.assetId && !mask.bounds) return false;
    return node.mask?.type === "raster" && mask.defaultValue === Number(node.mask.defaultValue);
  }

  /** Return whether a node is an adjustment layer. */
  function isAdjustment(node) { return node?.kind === "adjustment" && TYPES.includes(node.adjustment?.type); }

  namespace.ImageEditorAdjustmentModel = { DEFINITIONS, TYPES, HUE_RANGES, COLOR_BALANCE_TONES, COLOR_BALANCE_AXES, CHANNEL_MIXER_OUTPUTS, CHANNEL_MIXER_INPUTS, LEVELS_CHANNELS, LEVELS_PROPERTIES, SELECTIVE_COLOR_RANGES, SELECTIVE_COLOR_COMPONENTS, create, defaultsForType, isAdjustment, nameForType, normalizeAdjustment, normalizeCurvePoints, normalizeMask, normalizeDocument, validate };
})(typeof window !== "undefined" ? window : globalThis);
