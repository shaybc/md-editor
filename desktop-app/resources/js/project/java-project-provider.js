(function(global) {
  "use strict";

  /** Register the Java implementation behind Project menu commands. */
  function registerMarkdownViewerJavaProjectProvider(app, deps = {}) {
    const compiler = deps.compiler;
    const buildPath = deps.buildPath;
    const MAVEN_COMPILE_TAB_ID = "java-maven-compile";
    const configuredBuildSystems = new Map();
    let projectBuildStatusGeneration = 0;
    let javadocStatusGeneration = 0;
    let javaCleanStatusGeneration = 0;

    function cancelOwnedCommand(titles) {
      return deps.terminal?.stopCommandSession?.(titles);
    }

    function beginProjectBuildStatus() {
      const statusId = `project-build-${++projectBuildStatusGeneration}`;
      app.modules?.statusManager?.setStatus?.({
        id: statusId,
        label: "Building project...",
        showProgress: true,
        onCancel: () => cancelOwnedCommand(["Java Build", "Maven Build", "Gradle Build", "Java Compile", "Java Compile (Full Fallback)"]),
        backgroundProcess: { category: "build", icon: "bi-hammer" }
      });
      return statusId;
    }

    function endProjectBuildStatus(statusId) {
      if (statusId) app.modules?.statusManager?.unsetStatus?.(statusId);
    }

    async function runJavadocWithStatus(request) {
      const statusId = `javadoc-generation-${++javadocStatusGeneration}`;
      app.modules?.statusManager?.setStatus?.({
        id: statusId,
        label: "Generating Javadocs...",
        showProgress: true,
        onCancel: () => cancelOwnedCommand(["Generate Javadoc"]),
        backgroundProcess: { category: "javadoc", icon: "bi-file-earmark-code" }
      });
      let outcome = "finished";
      try {
        return await deps.javadocRunner.run(request);
      } catch (error) {
        outcome = /130|cancel/i.test(String(error?.message || error)) ? "cancelled" : "failed";
        throw error;
      } finally {
        app.modules?.statusManager?.unsetStatus?.(statusId, { outcome });
      }
    }

    function beginJavaCleanStatus() {
      const statusId = `java-clean-${++javaCleanStatusGeneration}`;
      app.modules?.statusManager?.setStatus?.({
        id: statusId,
        label: "Cleaning Java project...",
        showProgress: true,
        onCancel: () => cancelOwnedCommand(["Maven Clean", "Gradle Clean"]),
        backgroundProcess: { category: "build", icon: "bi-eraser" }
      });
      return statusId;
    }

    function endJavaCleanStatus(statusId) {
      app.modules?.statusManager?.unsetStatus?.(statusId);
    }

    function supports(context) {
      return Boolean(context?.folderPath && deps.isDesktopRuntime?.());
    }

    function hasResolvedProjectJdk(context) {
      if (!supports(context)) return false;
      const runtime = deps.getWorkspaceRuntime?.();
      if (!runtime?.ok) return false;
      return compiler.normalizePath(runtime.projectPath).toLowerCase() === compiler.normalizePath(context.folderPath).toLowerCase();
    }

    function getConfiguredBuildSystem(context) {
      const projectPath = compiler.normalizePath(context?.folderPath || "");
      const key = projectPath.toLowerCase();
      if (configuredBuildSystems.has(key)) return configuredBuildSystems.get(key);
      const model = deps.getWorkspaceModel?.();
      if (model && compiler.normalizePath(model.workspaceRoot).toLowerCase() === key) {
        const configured = String(model.projectConfiguration?.buildSystem || "");
        if (["javac", "maven", "gradle"].includes(configured)) return configured;
        if (model.kind === "maven" || model.kind === "gradle") return model.kind;
        if (model.kind === "mixed") return "";
      }
      return "javac";
    }

    async function requireProjectRuntime(projectPath, configuration) {
      return deps.projectRuntime.requireForCommand(projectPath, configuration);
    }

    function applyJavaEnvironment(command, runtime) {
      return deps.projectRuntime.applyToCommand(command, runtime, deps.osName);
    }

    async function configureBuildPath(context, options = {}) {
      const dialogOptions = Object.assign({}, options, { targetPath: context.targetPath || options.targetPath || "" });
      const saved = await buildPath.openDialog(context.folderPath, dialogOptions);
      if (saved?.buildSystem) {
        configuredBuildSystems.set(compiler.normalizePath(context.folderPath).toLowerCase(), saved.buildSystem);
        deps.projectCommands?.updateAvailability?.();
      }
      return saved;
    }

    async function resolveSourceEntries(projectPath, configuration, options = {}) {
      const entries = [];
      const includeFiles = options.includeFiles !== false;
      for (const storedPath of configuration.sourceFolders) {
        const path = buildPath.resolveStoredPath(projectPath, storedPath);
        const exists = await compiler.pathExists(path, "directory");
        entries.push({
          kind: "source",
          label: storedPath,
          path,
          exists,
          filesKnown: includeFiles,
          files: exists && includeFiles ? await compiler.collectJavaFiles(path) : []
        });
      }
      return entries;
    }

    async function resolveLibraryEntries(projectPath, configuredEntries) {
      const entries = [];
      for (const configuredEntry of configuredEntries) {
        const storedPath = configuredEntry.path;
        const kind = configuredEntry.kind;
        const path = buildPath.resolveStoredPath(projectPath, storedPath);
        entries.push({
          kind,
          label: storedPath,
          path,
          exists: await compiler.pathExists(path, kind === "jar" ? "file" : "directory")
        });
      }
      return entries;
    }

    function createSummary(selection, diagnostics, succeeded) {
      const sourceCount = selection.sourceRoots.reduce((total, root) => total + root.files.length, 0);
      const errors = diagnostics.filter((item) => item.severity === "error").length;
      const warnings = diagnostics.filter((item) => item.severity === "warning").length;
      return {
        severity: "info",
        message: `Java rebuild ${succeeded ? "succeeded" : "failed"}: ${selection.sourceRoots.length} source folder(s), ${sourceCount} file(s), ${errors} error(s), ${warnings} warning(s).`,
        source: "javac"
      };
    }

    async function showDiagnostics(diagnostics, projectPath) {
      if (deps.problemsPanel?.setPersistentDiagnostics) {
        const persistence = deps.problemsPanel.setPersistentDiagnostics(diagnostics, { revealErrors: true, projectPath });
        deps.problemsPanel?.show?.();
        await persistence;
      } else {
        deps.problemsPanel?.setDiagnostics?.(diagnostics, { revealErrors: true });
        deps.problemsPanel?.show?.();
      }
    }


    function createJavacProfile(selection) {
      return {
        sourceFolders: selection.sourceRoots.map((entry) => entry.path),
        classpathEntries: selection.classpathEntries.map((entry) => entry.path),
        outputMode: selection.outputMode,
        outputPath: selection.outputPath || "",
        exportSources: selection.exportSources === true
      };
    }

    function selectEntriesFromJavacProfile(entries, profilePaths) {
      const selectedPaths = new Set((profilePaths || []).map((path) => compiler.normalizePath(path).toLowerCase()));
      return entries.filter((entry) => selectedPaths.has(compiler.normalizePath(entry.path).toLowerCase()));
    }

    function getSavedJavacSelection(configuration, sourceEntries, libraryEntries) {
      const profile = configuration.javacProfile;
      if (!profile) throw new Error("Run Build Project once to select Java build options before using Rebuild Project.");
      const sourceRoots = selectEntriesFromJavacProfile(sourceEntries, profile.sourceFolders);
      if (!sourceRoots.some((entry) => entry.exists && entry.files.length)) {
        throw new Error("The source folders saved by the last Build Project dialog are no longer available.");
      }
      return {
        sourceRoots,
        classpathEntries: selectEntriesFromJavacProfile(libraryEntries, profile.classpathEntries),
        outputMode: profile.outputMode,
        outputPath: profile.outputPath,
        exportSources: profile.exportSources === true
      };
    }

    function getJavacOutputRoots(profile) {
      return profile.outputMode === "classes" ? [profile.outputPath] : profile.sourceFolders;
    }

    async function recordBuildState(projectPath, configuration, sourceFiles, profile, buildSystem, outputRoots) {
      if (!deps.buildState || !deps.classAnalysis) return null;
      const snapshots = await deps.buildState.snapshotSources(sourceFiles);
      const analysis = await deps.classAnalysis.analyze(sourceFiles, outputRoots);
      await deps.buildState.save(projectPath, {
        buildSystem,
        fingerprint: deps.buildState.fingerprint(configuration, profile, buildSystem),
        complete: analysis.complete && Object.values(snapshots).every((entry) => entry.hash),
        profile,
        sources: snapshots,
        ownership: analysis.ownership,
        reverseDependencies: analysis.reverseDependencies,
        outputRoots
      });
    }

    async function rebuildJavacProject(context, initialConfiguration, options = {}) {
      const projectPath = compiler.normalizePath(context.folderPath);
      let configuration = initialConfiguration || await buildPath.loadConfiguration(projectPath);
      let useLastOptions = options.useLastOptions === true;
      if (!configuration.sourceFolders.length) {
        if (useLastOptions && options.configureIfMissing !== true) {
          throw new Error("Run Build Project once to select Java source folders before using Rebuild Project.");
        }
        configuration = await configureBuildPath(context, { initialTab: "source" });
        if (!configuration || !configuration.sourceFolders.length) return false;
        useLastOptions = false;
      }
      const runtime = await requireProjectRuntime(projectPath, configuration);

      const sourceEntries = await resolveSourceEntries(projectPath, configuration);
      const prepared = await compiler.createSourceArgumentFiles(sourceEntries.filter((entry) => entry.exists && entry.files.length));
      const preparedByPath = new Map(prepared.sourceRoots.map((entry) => [entry.path, entry]));
      const dialogSources = sourceEntries.map((entry) => preparedByPath.get(entry.path) || entry);
      let buildStatusId = "";
      try {
        const libraryEntries = await resolveLibraryEntries(projectPath, buildPath.getOrderedLibraryEntries(configuration));
        if (useLastOptions && !configuration.javacProfile && options.configureIfMissing === true) {
          useLastOptions = false;
        }
        const selection = useLastOptions
          ? getSavedJavacSelection(configuration, dialogSources, libraryEntries)
          : await deps.rebuildDialog.openDialog({
              sourceEntries: dialogSources,
              libraryEntries,
              folderEntries: libraryEntries.filter((entry) => entry.kind === "folder"),
              jarEntries: libraryEntries.filter((entry) => entry.kind === "jar"),
              defaultOutputPath: compiler.joinPath(projectPath, "classes"),
              profile: configuration.javacProfile
            });
        if (!selection) return false;

        if (selection.exportSources) {
          const collisions = compiler.findSourceExportCollisions(selection.sourceRoots);
          if (collisions.length) throw new Error(`Source export paths collide: ${collisions.join(", ")}`);
        }
        const profile = createJavacProfile(selection);
        if (!useLastOptions) {
          configuration = await buildPath.saveConfiguration(projectPath, Object.assign({}, configuration, { javacProfile: profile }));
        }
        buildStatusId = beginProjectBuildStatus();

        if (selection.outputMode === "classes") {
          try {
            await (deps.Neutralino || global.Neutralino).filesystem.createDirectory(selection.outputPath);
          } catch (_error) {
            // javac can use an existing output folder.
          }
          await compiler.removeClassFiles(selection.outputPath);
        } else {
          for (const sourceRoot of selection.sourceRoots) await compiler.removeClassFiles(sourceRoot.path);
        }

        const classpathEntries = await compiler.prepareClasspathEntries(
          selection.classpathEntries.map((entry) => entry.path),
          prepared.tempPath
        );
        const command = compiler.buildJavacCommand({
          javacExecutable: runtime.javacExecutable,
          sourceRoots: selection.sourceRoots,
          classpathEntries,
          outputMode: selection.outputMode,
          outputPath: selection.outputPath
        });
        await deps.rebuildOutput?.begin?.(projectPath);
        const result = await deps.terminal.runCommand(command, Object.assign({
          cwd: projectPath,
          title: "Java Rebuild"
        }, deps.rebuildOutput?.getTerminalOptions?.(projectPath) || {}));
        const output = result.session?.consoleOutput || result.output;
        await deps.rebuildOutput?.save?.(projectPath, output || "");
        const diagnostics = compiler.parseJavacDiagnostics(output);
        const succeeded = Number(result.exitCode) === 0 && !diagnostics.some((item) => item.severity === "error");
        if (succeeded && selection.exportSources) await compiler.exportSources(selection.sourceRoots, selection.outputPath);
        if (succeeded) {
          const sourceFiles = selection.sourceRoots.flatMap((entry) => entry.files);
          await recordBuildState(projectPath, configuration, sourceFiles, profile, "javac", getJavacOutputRoots(profile));
        }
        if (!succeeded && !diagnostics.some((item) => item.severity === "error")) {
          diagnostics.push({ severity: "error", message: "javac exited without a parseable compiler diagnostic.", source: "javac" });
        }
        diagnostics.push(createSummary(selection, diagnostics, succeeded));
        await showDiagnostics(diagnostics, projectPath);
        return succeeded;
      } catch (error) {
        if (error?.session?.consoleOutput !== undefined) {
          await deps.rebuildOutput?.save?.(projectPath, error.session.consoleOutput);
        }
        await showDiagnostics([{
          severity: "error",
          message: error?.message || "The Java rebuild could not be completed.",
          source: "javac"
        }], projectPath);
        return false;
      } finally {
        endProjectBuildStatus(buildStatusId);
        await compiler.removeTemporaryFolder(prepared.tempPath);
      }
    }

    function getModulePomPath(module) {
      return compiler.joinPath(compiler.normalizePath(module.projectRoot), "pom.xml");
    }

    function showSpotlessApplyResult(succeeded, result, runner) {
      const message = succeeded
        ? "Spotless apply finished. Review Git diff before committing."
        : `Spotless apply failed with exit code ${result?.exitCode ?? "unknown"} using ${runner}. See Maven Spotless Apply output.`;
      const notify = app?.services?.notify;
      if (typeof notify?.show === "function") {
        return notify.show({
          title: succeeded ? "Spotless apply finished" : "Spotless apply failed",
          message,
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
      }
      return deps.alert?.(message);
    }

    async function runMavenSpotlessApply(context, options = {}) {
      const projectPath = compiler.normalizePath(context.folderPath);
      const configuration = await buildPath.loadConfiguration(projectPath);
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const targetPath = compiler.normalizePath(options.diagnostic?.filePath || options.filePath || context.filePath || context.targetPath || projectPath);
      const module = await deps.mavenDetection.detectProjectForTarget(projectPath, targetPath, deps.osName);
      if (!module.hasPom) throw new Error(`No pom.xml could be resolved for ${targetPath}.`);
      const pomPath = getModulePomPath(module);
      const command = deps.mavenCommand.buildSpotlessApplyCommand({
        runner: module.runner,
        cwd: projectPath,
        pomPath
      });
      const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), {
        cwd: projectPath,
        title: "Maven Spotless Apply",
        captureOutput: true
      });
      const succeeded = Number(result.exitCode) === 0;
      await showSpotlessApplyResult(succeeded, result, module.runner);
      return succeeded;
    }

    async function rebuildMavenProject(projectPath, configuration, options = {}) {
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const mavenProject = await deps.mavenDetection.detectProject(projectPath, deps.osName, configuration.sourceFolders);
      const selection = options.structuredSelection || (options.useLastOptions === true
        ? {
            compileTests: configuration.maven?.compileTests !== false,
            runTests: configuration.maven?.runTests === true,
            optionArguments: Array.isArray(configuration.maven?.lastBuildOptionArguments)
              ? configuration.maven.lastBuildOptionArguments.slice()
              : undefined
          }
        : await deps.rebuildDialog.openDialog({
            mode: "maven",
            mavenProject,
            maven: configuration.maven,
            mavenBuildOptions: options.mavenBuildOptions
          }));
      if (!selection) return false;

      const persistedMaven = selection.persistedMaven && typeof selection.persistedMaven === "object"
        ? selection.persistedMaven
        : {
            compileTests: selection.compileTests,
            runTests: selection.runTests
          };
      const nextMavenConfiguration = Object.assign({}, configuration.maven, persistedMaven);
      if (Array.isArray(selection.optionArguments)) {
        nextMavenConfiguration.lastBuildOptionArguments = selection.optionArguments.slice();
      }
      const savedConfiguration = options.useLastOptions === true
        ? configuration
        : await buildPath.saveConfiguration(projectPath, Object.assign({}, configuration, { maven: nextMavenConfiguration }));
      const command = Array.isArray(selection.optionArguments)
        ? deps.mavenCommand.buildCommand({ runner: mavenProject.runner, optionArguments: selection.optionArguments, offlineOverride: selection.offlineOverride })
        : deps.mavenCommand.buildCommand(Object.assign(
            { runner: mavenProject.runner },
            savedConfiguration.maven,
            options.structuredSelection || {},
            { skipRat: selection.skipRat === true }
          ));
      let buildStatusId = beginProjectBuildStatus();
      try {
        await deps.rebuildOutput?.begin?.(projectPath);
        const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), Object.assign({
          cwd: mavenProject.projectRoot || projectPath,
          title: "Maven Rebuild"
        }, deps.rebuildOutput?.getTerminalOptions?.(projectPath) || {}));
        endProjectBuildStatus(buildStatusId);
        buildStatusId = "";
        const output = result.session?.consoleOutput || result.output || "";
        await deps.rebuildOutput?.save?.(projectPath, output);
        const succeeded = Number(result.exitCode) === 0;
        const diagnostics = deps.mavenDiagnostics.parseDiagnostics(output, { projectPath: mavenProject.projectRoot || projectPath });
        if (succeeded) {
          const sourceEntries = await resolveSourceEntries(projectPath, savedConfiguration);
          const sourceFiles = sourceEntries.flatMap((entry) => entry.files);
          const outputRoots = [
            compiler.joinPath(mavenProject.projectRoot || projectPath, "target/classes"),
            compiler.joinPath(mavenProject.projectRoot || projectPath, "target/test-classes")
          ];
          await recordBuildState(projectPath, savedConfiguration, sourceFiles, { module: mavenProject.projectRoot }, "maven", outputRoots);
        }
        if (!succeeded) diagnostics.push({
          severity: "error",
          message: `Maven rebuild failed with exit code ${result.exitCode} using ${mavenProject.runner}. See Java Rebuild output for complete Maven output.`,
          source: "maven"
        });
        await showDiagnostics(diagnostics, projectPath);
        return succeeded;
      } catch (error) {
        const output = error?.session?.consoleOutput || error?.output || "";
        if (output) await deps.rebuildOutput?.save?.(projectPath, output);
        const diagnostics = deps.mavenDiagnostics.parseDiagnostics(output, { projectPath: mavenProject.projectRoot || projectPath });
        diagnostics.push({
          severity: "error",
          message: `Maven rebuild could not be completed with ${mavenProject.runner}: ${error?.message || "The Maven process could not be started."}`,
          source: "maven"
        });
        await showDiagnostics(diagnostics, projectPath);
        return false;
      } finally {
        endProjectBuildStatus(buildStatusId);
      }
    }

    /** Run a project-root Gradle rebuild and publish only build-result diagnostics. */
    async function rebuildGradleProject(projectPath, configuration, options = {}) {
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const gradleProject = await deps.gradleDetection.detectProject(
        projectPath,
        deps.osName,
        configuration.sourceFolders,
        deps.getGradleLauncherSettings?.(configuration.gradle) || {}
      );
      const selection = options.structuredSelection || (options.useLastOptions === true
        ? configuration.gradle
        : await deps.rebuildDialog.openDialog({
            mode: "gradle",
            gradleProject,
            gradle: configuration.gradle
          }));
      if (!selection) return false;
      const tests = deps.gradleCommand.normalizeTestOptions(selection);
      if (options.useLastOptions !== true) {
        await buildPath.saveConfiguration(projectPath, Object.assign({}, configuration, {
          gradle: Object.assign({}, configuration.gradle, {
            installationId: configuration.gradle?.installationId || gradleProject.gradleInstallation?.id || null
          }, tests)
        }));
      }
      configuredBuildSystems.set(projectPath.toLowerCase(), "gradle");
      const command = deps.gradleCommand.buildCommand({
        runner: gradleProject.runner,
        compileTests: tests.compileTests,
        runTests: tests.runTests,
        offline: gradleProject.launcherSettings?.offline === true,
        userHome: gradleProject.launcherSettings?.userHome || ""
      });
      let gradleBuildLifecycle = null;
      let gradleBuildSucceeded = false;
      let gradleBuildCancelled = false;
      try {
        if (options.runAnalyzers !== false) {
          gradleBuildLifecycle = await deps.onGradleBuildStarted?.({ projectPath, buildSystem: "gradle" }) || null;
        }
      } catch (error) {
        console.warn("Unable to prepare Java analysis for the Gradle build:", error);
      }
      const buildStatusId = beginProjectBuildStatus();
      try {
        await deps.rebuildOutput?.begin?.(projectPath);
        const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), Object.assign({
          cwd: gradleProject.projectRoot || projectPath,
          title: "Gradle Rebuild"
        }, deps.rebuildOutput?.getTerminalOptions?.(projectPath) || {}));
        const output = result.session?.consoleOutput || result.output || "";
        await deps.rebuildOutput?.save?.(projectPath, output);
        if (Number(result.exitCode) === 130) {
          gradleBuildCancelled = true;
          return false;
        }
        const succeeded = Number(result.exitCode) === 0 && !/\bBUILD FAILED\b/i.test(output);
        gradleBuildSucceeded = succeeded;
        const diagnostics = deps.gradleDiagnostics.parseDiagnostics(output, { projectPath: gradleProject.projectRoot || projectPath });
        if (!succeeded && !diagnostics.some((item) => item.severity === "error")) {
          diagnostics.push({
            severity: "error",
            message: `Gradle rebuild failed with exit code ${result.exitCode}. See Java Rebuild output for complete Gradle output.`,
            source: "gradle"
          });
        }
        await showDiagnostics(diagnostics, projectPath);
        if (succeeded) await deps.buildState?.invalidate?.(projectPath);
        return succeeded;
      } catch (error) {
        const output = error?.session?.consoleOutput || error?.output || "";
        if (output) await deps.rebuildOutput?.save?.(projectPath, output);
        const diagnostics = deps.gradleDiagnostics.parseDiagnostics(output, { projectPath: gradleProject.projectRoot || projectPath });
        diagnostics.push({
          severity: "error",
          message: `Gradle rebuild could not be completed with ${gradleProject.runner || "the configured runner"}: ${error?.message || "The Gradle process could not be started."}`,
          source: "gradle"
        });
        await showDiagnostics(diagnostics, projectPath);
        return false;
      } finally {
        endProjectBuildStatus(buildStatusId);
        try {
          if (options.runAnalyzers !== false) {
            await deps.onGradleBuildFinished?.({
              projectPath,
              buildSystem: "gradle",
              succeeded: gradleBuildSucceeded,
              cancelled: gradleBuildCancelled,
              lifecycle: gradleBuildLifecycle
            });
          }
        } catch (error) {
          console.warn("Unable to synchronize Java analysis after the Gradle build:", error);
        }
      }
    }


    async function handleDirtyJavaTabs(projectPath) {
      const dirtyTabs = deps.getDirtyJavaTabs?.(projectPath) || [];
      if (!dirtyTabs.length) return { proceed: true, unsavedWarning: false };
      const choice = await deps.compileSaveDialog.choose({
        message: `${dirtyTabs.length} Java file(s) in this project have unsaved changes.`
      });
      if (choice === "cancel") return { proceed: false, unsavedWarning: false };
      if (choice === "save-current") {
        if (!await deps.saveCurrentJavaFile?.()) return { proceed: false, unsavedWarning: false };
      } else if (choice === "save-all") {
        if (!await deps.saveAllProjectJavaFiles?.(projectPath)) return { proceed: false, unsavedWarning: false };
      }
      const remainingDirtyTabs = deps.getDirtyJavaTabs?.(projectPath) || [];
      return { proceed: true, unsavedWarning: choice === "continue" || remainingDirtyTabs.length > 0 };
    }

    function selectSourceEntries(sourceEntries, files) {
      return sourceEntries.map((entry) => Object.assign({}, entry, {
        files: files.filter((file) => file === entry.path || file.startsWith(entry.path + "/"))
      })).filter((entry) => entry.files.length);
    }

    async function executeJavacTarget(projectPath, configuration, sourceEntries, requestedFiles, unsavedWarning) {
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const profile = configuration.javacProfile;
      if (!profile) return rebuildProject({ folderPath: projectPath });
      const allFiles = sourceEntries.flatMap((entry) => entry.files);
      const snapshots = await deps.buildState.snapshotSources(allFiles);
      const state = await deps.buildState.load(projectPath);
      const expectedFingerprint = deps.buildState.fingerprint(configuration, profile, "javac");
      let plan = deps.buildState.planIncremental(state, snapshots, requestedFiles, expectedFingerprint);
      if (!plan.full && state) {
        for (const outputPath of Object.values(state.ownership || {}).flat()) {
          if (!await compiler.pathExists(outputPath, "file")) {
            plan = { full: true, reason: "output-missing", files: [] };
            break;
          }
        }
      }
      const compileFiles = plan.full ? allFiles : plan.files;
      const selectedEntries = selectSourceEntries(sourceEntries, compileFiles);
      const prepared = await compiler.createSourceArgumentFiles(selectedEntries);
      try {
        const configuredLibraries = await resolveLibraryEntries(projectPath, buildPath.getOrderedLibraryEntries(configuration));
        const selectedLibraries = configuredLibraries.filter((entry) => profile.classpathEntries.includes(entry.path) && entry.exists);
        const outputRoots = getJavacOutputRoots(profile);
        if (plan.full) {
          for (const outputRoot of outputRoots) await compiler.removeClassFiles(outputRoot);
        } else {
          await compiler.removeFiles(compileFiles.flatMap((file) => state.ownership?.[file] || []));
        }
        const classpathEntries = await compiler.prepareClasspathEntries(
          Array.from(new Set([...selectedLibraries.map((entry) => entry.path), ...outputRoots])),
          prepared.tempPath
        );
        const command = compiler.buildJavacCommand({
          javacExecutable: runtime.javacExecutable,
          sourceRoots: prepared.sourceRoots,
          classpathEntries,
          outputMode: profile.outputMode,
          outputPath: profile.outputPath
        });
        await deps.rebuildOutput?.begin?.(projectPath);
        const result = await deps.terminal.runCommand(command, Object.assign({
          cwd: projectPath,
          title: plan.full ? "Java Compile (Full Fallback)" : "Java Compile"
        }, deps.rebuildOutput?.getTerminalOptions?.(projectPath) || {}));
        const output = result.session?.consoleOutput || result.output || "";
        await deps.rebuildOutput?.save?.(projectPath, output);
        const diagnostics = compiler.parseJavacDiagnostics(result.output || output);
        const succeeded = Number(result.exitCode) === 0 && !diagnostics.some((item) => item.severity === "error");
        if (unsavedWarning) diagnostics.push({ severity: "warning", message: "Compilation used disk content; unsaved Java editor changes were excluded.", source: "javac" });
        diagnostics.push({
          severity: succeeded ? "info" : "error",
          message: `Java compile ${succeeded ? "succeeded" : "failed"}: ${compileFiles.length} file(s)${plan.full ? ` (full fallback: ${plan.reason})` : ""}.`,
          source: "javac"
        });
        if (succeeded) {
          if (profile.exportSources) await compiler.exportSources(selectedEntries, profile.outputPath);
          await recordBuildState(projectPath, configuration, allFiles, profile, "javac", outputRoots);
        }
        await showDiagnostics(diagnostics, projectPath);
        return succeeded;
      } catch (error) {
        if (error?.session?.consoleOutput !== undefined) await deps.rebuildOutput?.save?.(projectPath, error.session.consoleOutput);
        await showDiagnostics([{ severity: "error", message: error?.message || "The Java target compile failed.", source: "javac" }], projectPath);
        return false;
      } finally {
        await compiler.removeTemporaryFolder(prepared.tempPath);
      }
    }

    function getMavenFailureExitCode(result, output, diagnostics) {
      const resultExitCode = Number(result?.exitCode);
      if (Number.isFinite(resultExitCode) && resultExitCode !== 0) return resultExitCode;
      const capturedExitCode = Number(String(output || "").match(/\[process exited with code\s+(-?\d+)\]/i)?.[1]);
      if (Number.isFinite(capturedExitCode) && capturedExitCode !== 0) return capturedExitCode;
      if (diagnostics.some((item) => item.severity === "error") || /\bBUILD FAILURE\b/i.test(String(output || ""))) return 1;
      return 0;
    }

    async function executeMavenTargets(projectPath, configuration, targetFiles, unsavedWarning) {
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const modules = new Map();
      for (const filePath of targetFiles) {
        const module = await deps.mavenDetection.detectProjectForTarget(projectPath, filePath, deps.osName);
        if (!module.hasPom) throw new Error(`No pom.xml could be resolved for ${filePath}.`);
        const modulePath = compiler.normalizePath(module.projectRoot);
        const key = deps.osName === "Windows" ? modulePath.toLowerCase() : modulePath;
        const entry = modules.get(key) || { module, files: [], includeTests: false };
        entry.files.push(filePath);
        entry.includeTests ||= /\/src\/test\//i.test(filePath);
        modules.set(key, entry);
      }
      const state = await deps.buildState.load(projectPath);
      await deps.rebuildOutput?.begin?.(projectPath);
      const outputs = [];
      const diagnostics = [];
      try {
        for (const entry of modules.values()) {
          await compiler.removeFiles(entry.files.flatMap((file) => state?.buildSystem === "maven" ? state.ownership?.[file] || [] : []));
          const command = deps.mavenCommand.buildCompileCommand({ runner: entry.module.runner, includeTests: entry.includeTests });
          const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), {
            cwd: entry.module.projectRoot,
            tabId: MAVEN_COMPILE_TAB_ID,
            title: entry.includeTests ? "Maven Test Compile" : "Maven Compile",
            captureOutput: true
          });
          const output = result.session?.consoleOutput || result.output || "";
          outputs.push(output);
          const commandDiagnostics = deps.mavenDiagnostics.parseDiagnostics(output, { projectPath: entry.module.projectRoot });
          diagnostics.push(...commandDiagnostics);
          const failureExitCode = getMavenFailureExitCode(result, output, commandDiagnostics);
          if (failureExitCode !== 0) throw new Error(`Maven compile failed with exit code ${failureExitCode} in ${entry.module.pomLabel}.`);
        }
        if (unsavedWarning) diagnostics.push({ severity: "warning", message: "Compilation used disk content; unsaved Java editor changes were excluded.", source: "maven" });
        diagnostics.push({ severity: "info", message: `Maven compile succeeded for ${modules.size} module(s).`, source: "maven" });
        await deps.rebuildOutput?.save?.(projectPath, outputs.join("\n"));
        await deps.rebuildOutput?.show?.(projectPath);
        const sourceEntries = await resolveSourceEntries(projectPath, configuration);
        const allFiles = sourceEntries.flatMap((entry) => entry.files);
        const outputRoots = Array.from(modules.values()).flatMap((entry) => [
          compiler.joinPath(entry.module.projectRoot, "target/classes"),
          compiler.joinPath(entry.module.projectRoot, "target/test-classes")
        ]);
        await recordBuildState(projectPath, configuration, allFiles, { modules: Array.from(modules.keys()) }, "maven", outputRoots);
        await showDiagnostics(diagnostics, projectPath);
        return true;
      } catch (error) {
        await deps.rebuildOutput?.save?.(projectPath, outputs.join("\n"));
        diagnostics.push({ severity: "error", message: error?.message || "The Maven target compile failed.", source: "maven" });
        await showDiagnostics(diagnostics, projectPath);
        return false;
      }
    }

    function canCompileTarget(context) {
      if (!hasResolvedProjectJdk(context)) return false;
      const buildSystem = getConfiguredBuildSystem(context);
      if (context?.targetKind === "directory") return buildSystem === "javac" || buildSystem === "maven";
      return buildSystem === "javac" && deps.compileTargets.isJavaFile(context?.targetPath || context?.filePath);
    }
    function canCompileFile(context) {
      return hasResolvedProjectJdk(context)
        && getConfiguredBuildSystem(context) === "javac"
        && deps.compileTargets.isJavaFile(context?.targetPath || context?.filePath);
    }
    function canGenerateDocumentation(context) {
      if (!hasResolvedProjectJdk(context)) return false;
      if (getConfiguredBuildSystem(context) === "gradle") return false;
      if (context?.scope === "file" || context?.scope === "method" || context?.targetKind === "file") {
        return deps.javadocSourceSelection?.isJavaFile?.(context?.targetPath || context?.filePath) === true;
      }
      return true;
    }

    async function compileTarget(context) {
      const projectPath = compiler.normalizePath(context.folderPath);
      let configuration = await buildPath.loadConfiguration(projectPath);
      if (!configuration.buildSystem) {
        configuration = await configureBuildPath(context, { initialTab: "source" });
        if (!configuration) return false;
      }
      if (configuration.buildSystem === "gradle") return false;
      if (context?.targetKind !== "directory" && configuration.buildSystem !== "javac") return false;
      const sourceEntries = await resolveSourceEntries(projectPath, configuration);
      const sourceRoots = sourceEntries.filter((entry) => entry.exists).map((entry) => entry.path);
      const targetFiles = await deps.compileTargets.resolve(context, sourceRoots);
      if (!targetFiles.length) {
        deps.alert?.("No configured Java source files were found for this compile target.");
        return false;
      }
      const dirty = await handleDirtyJavaTabs(projectPath);
      if (!dirty.proceed) return false;
      if (configuration.buildSystem === "maven") return executeMavenTargets(projectPath, configuration, targetFiles, dirty.unsavedWarning);
      return executeJavacTarget(projectPath, configuration, sourceEntries, targetFiles, dirty.unsavedWarning);
    }

    /** Compile one Java file only when Standard Java is the selected build system. */
    async function compileFile(context) {
      const configuration = await buildPath.loadConfiguration(compiler.normalizePath(context.folderPath));
      if (configuration.buildSystem && configuration.buildSystem !== "javac") return false;
      return compileTarget(context);
    }

    async function clearCleanedProjectState(projectPath) {
      await deps.problemsPanel?.setPersistentDiagnostics?.([], { revealErrors: false, projectPath });
      await deps.rebuildOutput?.clearForClean?.(projectPath);
      await deps.buildState?.invalidate?.(projectPath);
    }

    async function cleanJavacProject(projectPath, configuration) {
      const sourceEntries = await resolveSourceEntries(projectPath, configuration);
      const selection = await deps.cleanDialog.openDialog({
        mode: "javac",
        projectPath,
        sourceEntries
      });
      if (!selection || !selection.sourceFolders.length) return false;
      const cleanStatusId = beginJavaCleanStatus();
      try {
        for (const sourceFolder of selection.sourceFolders) await compiler.removeClassFiles(sourceFolder);
        await compiler.removeClassFiles(compiler.joinPath(projectPath, "classes"));
        await clearCleanedProjectState(projectPath);
        if (selection.buildAfterClean) return rebuildProject({ folderPath: projectPath });
        return true;
      } catch (error) {
        deps.alert?.(error?.message || "The Java project could not be cleaned.");
        return false;
      } finally {
        endJavaCleanStatus(cleanStatusId);
      }
    }

    async function cleanMavenProject(projectPath, configuration) {
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const mavenProject = await deps.mavenDetection.detectProject(projectPath, deps.osName, configuration.sourceFolders);
      const selection = await deps.cleanDialog.openDialog({
        mode: "maven",
        projectPath,
        mavenProject,
        modules: [{ id: ".", path: mavenProject.projectRoot || projectPath }]
      });
      if (!selection) return false;
      const command = deps.mavenCommand.buildCleanCommand({ runner: mavenProject.runner });
      const cleanStatusId = beginJavaCleanStatus();
      try {
        const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), {
          cwd: mavenProject.projectRoot || projectPath,
          title: "Maven Clean",
          captureOutput: true
        });
        const output = result.session?.consoleOutput || result.output || "";
        if (Number(result.exitCode) !== 0) {
          const diagnostics = deps.mavenDiagnostics.parseDiagnostics(output, { projectPath: mavenProject.projectRoot || projectPath });
          diagnostics.push({
            severity: "error",
            message: `Maven clean failed with exit code ${result.exitCode} using ${mavenProject.runner}. See Maven Clean output for complete Maven output.`,
            source: "maven"
          });
          await showDiagnostics(diagnostics, projectPath);
          throw new Error(`Maven clean failed with exit code ${result.exitCode} using ${mavenProject.runner}.`);
        }
        await clearCleanedProjectState(projectPath);
        if (selection.buildAfterClean) return rebuildProject({ folderPath: projectPath });
        return true;
      } catch (error) {
        const output = error?.session?.consoleOutput || error?.output || "";
        if (output) {
          const diagnostics = deps.mavenDiagnostics.parseDiagnostics(output, { projectPath: mavenProject.projectRoot || projectPath });
          diagnostics.push({
            severity: "error",
            message: `Maven clean could not be completed with ${mavenProject.runner}: ${error?.message || "The Maven process could not be started."}`,
            source: "maven"
          });
          await showDiagnostics(diagnostics, projectPath);
        }
        deps.alert?.(error?.message || `Maven clean could not be completed with ${mavenProject.runner}.`);
        return false;
      } finally {
        endJavaCleanStatus(cleanStatusId);
      }
    }


    /** Run Gradle clean at the detected project root and clear persisted build results on success. */
    async function cleanGradleProject(projectPath, configuration) {
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const gradleProject = await deps.gradleDetection.detectProject(
        projectPath,
        deps.osName,
        configuration.sourceFolders,
        deps.getGradleLauncherSettings?.(configuration.gradle) || {}
      );
      const selection = await deps.cleanDialog.openDialog({ mode: "gradle", projectPath, gradleProject });
      if (!selection) return false;
      const command = deps.gradleCommand.buildCleanCommand({
        runner: gradleProject.runner,
        offline: gradleProject.launcherSettings?.offline === true,
        userHome: gradleProject.launcherSettings?.userHome || ""
      });
      const cleanStatusId = beginJavaCleanStatus();
      try {
        const result = await deps.terminal.runCommand(applyJavaEnvironment(command, runtime), {
          cwd: gradleProject.projectRoot || projectPath,
          title: "Gradle Clean",
          captureOutput: true
        });
        const output = result.session?.consoleOutput || result.output || "";
        if (Number(result.exitCode) === 130) return false;
        if (Number(result.exitCode) !== 0 || /\bBUILD FAILED\b/i.test(output)) {
          const diagnostics = deps.gradleDiagnostics.parseDiagnostics(output, { projectPath: gradleProject.projectRoot || projectPath });
          if (!diagnostics.some((item) => item.severity === "error")) {
            diagnostics.push({ severity: "error", message: `Gradle clean failed with exit code ${result.exitCode}.`, source: "gradle" });
          }
          await showDiagnostics(diagnostics, projectPath);
          return false;
        }
        await clearCleanedProjectState(projectPath);
        if (selection.buildAfterClean) return rebuildProject({ folderPath: projectPath });
        return true;
      } catch (error) {
        const output = error?.session?.consoleOutput || error?.output || "";
        const diagnostics = deps.gradleDiagnostics.parseDiagnostics(output, { projectPath: gradleProject.projectRoot || projectPath });
        diagnostics.push({
          severity: "error",
          message: `Gradle clean could not be completed with ${gradleProject.runner || "the configured runner"}: ${error?.message || "The Gradle process could not be started."}`,
          source: "gradle"
        });
        await showDiagnostics(diagnostics, projectPath);
        return false;
      } finally {
        endJavaCleanStatus(cleanStatusId);
      }
    }

    async function resolveJavadocMavenOptionArguments(mavenProject, mavenOptions = {}, fallbackConfiguration = {}) {
      if (Array.isArray(mavenOptions.arguments) && mavenOptions.arguments.length) return mavenOptions.arguments;
      if (!deps.mavenBuildOptions?.createSession) return [];
      const session = await deps.mavenBuildOptions.createSession({
        context: {
          projectRoot: mavenProject.projectRoot,
          pomPath: mavenProject.pomPath,
          runner: mavenProject.runner
        },
        persistedConfiguration: Object.keys(mavenOptions.persistedConfiguration || {}).length ? mavenOptions.persistedConfiguration : fallbackConfiguration,
        invocationValues: mavenOptions.invocationValues,
        advancedArguments: mavenOptions.advancedArguments
      });
      const resolved = session.resolve();
      return resolved.valid === false ? [] : resolved.arguments || [];
    }
    function getProjectRelativePath(projectPath, candidatePath) {
      const project = compiler.normalizePath(projectPath);
      const candidate = compiler.normalizePath(candidatePath);
      if (candidate.toLowerCase() === project.toLowerCase()) return ".";
      return candidate.slice(project.length).replace(/^\/+/, "") || ".";
    }
    function resolveMavenJavadocTargetPath(projectPath, context, wizardResult) {
      if (wizardResult?.scope === "project") return compiler.normalizePath(context.targetPath || context.filePath || projectPath);
      const selectedRoots = Array.isArray(wizardResult?.sourceRoots) ? wizardResult.sourceRoots : [];
      return compiler.normalizePath(selectedRoots[0]?.path || context.targetPath || context.filePath || projectPath);
    }
    async function collectJavadocSourceRoots(sourceRoots) {
      const collected = [];
      for (const root of sourceRoots || []) {
        if (!root.exists) continue;
        const selectedFiles = Array.isArray(root.selectedFiles) ? root.selectedFiles.filter(Boolean) : [];
        const files = selectedFiles.length ? selectedFiles : await compiler.collectJavaFiles(root.path);
        if (files.length) collected.push(Object.assign({}, root, { files, selectedFiles: files }));
      }
      return collected;
    }
    async function cleanProject(context) {
      const projectPath = compiler.normalizePath(context.folderPath);
      let configuration = await buildPath.loadConfiguration(projectPath);
      if (!configuration.buildSystem) {
        configuration = await configureBuildPath(context, { initialTab: "source" });
        if (!configuration) return false;
      }
      await requireProjectRuntime(projectPath, configuration);
      if (configuration.buildSystem === "maven") return cleanMavenProject(projectPath, configuration);
      if (configuration.buildSystem === "gradle") return cleanGradleProject(projectPath, configuration);
      if (configuration.buildSystem === "javac") return cleanJavacProject(projectPath, configuration);
      return false;
    }
    async function generateDocumentation(context) {
      const projectPath = compiler.normalizePath(context.folderPath);
      let configuration = await buildPath.loadConfiguration(projectPath);
      if (!configuration.buildSystem) {
        configuration = await configureBuildPath(context, { initialTab: "source" });
        if (!configuration) return false;
      }
      if (configuration.buildSystem === "gradle") return false;
      const runtime = await requireProjectRuntime(projectPath, configuration);
      const settings = await deps.javadocSettings.load(projectPath);
      const sourceEntries = await resolveSourceEntries(projectPath, configuration, { includeFiles: false });
      const selection = deps.javadocSourceSelection.resolveFromEntries(sourceEntries, context);
      const wizardResult = await deps.javadocWizard.openDialog({
        projectPath,
        settings,
        selection,
        mode: configuration.buildSystem === "maven" ? "maven" : "javac",
        mavenProject: configuration.buildSystem === "maven" ? await deps.mavenDetection.detectProject(projectPath, deps.osName, configuration.sourceFolders) : null,
        mavenConfiguration: configuration.maven
      });
      if (!wizardResult) return false;
      const savedSettings = await deps.javadocSettings.save(projectPath, wizardResult.settings);
      if (configuration.buildSystem === "maven") {
        const rootMavenProject = await deps.mavenDetection.detectProject(projectPath, deps.osName, configuration.sourceFolders);
        if (!rootMavenProject.hasPom) throw new Error(`No pom.xml could be resolved for ${projectPath}.`);
        const optionArguments = [];
        if (wizardResult.scope !== "project") {
          const moduleSelectors = new Set();
          for (const root of wizardResult.sourceRoots || []) {
            const module = await deps.mavenDetection.detectProjectForTarget(projectPath, root.path, deps.osName);
            if (!module.hasPom) continue;
            const selector = getProjectRelativePath(rootMavenProject.projectRoot || projectPath, module.projectRoot || projectPath);
            if (selector && selector !== ".") moduleSelectors.add(selector);
          }
          if (!moduleSelectors.size) {
            const mavenTargetPath = resolveMavenJavadocTargetPath(projectPath, context, wizardResult);
            const module = await deps.mavenDetection.detectProjectForTarget(projectPath, mavenTargetPath, deps.osName);
            if (module.hasPom) {
              const selector = getProjectRelativePath(rootMavenProject.projectRoot || projectPath, module.projectRoot || projectPath);
              if (selector && selector !== ".") moduleSelectors.add(selector);
            }
          }
          if (moduleSelectors.size) optionArguments.push("-pl", Array.from(moduleSelectors).join(","), "-am");
        }
        optionArguments.push(...await resolveJavadocMavenOptionArguments(rootMavenProject, wizardResult.mavenOptions, configuration.maven));
        const command = deps.javadocCommand.buildMavenCommand({
          runner: rootMavenProject.runner,
          settings: savedSettings,
          goal: wizardResult.scope === "project" ? "javadoc:aggregate" : "javadoc:javadoc",
          offlineOverride: typeof wizardResult.mavenOptions?.invocationValues?.["execution.offline"] === "boolean"
            ? wizardResult.mavenOptions.invocationValues["execution.offline"]
            : undefined,
          optionArguments
        });
        return runJavadocWithStatus({ command: applyJavaEnvironment(command, runtime), cwd: rootMavenProject.projectRoot || projectPath, settings: savedSettings });
      }
      const sourceRoots = await collectJavadocSourceRoots(wizardResult.sourceRoots);
      if (!sourceRoots.length) throw new Error("No Java source files were found for the selected Javadoc scope.");
      const prepared = await deps.javadocCommand.createSourceArgumentFile(sourceRoots);
      try {
        const libraryEntries = await resolveLibraryEntries(projectPath, buildPath.getOrderedLibraryEntries(configuration));
        const classpathEntries = await compiler.prepareClasspathEntries(
          libraryEntries.filter((entry) => entry.exists).map((entry) => entry.path),
          prepared.tempPath
        );
        const command = deps.javadocCommand.buildJavacCommand({
          settings: Object.assign({}, savedSettings, { javadocCommand: runtime.javadocExecutable }),
          argumentFiles: prepared.argumentFiles,
          classpathEntries,
          osName: deps.osName
        });
        return await runJavadocWithStatus({ command, cwd: projectPath, settings: savedSettings });
      } finally {
        await compiler.removeTemporaryFolder(prepared.tempPath);
      }
    }

    async function rebuildProject(context, options = {}) {
      const projectPath = compiler.normalizePath(context.folderPath);
      let configuration = await buildPath.loadConfiguration(projectPath);
      let rebuildOptions = options;
      if (!configuration.buildSystem) {
        if (options.useLastOptions === true && options.configureIfMissing !== true) {
          throw new Error("Configure Java Build Path and run Build Project once before using Rebuild Project.");
        }
        configuration = await configureBuildPath(context, { initialTab: "source" });
        if (!configuration) return false;
        if (options.useLastOptions === true) {
          rebuildOptions = Object.assign({}, options, { useLastOptions: false });
        }
      }
      const buildSystem = configuration.buildSystem;
      let succeeded = false;
      if (buildSystem === "maven") succeeded = await rebuildMavenProject(projectPath, configuration, rebuildOptions);
      else if (buildSystem === "gradle") succeeded = await rebuildGradleProject(projectPath, configuration, rebuildOptions);
      else if (buildSystem === "javac") succeeded = await rebuildJavacProject(context, configuration, rebuildOptions);
      else return false;
      if (succeeded && options.runAnalyzers !== false) {
        const analysis = deps.onSuccessfulRebuild?.({ projectPath, buildSystem, succeeded: true });
        if (options.waitForAnalysis === false) {
          Promise.resolve(analysis).catch((error) => {
            console.warn("Unable to refresh Java analysis after the successful rebuild:", error);
          });
        } else {
          await analysis;
        }
      }
      return succeeded;
    }

    async function compileProject(context, options = {}) {
      const startedAt = Date.now();
      const succeeded = options.buildMode === "clean"
        ? await rebuildProject(context, { useLastOptions: true, structuredSelection: { compileTests: options.includeTestSources === true, runTests: false }, runAnalyzers: true })
        : await compileTarget(Object.assign({}, context, { targetPath: options.targetPath || context.folderPath, targetKind: "directory" }));
      return { success: succeeded === true, diagnostics: [], testCases: [], summary: {}, artifacts: [], durationMs: Date.now() - startedAt };
    }

    async function runTests(context, options = {}) {
      if (!['project', 'module'].includes(options.scope || "project")) {
        throw new Error("The renderer Java provider currently accepts project and module scopes; narrower selectors run through the structured broker.");
      }
      const startedAt = Date.now();
      const succeeded = await rebuildProject(context, { useLastOptions: true, structuredSelection: { compileTests: true, runTests: true }, runAnalyzers: true });
      return { success: succeeded === true, diagnostics: [], testCases: [], summary: {}, artifacts: [], durationMs: Date.now() - startedAt, runner: "junit" };
    }

    const provider = {
      supports,
      canCompileTarget,
      compileTarget,
      canCompileFile,
      compileFile,
      canConfigureBuildPath: supports,
      canCleanProject: hasResolvedProjectJdk,
      cleanProject,
      canGenerateDocumentation,
      generateDocumentation,
      configureBuildPath,
      canRebuildProject: hasResolvedProjectJdk,
      rebuildProject,
      compileProject,
      runTests,
      runMavenSpotlessApply
    };
    deps.projectCommands.registerProvider("java", provider);
    app.registerModule?.("javaProjectProvider", provider);
    return provider;
  }

  global.registerMarkdownViewerJavaProjectProvider = registerMarkdownViewerJavaProjectProvider;
})(typeof window !== "undefined" ? window : globalThis);
