const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSelection() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  ["selection-transform.js", "selection-shapes.js", "selection.js"].forEach((file) => {
    vm.runInContext(
      fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/" + file), "utf8"),
      context
    );
  });
  return context.window.MarkdownViewerImageEditor.ImageEditorSelection;
}

function loadCanvasContextActions() {
  class ImageDataStub {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  const context = { window: {}, ImageData: ImageDataStub };
  context.window.window = context.window;
  context.window.ImageData = ImageDataStub;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/canvas-context-menu.js"), "utf8"),
    context
  );
  return context.window.MarkdownViewerImageEditor;
}

function loadObjectAlignmentGuides() {
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/image-editor/object-alignment-guides.js"), "utf8"),
    context
  );
  return context.window.MarkdownViewerImageEditor.resolveObjectAlignment;
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

test("canvas context actions calculate inverse marquee regions", () => {
  const actions = loadCanvasContextActions();
  const regions = actions.imageEditorInverseSelectionRects(
    { x: 2, y: 3, width: 4, height: 2 },
    { width: 10, height: 8 }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(regions)), [
    { x: 0, y: 0, width: 10, height: 3 },
    { x: 0, y: 5, width: 10, height: 3 },
    { x: 0, y: 3, width: 2, height: 2 },
    { x: 6, y: 3, width: 4, height: 2 }
  ]);
});

test("canvas context actions recognize the selected outer area after inversion", () => {
  const Selection = loadSelection();
  const actions = loadCanvasContextActions();
  const selection = new Selection();
  selection.setRect({ x: 2, y: 2 }, { x: 6, y: 6 }, { width: 10, height: 10 });
  selection.inverted = true;

  assert.equal(actions.imageEditorSelectionContainsPoint(selection, { x: 1, y: 1 }), true);
  assert.equal(actions.imageEditorSelectionContainsPoint(selection, { x: 4, y: 4 }), false);
});

test("canvas context actions flip selected pixels horizontally", () => {
  const actions = loadCanvasContextActions();
  const pixels = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])
  };
  const flipped = actions.flipImageEditorImageData(pixels, true);
  assert.deepEqual([...flipped.data], [4, 5, 6, 255, 1, 2, 3, 255]);
});

test("ellipse and triangle selections use shaped hit testing", () => {
  const Selection = loadSelection();
  const ellipse = new Selection();
  ellipse.setRect({ x: 0, y: 0 }, { x: 10, y: 10 }, { width: 20, height: 20 }, "ellipse");
  assert.equal(ellipse.contains({ x: 5, y: 5 }), true);
  assert.equal(ellipse.contains({ x: 0, y: 0 }), false);

  const triangle = new Selection();
  triangle.setRect({ x: 0, y: 0 }, { x: 10, y: 10 }, { width: 20, height: 20 }, "triangle");
  assert.equal(triangle.contains({ x: 5, y: 2 }), true);
  assert.equal(triangle.contains({ x: 1, y: 1 }), false);
});

test("lasso pointer gesture records a freeform selection polygon", () => {
  const Selection = loadSelection();
  const selection = new Selection();

  selection.beginPointerGesture({ x: 2, y: 2 }, contextStub(), "#ffffff", { shape: "lasso" });
  selection.updatePointerGesture({ x: 8, y: 2 }, { width: 20, height: 20 });
  selection.updatePointerGesture({ x: 5, y: 8 }, { width: 20, height: 20 });

  assert.equal(selection.shape, "lasso");
  assert.equal(selection.points.length, 3);
  assert.equal(selection.contains({ x: 5, y: 4 }), true);
  assert.equal(selection.contains({ x: 2, y: 8 }), false);
});

test("lifting an ellipse masks bounding-box corner pixels", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  const context = {
    canvas: { width: 4, height: 4 },
    getImageData() { return { width: 4, height: 4, data: pixels }; },
    fillRect() {}
  };
  selection.setRect({ x: 0, y: 0 }, { x: 4, y: 4 }, { width: 4, height: 4 }, "ellipse");
  selection.lift(context, "#ffffff", false);

  assert.equal(selection.imageData.data[3], 0);
  assert.equal(selection.imageData.data[(1 * 4 + 1) * 4 + 3], 255);
});

