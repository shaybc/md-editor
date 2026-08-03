const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadProvider(overrides = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/project/java-project-provider.js"), "utf8");
  const context = { window: {}, globalThis: {}, console };
  vm.runInNewContext(source, context);
  let provider;
  const diagnostics = [];
  const commands = [];
  const savedConfigurations = [];
  const removedClassFolders = [];
  const statusEvents = [];
  const javadocRuns = [];
  const parsedJavacOutputs = [];
  const savedRebuildOutputs = [];
  const gradleLauncherInstallationIds = [];
  let rebuildDialogOpenCount = 0;
  let problemsPanelShows = 0;
  let clearedProblems = 0;
  const parsedMavenContexts = [];
  const parsedGradleContexts = [];
  let clearedOutput = 0;
  const deps = {
    buildPath: {
      async loadConfiguration() { return overrides.configuration; },
      async saveConfiguration(_projectPath, configuration) { savedConfigurations.push(configuration); return configuration; },
      async openDialog() { return overrides.configuredConfiguration || null; },
      resolveStoredPath(projectPath, storedPath) { return `${projectPath}/${storedPath}`; },
      getOrderedLibraryEntries() { return []; }
    },
    compiler: {
      normalizePath(value) { return String(value).replace(/\\/g, "/"); },
      joinPath(parent, child) { return `${parent}/${child}`; },
      async pathExists() { return true; },
      async collectJavaFiles() { return ["C:/Project/src/Main.java"]; },
      async createSourceArgumentFiles(entries) { return { tempPath: "C:/Temp/build", sourceRoots: entries }; },
      async removeTemporaryFolder() {},
      async removeClassFiles(folderPath) { removedClassFolders.push(folderPath); },
      async removeFiles() {},
      async prepareClasspathEntries() { return []; },
      findSourceExportCollisions() { return []; },
      buildJavacCommand() { return "javac @sources.txt"; },
      parseJavacDiagnostics(output) {
        parsedJavacOutputs.push(output);
        return (overrides.javacDiagnostics || []).map((diagnostic) => Object.assign({}, diagnostic));
      }
    },
    mavenDetection: {
      async detectProject(projectPath, osName, sourceFolders) {
        if (overrides.detectProject) return overrides.detectProject(projectPath, osName, sourceFolders);
        return overrides.mavenProject || { hasPom: true, pomLabel: "pom.xml", runner: ".\\mvnw.cmd" };
      },
      async detectProjectForTarget(projectPath, targetPath, osName) {
        return overrides.targetMavenProject || this.detectProject(projectPath, osName, [targetPath]);
      }
    },
    mavenCommand: {
      buildCommand(options) {
        if (Array.isArray(options.optionArguments)) return `${options.runner} clean package${options.optionArguments.length ? " " + options.optionArguments.join(" ") : ""}`;
        return `${options.runner} clean package -DskipTests${options.skipRat ? " -Drat.skip=true" : ""}`;
      },
      buildCleanCommand(options) { return `${options.runner} clean`; },
      buildCompileCommand(options) { return `${options.runner} ${options.includeTests ? "test-compile" : "compile"}`; },
      buildSpotlessApplyCommand(options) { return `${options.runner} -f ${options.pomPath.replace(options.cwd + "/", "")} spotless:apply`; }
    },
    mavenDiagnostics: {
      parseDiagnostics(_output, options) {
        parsedMavenContexts.push(options);
        return (overrides.mavenDiagnostics || []).map((diagnostic) => Object.assign({}, diagnostic));
      }
    },
    gradleDetection: {
      async detectProject() {
        return overrides.gradleProject || {
          hasGradleProject: true,
          descriptorLabel: "settings.gradle",
          runner: ".\\gradlew.bat",
          runnerError: "",
          projectRoot: "C:/Project",
          launcherSettings: { offline: false, userHome: "" }
        };
      }
    },
    gradleCommand: {
      normalizeTestOptions(options) {
        return { compileTests: options.runTests === true || options.compileTests !== false, runTests: options.runTests === true };
      },
      buildCommand(options) {
        return `${options.runner} --console=plain --no-daemon${options.offline ? " --offline" : ""} clean ${options.runTests ? "build" : (options.compileTests ? "assemble testClasses" : "assemble")}`;
      },
      buildCleanCommand(options) { return `${options.runner} --console=plain --no-daemon clean`; }
    },
    gradleDiagnostics: {
      parseDiagnostics(_output, options) {
        parsedGradleContexts.push(options);
        return (overrides.gradleDiagnostics || []).map((diagnostic) => Object.assign({}, diagnostic));
      }
    },
    getGradleLauncherSettings(installationId) {
      gradleLauncherInstallationIds.push(installationId || null);
      return {};
    },
    rebuildDialog: {
      async openDialog(model) {
        rebuildDialogOpenCount += 1;
        return overrides.openDialog ? overrides.openDialog(model) : { compileTests: true, runTests: false };
      }
    },
    cleanDialog: {
      async openDialog() { return overrides.cleanSelection || null; }
    },
    projectCommands: {
      registerProvider(_id, value) { provider = value; },
      updateAvailability() {}
    },
    terminal: {
      async runCommand(command, options) {
        commands.push({ command, options });
        if (overrides.commandError) throw overrides.commandError;
        return overrides.commandResult || { exitCode: 0, output: "", session: { consoleOutput: "build output" } };
      }
    },
    rebuildOutput: { async begin() {}, async clearForClean() { clearedOutput += 1; }, getTerminalOptions() { return {}; }, async save(_projectPath, output) { savedRebuildOutputs.push(output); }, async show() {} },
    javadocSettings: {
      async load() { return {}; },
      async save(_projectPath, settings) { return settings; }
    },
    javadocSourceSelection: {
      resolveFromEntries(entries) { return { sourceRoots: entries }; },
      isJavaFile(value) { return /\.java$/i.test(value || ""); }
    },
    javadocWizard: {
      async openDialog() { return overrides.javadocWizardResult || null; }
    },
    javadocCommand: {
      buildMavenCommand(options) { return `${options.runner} ${options.goal}`; },
      async createSourceArgumentFile() { return { tempPath: "C:/Temp/javadoc", argumentFiles: ["@javadoc-sources.txt"] }; },
      buildJavacCommand() { return "javadoc @javadoc-sources.txt"; }
    },
    javadocRunner: {
      async run(request) {
        javadocRuns.push(request);
        if (overrides.javadocError) throw overrides.javadocError;
        return overrides.javadocResult ?? true;
      }
    },
    problemsPanel: {
      show() { problemsPanelShows += 1; },
      async setPersistentDiagnostics(items) {
        if (!items.length) clearedProblems += 1;
        else diagnostics.push(...items);
        await overrides.persistDiagnostics?.();
      },
    },
    projectRuntime: overrides.projectRuntime || {
      async requireForCommand(projectPath) {
        return {
          ok: true,
          projectPath,
          projectJdk: { path: "C:/JDK", feature: 25 },
          javaExecutable: "C:/JDK/bin/java.exe",
          javacExecutable: "C:/JDK/bin/javac.exe",
          javadocExecutable: "C:/JDK/bin/javadoc.exe"
        };
      },
      applyToCommand(command) { return command; }
    },
    getWorkspaceRuntime() { return { ok: true, projectPath: "C:/Project" }; },
    getWorkspaceModel() {
      return overrides.workspaceModel || {
        workspaceRoot: "C:/Project",
        projectConfiguration: overrides.configuration || null,
        kind: overrides.configuration?.buildSystem || "unmanaged"
      };
    },
    isDesktopRuntime() { return true; },
    Neutralino: { filesystem: { async createDirectory() {} } },
    osName: "Windows",
    compileTargets: {
      isJavaFile(value) { return /\.java$/i.test(value || ""); },
      async resolve() { return overrides.targetFiles || []; }
    },
    buildState: {
      async snapshotSources(files) { return Object.fromEntries(files.map((file) => [file, { hash: "hash" }])); },
      async load() { return overrides.buildState || null; },
      fingerprint() { return "fingerprint"; },
      planIncremental() { return { full: true, reason: "missing-state", files: [] }; },
      async save() {},
      async invalidate() {}
    },
    classAnalysis: { async analyze(files) { return { complete: false, ownership: Object.fromEntries(files.map((file) => [file, []])), reverseDependencies: {} }; } },
    compileSaveDialog: { async choose() { return "continue"; } },
    getDirtyJavaTabs() { return []; },
    async saveCurrentJavaFile() { return true; },
    async saveAllProjectJavaFiles() { return true; },
    onGradleBuildStarted: overrides.onGradleBuildStarted,
    onGradleBuildFinished: overrides.onGradleBuildFinished,
    onSuccessfulRebuild: overrides.onSuccessfulRebuild,
  };
  const app = {
    modules: {
      statusManager: {
        setStatus(status) { statusEvents.push(["set", status.id, status.label, status.showProgress]); },
        unsetStatus(id) { statusEvents.push(["unset", id]); }
      }
    },
    registerModule() {}
  };
  context.window.registerMarkdownViewerJavaProjectProvider(app, deps);
  return { provider, commands, diagnostics, parsedJavacOutputs, parsedMavenContexts, parsedGradleContexts, gradleLauncherInstallationIds, savedConfigurations, savedRebuildOutputs, removedClassFolders, statusEvents, javadocRuns, get rebuildDialogOpenCount() { return rebuildDialogOpenCount; }, get problemsPanelShows() { return problemsPanelShows; }, get clearedProblems() { return clearedProblems; }, get clearedOutput() { return clearedOutput; } };
}

