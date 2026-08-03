const test = require("node:test");
const assert = require("node:assert/strict");

const { registerMarkdownViewerKotlinWorkspaceCoordinator } = require("../resources/js/lsp/kotlin-workspace-coordinator.js");
const { registerMarkdownViewerKotlinAdapterClient } = require("../resources/js/lsp/kotlin-adapter-client.js");

test("mixed workspace waits for Java readiness before starting Kotlin analysis", async () => {
  const sessions = [];
  let javaPhase = "dormant";
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const kotlinSession = { transport: {} };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: javaPhase }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/"),
    registry: { getServerForLanguage: (language) => ({ id: language }) },
    bridge: {
      async ensureSession(options) {
        sessions.push(options.server.id);
        return kotlinSession;
      }
    },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      async refreshModel() {
        return { workspaceRevision: "1", entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }] };
      },
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
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(sessions, []);
  assert.equal(coordinator.getSession(), null);

  javaPhase = "ready";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(sessions, ["kotlin"]);
  assert.equal(coordinator.getSession(), kotlinSession);
});

test("verified Kotlin ABI installation completes without waiting for a JDT import event", async () => {
  const lifecycle = [];
  const diagnosticMilestones = [];
  const abiInstallDetails = [];
  const analysisMilestones = [];
  let analysisGenerationId = 1;
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const kotlinSession = { transport: {} };
  let coordinator;
  coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    diagnosticLifecycleTrace: {
      startGeneration: (reason) => diagnosticMilestones.push(`generation:${reason}`),
      mark(milestone, details) {
        diagnosticMilestones.push(milestone);
        if (milestone === "kotlin-abi-installed") abiInstallDetails.push(details);
      }
    },
    analysisGenerationCoordinator: {
      getState: () => ({
        generationId: analysisGenerationId,
        requirements: { jdt: true, kotlin: true, kotlinAbiRequired: true }
      }),
      beginGeneration() {
        analysisGenerationId += 1;
        analysisMilestones.push("generation");
        return analysisGenerationId;
      },
      acceptJdtLifecycle(value) { analysisMilestones.push(value.phase); },
      markKotlinAbiReady() { analysisMilestones.push("abi-ready"); },
      markKotlinReady() { analysisMilestones.push("kotlin-ready"); }
    },
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: "ready" }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/"),
    registry: { getServerForLanguage: (language) => ({ id: language }) },
    bridge: { async ensureSession() { return kotlinSession; } },
    jdtClient: { getSession: () => ({ transport: {} }) },
    javaController: {
      markImporting() {
        lifecycle.push("importing");
        coordinator?.onJavaStateChanged({ phase: "importing" });
      },
      markReady() {
        lifecycle.push("ready");
        coordinator?.onJavaStateChanged({ phase: "ready" });
      }
    },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      async refreshModel() {
        return { workspaceRevision: "1", entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }] };
      },
      async applyAbiToJdt() {
        lifecycle.push("applied");
        return { revision: "1", invalidatedProjects: ["file:///project"], unchangedProjects: [] };
      },
      async confirmAbiApplied() { lifecycle.push("confirmed"); },
      async requestJdtWorkspaceBuild() { lifecycle.push("unexpected-rebuild"); },
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
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(lifecycle, ["importing", "applied", "confirmed"]);
  assert.deepEqual(analysisMilestones, ["generation", "service-ready", "import-complete", "abi-ready", "kotlin-ready"]);
  assert.deepEqual(diagnosticMilestones, [
    "kotlin-model-started",
    "kotlin-model-completed",
    "kotlin-abi-install-started",
    "kotlin-abi-verified",
    "kotlin-abi-installed",
    "kotlin-abi-confirmed"
  ]);
  assert.equal(abiInstallDetails[0].abiRevision, "1");
  assert.equal(abiInstallDetails[0].invalidatedProjectCount, 1);
  assert.equal(abiInstallDetails[0].unchangedProjectCount, 0);
  assert.equal(typeof abiInstallDetails[0].durationMs, "number");
});
test("terminal Java failure settles Kotlin state instead of claiming an active import", async () => {
  const statuses = [];
  let javaPhase = "importing";
  const app = {
    modules: {
      statusManager: {
        setStatus(request) { statuses.push({ label: request.label, showProgress: request.showProgress === true }); },
        unsetStatus() { statuses.push({ label: "", showProgress: false }); }
      }
    },
    registerModule(id, value) { this.modules[id] = value; }
  };
  const readiness = [];
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: javaPhase }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/"),
    registry: { getServerForLanguage: (language) => ({ id: language }) },
    bridge: { async ensureSession() { throw new Error("JDT never became ready, Kotlin must not start"); } },
    onAnalysisReady: (ready) => readiness.push(ready),
    kotlinClient: {
      setWorkspaceSession: (session) => session,
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
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(statuses.at(-1), { label: "Java: Importing (Kotlin ABI pending)", showProgress: true });

  javaPhase = "degraded";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(statuses.at(-1), { label: "Kotlin: Unavailable (Java analysis failed)", showProgress: false });
  assert.equal(coordinator.isAnalysisReady(), true);
  assert.equal(readiness.at(-1), true);
  assert.equal(coordinator.getSession(), null);
});