test("lifting a shaped selection clears only the selected shape", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  const calls = [];
  const pixels = new Uint8ClampedArray(10 * 10 * 4).fill(255);
  const context = {
    canvas: { width: 10, height: 10 },
    getImageData() { return { width: 10, height: 10, data: pixels }; },
    fillRect() { calls.push("fillRect"); },
    save() {},
    translate() {},
    rotate() {},
    beginPath() {},
    ellipse() { calls.push("ellipse"); },
    fill() { calls.push("fill"); },
    restore() {}
  };
  selection.setRect(
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { width: 10, height: 10 },
    "ellipse"
  );

  assert.equal(selection.lift(context, "#ffffff", true), true);
  assert.equal(calls.includes("ellipse"), true);
  assert.equal(calls.includes("fill"), true);
  assert.equal(calls.includes("fillRect"), false);
});

test("Ctrl-dragging a selection guide skews while keeping the opposite guide anchored", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  const context = contextStub();
  selection.setRect({ x: 10, y: 10 }, { x: 30, y: 30 }, { width: 100, height: 100 });
  const northGuide = selection.resizeGuidePoints().n;

  const started = selection.beginPointerGesture(northGuide, context, "#ffffff", { ctrl: true, zoom: 1 });
  const updated = selection.updatePointerGesture({ x: northGuide.x + 10, y: northGuide.y }, { width: 100, height: 100 });
  const guides = selection.resizeGuidePoints();

  assert.equal(started.action, "skew");
  assert.equal(updated.action, "skew");
  assert.equal(selection.skew.x, -.5);
  assert.equal(guides.n.x, 30);
  assert.equal(guides.s.x, 20);
});

test("dragging a selection guide without Ctrl keeps the existing resize behavior", () => {
  const Selection = loadSelection();
  const selection = new Selection();
  selection.setRect({ x: 10, y: 10 }, { x: 30, y: 30 }, { width: 100, height: 100 });
  const northGuide = selection.resizeGuidePoints().n;

  const started = selection.beginPointerGesture(northGuide, contextStub(), "#ffffff", { zoom: 1 });
  const updated = selection.updatePointerGesture({ x: northGuide.x, y: northGuide.y - 5 }, { width: 100, height: 100 });

  assert.equal(started.action, "resize");
  assert.equal(updated.action, "resize");
  assert.equal(selection.skew.x, 0);
  assert.equal(selection.skew.y, 0);
});

test("object alignment snaps edges and leaves movement beyond the threshold unchanged", () => {
  const resolveAlignment = loadObjectAlignmentGuides();
  const bounds = { x: 0, y: 30, width: 20, height: 20 };
  const targets = [{ x: 50, y: 0, width: 20, height: 20 }];

  const snapped = resolveAlignment(bounds, { x: 27, y: 0 }, targets, 3);
  assert.equal(snapped.deltaX, 30);
  assert.deepEqual(JSON.parse(JSON.stringify(snapped.guides)), [
    { orientation: "vertical", position: 50, start: 0, end: 50 }
  ]);

  const free = resolveAlignment(bounds, { x: 26, y: 0 }, targets, 3);
  assert.equal(free.deltaX, 26);
  assert.deepEqual(JSON.parse(JSON.stringify(free.guides)), []);
});

test("object alignment snaps axes independently and shows every coincident edge and center", () => {
  const resolveAlignment = loadObjectAlignmentGuides();
  const result = resolveAlignment(
    { x: 30, y: 30, width: 20, height: 20 },
    { x: 17, y: -27 },
    [{ x: 50, y: 0, width: 20, height: 20 }],
    3
  );

  assert.equal(result.deltaX, 20);
  assert.equal(result.deltaY, -30);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.guides.filter((guide) => guide.orientation === "horizontal"))),
    [
      { orientation: "horizontal", position: 0, start: 50, end: 70 },
      { orientation: "horizontal", position: 10, start: 50, end: 70 },
      { orientation: "horizontal", position: 20, start: 50, end: 70 }
    ]
  );
});
