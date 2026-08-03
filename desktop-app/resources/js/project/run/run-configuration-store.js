// Project-scoped Run configuration persistence and active-selection state.
(function(global) {
  "use strict";

  /**
   * Register the per-project Run configuration store.
   * @param {object} app Application module registry.
   * @param {object} deps Filesystem and runtime dependencies.
   * @returns {object} Run configuration persistence API.
   */
  function registerMarkdownViewerRunConfigurationStore(app, deps = {}) {
    const FILE_NAME = "run-configurations.json";
    const DOCUMENT_VERSION = 1;
    const listeners = new Set();
    let fallbackId = 0;
    let loadGeneration = 0;
    let writeQueue = Promise.resolve();
    let state = createEmptyState("");

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getFilesystem() {
      return deps.Neutralino?.filesystem || global.Neutralino?.filesystem || null;
    }

    function createEmptyState(projectPath) {
      return {
        projectPath: normalizePath(projectPath),
        loading: false,
        saving: false,
        error: null,
        revision: 0,
        active: "",
        configurations: []
      };
    }

    function cloneConfiguration(configuration) {
      return {
        ...configuration,
        environment: (configuration.environment || []).map((entry) => ({ ...entry })),
        java: configuration.java ? { ...configuration.java } : undefined,
        maven: configuration.maven ? { ...configuration.maven } : undefined,
        gradle: configuration.gradle ? { ...configuration.gradle } : undefined
      };
    }

    function snapshot() {
      return {
        ...state,
        error: state.error ? { ...state.error } : null,
        configurations: state.configurations.map(cloneConfiguration)
      };
    }

    function publish() {
      const value = snapshot();
      listeners.forEach((listener) => {
        try {
          listener(value);
        } catch (_error) {
          // Store observers cannot interrupt persistence.
        }
      });
      return value;
    }

    function createId() {
      if (typeof global.crypto?.randomUUID === "function") return global.crypto.randomUUID();
      fallbackId += 1;
      return `run-${Date.now()}-${fallbackId}`;
    }

    function normalizeEnvironment(value) {
      return (Array.isArray(value) ? value : []).map((entry) => ({
        name: String(entry?.name || "").trim(),
        value: String(entry?.value ?? "")
      })).filter((entry) => entry.name);
    }

    function normalizeType(value) {
      return ["java-application", "maven", "gradle"].includes(value) ? value : "java-application";
    }

    function normalizeConfiguration(input = {}, existing = null) {
      const type = normalizeType(input.type || existing?.type);
      const common = {
        id: String(input.id || existing?.id || createId()),
        type,
        name: String(input.name ?? existing?.name ?? "").trim(),
        workingDirectory: String(input.workingDirectory ?? existing?.workingDirectory ?? ""),
        environment: normalizeEnvironment(input.environment ?? existing?.environment),
        buildBeforeRun: input.buildBeforeRun === undefined
          ? existing?.buildBeforeRun !== false
          : input.buildBeforeRun === true
      };
      if (type === "java-application") {
        const java = { ...(existing?.java || {}), ...(input.java || {}) };
        return {
          ...common,
          java: {
            modulePath: String(java.modulePath || ""),
            mainClass: String(java.mainClass || "").trim(),
            programArguments: String(java.programArguments || ""),
            vmArguments: String(java.vmArguments || ""),
            jdkId: String(java.jdkId || ""),
            classpathOverride: String(java.classpathOverride || "")
          }
        };
      }
      if (type === "maven") {
        const maven = { ...(existing?.maven || {}), ...(input.maven || {}) };
        return {
          ...common,
          buildBeforeRun: false,
          maven: {
            commandLine: String(maven.commandLine || ""),
            profiles: String(maven.profiles || ""),
            runner: String(maven.runner || "")
          }
        };
      }
      const gradle = { ...(existing?.gradle || {}), ...(input.gradle || {}) };
      return {
        ...common,
        buildBeforeRun: false,
        gradle: {
          tasks: String(gradle.tasks || ""),
          projectPath: String(gradle.projectPath || ""),
          runner: String(gradle.runner || ""),
          offline: gradle.offline === true
        }
      };
    }

    function normalizeDocument(value) {
      const configurations = (Array.isArray(value?.configurations) ? value.configurations : [])
        .map((configuration) => normalizeConfiguration(configuration));
      const ids = new Set(configurations.map((configuration) => configuration.id));
      return {
        active: ids.has(String(value?.active || "")) ? String(value.active) : "",
        configurations
      };
    }

    function getPersistencePath(projectPath = state.projectPath) {
      return joinPath(joinPath(projectPath, ".md-editor"), FILE_NAME);
    }

    async function writeDocument() {
      const filesystem = getFilesystem();
      const projectPath = state.projectPath;
      if (!projectPath || !filesystem?.writeFile || !filesystem?.createDirectory) return false;
      state.saving = true;
      publish();
      try {
        try {
          await filesystem.createDirectory(joinPath(projectPath, ".md-editor"));
        } catch (_error) {
          // Existing project metadata directories are valid.
        }
        await filesystem.writeFile(getPersistencePath(projectPath), JSON.stringify({
          version: DOCUMENT_VERSION,
          active: state.active,
          configurations: state.configurations
        }, null, 2) + "\n");
        state.error = null;
        return true;
      } catch (error) {
        state.error = { message: error?.message || "Run configurations could not be saved." };
        return false;
      } finally {
        state.saving = false;
        state.revision += 1;
        publish();
      }
    }

    function queueWrite() {
      writeQueue = writeQueue.then(writeDocument, writeDocument);
      return writeQueue;
    }

    /**
     * Load one project's Run configurations and publish the resulting snapshot.
     * @param {string} projectPath Open project root.
     * @returns {Promise<object>} Loaded store snapshot.
     */
    async function loadProject(projectPath) {
      const root = normalizePath(projectPath);
      if (root === state.projectPath && state.loading === false) return snapshot();
      const generation = ++loadGeneration;
      state = createEmptyState(root);
      state.loading = Boolean(root);
      publish();
      if (!root) {
        state.loading = false;
        return publish();
      }
      try {
        const text = await getFilesystem()?.readFile?.(getPersistencePath(root));
        if (generation !== loadGeneration || state.projectPath !== root) return snapshot();
        const document = normalizeDocument(JSON.parse(text));
        state.active = document.active;
        state.configurations = document.configurations;
      } catch (_error) {
        // A missing or malformed file starts with an empty project store.
      }
      if (generation === loadGeneration && state.projectPath === root) {
        state.loading = false;
        state.revision += 1;
        publish();
      }
      return snapshot();
    }

    /**
     * Create or update a configuration in the active project.
     * @param {object} input Configuration draft.
     * @returns {Promise<object>} Persisted normalized configuration.
     */
    async function upsert(input) {
      if (!state.projectPath) throw new Error("Open a project before saving Run configurations.");
      const existingIndex = state.configurations.findIndex((item) => item.id === input?.id);
      const existing = existingIndex >= 0 ? state.configurations[existingIndex] : null;
      const normalized = normalizeConfiguration(input, existing);
      if (existingIndex >= 0) state.configurations.splice(existingIndex, 1, normalized);
      else state.configurations.push(normalized);
      state.active = normalized.id;
      state.revision += 1;
      publish();
      await queueWrite();
      return cloneConfiguration(normalized);
    }

    function createDuplicateName(name) {
      const base = `Copy of ${String(name || "Configuration").trim() || "Configuration"}`;
      const names = new Set(state.configurations.map((item) => item.name.toLowerCase()));
      if (!names.has(base.toLowerCase())) return base;
      let suffix = 2;
      while (names.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
      return `${base} ${suffix}`;
    }

    /**
     * Create an available numbered configuration name for one class or configuration type.
     * @param {string} baseName Class or configuration name without a sequence number.
     * @returns {string} First available name in the form "<base> <number>".
     */
    function createSequencedName(baseName) {
      const base = String(baseName || "Configuration").trim() || "Configuration";
      const names = new Set(state.configurations.map((item) => item.name.toLowerCase()));
      let sequence = 1;
      while (names.has(`${base} ${sequence}`.toLowerCase())) {
        sequence += 1;
      }
      return `${base} ${sequence}`;
    }

    /**
     * Duplicate a saved configuration and make the copy active.
     * @param {string} configurationId Saved configuration identifier.
     * @returns {Promise<object|null>} Persisted copy, or null when no source exists.
     */
    async function duplicate(configurationId) {
      const source = state.configurations.find((item) => item.id === configurationId);
      if (!source) return null;
      return upsert({
        ...cloneConfiguration(source),
        id: createId(),
        name: createDuplicateName(source.name)
      });
    }

    /**
     * Delete a saved configuration from the active project.
     * @param {string} configurationId Saved configuration identifier.
     * @returns {Promise<boolean>} Whether a configuration was deleted.
     */
    async function remove(configurationId) {
      const index = state.configurations.findIndex((item) => item.id === configurationId);
      if (index < 0) return false;
      state.configurations.splice(index, 1);
      if (state.active === configurationId) state.active = state.configurations[0]?.id || "";
      state.revision += 1;
      publish();
      await queueWrite();
      return true;
    }

    /**
     * Persist the active Run configuration identifier.
     * @param {string} configurationId Saved configuration identifier.
     * @returns {Promise<boolean>} Whether the active selection changed.
     */
    async function setActive(configurationId) {
      const id = String(configurationId || "");
      if (!state.configurations.some((item) => item.id === id)) return false;
      if (state.active === id) return true;
      state.active = id;
      state.revision += 1;
      publish();
      await queueWrite();
      return true;
    }

    function get(configurationId) {
      const value = state.configurations.find((item) => item.id === configurationId);
      return value ? cloneConfiguration(value) : null;
    }

    function getActive() {
      return get(state.active);
    }

    function createDraft(type = "java-application") {
      return normalizeConfiguration({ id: createId(), type, name: "" });
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener(snapshot());
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    const api = {
      DOCUMENT_VERSION,
      FILE_NAME,
      createDraft,
      createSequencedName,
      duplicate,
      get,
      getActive,
      getPersistencePath,
      getSnapshot: snapshot,
      loadProject,
      normalizeConfiguration,
      remove,
      setActive,
      subscribe,
      upsert
    };
    app.registerModule?.("runConfigurationStore", api);
    return api;
  }

  global.registerMarkdownViewerRunConfigurationStore = registerMarkdownViewerRunConfigurationStore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerRunConfigurationStore };
  }
})(typeof window !== "undefined" ? window : globalThis);
