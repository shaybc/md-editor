const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const webRoot = path.resolve(__dirname, "..", "resources");
const settingsSource = fs.readFileSync(path.join(webRoot, "js/ai-companion/models-settings.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(webRoot, "styles.css"), "utf8");

test("AI model settings render read-only rows with delete and edit actions", () => {
  assert.match(settingsSource, /function createModelSummary\(model\)/);
  assert.match(settingsSource, /settings-ai-models-summary-primary/);
  assert.match(settingsSource, /settings-ai-models-summary-secondary/);
  assert.doesNotMatch(settingsSource, /function createCellInput\(/);
  assert.match(settingsSource, /removeButton\.innerHTML = '<i class="bi bi-trash"/);
  assert.match(settingsSource, /editButton\.innerHTML = '<i class="bi bi-pencil"/);
  assert.match(settingsSource, /actionsCell\.append\(removeButton, editButton\)/);
});

test("AI model settings use a modal for add and edit saves", () => {
  assert.match(settingsSource, /function openModelEditor\(model = null, mode = "edit"\)/);
  assert.match(settingsSource, /function saveModelEditor\(\)/);
  assert.match(settingsSource, /if \(!draft\.id\)/);
  assert.match(settingsSource, /models\.push\(draft\)/);
  assert.match(settingsSource, /Object\.assign\(activeEditorModel, draft\)/);
  assert.match(settingsSource, /renderRows\(\);\s*closeModelEditor\(\);\s*await persist\(\)/);
  assert.match(settingsSource, /addButton\?\.addEventListener\("click", \(\) => \{\s*openModelEditor\(null, "add"\)/);
});

test("AI model editor modal markup and styles are present", () => {
  assert.match(htmlSource, /id="settings-ai-model-editor-modal"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-id"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-label"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-provider"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-match"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-context-window"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-max-output"/);
  assert.match(htmlSource, /id="settings-ai-model-editor-reasoning"/);
  assert.match(stylesSource, /grid-template-columns: minmax\(220px, 1fr\) auto/);
  assert.match(stylesSource, /\.settings-ai-models-summary-primary/);
  assert.match(stylesSource, /\.settings-ai-model-editor-box/);
});
