const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRegistration() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/kubernetes-crd-schema-cache.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context, { filename: "kubernetes-crd-schema-cache.js" });
  return context.window.registerMarkdownViewerKubernetesCrdSchemaCache;
}

test("Kubernetes CRD schema cache parses versioned OpenAPI schemas", () => {
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const api = loadRegistration()(app);
  const schemas = api.parseCrdSchemas({ items: [{ spec: { group: "example.com", names: { kind: "Widget" }, versions: [{ name: "v1", schema: { openAPIV3Schema: { type: "object" } } }] } }] });

  assert.equal(schemas.length, 1);
  assert.equal(schemas[0].name, "Widget.example.com/v1");
  assert.match(schemas[0].uri, /^kubernetes-crd:/);
  assert.deepEqual(schemas[0].schema, { type: "object" });
});

test("Kubernetes CRD schema cache returns empty when command execution is unavailable", async () => {
  const app = { modules: {}, registerModule(name, api) { this.modules[name] = api; } };
  const api = loadRegistration()(app);

  assert.deepEqual(JSON.parse(JSON.stringify(await api.loadForCurrentContext())), []);
});

