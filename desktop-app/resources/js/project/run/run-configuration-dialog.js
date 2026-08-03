// Run Configuration modal orchestration, CRUD actions, preview, and main-class selection.
(function(global) {
  "use strict";

  /**
   * Register the Run Configuration dialog.
   * @param {object} app Application module registry.
   * @param {object} deps Store, editor, launcher, discovery, build-path, and JDK dependencies.
   * @returns {object} Run Configuration dialog API.
   */
  function registerMarkdownViewerRunConfigurationDialog(app, deps = {}) {
    let modal = null;
    let selectedId = "";
    let draft = null;
    let dirty = false;
    let editorControls = null;
    let previewGeneration = 0;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function typeLabel(type) {
      return type === "java-application" ? "Java Application" : type === "maven" ? "Maven" : "Gradle";
    }

    async function requestConfirmation(options) {
      if (typeof deps.confirm !== "function") return false;
      return await deps.confirm(options) === true;
    }

    function confirmDiscardChanges() {
      return requestConfirmation({
        title: "Discard Run configuration changes?",
        message: "Discard unapplied Run configuration changes?",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        confirmVariant: "danger"
      });
    }

    function confirmDeleteConfiguration(name) {
      return requestConfirmation({
        title: "Delete Run configuration?",
        message: `Delete '${name || "this configuration"}'?`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        confirmVariant: "danger"
      });
    }

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function deriveModulePath(projectPath, sourceRoot) {
      const projectRoot = normalizePath(projectPath);
      const normalizedSourceRoot = normalizePath(sourceRoot);
      const moduleRoot = normalizedSourceRoot.replace(/\/src\/(?:main|test)\/java$/i, "");
      if (!projectRoot || moduleRoot === normalizedSourceRoot) return "";
      if (moduleRoot.toLowerCase() === projectRoot.toLowerCase()) return "";
      if (!moduleRoot.toLowerCase().startsWith(projectRoot.toLowerCase() + "/")) return "";
      return moduleRoot.slice(projectRoot.length + 1);
    }

    async function resolveJavaModulePath(filePath) {
      const projectPath = deps.store.getSnapshot().projectPath;
      const normalizedFilePath = normalizePath(filePath).toLowerCase();
      if (!projectPath || !normalizedFilePath) return "";
      try {
        const buildConfiguration = await deps.buildPath.loadConfiguration(projectPath);
        const sourceRoots = (buildConfiguration.sourceFolders || [])
          .map((path) => deps.compiler.resolveStoredPath(projectPath, path));
        const sourceRoot = sourceRoots.find((path) => {
          const root = normalizePath(path).toLowerCase();
          return normalizedFilePath === root || normalizedFilePath.startsWith(root + "/");
        });
        return deriveModulePath(projectPath, sourceRoot);
      } catch (_error) {
        return "";
      }
    }

    function ensureModal() {
      if (modal) return modal;
      modal = document.createElement("div");
      modal.id = "run-configuration-modal";
      modal.className = "reset-modal-overlay run-configuration-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "run-configuration-title");
      modal.hidden = true;
      modal.innerHTML = `<div class="reset-modal-box run-configuration-box">
        <header class="run-configuration-header"><div><p class="run-configuration-kicker">Run</p><h2 id="run-configuration-title">Run Configurations</h2></div><button type="button" data-run-close aria-label="Close"><i class="bi bi-x-lg"></i></button></header>
        <div class="run-configuration-body">
          <aside class="run-configuration-sidebar">
            <div class="run-configuration-new"><select data-run-new-type aria-label="New configuration type"><option value="java-application">Java Application</option><option value="maven">Maven</option><option value="gradle">Gradle</option></select><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-new>New</button></div>
            <div class="run-configuration-list" data-run-configuration-list></div>
            <div class="run-configuration-sidebar-actions"><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-duplicate>Duplicate</button><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-delete>Delete</button></div>
          </aside>
          <main class="run-configuration-editor" data-run-configuration-editor></main>
        </div>
        <footer class="run-configuration-actions reset-modal-actions"><span data-run-dialog-status role="status"></span><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-close>Close</button><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-apply>Apply</button><button type="button" class="reset-modal-btn reset-modal-confirm" data-run-execute><i class="bi bi-play-fill"></i> Run</button></footer>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelector("[data-run-new]")?.addEventListener("click", createNew);
      modal.querySelector("[data-run-duplicate]")?.addEventListener("click", duplicateSelected);
      modal.querySelector("[data-run-delete]")?.addEventListener("click", deleteSelected);
      modal.querySelector("[data-run-apply]")?.addEventListener("click", () => void applyDraft());
      modal.querySelector("[data-run-execute]")?.addEventListener("click", () => void executeDraft());
      modal.querySelectorAll("[data-run-close]").forEach((button) => button.addEventListener("click", () => void close()));
      modal.addEventListener("click", (event) => {
        if (event.target === modal) void close();
      });
      return modal;
    }

    function renderList() {
      const host = ensureModal().querySelector("[data-run-configuration-list]");
      const configurations = deps.store.getSnapshot().configurations;
      host.innerHTML = ["java-application", "maven", "gradle"].map((type) => {
        const items = configurations.filter((item) => item.type === type);
        return `<section><h3>${typeLabel(type)}</h3>${items.length ? items.map((item) =>
          `<button type="button" data-run-select="${escapeHtml(item.id)}" class="${item.id === selectedId ? "active" : ""}"><i class="bi ${type === "java-application" ? "bi-cup-hot" : type === "maven" ? "bi-box" : "bi-layers"}"></i><span>${escapeHtml(item.name)}</span></button>`
        ).join("") : '<p class="run-configuration-empty">No configurations</p>'}</section>`;
      }).join("");
      host.querySelectorAll("[data-run-select]").forEach((button) => button.addEventListener("click", () => void selectConfiguration(button.dataset.runSelect)));
    }

    function getRegisteredJdks() {
      return deps.jdkRegistry?.list?.() || [];
    }

    function renderEditor() {
      const host = ensureModal().querySelector("[data-run-configuration-editor]");
      if (!draft) {
        host.innerHTML = '<div class="run-configuration-placeholder"><i class="bi bi-play-circle"></i><p>Create or select a Run configuration.</p></div>';
        return;
      }
      editorControls = deps.editor.render(host, draft, {
        jdks: getRegisteredJdks(),
        onChange() {
          dirty = true;
          schedulePreview();
        },
        onRenderRequested() {
          dirty = true;
          renderEditor();
          schedulePreview();
        },
        onSearchMainClass: () => void openMainClassPicker()
      });
      schedulePreview();
    }

    function render() {
      renderList();
      renderEditor();
      const hasDraft = Boolean(draft);
      ensureModal().querySelector("[data-run-duplicate]").disabled = !selectedId;
      ensureModal().querySelector("[data-run-delete]").disabled = !selectedId;
      ensureModal().querySelector("[data-run-apply]").disabled = !hasDraft;
      ensureModal().querySelector("[data-run-execute]").disabled = !hasDraft;
    }

    async function selectConfiguration(configurationId) {
      if (dirty && !await confirmDiscardChanges()) return;
      const configuration = deps.store.get(configurationId);
      if (!configuration) return;
      selectedId = configuration.id;
      draft = clone(configuration);
      dirty = false;
      render();
    }

    async function createNew() {
      if (dirty && !await confirmDiscardChanges()) return;
      const type = ensureModal().querySelector("[data-run-new-type]").value;
      selectedId = "";
      draft = deps.store.createDraft(type);
      draft.name = `New ${typeLabel(type)}`;
      dirty = true;
      render();
    }

    async function duplicateSelected() {
      if (!selectedId) return;
      const copy = await deps.store.duplicate(selectedId);
      if (copy) {
        selectedId = copy.id;
        draft = clone(copy);
        dirty = false;
        render();
      }
    }

    async function deleteSelected() {
      if (!selectedId) return;
      const confirmed = await confirmDeleteConfiguration(draft?.name);
      if (!confirmed) return;
      await deps.store.remove(selectedId);
      const next = deps.store.getActive() || deps.store.getSnapshot().configurations[0] || null;
      selectedId = next?.id || "";
      draft = next ? clone(next) : null;
      dirty = false;
      render();
    }

    async function schedulePreview() {
      const generation = ++previewGeneration;
      if (!draft) return;
      const result = await deps.launcher.preview(draft);
      if (generation !== previewGeneration || !editorControls) return;
      editorControls.showPreview(result.preview);
      editorControls.showErrors(result.validation?.errors);
    }

    async function applyDraft() {
      if (!draft) return null;
      const preview = await deps.launcher.preview(draft);
      editorControls?.showErrors(preview.validation?.errors);
      if (!preview.validation?.runnable) {
        setStatus("Fix the highlighted fields before applying.");
        return null;
      }
      const saved = await deps.store.upsert(draft);
      selectedId = saved.id;
      draft = clone(saved);
      dirty = false;
      setStatus("Configuration saved.");
      render();
      return saved;
    }

    async function executeDraft() {
      const saved = await applyDraft();
      if (!saved) return false;
      modal.hidden = true;
      return deps.launcher.runConfiguration(saved);
    }

    async function openMainClassPicker() {
      const projectPath = deps.store.getSnapshot().projectPath;
      const buildConfiguration = await deps.buildPath.loadConfiguration(projectPath);
      const sourceRoots = (buildConfiguration.sourceFolders || []).map((path) => deps.compiler.resolveStoredPath(projectPath, path));
      setStatus("Searching for main classes...");
      const classes = await deps.mainClassFinder.findAll(sourceRoots);
      setStatus("");
      const picker = document.createElement("div");
      picker.className = "reset-modal-overlay run-main-class-picker";
      picker.innerHTML = `<div class="reset-modal-box"><h3>Select Main Class</h3><input type="search" placeholder="Filter classes" data-run-main-filter><div data-run-main-results></div><div class="reset-modal-actions"><button type="button" class="reset-modal-btn reset-modal-cancel" data-run-main-cancel>Cancel</button></div></div>`;
      document.body.appendChild(picker);
      const results = picker.querySelector("[data-run-main-results]");
      const renderResults = (filter = "") => {
        const needle = filter.toLowerCase();
        results.innerHTML = classes.filter((item) => item.className.toLowerCase().includes(needle)).map((item) =>
          `<button type="button" data-run-main-value="${escapeHtml(item.className)}"><strong>${escapeHtml(item.className)}</strong><small>${escapeHtml(item.filePath)}</small></button>`
        ).join("") || "<p>No main classes found.</p>";
        results.querySelectorAll("[data-run-main-value]").forEach((button) => button.addEventListener("click", () => {
          draft.java.mainClass = button.dataset.runMainValue;
          dirty = true;
          picker.remove();
          renderEditor();
        }));
      };
      picker.querySelector("[data-run-main-filter]").addEventListener("input", (event) => renderResults(event.target.value));
      picker.querySelector("[data-run-main-cancel]").addEventListener("click", () => picker.remove());
      renderResults();
      picker.querySelector("[data-run-main-filter]").focus();
    }

    function setStatus(message) {
      const status = ensureModal().querySelector("[data-run-dialog-status]");
      if (status) status.textContent = message;
    }

    /**
     * Open the dialog in run or manage mode.
     * @param {object} options Initial selection and type.
     * @returns {boolean} Whether the dialog opened.
     */
    function open(options = {}) {
      ensureModal();
      const selected = deps.store.get(options.configurationId) || deps.store.getActive() || deps.store.getSnapshot().configurations[0] || null;
      if (selected) {
        selectedId = selected.id;
        draft = clone(selected);
        dirty = false;
      } else {
        selectedId = "";
        draft = deps.store.createDraft(options.initialType || "java-application");
        draft.name = `New ${typeLabel(draft.type)}`;
        dirty = true;
      }
      render();
      modal.hidden = false;
      modal.querySelector('[data-run-field="name"]')?.focus();
      return true;
    }

    /**
     * Open an unsaved Java Application configuration populated from a saved Java source file.
     * @param {object} options Detected main class and source-file context.
     * @returns {Promise<boolean>} Whether a new configuration draft was opened.
     */
    async function openNewJavaConfiguration(options = {}) {
      const className = String(options.className || "").trim();
      if (!className) return false;
      if (dirty && !await confirmDiscardChanges()) return false;

      ensureModal();
      const simpleName = String(options.simpleName || className.split(".").pop() || "Java Application").trim();
      selectedId = "";
      draft = deps.store.createDraft("java-application");
      draft.name = deps.store.createSequencedName(simpleName);
      draft.workingDirectory = deps.store.getSnapshot().projectPath;
      draft.java.mainClass = className;
      draft.java.modulePath = await resolveJavaModulePath(options.filePath);
      dirty = true;
      render();
      modal.hidden = false;
      modal.querySelector('[data-run-field="name"]')?.focus();
      return true;
    }

    async function close() {
      if (dirty && !await confirmDiscardChanges()) return false;
      if (modal) modal.hidden = true;
      dirty = false;
      return true;
    }

    const api = { close, open, openNewJavaConfiguration };
    app.registerModule?.("runConfigurationDialog", api);
    return api;
  }

  global.registerMarkdownViewerRunConfigurationDialog = registerMarkdownViewerRunConfigurationDialog;
})(typeof window !== "undefined" ? window : globalThis);