test("Java project commands do not start when the Project JDK is unresolved", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], classpathFolders: [], jarFiles: [], maven: {} },
    projectRuntime: {
      async requireForCommand() { throw new Error("Select a Project JDK in Java Build Path before running Java project commands."); },
      applyToCommand(command) { return command; }
    }
  });

  await assert.rejects(() => harness.provider.rebuildProject({ folderPath: "C:/Project" }), /Select a Project JDK/);
  assert.equal(harness.commands.length, 0);
});

test("Maven configuration routes rebuild through Maven and remembers test choices", async () => {
  const harness = loadProvider({
    mavenProject: { hasPom: true, pomLabel: "desktop-app/converters/java_converter/pom.xml", runner: ".\\mvnw.cmd", projectRoot: "C:/Project/desktop-app/converters/java_converter" },
    mavenDiagnostics: [{ severity: "error", message: "illegal start of type", filePath: "C:/Project/src/App.java", line: 5, column: 23, source: "maven" }],
    configuration: {
      buildSystem: "maven",
      sourceFolders: [],
      classpathFolders: [],
      jarFiles: [],
      maven: { compileTests: true, runTests: false }
    }
  });
  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, ".\\mvnw.cmd clean package -DskipTests");
  assert.equal(harness.commands[0].options.cwd, "C:/Project/desktop-app/converters/java_converter");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.savedConfigurations[0].maven)), { compileTests: true, runTests: false });
  assert.equal(harness.diagnostics[0].filePath, "C:/Project/src/App.java");
  assert.equal(harness.diagnostics[0].line, 5);
  assert.equal(harness.diagnostics.length, 1);
  assert.deepEqual(harness.statusEvents, [
    ["set", "project-build-1", "Building project...", true],
    ["unset", "project-build-1"]
  ]);
});

