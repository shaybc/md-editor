const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDetection(existingFiles) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/maven-project-detection.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerMavenProjectDetection({ registerModule() {} }, {
    Neutralino: {
      filesystem: {
        async getStats(filePath) {
          if (!existingFiles.has(filePath)) throw new Error("not found");
          return { isFile: true };
        }
      }
    }
  });
}

test("Maven detection requires pom.xml at the project root", async () => {
  const detection = loadDetection(new Set(["C:/Project/module/pom.xml"]));
  const project = await detection.detectProject("C:/Project", "Windows");
  assert.equal(project.hasPom, false);
  assert.equal(project.pomPath, "C:/Project/pom.xml");
  assert.equal(project.runner, "mvn");
});

test("Windows Maven projects prefer mvnw.cmd", async () => {
  const detection = loadDetection(new Set(["C:/Project/pom.xml", "C:/Project/mvnw.cmd"]));
  const project = await detection.detectProject("C:/Project", "Windows");
  assert.equal(project.hasPom, true);
  assert.equal(project.usesWrapper, true);
  assert.equal(project.runner, ".\\mvnw.cmd");
});

test("non-Windows Maven projects prefer mvnw and otherwise use system Maven", async () => {
  const withWrapper = loadDetection(new Set(["/project/pom.xml", "/project/mvnw"]));
  const wrappedProject = await withWrapper.detectProject("/project", "Linux");
  assert.equal(wrappedProject.runner, "./mvnw");

  const withoutWrapper = loadDetection(new Set(["/project/pom.xml"]));
  const systemProject = await withoutWrapper.detectProject("/project", "Linux");
  assert.equal(systemProject.runner, "mvn");
});
test("configured source folders resolve one nested Maven project", async () => {
  const detection = loadDetection(new Set([
    "C:/Project/desktop-app/converters/java_converter/pom.xml",
    "C:/Project/desktop-app/converters/java_converter/mvnw.cmd"
  ]));
  const project = await detection.detectProject("C:/Project", "Windows", [
    "desktop-app/converters/java_converter/src/main",
    "desktop-app/converters/java_converter/src/test"
  ]);
  assert.equal(project.hasPom, true);
  assert.equal(project.projectRoot, "C:/Project/desktop-app/converters/java_converter");
  assert.equal(project.pomLabel, "desktop-app/converters/java_converter/pom.xml");
  assert.equal(project.runner, ".\\mvnw.cmd");
});

test("source folders from different nested Maven projects are ambiguous", async () => {
  const detection = loadDetection(new Set([
    "C:/Project/first/pom.xml",
    "C:/Project/second/pom.xml"
  ]));
  const project = await detection.detectProject("C:/Project", "Windows", ["first/src", "second/src"]);
  assert.equal(project.hasPom, false);
  assert.equal(project.ambiguous, true);
});

test("Maven runtime settings resolve wrapper-only custom and system modes", async () => {
  const runtimeModule = require("../resources/js/project/maven-runtime-settings.js");
  const files = new Set(["C:/Project/mvnw.cmd", "C:/Tools/Maven/bin/mvn.cmd"]);
  let state = { mavenExecutionMode: "wrapper" };
  const runtime = runtimeModule.registerMarkdownViewerMavenRuntimeSettings({ registerModule() {} }, {
    getSettings() { return state; },
    Neutralino: { filesystem: { async getStats(filePath) {
      if (!files.has(filePath)) throw new Error("not found");
      return { isFile: true };
    } } }
  });
  assert.equal((await runtime.resolveRunner({ projectRoot: "C:/Project/module", workspaceRoot: "C:/Project", osName: "Windows" })).runnerPath, "C:/Project/mvnw.cmd");
  state = { mavenExecutionMode: "custom", mavenExecutablePath: "C:/Tools/Maven/bin/mvn.cmd" };
  assert.equal((await runtime.resolveRunner({ projectRoot: "C:/Project", osName: "Windows" })).runnerPath, "C:/Tools/Maven/bin/mvn.cmd");
  state = { mavenExecutionMode: "system" };
  assert.equal((await runtime.resolveRunner({ projectRoot: "C:/Project", osName: "Windows" })).runner, "mvn.cmd");
});
