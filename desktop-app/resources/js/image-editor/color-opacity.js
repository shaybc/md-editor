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

  function rgbToHsl(red, green, blue) {
    const channels = [red, green, blue].map((channel) => clamp(channel, 0, 255) / 255);
    const maximum = Math.max(...channels);
    const minimum = Math.min(...channels);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    let hue = 0;
    if (delta) {
      if (maximum === channels[0]) hue = 60 * (((channels[1] - channels[2]) / delta) % 6);
      else if (maximum === channels[1]) hue = 60 * (((channels[2] - channels[0]) / delta) + 2);
      else hue = 60 * (((channels[0] - channels[1]) / delta) + 4);
    }
    const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
    return { h: (hue + 360) % 360, s: saturation, l: lightness };
  }

  function rgbToLch(red, green, blue) {
    const linear = [red, green, blue].map((channel) => {
      const value = clamp(channel, 0, 255) / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    const x = (linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375) / 0.95047;
    const y = linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.072175;
    const z = (linear[0] * 0.0193339 + linear[1] * 0.119192 + linear[2] * 0.9503041) / 1.08883;
    const pivot = (value) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
    const fx = pivot(x);
    const fy = pivot(y);
    const fz = pivot(z);
    const lightness = Math.max(0, 116 * fy - 16);
    const a = 500 * (fx - fy);
    const b = 200 * (fy - fz);
    return { l: lightness, c: Math.sqrt(a * a + b * b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
  }

  /** Format one opaque color for the standard picker value rows. */
  function colorDisplayValues(hex) {
    const normalized = rgbToHex(...hexToRgb(hex)).toUpperCase();
    const [red, green, blue] = hexToRgb(normalized);
    const hsl = rgbToHsl(red, green, blue);
    const lch = rgbToLch(red, green, blue);
    return {
      hex: normalized,
      hsl: `hsl(${Math.round(hsl.h)}deg ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%)`,
      rgb: `rgb(${red} ${green} ${blue})`,
      lch: `lch(${Math.round(lch.l)}% ${Math.round(lch.c)} ${Math.round(lch.h)}deg)`
    };
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
    imageEditorColorDisplayValues: colorDisplayValues,
    imageEditorCompositeRgb: compositeRgb,
    imageEditorContrastTextColor: contrastTextColor,
    imageEditorPalettePreviewColors: palettePreviewColors
  });

  if (typeof module !== "undefined" && module.exports) module.exports = {
    clamp, hexToRgb, hexToHsv, hsvToHex, formatAlpha, colorWithOpacity, rgbToHsl, rgbToLch, colorDisplayValues, compositeRgb, contrastTextColor, palettePreviewColors
  };
})(typeof window !== "undefined" ? window : globalThis);
