const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createEclipseScopePlan } = require("../resources/js/project/eclipse-analysis-scope-policy.js");

class ElementStub {
  constructor() {
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.classNames = new Set();
    this.classList = {
      toggle: (name, force) => force === undefined
        ? (this.classNames.has(name) ? !this.classNames.delete(name) : (this.classNames.add(name), true))
        : (force ? (this.classNames.add(name), true) : (this.classNames.delete(name), false)),
      contains: (name) => this.classNames.has(name)
    };
  }  addEventListener(type, listener) { (this.listeners ||= {})[type] = listener; }
  append(...children) { (this.children ||= []).push(...children); }
  appendChild(child) { (this.children ||= []).push(child); }
  replaceChildren() { this.children = []; }
  querySelector() { return null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function loadBuildPathSaveConfirmation(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-build-path-save-confirmation.js"), "utf8");
  const context = {
    console,
    window: {},
    document: { createElement() { return new ElementStub(); } }
  };
  vm.runInNewContext(source, context);
  return context.window.registerMarkdownViewerJavaBuildPathSaveConfirmation({ registerModule() {} }, options);
}

function loadBuildPath(options = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-build-path.js"), "utf8");
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new ElementStub());
    return elements.get(id);
  };
  const files = new Map();
  const context = {
    console,
    window: {},
    document: {
      getElementById: getElement,
      querySelectorAll() { return []; },
      createElement() { return new ElementStub(); }
    }
  };
  vm.runInNewContext(source, context);
  const api = context.window.registerMarkdownViewerJavaBuildPath({ registerModule() {} }, {
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeFile(filePath, content) { files.set(filePath, content); },
        async readFile(filePath) {
          if (!files.has(filePath)) throw new Error("not found");
          return files.get(filePath);
        }
      },
      os: { async showFolderDialog() { return ""; }, async showOpenDialog() { return []; } }
    },
    mavenDetection: { async detectProject() { return { hasPom: false }; } },
    gradleDetection: { async detectProject() { return { hasGradleProject: false, launcherSettings: {} }; } },
    ...options
  });
  return { api, files, elements };
}

test("Java Build Path orders system choice, selected configuration, and animated analysis", () => {
  const markup = fs.readFileSync(path.resolve(__dirname, "../resources/index.html"), "utf8");
  const styles = fs.readFileSync(path.resolve(__dirname, "../resources/styles.css"), "utf8");
  const buildSystemPosition = markup.indexOf('id="java-build-path-build-system-field"');
  const configurationPosition = markup.indexOf('id="java-build-path-configuration"');
  const projectJdkPosition = markup.indexOf('id="java-build-path-project-jdk"');
  const standardPosition = markup.indexOf('id="java-build-path-standard"');
  const mavenPosition = markup.indexOf('id="java-build-path-maven"');
  const gradlePosition = markup.indexOf('id="java-build-path-gradle"');
  const analysisPosition = markup.indexOf('id="java-build-path-analysis-settings"');

  assert.ok(buildSystemPosition < configurationPosition);
  assert.ok(configurationPosition < projectJdkPosition);
  assert.ok(projectJdkPosition < standardPosition);
  assert.ok(projectJdkPosition < mavenPosition);
  assert.ok(projectJdkPosition < gradlePosition);
  assert.ok(standardPosition < analysisPosition);
  assert.ok(mavenPosition < analysisPosition);
  assert.ok(gradlePosition < analysisPosition);
  assert.match(markup, /<h3 class="settings-field-label java-build-path-section-title">Analysis<\/h3>/);
  assert.doesNotMatch(markup, />Apply project Eclipse preferences</);
  assert.match(markup, /<label class="java-build-path-eclipse-preferences-checkbox">\s*<input id="java-build-path-eclipse-preferences-enabled" type="checkbox">\s*<span id="java-build-path-eclipse-preferences-description" class="java-project-help"><\/span>\s*<\/label>/);
  assert.ok(markup.indexOf('id="java-build-path-eclipse-preferences-enabled"') < markup.indexOf('id="java-build-path-eclipse-preferences-apply"'));
  assert.match(styles, /\.java-build-path-analysis-disclosure\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*transition:/s);
  assert.match(styles, /\.java-build-path-analysis\.is-expanded \.java-build-path-analysis-disclosure\s*\{[^}]*grid-template-rows:\s*1fr;/s);
});