test("Maven RAT bypass applies to one rebuild without being persisted", async () => {
  const harness = loadProvider({
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: "mvn", projectRoot: "C:/Project" },
    configuration: {
      buildSystem: "maven",
      sourceFolders: [],
      classpathFolders: [],
      jarFiles: [],
      maven: { compileTests: true, runTests: false }
    },
    openDialog() { return { compileTests: true, runTests: false, skipRat: true }; }
  });
  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, "mvn clean package -DskipTests -Drat.skip=true");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.savedConfigurations[0].maven)), { compileTests: true, runTests: false });
});

test("Maven rebuild executes resolved Build Option arguments and remembers the last selection", async () => {
  const harness = loadProvider({
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: "mvn", projectRoot: "C:/Project" },
    configuration: {
      buildSystem: "maven",
      sourceFolders: [],
      classpathFolders: [],
      jarFiles: [],
      maven: { compileTests: true, runTests: false }
    },
    openDialog() {
      return {
        compileTests: false,
        runTests: false,
        persistedMaven: { compileTests: false, runTests: false },
        optionArguments: ["-Dmaven.test.skip=true", "-Drat.skip=true"]
      };
    }
  });
  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, "mvn clean package -Dmaven.test.skip=true -Drat.skip=true");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.savedConfigurations[0].maven)), {
    compileTests: false,
    runTests: false,
    lastBuildOptionArguments: ["-Dmaven.test.skip=true", "-Drat.skip=true"]
  });
});

test("Maven Rebuild Project reuses the last Build Project options without opening the dialog", async () => {
  const harness = loadProvider({
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: "mvn", projectRoot: "C:/Project" },
    configuration: {
      buildSystem: "maven",
      sourceFolders: [],
      classpathFolders: [],
      jarFiles: [],
      maven: {
        compileTests: false,
        runTests: false,
        lastBuildOptionArguments: ["-Dmaven.test.skip=true", "-Pdev"]
      }
    }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }, { useLastOptions: true }), true);
  assert.equal(harness.rebuildDialogOpenCount, 0);
  assert.equal(harness.commands[0].command, "mvn clean package -Dmaven.test.skip=true -Pdev");
  assert.equal(harness.savedConfigurations.length, 0);
});


test("Maven rebuild accepts one-invocation Build Options defaults from deep links", async () => {
  let dialogModel;
  const harness = loadProvider({
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: "mvn", projectRoot: "C:/Project" },
    configuration: {
      buildSystem: "maven",
      sourceFolders: [],
      classpathFolders: [],
      jarFiles: [],
      maven: { compileTests: true, runTests: false }
    },
    openDialog(model) {
      dialogModel = model;
      return null;
    }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }, {
    mavenBuildOptions: {
      invocationValues: { "plugin.apache-rat.skip": true },
      requestedPluginSkips: ["apache-rat"]
    }
  }), false);
  assert.equal(dialogModel.mavenBuildOptions.invocationValues["plugin.apache-rat.skip"], true);
  assert.deepEqual(dialogModel.mavenBuildOptions.requestedPluginSkips, ["apache-rat"]);
  assert.equal(harness.commands.length, 0);
  assert.deepEqual(harness.statusEvents, []);
});

