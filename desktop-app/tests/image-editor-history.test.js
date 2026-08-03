const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadHistory() {
  const context = { window: {}, Uint8ClampedArray };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/history.js"), "utf8"),
    context
  );
  return context.window.MarkdownViewerImageEditor.ImageEditorHistory;
}

function image(value) {
  return { width: 1, height: 1, data: new Uint8ClampedArray([value, 0, 0, 255]) };
}

test("history undoes, redoes, and invalidates redo after a branch", () => {
  const History = loadHistory();
  const history = new History();
  history.push(image(1), image(2));

  assert.equal(history.undo().data[0], 1);
  assert.equal(history.redo().data[0], 2);
  history.undo();
  history.push(image(1), image(3));
  assert.equal(history.canRedo, false);
  assert.equal(history.undo().data[0], 1);
});

test("history reports when undo or redo reaches the saved token", () => {
  const History = loadHistory();
  const history = new History();
  history.push(image(1), image(2));
  history.markSaved();
  assert.equal(history.isAtSavedState, true);

  history.undo();
  assert.equal(history.isAtSavedState, false);
  history.redo();
  assert.equal(history.isAtSavedState, true);
});

test("history enforces its transaction count limit", () => {
  const History = loadHistory();
  const history = new History({ maxEntries: 2, maxBytes: 1024 });
  history.push(image(0), image(1));
  history.push(image(1), image(2));
  history.push(image(2), image(3));

  assert.equal(history.undoStack.length, 2);
  assert.equal(history.undo().data[0], 2);
  assert.equal(history.undo().data[0], 1);
  assert.equal(history.undo(), null);
});