test("Java Analysis disclosure toggles accessible expanded state", () => {
  const { elements } = loadBuildPath();
  const analysis = elements.get("java-build-path-analysis");
  const toggle = elements.get("java-build-path-analysis-toggle");
  const disclosure = elements.get("java-build-path-analysis-disclosure");

  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(disclosure.getAttribute("aria-hidden"), "true");
  assert.equal(disclosure.inert, true);
  toggle.listeners.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(disclosure.getAttribute("aria-hidden"), "false");
  assert.equal(disclosure.inert, false);
  assert.equal(analysis.classList.contains("is-expanded"), true);
  toggle.listeners.click();
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(disclosure.inert, true);
  assert.equal(analysis.classList.contains("is-expanded"), false);
});
test("Java build path persists project-relative sources and external libraries", async () => {
  const { api, files } = loadBuildPath();
  assert.equal(api.toStoredPath("C:/Project", "C:/Project/src/main/java"), "src/main/java");
  assert.equal(api.toStoredPath("C:/Project", "D:/Shared/classes"), "D:/Shared/classes");

  await api.saveConfiguration("C:/Project", {
    sourceFolders: ["src/main/java"],
    classpathFolders: ["D:/Shared/classes"],
    jarFiles: ["lib/example.jar"]
  });
  const stored = JSON.parse(files.get("C:/Project/.md-editor/java-build-path.json"));
  assert.deepEqual(stored, {
    schemaVersion: 10,
    type: "md-editor-java-build-path",
    projectJdkId: null,
    buildSystem: "javac",
    sourceFolders: ["src/main/java"],
    classpathFolders: ["D:/Shared/classes"],
    jarFiles: ["lib/example.jar"],
    analysisScope: {
      mode: "all",
      inventoryKind: "",
      deselectedEntryIds: [],
      customized: false
    },
    javacProfile: null,
    maven: {
      compileTests: true,
      runTests: false
    },
    gradle: {
      mode: "installation",
      installationId: null,
      compileTests: true,
      runTests: false
    }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await api.loadConfiguration("C:/Project"))), stored);
});

test("source validation rejects external and overlapping folders", () => {
  const { api } = loadBuildPath();
  assert.match(api.validateSourceFolders("C:/Project", ["D:/External/src"]), /inside the opened project/);
  assert.match(api.validateSourceFolders("C:/Project", ["src", "src/main/java"]), /contain one another/);
  assert.equal(api.validateSourceFolders("C:/Project", ["src/main/java", "src/test/java"]), "");
});

test("missing configuration returns an empty Java build path", async () => {
  const { api } = loadBuildPath();
  const configuration = await api.loadConfiguration("C:/Missing");
  assert.deepEqual(Array.from(configuration.sourceFolders), []);
  assert.deepEqual(Array.from(configuration.classpathFolders), []);
  assert.deepEqual(Array.from(configuration.jarFiles), []);
});

test("schema version 1 keeps Java entries and leaves the build system undecided", () => {
  const { api } = loadBuildPath();
  const configuration = api.normalizeConfiguration({
    schemaVersion: 1,
    sourceFolders: ["src/main/java"],
    classpathFolders: ["classes"],
    jarFiles: ["lib/example.jar"]
  });
  assert.equal(configuration.schemaVersion, 10);
  assert.equal(configuration.projectJdkId, null);
  assert.equal(configuration.buildSystem, null);
  assert.deepEqual(Array.from(configuration.sourceFolders), ["src/main/java"]);
  assert.deepEqual(Array.from(configuration.classpathFolders), ["classes"]);
  assert.deepEqual(Array.from(configuration.jarFiles), ["lib/example.jar"]);
  assert.deepEqual(JSON.parse(JSON.stringify(configuration.analysisScope)), {
    mode: "all",
    inventoryKind: "",
    deselectedEntryIds: [],
    customized: false
  });
});

