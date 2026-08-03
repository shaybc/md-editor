const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { registerMarkdownViewerKotlinAdapterClient } = require("../resources/js/lsp/kotlin-adapter-client.js");
const { registerMarkdownViewerKotlinWorkspaceCoordinator } = require("../resources/js/lsp/kotlin-workspace-coordinator.js");

function createReconciliationSession(responses, sent) {
  let receive = null;
  return {
    generationId: 7,
    transport: {
      subscribe(listener) { receive = listener; },
      send(message) {
        const request = JSON.parse(message);
        sent.push(request);
        if (request.method === "$/cancelRequest") return;
        const result = responses.shift();
        if (result !== undefined) {
          setTimeout(() => receive(JSON.stringify({ jsonrpc: "2.0", id: request.id, result })), 0);
        }
      }
    }
  };
}

function successfulResult(overrides = {}) {
  return {
    revision: "revision-1",
    generationId: 7,
    verificationMetadataComplete: true,
    appliedProjects: ["file:///project"],
    unchangedProjects: [],
    missingProjects: [],
    missingJars: [],
    effectiveEntries: [{ project: "file:///project", jar: "C:/cache/module-abi.jar" }],
    unresolvedTypes: [],
    incompatibleClassFiles: [],
    workspaceProjects: [{ name: "project", locationUri: "file:///project", accessible: true, javaProject: true }],
    ...overrides
  };
}

test("Kotlin ABI reconciliation retries missing projects and logs JDT project inventory", async () => {
  const sent = [];
  const waits = [];
  const attempts = [];
  const results = [];
  const retries = [];
  const session = createReconciliationSession([
    successfulResult({ appliedProjects: [], missingProjects: ["file:///project"], effectiveEntries: [] }),
    successfulResult({ appliedProjects: [], missingProjects: ["file:///project"], effectiveEntries: [] }),
    successfulResult()
  ], sent);
  const client = registerMarkdownViewerKotlinAdapterClient(null, {
    fromFileUri: () => "C:/cache/module-abi.jar",
    wait(delayMs) { waits.push(delayMs); return Promise.resolve(); }
  });
  const snapshot = {
    metadataVersion: 2,
    workspaceRevision: "revision-1",
    entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar", contentHash: "hash", expectedFqns: [] }]
  };

  await client.applyAbiToJdt(snapshot, session, {
    onAttempt: (value) => attempts.push(value),
    onResult: (value) => results.push(value),
    onRetry: (value) => retries.push(value)
  });

  assert.deepEqual(waits, [1000, 3000]);
  assert.equal(attempts.length, 3);
  assert.equal(retries.length, 2);
  assert.equal(sent.filter((request) => request.method === "workspace/executeCommand").length, 3);
  assert.deepEqual(results[0].result.missingProjects, ["file:///project"]);
  assert.deepEqual(results[0].result.workspaceProjects[0], {
    name: "project",
    locationUri: "file:///project",
    accessible: true,
    javaProject: true
  });
});

test("Kotlin ABI reconciliation exhaustion retains structured missing-project evidence", async () => {
  const sent = [];
  const missing = successfulResult({ appliedProjects: [], missingProjects: ["file:///missing"], effectiveEntries: [] });
  const session = createReconciliationSession([missing, missing, missing], sent);
  const client = registerMarkdownViewerKotlinAdapterClient(null, {
    fromFileUri: () => "C:/cache/module-abi.jar",
    wait: () => Promise.resolve()
  });

  await assert.rejects(
    client.applyAbiToJdt({
      workspaceRevision: "revision-1",
      entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }]
    }, session),
    (error) => {
      assert.equal(error.code, "kotlin-abi-resources-missing");
      assert.deepEqual(error.evidence.result.missingProjects, ["file:///missing"]);
      assert.equal(error.evidence.result.workspaceProjects[0].name, "project");
      return true;
    }
  );
});

