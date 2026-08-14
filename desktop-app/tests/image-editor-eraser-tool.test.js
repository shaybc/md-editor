const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class TestImageData {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

function loadEraserTool() {
  const context = {
    ImageData: TestImageData,
    Math,
    Uint8ClampedArray
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../resources/js/image-editor/eraser-tool.js'), 'utf8');
  vm.runInContext(source, context);
  return context.MarkdownViewerImageEditor;
}

function alphaAt(imageData, x, y) {
  return imageData.data[(y * imageData.width + x) * 4 + 3];
}

test('eraser creates one continuous destination-out mask for a fast drag', () => {
  const { ImageEditorEraserTool } = loadEraserTool();
  const tool = new ImageEditorEraserTool();

  assert.equal(tool.begin({ x: 8, y: 12 }, 80, 30, { size: 10, hardness: 1 }), true);
  tool.update({ x: 68, y: 12 });
  const mask = tool.finish();

  for (let x = 8; x <= 68; x += 2) assert.equal(alphaAt(mask, x, 12), 255);
  assert.equal(alphaAt(mask, 40, 25), 0);
  assert.equal(tool.stroke, null);
});

test('eraser hardness feathers the edge without weakening the center', () => {
  const { ImageEditorEraserTool } = loadEraserTool();
  const hard = new ImageEditorEraserTool();
  const soft = new ImageEditorEraserTool();

  hard.begin({ x: 15, y: 15 }, 30, 30, { size: 12, hardness: 1 });
  soft.begin({ x: 15, y: 15 }, 30, 30, { size: 12, hardness: 0 });
  const hardMask = hard.finish();
  const softMask = soft.finish();

  assert.equal(alphaAt(hardMask, 15, 15), 255);
  assert.ok(alphaAt(softMask, 15, 15) > 220);
  assert.equal(alphaAt(hardMask, 19, 15), 255);
  assert.ok(alphaAt(softMask, 19, 15) > 0);
  assert.ok(alphaAt(softMask, 19, 15) < 255);
});

test('eraser ignores updates outside an active gesture', () => {
  const { ImageEditorEraserTool } = loadEraserTool();
  const tool = new ImageEditorEraserTool();
  assert.equal(tool.update({ x: 2, y: 2 }), false);
  assert.equal(tool.finish(), null);
});
