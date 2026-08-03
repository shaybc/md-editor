const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerJdkRegistry } = require("../resources/js/java/jdk-registry.js");
const { registerMarkdownViewerJavaProjectRuntime } = require("../resources/js/project/java-project-runtime.js");
const { registerMarkdownViewerJavaAnalysisFailureMonitor } = require("../resources/js/lsp/java-analysis-failure-monitor.js");

function createRegistry(entries, existingPaths) {
  return registerMarkdownViewerJdkRegistry({ registerModule() {} }, {
    getEntries: () => entries,
    getOsName: () => "Windows",
    pathExists: async (path) => existingPaths.has(path),
    detectFeature: async (path) => path.includes("jdk-25") ? 25 : 17
  });
}

test("JDK registry migrates legacy entries to stable path-derived IDs and rejects JRE-only homes", async () => {
  const entries = [
    { name: "Project Java", path: "C:\\Java\\jdk-17" },
    { name: "Runtime only", path: "C:/Java/jre-25", feature: 25 }
  ];
  const existingPaths = new Set([
    "C:/Java/jdk-17",
    "C:/Java/jre-25",
    "C:/Java/jdk-17/bin/java.exe",
    "C:/Java/jdk-17/bin/javac.exe",
    "C:/Java/jre-25/bin/java.exe"
  ]);
  const registry = createRegistry(entries, existingPaths);

  assert.equal(registry.list()[0].id, "jdk:c:/java/jdk-17");
  assert.equal((await registry.validate(registry.list()[0])).valid, true);
  assert.equal((await registry.validate(registry.list()[1])).reason, "missing-javac");
});

test("project runtime keeps compilation on JDK 17 while selecting the newest configured JDT launcher", async () => {
  const entries = [
    { id: "project", name: "JDK 17", path: "C:/Java/jdk-17", feature: 17 },
    { id: "launcher", name: "JDK 25", path: "C:/Java/jdk-25", feature: 25 }
  ];
  const existingPaths = new Set(entries.flatMap((entry) => [
    entry.path,
    `${entry.path}/bin/java.exe`,
    `${entry.path}/bin/javac.exe`
  ]));
  const registry = createRegistry(entries, existingPaths);
  const runtimeResolver = registerMarkdownViewerJavaProjectRuntime({ registerModule() {} }, {
    jdkRegistry: registry,
    osName: "Windows"
  });
  const runtime = await runtimeResolver.resolve("C:/Project", { projectJdkId: "project" });

  assert.equal(runtime.projectJdk.feature, 17);
  assert.equal(runtime.launcherJdk.feature, 25);
  assert.equal(runtime.javacExecutable, "C:/Java/jdk-17/bin/javac.exe");
  assert.match(runtimeResolver.applyToCommand("mvn clean", runtime, "Windows"), /JAVA_HOME=C:\/Java\/jdk-17/);
});

test("project runtime prefers the bundled tooling JDK without changing the project JDK", async () => {
  const entries = [{ id: "project", name: "JDK 17", path: "C:/Java/jdk-17", feature: 17 }];
  const existingPaths = new Set([
    "C:/Java/jdk-17", "C:/Java/jdk-17/bin/java.exe", "C:/Java/jdk-17/bin/javac.exe",
    "C:/Desktop/bin/tooling-jdk", "C:/Desktop/bin/tooling-jdk/bin/java.exe", "C:/Desktop/bin/tooling-jdk/bin/javac.exe"
  ]);
  const runtimeResolver = registerMarkdownViewerJavaProjectRuntime({ registerModule() {} }, {
    jdkRegistry: createRegistry(entries, existingPaths),
    getBundledToolingJdkHome: () => "C:/Desktop/bin/tooling-jdk"
  });

  const runtime = await runtimeResolver.resolve("C:/Project", { projectJdkId: "project" });

  assert.equal(runtime.projectJdk.path, "C:/Java/jdk-17");
  assert.equal(runtime.launcherJdk.path, "C:/Desktop/bin/tooling-jdk");
  assert.equal(runtime.launcherJdk.feature, 21);
});

test("project runtime never falls back when Project JDK is missing", async () => {
  const registry = createRegistry([], new Set());
  const runtimeResolver = registerMarkdownViewerJavaProjectRuntime({ registerModule() {} }, { jdkRegistry: registry });
  const runtime = await runtimeResolver.resolve("C:/Project", { projectJdkId: null });

  assert.equal(runtime.ok, false);
  assert.equal(runtime.code, "project-jdk-required");
  await assert.rejects(() => runtimeResolver.requireForCommand("C:/Project", {}), /Select a Project JDK/);
});

test("Java analysis circuit breaker trips immediately for Java 26 class incompatibility and after three repeated imports", () => {
  const monitor = registerMarkdownViewerJavaAnalysisFailureMonitor({ registerModule() {} });
  const fatal = monitor.record({ workspaceId: "java:C:/Project", message: "Unsupported class file major version 70" });
  assert.equal(fatal.code, "jdk-incompatible");
  assert.equal(fatal.trip, true);

  const event = { workspaceId: "java:C:/Project", message: "Synchronize Gradle projects with workspace failed", timestamp: 1000 };
  assert.equal(monitor.record(event).trip, false);
  assert.equal(monitor.record(Object.assign({}, event, { timestamp: 2000 })).trip, false);
  assert.equal(monitor.record(Object.assign({}, event, { timestamp: 3000 })).trip, true);
  monitor.reset("java:C:/Project");
  assert.equal(monitor.record(Object.assign({}, event, { count: 3, timestamp: 4000 })).trip, true);
});
