const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadWorkspaceModel(configuration) {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/java-workspace-model.js");
  const directories = new Map([
    ["C:/Project", [{ entry: ".md-editor", type: "DIRECTORY" }, { entry: "selected", type: "DIRECTORY" }, { entry: "excluded", type: "DIRECTORY" }]],
    ["C:/Project/.md-editor", [{ entry: "java-build-path.json", type: "FILE" }]],
    ["C:/Project/selected", [{ entry: "pom.xml", type: "FILE" }, { entry: ".project", type: "FILE" }]],
    ["C:/Project/excluded", [{ entry: "pom.xml", type: "FILE" }, { entry: ".project", type: "FILE" }]]
  ]);
  const context = { window: {}, setTimeout };
  context.globalThis = context.window;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerJavaWorkspaceModel({ registerModule() {} }, {
    javaAnalysisInventory: {
      async resolve() {
        return {
          buildSystem: "maven", kind: "maven-modules", label: "Maven reactor modules", error: "",
          entries: ["selected", "excluded"].map((name) => ({
            id: `maven:${name}`, provider: "maven", relativePath: name,
            absolutePath: `C:/Project/${name}`, dependencies: []
          }))
        };
      }
    },
    Neutralino: {
      filesystem: {
        async readDirectory(directoryPath) { return directories.get(String(directoryPath).replace(/\\/g, "/")) || []; },
        async readFile() { return JSON.stringify(configuration); }
      }
    }
  });
}

test("authoritative Maven scope ignores Eclipse descriptors and does not enable Gradle", async () => {
  const model = loadWorkspaceModel({
    schemaVersion: 10,
    buildSystem: "maven",
    analysisScope: { mode: "selected", inventoryKind: "maven-modules", deselectedEntryIds: ["maven:excluded"] }
  });

  const workspace = await model.detect("C:/Project");
  assert.equal(workspace.kind, "maven");
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.importers)), {
    maven: true,
    gradle: false,
    eclipse: false
  });
  assert.deepEqual(
    Array.from(workspace.modules.filter((module) => module.analysisIncluded).map((module) => module.root)),
    ["C:/Project/selected"]
  );
  assert.ok(workspace.analysis.scopeSignature.includes("selected"));
  assert.equal(workspace.analysis.scopeSignature.includes("excluded"), false);
});

test("generated JDT workspace identity changes with the effective module scope", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/server-registry.js");
  const context = { window: { NL_OS: "Windows" } };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  let scopeSignature = '["selected"]';
  const registry = context.window.registerMarkdownViewerLspServerRegistry(
    { constants: { DESKTOP_PROFILE_DIR: ".md-editor" }, registerModule() {} },
    {
      getProfileDataDirPath: async () => "C:/Profile",
      getJavaWorkspaceModel: () => ({ analysis: { scopeSignature } })
    }
  );

  const selectedWorkspace = await registry.getServerWorkspaceDir("java", "C:/Project");
  scopeSignature = '["excluded"]';
  const excludedWorkspace = await registry.getServerWorkspaceDir("java", "C:/Project");

  assert.notEqual(selectedWorkspace, excludedWorkspace);
  assert.match(selectedWorkspace, /language-server-workspaces\/java\/project-/);
});

test("generated JDT workspace identity can use the scope of a project that is not active yet", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/server-registry.js");
  const context = { window: { NL_OS: "Windows" } };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const registry = context.window.registerMarkdownViewerLspServerRegistry(
    { constants: { DESKTOP_PROFILE_DIR: ".md-editor" }, registerModule() {} },
    {
      getProfileDataDirPath: async () => "C:/Profile",
      getJavaWorkspaceModel: () => ({ analysis: { scopeSignature: '["previous-project"]' } })
    }
  );

  const targetWorkspace = await registry.getServerWorkspaceDir(
    "java",
    "C:/NewProject",
    "",
    { scopeSignature: '["new-project"]' }
  );
  const previousScopeWorkspace = await registry.getServerWorkspaceDir("java", "C:/NewProject");

  assert.notEqual(targetWorkspace, previousScopeWorkspace);
  assert.match(targetWorkspace, /language-server-workspaces\/java\/newproject-/);
});
