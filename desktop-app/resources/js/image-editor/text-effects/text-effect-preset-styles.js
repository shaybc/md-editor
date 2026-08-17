// Art direction for the editable text-effect preset catalog.
(function(global) {
  "use strict";
  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const EFFECT_IDS = Object.freeze([
    "snail-stack", "pink-relief", "white-prism", "king-gold", "good-vibes-stack", "jokes-pop",
    "buck-script", "magic-script", "sticky-paper", "upward-stack", "vintage-ribbon", "vibes-script",
    "shop-now-prism", "heat-cutout", "paper-print", "neon-lights", "tv-static", "retro-70s",
    "sci-fi", "screenprint", "western", "graffiti", "bubble", "aerobics", "arcade", "cosmic",
    "pixel", "gold-foil", "spring-bloom", "soft-white", "bold-shadow", "super-pop", "candy-gloss",
    "pink-dose", "comic-boom", "vintage-script", "pastel-3d", "stone", "cracked-concrete",
    "sticker", "long-shadow", "chrome", "retro-outline", "paper-cut", "rainbow-stack",
    "electric-blue", "firelight"
  ]);

  const FONT_FAMILIES = Object.freeze([
    "Arial Black", "Segoe Script", "Georgia", "Palatino Linotype", "Bahnschrift", "Trebuchet MS",
    "Segoe Print", "Segoe UI Black", "Impact", "Comic Sans MS", "Franklin Gothic Heavy",
    "Century Gothic", "Cooper Black", "Cambria", "Calibri", "Candara", "Consolas", "Courier New",
    "Constantia", "Corbel", "Ebrima", "Franklin Gothic Medium", "Gabriola", "Gadugi", "Garamond",
    "Ink Free", "Javanese Text", "Lucida Console", "Lucida Sans Unicode", "Malgun Gothic",
    "Microsoft JhengHei", "Microsoft New Tai Lue", "Microsoft PhagsPa", "Microsoft Sans Serif",
    "Microsoft Tai Le", "Microsoft YaHei", "Mongolian Baiti", "MV Boli", "Nirmala UI", "Segoe UI",
    "Sitka Text", "Sylfaen", "Tahoma", "Times New Roman", "Verdana", "Yu Gothic", "Book Antiqua",
    "Rockwell"
  ]);

  const CURVE_AMOUNTS = Object.freeze({
    "snail-stack": 12,
    "pink-relief": -18,
    "good-vibes-stack": 24,
    "buck-script": 16,
    "magic-script": -14,
    "vintage-ribbon": 28,
    "vibes-script": -22,
    "shop-now-prism": 10,
    "neon-lights": 20,
    western: -12,
    "comic-boom": 18,
    firelight: -20
  });

  const BACKGROUNDS = Object.freeze({
    "snail-stack": { colors: ["#09aeb1", "#087880"], angle: 145, radius: 12 },
    "pink-relief": { colors: ["#ff9b86", "#ff7c73"], angle: 35, radius: 12 },
    "white-prism": { colors: ["#1768c9", "#d62fc4"], angle: 120, radius: 12 },
    "king-gold": { colors: ["#6e080d", "#220205"], angle: 160, radius: 10 },
    "good-vibes-stack": { colors: ["#052846", "#07162f"], angle: 90, radius: 8 },
    "jokes-pop": { colors: ["#cceee6", "#eff9ef"], angle: 145, radius: 10 },
    "buck-script": { colors: ["#0c8c91", "#085f68"], angle: 20, radius: 10 },
    "magic-script": { colors: ["#fff9e9", "#f3ebd9"], angle: 180, radius: 10 },
    "sticky-paper": { colors: ["#ff004f", "#ff295f"], angle: 90, radius: 8 },
    "upward-stack": { colors: ["#fffef6", "#edf8f5"], angle: 135, radius: 8 },
    "vintage-ribbon": { colors: ["#e2f7ff", "#bceafa"], angle: 160, radius: 12 },
    "vibes-script": { colors: ["#f9e9ec", "#ead8e6"], angle: 25, radius: 12 },
    "shop-now-prism": { colors: ["#1ab5ca", "#d85cc2", "#6476dc"], angle: 120, radius: 12 },
    "heat-cutout": { colors: ["#ffd7dd", "#f5c0ca"], angle: 45, radius: 10 },
    "paper-print": { colors: ["#d7bbff", "#f2d7ff"], angle: 110, radius: 9 },
    "neon-lights": { colors: ["#16062c", "#32104c"], angle: 145, radius: 10 },
    "tv-static": { colors: ["#070b12", "#1b2331"], angle: 90, radius: 4 },
    "sci-fi": { colors: ["#102b22", "#071713"], angle: 20, radius: 6 },
    arcade: { colors: ["#111049", "#080626"], angle: 145, radius: 5 },
    cosmic: { colors: ["#161642", "#42165d"], angle: 130, radius: 12 },
    pixel: { colors: ["#080f20", "#17113b"], angle: 45, radius: 3 },
    "gold-foil": { colors: ["#56330e", "#251403"], angle: 160, radius: 10 },
    "spring-bloom": { colors: ["#fff0d9", "#f8dfc9"], angle: 35, radius: 12 },
    "bold-shadow": { colors: ["#148ba2", "#0c536a"], angle: 120, radius: 8 },
    "comic-boom": { colors: ["#f14562", "#8f1733"], angle: 155, radius: 6 },
    stone: { colors: ["#454545", "#202020"], angle: 180, radius: 5 },
    "cracked-concrete": { colors: ["#35322f", "#151413"], angle: 25, radius: 4 },
    "long-shadow": { colors: ["#39b6af", "#197b78"], angle: 135, radius: 5 },
    chrome: { colors: ["#182337", "#050a12"], angle: 90, radius: 8 },
    "electric-blue": { colors: ["#071d46", "#080926"], angle: 120, radius: 10 },
    firelight: { colors: ["#48110c", "#140302"], angle: 35, radius: 10 }
  });

  function enhancement(index) {
    if (index < 15) {
      return { innerGlow: ["hsl(" + ((index * 29 + 35) % 360) + " 90% 88%)", 1.5 + index % 3, .58 + index / 100] };
    }
    const hue = (index * 47 + 19) % 360;
    const dark = "hsl(" + hue + " 64% 18%)";
    const mid = "hsl(" + ((hue + 32) % 360) + " 72% 38%)";
    const light = "hsl(" + ((hue + 12) % 360) + " 90% 86%)";
    const mode = index % 6;
    if (mode === 0) return { outlineLayers: [[mid, 3], [dark, 6]], extrusions: [[dark, 7, 1, 1]], innerGlow: [light, 2, .72] };
    if (mode === 1) return { glow: [mid, 7 + index % 8], innerGlow: [light, 2.5, .66], shadow: [dark, 4, 3, 5] };
    if (mode === 2) return { outlineLayers: [[mid, 4]], shadow: [dark, 2, -4, 5], highlight: light };
    if (mode === 3) return { extrusions: [[mid, 5, -1, 1], [dark, 9, -1, 1]], shadow: [dark, 5, -6, 8] };
    if (mode === 4) return { glow: [mid, 5 + index % 9], innerGlow: [light, 3, .76], highlight: light };
    return { outlineLayers: [[light, 2], [dark, 5]], shadow: [mid, 1, 5, -3] };
  }

  const profiles = Object.fromEntries(EFFECT_IDS.map((id, index) => {
    const curve = CURVE_AMOUNTS[id];
    const outlineHue = (index * 47 + 19) % 360;
    const effectDetails = enhancement(index);
    const typography = {
      fontFamily: FONT_FAMILIES[index],
      fontSize: Number((38 + index * .7).toFixed(1)),
      fontBold: index % 3 !== 1,
      fontItalic: index % 4 === 1 || index % 7 === 0,
      textCase: index % 5 === 0 ? "uppercase" : index % 11 === 0 ? "lowercase" : "normal",
      textAlign: index % 4 === 0 ? "center" : "left",
      textLetterSpacing: Number((-2 + index % 10 * .43).toFixed(2)),
      textLineSpacing: Number((.9 + index % 6 * .09).toFixed(2)),
      rotationDegrees: Number((-11.75 + index * .5).toFixed(2)),
      previewSize: 20 + index % 8,
      ...(Number.isFinite(curve) ? { curve } : {})
    };
    return [id, Object.freeze({
      typography: Object.freeze(typography),
      gradientAngle: (17 + index * 7) % 180,
      ...(BACKGROUNDS[id] ? { background: Object.freeze(BACKGROUNDS[id]) } : {}),
      ...effectDetails,
      outlineLayers: Object.freeze([
        ...(effectDetails.outlineLayers || []),
        ["hsl(" + outlineHue + " 76% 30%)", Number((2.25 + index * .04).toFixed(2))]
      ])
    })];
  }));

  namespace.ImageEditorTextEffectPresetStyles = Object.freeze(profiles);
})(typeof window !== "undefined" ? window : globalThis);
