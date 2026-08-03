const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("Quick Fix routes project-level JDT analysis problems without querying source actions", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const diagnostic = { diagnosticKind: "jdt-project-analysis", message: "Java project analysis failed" };
  const action = { kind: "java-analysis-retry", provenance: "local", execute: true };
  const executed = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT source actions must not be queried for project analysis problems."); } },
    javaAnalysisProvider: {
      isDiagnostic(value) { return value?.diagnosticKind === "jdt-project-analysis"; },
      async getActions() { return [action]; },
      async executeAction(problem, selectedAction) { executed.push({ problem, selectedAction }); }
    },
    dialog: { async open(options) { assert.equal(options.aiAvailable, false); await options.executeAction(action); } }
  });

  assert.equal(controller.canOpenForDiagnostic(diagnostic), true);
  await controller.openForDiagnostic(diagnostic);
  assert.equal(executed[0].problem, diagnostic);
  assert.equal(executed[0].selectedAction, action);
});

test("Quick Fix routes a RAT diagnostic to the local RAT Manager action", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = { kind: "rat-manager", provenance: "local", execute: true };
  const opened = [];
  let queriedJdt = false;
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: {
      async getActions() {
        queriedJdt = true;
        return { actions: [] };
      }
    },
    localProvider: {
      isRatDiagnostic(diagnostic) {
        return /unapproved licenses/i.test(diagnostic.message);
      },
      async getActions() {
        return [action];
      }
    },
    dialog: {
      async open(options) {
        assert.equal(options.actions[0], action);
        assert.equal(options.aiAvailable, false);
        await options.executeAction(action);
      }
    },
    getRatManager() {
      return { async open(request) { opened.push(request); } };
    },
    getWorkspaceRoot() {
      return "C:/Project";
    }
  });
  const diagnostic = {
    source: "maven",
    message: "Files with unapproved licenses: module/snapshot",
    filePath: "C:/Project/module/snapshot"
  };

  assert.equal(controller.canOpenForDiagnostic(diagnostic), true);
  await controller.openForDiagnostic(diagnostic);
  assert.equal(queriedJdt, false);
  assert.equal(opened[0].route, "finding.summary");
  assert.equal(opened[0].projectPath, "C:/Project");
  assert.equal(opened[0].targetPath, "C:/Project/module/snapshot");
  assert.equal(opened[0].diagnostic, diagnostic);
});

test("Quick Fix routes a RAT diagnostic to the Maven rebuild deep link", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = {
    kind: "maven-rebuild-with-options",
    provenance: "local",
    execute: true,
    mavenBuildOptions: {
      invocationValues: { "plugin.apache-rat.skip": true },
      requestedPluginSkips: ["apache-rat"]
    }
  };
  const rebuildRequests = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for RAT diagnostics."); } },
    localProvider: {
      isRatDiagnostic(diagnostic) { return /unapproved licenses/i.test(diagnostic.message); },
      async getActions() { return [action]; }
    },
    dialog: {
      async open(options) {
        assert.equal(options.actions[0], action);
        await options.executeAction(action);
      }
    },
    getJavaProjectProvider() {
      return {
        async rebuildProject(context, options) {
          rebuildRequests.push({ context, options });
          return true;
        }
      };
    },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({
    source: "maven",
    message: "Files with unapproved licenses: module/snapshot",
    filePath: "C:/Project/module/snapshot"
  });

  assert.equal(rebuildRequests.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rebuildRequests[0].context)), { folderPath: "C:/Project" });
  assert.equal(rebuildRequests[0].options.mavenBuildOptions.invocationValues["plugin.apache-rat.skip"], true);
  assert.deepEqual(Array.from(rebuildRequests[0].options.mavenBuildOptions.requestedPluginSkips), ["apache-rat"]);
});

