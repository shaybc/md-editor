const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const codec = require("../resources/js/tools/json-yaml/json-yaml-codec.js");

function loadYamlLibrary() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/vendor/js/js-yaml.min.js"), "utf8");
  const context = { window: {}, self: {}, globalThis: {} };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.jsyaml;
}

const yamlLibrary = loadYamlLibrary();

test("converts YAML to formatted JSON", () => {
  const output = codec.convertYamlToJson("name: demo\nports:\n  - 80\n  - 443\n", { yamlLibrary, indent: 2 });

  assert.equal(output, '{\n  "name": "demo",\n  "ports": [\n    80,\n    443\n  ]\n}');
});

test("converts JSON to YAML", () => {
  const output = codec.convertJsonToYaml('{"name":"demo","enabled":true}', { yamlLibrary, indent: 2 });

  assert.match(output, /name: demo/);
  assert.match(output, /enabled: true/);
});

test("reports invalid input by conversion direction", () => {
  assert.throws(() => codec.convertJsonToYaml("not json", { yamlLibrary }), /Invalid JSON/);
  assert.throws(() => codec.convertYamlToJson("name: [", { yamlLibrary }), /Invalid YAML/);
});