const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadContext() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/helm-chart-context.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: "helm-chart-context.js" });
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  return context.window.registerMarkdownViewerHelmChartContext(app);
}

test("Helm chart context resolves likely chart roots from common chart files", () => {
  const helm = loadContext();

  assert.equal(helm.resolveLikelyChartRoot({ filePath: "C:/Project/charts/app/Chart.yaml" }), "C:/Project/charts/app");
  assert.equal(helm.resolveLikelyChartRoot({ filePath: "C:/Project/charts/app/values.yaml" }), "C:/Project/charts/app");
  assert.equal(helm.resolveLikelyChartRoot({ filePath: "C:/Project/charts/app/templates/deployment.yaml" }), "C:/Project/charts/app");
  assert.equal(helm.resolveLikelyChartRoot({ filePath: "C:/Project/charts/app/templates/_helpers.tpl" }), "C:/Project/charts/app");
  assert.equal(helm.getTemplateRelativePath("C:/Project/charts/app/templates/deployment.yaml", "C:/Project/charts/app"), "templates/deployment.yaml");
  assert.equal(helm.getTemplateRelativePath("C:/Project/charts/app/values.yaml", "C:/Project/charts/app"), "");
});

test("Helm chart context finds the nearest Chart.yaml", async () => {
  const helm = loadContext();
  const existing = new Set(["C:/Project/charts/app/Chart.yaml"]);

  assert.equal(await helm.findChartRoot({ folderPath: "C:/Project", filePath: "C:/Project/charts/app/templates/service.yaml" }, {
    pathExists: async (candidate) => existing.has(candidate)
  }), "C:/Project/charts/app");
});

test("Helm chart context extracts values paths and named templates", () => {
  const helm = loadContext();
  const valuesYaml = "image:\n  repository: nginx\n  tag: latest\nservice:\n  port: 80\n";
  const helpers = '{{- define "hello-world.fullname" -}}\n{{- end }}\n{{ define "hello-world.labels" }}{{ end }}';

  assert.deepEqual(JSON.parse(JSON.stringify(helm.parseValuesPaths(valuesYaml))), [
    ".Values.image",
    ".Values.image.repository",
    ".Values.image.tag",
    ".Values.service",
    ".Values.service.port"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(helm.extractNamedTemplates(helpers))), ["hello-world.fullname", "hello-world.labels"]);
  assert.deepEqual(JSON.parse(JSON.stringify(helm.createCompletionItems(valuesYaml, helpers).map((item) => item.label))), [
    ".Values.image",
    ".Values.image.repository",
    ".Values.image.tag",
    ".Values.service",
    ".Values.service.port",
    "include \"hello-world.fullname\" .",
    "include \"hello-world.labels\" ."
  ]);
});

test("Helm chart context derives safe default release names", () => {
  const helm = loadContext();

  assert.equal(helm.getDefaultReleaseName("C:/Project/Hello_World"), "hello-world");
  assert.equal(helm.getDefaultReleaseName("C:/Project/---"), "release");
});

