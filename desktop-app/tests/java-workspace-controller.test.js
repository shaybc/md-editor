const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function runModule(relativePath, context) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: relativePath });
}

test("Java workspace model classifies mixed Maven and Gradle modules and output roots", async () => {
  const directories = new Map([
    ["C:/repo", [
      { entry: "pom.xml", type: "FILE" },
      { entry: "gradle-module", type: "DIRECTORY" },
      { entry: ".git", type: "DIRECTORY" }
    ]],
    ["C:/repo/gradle-module", [
      { entry: "build.gradle.kts", type: "FILE" },
      { entry: "src", type: "DIRECTORY" }
    ]],
    ["C:/repo/gradle-module/src", [
      { entry: "main", type: "DIRECTORY" },
      { entry: "test", type: "DIRECTORY" }
    ]],
    ["C:/repo/gradle-module/src/main", [{ entry: "java", type: "DIRECTORY" }]],
    ["C:/repo/gradle-module/src/main/java", []],
    ["C:/repo/gradle-module/src/test", [{ entry: "java", type: "DIRECTORY" }]],
    ["C:/repo/gradle-module/src/test/java", []]
  ]);
  const context = {
    Map,
    Set,
    Promise,
    setTimeout,
    Neutralino: {
      filesystem: {
        readDirectory: async (directoryPath) => directories.get(directoryPath) || [],
        readFile: async () => { throw new Error("missing"); }
      }
    }
  };
  runModule("resources/js/lsp/java-workspace-model.js", context);
  const app = { registerModule() {} };
  const modelApi = context.registerMarkdownViewerJavaWorkspaceModel(app, {
    Neutralino: context.Neutralino,
    javaAnalysisInventory: {
      async resolve() {
        return {
          buildSystem: "maven",
          kind: "maven-modules",
          entries: [
            { id: "maven:.", absolutePath: "C:/repo", relativePath: ".", dependencies: [] },
            { id: "maven:gradle-module", absolutePath: "C:/repo/gradle-module", relativePath: "gradle-module", dependencies: [] }
          ],
          error: ""
        };
      }
    }
  });
  const model = await modelApi.detect("C:/repo");
  assert.equal(model.kind, "maven");
  assert.equal(model.modules.some((module) => module.kind === "maven"), true);
  assert.equal(model.modules.some((module) => module.kind === "gradle"), true);
  assert.equal(model.importers.maven, true);
  assert.equal(model.importers.gradle, false);
  assert.deepEqual(Array.from(model.derivedRoots), [
    "C:/repo/target",
    "C:/repo/gradle-module/build",
    "C:/repo/gradle-module/.gradle"
  ]);
  assert.deepEqual(Array.from(model.standardJavaSourceRoots), [
    "C:/repo/gradle-module/src/main/java",
    "C:/repo/gradle-module/src/test/java"
  ]);
});

test("Java workspace controller publishes detection and dormant states without blocking", async () => {
  const statuses = [];
  const derivedRoots = [];
  const generations = [];
  const context = { Map, Set, Promise, setTimeout };
  runModule("resources/js/lsp/java-workspace-controller.js", context);
  const app = {
    modules: { statusManager: { setStatus: (status) => statuses.push(status.label), unsetStatus() {} } },
    registerModule() {}
  };
  const controller = context.registerMarkdownViewerJavaWorkspaceController(app, {
    workspaceModel: { detect: async () => ({ kind: "maven", derivedRoots: ["C:/repo/target"] }) },
    diagnosticLifecycleTrace: { startGeneration: (reason, details) => generations.push({ reason, details }) },
    folderWatcher: { setDerivedRoots: (paths) => derivedRoots.push(...paths) }
  });
  const opening = controller.openWorkspace("C:/repo");
  assert.equal(controller.getState().phase, "detecting");
  await opening;
  assert.equal(controller.getState().phase, "dormant");
  assert.deepEqual(derivedRoots, ["C:/repo/target"]);
  assert.equal(generations.length, 1);
  assert.equal(generations[0].reason, "workspace-opened");
  assert.equal(generations[0].details.workspaceRoot, "C:/repo");
  assert.match(statuses.join(" "), /Detecting project/);
});

