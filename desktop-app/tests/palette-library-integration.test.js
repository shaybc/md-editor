const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const resources = path.join(__dirname, "..", "resources");

test("palette modules load before the image editor and share its namespace", () => {
  const html = fs.readFileSync(path.join(resources, "index.html"), "utf8");
  const editorIndex = html.indexOf('src="js/image-editor/index.js"');
  [
    "palettes/palette-catalog.js",
    "palettes/palette-store.js",
    "palettes/ase-codec.js",
    "palettes/palette-preview.js",
    "palettes/palette-dialog.js"
  ].forEach((source) => {
    const position = html.indexOf(source);
    assert.ok(position >= 0, `${source} is loaded`);
    assert.ok(position < editorIndex, `${source} loads before image-editor/index.js`);
  });

  const controller = fs.readFileSync(path.join(resources, "js", "image-editor", "index.js"), "utf8");
  assert.match(controller, /namespace\.ImageEditorPaletteStore/);
  assert.match(controller, /namespace\.ImageEditorAseCodec/);
  assert.match(controller, /namespace\.ImageEditorPaletteDialog/);
});

test("palette toolbar includes the app-wide management action", () => {
  const view = fs.readFileSync(path.join(resources, "js", "image-editor", "view.js"), "utf8");
  assert.match(view, /data-palette-library/);
  assert.match(view, /aria-label="Manage color palettes"/);
  assert.match(view, /setPaletteColors\(colors\)/);
});