test("Eclipse scope selects leaf Eclipse projects for an auto-derived build path", () => {
  const modules = [
    { root: "C:/Project", kind: "mixed", kinds: ["gradle", "eclipse"] },
    { root: "C:/Project/buildSrc", kind: "gradle", kinds: ["gradle"] },
    { root: "C:/Project/spring-core", kind: "eclipse", kinds: ["eclipse"] },
    { root: "C:/Project/spring-web", kind: "eclipse", kinds: ["eclipse"] }
  ];
  const plan = createEclipseScopePlan(
    "C:/Project",
    modules,
    { analysisScope: { mode: "build-path", includedModuleRoots: [], excludedModuleRoots: [], customized: false } },
    (_workspaceRoot, moduleRoot) => moduleRoot === "C:/Project" ? "." : moduleRoot.replace("C:/Project/", "")
  );

  assert.equal(plan.changed, true);
  assert.equal(plan.requiresConfirmation, false);
  assert.deepEqual(plan.analysisScope, {
    mode: "build-path",
    includedModuleRoots: ["spring-core", "spring-web"],
    excludedModuleRoots: [".", "buildSrc"],
    customized: false
  });
});

test("Eclipse scope requires approval before replacing a customized selection", () => {
  const plan = createEclipseScopePlan(
    "C:/Project",
    [{ root: "C:/Project/spring-core", kind: "eclipse", kinds: ["eclipse"] }],
    { analysisScope: { mode: "workspace", includedModuleRoots: [], excludedModuleRoots: [], customized: true } },
    (_workspaceRoot, moduleRoot) => moduleRoot.replace("C:/Project/", "")
  );

  assert.equal(plan.changed, true);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.analysisScope.customized, true);
});

test("Maven build choice and last Build Project options persist per project", async () => {
  const { api, files } = loadBuildPath();
  await api.saveConfiguration("C:/Project", {
    buildSystem: "maven",
    sourceFolders: ["src/main/java"],
    classpathFolders: [],
    jarFiles: [],
    maven: { compileTests: false, runTests: false, lastBuildOptionArguments: ["-Dmaven.test.skip=true", "-Pdev"] }
  });
  const stored = JSON.parse(files.get("C:/Project/.md-editor/java-build-path.json"));
  assert.equal(stored.buildSystem, "maven");
  assert.deepEqual(stored.maven, {
    compileTests: false,
    runTests: false,
    lastBuildOptionArguments: ["-Dmaven.test.skip=true", "-Pdev"]
  });
  assert.deepEqual(stored.sourceFolders, ["src/main/java"]);
});

test("running Maven tests always enables test compilation", () => {
  const { api } = loadBuildPath();
  const configuration = api.normalizeConfiguration({
    buildSystem: "maven",
    maven: { compileTests: false, runTests: true }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(configuration.maven)), { compileTests: true, runTests: true });
});

test("older schemas migrate Gradle runtime defaults and preserve Gradle choices", () => {
  const { api } = loadBuildPath();
  const migrated = api.normalizeConfiguration({ schemaVersion: 4, buildSystem: "javac" });
  assert.equal(migrated.schemaVersion, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.gradle)), { mode: "installation", installationId: null, compileTests: true, runTests: false });

  const priorScope = api.normalizeConfiguration({
    schemaVersion: 9,
    analysisScope: { mode: "build-path", includedModuleRoots: ["buildSrc"], excludedModuleRoots: ["."], customized: true }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(priorScope.analysisScope)), {
    mode: "all",
    inventoryKind: "",
    deselectedEntryIds: [],
    customized: false
  });

  const configured = api.normalizeConfiguration({
    schemaVersion: 5,
    buildSystem: "gradle",
    gradle: { installationId: "gradle-8.10", compileTests: false, runTests: true }
  });
  assert.equal(configured.buildSystem, "gradle");
  assert.deepEqual(JSON.parse(JSON.stringify(configured.gradle)), { mode: "installation", installationId: "gradle-8.10", compileTests: true, runTests: true });

  const wrapper = api.normalizeConfiguration({ buildSystem: "gradle", gradle: { mode: "wrapper" } });
  assert.equal(wrapper.gradle.mode, "wrapper");
  const builtIn = api.normalizeConfiguration({ buildSystem: "gradle", gradle: { mode: "built-in" } });
  assert.equal(builtIn.gradle.mode, "built-in");
});

test("open Java Build Path refreshes Project JDK choices after Settings changes", async () => {
  let runtimes = [{ id: "jdk-21", name: "JDK 21", feature: 21, path: "C:/Java/21" }];
  const jdkRegistry = {
    list() { return runtimes; },
    resolve(id) { return runtimes.find((runtime) => runtime.id === id) || null; },
    async validate(entry) { return { valid: true, runtime: entry }; }
  };
  const { api, elements } = loadBuildPath({ jdkRegistry });
  void api.openDialog("C:/Project");
  await new Promise((resolve) => setImmediate(resolve));
  runtimes = runtimes.concat({ id: "jdk-25", name: "JDK 25", feature: 25, path: "C:/Java/25" });

  assert.equal(await api.refreshProjectJdks(), true);
  assert.deepEqual(elements.get("java-build-path-project-jdk").children.map((option) => option.value), ["", "jdk-21", "jdk-25"]);
});

