(function(global) {
  "use strict";

  /** Persist and edit the Java source and library build path. */
  function registerMarkdownViewerJavaBuildPath(app, deps = {}) {
    const Neutralino = deps.Neutralino || global.Neutralino;
    const CONFIG_FILE = "java-build-path.json";
    const GRADLE_SELECTION_WRAPPER = "wrapper";
    const GRADLE_SELECTION_BUILT_IN = "built-in";
    const GRADLE_SELECTION_INSTALLATION_PREFIX = "installation:";
    const modal = document.getElementById("java-build-path-modal");
    const sourcePanel = document.getElementById("java-build-path-source-panel");
    const libraryPanel = document.getElementById("java-build-path-library-panel");
    const sourceList = document.getElementById("java-build-path-source-list");
    const libraryList = document.getElementById("java-build-path-library-list");
    const errorElement = document.getElementById("java-build-path-error");
    const dialogActions = document.getElementById("java-build-path-actions");
    const detectionPrompt = document.getElementById("java-build-path-maven-detected");
    const detectionMessage = document.getElementById("java-build-path-detection-message");
    const useMavenButton = document.getElementById("java-build-path-use-maven");
    const useGradleButton = document.getElementById("java-build-path-use-gradle");
    const buildSystemField = document.getElementById("java-build-path-build-system-field");
    const buildSystemSelect = document.getElementById("java-build-path-build-system");
    const buildSystemDescription = document.getElementById("java-build-path-build-system-description");
    const configurationSection = document.getElementById("java-build-path-configuration");
    const standardPanel = document.getElementById("java-build-path-standard");
    const mavenPanel = document.getElementById("java-build-path-maven");
    const mavenPom = document.getElementById("java-build-path-maven-pom");
    const mavenRunner = document.getElementById("java-build-path-maven-runner");
    const mavenSourceList = document.getElementById("java-build-path-maven-source-list");
    const mavenSourceStatus = document.getElementById("java-build-path-maven-source-status");
    const scanMavenSourcesButton = document.getElementById("java-build-path-scan-maven-sources");
    const gradlePanel = document.getElementById("java-build-path-gradle");
    const gradleDescriptor = document.getElementById("java-build-path-gradle-descriptor");
    const gradleInstallationSelect = document.getElementById("java-build-path-gradle-installation");
    const gradleVersion = document.getElementById("java-build-path-gradle-version");
    const gradleHome = document.getElementById("java-build-path-gradle-home");
    const gradleRunner = document.getElementById("java-build-path-gradle-runner");
    const manageGradleButton = document.getElementById("java-build-path-manage-gradle");
    const projectJdkSelect = document.getElementById("java-build-path-project-jdk");
    const manageJdksButton = document.getElementById("java-build-path-manage-jdks");
    const eclipsePreferencesSection = document.getElementById("java-build-path-eclipse-preferences");
    const eclipsePreferencesDescription = document.getElementById("java-build-path-eclipse-preferences-description");
    const eclipsePreferencesToggle = document.getElementById("java-build-path-eclipse-preferences-enabled");
    const eclipsePreferencesApplyButton = document.getElementById("java-build-path-eclipse-preferences-apply");
    const eclipsePreferencesStatus = document.getElementById("java-build-path-eclipse-preferences-status");
    const analysisSettingsSection = document.getElementById("java-build-path-analysis-settings");
    const analysisSection = document.getElementById("java-build-path-analysis");
    const analysisToggle = document.getElementById("java-build-path-analysis-toggle");
    const analysisDisclosure = document.getElementById("java-build-path-analysis-disclosure");
    const analysisModeSelect = document.getElementById("java-build-path-analysis-mode");
    const analysisModuleList = document.getElementById("java-build-path-analysis-module-list");
    let draft = null;
    let activeProjectPath = "";
    let mavenProject = null;
    let gradleProject = null;
    let gradleInstallations = [];
    let detectedModules = [];
    let analysisInventory = { kind: "standard-source-folders", label: "Java source folders", entries: [], error: "" };
    let isAnalysisExpanded = false;

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function isAbsolute(path) {
      const value = normalizePath(path);
      return /^[a-zA-Z]:\//.test(value) || value.startsWith("/");
    }

    function isInsideProject(projectPath, candidatePath) {
      const project = normalizePath(projectPath).toLowerCase();
      const candidate = normalizePath(candidatePath).toLowerCase();
      return candidate === project || candidate.startsWith(`${project}/`);
    }

    function toStoredPath(projectPath, candidatePath) {
      const project = normalizePath(projectPath);
      const candidate = normalizePath(candidatePath);
      if (!isInsideProject(project, candidate)) return candidate;
      const relative = candidate.slice(project.length).replace(/^\/+/, "");
      return relative || ".";
    }

    function resolveStoredPath(projectPath, storedPath) {
      return isAbsolute(storedPath) ? normalizePath(storedPath) : joinPath(projectPath, storedPath === "." ? "" : storedPath);
    }

    function createEmptyConfiguration() {
      return {
        schemaVersion: 10,
        type: "md-editor-java-build-path",
        projectJdkId: null,
        buildSystem: null,
        sourceFolders: [],
        classpathFolders: [],
        jarFiles: [],
        javacProfile: null,
        analysisScope: {
          mode: "all",
          inventoryKind: "",
          deselectedEntryIds: [],
          customized: false
        },
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
      };
    }

    function getLibraryEntryKey(entry) {
      return `${entry.kind}:${normalizePath(entry.path)}`;
    }

    /** Return class folders and archives in their configured classpath order. */
    function getOrderedLibraryEntries(configuration) {
      const folders = (configuration.classpathFolders || []).map((path) => ({ kind: "folder", path }));
      const archives = (configuration.jarFiles || []).map((path) => ({ kind: "jar", path }));
      const available = new Map([...folders, ...archives].map((entry) => [getLibraryEntryKey(entry), entry]));
      const ordered = [];
      for (const saved of Array.isArray(configuration.libraryOrder) ? configuration.libraryOrder : []) {
        const entry = available.get(getLibraryEntryKey(saved));
        if (!entry) continue;
        ordered.push(entry);
        available.delete(getLibraryEntryKey(entry));
      }
      ordered.push(...folders.filter((entry) => available.delete(getLibraryEntryKey(entry))));
      ordered.push(...archives.filter((entry) => available.delete(getLibraryEntryKey(entry))));
      return ordered;
    }

    function normalizeConfiguration(value) {
      const source = value && typeof value === "object" ? value : {};
      const unique = (items) => Array.from(new Set((Array.isArray(items) ? items : []).map(normalizePath).filter(Boolean)));
      const runTests = source.maven?.runTests === true;
      const runGradleTests = source.gradle?.runTests === true;
      const gradleInstallationId = String(source.gradle?.installationId || "") || null;
      const gradleMode = ["wrapper", "built-in", "installation"].includes(source.gradle?.mode)
        ? source.gradle.mode
        : "installation";
      const analysisScope = source.analysisScope && typeof source.analysisScope === "object"
        ? source.analysisScope
        : {};
      const currentScopeSchema = Number(source.schemaVersion) >= 10;
      const normalized = {
        schemaVersion: 10,
        type: "md-editor-java-build-path",
        projectJdkId: String(source.projectJdkId || "") || null,
        buildSystem: ["maven", "gradle", "javac"].includes(source.buildSystem) ? source.buildSystem : null,
        sourceFolders: unique(source.sourceFolders),
        classpathFolders: unique(source.classpathFolders),
        jarFiles: unique(source.jarFiles),
        analysisScope: {
          mode: currentScopeSchema && analysisScope.mode === "selected" ? "selected" : "all",
          inventoryKind: currentScopeSchema ? String(analysisScope.inventoryKind || "") : "",
          deselectedEntryIds: currentScopeSchema ? unique(analysisScope.deselectedEntryIds) : [],
          customized: currentScopeSchema && analysisScope.customized === true
        },
        javacProfile: source.javacProfile && typeof source.javacProfile === "object" ? {
          sourceFolders: unique(source.javacProfile.sourceFolders),
          classpathEntries: unique(source.javacProfile.classpathEntries),
          outputMode: source.javacProfile.outputMode === "sources" ? "sources" : "classes",
          outputPath: normalizePath(source.javacProfile.outputPath),
          exportSources: source.javacProfile.exportSources === true
        } : null,
        maven: {
          compileTests: runTests || source.maven?.compileTests !== false,
          runTests
        },
        gradle: {
          mode: gradleMode,
          installationId: gradleInstallationId,
          compileTests: runGradleTests || source.gradle?.compileTests !== false,
          runTests: runGradleTests
        }
      };
      if (Array.isArray(source.maven?.lastBuildOptionArguments)) {
        normalized.maven.lastBuildOptionArguments = source.maven.lastBuildOptionArguments
          .map((argument) => String(argument || "").trim())
          .filter(Boolean);
      }
      if (Array.isArray(source.libraryOrder)) {
        normalized.libraryOrder = getOrderedLibraryEntries(Object.assign({}, normalized, { libraryOrder: source.libraryOrder }))
          .map((entry) => ({ kind: entry.kind, path: entry.path }));
      }
      return normalized;
    }

    function getConfigurationPath(projectPath) {
      return joinPath(joinPath(projectPath, ".md-editor"), CONFIG_FILE);
    }

    async function loadConfiguration(projectPath) {
      try {
        return normalizeConfiguration(JSON.parse(await Neutralino.filesystem.readFile(getConfigurationPath(projectPath))));
      } catch (_error) {
        return createEmptyConfiguration();
      }
    }

    async function saveConfiguration(projectPath, configuration) {
      const normalized = normalizeConfiguration(Object.assign({}, configuration, {
        buildSystem: configuration?.buildSystem || "javac"
      }));
      try {
        await Neutralino.filesystem.createDirectory(joinPath(projectPath, ".md-editor"));
      } catch (_error) {
        // Existing project metadata folders are valid.
      }
      await Neutralino.filesystem.writeFile(getConfigurationPath(projectPath), JSON.stringify(normalized, null, 2) + "\n");
      return normalized;
    }

    function validateSourceFolders(projectPath, sourceFolders) {
      const resolved = sourceFolders.map((entry) => resolveStoredPath(projectPath, entry));
      for (const path of resolved) {
        if (!isInsideProject(projectPath, path)) return "Source folders must be inside the opened project.";
      }
      for (let left = 0; left < resolved.length; left += 1) {
        for (let right = left + 1; right < resolved.length; right += 1) {
          const a = normalizePath(resolved[left]).toLowerCase();
          const b = normalizePath(resolved[right]).toLowerCase();
          if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
            return "Source folders cannot duplicate or contain one another.";
          }
        }
      }
      return "";
    }

    function setError(message) {
      if (!errorElement) return;
      errorElement.textContent = message || "";
      errorElement.hidden = !message;
    }

    function moveLibraryEntry(index, offset) {
      const entries = getOrderedLibraryEntries(draft);
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= entries.length) return;
      [entries[index], entries[targetIndex]] = [entries[targetIndex], entries[index]];
      draft.libraryOrder = entries.map((entry) => ({ kind: entry.kind, path: entry.path }));
      render();
    }

    function renderList(host, entries, kind) {
      if (!host) return;
      host.textContent = "";
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "java-build-path-empty";
        empty.textContent = kind === "source" ? "No source folders configured." : "No libraries configured.";
        host.appendChild(empty);
        return;
      }
      entries.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "java-build-path-row";
        const label = document.createElement("span");
        label.className = "java-build-path-row-label";
        label.textContent = entry.path;
        label.title = resolveStoredPath(activeProjectPath, entry.path);
        const type = document.createElement("span");
        type.className = "java-build-path-row-type";
        type.textContent = entry.type;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "reset-modal-btn reset-modal-cancel java-build-path-remove";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          draft[entry.collection] = draft[entry.collection].filter((value) => value !== entry.path);
          render();
          if (entry.collection === "sourceFolders") void refreshAnalysisInventory().then(render);
        });
        const actions = document.createElement("div");
        actions.className = "java-build-path-row-actions";
        if (kind === "library") {
          const moveUp = document.createElement("button");
          moveUp.type = "button";
          moveUp.className = "reset-modal-btn reset-modal-cancel java-build-path-order";
          moveUp.textContent = "Up";
          moveUp.disabled = index === 0;
          moveUp.setAttribute("aria-label", `Move ${entry.path} up`);
          moveUp.addEventListener("click", () => moveLibraryEntry(index, -1));
          const moveDown = document.createElement("button");
          moveDown.type = "button";
          moveDown.className = "reset-modal-btn reset-modal-cancel java-build-path-order";
          moveDown.textContent = "Down";
          moveDown.disabled = index === entries.length - 1;
          moveDown.setAttribute("aria-label", `Move ${entry.path} down`);
          moveDown.addEventListener("click", () => moveLibraryEntry(index, 1));
          actions.append(moveUp, moveDown);
        }
        actions.appendChild(remove);
        row.append(label, type, actions);
        host.appendChild(row);
      });
    }

    function getSelectedGradleInstallation() {
      if (draft?.gradle?.mode !== "installation") return null;
      const installationId = String(draft?.gradle?.installationId || "");
      return gradleInstallations.find((installation) => installation.id === installationId) || null;
    }

    function getGradleSelectionValue() {
      if (draft?.gradle?.mode === "wrapper") return GRADLE_SELECTION_WRAPPER;
      if (draft?.gradle?.mode === "built-in") return GRADLE_SELECTION_BUILT_IN;
      return draft?.gradle?.installationId ? `${GRADLE_SELECTION_INSTALLATION_PREFIX}${draft.gradle.installationId}` : "";
    }

    function applyGradleSelection(value) {
      const selection = String(value || "");
      if (selection === GRADLE_SELECTION_WRAPPER || selection === GRADLE_SELECTION_BUILT_IN) {
        draft.gradle.mode = selection;
        return;
      }
      draft.gradle.mode = "installation";
      draft.gradle.installationId = selection.startsWith(GRADLE_SELECTION_INSTALLATION_PREFIX)
        ? selection.slice(GRADLE_SELECTION_INSTALLATION_PREFIX.length) || null
        : null;
    }

    function renderGradleInstallations() {
      if (!gradleInstallationSelect) return;
      gradleInstallationSelect.replaceChildren();
      const wrapper = document.createElement("option");
      wrapper.value = GRADLE_SELECTION_WRAPPER;
      wrapper.textContent = "Use project Gradle wrapper";
      wrapper.disabled = gradleProject?.hasWrapper !== true;
      gradleInstallationSelect.appendChild(wrapper);
      const builtIn = document.createElement("option");
      builtIn.value = GRADLE_SELECTION_BUILT_IN;
      builtIn.textContent = "Use Path Gradle";
      gradleInstallationSelect.appendChild(builtIn);
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = gradleInstallations.length
        ? "Configured Gradle installations"
        : "No Gradle installations configured";
      placeholder.disabled = true;
      gradleInstallationSelect.appendChild(placeholder);
      for (const installation of gradleInstallations) {
        const option = document.createElement("option");
        option.value = `${GRADLE_SELECTION_INSTALLATION_PREFIX}${installation.id}`;
        option.textContent = installation.name
          + (installation.version ? " — Gradle " + installation.version : "")
          + " — " + installation.path;
        gradleInstallationSelect.appendChild(option);
      }
      if (draft?.gradle?.mode === "installation" && draft.gradle.installationId && !getSelectedGradleInstallation()) {
        const unavailable = document.createElement("option");
        unavailable.value = `${GRADLE_SELECTION_INSTALLATION_PREFIX}${draft.gradle.installationId}`;
        unavailable.textContent = "Configured Project Gradle is unavailable";
        unavailable.disabled = true;
        gradleInstallationSelect.appendChild(unavailable);
      }
      gradleInstallationSelect.value = getGradleSelectionValue();
    }

    function renderAnalysisModules() {
      if (!analysisModuleList || !draft) return;
      analysisModuleList.replaceChildren();
      if (analysisModeSelect) analysisModeSelect.value = draft.analysisScope.mode;
      draft.analysisScope.inventoryKind = analysisInventory.kind || "";
      if (analysisInventory.error) {
        const empty = document.createElement("p");
        empty.className = "java-build-path-empty";
        empty.textContent = analysisInventory.error;
        analysisModuleList.appendChild(empty);
        return;
      }
      const entries = analysisInventory.entries || [];
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "java-build-path-empty";
        empty.textContent = `No ${analysisInventory.label || "Java analysis entries"} detected.`;
        analysisModuleList.appendChild(empty);
        return;
      }
      const deselected = new Set(draft.analysisScope.deselectedEntryIds || []);
      const selected = new Set(entries.filter((entry) => !deselected.has(entry.id)).map((entry) => entry.id));
      entries.forEach((entry) => {
        const row = document.createElement("label");
        row.className = "java-build-path-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = draft.analysisScope.mode === "all" || selected.has(entry.id);
        checkbox.disabled = draft.analysisScope.mode === "all";
        const label = document.createElement("span");
        label.className = "java-build-path-row-label";
        label.textContent = entry.name || entry.relativePath;
        label.title = entry.relativePath === "." ? entry.absolutePath : entry.relativePath;
        const type = document.createElement("span");
        type.className = "java-build-path-row-type";
        type.textContent = entry.provider === "standard" ? "source" : entry.provider;
        checkbox.addEventListener("change", () => {
          draft.analysisScope.customized = true;
          if (checkbox.checked) {
            deselected.delete(entry.id);
          } else {
            const requiredBy = entries.filter((candidate) => selected.has(candidate.id) && (candidate.dependencies || []).includes(entry.id));
            if (requiredBy.length) {
              setError(`${entry.name} is required by ${requiredBy.map((candidate) => candidate.name).join(", ")} and must remain selected.`);
              return renderAnalysisModules();
            }
            const relative = String(entry.relativePath || "").replace(/\\/g, "/");
            const selectedDescendant = entries.find((candidate) => selected.has(candidate.id)
              && String(candidate.relativePath || "").replace(/\\/g, "/").startsWith(`${relative}/`));
            if ((relative === "." && selected.size > 1) || selectedDescendant) {
              setError(`${entry.name} contains selected child modules and cannot be excluded from JDT.`);
              return renderAnalysisModules();
            }
            deselected.add(entry.id);
          }
          draft.analysisScope.deselectedEntryIds = Array.from(deselected);
          setError("");
          renderAnalysisModules();
        });
        row.append(checkbox, label, type);
        analysisModuleList.appendChild(row);
      });
    }

    async function refreshAnalysisInventory(workspaceModel = null) {
      analysisInventory = await deps.javaAnalysisInventory?.resolve?.({
        workspaceRoot: activeProjectPath,
        configuration: draft,
        discoveredModules: workspaceModel?.modules || detectedModules,
        standardJavaSourceRoots: workspaceModel?.standardJavaSourceRoots || []
      }) || workspaceModel?.analysisInventory || analysisInventory;
      draft.analysisScope.inventoryKind = analysisInventory.kind || "";
      return analysisInventory;
    }

    /**
     * Refresh an auto-derived Java analysis scope from newly materialized Eclipse projects.
     *
     * @param {string} projectPath - Opened project folder.
     * @returns {Promise<{changed: boolean, configurationSignature: string}>} Persisted refresh outcome.
     */
    async function refreshEclipseAnalysisScope(projectPath) {
      const normalizedProjectPath = normalizePath(projectPath);
      deps.javaWorkspaceModel?.invalidate?.(normalizedProjectPath);
      const workspaceModel = await deps.javaWorkspaceModel?.detect?.(normalizedProjectPath);
      if (draft && activeProjectPath.toLowerCase() === normalizedProjectPath.toLowerCase()) {
        detectedModules = workspaceModel?.modules || detectedModules;
        await refreshAnalysisInventory(workspaceModel);
        renderAnalysisModules();
      }
      return { changed: false, configurationSignature: String(workspaceModel?.configurationSignature || "") };
    }

    /** Expand or collapse Java Analysis while keeping focusable controls out of the collapsed disclosure. */
    function setAnalysisExpanded(expanded) {
      isAnalysisExpanded = expanded === true;
      analysisSection?.classList.toggle("is-expanded", isAnalysisExpanded);
      analysisToggle?.setAttribute("aria-expanded", isAnalysisExpanded ? "true" : "false");
      if (analysisDisclosure) {
        analysisDisclosure.inert = !isAnalysisExpanded;
        analysisDisclosure.setAttribute("aria-hidden", isAnalysisExpanded ? "false" : "true");
      }
    }

    function render() {
      const sourceRows = draft.sourceFolders.map((path) => ({ path, type: "Source", collection: "sourceFolders" }));
      renderList(sourceList, sourceRows, "source");
      renderList(mavenSourceList, sourceRows, "source");
      renderAnalysisModules();
      renderList(libraryList, getOrderedLibraryEntries(draft).map((entry) => ({
        path: entry.path,
        type: entry.kind === "folder" ? "Class folder" : (entry.path.toLowerCase().endsWith(".zip") ? "ZIP" : "JAR"),
        collection: entry.kind === "folder" ? "classpathFolders" : "jarFiles"
      })), "library");
      const hasMavenProject = mavenProject?.hasPom === true;
      const hasGradleProject = gradleProject?.hasGradleProject === true;
      const needsDecision = !draft.buildSystem && (hasMavenProject || hasGradleProject);
      const selectedBuildSystem = draft.buildSystem || "javac";
      if (detectionPrompt) detectionPrompt.hidden = !needsDecision;
      if (detectionMessage) {
        detectionMessage.textContent = hasMavenProject && hasGradleProject
          ? "Maven and Gradle projects were detected. How should this Java project be built?"
          : `${hasGradleProject ? "Gradle" : "Maven"} project detected. How should this Java project be built?`;
      }
      if (useMavenButton) useMavenButton.hidden = !hasMavenProject;
      if (useGradleButton) useGradleButton.hidden = !hasGradleProject;
      if (dialogActions) dialogActions.hidden = needsDecision;
      if (buildSystemField) buildSystemField.hidden = needsDecision;
      if (configurationSection) configurationSection.hidden = needsDecision;
      if (analysisSettingsSection) analysisSettingsSection.hidden = needsDecision;
      if (buildSystemDescription) {
        buildSystemDescription.hidden = needsDecision;
        buildSystemDescription.textContent = selectedBuildSystem === "maven"
          ? "Maven controls source roots, dependencies, Java version, output, and build plugins from the project POM."
          : (selectedBuildSystem === "gradle"
            ? "Gradle controls source sets, dependencies, Java toolchains, outputs, and build plugins from the project build."
            : "Standard Java uses the configured source folders and libraries with javac.");
      }
      if (buildSystemSelect) {
        buildSystemSelect.value = selectedBuildSystem;
        const mavenOption = buildSystemSelect.querySelector('option[value="maven"]');
        if (mavenOption) mavenOption.disabled = !hasMavenProject;
        const gradleOption = buildSystemSelect.querySelector('option[value="gradle"]');
        if (gradleOption) gradleOption.disabled = !hasGradleProject;
      }
      if (standardPanel) standardPanel.hidden = needsDecision || selectedBuildSystem !== "javac";
      if (mavenPanel) mavenPanel.hidden = needsDecision || selectedBuildSystem !== "maven";
      if (gradlePanel) gradlePanel.hidden = needsDecision || selectedBuildSystem !== "gradle";
      if (mavenPom) mavenPom.value = mavenProject?.pomLabel || "pom.xml";
      if (mavenRunner) mavenRunner.value = mavenProject?.runner || "mvn";
      const selectedGradleInstallation = getSelectedGradleInstallation();
      renderGradleInstallations();
      if (gradleDescriptor) gradleDescriptor.value = gradleProject?.descriptorLabel || "build.gradle";
      if (gradleVersion) {
        gradleVersion.value = draft.gradle.mode === "wrapper"
          ? "Defined by project wrapper"
          : (draft.gradle.mode === "built-in" ? "JDT built-in" : (selectedGradleInstallation?.version || "Unavailable"));
      }
      if (gradleHome) {
        gradleHome.value = draft.gradle.mode === "wrapper"
          ? (gradleProject?.wrapperPath || "Unavailable")
          : (draft.gradle.mode === "built-in" ? "Managed by JDT" : (selectedGradleInstallation?.path || "Unavailable"));
      }
      if (gradleRunner) gradleRunner.value = gradleProject?.runner || gradleProject?.runnerError || "Unavailable";
      if (scanMavenSourcesButton) scanMavenSourcesButton.disabled = selectedBuildSystem !== "maven" || !mavenProject?.hasPom;
      if (selectedBuildSystem === "maven" && !mavenProject?.hasPom) {
        setError("The configured Maven project no longer has pom.xml in the project root. Switch to Standard Java (javac) or restore pom.xml.");
      } else if (selectedBuildSystem === "gradle" && !gradleProject?.hasGradleProject) {
        setError("The configured Gradle project no longer has a Gradle settings or build file. Switch to Standard Java (javac) or restore the Gradle descriptor.");
      } else if (selectedBuildSystem === "gradle" && draft.gradle.mode === "installation" && !selectedGradleInstallation) {
        setError("Select a Project Gradle installation configured in Settings > Gradle.");
      } else if (selectedBuildSystem === "gradle" && gradleProject?.runnerError) {
        setError(gradleProject.runnerError);
      }
      renderEclipsePreferences({ hidden: needsDecision, buildSystem: selectedBuildSystem });
    }

    async function renderProjectJdks() {
      if (!projectJdkSelect) return;
      const configured = deps.jdkRegistry?.list?.() || [];
      const validations = await Promise.all(configured.map(async (entry) => ({ entry, validation: await deps.jdkRegistry.validate(entry) })));
      const validIds = new Set(validations.filter(({ validation }) => validation.valid).map(({ validation }) => validation.runtime.id));
      projectJdkSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select a configured JDK...";
      projectJdkSelect.appendChild(placeholder);
      validations.filter(({ validation }) => validation.valid).forEach(({ validation }) => {
        const runtime = validation.runtime;
        const option = document.createElement("option");
        option.value = runtime.id;
        option.textContent = `${runtime.name} — Java ${runtime.feature} — ${runtime.path}`;
        projectJdkSelect.appendChild(option);
      });
      if (draft.projectJdkId && !validIds.has(draft.projectJdkId)) {
        const unavailable = document.createElement("option");
        unavailable.value = draft.projectJdkId;
        unavailable.textContent = "Configured Project JDK is unavailable";
        unavailable.disabled = true;
        projectJdkSelect.appendChild(unavailable);
      }
      projectJdkSelect.value = draft.projectJdkId || "";
    }

    async function refreshProjectJdks() {
      if (!draft || modal?.style.display === "none" || !modal?.style.display) return false;
      await renderProjectJdks();
      return true;
    }

    async function refreshGradleProject() {
      gradleProject = await deps.gradleDetection.detectProject(
        activeProjectPath,
        deps.osName,
        draft.sourceFolders,
        deps.getGradleLauncherSettings?.(draft.gradle) || {}
      );
    }

    async function refreshGradleInstallations() {
      if (!draft || modal?.style.display === "none" || !modal?.style.display) return false;
      gradleInstallations = deps.getGradleInstallations?.() || [];
      if (draft.gradle.mode === "installation" && !draft.gradle.installationId) {
        draft.gradle.installationId = deps.getSelectedGradleInstallationId?.() || gradleInstallations[0]?.id || null;
      }
      await refreshGradleProject();
      setError("");
      render();
      return true;
    }

    /** Reflect Eclipse-preference capabilities for the selected Java build system. */
    function renderEclipsePreferences(options = {}) {
      const controller = deps.eclipsePreferences;
      if (!eclipsePreferencesSection) return;
      eclipsePreferencesSection.hidden = options.hidden === true;
      if (eclipsePreferencesSection.hidden) return;
      const detection = controller?.getDetection?.();
      const buildSystem = String(options.buildSystem || draft?.buildSystem || "javac");
      const canGenerate = buildSystem === "gradle" && detection?.generatable === true;
      const hasCommittedPreferences = detection?.present === true;
      const supported = canGenerate || hasCommittedPreferences;
      const controllerState = controller?.getState?.() || {};
      if (eclipsePreferencesDescription) {
        eclipsePreferencesDescription.textContent = canGenerate
          ? "Apply the Eclipse compiler preferences this project defines for itself (warning suppressions, encodings) by running its eclipseJdt task, then rebuilding analysis."
          : (hasCommittedPreferences
            ? "Apply the committed Eclipse compiler preferences this project defines for itself (warning suppressions, encodings) by rebuilding Java analysis. No project files will be generated or changed."
            : `No committed Eclipse compiler preferences were found for this ${buildSystem === "maven" ? "Maven" : (buildSystem === "gradle" ? "Gradle" : "standard Java")} project.`);
      }
      if (eclipsePreferencesToggle) {
        eclipsePreferencesToggle.checked = canGenerate
          ? controller?.getSetting?.() === "generate"
          : hasCommittedPreferences;
        eclipsePreferencesToggle.disabled = !canGenerate;
      }
      if (eclipsePreferencesApplyButton) eclipsePreferencesApplyButton.disabled = !supported || controllerState.applying === true;
      if (eclipsePreferencesStatus) {
        const appliedAt = controllerState.appliedAt;
        eclipsePreferencesStatus.textContent = controllerState.applying === true
          ? "Applying..."
          : (appliedAt ? `Last applied ${appliedAt.replace("T", " ").slice(0, 16)}.` : (hasCommittedPreferences ? "Committed preference files are honored automatically." : "No project Eclipse preferences are available."));
      }
    }

    function selectTab(name) {
      const sourceActive = name !== "libraries";
      sourcePanel.hidden = !sourceActive;
      libraryPanel.hidden = sourceActive;
      document.querySelectorAll("[data-java-build-path-tab]").forEach((button) => {
        const active = button.dataset.javaBuildPathTab === (sourceActive ? "source" : "libraries");
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    async function addSourceFolder() {
      const selected = normalizePath(await Neutralino.os.showFolderDialog("Select Java source folder", { defaultPath: activeProjectPath }));
      if (!selected) return;
      if (!isInsideProject(activeProjectPath, selected)) return setError("Source folders must be inside the opened project.");
      const stored = toStoredPath(activeProjectPath, selected);
      if (!draft.sourceFolders.includes(stored)) draft.sourceFolders.push(stored);
      setError(validateSourceFolders(activeProjectPath, draft.sourceFolders));
      await refreshAnalysisInventory();
      render();
    }

    async function scanMavenSourceFolders() {
      if (!deps.mavenSourceFolders?.scan || !mavenProject?.hasPom) return;
      if (mavenSourceStatus) mavenSourceStatus.textContent = "Scanning...";
      setError("");
      try {
        const detected = await deps.mavenSourceFolders.scan(mavenProject.projectRoot || activeProjectPath);
        const beforeCount = draft.sourceFolders.length;
        for (const entry of detected) {
          const stored = toStoredPath(activeProjectPath, entry.absolutePath || entry.path);
          if (!draft.sourceFolders.includes(stored)) draft.sourceFolders.push(stored);
        }
        const validationError = validateSourceFolders(activeProjectPath, draft.sourceFolders);
        if (validationError) setError(validationError);
        if (mavenSourceStatus) {
          const added = draft.sourceFolders.length - beforeCount;
          mavenSourceStatus.textContent = detected.length
            ? `Detected ${detected.length} Maven source folder(s), added ${added}.`
            : "No Maven source folders detected.";
        }
      } catch (error) {
        setError(error?.message || "Maven source folders could not be scanned.");
        if (mavenSourceStatus) mavenSourceStatus.textContent = "";
      }
      await refreshAnalysisInventory();
      render();
    }
    async function addClasspathFolder() {
      const selected = normalizePath(await Neutralino.os.showFolderDialog("Select classpath folder", { defaultPath: activeProjectPath }));
      if (!selected) return;
      const stored = toStoredPath(activeProjectPath, selected);
      if (!draft.classpathFolders.includes(stored)) draft.classpathFolders.push(stored);
      render();
    }

    async function addJarFiles() {
      const selected = await Neutralino.os.showOpenDialog("Select classpath JAR or ZIP files", {
        defaultPath: activeProjectPath,
        multiSelections: true,
        filters: [{ name: "Java archives", extensions: ["jar", "zip"] }]
      });
      if ((selected || []).some((path) => /\.zip$/i.test(path))) {
        await app.services?.notify?.alert?.({
          title: "ZIP Classpath Performance",
          message: "ZIP classpath files must be extracted during every Java compile, which can make builds slower.\n\nFor faster builds, extract the JARs or class files from the ZIP into a lib folder inside the project and add those entries to the Java Build Path."
        });
      }
      for (const path of selected || []) {
        const stored = toStoredPath(activeProjectPath, path);
        if (!draft.jarFiles.includes(stored)) draft.jarFiles.push(stored);
      }
      render();
    }

    async function openDialog(projectPath, options = {}) {
      if (!modal) throw new Error("The Java Build Path dialog is unavailable.");
      activeProjectPath = normalizePath(projectPath);
      draft = await loadConfiguration(activeProjectPath);
      const originalConfiguration = JSON.stringify(draft);
      const workspaceModel = await deps.javaWorkspaceModel?.detect?.(activeProjectPath);
      detectedModules = workspaceModel?.modules || [];
      analysisInventory = workspaceModel?.analysisInventory || analysisInventory;
      gradleInstallations = deps.getGradleInstallations?.() || [];
      if (draft.gradle.mode === "installation" && !draft.gradle.installationId) {
        draft.gradle.installationId = deps.getSelectedGradleInstallationId?.() || gradleInstallations[0]?.id || null;
      }
      mavenProject = options.targetPath && deps.mavenDetection.detectProjectForTarget
        ? await deps.mavenDetection.detectProjectForTarget(activeProjectPath, options.targetPath, deps.osName)
        : await deps.mavenDetection.detectProject(activeProjectPath, deps.osName, draft.sourceFolders);
      await refreshGradleProject();
      setError("");
      if (mavenSourceStatus) mavenSourceStatus.textContent = "";
      await renderProjectJdks();
      render();
      selectTab(options.initialTab || "source");
      modal.style.display = "flex";
      if (options.focusProjectJdk) global.setTimeout(() => projectJdkSelect?.focus?.(), 0);
      return new Promise((resolve) => {
        const finish = (value) => {
          modal.style.display = "none";
          resolve(value);
        };
        document.getElementById("java-build-path-save").onclick = async () => {
          const selectedJdk = deps.jdkRegistry?.resolve?.(draft.projectJdkId);
          const selectedJdkValidation = selectedJdk ? await deps.jdkRegistry.validate(selectedJdk) : null;
          if (!selectedJdkValidation?.valid) {
            return setError("Select a valid Project JDK configured in System Settings.");
          }
          const buildSystem = draft.buildSystem || "javac";
          const isNestedMavenProject = buildSystem === "maven" && mavenProject?.hasPom === true
            && normalizePath(mavenProject?.projectRoot).toLowerCase() !== activeProjectPath.toLowerCase();
          if (isNestedMavenProject && !draft.sourceFolders.length) {
            await scanMavenSourceFolders();
            if (!draft.sourceFolders.length) {
              return setError("Add or scan at least one Maven source folder so the nested Maven project can be resolved later.");
            }
          }
          if (buildSystem === "maven" && !mavenProject.hasPom) {
            return setError("The configured Maven project no longer has pom.xml in the project root. Switch to Standard Java (javac) or restore pom.xml.");
          }
          if (buildSystem === "gradle" && !gradleProject.hasGradleProject) {
            return setError("The configured Gradle project no longer has a Gradle settings or build file. Switch to Standard Java (javac) or restore the Gradle descriptor.");
          }
          if (buildSystem === "gradle" && draft.gradle.mode === "installation" && !getSelectedGradleInstallation()) {
            return setError("Select a Project Gradle installation configured in Settings > Gradle.");
          }
          if (buildSystem === "gradle" && gradleProject.runnerError) return setError(gradleProject.runnerError);
          if (analysisInventory.error) return setError(analysisInventory.error);
          const selectedCount = (analysisInventory.entries || []).filter((entry) => (
            draft.analysisScope.mode === "all" || !(draft.analysisScope.deselectedEntryIds || []).includes(entry.id)
          )).length;
          if (draft.analysisScope.mode === "selected" && selectedCount === 0) {
            return setError(`Select at least one entry from ${analysisInventory.label || "the Java analysis inventory"}.`);
          }
          const error = draft.sourceFolders.length ? validateSourceFolders(activeProjectPath, draft.sourceFolders) : "";
          if (error) return setError(error);
          draft.buildSystem = buildSystem;
          const saved = await saveConfiguration(activeProjectPath, draft);
          let finished = false;
          const finishAfterDecision = () => {
            if (finished) return;
            finished = true;
            finish(saved);
          };
          const configurationChanged = JSON.stringify(saved) !== originalConfiguration;
          try {
            await deps.onConfigurationSaved?.(activeProjectPath, saved, {
              configurationChanged,
              onDecision: finishAfterDecision
            });
          } finally {
            finishAfterDecision();
          }
        };
        document.getElementById("java-build-path-cancel").onclick = () => finish(null);
        document.getElementById("java-build-path-detection-cancel").onclick = () => finish(null);
        modal.onclick = (event) => { if (event.target === modal) finish(null); };
      });
    }

    document.querySelectorAll("[data-java-build-path-tab]").forEach((button) => {
      button.addEventListener("click", () => selectTab(button.dataset.javaBuildPathTab));
    });
    document.getElementById("java-build-path-add-source")?.addEventListener("click", () => void addSourceFolder());
    document.getElementById("java-build-path-add-folder")?.addEventListener("click", () => void addClasspathFolder());
    document.getElementById("java-build-path-add-jar")?.addEventListener("click", () => void addJarFiles());
    scanMavenSourcesButton?.addEventListener("click", () => void scanMavenSourceFolders());
    projectJdkSelect?.addEventListener("change", () => {
      draft.projectJdkId = projectJdkSelect.value || null;
      setError("");
    });
    manageJdksButton?.addEventListener("click", () => deps.openJdkSettings?.());
    eclipsePreferencesToggle?.addEventListener("change", () => {
      void deps.eclipsePreferences?.setSetting?.(eclipsePreferencesToggle.checked ? "generate" : "existing")
        .then(() => renderEclipsePreferences({ buildSystem: draft?.buildSystem || "javac" }));
    });
    eclipsePreferencesApplyButton?.addEventListener("click", () => {
      renderEclipsePreferences();
      void deps.eclipsePreferences?.applyNow?.({ generate: draft?.buildSystem === "gradle" }).then(() => renderEclipsePreferences({ buildSystem: draft?.buildSystem || "javac" }));
    });
    manageGradleButton?.addEventListener("click", () => deps.openGradleSettings?.());
    gradleInstallationSelect?.addEventListener("change", () => {
      applyGradleSelection(gradleInstallationSelect.value);
      setError("");
      void refreshGradleProject().then(render);
    });
    useMavenButton?.addEventListener("click", async () => {
      draft.buildSystem = "maven";
      setError("");
      await refreshAnalysisInventory();
      render();
    });
    useGradleButton?.addEventListener("click", async () => {
      draft.buildSystem = "gradle";
      setError("");
      await refreshAnalysisInventory();
      render();
    });
    document.getElementById("java-build-path-use-javac")?.addEventListener("click", async () => {
      draft.buildSystem = "javac";
      setError("");
      await refreshAnalysisInventory();
      render();
    });
    buildSystemSelect?.addEventListener("change", async () => {
      draft.buildSystem = buildSystemSelect.value;
      setError("");
      await refreshAnalysisInventory();
      render();
    });
    setAnalysisExpanded(false);
    analysisToggle?.addEventListener("click", () => setAnalysisExpanded(!isAnalysisExpanded));
    analysisModeSelect?.addEventListener("change", () => {
      draft.analysisScope.mode = analysisModeSelect.value === "selected" ? "selected" : "all";
      draft.analysisScope.customized = true;
      renderAnalysisModules();
    });

    const api = {
      CONFIG_FILE,
      createEmptyConfiguration,
      getConfigurationPath,
      getOrderedLibraryEntries,
      isInsideProject,
      loadConfiguration,
      normalizeConfiguration,
      openDialog,
      refreshProjectJdks,
      refreshGradleInstallations,
      refreshEclipseAnalysisScope,
      resolveStoredPath,
      saveConfiguration,
      toStoredPath,
      validateSourceFolders
    };
    app.registerModule?.("javaBuildPath", api);
    return api;
  }

  global.registerMarkdownViewerJavaBuildPath = registerMarkdownViewerJavaBuildPath;
})(typeof window !== "undefined" ? window : globalThis);
