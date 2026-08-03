const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRefresh(deps) {
  const sourcePath = path.resolve(__dirname, "../resources/js/lsp/java-analysis-refresh.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerJavaAnalysisRefresh({ registerModule() {} }, deps);
}

test("explicit Java refresh begins a ready generation and waits for its committed snapshot", async () => {
  let listener = null;
  let request = null;
  let refreshingLabel = "";
  const coordinator = {
    getState() {
      return {
        requirements: { jdt: true },
        providers: { kotlin: { ready: false, abiReady: false } }
      };
    },
    beginGeneration(value) {
      request = value;
      setImmediate(() => listener({ generationId: 7, status: "committed" }));
      return 7;
    },
    subscribe(value) {
      listener = value;
      return () => { listener = null; };
    }
  };
  const refresh = loadRefresh({
    analysisGenerationCoordinator: coordinator,
    getWorkspaceRoot: () => "C:/Project",
    javaWorkspaceController: {
      getState: () => ({ phase: "ready" }),
      markRefreshing: (label) => { refreshingLabel = label; }
    }
  });

  const result = await refresh.reanalyze({ reason: "maven-rebuild-succeeded" });
  assert.equal(result.succeeded, true);
  assert.equal(request.reason, "maven-rebuild-succeeded");
  assert.equal(request.jdtReady, true);
  assert.equal(refreshingLabel, "Java: Reanalyzing...");
});

test("failed explicit Java refresh retries workspace import once", async () => {
  let listener = null;
  let generationId = 1;
  let retries = 0;
  let state = {
    generationId,
    status: "committed",
    requirements: { jdt: true },
    providers: { kotlin: { ready: false, abiReady: false } }
  };
  const coordinator = {
    getState: () => state,
    beginGeneration() {
      generationId += 1;
      state = { ...state, generationId, status: "running" };
      setImmediate(() => listener({ ...state, status: "incomplete" }));
      return generationId;
    },
    subscribe(value) {
      listener = value;
      return () => {};
    }
  };
  const refresh = loadRefresh({
    analysisGenerationCoordinator: coordinator,
    getWorkspaceRoot: () => "C:/Project",
    javaWorkspaceController: { getState: () => ({ phase: "ready" }), markRefreshing() {} },
    async retryJavaWorkspace() {
      retries += 1;
      generationId += 1;
      state = { ...state, generationId, status: "running" };
      setImmediate(() => listener({ ...state, status: "committed" }));
    }
  });

  const result = await refresh.reanalyze({ reason: "java-quick-fix-applied" });
  assert.equal(result.succeeded, true);
  assert.equal(result.recovered, true);
  assert.equal(retries, 1);
});