test("Gradle Build Path selects and displays a configured project installation", async () => {
  let installations = [{
    id: "gradle-8.10",
    name: "Gradle 8.10",
    version: "8.10",
    path: "C:/Gradle/8.10",
    executablePath: "C:/Gradle/8.10/bin/gradle.bat"
  }];
  const { api, elements } = loadBuildPath({
    getGradleInstallations() { return installations; },
    getSelectedGradleInstallationId() { return "gradle-8.10"; },
    getGradleLauncherSettings(selection) {
      const selectedInstallation = installations.find((installation) => installation.id === selection.installationId) || null;
      return { selectedInstallation, executable: selectedInstallation?.executablePath || "" };
    },
    gradleDetection: {
      async detectProject(_projectPath, _osName, _sourceFolders, settings) {
        return {
          hasGradleProject: true,
          descriptorLabel: "settings.gradle",
          runner: settings.executable,
          runnerError: "",
          gradleInstallation: settings.selectedInstallation,
          launcherSettings: settings
        };
      }
    }
  });

  void api.openDialog("C:/Project");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get("java-build-path-gradle-installation").value, "installation:gradle-8.10");
  assert.equal(elements.get("java-build-path-gradle-version").value, "8.10");
  assert.equal(elements.get("java-build-path-gradle-home").value, "C:/Gradle/8.10");
  assert.equal(elements.get("java-build-path-gradle-runner").value, "C:/Gradle/8.10/bin/gradle.bat");

  installations = installations.concat({
    id: "gradle-9",
    name: "Gradle 9",
    version: "9",
    path: "C:/Gradle/9",
    executablePath: "C:/Gradle/9/bin/gradle.bat"
  });
  assert.equal(await api.refreshGradleInstallations(), true);
  assert.deepEqual(elements.get("java-build-path-gradle-installation").children.map((option) => option.value), ["wrapper", "built-in", "", "installation:gradle-8.10", "installation:gradle-9"]);
});

test("Eclipse preferences analysis is available for Maven and standard Java projects", async () => {
  const cases = [
    {
      buildSystem: "maven",
      mavenDetection: { async detectProject() { return { hasPom: true, pomLabel: "pom.xml", runner: "mvn" }; } },
      expectedDescription: /committed Eclipse compiler preferences/,
      expectedBuildSystemDescription: /Maven controls source roots/
    },
    {
      buildSystem: "javac",
      mavenDetection: { async detectProject() { return { hasPom: false }; } },
      expectedDescription: /committed Eclipse compiler preferences/,
      expectedBuildSystemDescription: /Standard Java uses the configured source folders/
    }
  ];

  for (const testCase of cases) {
    const { api, elements } = loadBuildPath({
      mavenDetection: testCase.mavenDetection,
      eclipsePreferences: {
        getDetection() { return { present: true, generatable: false, richness: "curated" }; },
        getSetting() { return "existing"; },
        getState() { return {}; }
      }
    });
    await api.saveConfiguration("C:/Project", { buildSystem: testCase.buildSystem });
    void api.openDialog("C:/Project");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(elements.get("java-build-path-eclipse-preferences").hidden, false);
    assert.equal(elements.get("java-build-path-eclipse-preferences-enabled").checked, true);
    assert.equal(elements.get("java-build-path-eclipse-preferences-enabled").disabled, true);
    assert.equal(elements.get("java-build-path-eclipse-preferences-apply").disabled, false);
    assert.match(elements.get("java-build-path-eclipse-preferences-description").textContent, testCase.expectedDescription);
    assert.match(elements.get("java-build-path-build-system-description").textContent, testCase.expectedBuildSystemDescription);
  }
});

