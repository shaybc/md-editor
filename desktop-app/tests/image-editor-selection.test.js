const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSelection() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/selection.js"), "utf8"),
    context
  );
  return context.window.MarkdownViewerImageEditor.ImageEditorSelection;
}

function contextStub() {
  const calls = [];
  return {
    calls,
    fillStyle: "",
    getImageData(x, y, width, height) {
      calls.push(["get", x, y, width, height]);
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    },
    fillRect(x, y, width, height) { calls.push(["fill", x, y, width, height, this.fillStyle]); },
    putImageData(data, x, y) { calls.push(["put", data.width, data.height, x, y]); }
  };
}

test("selection normalizes and clamps a rectangular marquee", () => {
  const Selection = loadSelection();
  const selection = new Selection();

  assert.deepEqual(
    JSON.parse(JSON.stringify(selection.setRect({ x: 9, y: 8 }, { x: -2, y: 3 }, { width: 10, height: 10 }))),
    { x: 0, y: 3, width: 9, height: 5 }
  );
});

test("selection lift, move, and commit preserve selected pixels", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  const context = contextStub();
  selection.setRect({ x: 1, y: 1 }, { x: 4, y: 4 }, { width: 10, height: 10 });

  assert.equal(selection.lift(context, "#abcdef", true), true);
  selection.moveBy(2, 1, { width: 10, height: 10 });
  selection.commit(context);

  assert.ok(context.calls.some((call) => call[0] === "fill" && call[5] === "#abcdef"));
  assert.ok(context.calls.some((call) => call[0] === "put" && call[3] === 3 && call[4] === 2));
});


test("selection lift can create a floating copy without clearing the source", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  const context = contextStub();
  selection.setRect({ x: 2, y: 2 }, { x: 5, y: 5 }, { width: 10, height: 10 });

  assert.equal(selection.lift(context, "#abcdef", false), true);
  selection.moveBy(2, 1, { width: 10, height: 10 });
  selection.commit(context);

  assert.equal(context.calls.some((call) => call[0] === "fill"), false);
  assert.ok(context.calls.some((call) => call[0] === "put" && call[3] === 4 && call[4] === 3));
});
test("cut retains an internal clipboard and delete uses the background color", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  const context = contextStub();
  selection.setRect({ x: 0, y: 0 }, { x: 2, y: 2 }, { width: 10, height: 10 });

  const copied = selection.cut(context, "#123456");
  assert.equal(copied.width, 2);
  assert.equal(selection.hasSelection, false);
  assert.ok(context.calls.some((call) => call[0] === "fill" && call[5] === "#123456"));
});