test("Java workspace controller blocks analysis without a Project JDK and resumes after runtime resolution", async () => {
  const notifications = [];
  let resolved = 0;
  const context = { Map, Set, Promise, setTimeout };
  runModule("resources/js/lsp/java-workspace-controller.js", context);
  const app = { modules: { statusManager: { setStatus() {}, unsetStatus() {} } }, registerModule() {} };
  const projectRuntime = {
    result: { ok: false, code: "project-jdk-required", projectJdk: null, launcherJdk: null },
    async resolve() { return this.result; }
  };
  const controller = context.registerMarkdownViewerJavaWorkspaceController(app, {
    workspaceModel: { detect: async () => ({ kind: "maven", hasJavaContent: true, projectConfiguration: {}, derivedRoots: [] }) },
    projectRuntime,
    onRuntimeRequired: (event) => notifications.push(event.runtime.code),
    onRuntimeResolved: () => { resolved += 1; }
  });

  await controller.openWorkspace("C:/repo");
  assert.equal(controller.getState().phase, "runtime-required");
  assert.equal(controller.activateDocument(), false);
  assert.deepEqual(notifications, ["project-jdk-required"]);

  projectRuntime.result = {
    ok: true,
    projectPath: "C:/repo",
    projectJdk: { id: "project", path: "C:/JDK", feature: 25 },
    launcherJdk: { id: "project", path: "C:/JDK", feature: 25 }
  };
  await controller.openWorkspace("C:/repo");
  assert.equal(controller.getState().phase, "dormant");
  assert.equal(controller.activateDocument(), true);
  assert.equal(resolved, 1);
});

test("Java workspace controller exposes cancellation and ignores stale JDT progress after cancellation", async () => {
  const statuses = [];
  let cancellationCount = 0;
  const context = { Map, Set, Promise, setTimeout };
  runModule("resources/js/lsp/java-workspace-controller.js", context);
  const app = {
    modules: { statusManager: { setStatus: (status) => statuses.push(status), unsetStatus() {} } },
    registerModule() {}
  };
  const controller = context.registerMarkdownViewerJavaWorkspaceController(app, {
    workspaceModel: { detect: async () => ({ kind: "gradle", hasJavaContent: true, projectConfiguration: {}, derivedRoots: [] }) },
    projectRuntime: { resolve: async () => ({ ok: true, launcherJdk: { feature: 25 } }) },
    cancelAnalysis: async () => { cancellationCount += 1; }
  });

  await controller.openWorkspace("C:/repo");
  controller.activateDocument();
  controller.markImporting("Java: Updating spring-core");
  const importingStatus = statuses.at(-1);
  assert.equal(typeof importingStatus.onCancel, "function");
  assert.equal(importingStatus.cancelLabel, "Cancel Java background action");

  await controller.cancelAnalysis();
  assert.equal(cancellationCount, 1);
  assert.equal(controller.getState().phase, "cancelled");
  controller.markImporting("Java: Stale progress");
  controller.markReady();
  assert.equal(controller.getState().phase, "cancelled");

  controller.activateDocument();
  assert.equal(controller.getState().phase, "starting");
});

test("Java workspace controller ignores stale ready events after a terminal analysis failure", async () => {
  const context = { Map, Set, Promise, setTimeout };
  runModule("resources/js/lsp/java-workspace-controller.js", context);
  const app = { modules: { statusManager: { setStatus() {}, unsetStatus() {} } }, registerModule() {} };
  const controller = context.registerMarkdownViewerJavaWorkspaceController(app, {
    workspaceModel: { detect: async () => ({ kind: "gradle", hasJavaContent: true, projectConfiguration: {}, derivedRoots: [] }) },
    projectRuntime: { resolve: async () => ({ ok: true, launcherJdk: { feature: 26 } }) }
  });

  await controller.openWorkspace("C:/repo");
  controller.markAnalysisFailed({ code: "gradle-import-failed", fatal: true, summary: "Gradle import failed." });
  controller.markReady();

  assert.equal(controller.getState().phase, "degraded");
  assert.equal(controller.getState().failure.code, "gradle-import-failed");
});


