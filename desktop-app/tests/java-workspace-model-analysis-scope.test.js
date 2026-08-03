const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadModel() {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/java-workspace-model.js");
  const context = { window: {}, setTimeout };
  context.globalThis = context.window;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerJavaWorkspaceModel({ registerModule() {} }, {});
}

const inventory = {
  buildSystem: "maven",
  kind: "maven-modules",
  entries: [
    ["converter", "desktop-app/converters/java_converter"],
    ["pull-up", "desktop-app/language-server-extensions/java-pull-up"],
    ["push-down", "desktop-app/language-server-extensions/java-push-down"]
  ].map(([id, relativePath]) => ({
    id: `maven:${id}`, relativePath, absolutePath: `C:/Project/${relativePath}`, dependencies: []
  }))
};

test("selected analysis emits precise exclusions without negated patterns", () => {
  const model = loadModel();
  const scope = model.resolveAnalysisScope("C:/Project", inventory, {
    analysisScope: { mode: "selected", deselectedEntryIds: ["maven:pull-up", "maven:push-down"] }
  });

  assert.deepEqual(Array.from(scope.includedModuleRoots), ["C:/Project/desktop-app/converters/java_converter"]);
  assert.deepEqual(Array.from(scope.excludedModuleRoots), [
    "C:/Project/desktop-app/language-server-extensions/java-pull-up",
    "C:/Project/desktop-app/language-server-extensions/java-push-down"
  ]);
  assert.equal(scope.importExclusions.some((pattern) => pattern.startsWith("!")), false);
  assert.equal(scope.importExclusions.includes("**/*"), false);
});

test("all mode selects the full authoritative inventory", () => {
  const model = loadModel();
  const fallback = model.resolveAnalysisScope("C:/Project", inventory, {
    analysisScope: { mode: "all", deselectedEntryIds: ["maven:converter"] }
  });
  assert.equal(fallback.includedModuleRoots.length, inventory.entries.length);

  const overridden = model.resolveAnalysisScope("C:/Project", inventory, {
    analysisScope: {
      mode: "selected",
      deselectedEntryIds: ["maven:converter", "maven:push-down"]
    }
  });
  assert.deepEqual(Array.from(overridden.includedModuleRoots), [
    "C:/Project/desktop-app/language-server-extensions/java-pull-up"
  ]);
});

test("authoritative inventory omits aggregate and buildSrc folders", () => {
  const model = loadModel();
  const detected = [
    { root: "C:/Project", kind: "mixed", kinds: ["gradle", "eclipse"] },
    { root: "C:/Project/buildSrc", kind: "gradle", kinds: ["gradle"] },
    { root: "C:/Project/framework-api", kind: "eclipse", kinds: ["eclipse"] },
    { root: "C:/Project/framework-core", kind: "eclipse", kinds: ["eclipse"] },
    { root: "C:/Project/framework-core/nested", kind: "eclipse", kinds: ["eclipse"] }
  ];
  const authoritative = {
    buildSystem: "gradle", kind: "gradle-modules",
    entries: detected.filter((module) => ["C:/Project/framework-api", "C:/Project/framework-core/nested"].includes(module.root))
      .map((module) => ({ id: `gradle:${module.root}`, relativePath: module.root.slice(11), absolutePath: module.root, dependencies: [] }))
  };
  const scope = model.resolveAnalysisScope("C:/Project", authoritative, {
    analysisScope: { mode: "all", deselectedEntryIds: [] }
  });

  assert.deepEqual(Array.from(scope.includedModuleRoots), [
    "C:/Project/framework-api",
    "C:/Project/framework-core/nested"
  ]);
});