test("Quick Fix routes Spotless apply to the Java project provider", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = { kind: "maven-spotless-apply", provenance: "local", execute: true };
  const requests = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Spotless diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isSpotlessDiagnostic(diagnostic) { return diagnostic.problemType === "spotless-format"; },
      async getActions() { return [action]; }
    },
    dialog: {
      async open(options) {
        assert.equal(options.actions[0], action);
        assert.equal(options.aiAvailable, false);
        await options.executeAction(action);
      }
    },
    getJavaProjectProvider() {
      return {
        async runMavenSpotlessApply(context, options) {
          requests.push({ context, options });
          return true;
        }
      };
    },
    async confirm(message, options) {
      requests.push({ confirmation: { message, options } });
      return true;
    },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  const diagnostic = { source: "maven", problemType: "spotless-format", filePath: "C:/Project/module/src/App.java", message: "Spotless format violation" };
  assert.equal(controller.canOpenForDiagnostic(diagnostic), true);
  await controller.openForDiagnostic(diagnostic);
  assert.equal(requests.length, 2);
  assert.match(requests[0].confirmation.message, /may rewrite multiple files/);
  assert.equal(requests[0].confirmation.options.confirmLabel, "Run Spotless apply");
  assert.deepEqual(JSON.parse(JSON.stringify(requests[1].context)), { folderPath: "C:/Project" });
  assert.equal(requests[1].options.diagnostic, diagnostic);
});

test("Quick Fix does not run Spotless apply when confirmation is cancelled", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = { kind: "maven-spotless-apply", provenance: "local", execute: true };
  let ran = false;
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Spotless diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isSpotlessDiagnostic(diagnostic) { return diagnostic.problemType === "spotless-format"; },
      async getActions() { return [action]; }
    },
    dialog: { async open(options) { await options.executeAction(action); } },
    getJavaProjectProvider() {
      return { async runMavenSpotlessApply() { ran = true; return true; } };
    },
    async confirm() { return false; },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({ source: "maven", problemType: "spotless-format", filePath: "C:/Project/module/src/App.java", message: "Spotless format violation" });
  assert.equal(ran, false);
});

test("Quick Fix routes Maven dependency resolution retry to rebuild with -U", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = {
    kind: "maven-rebuild-with-options",
    provenance: "local",
    execute: true,
    mavenBuildOptions: { invocationValues: { "dependency.force-updates": true } }
  };
  const rebuildRequests = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven dependency diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic(diagnostic) { return /Could not resolve dependencies/i.test(diagnostic.message); },
      async getActions() { return [action]; }
    },
    dialog: {
      async open(options) {
        assert.equal(options.actions[0], action);
        assert.equal(options.aiAvailable, false);
        await options.executeAction(action);
      }
    },
    getJavaProjectProvider() {
      return {
        async rebuildProject(context, options) {
          rebuildRequests.push({ context, options });
          return true;
        }
      };
    },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  const diagnostic = { source: "maven", message: "Could not resolve dependencies for project" };
  assert.equal(controller.canOpenForDiagnostic(diagnostic), true);
  await controller.openForDiagnostic(diagnostic);
  assert.equal(rebuildRequests.length, 1);
  assert.equal(rebuildRequests[0].options.mavenBuildOptions.invocationValues["dependency.force-updates"], true);
});

test("Quick Fix normalizes legacy -U advanced argument deep links to the built-in checkbox", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = {
    kind: "maven-rebuild-with-options",
    provenance: "local",
    execute: true,
    mavenBuildOptions: { advancedArguments: "-U" }
  };
  const rebuildRequests = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven dependency diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic() { return true; },
      async getActions() { return [action]; }
    },
    dialog: { async open(options) { await options.executeAction(action); } },
    getJavaProjectProvider() {
      return { async rebuildProject(context, options) { rebuildRequests.push({ context, options }); return true; } };
    },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({ source: "maven", message: "Could not resolve dependencies" });
  assert.equal(rebuildRequests.length, 1);
  assert.equal(rebuildRequests[0].options.mavenBuildOptions.invocationValues["dependency.force-updates"], true);
  assert.equal(rebuildRequests[0].options.mavenBuildOptions.advancedArguments, "");
});

