const test = require("node:test");
const assert = require("node:assert/strict");

const { registerMarkdownViewerEclipsePreferencesDetection } = require("../resources/js/lsp/eclipse-preferences-detection.js");
const { registerMarkdownViewerEclipsePreferencesController } = require("../resources/js/lsp/eclipse-preferences-controller.js");

function createApp() {
  return { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
}

function createFilesystemStub(files) {
  return {
    filesystem: {
      async readFile(path) {
        const key = String(path).replace(/\\/g, "/");
        if (!(key in files)) throw new Error(`Missing file: ${key}`);
        return files[key];
      },
      async writeFile(path, content) { files[String(path).replace(/\\/g, "/")] = content; },
      async createDirectory() {}
    }
  };
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("preference richness distinguishes Buildship baseline from curated files", () => {
  const detection = registerMarkdownViewerEclipsePreferencesDetection(createApp(), { Neutralino: createFilesystemStub({}) });
  assert.equal(detection.classifyPreferenceRichness(""), "none");
  assert.equal(detection.classifyPreferenceRichness([
    "eclipse.preferences.version=1",
    "org.eclipse.jdt.core.compiler.codegen.targetPlatform=17",
    "org.eclipse.jdt.core.compiler.compliance=17",
    "org.eclipse.jdt.core.compiler.source=17"
  ].join("\n")), "minimal");
  assert.equal(detection.classifyPreferenceRichness([
    "eclipse.preferences.version=1",
    "org.eclipse.jdt.core.compiler.problem.deprecation=ignore"
  ].join("\n")), "curated");
});

test("eclipse plugin references are recognized across Gradle dialects", () => {
  const detection = registerMarkdownViewerEclipsePreferencesDetection(createApp(), { Neutralino: createFilesystemStub({}) });
  assert.equal(detection.referencesEclipsePlugin("apply plugin: 'eclipse'"), true);
  assert.equal(detection.referencesEclipsePlugin('plugins { id("eclipse") }'), true);
  assert.equal(detection.referencesEclipsePlugin("eclipse.jdt { sourceCompatibility = 17 }"), true);
  assert.equal(detection.referencesEclipsePlugin("apply plugin: 'java-library'"), false);
});

test("detection follows apply-from includes and inspects module prefs", async () => {
  const files = {
    "C:/Project/build.gradle": 'apply plugin: "java"\napply from: "gradle/ide.gradle"',
    "C:/Project/gradle/ide.gradle": "apply plugin: 'eclipse'\neclipse.jdt { sourceCompatibility = 17 }",
    "C:/Project/spring-core/.settings/org.eclipse.jdt.core.prefs": "eclipse.preferences.version=1\norg.eclipse.jdt.core.compiler.compliance=17"
  };
  const detection = registerMarkdownViewerEclipsePreferencesDetection(createApp(), { Neutralino: createFilesystemStub(files) });
  const result = await detection.detect("C:/Project", {
    importers: { gradle: true },
    modules: [{ kind: "gradle", root: "C:/Project/spring-core" }]
  });
  assert.equal(result.generatable, true);
  assert.equal(result.present, false);
  assert.equal(result.richness, "minimal");
  assert.equal(result.taskName, "eclipseJdt");
});

test("detection inspects Maven and unmanaged Java module preferences", async () => {
  const files = {
    "C:/Maven/module-a/.settings/org.eclipse.jdt.core.prefs": "eclipse.preferences.version=1\norg.eclipse.jdt.core.compiler.problem.deprecation=ignore",
    "C:/Java/.settings/org.eclipse.jdt.core.prefs": "eclipse.preferences.version=1\norg.eclipse.jdt.core.compiler.problem.unusedImport=warning"
  };
  const detection = registerMarkdownViewerEclipsePreferencesDetection(createApp(), { Neutralino: createFilesystemStub(files) });
  const maven = await detection.detect("C:/Maven", {
    importers: { maven: true, gradle: false },
    modules: [{ kind: "maven", root: "C:/Maven/module-a", analysisIncluded: true }]
  });
  const standardJava = await detection.detect("C:/Java", {
    importers: { maven: false, gradle: false },
    modules: [{ kind: "unmanaged", root: "C:/Java", analysisIncluded: true }]
  });

  assert.equal(maven.present, true);
  assert.equal(maven.generatable, false);
  assert.equal(standardJava.present, true);
  assert.equal(standardJava.generatable, false);
});

test("detection ignores preferences from analysis-excluded modules", async () => {
  const files = {
    "C:/Project/excluded/.settings/org.eclipse.jdt.core.prefs": "eclipse.preferences.version=1\norg.eclipse.jdt.core.compiler.problem.deprecation=ignore"
  };
  const detection = registerMarkdownViewerEclipsePreferencesDetection(createApp(), { Neutralino: createFilesystemStub(files) });
  const result = await detection.detect("C:/Project", {
    importers: { maven: true, gradle: false },
    modules: [{ kind: "maven", root: "C:/Project/excluded", analysisIncluded: false }]
  });

  assert.equal(result.present, false);
});

test("controller prompts once, generates on ready, rebuilds, and records the applied signature", async () => {
  const files = {};
  const lifecycle = [];
  let javaPhase = "dormant";
  const session = { transport: {} };
  const controller = registerMarkdownViewerEclipsePreferencesController(createApp(), {
    Neutralino: createFilesystemStub(files),
    detection: { async detect() { return { present: false, generatable: true, richness: "minimal", taskName: "eclipseJdt" }; } },
    showNotification: async () => { lifecycle.push("prompted"); return "apply"; },
    getJavaState: () => ({ phase: javaPhase }),
    getJdtSession: () => (javaPhase === "ready" ? session : null),
    jdtClient: { async runEclipsePreferences() { lifecycle.push("generated"); return { ok: true, description: "done", logPath: "" }; } },
    requestJdtWorkspaceBuild: async () => { lifecycle.push("rebuilt"); },
    getStatusManager: () => null
  });

  await controller.onModelResolved({
    workspaceRoot: "C:/Project",
    model: { hasJavaContent: true, configurationSignature: "sig-1", importers: { gradle: true }, modules: [] }
  });
  await flushAsync();
  assert.deepEqual(lifecycle, ["prompted"]);
  assert.equal(controller.getSetting(), "generate");

  javaPhase = "ready";
  controller.onJavaStateChanged({ phase: "ready" });
  await flushAsync();
  await flushAsync();

  assert.deepEqual(lifecycle, ["prompted", "generated", "rebuilt"]);
  const state = JSON.parse(files["C:/Project/.md-editor/eclipse-preferences.json"]);
  assert.equal(state.setting, "generate");
  assert.equal(state.appliedSignature, "sig-1");
});

test("controller applies committed Maven and standard Java preferences without Gradle generation", async () => {
  for (const buildSystem of ["maven", "javac"]) {
    const files = {};
    const lifecycle = [];
    const controller = registerMarkdownViewerEclipsePreferencesController(createApp(), {
      Neutralino: createFilesystemStub(files),
      detection: { async detect() { return { present: true, generatable: false, richness: "curated", taskName: "eclipseJdt" }; } },
      getJavaState: () => ({ phase: "ready" }),
      getJdtSession: () => ({ transport: {} }),
      jdtClient: { async runEclipsePreferences() { lifecycle.push("generated"); return { ok: true, description: "generated", logPath: "" }; } },
      requestJdtWorkspaceBuild: async () => { lifecycle.push("rebuilt"); },
      getStatusManager: () => null
    });

    await controller.onModelResolved({
      workspaceRoot: "C:/Project",
      model: {
        hasJavaContent: true,
        configurationSignature: `sig-${buildSystem}`,
        projectConfiguration: { buildSystem },
        importers: { maven: buildSystem === "maven", gradle: false },
        modules: []
      }
    });
    const result = await controller.applyNow({ generate: false });

    assert.equal(result.ok, true);
    assert.deepEqual(lifecycle, ["rebuilt"]);
    const state = JSON.parse(files["C:/Project/.md-editor/eclipse-preferences.json"]);
    assert.equal(state.setting, "existing");
    assert.equal(state.appliedSignature, `sig-${buildSystem}`);
  }
});

test("controller publishes a non-fatal warning when generation fails", async () => {
  const collections = [];
  const controller = registerMarkdownViewerEclipsePreferencesController(createApp(), {
    Neutralino: createFilesystemStub({}),
    detection: { async detect() { return { present: false, generatable: true, richness: "minimal", taskName: "eclipseJdt" }; } },
    showNotification: async () => "never",
    getJavaState: () => ({ phase: "ready" }),
    getJdtSession: () => ({ transport: {} }),
    jdtClient: { async runEclipsePreferences() { return { ok: false, description: "Execution failed for task ':eclipseJdt'.", logPath: "log" }; } },
    problemsPanel: {
      setDiagnosticCollection(owner, diagnostics) { collections.push({ owner, diagnostics }); },
      clearDiagnosticCollection() {}
    },
    getStatusManager: () => null
  });

  await controller.onModelResolved({
    workspaceRoot: "C:/Project",
    model: { hasJavaContent: true, configurationSignature: "sig-1", importers: { gradle: true }, modules: [] }
  });
  const result = await controller.applyNow();

  assert.equal(result.ok, false);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].owner, "eclipse-preferences");
  assert.equal(collections[0].diagnostics[0].severity, "warning");
  assert.match(collections[0].diagnostics[0].message, /Execution failed for task ':eclipseJdt'/);
});
