const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadApi() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/graph/jar-dependency-closure.js"), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.MdEditorJarDependencyClosure;
}

test("collects direct and transitive JARs with cycle protection", () => {
  const api = loadApi();
  const nodes = new Map([
    ["source", { id: "source", kind: "source" }],
    ["databind", { id: "databind", kind: "jar" }],
    ["annotations", { id: "annotations", kind: "jar" }],
    ["core", { id: "core", kind: "jar" }],
    ["unrelated", { id: "unrelated", kind: "jar" }]
  ]);
  const result = api.collectExternalJarDependencyClosure({
    sourceNodes: [nodes.get("source")],
    links: [
      { source: "source", target: "databind" },
      { source: "databind", target: "annotations" },
      { source: "databind", target: "core" },
      { source: "annotations", target: "databind" }
    ],
    getNodeById: (id) => nodes.get(id),
    isExternalJarNode: (node) => node?.kind === "jar"
  });

  assert.deepEqual(new Set(result.nodes.map((node) => node.id)), new Set(["databind", "annotations", "core"]));
  assert.deepEqual(Array.from(result.directNodeIds), ["databind"]);
  assert.deepEqual(new Set(result.transitiveNodeIds), new Set(["annotations", "core"]));
});