test("successful Maven rebuild reports completion after build status cleanup", async () => {
  const callbackEvents = [];
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], classpathFolders: [], jarFiles: [], maven: {} },
    onSuccessfulRebuild(result) { callbackEvents.push({ result, statusEvents: harness.statusEvents.slice() }); }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(callbackEvents)), [{
    result: { projectPath: "C:/Project", buildSystem: "maven", succeeded: true },
    statusEvents: [["set", "project-build-1", "Building project...", true], ["unset", "project-build-1"]]
  }]);
});

test("failed and javac rebuilds do not request an automatic analysis retry", async () => {
  const callbacks = [];
  const failedMaven = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], classpathFolders: [], jarFiles: [], maven: {} },
    commandResult: { exitCode: 1, output: "failed" },
    onSuccessfulRebuild(result) { callbacks.push(result); }
  });
  const javac = loadProvider({
    configuration: { buildSystem: "javac", sourceFolders: ["src"], classpathFolders: [], jarFiles: [], maven: {} },
    openDialog(model) {
      return { sourceRoots: model.sourceEntries, classpathEntries: [], outputMode: "classes", outputPath: "C:/Project/classes", exportSources: false };
    },
    onSuccessfulRebuild(result) { callbacks.push(result); }
  });

  assert.equal(await failedMaven.provider.rebuildProject({ folderPath: "C:/Project" }), false);
  assert.equal(await javac.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(callbacks)), [{ projectPath: "C:/Project", buildSystem: "javac", succeeded: true }]);
});

test("warning-only rebuild reveals Problems before diagnostic persistence completes", async () => {
  let finishPersistence;
  const persistence = new Promise((resolve) => { finishPersistence = resolve; });
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], classpathFolders: [], jarFiles: [], maven: {} },
    mavenDiagnostics: [{ severity: "warning", message: "Deprecated API", source: "maven" }],
    persistDiagnostics() { return persistence; }
  });

  const rebuild = harness.provider.rebuildProject({ folderPath: "C:/Project" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.problemsPanelShows, 1);
  finishPersistence();
  assert.equal(await rebuild, true);
});
test("missing Maven POM is shown to the dialog and never falls back to javac", async () => {
  let dialogModel;
  const harness = loadProvider({
    configuration: { buildSystem: "maven", maven: { compileTests: true, runTests: false } },
    mavenProject: { hasPom: false, pomLabel: "pom.xml", runner: "mvn" },
    openDialog(model) { dialogModel = model; return null; }
  });
  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), false);
  assert.equal(dialogModel.mavenProject.hasPom, false);
  assert.equal(harness.commands.length, 0);
});

test("Gradle configuration routes rebuild through project tasks and persists test choices", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "gradle", sourceFolders: [], gradle: { installationId: "gradle-8.10", compileTests: true, runTests: false } },
    gradleProject: {
      hasGradleProject: true,
      descriptorLabel: "settings.gradle.kts",
      runner: ".\\gradlew.bat",
      runnerError: "",
      projectRoot: "C:/Project",
      launcherSettings: { offline: false, userHome: "" }
    },
    openDialog() { return { compileTests: true, runTests: false }; },
    gradleDiagnostics: [{ severity: "warning", message: "Deprecated API", source: "gradle" }]
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, ".\\gradlew.bat --console=plain --no-daemon clean assemble testClasses");
  assert.equal(harness.commands[0].options.cwd, "C:/Project");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.savedConfigurations[0].gradle)), { installationId: "gradle-8.10", compileTests: true, runTests: false });
  assert.deepEqual(harness.gradleLauncherInstallationIds, [{ installationId: "gradle-8.10", compileTests: true, runTests: false }]);
  assert.equal(harness.diagnostics[0].source, "gradle");
});

test("rebuild can defer automatic code analyzer hooks to its caller", async () => {
  const callbackEvents = [];
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], classpathFolders: [], jarFiles: [], maven: {} },
    onSuccessfulRebuild(result) { callbackEvents.push(result); }
  });

  assert.equal(await harness.provider.rebuildProject(
    { folderPath: "C:/Project" },
    { useLastOptions: true, runAnalyzers: false }
  ), true);
  assert.deepEqual(callbackEvents, []);

  const gradleLifecycleEvents = [];
  const gradleHarness = loadProvider({
    configuration: { buildSystem: "gradle", sourceFolders: [], gradle: { installationId: "gradle-8.10" } },
    onGradleBuildStarted() { gradleLifecycleEvents.push("started"); },
    onGradleBuildFinished() { gradleLifecycleEvents.push("finished"); },
    onSuccessfulRebuild() { gradleLifecycleEvents.push("successful"); }
  });
  assert.equal(await gradleHarness.provider.rebuildProject(
    { folderPath: "C:/Project" },
    { useLastOptions: true, runAnalyzers: false }
  ), true);
  assert.deepEqual(gradleLifecycleEvents, []);
});

