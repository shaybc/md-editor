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
  assert.equal(state.brushType, "round");
  assert.equal(state.width, 640);
  assert.equal(state.height, 480);
  assert.equal(state.setZoom(20), 8);
  assert.equal(state.setZoom(0.1), 0.25);
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
