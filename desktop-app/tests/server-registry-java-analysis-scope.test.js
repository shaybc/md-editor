const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Java workspace configuration forwards generated JDT import exclusions", () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/server-registry.js");
  const context = { window: { NL_OS: "Windows" } };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const exclusions = [
    "**/desktop-app/language-server-extensions/java-pull-up/**",
    "!**/desktop-app/converters/java_converter/**"
  ];
  const registry = context.window.registerMarkdownViewerLspServerRegistry(
    { registerModule() {} },
    {
      getJavaWorkspaceModel: () => ({
        kind: "maven",
        importers: { maven: true, gradle: false },
        analysis: { importExclusions: exclusions }
      }),
      getJavaRuntime: () => null,
      getConfiguredJdks: () => [],
      getConfiguredGradles: () => []
    }
  );

  const configuration = registry.getServerWorkspaceConfiguration("java");
  assert.deepEqual(Array.from(configuration.java.import.exclusions), exclusions);
});
