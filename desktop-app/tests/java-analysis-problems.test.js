const assert = require("node:assert/strict");
const test = require("node:test");
const { registerMarkdownViewerJavaAnalysisProblems } = require("../resources/js/lsp/java-analysis-problems.js");
const { registerMarkdownViewerGradleJvmGuidance } = require("../resources/js/lsp/gradle-jvm-guidance.js");

function createHarness() {
  const collections = new Map();
  let workspacePath = "C:/Project";
  const problemsPanel = {
    setDiagnosticCollection(owner, diagnostics, options) { collections.set(owner, { diagnostics, options }); },
    clearDiagnosticCollection(owner) { collections.delete(owner); }
  };
  const api = registerMarkdownViewerJavaAnalysisProblems({ registerModule() {} }, { problemsPanel, getWorkspacePath: () => workspacePath });
  return { api, collections, setWorkspacePath(value) { workspacePath = value; } };
}

test("JDT analysis warning is replaced by an escalated protected error", () => {
  const harness = createHarness();
  harness.api.publish({ code: "maven-import-failed", fingerprint: "maven:1", summary: "Maven synchronization failed.", count: 1, trip: false, projectJdk: { name: "JDK 25", feature: 25 } }, { severity: "warning" });
  harness.api.publish({ code: "maven-import-failed", fingerprint: "maven:1", summary: "Maven synchronization failed.", count: 3, trip: true, projectJdk: { name: "JDK 25", feature: 25 } }, { severity: "error" });

  const collection = harness.collections.get("jdt-project-analysis");
  assert.equal(collection.diagnostics.length, 1);
  assert.equal(collection.diagnostics[0].severity, "error");
  assert.equal(collection.diagnostics[0].occurrenceCount, 3);
  assert.match(collection.diagnostics[0].message, /JDK 25 \(Java 25\)/);
  assert.equal(collection.options.userDeletable, false);
  assert.equal(collection.options.persistent, false);
});

test("fatal JDT process failures create one protected Gradle or Maven project error with the reason", () => {
  const harness = createHarness();
  const gradleFailure = harness.api.createFatalJdtProcessFailure({
    buildSystem: "gradle",
    reason: "the JDT process exited twice with exit code 1",
    projectPath: "C:/Project"
  });
  harness.api.publish(gradleFailure);
  const mavenFailure = harness.api.createFatalJdtProcessFailure({
    buildSystem: "maven",
    reason: "JDT could not be started",
    projectPath: "C:/Project"
  });
  harness.api.publish(mavenFailure);

  const collection = harness.collections.get("jdt-project-analysis");
  assert.equal(collection.diagnostics.length, 1);
  assert.equal(collection.diagnostics[0].severity, "error");
  assert.equal(collection.diagnostics[0].failureCode, "jdt-process-failed");
  assert.match(gradleFailure.summary, /Gradle project because the JDT process exited twice with exit code 1/);
  assert.match(collection.diagnostics[0].message, /Maven project because JDT could not be started/);
  assert.equal(collection.options.userDeletable, false);
  assert.equal(harness.api.createFatalJdtProcessFailure({ buildSystem: "unmanaged" }), null);
});

test("Gradle import problems include the captured failure reason", () => {
  const harness = createHarness();
  harness.api.publish({
    code: "gradle-import-failed",
    summary: "Java diagnostics unavailable because Gradle import failed.",
    reason: "Resolution of annotationProcessor was attempted without an exclusive lock",
    projectPath: "C:/Project",
    projectJdk: { name: "JDK 26", feature: 26 }
  });

  const diagnostic = harness.collections.get("jdt-project-analysis").diagnostics[0];
  assert.match(diagnostic.message, /Reason: Resolution of annotationProcessor was attempted without an exclusive lock\./);
  assert.match(diagnostic.message, /JDK 26 \(Java 26\)/);
});

test("workspace readiness and folder replacement clear the session problem", () => {
  const harness = createHarness();
  harness.api.publish({ code: "gradle-import-failed", fingerprint: "gradle:1", summary: "Gradle import failed.", projectPath: "C:/Project" });
  harness.setWorkspacePath("C:/Other");
  harness.api.syncWorkspaceState({ phase: "detecting", model: null });
  assert.equal(harness.api.getCurrent(), null);
  assert.equal(harness.collections.has("jdt-project-analysis"), false);

  harness.api.publish({ code: "maven-import-failed", fingerprint: "maven:1", summary: "Maven import failed.", projectPath: "C:/Other" });
  harness.api.syncWorkspaceState({ phase: "ready", model: { hasJavaContent: true } });
  assert.equal(harness.api.getCurrent(), null);
});