test("mixed project with Kotlin auto-start disabled keeps full JDT problem authority", async () => {
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const readiness = [];
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => false,
    getJavaState: () => ({ phase: "importing" }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/"),
    onAnalysisReady: (ready) => readiness.push(ready)
  });

  coordinator.onModelResolved({
    workspaceRoot: "C:/Project",
    model: {
      hasKotlinContent: true,
      hasJavaContent: true,
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(coordinator.isAnalysisReady(), true);
  assert.equal(readiness.at(-1), true);
});

test("Kotlin adapter accepts only JDT-confirmed ABI entries", async () => {
  let responseEntries = {
    revision: "revision-1",
    appliedProjects: ["file:///project"],
    unchangedProjects: [],
    missingProjects: [],
    missingJars: [],
    effectiveEntries: [{ project: "file:///project", jar: "C:\\cache\\module-abi.jar" }]
  };
  let responseQueue = [];
  let requestCount = 0;
  let lastRequest = null;
  let receive = null;
  const session = {
    transport: {
      subscribe(listener) { receive = listener; },
      send(message) {
        const request = JSON.parse(message);
        lastRequest = request;
        requestCount += 1;
        const result = responseQueue.length ? responseQueue.shift() : responseEntries;
        setTimeout(() => receive(JSON.stringify({ jsonrpc: "2.0", id: request.id, result })), 0);
      }
    }
  };
  const client = registerMarkdownViewerKotlinAdapterClient(null, {
    fromFileUri: () => "C:/cache/module-abi.jar",
    wait: () => Promise.resolve()
  });
  const snapshot = {
    workspaceRevision: "revision-1",
    entries: [{ projectUri: "file:///project", jarUri: "file:///cache/module-abi.jar", contentHash: "sha256:abc" }]
  };

  await assert.doesNotReject(client.applyAbiToJdt(snapshot, session));
  assert.equal(lastRequest.params.arguments[0].projects[0].entries[0].contentHash, "sha256:abc");
  responseQueue = [
    { ...responseEntries, effectiveEntries: [] },
    responseEntries
  ];
  await assert.doesNotReject(client.applyAbiToJdt(snapshot, session));
  responseEntries = { ...responseEntries, effectiveEntries: [] };
  await assert.rejects(client.applyAbiToJdt(snapshot, session),
    /did not confirm 1 Kotlin ABI classpath entries: file:\/\/\/project -> C:\/cache\/module-abi\.jar/);
  assert.equal(requestCount, 6);

  responseEntries = {
    revision: "revision-1",
    appliedProjects: [],
    unchangedProjects: [],
    missingProjects: [],
    missingJars: [],
    effectiveEntries: [{ project: "file:///project", jar: "C:\\cache\\module-abi.jar" }]
  };
  await assert.rejects(client.applyAbiToJdt(snapshot, session), /did not report reconciliation for 1 Kotlin ABI projects/);
});

test("Kotlin adapter extends ABI command waiting while JDT reports progress", async () => {
  let receive = null;
  const session = {
    transport: {
      subscribe(listener) { receive = listener; },
      send(message) {
        const request = JSON.parse(message);
        setTimeout(() => receive(JSON.stringify({ jsonrpc: "2.0", method: "$/progress", params: { token: "build" } })), 15);
        setTimeout(() => receive(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: true })), 30);
      }
    }
  };
  const client = registerMarkdownViewerKotlinAdapterClient(null);

  await assert.doesNotReject(client.request(session, "workspace/executeCommand", {}, {
    stallTimeoutMs: 20,
    maximumTimeoutMs: 100
  }));
});
test("same Kotlin ABI revision is not reinstalled after a Java final-build importing cycle", async () => {
  let javaPhase = "ready";
  let abiListener = null;
  let applyCount = 0;
  let confirmCount = 0;
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const kotlinSession = { transport: {} };
  const snapshot = {
    workspaceRevision: "revision-1",
    entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }]
  };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: javaPhase }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/"),
    registry: { getServerForLanguage: (language) => ({ id: language }) },
    bridge: { async ensureSession() { return kotlinSession; } },
    jdtClient: {
      getSession: () => ({ transport: {} }),
      updateKotlinAbiSnapshot() {}
    },
    javaController: { markImporting() {} },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      async refreshModel() { return snapshot; },
      async applyAbiToJdt() { applyCount += 1; },
      async confirmAbiApplied() { confirmCount += 1; return true; },
      createProblemsProvider: () => ({
        getSummary: () => ({ total: 0 }),
        getProblems: () => ({ problems: [] }),
        subscribe: () => () => {}
      }),
      subscribeStatus: () => () => {},
      subscribeAbi(listener) { abiListener = listener; return () => {}; }
    }
  });
  coordinator.setProblemsBroker({
    registerProvider() {},
    scheduleRefresh() {}
  });

  coordinator.onModelResolved({
    workspaceRoot: "C:/Project",
    model: {
      hasKotlinContent: true,
      hasJavaContent: true,
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(applyCount, 1);
  assert.equal(confirmCount, 1);

  javaPhase = "importing";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  abiListener({ ...snapshot, abiChanged: true });
  javaPhase = "ready";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(applyCount, 1);
  assert.equal(confirmCount, 1);
});
test("canonical generation terminal state clears the Kotlin finalizing status", () => {
  const statuses = [];
  const app = {
    modules: {
      statusManager: {
        setStatus(value) { statuses.push(value); },
        unsetStatus() {}
      }
    },
    registerModule() {}
  };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    normalizePath: (value) => String(value || "").replace(/\\/g, "/").toLowerCase(),
    isAutoStartEnabled: () => false
  });
  coordinator.onModelResolved({
    workspaceRoot: "C:/Project",
    model: { hasKotlinContent: true, hasJavaContent: false }
  });

  coordinator.onAnalysisGenerationState({ workspaceRoot: "C:/Other", status: "committed" });
  assert.equal(statuses.length, 0);
  coordinator.onAnalysisGenerationState({ workspaceRoot: "C:/Project", status: "committed" });
  assert.deepEqual(statuses.at(-1), { id: "kotlin-workspace", label: "Java/Kotlin: Ready", showProgress: false, priority: 11 });
  coordinator.onAnalysisGenerationState({ workspaceRoot: "C:/Project", status: "incomplete" });
  assert.equal(statuses.at(-1).label, "Java/Kotlin: Analysis incomplete");
  assert.equal(statuses.at(-1).showProgress, false);
});


