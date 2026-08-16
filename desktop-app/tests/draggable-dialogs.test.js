const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { clampDialogPosition } = require(path.resolve(__dirname, "..", "resources", "js", "ui", "draggable-dialogs.js"));

test("dialog positions remain inside the viewport", () => {
  assert.deepEqual(clampDialogPosition(-40, -20, 300, 200, 1200, 800), { left: 0, top: 0 });
  assert.deepEqual(clampDialogPosition(1100, 750, 300, 200, 1200, 800), { left: 900, top: 600 });
  assert.deepEqual(clampDialogPosition(420, 260, 300, 200, 1200, 800), { left: 420, top: 260 });
});

test("oversized dialogs keep their title at the viewport origin", () => {
  assert.deepEqual(clampDialogPosition(100, 100, 1400, 900, 1200, 800), { left: 0, top: 0 });
});
