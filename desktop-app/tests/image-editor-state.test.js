const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadState() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/state.js"), "utf8"),
    context
  );
  return context.window.MarkdownViewerImageEditor;
}

test("image editor state exposes Paint defaults and bounded zoom", () => {
  const { ImageEditorState } = loadState();
  const state = new ImageEditorState({ width: 640, height: 480 });

  assert.equal(state.tool, "pencil");
  assert.equal(state.foregroundColor, "#111111");
  assert.equal(state.backgroundColor, "#ffffff");
  assert.equal(state.foregroundOpacity, 1);
  assert.equal(state.backgroundOpacity, 1);
  assert.equal(state.brushType, "round");
  assert.equal(state.width, 640);
  assert.equal(state.height, 480);
  assert.equal(state.setZoom(20), 8);
  assert.equal(state.setZoom(0.1), 0.25);
});

test("image editor state restores independently clamped foreground and background opacity", () => {
  const { ImageEditorState } = loadState();
  const state = new ImageEditorState({ foregroundOpacity: 0.35, backgroundOpacity: 2 });

  assert.equal(state.foregroundOpacity, 0.35);
  assert.equal(state.backgroundOpacity, 1);
});

test("image editor state restores extended text formatting with legacy-safe defaults", () => {
  const { ImageEditorState } = loadState();
  const defaults = new ImageEditorState();
  assert.deepEqual({
    underline: defaults.fontUnderline,
    strikethrough: defaults.fontStrikethrough,
    textCase: defaults.textCase,
    align: defaults.textAlign,
    list: defaults.textListStyle,
    direction: defaults.textDirection,
    letterSpacing: defaults.textLetterSpacing,
    lineSpacing: defaults.textLineSpacing,
    anchor: defaults.textAnchor,
    position: defaults.textPosition,
    kerning: defaults.textKerning,
    ligatures: defaults.textLigatures
  }, {
    underline: false,
    strikethrough: false,
    textCase: "normal",
    align: "left",
    list: "none",
    direction: "ltr",
    letterSpacing: 0,
    lineSpacing: 1.2,
    anchor: "top",
    position: "normal",
    kerning: "auto",
    ligatures: "normal"
  });

  const restored = new ImageEditorState({
    fontUnderline: true,
    fontStrikethrough: true,
    textCase: "uppercase",
    textAlign: "justify",
    textListStyle: "bullet",
    textDirection: "rtl",
    textLetterSpacing: 99,
    textLineSpacing: 0.2,
    textAnchor: "bottom",
    textPosition: "subscript",
    textKerning: "none",
    textLigatures: "none"
  });
  assert.equal(restored.fontUnderline, true);
  assert.equal(restored.fontStrikethrough, true);
  assert.equal(restored.textCase, "uppercase");
  assert.equal(restored.textAlign, "justify");
  assert.equal(restored.textListStyle, "bullet");
  assert.equal(restored.textDirection, "rtl");
  assert.equal(restored.textLetterSpacing, 20);
  assert.equal(restored.textLineSpacing, 0.8);
  assert.equal(restored.textAnchor, "bottom");
  assert.equal(restored.textPosition, "subscript");
  assert.equal(restored.textKerning, "none");
  assert.equal(restored.textLigatures, "none");
});

test("image editor state tracks dirty and saved revisions", () => {
  const { ImageEditorState } = loadState();
  const state = new ImageEditorState();

  assert.equal(state.isDirty, false);
  state.markChanged();
  assert.equal(state.isDirty, true);
  state.markSaved();
  assert.equal(state.isDirty, false);
  state.setDirty(true);
  assert.equal(state.isDirty, true);
});

test("image editor rejects tools outside the supported tool set", () => {
  const { ImageEditorState } = loadState();
  const state = new ImageEditorState();

  assert.throws(() => state.setTool("lasso"), /Unsupported image tool/);
  assert.equal(state.setTool("ellipse"), "ellipse");
  assert.equal(state.setTool("bucket"), "bucket");
});