test("validated canonical JDT state releases a pending unchanged ABI while Java remains validating", async () => {
  let javaPhase = "ready";
  let resolveRefreshModel;
  let applyCount = 0;
  let confirmCount = 0;
  let beginRequest = null;
  const readinessEvents = [];
  const jdtState = {
    serviceReady: true,
    importReady: true,
    initialBuildComplete: true,
    inventoryStatus: "loading",
    validatedProjectRoots: ["C:/Project"]
  };
  let generationState = {
    status: "running",
    generationId: 1,
    workspaceRoot: "C:/Project",
    requirements: { jdt: true, kotlin: true, kotlinAbiRequired: true },
    providers: { jdt: jdtState }
  };
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: javaPhase }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/").toLowerCase(),
    registry: { getServerForLanguage: (language) => ({ id: language }) },
    bridge: { async ensureSession() { return { transport: {} }; } },
    jdtClient: {
      getSession: () => ({ transport: {} }),
      updateKotlinAbiSnapshot() {}
    },
    javaController: { markImporting() {} },
    analysisGenerationCoordinator: {
      getState: () => generationState,
      beginGeneration(request) {
        beginRequest = request;
        generationState = {
          ...generationState,
          generationId: 2,
          providers: { jdt: { ...jdtState, inventoryStatus: "validated" } }
        };
        return 2;
      },
      acceptJdtLifecycle() {},
      markKotlinAbiReady() { readinessEvents.push("abi-ready"); },
      markKotlinReady() { readinessEvents.push("kotlin-ready"); }
    },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      refreshModel() {
        return new Promise((resolve) => { resolveRefreshModel = resolve; });
      },
      async applyAbiToJdt() { applyCount += 1; return { revision: "revision-1" }; },
      async confirmAbiApplied() { confirmCount += 1; return true; },
      createProblemsProvider: () => ({
        getSummary: () => ({ total: 0 }),
        getProblems: () => ({ problems: [] }),
        subscribe: () => () => {}
      }),
      subscribeStatus: () => () => {},
      subscribeAbi: () => () => {}
    }
  });

  coordinator.onModelResolved({
    workspaceRoot: "C:/Project",
    model: {
      hasKotlinContent: true,
      hasJavaContent: true,
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  javaPhase = "importing";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  resolveRefreshModel({
    workspaceRevision: "revision-1",
    abiChanged: false,
    entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(applyCount, 0);

  jdtState.inventoryStatus = "validated";
  coordinator.onAnalysisGenerationState(generationState);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(applyCount, 1);
  assert.equal(confirmCount, 1);
  assert.equal(beginRequest.jdtReady, true);
  assert.deepEqual(readinessEvents, ["abi-ready", "kotlin-ready"]);
});

test("mixed Kotlin model readiness remains active until the canonical generation commits", async () => {
  const statuses = [];
  let statusListener = null;
  const app = {
    modules: {
      statusManager: {
        setStatus(value) { statuses.push(value); },
        unsetStatus() {}
      }
    },
    registerModule(id, value) { this.modules[id] = value; }
  };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: "dormant" }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/").toLowerCase(),
    registry: { getServerForLanguage: (language) => ({ id: language }) },
    kotlinClient: {
      createProblemsProvider: () => ({
        getSummary: () => ({ total: 0 }),
        getProblems: () => ({ problems: [] }),
        subscribe: () => () => {}
      }),
      subscribeStatus(listener) { statusListener = listener; return () => {}; },
      subscribeAbi: () => () => {}
    }
  });
  coordinator.setProblemsBroker({ registerProvider() {}, scheduleRefresh() {} });
  coordinator.onModelResolved({
    workspaceRoot: "C:/Project",
    model: {
      hasKotlinContent: true,
      hasJavaContent: true,
      kotlinSourceFiles: ["C:/Project/src/App.kt"],
      javaSourceFiles: ["C:/Project/src/Api.java"],
      kotlinModuleRoots: ["C:/Project"]
    }
  });
  coordinator.onAnalysisGenerationState({ workspaceRoot: "C:/Project", status: "running", providers: {} });

  statusListener({ phase: "ready", message: "Kotlin: Ready" });
  assert.equal(statuses.at(-1).label, "Java/Kotlin: Finalizing analysis");
  assert.equal(statuses.at(-1).showProgress, true);

  coordinator.onAnalysisGenerationState({ workspaceRoot: "C:/Project", status: "committed", providers: {} });
  assert.equal(statuses.at(-1).label, "Java/Kotlin: Ready");
  assert.equal(statuses.at(-1).showProgress, false);
});