test("Eclipse preferences analysis retains Gradle generation controls", async () => {
  const { api, elements } = loadBuildPath({
    gradleDetection: {
      async detectProject() {
        return { hasGradleProject: true, descriptorLabel: "settings.gradle", launcherSettings: {}, runner: "gradlew" };
      }
    },
    eclipsePreferences: {
      getDetection() { return { present: false, generatable: true, richness: "minimal" }; },
      getSetting() { return "generate"; },
      getState() { return {}; }
    }
  });
  await api.saveConfiguration("C:/Project", { buildSystem: "gradle", gradle: { mode: "wrapper" } });
  void api.openDialog("C:/Project");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get("java-build-path-eclipse-preferences").hidden, false);
  assert.equal(elements.get("java-build-path-eclipse-preferences-enabled").checked, true);
  assert.equal(elements.get("java-build-path-eclipse-preferences-enabled").disabled, false);
  assert.equal(elements.get("java-build-path-eclipse-preferences-apply").disabled, false);
  assert.match(elements.get("java-build-path-eclipse-preferences-description").textContent, /eclipseJdt task/);
  assert.match(elements.get("java-build-path-build-system-description").textContent, /Gradle controls source sets/);
});

test("Eclipse preferences analysis stays visible but disabled when no preferences exist", async () => {
  const { api, elements } = loadBuildPath({
    eclipsePreferences: {
      getDetection() { return { present: false, generatable: false, richness: "none" }; },
      getSetting() { return "existing"; },
      getState() { return {}; }
    }
  });
  await api.saveConfiguration("C:/Project", { buildSystem: "javac" });
  void api.openDialog("C:/Project");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get("java-build-path-eclipse-preferences").hidden, false);
  assert.equal(elements.get("java-build-path-eclipse-preferences-enabled").checked, false);
  assert.equal(elements.get("java-build-path-eclipse-preferences-enabled").disabled, true);
  assert.equal(elements.get("java-build-path-eclipse-preferences-apply").disabled, true);
  assert.match(elements.get("java-build-path-eclipse-preferences-status").textContent, /No project Eclipse preferences/);
});

test("Java Build Path save confirmation rebuilds with analyzers checked by default", async () => {
  const rebuilds = [];
  const analyzerRuns = [];
  const configuration = { buildSystem: "maven" };
  let rebuildDecision = "";
  const confirmation = loadBuildPathSaveConfirmation({
    shouldConfirm() { return true; },
    notify: {
      async show(options) {
        const body = new ElementStub();
        options.renderBody(body);
        assert.equal(body.children[0].children[1].checked, true);
        return "rebuild";
      }
    },
    async rebuildProject(projectPath, options) {
      assert.equal(rebuildDecision, "rebuild");
      rebuilds.push([projectPath, options]);
      return true;
    },
    async runAnalyzers(projectPath) { analyzerRuns.push(projectPath); }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await confirmation.confirmAfterSave("C:/Project", configuration, {
    onDecision(decision) { rebuildDecision = decision; }
  }))), {
    rebuilt: true,
    analyzersRun: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilds)), [["C:/Project", { runAnalyzers: false, useLastOptions: true }]]);
  assert.deepEqual(analyzerRuns, ["C:/Project"]);
});

test("Java Build Path save confirmation honors the analyzer checkbox and approval preference", async () => {
  let promptCount = 0;
  let analyzerRuns = 0;
  const confirmation = loadBuildPathSaveConfirmation({
    shouldConfirm() { return true; },
    notify: {
      async show(options) {
        promptCount += 1;
        const body = new ElementStub();
        options.renderBody(body);
        const input = body.children[0].children[1];
        input.checked = false;
        input.listeners.change();
        return "rebuild";
      }
    },
    async rebuildProject() { return true; },
    async runAnalyzers() { analyzerRuns += 1; }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await confirmation.confirmAfterSave("C:/Project", { buildSystem: "maven" }))), {
    rebuilt: true,
    analyzersRun: false
  });
  assert.equal(analyzerRuns, 0);

  const disabled = loadBuildPathSaveConfirmation({
    shouldConfirm() { return false; },
    notify: { async show() { promptCount += 1; } }
  });
  await disabled.confirmAfterSave("C:/Project");
  assert.equal(promptCount, 1);
});

