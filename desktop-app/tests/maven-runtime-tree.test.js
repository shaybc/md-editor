const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadApi() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/maven-runtime-tree.js"), "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  return context.globalThis.MdEditorMavenRuntimeTree;
}

test("normalizes Maven runtime artifacts and parent-child edges", () => {
  const api = loadApi();
  const result = api.normalizeMavenRuntimeTree({
    groupId: "recover",
    artifactId: "project",
    version: "1",
    type: "jar",
    children: [{
      groupId: "com.fasterxml.jackson.core",
      artifactId: "jackson-databind",
      version: "2.17.2",
      type: "jar",
      scope: "compile",
      children: [{
        groupId: "com.fasterxml.jackson.core",
        artifactId: "jackson-annotations",
        version: "2.17.2",
        type: "jar",
        scope: "compile"
      }, {
        groupId: "com.fasterxml.jackson.core",
        artifactId: "jackson-core",
        version: "2.17.2",
        type: "jar",
        scope: "compile"
      }]
    }]
  }, { targetJarRelativeFolder: "lib/external" });

  assert.equal(result.artifacts.length, 3);
  assert.equal(result.edges.length, 2);
  const databind = result.artifacts.find((artifact) => artifact.artifactId === "jackson-databind");
  const annotations = result.artifacts.find((artifact) => artifact.artifactId === "jackson-annotations");
  assert.equal(databind.direct, true);
  assert.equal(annotations.direct, false);
  assert.equal(annotations.expectedJarRelativePath, "lib/external/jackson-annotations-2.17.2.jar");
  assert.ok(result.edges.some((edge) =>
    edge.fromArtifactKey === databind.artifactKey && edge.toArtifactKey === annotations.artifactKey));
});

test("preserves classifier in copied Maven filename", () => {
  const api = loadApi();
  assert.equal(api.expectedJarFileName({
    artifactId: "native-client",
    version: "1.2.3",
    classifier: "windows-x86_64"
  }), "native-client-1.2.3-windows-x86_64.jar");
});