test("Gradle Rebuild Project reuses saved test choices without opening the dialog", async () => {
  const harness = loadProvider({
    configuration: {
      buildSystem: "gradle",
      sourceFolders: [],
      gradle: { installationId: "gradle-8.10", compileTests: false, runTests: false }
    }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }, { useLastOptions: true }), true);
  assert.equal(harness.rebuildDialogOpenCount, 0);
  assert.equal(harness.commands[0].command, ".\\gradlew.bat --console=plain --no-daemon clean assemble");
  assert.equal(harness.savedConfigurations.length, 0);
});

test("successful Gradle rebuild clears build diagnostics and reports its Java analysis lifecycle", async () => {
  const lifecycleEvents = [];
  const lifecycle = { analysisWasInProgress: true, phase: "initializing" };
  const harness = loadProvider({
    configuration: { buildSystem: "gradle", sourceFolders: [], gradle: { installationId: "gradle-8.10" } },
    onGradleBuildStarted(result) {
      lifecycleEvents.push(["started", result]);
      return lifecycle;
    },
    onGradleBuildFinished(result) {
      lifecycleEvents.push(["finished", result]);
    }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.diagnostics.length, 0);
  assert.equal(harness.clearedProblems, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(lifecycleEvents)), [
    ["started", { projectPath: "C:/Project", buildSystem: "gradle" }],
    ["finished", {
      projectPath: "C:/Project",
      buildSystem: "gradle",
      succeeded: true,
      cancelled: false,
      lifecycle
    }]
  ]);
});

test("cancelled Gradle rebuild preserves existing Problems diagnostics", async () => {
  const lifecycleEvents = [];
  const harness = loadProvider({
    configuration: { buildSystem: "gradle", sourceFolders: [], gradle: { installationId: "gradle-8.10" } },
    commandResult: { exitCode: 130, output: "partial", session: { consoleOutput: "partial" } },
    onGradleBuildFinished(result) { lifecycleEvents.push(result); }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), false);
  assert.equal(harness.savedRebuildOutputs[0], "partial");
  assert.equal(harness.diagnostics.length, 0);
  assert.equal(lifecycleEvents[0].succeeded, false);
  assert.equal(lifecycleEvents[0].cancelled, true);
});

test("explicit javac configuration retains the native compiler route", async () => {
  const harness = loadProvider({
    configuration: {
      buildSystem: "javac",
      sourceFolders: ["src"],
      classpathFolders: [],
      jarFiles: [],
      maven: { compileTests: true, runTests: false }
    },
    openDialog(model) {
      return {
        sourceRoots: model.sourceEntries,
        classpathEntries: [],
        outputMode: "classes",
        outputPath: "C:/Project/classes",
        exportSources: false
      };
    }
  });
  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, "javac @sources.txt");
  assert.deepEqual(harness.statusEvents, [
    ["set", "project-build-1", "Building project...", true],
    ["unset", "project-build-1"]
  ]);
});

test("javac Rebuild Project reuses the saved profile without opening the dialog", async () => {
  const harness = loadProvider({
    configuration: {
      buildSystem: "javac",
      sourceFolders: ["src"],
      classpathFolders: [],
      jarFiles: [],
      javacProfile: {
        sourceFolders: ["C:/Project/src"],
        classpathEntries: [],
        outputMode: "classes",
        outputPath: "C:/Project/classes",
        exportSources: false
      }
    }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }, { useLastOptions: true }), true);
  assert.equal(harness.rebuildDialogOpenCount, 0);
  assert.equal(harness.commands[0].command, "javac @sources.txt");
  assert.equal(harness.savedConfigurations.length, 0);
});

