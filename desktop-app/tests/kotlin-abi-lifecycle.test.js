const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createKotlinAbiDependencyPlan } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-abi-dependency-plan.cjs");
const { createKotlinAbiRevisionLeases } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-abi-revision-leases.cjs");
const { collectExpectedKotlinExports } = require("../resources/bridges/kotlin-adapter-bridge/kotlin-source-exports.cjs");
const { registerMarkdownViewerKotlinAdapterClient } = require("../resources/js/lsp/kotlin-adapter-client.js");
const { registerMarkdownViewerKotlinWorkspaceCoordinator } = require("../resources/js/lsp/kotlin-workspace-coordinator.js");

test("Kotlin ABI dependency plan groups same-module cycles and rejects cross-module cycles", () => {
  const sameModule = {
    projectPath: ":app",
    sourceSets: [
      { name: "main", kotlin: ["Main.kt"], localSourceSetDependencies: ["support"] },
      { name: "support", kotlin: ["Support.kt"], localSourceSetDependencies: ["main"] }
    ]
  };
  const [group] = createKotlinAbiDependencyPlan({ modules: [sameModule] });
  assert.deepEqual(group.items.map((item) => item.sourceSet.name), ["main", "support"]);
  assert.deepEqual(group.dependencyGroupIds, []);

  const moduleA = {
    projectPath: ":a",
    sourceSets: [{ name: "main", kotlin: ["A.kt"], projectDependencies: [":b"] }]
  };
  const moduleB = {
    projectPath: ":b",
    sourceSets: [{ name: "main", kotlin: ["B.kt"], projectDependencies: [":a"] }]
  };
  assert.throws(() => createKotlinAbiDependencyPlan({ modules: [moduleA, moduleB] }),
    (error) => error?.code === "kotlin-abi-cross-module-cycle");
});

test("Kotlin ABI dependency plan adds the implicit test-to-main edge", () => {
  const module = {
    projectPath: ":app",
    sourceSets: [
      { name: "test", kotlin: ["Test.kt"], test: true },
      { name: "main", kotlin: ["Main.kt"] }
    ]
  };
  const plan = createKotlinAbiDependencyPlan({ modules: [module] });
  assert.deepEqual(plan.map((group) => group.items[0].sourceSet.name), ["main", "test"]);
  assert.deepEqual(plan[1].dependencyGroupIds, [plan[0].id]);
});

test("expected Kotlin ABI exports are derived from source visibility and nesting", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdeditor-kotlin-exports-"));
  const source = path.join(root, "Exports.kt");
  fs.writeFileSync(source, [
    "package sample.exports",
    "class DefaultPublic",
    "public interface PublicApi",
    "internal class InternalType",
    "private object PrivateObject",
    "class Outer { class Nested }"
  ].join("\n"));

  assert.deepEqual(collectExpectedKotlinExports([source]), [
    "sample.exports.DefaultPublic",
    "sample.exports.Outer",
    "sample.exports.PublicApi"
  ]);
});

test("Kotlin export scanning keeps strings, templates, and nested comments out of brace depth", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdeditor-kotlin-scanner-"));
  const source = path.join(root, "Scanner.kt");
  fs.writeFileSync(source, [
    "package sample.scanner",
    "class Container {",
    '  val url = "http://localhost:8080/{not-code}"',
    '  val rendered = "${map["k"]}"',
    '  val raw = """// class RawFake { ${map["k"]} }"""',
    "  val quote = '\\''",
    "  val `class` = 1",
    '  // a comment containing "an unmatched quote',
    "  /* outer { class Commented /* nested } */ still-comment } */",
    "  class Nested",
    "}",
    "class Visible"
  ].join("\n"));

  assert.deepEqual(collectExpectedKotlinExports([source]), [
    "sample.scanner.Container",
    "sample.scanner.Visible"
  ]);
});

test("superseding a generation cannot delete a revision still leased by JDT projects", () => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mdeditor-kotlin-leases-"));
  const oldRoot = path.join(cacheRoot, "abi", "old");
  const nextRoot = path.join(cacheRoot, "abi", "next");
  fs.mkdirSync(oldRoot, { recursive: true });
  fs.mkdirSync(nextRoot, { recursive: true });
  fs.writeFileSync(path.join(oldRoot, "old.jar"), "old");
  fs.writeFileSync(path.join(nextRoot, "next.jar"), "next");
  const trace = [];
  const leases = createKotlinAbiRevisionLeases({ cacheRoot, onLifecycle: (event) => trace.push(event) });
  const oldSnapshot = {
    workspaceRevision: "old",
    entries: [
      { projectUri: "file:///project-a", jarPath: path.join(oldRoot, "old.jar") },
      { projectUri: "file:///project-b", jarPath: path.join(oldRoot, "old.jar") }
    ]
  };
  const nextSnapshot = {
    workspaceRevision: "next",
    entries: [{ projectUri: "file:///project-a", jarPath: path.join(nextRoot, "next.jar") }]
  };

  leases.hydrateVerifiedSnapshot(oldSnapshot);
  leases.acquire("old", oldRoot, "generation");
  leases.release("old", "generation");
  assert.equal(fs.existsSync(oldRoot), true);

  leases.acquire("next", nextRoot, "generation");
  leases.replaceJdtRevision(oldSnapshot, nextSnapshot);
  assert.equal(fs.existsSync(oldRoot), false);
  assert.equal(fs.existsSync(nextRoot), true);
  assert.equal(trace.some((event) => event.operation === "delete"
    && event.revision === "old"
    && event.deletionReason === "unreferenced-after-newer-verified"), true);
});

