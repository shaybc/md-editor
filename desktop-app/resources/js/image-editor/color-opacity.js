// Shared color and opacity calculations for image-editor controls and drawing tools.
(function(global) {
  "use strict";

  const namespace = global.MarkdownViewerImageEditor = global.MarkdownViewerImageEditor || {};

  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

  function hexToRgb(hex) {
    const value = String(hex || "#000000").replace("#", "").padEnd(6, "0").slice(0, 6);
    return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) || 0);
  }

  function rgbToHex(red, green, blue) {
    return `#${[red, green, blue].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
  }

  function hexToHsv(hex) {
    const [red, green, blue] = hexToRgb(hex).map((channel) => channel / 255);
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta) {
      if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (maximum === green) hue = 60 * (((blue - red) / delta) + 2);
      else hue = 60 * (((red - green) / delta) + 4);
    }
    return { h: (hue + 360) % 360, s: maximum ? delta / maximum : 0, v: maximum };
  }

  function hsvToHex(hue, saturation, value) {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = clamp(saturation);
    const v = clamp(value);
    const chroma = v * s;
    const section = h / 60;
    const secondary = chroma * (1 - Math.abs(section % 2 - 1));
    const offset = v - chroma;
    const channels = section < 1 ? [chroma, secondary, 0]
      : section < 2 ? [secondary, chroma, 0]
        : section < 3 ? [0, chroma, secondary]
          : section < 4 ? [0, secondary, chroma]
            : section < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    return rgbToHex(...channels.map((channel) => (channel + offset) * 255));
  }

  function formatAlpha(opacity) {
    return String(Math.round(clamp(opacity) * 100) / 100);
  }

  function colorWithOpacity(hex, opacity = 1) {
    const [red, green, blue] = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(opacity)})`;
  }

  function compositeRgb(foreground, opacity, background) {
    const alpha = clamp(opacity);
    return foreground.map((channel, index) => Math.round(channel * alpha + background[index] * (1 - alpha)));
  }

  function relativeLuminance(rgb) {
    const channels = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrastTextColor(hex, opacity = 1, backgroundHex = "#ffffff") {
    const rendered = compositeRgb(hexToRgb(hex), opacity, hexToRgb(backgroundHex));
    const luminance = relativeLuminance(rendered);
    const blackContrast = (luminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance + 0.05);
    return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
  }

  function palettePreviewColors(saturation, value, opacity) {
    return [
      ["Yellow", 50], ["Orange", 25], ["Pink", 335], ["Purple", 270], ["Blue", 210]
    ].map(([name, hue]) => {
      const hex = hsvToHex(hue, saturation, value);
      return { name, hue, hex, rgba: colorWithOpacity(hex, opacity) };
    });
  }

  Object.assign(namespace, {
    clampImageEditorColorValue: clamp,
    imageEditorHexToRgb: hexToRgb,
    imageEditorHexToHsv: hexToHsv,
    imageEditorHsvToHex: hsvToHex,
    imageEditorColorWithOpacity: colorWithOpacity,
    imageEditorCompositeRgb: compositeRgb,
    imageEditorContrastTextColor: contrastTextColor,
    imageEditorPalettePreviewColors: palettePreviewColors
  });

  if (typeof module !== "undefined" && module.exports) module.exports = {
    clamp, hexToRgb, hexToHsv, hsvToHex, formatAlpha, colorWithOpacity, compositeRgb, contrastTextColor, palettePreviewColors
  };
})(typeof window !== "undefined" ? window : globalThis);