test("standard javac rebuild parses captured console warnings and focuses Problems", async () => {
  const capturedOutput = "C:/Project/src/Main.java:12: warning: Deprecated API\n";
  const harness = loadProvider({
    configuration: {
      buildSystem: "javac",
      sourceFolders: ["src"],
      classpathFolders: [],
      jarFiles: []
    },
    commandResult: { exitCode: 0, output: "", session: { consoleOutput: capturedOutput } },
    javacDiagnostics: [{ severity: "warning", message: "Deprecated API", filePath: "C:/Project/src/Main.java", line: 12, column: 1, source: "javac" }],
    openDialog(model) {
      return {
        sourceRoots: model.sourceEntries,
        classpathEntries: [],
        outputMode: "classes",
        outputPath: "C:/Project/classes",
        exportSources: false
      };
    }
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.parsedJavacOutputs[0], capturedOutput);
  assert.equal(harness.savedRebuildOutputs[0], capturedOutput);
  assert.equal(harness.diagnostics[0].message, "Deprecated API");
  assert.equal(harness.problemsPanelShows, 1);
});

test("project rebuild releases its status when command execution fails", async () => {
  const harness = loadProvider({
    configuration: {
      buildSystem: "maven",
      sourceFolders: [],
      classpathFolders: [],
      jarFiles: [],
      maven: { compileTests: true, runTests: false }
    },
    commandError: new Error("build failed")
  });

  assert.equal(await harness.provider.rebuildProject({ folderPath: "C:/Project" }), false);
  assert.deepEqual(harness.statusEvents, [
    ["set", "project-build-1", "Building project...", true],
    ["unset", "project-build-1"]
  ]);
});

test("Maven Javadoc generation displays and releases its progress status", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], maven: {} },
    mavenProject: { hasPom: true, runner: "mvn", projectRoot: "C:/Project" },
    javadocWizardResult: { scope: "project", sourceRoots: [], settings: {} }
  });

  assert.equal(await harness.provider.generateDocumentation({ folderPath: "C:/Project" }), true);
  assert.equal(harness.javadocRuns[0].command, "mvn javadoc:aggregate");
  assert.deepEqual(harness.statusEvents, [
    ["set", "javadoc-generation-1", "Generating Javadocs...", true],
    ["unset", "javadoc-generation-1"]
  ]);
});

test("javac Javadoc generation displays and releases its progress status", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "javac", sourceFolders: ["src"], maven: {} },
    javadocWizardResult: {
      scope: "project",
      sourceRoots: [{ path: "C:/Project/src", exists: true }],
      settings: {}
    }
  });

  assert.equal(await harness.provider.generateDocumentation({ folderPath: "C:/Project" }), true);
  assert.equal(harness.javadocRuns[0].command, "javadoc @javadoc-sources.txt");
  assert.deepEqual(harness.statusEvents, [
    ["set", "javadoc-generation-1", "Generating Javadocs...", true],
    ["unset", "javadoc-generation-1"]
  ]);
});

test("Javadoc generation releases its status when the runner fails", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], maven: {} },
    mavenProject: { hasPom: true, runner: "mvn", projectRoot: "C:/Project" },
    javadocWizardResult: { scope: "project", sourceRoots: [], settings: {} },
    javadocError: new Error("Javadoc failed")
  });

  await assert.rejects(
    () => harness.provider.generateDocumentation({ folderPath: "C:/Project" }),
    /Javadoc failed/
  );
  assert.deepEqual(harness.statusEvents, [
    ["set", "javadoc-generation-1", "Generating Javadocs...", true],
    ["unset", "javadoc-generation-1"]
  ]);
});

test("cancelled Javadoc generation does not display a status", async () => {
  const harness = loadProvider({ configuration: { buildSystem: "javac", sourceFolders: ["src"], maven: {} } });

  assert.equal(await harness.provider.generateDocumentation({ folderPath: "C:/Project" }), false);
  assert.deepEqual(harness.statusEvents, []);
});


test("standard Java clean removes selected and classes output then clears persisted panels", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "javac", sourceFolders: ["src", "test"], maven: {} },
    cleanSelection: { mode: "javac", sourceFolders: ["C:/Project/src"], modules: [], buildAfterClean: false }
  });
  assert.equal(await harness.provider.cleanProject({ folderPath: "C:/Project" }), true);
  assert.deepEqual(harness.removedClassFolders, ["C:/Project/src", "C:/Project/classes"]);
  assert.equal(harness.clearedProblems, 1);
  assert.equal(harness.clearedOutput, 1);
  assert.deepEqual(harness.statusEvents, [
    ["set", "java-clean-1", "Cleaning Java project...", true],
    ["unset", "java-clean-1"]
  ]);
});

test("Maven clean uses the detected root and clean-only command", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], maven: {} },
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: ".\\mvnw.cmd", projectRoot: "C:/Project/module" },
    cleanSelection: { mode: "maven", sourceFolders: [], modules: [{ id: ".", path: "C:/Project/module" }], buildAfterClean: false }
  });
  assert.equal(await harness.provider.cleanProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, ".\\mvnw.cmd clean");
  assert.equal(harness.commands[0].options.cwd, "C:/Project/module");
  assert.equal(harness.clearedProblems, 1);
  assert.equal(harness.clearedOutput, 1);
  assert.deepEqual(harness.statusEvents, [
    ["set", "java-clean-1", "Cleaning Java project...", true],
    ["unset", "java-clean-1"]
  ]);
});