test("Kotlin ABI reconciliation transports expectations and rejects unresolved types", async () => {
  let receive = null;
  let sentRequest = null;
  const session = {
    generationId: 42,
    transport: {
      subscribe(listener) { receive = listener; },
      send(message) {
        sentRequest = JSON.parse(message);
        const result = {
          generationId: 42,
          revision: "revision-1",
          appliedProjects: ["file:///project"],
          unchangedProjects: [],
          missingProjects: [],
          missingJars: [],
          effectiveEntries: [{ project: "file:///project", jar: "C:\\cache\\module-abi.jar" }],
          unresolvedTypes: [{ project: "file:///project", fqn: "sample.Missing" }],
          incompatibleClassFiles: []
        };
        setTimeout(() => receive(JSON.stringify({ jsonrpc: "2.0", id: sentRequest.id, result })), 0);
      }
    }
  };
  const client = registerMarkdownViewerKotlinAdapterClient(null, {
    fromFileUri: () => "C:/cache/module-abi.jar"
  });
  const snapshot = {
    workspaceRevision: "revision-1",
    entries: [{
      projectUri: "file:///project",
      jarUri: "file:///cache/module-abi.jar",
      contentHash: "sha256:abc",
      expectedFqns: ["sample.Missing"]
    }]
  };

  await assert.rejects(client.applyAbiToJdt(snapshot, session), /1 unresolved types/);
  const payload = sentRequest.params.arguments[0];
  assert.equal(payload.generationId, 42);
  assert.deepEqual(payload.projects[0].entries[0].expectedFqns, ["sample.Missing"]);
});

test("unverified Kotlin ABI reports provider failure without releasing ABI readiness", async () => {
  const milestones = [];
  const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
  const kotlinSession = { transport: {} };
  const coordinator = registerMarkdownViewerKotlinWorkspaceCoordinator(app, {
    isAutoStartEnabled: () => true,
    getJavaState: () => ({ phase: "ready" }),
    normalizePath: (value) => String(value || "").replace(/\\/g, "/"),
    registry: { getServerForLanguage: () => ({ id: "kotlin" }) },
    bridge: { async ensureSession() { return kotlinSession; } },
    jdtClient: { getSession: () => ({ transport: {} }) },
    javaController: { markImporting() {} },
    analysisGenerationCoordinator: {
      getState: () => ({ generationId: 7, requirements: { jdt: true, kotlin: true, kotlinAbiRequired: true } }),
      beginGeneration: () => 7,
      acceptJdtLifecycle() {},
      markKotlinReady() { milestones.push("kotlin-ready"); },
      markKotlinAbiReady() { milestones.push("abi-ready"); },
      markProviderFailed(value) { milestones.push(`provider-failed:${value.code}`); }
    },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      async refreshModel() {
        return {
          workspaceRevision: "revision-1",
          entries: [{ projectUri: "file:///project", jarUri: "file:///abi.jar" }]
        };
      },
      async applyAbiToJdt() { throw new Error("JDT could not verify the Kotlin ABI"); },
      async confirmAbiApplied() { milestones.push("confirmed"); },
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
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(milestones, ["provider-failed:kotlin-analysis-failed"]);
});

test("a JDT restart re-arms ABI reconciliation for an unchanged revision", async () => {
  let javaPhase = "ready";
  let applyCount = 0;
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
    registry: { getServerForLanguage: () => ({ id: "kotlin" }) },
    bridge: { async ensureSession() { return kotlinSession; } },
    jdtClient: { getSession: () => ({ transport: {} }), updateKotlinAbiSnapshot() {} },
    javaController: { markImporting() {} },
    kotlinClient: {
      setWorkspaceSession: (session) => session,
      async refreshModel() { return snapshot; },
      async applyAbiToJdt() { applyCount += 1; return { revision: "revision-1" }; },
      async confirmAbiApplied() { return true; },
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
  assert.equal(applyCount, 1);

  javaPhase = "restarting";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  javaPhase = "ready";
  coordinator.onJavaStateChanged({ phase: javaPhase });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(applyCount, 2);
});
