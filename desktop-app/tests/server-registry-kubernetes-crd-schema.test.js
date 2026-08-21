const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegistry() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/lsp/server-registry.js"), "utf8");
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "server-registry.js" });
  const app = { modules: {}, constants: {}, registerModule(name, api) { this.modules[name] = api; } };
  return context.window.registerMarkdownViewerLspServerRegistry(app, {});
}

test("YAML workspace configuration appends CRD schemas only for Kubernetes YAML", () => {
  const registry = loadRegistry();
  const crdSchemas = [{ uri: "kubernetes-crd://example.com/v1/Widget" }];
  const kubernetesConfig = registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/k8s/widget.yaml",
    content: "apiVersion: example.com/v1\nkind: Widget\n",
    crdSchemas
  });
  const composeConfig = registry.getServerWorkspaceConfiguration("yaml", {
    filePath: "C:/Project/docker-compose.yml",
    content: "services:\n  web:\n    image: nginx\n",
    crdSchemas
  });

  assert.deepEqual(JSON.parse(JSON.stringify(kubernetesConfig.yaml.schemas["kubernetes-crd://example.com/v1/Widget"])), ["C:/Project/k8s/widget.yaml"]);
  assert.equal(Object.keys(composeConfig.yaml.schemas).some((key) => key.startsWith("kubernetes-crd://")), false);
});