test("first Standard Java save opens Build instead of reusing missing build options", async () => {
  const buildRequests = [];
  const analyzerRuns = [];
  const confirmation = loadBuildPathSaveConfirmation({
    shouldConfirm() { return true; },
    notify: {
      async show(options) {
        assert.match(options.message, /Build the project to select Java build options/);
        assert.equal(options.buttons[1].label, "Build");
        return "build";
      }
    },
    async rebuildProject(projectPath, options) {
      buildRequests.push([projectPath, options]);
      return true;
    },
    async runAnalyzers(projectPath) { analyzerRuns.push(projectPath); }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await confirmation.confirmAfterSave("C:/Project", {
    buildSystem: "javac",
    javacProfile: null
  }))), {
    rebuilt: true,
    analyzersRun: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildRequests)), [[
    "C:/Project",
    { runAnalyzers: false, useLastOptions: false }
  ]]);
  assert.deepEqual(analyzerRuns, ["C:/Project"]);
});

test("Not Now and unchanged saves still synchronize Java analysis", async () => {
  const analyzerRuns = [];
  let prompts = 0;
  const confirmation = loadBuildPathSaveConfirmation({
    shouldConfirm() { return true; },
    notify: {
      async show() {
        prompts += 1;
        return "cancel";
      }
    },
    async runAnalyzers(projectPath) { analyzerRuns.push(projectPath); }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await confirmation.confirmAfterSave("C:/Project", {
    buildSystem: "javac",
    javacProfile: null
  }))), {
    rebuilt: false,
    analyzersRun: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await confirmation.confirmAfterSave("C:/Project", {
    buildSystem: "javac",
    javacProfile: null
  }, {
    configurationChanged: false
  }))), {
    rebuilt: false,
    analyzersRun: true
  });
  assert.equal(prompts, 1);
  assert.deepEqual(analyzerRuns, ["C:/Project", "C:/Project"]);
});

test("source-folder edits refresh the visible Java analysis inventory", async () => {
  const { api, elements } = loadBuildPath({
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeFile() {},
        async readFile() { throw new Error("not found"); }
      },
      os: {
        async showFolderDialog() { return "C:/Project/client/src"; },
        async showOpenDialog() { return []; }
      }
    },
    javaWorkspaceModel: {
      async detect() {
        return { modules: [], standardJavaSourceRoots: [], analysisInventory: { kind: "standard-source-folders", label: "Java source folders", entries: [] } };
      }
    },
    javaAnalysisInventory: {
      async resolve(context) {
        return {
          kind: "standard-source-folders",
          label: "Java source folders",
          entries: (context.configuration.sourceFolders || []).map((relativePath) => ({
            id: `standard:${relativePath}`,
            provider: "standard",
            name: relativePath,
            relativePath,
            dependencies: []
          }))
        };
      }
    }
  });

  void api.openDialog("C:/Project");
  await new Promise((resolve) => setImmediate(resolve));
  elements.get("java-build-path-add-source").listeners.click();
  await new Promise((resolve) => setImmediate(resolve));

  const analysisRows = elements.get("java-build-path-analysis-module-list").children;
  assert.equal(analysisRows.length, 1);
  assert.equal(analysisRows[0].children[1].textContent, "client/src");
});

test("saving Build Path settings always invokes workspace synchronization", async () => {
  const savedEvents = [];
  const jdk = { id: "jdk-17", name: "JDK 17", feature: 17, path: "C:/Java/17" };
  const { api, elements } = loadBuildPath({
    jdkRegistry: {
      list() { return [jdk]; },
      resolve(id) { return id === jdk.id ? jdk : null; },
      async validate(entry) { return { valid: true, runtime: entry }; }
    },
    javaWorkspaceModel: {
      async detect() {
        return {
          modules: [],
          analysisInventory: { kind: "standard-source-folders", label: "Java source folders", entries: [] }
        };
      }
    },
    async onConfigurationSaved(projectPath, configuration, options) {
      savedEvents.push({ projectPath, configuration, changed: options.configurationChanged });
      options.onDecision("synchronize");
    }
  });
  await api.saveConfiguration("C:/Project", {
    projectJdkId: jdk.id,
    buildSystem: "javac",
    sourceFolders: ["client/src"],
    analysisScope: {
      mode: "all",
      inventoryKind: "standard-source-folders",
      deselectedEntryIds: [],
      customized: false
    }
  });

  const dialog = api.openDialog("C:/Project");
  await new Promise((resolve) => setImmediate(resolve));
  await elements.get("java-build-path-save").onclick();
  await dialog;

  assert.equal(savedEvents.length, 1);
  assert.equal(savedEvents[0].projectPath, "C:/Project");
  assert.equal(typeof savedEvents[0].changed, "boolean");
  assert.equal(savedEvents[0].configuration.projectJdkId, jdk.id);
});