test("cancelling reconciliation sends JSON-RPC cancellation and rejects the pending request", async () => {
  const sent = [];
  const session = createReconciliationSession([], sent);
  const client = registerMarkdownViewerKotlinAdapterClient(null, {
    fromFileUri: () => "C:/cache/module-abi.jar"
  });
  const pending = client.applyAbiToJdt({
    workspaceRevision: "revision-1",
    entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }]
  }, session);

  assert.equal(client.cancelAbiReconciliation("Generation stopped."), 1);
  await assert.rejects(pending, (error) => error.code === "request-cancelled");
  const execute = sent.find((message) => message.method === "workspace/executeCommand");
  const cancellation = sent.find((message) => message.method === "$/cancelRequest");
  assert.equal(cancellation.params.id, execute.id);
});

test("coordinator preserves failure evidence, settles Java, and retries the latest ABI snapshot", async () => {
  const trace = [];
  const failures = [];
  let applyCount = 0;
  let javaSettled = 0;
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const kotlinSession = { transport: {} };
  const snapshot = {
    workspaceRevision: "revision-1",
    entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }]
  };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: "ready", logPath: "C:/jdt/.metadata/.log" }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/").toLowerCase(),
    registry: { getServerForLanguage: () => ({ id: "kotlin" }) },
    bridge: { async ensureSession() { return kotlinSession; } },
    jdtClient: { getSession: () => ({ transport: {} }), updateKotlinAbiSnapshot() {} },
    javaController: { markImporting() {}, markReady() { javaSettled += 1; } },
    diagnosticLifecycleTrace: { mark(name, details) { trace.push({ name, details }); } },
    analysisGenerationCoordinator: {
      getState: () => ({ generationId: 7, requirements: { jdt: true, kotlin: true, kotlinAbiRequired: true } }),
      beginGeneration: () => 7,
      acceptJdtLifecycle() {},
      markProgress() {},
      markKotlinAbiReady() {},
      markKotlinReady() {},
      markIncomplete(value) { failures.push(value); }
    },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      async refreshModel() { return snapshot; },
      async applyAbiToJdt(_snapshot, _session, callbacks) {
        applyCount += 1;
        callbacks.onAttempt({ attempt: 1, snapshot: { projects: ["file:///project"] } });
        if (applyCount === 1) {
          const error = new Error("JDT could not reconcile one project.");
          error.code = "kotlin-abi-resources-missing";
          error.evidence = { result: { missingProjects: ["file:///project"] } };
          throw error;
        }
        return successfulResult();
      },
      cancelAbiReconciliation() { return 0; },
      async confirmAbiApplied() { return true; },
      createProblemsProvider: () => ({ getSummary: () => ({ total: 0 }), getProblems: () => ({ problems: [] }), subscribe: () => () => {} }),
      subscribeStatus: () => () => {},
      subscribeAbi: () => () => {}
    }
  });

  coordinator.onModelResolved({
    workspaceRoot: "C:/Project",
    model: {
      hasKotlinContent: true,
      hasJavaContent: true,
      kotlinSourceFiles: ["C:/Project/App.kt"],
      javaSourceFiles: ["C:/Project/App.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(coordinator.getLastAbiFailure().code, "kotlin-abi-resources-missing");
  assert.deepEqual(coordinator.getLastAbiFailure().evidence.result.missingProjects, ["file:///project"]);
  assert.equal(failures[0].code, "kotlin-abi-resources-missing");
  assert.ok(trace.some((entry) => entry.name === "kotlin-analysis-failed" && entry.details.evidence));
  assert.ok(javaSettled > 0);

  assert.equal(await coordinator.retryAbiReconciliation(), true);
  assert.equal(applyCount, 2);
  assert.equal(coordinator.getLastAbiFailure(), null);
});

test("runtime loads the reconciliation policy before the Kotlin adapter", () => {
  const html = fs.readFileSync(path.join(__dirname, "../resources/index.html"), "utf8");
  assert.ok(html.indexOf("kotlin-abi-reconciliation-policy.js") < html.indexOf("kotlin-adapter-client.js"));
  const handler = fs.readFileSync(path.join(__dirname,
    "../language-server-extensions/kotlin-abi/src/main/java/mdeditor/kotlin/abi/KotlinAbiCommandHandler.java"), "utf8");
  assert.match(handler, /workspaceProjects.*KotlinAbiWorkspaceProjectInventory\.describe/);
});
