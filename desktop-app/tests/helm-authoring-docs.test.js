const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegistration() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/helm-authoring-docs.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: "helm-authoring-docs.js" });
  return context.window.registerMarkdownViewerHelmAuthoringDocs;
}

test("Helm authoring docs provide function completions and hover text", () => {
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const api = loadRegistration()(app);
  const completions = api.getFunctionCompletionItems();

  assert.ok(completions.some((item) => item.label === "include" && item.detail === "Helm template"));
  assert.match(api.getFunctionHover("nindent"), /leading newline/);
  assert.match(api.getTemplateHover({ selectedText: "toYaml" }), /Convert a value/);
});
