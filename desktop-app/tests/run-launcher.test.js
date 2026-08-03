const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadLauncher(deps) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/run/run-launcher.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerRunLauncher({ registerModule() {} }, deps);
}

function createConfiguration() {
  return {
    id: "main",
    type: "java-application",
    name: "Main",
    workingDirectory: "",
    environment: [],
    buildBeforeRun: true,
    java: { mainClass: "example.Main", modulePath: "", jdkId: "", classpathOverride: "" }
  };
}

test("Run launcher resolves, builds, launches, activates, and persists Java output", async () => {
  const configuration = createConfiguration();
  const calls = [];
  const launcher = loadLauncher({
    store: {
      getSnapshot: () => ({ projectPath: "C:/Project", configurations: [configuration] }),
      get: () => configuration,
      getActive: () => configuration,
      async setActive(id) { calls.push(["active", id]); }
    },
    validation: { async validate() { return { runnable: true, errors: {} }; } },
    buildPath: { async loadConfiguration() { return { buildSystem: "javac", sourceFolders: ["src"], projectJdkId: "jdk" }; } },
    compiler: { resolveStoredPath: (root, value) => `${root}/${value}` },
    mainClassFinder: { async findAll() { return [{ className: "example.Main", filePath: "C:/Project/src/example/Main.java", sourceRoot: "C:/Project/src" }]; } },
    projectRuntime: { async requireForCommand() { return { projectJdk: { path: "C:/JDK" }, javaExecutable: "C:/JDK/bin/java.exe" }; } },
    mavenDetection: {},
    gradleDetection: {},
    buildBeforeLaunch: { async prepare() { calls.push(["build"]); } },
    runtimeClasspath: { async resolve() { return { classpath: "C:/Project/classes" }; } },
    commandBuilder: { build() { return { command: "java example.Main", cwd: "C:/Project", title: "Run: Main" }; } },
    terminal: {
      async runCommand(command, options) {
        calls.push(["run", command, options]);
        return { exitCode: 0, output: "hello", session: { consoleOutput: "hello" } };
      },
      async stopCommandSession() { return true; }
    },
    output: { async save(projectPath, result) { calls.push(["output", projectPath, result.content]); } },
    getProjectPath: () => "C:/Project",
    alert() {}
  });
  assert.equal(await launcher.runConfiguration(configuration), true);
  assert.deepEqual(calls[0], ["build"]);
  assert.deepEqual(calls[1], ["active", "main"]);
  assert.equal(calls[2][0], "run");
  assert.deepEqual(calls[3], ["output", "C:/Project", "hello"]);
  assert.equal(launcher.isRunning(), false);
});

test("Run launcher reports non-zero exit and persists failure output", async () => {
  const configuration = { ...createConfiguration(), buildBeforeRun: false };
  const alerts = [];
  const saved = [];
  const launcher = loadLauncher({
    store: {
      getSnapshot: () => ({ projectPath: "C:/Project", configurations: [configuration] }),
      async setActive() {}
    },
    validation: { async validate() { return { runnable: true, errors: {} }; } },
    buildPath: { async loadConfiguration() { return { buildSystem: "javac", sourceFolders: ["src"], projectJdkId: "jdk" }; } },
    compiler: { resolveStoredPath: (root, value) => `${root}/${value}` },
    mainClassFinder: { async findAll() { return [{ className: "example.Main" }]; } },
    projectRuntime: { async requireForCommand() { return { projectJdk: { path: "C:/JDK" }, javaExecutable: "java" }; } },
    buildBeforeLaunch: { async prepare() {} },
    runtimeClasspath: { async resolve() { return { classpath: "classes" }; } },
    commandBuilder: { build() { return { command: "java example.Main", cwd: "C:/Project", title: "Run: Main" }; } },
    terminal: { async runCommand() { return { exitCode: 7, output: "failed" }; } },
    output: { async save(_path, result) { saved.push(result); } },
    getProjectPath: () => "C:/Project",
    alert(message) { alerts.push(message); }
  });
  assert.equal(await launcher.runConfiguration(configuration), false);
  assert.equal(saved[0].exitCode, 7);
  assert.match(alerts[0], /exit code 7/);
});