test("Quick Fix routes Maven dependency resolution effective-POM inspection", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = { kind: "maven-inspect-effective-pom", provenance: "local", execute: true };
  const rebuildRequests = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven dependency diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic() { return true; },
      async getActions() { return [action]; }
    },
    dialog: { async open(options) { await options.executeAction(action); } },
    getJavaProjectProvider() {
      return { async rebuildProject(context, options) { rebuildRequests.push({ context, options }); return true; } };
    },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({ source: "maven", message: "Could not resolve dependencies" });
  assert.equal(rebuildRequests.length, 1);
  assert.equal(rebuildRequests[0].options.mavenBuildOptions.autoInspectEffectivePom, true);
});

test("Quick Fix routes Maven dependency resolution explanation to app notification", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = { kind: "maven-dependency-resolution-help", provenance: "local", execute: true };
  const notifications = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({
    services: { notify: { show(request) { notifications.push(request); return Promise.resolve("ok"); } } },
    registerModule() {}
  }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven dependency diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic() { return true; },
      async getActions() { return [action]; }
    },
    dialog: { async open(options) { await options.executeAction(action); } },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({ source: "maven", message: "Could not resolve dependencies" });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Maven dependency resolution");
  assert.match(notifications[0].message, /Maven clean can do more than delete target folders/);
});

test("Quick Fix routes generic Maven diagnostics to local workflows instead of JDT", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = { kind: "maven-build-problem-help", provenance: "local", execute: true };
  const notifications = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({
    services: { notify: { show(request) { notifications.push(request); return Promise.resolve("ok"); } } },
    registerModule() {}
  }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic() { return false; },
      isMavenDiagnostic(diagnostic) { return /maven/i.test(diagnostic.source); },
      async getActions() { return [action]; }
    },
    dialog: {
      async open(options) {
        assert.equal(options.aiAvailable, false);
        assert.equal(options.actions[0], action);
        await options.executeAction(action);
      }
    },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  const diagnostic = {
    source: "maven",
    filePath: "C:/Project/src/main/java/org/example/ConfigGroups.java",
    message: "Violations also present in: src\\main\\java\\org\\example\\ConfigGroups.java"
  };
  assert.equal(controller.canOpenForDiagnostic(diagnostic), true);
  await controller.openForDiagnostic(diagnostic);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Maven build problem");
  assert.match(notifications[0].message, /came from Maven build output/);
});

test("Quick Fix shows mapped Maven problem explanations", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = {
    kind: "maven-problem-explanation",
    provenance: "local",
    execute: true,
    explanation: {
      title: "Spotless format violations",
      summary: "Spotless found files that do not match the configured formatting rules.",
      nextSteps: ["Run the project-approved formatter and review the diff."]
    }
  };
  const notifications = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({
    services: { notify: { show(request) { notifications.push(request); return Promise.resolve("ok"); } } },
    registerModule() {}
  }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic() { return false; },
      isMavenDiagnostic() { return true; },
      async getActions() { return [action]; }
    },
    dialog: { async open(options) { await options.executeAction(action); } },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({ source: "maven", message: "spotless failed" });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Spotless format violations");
  assert.match(notifications[0].message, /Suggested next steps/);
});

test("Quick Fix opens sanitized Maven web searches through the provided browser callback", async () => {
  const sourcePath = path.resolve(__dirname, "../resources/js/quick-fix/controller.js");
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context, { filename: sourcePath });
  const action = {
    kind: "maven-search-web",
    provenance: "local",
    execute: true,
    searchQuery: "Maven Spotless format violations spotless:apply"
  };
  const searches = [];
  const controller = context.window.registerMarkdownViewerQuickFixController({ registerModule() {} }, {
    javaProvider: { async getActions() { throw new Error("JDT should not be queried for Maven diagnostics."); } },
    localProvider: {
      isRatDiagnostic() { return false; },
      isMavenDependencyResolutionDiagnostic() { return false; },
      isMavenDiagnostic() { return true; },
      async getActions() { return [action]; }
    },
    dialog: { async open(options) { await options.executeAction(action); } },
    openExternalWebSearch(query) { searches.push(query); return Promise.resolve(true); },
    getWorkspaceRoot() { return "C:/Project"; }
  });

  await controller.openForDiagnostic({ source: "maven", message: "spotless failed" });
  assert.deepEqual(searches, ["Maven Spotless format violations spotless:apply"]);
});
