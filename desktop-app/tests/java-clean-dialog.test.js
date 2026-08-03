const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.style = {};
    this.children = [];
  }
  append(...children) { this.children.push(...children); }
  addEventListener() {}
  querySelectorAll() { return []; }
}

test("Gradle clean dialog shows the descriptor and returns build-after-clean", async () => {
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  };
  const document = { getElementById, createElement() { return new FakeElement(); } };
  const context = { window: { document }, document };
  const sourcePath = path.resolve(__dirname, "../resources/js/project/java-clean-dialog.js");
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const dialog = context.window.registerMarkdownViewerJavaCleanDialog({ registerModule() {} });
  const openPromise = dialog.openDialog({
    mode: "gradle",
    projectPath: "C:/Project",
    gradleProject: {
      hasGradleProject: true,
      descriptorLabel: "settings.gradle",
      runner: ".\\gradlew.bat",
      runnerError: "",
      gradleInstallation: { version: "8.10", path: "C:/Gradle/8.10" }
    }
  });
  elements.get("java-clean-build-after").checked = true;
  assert.equal(elements.get("java-clean-gradle-descriptor").value, "settings.gradle");
  assert.equal(elements.get("java-clean-gradle-version").value, "8.10");
  assert.equal(elements.get("java-clean-gradle-home").value, "C:/Gradle/8.10");
  assert.equal(elements.get("java-clean-gradle-runner").value, ".\\gradlew.bat");
  elements.get("java-clean-confirm").onclick();
  const result = JSON.parse(JSON.stringify(await openPromise));
  assert.deepEqual(result, { mode: "gradle", sourceFolders: [], modules: [], buildAfterClean: true });
});