test("matching Maven and Gradle import failures reserve one post-build retry", () => {
  const harness = createHarness();
  assert.equal(harness.api.isBuildRecoverable({ code: "maven-import-failed" }, "maven"), true);
  assert.equal(harness.api.isBuildRecoverable({ code: "gradle-import-failed" }, "gradle"), true);
  assert.equal(harness.api.isBuildRecoverable({ code: "gradle-import-failed" }, "maven"), false);
  assert.equal(harness.api.isBuildRecoverable({ code: "maven-import-failed" }, "javac"), false);
  assert.equal(harness.api.markAutomaticRetryStarted("maven:1"), true);
  assert.equal(harness.api.markAutomaticRetryStarted("maven:1"), false);
});

test("workspace analysis progress identifies only provisional JDT phases", () => {
  const harness = createHarness();
  ["detecting", "starting", "initializing", "importing", "refreshing"].forEach((phase) => {
    assert.equal(harness.api.isWorkspaceAnalysisInProgress({ phase }), true);
  });
  ["dormant", "ready", "degraded", "cancelled", "closed"].forEach((phase) => {
    assert.equal(harness.api.isWorkspaceAnalysisInProgress({ phase }), false);
  });
});

test("runtime and launcher blockers publish actionable project errors", () => {
  const harness = createHarness();
  harness.api.syncWorkspaceState({
    phase: "runtime-required",
    model: { hasJavaContent: true },
    runtime: { code: "project-jdk-required", reason: "Select a Project JDK." }
  });
  assert.equal(harness.api.getCurrent().diagnostic.failureCode, "project-jdk-required");
  assert.equal(harness.api.getCurrent().diagnostic.severity, "error");

  harness.api.syncWorkspaceState({
    phase: "importing",
    model: { hasJavaContent: true },
    runtime: { ok: true, projectJdk: { name: "JDK 17", feature: 17 } }
  });
  assert.equal(harness.api.getCurrent(), null);
  assert.equal(harness.collections.has("jdt-project-analysis"), false);

  harness.api.syncWorkspaceState({
    phase: "degraded",
    model: { hasJavaContent: true },
    runtime: { ok: true, projectJdk: { name: "JDK 17", feature: 17 }, launcherJdk: null }
  });
  assert.equal(harness.api.getCurrent().diagnostic.failureCode, "jdt-launcher-required");
  assert.match(harness.api.getCurrent().diagnostic.remediation, /JDK 21/);
});

test("Gradle JVM guidance recommends Java 17 only for a JDK incompatibility", async () => {
  const files = new Map([
    ["C:/Project/build.gradle", "apply from: gradle/ide.gradle"],
    ["C:/Project/gradle/ide.gradle", "eclipse.jdt { javaRuntimeName = 'JavaSE-17' }"],
    ["C:/Project/.sdkmanrc", "java=25-tem"]
  ]);
  const guidanceApi = registerMarkdownViewerGradleJvmGuidance({ registerModule() {} }, {
    Neutralino: { filesystem: { async readFile(path) {
      if (!files.has(path)) throw new Error("missing");
      return files.get(path);
    } } }
  });
  const guidance = await guidanceApi.detect("C:/Project");
  const remediation = guidanceApi.createRemediation(
    { code: "jdk-incompatible" },
    { name: "JDK 25", feature: 25 },
    guidance
  );

  assert.equal(guidance.feature, 17);
  assert.equal(guidance.source, "gradle/ide.gradle");
  assert.match(remediation, /selected Gradle JVM is Java 25/);
  assert.match(remediation, /Select a Java 17 Project JDK/);
  assert.equal(
    guidanceApi.createRemediation({ code: "gradle-import-failed" }, { name: "JDK 26", feature: 26 }, guidance),
    "Fix the Gradle project import or tooling error, then retry Java project analysis."
  );
  assert.equal(await guidanceApi.detect("C:/Undeclared"), null);
});
