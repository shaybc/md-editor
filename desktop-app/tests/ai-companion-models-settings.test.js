const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");
const settingsSource = fs.readFileSync(path.join(webRoot, "js/ai-companion/models-settings.js"), "utf8");
const connectionEntrySchemaSource = fs.readFileSync(path.join(webRoot, "js/ai-companion/connection-entry-schema.js"), "utf8");
const connectionProfileFormSource = fs.readFileSync(path.join(webRoot, "js/ai-companion/connection-profile-form.js"), "utf8");
const connectionSettingsSource = fs.readFileSync(path.join(webRoot, "js/ai-companion/connection-settings.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(webRoot, "styles.css"), "utf8");

function loadConnectionEntrySchema() {
  const context = { window: {} };
  vm.runInNewContext(connectionEntrySchemaSource, context);
  return context.window.MarkdownViewerAiConnectionEntries;
}

function loadConnectionProfileForm() {
  const context = { window: {}, Event: class Event {} };
  vm.runInNewContext(connectionProfileFormSource, context);
  return context.window.MarkdownViewerAiConnectionProfileForm;
}

function createConnectionFormElements(values = {}) {
  const input = (value = "") => ({ value, dispatchEvent() {}, closest() { return null; } });
  return {
    profileName: input(values.id),
    providerMode: input(values.providerMode),
    baseUrl: input(values.baseUrl),
    apiKey: input(values.apiKey),
    model: input(values.model),
    requestDelay: input(values.providerRequestDelayMs),
    litellmAlias: input(values.litellmModelAlias),
    litellmRouting: input(values.litellmRoutingConfig),
    geminiBaseUrl: input(values.geminiConnectorBaseUrl),
    geminiConnectorId: input(values.geminiConnectorId),
    geminiApiKey: input(values.geminiConnectorApiKey),
    profileAdd: { querySelector() { return null; } },
    profileSaveAs: { hidden: true },
    profileCancel: { hidden: true }
  };
}

test("AI connection profiles accept human-readable names while route IDs remain strict", () => {
  const schema = loadConnectionEntrySchema();
  const profile = schema.normalizeProfile({ id: "Gemini Unknown (3.6 flash)", providerMode: "google-gemini-native", model: "gemini-3.6-flash" });
  assert.equal(schema.validateEntry("profile", profile, [], -1, []), "");
  assert.equal(schema.validateEntry("route", schema.normalizeRoute({ id: "Fallback route", purposes: ["primary"] }), [], -1, []), "ID may contain letters, numbers, dots, underscores, and hyphens.");
});

test("saved primary AI connection migrates into the table and leaves the idle form empty", () => {
  const schema = loadConnectionEntrySchema();
  let profiles = [];
  const elements = createConnectionFormElements({
    providerMode: "google-gemini-native",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "secret",
    model: "gemini-3.5-flash",
    providerRequestDelayMs: "4500"
  });
  const controller = loadConnectionProfileForm().create({
    elements,
    schema,
    getProfiles: () => profiles,
    setProfiles: (value) => { profiles = value; },
    getProfileReferences: () => [],
    syncAndRender() {},
    setStatus() {}
  });
  controller.ensureDefaultProfile();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, "default");
  assert.equal(profiles[0].isPrimary, true);
  assert.equal(controller.getPrimaryConnectionForSave().apiKey, "secret");
  controller.refresh();
  assert.equal(elements.profileName.value, "");
  assert.equal(elements.providerMode.value, "");
  assert.equal(elements.baseUrl.value, "");
  assert.equal(elements.apiKey.value, "");
  assert.equal(elements.model.value, "");
  assert.match(htmlSource, />Connection profiles</);
  assert.doesNotMatch(htmlSource, />Additional connection profiles</);
});

test("renamed AI connection edits can be saved as a new non-default profile", () => {
  const schema = loadConnectionEntrySchema();
  const original = schema.normalizeProfile({ id: "default", providerMode: "google-gemini-native", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "secret", model: "gemini-original", isPrimary: true });
  let profiles = [original];
  let rendered = 0;
  let renamedReferences = 0;
  let status = {};
  const elements = createConnectionFormElements();
  const controller = loadConnectionProfileForm().create({
    elements,
    schema,
    getProfiles: () => profiles,
    setProfiles: (value) => { profiles = value; },
    getProfileReferences: () => [],
    renameProfileReferences: () => { renamedReferences += 1; },
    syncAndRender: () => { rendered += 1; },
    setStatus: (message, isError = false) => { status = { message, isError }; }
  });
  controller.edit(0);
  assert.equal(elements.profileSaveAs.hidden, true);
  elements.profileName.value = "Gemini Copy";
  elements.model.value = "gemini-copy";
  controller.updateActions();
  assert.equal(elements.profileSaveAs.hidden, false);
  controller.saveAs();
  assert.equal(profiles.length, 2);
  assert.strictEqual(profiles[0], original);
  assert.equal(profiles[0].model, "gemini-original");
  assert.equal(profiles[0].isPrimary, true);
  assert.equal(profiles[1].id, "Gemini Copy");
  assert.equal(profiles[1].model, "gemini-copy");
  assert.equal(profiles[1].isPrimary, undefined);
  assert.equal(profiles[1].apiKey, "secret");
  assert.equal(renamedReferences, 0);
  assert.equal(rendered, 1);
  assert.equal(elements.profileName.value, "");
  assert.equal(elements.profileSaveAs.hidden, true);
  assert.equal(status.isError, false);
  assert.match(htmlSource, /id="settings-ai-connection-profile-save-as"/);
});

test("AI connection profiles can be deleted unless a provider route references them", () => {
  let profiles = [{ id: "backup" }];
  let references = [];
  let rendered = 0;
  let status = {};
  const controller = loadConnectionProfileForm().create({
    elements: {},
    schema: {},
    getProfiles: () => profiles,
    setProfiles: (value) => { profiles = value; },
    getProfileReferences: () => references,
    syncAndRender: () => { rendered += 1; },
    setStatus: (message, isError = false) => { status = { message, isError }; }
  });
  controller.remove(0);
  assert.equal(profiles.length, 0);
  assert.equal(rendered, 1);
  assert.equal(status.isError, false);

  profiles = [{ id: "in-use" }];
  references = ["primary"];
  controller.remove(0);
  assert.equal(profiles.length, 1);
  assert.equal(rendered, 1);
  assert.equal(status.isError, true);
  assert.match(status.message, /used by provider route: primary/);
  assert.match(connectionSettingsSource, /button\("bi-trash", `Delete \$\{summary\.primary\}`, \(\) => profileForm\.remove\(index\)\)/);
});

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

test("AI model settings notify consumers after the initial registry load", () => {
  assert.match(
    settingsSource,
    /async function reload\(\)[\s\S]*?models = loaded\.models\.map[\s\S]*?deps\.onRegistryChanged\?\.\(\)/
  );
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
