const test = require("node:test");
const assert = require("node:assert/strict");

const colors = require("../resources/js/image-editor/color-opacity.js");

test("converts between hex and HSV without losing primary colors", () => {
  assert.deepEqual(colors.hexToHsv("#ff0000"), { h: 0, s: 1, v: 1 });
  assert.equal(colors.hsvToHex(120, 1, 1), "#00ff00");
  assert.equal(colors.hsvToHex(240, 1, 1), "#0000ff");
});

test("clamps and formats opacity for RGBA output", () => {
  assert.equal(colors.colorWithOpacity("#123456", 0.375), "rgba(18, 52, 86, 0.38)");
  assert.equal(colors.colorWithOpacity("#123456", 2), "rgba(18, 52, 86, 1)");
  assert.equal(colors.colorWithOpacity("#123456", -1), "rgba(18, 52, 86, 0)");
});

test("composites alpha and selects contrasting black or white text", () => {
  assert.deepEqual(colors.compositeRgb([255, 0, 0], 0.5, [255, 255, 255]), [255, 128, 128]);
  assert.equal(colors.contrastTextColor("#ffffff", 1, "#000000"), "#000000");
  assert.equal(colors.contrastTextColor("#000000", 1, "#ffffff"), "#ffffff");
  assert.equal(colors.contrastTextColor("#000000", 0, "#ffffff"), "#000000");
});

test("generates fixed palette hues with shared saturation, value, and opacity", () => {
  const palette = colors.palettePreviewColors(0.75, 0.6, 0.4);
  assert.deepEqual(palette.map((entry) => entry.hue), [50, 25, 335, 270, 210]);
  assert.deepEqual(palette.map((entry) => entry.name), ["Yellow", "Orange", "Pink", "Purple", "Blue"]);
  palette.forEach((entry) => {
    const hsv = colors.hexToHsv(entry.hex);
    assert.ok(Math.abs(hsv.s - 0.75) < 0.01);
    assert.ok(Math.abs(hsv.v - 0.6) < 0.01);
    assert.match(entry.rgba, /, 0\.4\)$/);
  });
});

test("formats picker colors as Hex, HSL, RGB, and LCH", () => {
  assert.deepEqual(colors.colorDisplayValues("#579931"), {
    hex: "#579931",
    hsl: "hsl(98deg 51% 40%)",
    rgb: "rgb(87 153 49)",
    lch: "lch(57% 61 131deg)"
  });
});
