const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.dataset = {};
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.className = "";
    this.isConnected = false;
  }
  appendChild(child) { child.isConnected = true; this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  click() { this.listeners.click?.({ target: this }); }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement("body");
    this.elements = new Map();
  }
  createElement(tagName) { return new FakeElement(tagName); }
  getElementById(id) {
    if (!this.elements.has(id)) this.elements.set(id, new FakeElement("div"));
    return this.elements.get(id);
  }
  querySelectorAll() { return []; }
}

function loadDialog(document, deps) {
  const ids = [
    "java-rebuild-modal", "java-rebuild-title", "java-rebuild-javac-panel", "java-rebuild-maven-panel",
    "java-rebuild-maven-pom", "java-rebuild-maven-runner", "java-rebuild-maven-build-options",
    "java-rebuild-source-list", "java-rebuild-classpath-list", "java-rebuild-output-path",
    "java-rebuild-export-sources", "java-rebuild-command-preview", "java-rebuild-build",
    "java-rebuild-cancel", "java-rebuild-error", "java-rebuild-choose-output"
  ];
  ids.forEach((id) => document.getElementById(id));
  const sourcePath = path.resolve(__dirname, "../resources/js/project/java-rebuild-dialog.js");
  const context = { window: { document }, document };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  return context.window.registerMarkdownViewerJavaRebuildDialog({ registerModule() {} }, deps);
}

test("effective POM inspection minimizes rebuild dialog, restores it, and refreshes Build Options", async () => {
  const document = new FakeDocument();
  const createSessionCalls = [];
  const mountCalls = [];
  let terminalResolve;
  const dialog = loadDialog(document, {
    compiler: { buildJavacCommand() { return "javac"; }, normalizePath(value) { return value; } },
    mavenCommand: {
      buildCommand({ runner, optionArguments }) { return `${runner} clean package ${optionArguments.join(" ")}`.trim(); },
      buildEffectivePomCommand() { return "mvn help:effective-pom"; }
    },
    mavenBuildOptions: {
      async createSession(options) {
        createSessionCalls.push(options);
        return { options };
      },
      mount(_host, session, options) {
        mountCalls.push({ session, options });
        return {
          destroy() {},
          resolve() {
            return {
              valid: true,
              values: { "tests.compile": true, "tests.run": false, "plugin.apache-rat.skip": true },
              arguments: ["-DskipTests", "-Drat.skip=true"],
              advancedArgumentsRaw: "-Pdev",
              persistedConfiguration: { compileTests: true, runTests: false },
              warnings: [],
              errors: []
            };
          }
        };
      }
    },
    effectivePomParser: {
      parse() { return { plugins: [{ id: "apache-rat", confidence: "effective" }], warnings: [] }; }
    },
    terminal: {
      runCommand(command, options) {
        assert.equal(command, "mvn help:effective-pom");
        assert.equal(options.tabId, "maven-effective-pom");
        return new Promise((resolve) => { terminalResolve = resolve; });
      }
    },
    Neutralino: { os: { async showFolderDialog() { return null; } } }
  });

  const openPromise = dialog.openDialog({
    mode: "maven",
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: "mvn", projectRoot: "C:/Project", pomPath: "C:/Project/pom.xml" },
    maven: { compileTests: true, runTests: false },
    mavenBuildOptions: { invocationValues: { "plugin.apache-rat.skip": true }, requestedPluginSkips: ["apache-rat"] }
  });
  while (mountCalls.length === 0) await Promise.resolve();

  const inspectPromise = mountCalls.at(-1).options.onInspectEffectivePom();
  while (!terminalResolve) await Promise.resolve();
  assert.equal(document.getElementById("java-rebuild-modal").style.display, "none");
  const taskPill = document.body.children.find((child) => child.className === "maven-build-options-task-pill");
  assert.equal(taskPill.hidden, false);

  taskPill.click();
  assert.equal(document.getElementById("java-rebuild-modal").style.display, "flex");
  assert.equal(taskPill.hidden, true);
  assert.equal(mountCalls.at(-1).options.inspectInProgress, true);

  mountCalls.at(-1).options.onMinimizeTask();
  assert.equal(document.getElementById("java-rebuild-modal").style.display, "none");
  assert.equal(taskPill.hidden, false);

  terminalResolve({ exitCode: 0, stdout: "<project></project>", stderr: "", session: { consoleOutput: "" } });
  await inspectPromise;

  assert.equal(document.getElementById("java-rebuild-modal").style.display, "flex");
  assert.deepEqual(createSessionCalls.at(-1).effectivePomPluginSummary.plugins[0], { id: "apache-rat", confidence: "effective" });
  assert.equal(createSessionCalls.at(-1).invocationValues["plugin.apache-rat.skip"], true);
  assert.equal(createSessionCalls.at(-1).advancedArguments, "-Pdev");
  assert.match(mountCalls.at(-1).options.statusMessage, /refreshed/);

  document.getElementById("java-rebuild-cancel").onclick();
  assert.equal(await openPromise, null);
});

test("Gradle rebuild dialog previews project tasks and normalizes test choices", async () => {
  const document = new FakeDocument();
  const dialog = loadDialog(document, {
    compiler: { buildJavacCommand() { return "javac"; }, normalizePath(value) { return value; } },
    gradleCommand: {
      normalizeTestOptions(options) {
        return { compileTests: options.runTests === true || options.compileTests !== false, runTests: options.runTests === true };
      },
      buildCommand(options) {
        return `${options.runner} clean ${options.runTests ? "build" : "assemble testClasses"}`;
      }
    },
    Neutralino: { os: { async showFolderDialog() { return null; } } }
  });

  const openPromise = dialog.openDialog({
    mode: "gradle",
    gradleProject: {
      hasGradleProject: true,
      descriptorLabel: "settings.gradle.kts",
      runner: ".\\gradlew.bat",
      runnerError: "",
      gradleInstallation: { version: "8.10", path: "C:/Gradle/8.10" },
      launcherSettings: {}
    },
    gradle: { compileTests: true, runTests: false }
  });

  assert.equal(document.getElementById("java-rebuild-title").textContent, "Rebuild Gradle Project");
  assert.equal(document.getElementById("java-rebuild-gradle-panel").hidden, false);
  assert.equal(document.getElementById("java-rebuild-gradle-version").value, "8.10");
  assert.equal(document.getElementById("java-rebuild-gradle-home").value, "C:/Gradle/8.10");
  assert.equal(document.getElementById("java-rebuild-command-preview").value, ".\\gradlew.bat clean assemble testClasses");
  document.getElementById("java-rebuild-build").onclick();
  assert.deepEqual(await openPromise, { compileTests: true, runTests: false });
});