test("Gradle clean uses the project runner and clears persisted build state", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "gradle", sourceFolders: [], gradle: { installationId: "gradle-8.10" } },
    cleanSelection: { mode: "gradle", sourceFolders: [], modules: [], buildAfterClean: false }
  });

  assert.equal(await harness.provider.cleanProject({ folderPath: "C:/Project" }), true);
  assert.equal(harness.commands[0].command, ".\\gradlew.bat --console=plain --no-daemon clean");
  assert.equal(harness.commands[0].options.title, "Gradle Clean");
  assert.deepEqual(harness.gradleLauncherInstallationIds, [{ installationId: "gradle-8.10" }]);
  assert.equal(harness.clearedProblems, 1);
  assert.equal(harness.clearedOutput, 1);
});

test("Gradle disables targeted compilation and documentation capabilities", async () => {
  const configuration = { buildSystem: "gradle", sourceFolders: [], gradle: {} };
  const harness = loadProvider({ configuration });
  const fileContext = { folderPath: "C:/Project", filePath: "C:/Project/src/Main.java", targetPath: "C:/Project/src/Main.java", targetKind: "file" };
  const folderContext = { folderPath: "C:/Project", targetPath: "C:/Project/src", targetKind: "directory" };

  assert.equal(harness.provider.canCompileFile(fileContext), false);
  assert.equal(harness.provider.canCompileTarget(folderContext), false);
  assert.equal(harness.provider.canGenerateDocumentation(fileContext), false);
  assert.equal(await harness.provider.compileFile(fileContext), false);
  assert.equal(harness.commands.length, 0);
});


test("Maven clean failure parses captured output into Problems", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "maven", sourceFolders: [], maven: {} },
    mavenProject: { hasPom: true, pomLabel: "pom.xml", runner: ".\\mvnw.cmd", projectRoot: "C:/Project" },
    cleanSelection: { mode: "maven", sourceFolders: [], modules: [{ id: ".", path: "C:/Project" }], buildAfterClean: false },
    commandResult: { exitCode: 1, output: "[ERROR] Failed to execute goal on project flink-python: Could not resolve dependencies", session: { consoleOutput: "[ERROR] Failed to execute goal on project flink-python: Could not resolve dependencies" } },
    mavenDiagnostics: [{ severity: "error", message: "Failed to execute goal on project flink-python: Could not resolve dependencies", filePath: "", line: 1, column: 1, source: "maven" }]
  });
  assert.equal(await harness.provider.cleanProject({ folderPath: "C:/Project" }), false);
  assert.equal(harness.commands[0].command, ".\\mvnw.cmd clean");
  assert.equal(harness.parsedMavenContexts[0].projectPath, "C:/Project");
  assert.equal(harness.diagnostics[0].message, "Failed to execute goal on project flink-python: Could not resolve dependencies");
  assert.match(harness.diagnostics[1].message, /Maven clean failed with exit code 1/);
  assert.equal(harness.clearedProblems, 0);
  assert.equal(harness.clearedOutput, 0);
  assert.deepEqual(harness.statusEvents, [
    ["set", "java-clean-1", "Cleaning Java project...", true],
    ["unset", "java-clean-1"]
  ]);
});
test("cancelled clean leaves artifacts and panels unchanged", async () => {
  const harness = loadProvider({
    configuration: { buildSystem: "javac", sourceFolders: ["src"], maven: {} }
  });
  assert.equal(await harness.provider.cleanProject({ folderPath: "C:/Project" }), false);
  assert.deepEqual(harness.removedClassFolders, []);
  assert.equal(harness.clearedProblems, 0);
  assert.equal(harness.clearedOutput, 0);
  assert.deepEqual(harness.statusEvents, []);
});


test("Maven clean detects a nested project from configured source folders", async () => {
  let detectedSourceFolders;
  const harness = loadProvider({
    configuration: {
      buildSystem: "maven",
      sourceFolders: ["desktop-app/converters/java_converter/src"],
      maven: {}
    },
    detectProject(_projectPath, _osName, sourceFolders) {
      detectedSourceFolders = sourceFolders;
      return {
        hasPom: true,
        pomLabel: "desktop-app/converters/java_converter/pom.xml",
        runner: "mvn",
        projectRoot: "C:/Project/desktop-app/converters/java_converter"
      };
    },
    cleanSelection: { mode: "maven", sourceFolders: [], modules: [{ id: ".", path: "C:/Project/desktop-app/converters/java_converter" }], buildAfterClean: false }
  });

  assert.equal(await harness.provider.cleanProject({ folderPath: "C:/Project" }), true);
  assert.deepEqual(detectedSourceFolders, ["desktop-app/converters/java_converter/src"]);
  assert.equal(harness.commands[0].options.cwd, "C:/Project/desktop-app/converters/java_converter");
});

