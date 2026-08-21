const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegistration() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/kubernetes-context.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: "kubernetes-context.js" });
  return context.window.registerMarkdownViewerKubernetesContext;
}

test("Kubernetes context builds kubectl and helm prefixes from configured state", () => {
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const api = loadRegistration()(app);

  api.setCurrentContext("kind-local");
  api.setCurrentNamespace("dev");

  assert.equal(api.getKubectlPath(), "kubectl");
  assert.equal(api.getHelmPath(), "helm");
  assert.equal(api.buildKubectlPrefix(), "kubectl --context kind-local --namespace dev");
  assert.equal(api.buildKubectlPrefix({ includeNamespace: false }), "kubectl --context kind-local");
  assert.equal(api.buildHelmPrefix(), "helm");
  assert.deepEqual(JSON.parse(JSON.stringify(api.getContextSummary())), { kubeconfigPath: "", contextName: "kind-local", namespaceName: "dev" });
});

