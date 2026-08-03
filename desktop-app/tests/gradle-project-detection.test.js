const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDetection(existingFiles) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/gradle-project-detection.js"), "utf8");
  const context = { window: {}, globalThis: {} };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerGradleProjectDetection({ registerModule() {} }, {
    Neutralino: { filesystem: { async getStats(filePath) {
      if (!existingFiles.has(filePath)) throw new Error("not found");
      return { isFile: true };
    } } }
  });
}

test("Gradle detection supports Kotlin settings and prefers the Windows wrapper", async () => {
  const detection = loadDetection(new Set(["C:/Project/settings.gradle.kts", "C:/Project/gradlew.bat"]));
  const project = await detection.detectProject("C:/Project", "Windows", [], { mode: "auto" });
  assert.equal(project.hasGradleProject, true);
  assert.equal(project.descriptorLabel, "settings.gradle.kts");
  assert.equal(project.runner, ".\\gradlew.bat");
  assert.equal(project.usesWrapper, true);
});

test("automatic Gradle selection falls back to a configured local installation and then PATH", async () => {
  const detection = loadDetection(new Set(["C:/Project/build.gradle"]));
  const local = await detection.detectProject("C:/Project", "Windows", [], {
    mode: "auto",
    selectedInstallation: { executablePath: "C:/Program Files/Gradle/bin/gradle.bat" }
  });
  assert.equal(local.runner, '"C:/Program Files/Gradle/bin/gradle.bat"');

  const pathRunner = await detection.detectProject("C:/Project", "Windows", [], { mode: "auto" });
  assert.equal(pathRunner.runner, "gradle");
});

test("Project Gradle selection uses the exact configured installation instead of the wrapper", async () => {
  const files = new Set([
    "C:/Project/settings.gradle",
    "C:/Project/gradlew.bat",
    "C:/Gradle/8.10/bin/gradle.bat"
  ]);
  const detection = loadDetection(files);
  const project = await detection.detectProject("C:/Project", "Windows", [], {
    mode: "local",
    requireInstallation: true,
    executable: "C:/Gradle/8.10/bin/gradle.bat",
    selectedInstallation: {
      id: "gradle-8.10",
      name: "Gradle 8.10",
      version: "8.10",
      path: "C:/Gradle/8.10",
      executablePath: "C:/Gradle/8.10/bin/gradle.bat"
    }
  });
  assert.equal(project.runner, "C:/Gradle/8.10/bin/gradle.bat");
  assert.equal(project.usesWrapper, false);
  assert.equal(project.gradleInstallation.version, "8.10");
});

test("missing Project Gradle executable blocks the resolved runner", async () => {
  const detection = loadDetection(new Set(["C:/Project/settings.gradle"]));
  const project = await detection.detectProject("C:/Project", "Windows", [], {
    mode: "local",
    requireInstallation: true,
    executable: "C:/Missing/bin/gradle.bat",
    selectedInstallation: { id: "missing", path: "C:/Missing", executablePath: "C:/Missing/bin/gradle.bat" }
  });
  assert.equal(project.runner, "");
  assert.match(project.runnerError, /executable is unavailable/);
});

test("wrapper mode reports an actionable error when the wrapper is missing", async () => {
  const detection = loadDetection(new Set(["/project/build.gradle"]));
  const project = await detection.detectProject("/project", "Linux", [], { mode: "wrapper" });
  assert.equal(project.runner, "");
  assert.match(project.runnerError, /does not contain/);
});

test("built-in Gradle selection bypasses an available project wrapper", async () => {
  const detection = loadDetection(new Set(["C:/Project/settings.gradle", "C:/Project/gradlew.bat"]));
  const project = await detection.detectProject("C:/Project", "Windows", [], { mode: "built-in" });
  assert.equal(project.runner, "gradle");
  assert.equal(project.usesWrapper, false);
  assert.equal(project.runnerError, "");
});

test("invalid saved local Gradle settings become a runner error", () => {
  const detection = loadDetection(new Set());
  const result = detection.resolveRunner(
    { hasWrapper: false, wrapperPath: "" },
    { mode: "local", configurationError: "The configured Gradle installation is unavailable." },
    "Windows"
  );
  assert.equal(result.runner, "");
  assert.match(result.error, /configured Gradle installation is unavailable/);
});

test("nested Gradle roots resolve from configured source folders and ambiguous roots are rejected", async () => {
  const files = new Set(["C:/Project/one/build.gradle", "C:/Project/two/settings.gradle"]);
  const detection = loadDetection(files);
  const nested = await detection.detectProject("C:/Project", "Windows", ["one/src/main/java"], { mode: "auto" });
  assert.equal(nested.projectRoot, "C:/Project/one");
  assert.equal(nested.descriptorLabel, "one/build.gradle");

  const ambiguous = await detection.detectProject("C:/Project", "Windows", ["one/src", "two/src"], { mode: "auto" });
  assert.equal(ambiguous.hasGradleProject, false);
  assert.equal(ambiguous.ambiguous, true);
});
