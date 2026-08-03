(function(global) {
  "use strict";

  /** Own the transient Java, Maven, or Gradle rebuild selection and command preview dialog. */
  function registerMarkdownViewerJavaRebuildDialog(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const modal = document.getElementById("java-rebuild-modal");
    const title = document.getElementById("java-rebuild-title");
    const javacPanel = document.getElementById("java-rebuild-javac-panel");
    const mavenPanel = document.getElementById("java-rebuild-maven-panel");
    const mavenPom = document.getElementById("java-rebuild-maven-pom");
    const mavenRunner = document.getElementById("java-rebuild-maven-runner");
    const mavenBuildOptionsHost = document.getElementById("java-rebuild-maven-build-options");
    const gradlePanel = document.getElementById("java-rebuild-gradle-panel");
    const gradleDescriptor = document.getElementById("java-rebuild-gradle-descriptor");
    const gradleVersion = document.getElementById("java-rebuild-gradle-version");
    const gradleHome = document.getElementById("java-rebuild-gradle-home");
    const gradleRunner = document.getElementById("java-rebuild-gradle-runner");
    const gradleCompileTests = document.getElementById("java-rebuild-gradle-compile-tests");
    const gradleRunTests = document.getElementById("java-rebuild-gradle-run-tests");
    const sourceList = document.getElementById("java-rebuild-source-list");
    const classpathList = document.getElementById("java-rebuild-classpath-list");
    const outputPathInput = document.getElementById("java-rebuild-output-path");
    const exportSourcesInput = document.getElementById("java-rebuild-export-sources");
    const commandPreview = document.getElementById("java-rebuild-command-preview");
    const buildButton = document.getElementById("java-rebuild-build");
    const cancelButton = document.getElementById("java-rebuild-cancel");
    const errorElement = document.getElementById("java-rebuild-error");
    let model = null;
    let mavenBuildOptionsController = null;
    let rebuildTaskState = "idle";
    let effectivePomStatus = null;
    let effectivePomPluginSummary = null;
    let taskPill = null;


    function ensureTaskPill() {
      if (taskPill?.isConnected) return taskPill;
      taskPill = document.createElement("button");
      taskPill.type = "button";
      taskPill.className = "maven-build-options-task-pill";
      taskPill.hidden = true;
      taskPill.innerHTML = '<i class="bi bi-terminal" aria-hidden="true"></i><span>Inspecting effective Maven configuration...</span>';
      taskPill.addEventListener("click", restoreDialogFromTask);
      document.body.appendChild(taskPill);
      return taskPill;
    }

    function minimizeDialogForTask() {
      rebuildTaskState = "inspecting-effective-pom";
      modal.style.display = "none";
      const pill = ensureTaskPill();
      pill.hidden = false;
    }

    function restoreDialogFromTask() {
      if (!model) return;
      modal.style.display = "flex";
      if (taskPill) taskPill.hidden = true;
    }

    function completeDialogTask() {
      rebuildTaskState = "idle";
      restoreDialogFromTask();
      rebuildTaskState = "idle";
    }

    function getCurrentMavenSessionState() {
      const resolved = mavenBuildOptionsController?.resolve?.() || {};
      return {
        invocationValues: Object.assign({}, resolved.values || {}),
        advancedArguments: resolved.advancedArgumentsRaw || model.mavenBuildOptions?.advancedArguments || ""
      };
    }

    async function mountMavenBuildOptions(options = {}) {
      const current = options.preserveCurrent === true ? getCurrentMavenSessionState() : {};
      mavenBuildOptionsController?.destroy?.();
      const session = await deps.mavenBuildOptions.createSession({
        context: {
          projectRoot: model.mavenProject.projectRoot,
          pomPath: model.mavenProject.pomPath,
          runner: model.mavenProject.runner,
          requestedPluginSkips: model.mavenBuildOptions?.requestedPluginSkips
        },
        persistedConfiguration: model.maven,
        invocationValues: current.invocationValues || model.mavenBuildOptions?.invocationValues,
        advancedArguments: current.advancedArguments ?? model.mavenBuildOptions?.advancedArguments,
        effectivePomPluginSummary
      });
      mavenBuildOptionsController = deps.mavenBuildOptions.mount(mavenBuildOptionsHost, session, {
        onChange: updateMavenPreview,
        onInspectEffectivePom: inspectEffectivePom,
        onMinimizeTask: minimizeDialogForTask,
        inspectInProgress: rebuildTaskState === "inspecting-effective-pom",
        statusMessage: effectivePomStatus?.message || "",
        statusKind: effectivePomStatus?.kind || "info"
      });
      updateMavenPreview();
    }
    function appendChecks(host, entries, type, collection) {
      entries.forEach((entry, index) => {
        const label = document.createElement("label");
        label.className = "java-rebuild-check-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        const profilePaths = collection === "source" ? model?.profile?.sourceFolders : model?.profile?.classpathEntries;
        const selectedByProfile = !Array.isArray(profilePaths) || profilePaths.includes(entry.path);
        checkbox.checked = selectedByProfile && entry.exists && (type !== "source folders" || entry.files.length > 0);
        checkbox.disabled = !entry.exists || (type === "source folders" && entry.files.length === 0);
        checkbox.dataset.javaRebuildKind = entry.kind;
        checkbox.dataset.javaRebuildCollection = collection;
        checkbox.dataset.javaRebuildIndex = String(index);
        checkbox.addEventListener("change", updatePreview);
        const text = document.createElement("span");
        text.textContent = entry.label + (!entry.exists ? " (missing)" : (type === "source folders" && !entry.files.length ? " (no Java files)" : ""));
        text.title = entry.path;
        label.append(checkbox, text);
        host.appendChild(label);
      });
    }

    function renderChecks(host, entries, type) {
      host.textContent = "";
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "java-build-path-empty";
        empty.textContent = `No ${type} configured.`;
        host.appendChild(empty);
        return;
      }
      appendChecks(host, entries, type, "source");
    }

    function renderClasspathChecks(host, entries) {
      host.textContent = "";
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "java-build-path-empty";
        empty.textContent = "No classpath folders or JAR files configured.";
        host.appendChild(empty);
        return;
      }
      appendChecks(host, entries, "classpath entries", "library");
    }

    function getSelected(collection) {
      return Array.from(modal.querySelectorAll(`[data-java-rebuild-collection="${collection}"]:checked`))
        .map((input) => model[`${collection}Entries`][Number(input.dataset.javaRebuildIndex)]);
    }

    function getOutputMode() {
      return modal.querySelector('input[name="java-rebuild-output-mode"]:checked')?.value || "classes";
    }

    function getSelection() {
      if (model?.mode === "maven") {
        const resolved = mavenBuildOptionsController.resolve();
        return {
          compileTests: resolved.values["tests.compile"] === true,
          runTests: resolved.values["tests.run"] === true,
          skipRat: resolved.values["plugin.apache-rat.skip"] === true,
          optionArguments: resolved.arguments,
          persistedMaven: resolved.persistedConfiguration
        };
      }
      if (model?.mode === "gradle") {
        const tests = deps.gradleCommand.normalizeTestOptions({
          compileTests: gradleCompileTests.checked,
          runTests: gradleRunTests.checked
        });
        return tests;
      }
      const classpathEntries = getSelected("library");
      return {
        sourceRoots: getSelected("source"),
        classpathEntries,
        classFolders: classpathEntries.filter((entry) => entry.kind === "folder"),
        jarFiles: classpathEntries.filter((entry) => entry.kind === "jar"),
        outputMode: getOutputMode(),
        outputPath: outputPathInput.value.trim(),
        exportSources: exportSourcesInput.checked && getOutputMode() === "classes"
      };
    }

    function updateMavenPreview() {
      const resolved = mavenBuildOptionsController.resolve();
      commandPreview.value = deps.mavenCommand.buildCommand({ runner: model.mavenProject.runner, optionArguments: resolved.arguments });
      buildButton.disabled = !model.mavenProject.hasPom || !resolved.valid || rebuildTaskState === "inspecting-effective-pom";
      if (cancelButton) cancelButton.disabled = rebuildTaskState === "inspecting-effective-pom";
      errorElement.hidden = model.mavenProject.hasPom;
      errorElement.textContent = model.mavenProject.hasPom
        ? ""
        : "The configured Maven project no longer has pom.xml in the project root. Restore pom.xml or switch the Java Build Path to Standard Java (javac).";
    }

    function updateGradlePreview() {
      const selection = getSelection();
      if (selection.runTests) gradleCompileTests.checked = true;
      const project = model.gradleProject;
      commandPreview.value = project.runner ? deps.gradleCommand.buildCommand({
        runner: project.runner,
        compileTests: selection.compileTests,
        runTests: selection.runTests,
        offline: project.launcherSettings?.offline === true,
        userHome: project.launcherSettings?.userHome || ""
      }) : "";
      const error = !project.hasGradleProject
        ? "The configured Gradle project no longer has a Gradle settings or build file. Restore it or switch the Java Build Path to Standard Java (javac)."
        : project.runnerError;
      buildButton.disabled = Boolean(error);
      errorElement.hidden = !error;
      errorElement.textContent = error || "";
    }

    async function inspectEffectivePom() {
      if (!model?.mavenProject?.hasPom || !deps.terminal?.runCommand || rebuildTaskState === "inspecting-effective-pom") return;
      effectivePomStatus = { kind: "info", message: "Inspecting effective Maven configuration in the terminal..." };
      rebuildTaskState = "inspecting-effective-pom";
      await mountMavenBuildOptions({ preserveCurrent: true });
      const command = deps.mavenCommand.buildEffectivePomCommand({
        runner: model.mavenProject.runner,
        cwd: model.mavenProject.projectRoot,
        pomPath: model.mavenProject.pomPath
      });
      minimizeDialogForTask();
      try {
        const result = await deps.terminal.runCommand(command, {
          cwd: model.mavenProject.projectRoot,
          title: "Maven Effective POM",
          tabId: "maven-effective-pom",
          captureOutput: true
        });
        if (Number(result?.exitCode) !== 0) throw new Error(`Maven effective-POM inspection failed with exit code ${result?.exitCode}.`);
        if (typeof deps.effectivePomParser?.parse !== "function") throw new Error("Effective POM parsing is unavailable.");
        const output = `${result?.stdout || ""}\n${result?.stderr || ""}\n${result?.session?.consoleOutput || ""}`;
        effectivePomPluginSummary = deps.effectivePomParser.parse(output);
        effectivePomStatus = { kind: "info", message: "Effective Maven configuration inspected. Plugin certainty has been refreshed for this rebuild." };
      } catch (error) {
        effectivePomStatus = { kind: "error", message: error?.message || "Effective Maven configuration could not be inspected. Static plugin certainty is unchanged." };
      } finally {
        completeDialogTask();
        await mountMavenBuildOptions({ preserveCurrent: true });
      }
    }

    function updateJavacPreview() {
      const selection = getSelection();
      const classesMode = selection.outputMode === "classes";
      outputPathInput.disabled = !classesMode;
      document.getElementById("java-rebuild-choose-output").disabled = !classesMode;
      exportSourcesInput.disabled = !classesMode;
      if (!classesMode) exportSourcesInput.checked = false;
      const sourceCount = selection.sourceRoots.reduce((total, root) => total + root.files.length, 0);
      buildButton.disabled = sourceCount === 0 || (classesMode && !selection.outputPath);
      commandPreview.value = deps.compiler.buildJavacCommand({
        sourceRoots: selection.sourceRoots,
        classpathEntries: selection.classpathEntries.map((entry) => entry.path),
        outputMode: selection.outputMode,
        outputPath: selection.outputPath
      });
      errorElement.hidden = sourceCount > 0;
      errorElement.textContent = sourceCount > 0 ? "" : "Select at least one source folder containing Java files.";
    }

    function updatePreview() {
      if (model?.mode === "maven") updateMavenPreview();
      else if (model?.mode === "gradle") updateGradlePreview();
      else updateJavacPreview();
    }

    async function chooseOutputFolder() {
      const selected = await Neutralino.os.showFolderDialog("Select Java classes output folder", {
        defaultPath: outputPathInput.value || model.defaultOutputPath
      });
      if (selected) outputPathInput.value = deps.compiler.normalizePath(selected);
      updatePreview();
    }

    async function openDialog(nextModel) {
      if (!modal) return Promise.reject(new Error("The Java Rebuild dialog is unavailable."));
      model = nextModel;
      const isMaven = model.mode === "maven";
      const isGradle = model.mode === "gradle";
      title.textContent = isMaven ? "Rebuild Maven Project" : (isGradle ? "Rebuild Gradle Project" : "Rebuild Java Project");
      if (cancelButton) cancelButton.disabled = false;
      javacPanel.hidden = isMaven || isGradle;
      mavenPanel.hidden = !isMaven;
      if (gradlePanel) gradlePanel.hidden = !isGradle;
      if (isMaven) {
        mavenPom.value = model.mavenProject.pomLabel;
        mavenRunner.value = model.mavenProject.runner;
        effectivePomStatus = null;
        effectivePomPluginSummary = null;
        rebuildTaskState = "idle";
        await mountMavenBuildOptions();
        if (model.mavenBuildOptions?.autoInspectEffectivePom) {
          setTimeout(() => void inspectEffectivePom(), 0);
        }
      } else if (isGradle) {
        gradleDescriptor.value = model.gradleProject.descriptorLabel;
        gradleVersion.value = model.gradleProject.gradleInstallation?.version || "Unavailable";
        gradleHome.value = model.gradleProject.gradleInstallation?.path || "Unavailable";
        gradleRunner.value = model.gradleProject.runner || model.gradleProject.runnerError || "Unavailable";
        gradleRunTests.checked = model.gradle?.runTests === true;
        gradleCompileTests.checked = gradleRunTests.checked || model.gradle?.compileTests !== false;
      } else {
        outputPathInput.value = model.profile?.outputPath || model.defaultOutputPath;
        exportSourcesInput.checked = model.profile?.exportSources === true;
        modal.querySelector('input[name="java-rebuild-output-mode"][value="' + (model.profile?.outputMode === "sources" ? "sources" : "classes") + '"]').checked = true;
        renderChecks(sourceList, model.sourceEntries, "source folders");
        renderClasspathChecks(classpathList, model.libraryEntries);
      }
      modal.style.display = "flex";
      updatePreview();
      return new Promise((resolve) => {
        const finish = (value) => {
          if (rebuildTaskState === "inspecting-effective-pom") return;
          modal.style.display = "none";
          mavenBuildOptionsController?.destroy?.();
          mavenBuildOptionsController = null;
          if (taskPill) taskPill.hidden = true;
          rebuildTaskState = "idle";
          resolve(value);
        };
        buildButton.onclick = () => finish(getSelection());
        cancelButton.onclick = () => finish(null);
        modal.onclick = (event) => { if (event.target === modal) finish(null); };
      });
    }

    document.querySelectorAll('input[name="java-rebuild-output-mode"]').forEach((input) => input.addEventListener("change", updatePreview));
    outputPathInput?.addEventListener("input", updatePreview);
    document.getElementById("java-rebuild-choose-output")?.addEventListener("click", () => void chooseOutputFolder());
    gradleCompileTests?.addEventListener("change", () => {
      if (!gradleCompileTests.checked) gradleRunTests.checked = false;
      updatePreview();
    });
    gradleRunTests?.addEventListener("change", () => {
      if (gradleRunTests.checked) gradleCompileTests.checked = true;
      updatePreview();
    });

    const api = { openDialog };
    app.registerModule?.("javaRebuildDialog", api);
    return api;
  }

  global.registerMarkdownViewerJavaRebuildDialog = registerMarkdownViewerJavaRebuildDialog;
})(typeof window !== "undefined" ? window : globalThis);