test("Java workspace detection is cancellable and ignores a late sidecar completion", async () => {
  const statuses = [];
  let resolveDetection;
  let capturedSignal = null;
  let jdtCancellationCount = 0;
  const context = { Map, Set, Promise, setTimeout, clearTimeout, AbortController };
  runModule("resources/js/lsp/java-workspace-controller.js", context);
  const app = {
    modules: { statusManager: { setStatus: (status) => statuses.push(status), unsetStatus() {} } },
    registerModule() {}
  };
  const controller = context.registerMarkdownViewerJavaWorkspaceController(app, {
    workspaceModel: {
      detect(_workspaceRoot, options) {
        capturedSignal = options.signal;
        return new Promise((resolve) => { resolveDetection = resolve; });
      }
    },
    cancelAnalysis: async () => { jdtCancellationCount += 1; }
  });

  const opening = controller.openWorkspace("C:/repo");
  const detectingStatus = statuses.at(-1);
  assert.equal(controller.getState().phase, "detecting");
  assert.equal(typeof detectingStatus.onCancel, "function");
  await detectingStatus.onCancel();
  assert.equal(capturedSignal.aborted, true);
  assert.equal(controller.getState().phase, "cancelled");
  assert.equal(controller.getState().label, "Java: JDT cancelled");
  assert.equal(jdtCancellationCount, 0);
  assert.equal(statuses.at(-1).backgroundProcess.outcome, "cancelled");

  resolveDetection({ kind: "maven", derivedRoots: [] });
  await opening;
  assert.equal(controller.getState().phase, "cancelled");
});

test("Java workspace detection times out after the shared deadline and marks analysis incomplete", async () => {
  const incomplete = [];
  let capturedSignal = null;
  const context = { Map, Set, Promise, setTimeout, clearTimeout, AbortController };
  runModule("resources/js/lsp/java-workspace-controller.js", context);
  const app = {
    modules: { statusManager: { setStatus() {}, unsetStatus() {} } },
    registerModule() {}
  };
  const controller = context.registerMarkdownViewerJavaWorkspaceController(app, {
    projectDetectionTimeoutMs: 10,
    workspaceModel: {
      detect(_workspaceRoot, options) {
        capturedSignal = options.signal;
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
        }, { once: true }));
      }
    },
    analysisGenerationCoordinator: {
      beginGeneration() { return 9; },
      getState() { return { generationId: 9 }; },
      markIncomplete(details) { incomplete.push(details); }
    }
  });

  const state = await controller.openWorkspace("C:/repo");

  assert.equal(capturedSignal.aborted, true);
  assert.equal(state.phase, "degraded");
  assert.equal(state.label, "Java: Project detection timed out");
  assert.equal(state.failure.code, "java-project-detection-timeout");
  assert.match(state.failure.remediation, /Retry Java project analysis/);
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].code, "java-project-detection-timeout");
});


test("desktop Java workspace detection uses the sidecar without renderer directory traversal", async () => {
  let bridgeCalls = 0;
  let rendererDirectoryReads = 0;
  const context = {
    Map,
    Set,
    Promise,
    setTimeout,
    clearTimeout,
    Neutralino: {
      filesystem: {
        async readDirectory() { rendererDirectoryReads += 1; return []; },
        async readFile() { throw new Error("missing"); }
      },
      os: {
        async spawnProcess() { return { id: 1 }; },
        async updateSpawnedProcess() {}
      }
    }
  };
  runModule("resources/js/lsp/java-workspace-model.js", context);
  const modelApi = context.registerMarkdownViewerJavaWorkspaceModel({ registerModule() {} }, {
    Neutralino: context.Neutralino,
    bridge: {
      isAvailable: () => true,
      async run(request) {
        bridgeCalls += 1;
        assert.equal(request.mode, "scan-workspace");
        return {
          modules: [{
            id: "root",
            root: "C:/repo",
            kind: "maven",
            kinds: ["maven"],
            descriptorPaths: ["C:/repo/pom.xml"],
            sourceRoots: [],
            generatedSourceRoots: [],
            outputRoots: ["C:/repo/target"]
          }],
          standardJavaSourceRoots: ["C:/repo/src/main/java"],
          javaSourceFiles: ["C:/repo/src/main/java/App.java"],
          kotlinSourceFiles: [],
          kotlinSourceDirectories: [],
          aspectjSourceDirectories: [],
          scannedDirectories: 321,
          hasJavaContent: true,
          hasKotlinContent: false,
          truncated: false
        };
      }
    },
    javaAnalysisInventory: {
      async resolve() {
        return {
          buildSystem: "maven",
          kind: "maven-modules",
          entries: [{ id: "maven:.", absolutePath: "C:/repo", relativePath: ".", dependencies: [] }],
          error: ""
        };
      }
    }
  });

  const model = await modelApi.detect("C:/repo");

  assert.equal(bridgeCalls, 1);
  assert.equal(rendererDirectoryReads, 0);
  assert.equal(model.hasJavaContent, true);
  assert.equal(model.truncated, false);
});