test("Maven Spotless apply uses the nearest module POM and terminal", async () => {
  const filePath = "C:/Project/module/src/main/java/App.java";
  const harness = loadProvider({
    configuration: {
      buildSystem: "maven",
      sourceFolders: ["module/src/main/java"],
      classpathFolders: [],
      jarFiles: [],
      maven: {}
    },
    targetMavenProject: {
      hasPom: true,
      pomLabel: "module/pom.xml",
      runner: ".\\mvnw.cmd",
      projectRoot: "C:/Project/module"
    }
  });

  assert.equal(await harness.provider.runMavenSpotlessApply({ folderPath: "C:/Project" }, { diagnostic: { filePath } }), true);
  assert.equal(harness.commands[0].command, ".\\mvnw.cmd -f module/pom.xml spotless:apply");
  assert.equal(harness.commands[0].options.cwd, "C:/Project");
  assert.equal(harness.commands[0].options.title, "Maven Spotless Apply");
});

test("Maven current-file compile is disabled while folder compile keeps the nearest module lifecycle", async () => {
  const filePath = "C:/Project/module/src/main/java/App.java";
  const harness = loadProvider({
    configuration: {
      buildSystem: "maven",
      sourceFolders: ["module/src/main/java"],
      classpathFolders: [],
      jarFiles: [],
      maven: {}
    },
    targetFiles: [filePath],
    targetMavenProject: {
      hasPom: true,
      pomLabel: "pom.xml",
      runner: "mvn",
      projectRoot: "C:/Project/module"
    }
  });

  assert.equal(harness.provider.canCompileFile({ folderPath: "C:/Project", filePath, targetPath: filePath, targetKind: "file" }), false);
  assert.equal(await harness.provider.compileFile({ folderPath: "C:/Project", filePath, targetPath: filePath, targetKind: "file" }), false);
  assert.equal(await harness.provider.compileTarget({ folderPath: "C:/Project", targetPath: "C:/Project/module/src/main/java", targetKind: "directory" }), true);
  assert.equal(harness.commands[0].command, "mvn compile");
  assert.equal(harness.commands[0].options.tabId, "java-maven-compile");
  assert.equal(await harness.provider.compileTarget({ folderPath: "C:/Project", targetPath: "C:/Project/module/src/main/java", targetKind: "directory" }), true);
  assert.equal(harness.commands[1].options.tabId, "java-maven-compile");
  assert.equal(harness.commands[1].options.tabId, harness.commands[0].options.tabId);
  assert.equal(harness.commands[0].options.cwd, "C:/Project/module");
  assert.equal(harness.parsedMavenContexts[0].projectPath, "C:/Project/module");
});

test("Maven folder compile reports captured process failures even when the returned exit code is zero", async () => {
  const filePath = "C:/Project/module/src/main/java/App.java";
  const failedOutput = "[ERROR] BUILD FAILURE\n[process exited with code 1]\n";
  const harness = loadProvider({
    configuration: {
      buildSystem: "maven",
      sourceFolders: ["module/src/main/java"],
      classpathFolders: [],
      jarFiles: [],
      maven: {}
    },
    targetFiles: [filePath],
    targetMavenProject: {
      hasPom: true,
      pomLabel: "pom.xml",
      runner: "mvn",
      projectRoot: "C:/Project/module"
    },
    commandResult: {
      exitCode: 0,
      output: failedOutput,
      session: { consoleOutput: failedOutput }
    }
  });

  assert.equal(await harness.provider.compileTarget({ folderPath: "C:/Project", targetPath: "C:/Project/module/src/main/java", targetKind: "directory" }), false);
  assert.equal(harness.diagnostics.some((item) => item.severity === "error" && /exit code 1/.test(item.message)), true);
  assert.equal(harness.diagnostics.some((item) => item.severity === "info" && /succeeded/.test(item.message)), false);
});

test("javac file compile uses the saved profile and safe full fallback", async () => {
  const filePath = "C:/Project/src/Main.java";
  const harness = loadProvider({
    configuration: {
      buildSystem: "javac",
      sourceFolders: ["src"],
      classpathFolders: [],
      jarFiles: [],
      javacProfile: {
        sourceFolders: ["C:/Project/src"],
        classpathEntries: [],
        outputMode: "classes",
        outputPath: "C:/Project/classes",
        exportSources: false
      },
      maven: {}
    },
    targetFiles: [filePath]
  });

  assert.equal(await harness.provider.compileFile({ folderPath: "C:/Project", filePath, targetPath: filePath, targetKind: "file" }), true);
  assert.equal(harness.commands[0].command, "javac @sources.txt");
  assert.deepEqual(harness.removedClassFolders, ["C:/Project/classes"]);
});
