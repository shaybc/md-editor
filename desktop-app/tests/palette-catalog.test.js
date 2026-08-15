const test = require("node:test");
const assert = require("node:assert/strict");

const catalog = require("../resources/js/image-editor/palettes/palette-catalog.js");

test("palette catalog preserves the legacy default colors", () => {
  assert.deepEqual(catalog.DEFAULT_PALETTE_COLORS, [
    "#000000", "#7F7F7F", "#880015", "#ED1C24", "#FF7F27",
    "#FFF200", "#22B14C", "#00A2E8", "#3F48CC", "#A349A4",
    "#FFFFFF", "#C3C3C3", "#B97A57", "#FFAEC9", "#FFC90E",
    "#EFE4B0", "#B5E61D", "#99D9EA", "#7092BE", "#C8BFE7"
  ]);
});

test("palette catalog contains thirty reviewed twelve-color built-ins", () => {
  assert.equal(catalog.BUILT_IN_PALETTES.length, 30);
  catalog.BUILT_IN_PALETTES.forEach((palette) => {
    assert.equal(palette.colors.length, 12, palette.name);
    palette.colors.forEach((color) => assert.match(color, /^#[0-9A-F]{6}$/));
  });
});

test("built-in and incomplete custom palettes resolve to twenty toolbar swatches", () => {
  const builtIn = catalog.toolbarColors(catalog.BUILT_IN_PALETTES[0]);
  assert.deepEqual(builtIn.slice(12), catalog.BASIC_COLORS);
  assert.equal(builtIn.length, 20);

  const custom = catalog.toolbarColors({ source: "custom", slots: ["#123456", null] });
  assert.equal(custom.length, 20);
  assert.equal(custom[0], "#123456");
  assert.equal(custom[1], "#FFFFFF");
  assert.deepEqual(custom.slice(12), catalog.BASIC_COLORS);
});

test("default previews twelve colors but exports all twenty", () => {
  assert.deepEqual(catalog.previewColors(catalog.DEFAULT_PALETTE), catalog.DEFAULT_PALETTE_COLORS.slice(0, 12));
  assert.deepEqual(catalog.exportColors(catalog.DEFAULT_PALETTE), catalog.DEFAULT_PALETTE_COLORS);
});
