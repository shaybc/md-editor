const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModule(file) {
  const source = fs.readFileSync(path.resolve(__dirname, `../resources/js/project/${file}`), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: file });
  return context.window;
}

test("Kubernetes command result parser identifies OpenAPI and missing tool failures", () => {
  const loaded = loadModule("kubernetes-command-result-parser.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const parser = loaded.registerMarkdownViewerKubernetesCommandResultParser(app);

  const openApi = parser.parse({ tool: "kubectl", exitCode: 1, stderr: "failed to download openapi: turn validation off with --validate=false" });
  assert.equal(openApi[0].title, "The selected server is not a Kubernetes API server");

  const missingHelm = parser.parse({ tool: "helm", exitCode: 1, stderr: "'helm' is not recognized" });
  assert.equal(missingHelm[0].title, "Helm is not installed");
});

test("Kubernetes manifest graph extracts resources and references", () => {
  const loaded = loadModule("kubernetes-manifest-graph.js");
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const graph = loaded.registerMarkdownViewerKubernetesManifestGraph(app);
  const model = graph.buildFromYaml("apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: app-config\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n      - envFrom:\n        - configMapRef:\n            name: app-config\n");

  assert.ok(model.nodes.some((node) => node.label === "Deployment/web"));
  assert.ok(model.nodes.some((node) => node.label === "ConfigMap/app-config"));
  assert.ok(model.edges.some((edge) => edge.label === "references"));
});