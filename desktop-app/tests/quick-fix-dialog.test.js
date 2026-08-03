const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const dialogSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/quick-fix/dialog.js"), "utf8");
const controllerSource = fs.readFileSync(path.resolve(__dirname, "../resources/js/quick-fix/controller.js"), "utf8");

test("Quick Fix dialog requires preview before Apply and visibly separates JDT from AI", () => {
  assert.match(dialogSource, /quick-fix-apply" type="button" disabled/);
  assert.match(dialogSource, /selectedPreview = await options\.resolvePreview/);
  assert.match(dialogSource, /action\.provenance/);
  assert.match(dialogSource, /AI: investigate and propose a fix/);
  assert.match(dialogSource, /Undo Quick Fix/);
  assert.match(dialogSource, /Rebuild project/);
  assert.match(dialogSource, /button\.dataset\.actionId = String\(action\.id \|\| ""\)/);
  assert.match(dialogSource, /options\.initialActionId/);
  assert.match(dialogSource, /initialAction\.click\(\)/);
});

test("Quick Fix controller resolves lazy actions and verifies after transactional apply", () => {
  assert.match(controllerSource, /javaProvider\.resolveAction/);
  assert.match(controllerSource, /workspaceEditPreview\.apply/);
  assert.match(controllerSource, /diagnosticStore\.waitForChange/);
  assert.match(controllerSource, /runProblemFix/);
  assert.match(controllerSource, /getEditorSuggestions/);
  assert.match(controllerSource, /options\.preparedResult/);
  assert.match(controllerSource, /initialActionId: options\.initialActionId/);
});

test("Quick Fix supports local RAT navigation actions without representing them as edits", () => {
  assert.match(dialogSource, /action\.execute/);
  assert.match(dialogSource, /options\.executeAction/);
  assert.match(controllerSource, /kind !== "rat-manager"/);
  assert.match(controllerSource, /route: "finding\.summary"/);
  assert.match(controllerSource, /getRatManager/);
});