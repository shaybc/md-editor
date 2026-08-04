// Per-file opening mode preferences and settings UI.
(function(window) {
  "use strict";

  const SETTINGS_VERSION = 1;
  const ALLOWED_MODES = new Set(["editor", "split", "preview"]);
  const DEFAULT_STATE = Object.freeze({ version: SETTINGS_VERSION, modes: Object.freeze({}) });

  /**
   * Own per-file opening mode persistence, resolution, and settings-screen interactions.
   * @param {object} app - Application module registry.
   * @param {object} deps - Language registry, preference loader, and settings controls.
   * @returns {object} Opening-mode preference and settings actions.
   */
  function registerMarkdownViewerFileOpeningModeSettings(app, deps = {}) {
    const languageRegistry = deps.languageRegistry;
    const panel = deps.panel || document.getElementById("settings-file-opening-modes-panel");
    const rows = panel?.querySelector("#settings-file-opening-mode-rows") || null;
    const searchInput = panel?.querySelector("#settings-file-opening-mode-search") || null;
    const setAllInput = panel?.querySelector("#settings-file-opening-mode-set-all") || null;
    const setAllButton = panel?.querySelector("#settings-file-opening-mode-apply-all") || null;
    const restoreButton = panel?.querySelector("#settings-file-opening-mode-restore") || null;
    const emptyMessage = panel?.querySelector("#settings-file-opening-mode-empty") || null;
    const supportedExtensionsInput = deps.supportedExtensionsInput || document.getElementById("settings-supported-text-extensions");
    let draft = normalizeState(DEFAULT_STATE);
    let committedState = normalizeState(DEFAULT_STATE);
    let definitions = [];

    function normalizeState(value) {
      const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const sourceModes = source.modes && typeof source.modes === "object" && !Array.isArray(source.modes)
        ? source.modes
        : {};
      const modes = {};
      Object.entries(sourceModes).forEach(function([key, mode]) {
        const normalizedKey = String(key || "").trim().toLowerCase();
        const isKnownKey = normalizedKey === "untitled"
          || normalizedKey === "other"
          || /^(extension|special):[a-z0-9+_.-]+$/.test(normalizedKey);
        if (isKnownKey && ALLOWED_MODES.has(mode)) modes[normalizedKey] = mode;
      });
      return { version: SETTINGS_VERSION, modes };
    }

    function cloneState(value) {
      const normalized = normalizeState(value);
      return { version: normalized.version, modes: { ...normalized.modes } };
    }

    function getSavedState() {
      const state = typeof deps.loadGlobalState === "function" ? deps.loadGlobalState() : {};
      return normalizeState(state?.fileOpeningModes);
    }

    function getDefinitions() {
      return languageRegistry.getOpeningModeFileTypes(supportedExtensionsInput?.value || "");
    }

    function getModeForDefinition(definition, state = draft) {
      return state.modes[definition.key] || definition.defaultMode;
    }

    function setDraftMode(definition, mode) {
      if (!ALLOWED_MODES.has(mode)) return;
      if (mode === definition.defaultMode) delete draft.modes[definition.key];
      else draft.modes[definition.key] = mode;
    }

    function createModeSelect(definition) {
      const select = document.createElement("select");
      select.className = "rename-modal-input settings-select-input settings-file-opening-mode-select";
      select.dataset.openingModeKey = definition.key;
      select.setAttribute("aria-label", `Opening mode for ${definition.label}`);
      [
        ["editor", "Editor"],
        ["split", "Split"],
        ["preview", "Preview"]
      ].forEach(function([value, label]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      select.value = getModeForDefinition(definition);
      select.addEventListener("change", function() {
        setDraftMode(definition, select.value);
      });
      return select;
    }

    function createRow(definition) {
      const row = document.createElement("div");
      row.className = "settings-file-opening-mode-row";
      row.dataset.openingModeSearch = `${definition.label} ${definition.languageLabel}`.toLowerCase();

      const identity = document.createElement("span");
      identity.className = "settings-file-opening-mode-identity";
      const label = document.createElement("strong");
      label.textContent = definition.label;
      const language = document.createElement("small");
      language.textContent = definition.languageLabel;
      identity.append(label, language);
      row.append(identity, createModeSelect(definition));
      return row;
    }

    function applySearch() {
      const query = String(searchInput?.value || "").trim().toLowerCase();
      let visibleCount = 0;
      Array.from(rows?.children || []).forEach(function(row) {
        const isVisible = !query || String(row.dataset.openingModeSearch || "").includes(query);
        row.hidden = !isVisible;
        if (isVisible) visibleCount += 1;
      });
      if (emptyMessage) emptyMessage.hidden = visibleCount !== 0;
    }

    function render() {
      if (!rows || !languageRegistry?.getOpeningModeFileTypes) return;
      definitions = getDefinitions();
      rows.replaceChildren(...definitions.map(createRow));
      applySearch();
    }

    function open() {
      committedState = cloneState(getSavedState());
      draft = cloneState(committedState);
      if (searchInput) searchInput.value = "";
      render();
    }

    function discard() {
      draft = cloneState(getSavedState());
    }

    function restoreDefaults() {
      draft = cloneState(DEFAULT_STATE);
      render();
    }

    function setAll() {
      const mode = setAllInput?.value || "editor";
      if (!ALLOWED_MODES.has(mode)) return;
      definitions.forEach(function(definition) {
        setDraftMode(definition, mode);
      });
      render();
    }

    function commit(value) {
      committedState = cloneState(value);
    }

    /**
     * Resolve the saved default for a source without changing any open tab.
     * @param {object|null} sourceFile - Newly opened source descriptor, or null for Untitled.
     * @returns {"editor"|"split"|"preview"} Saved or built-in opening mode.
     */
    function resolveModeForSource(sourceFile) {
      const definition = languageRegistry.classifyOpeningModeSource(sourceFile);
      const rawState = typeof deps.loadGlobalState === "function" ? deps.loadGlobalState() : {};
      if (rawState && Object.prototype.hasOwnProperty.call(rawState, "fileOpeningModes")) {
        committedState = normalizeState(rawState.fileOpeningModes);
      }
      return getModeForDefinition(definition, committedState);
    }

    searchInput?.addEventListener("input", applySearch);
    setAllButton?.addEventListener("click", setAll);
    restoreButton?.addEventListener("click", restoreDefaults);
    supportedExtensionsInput?.addEventListener("input", render);

    const api = {
      DEFAULT_STATE,
      commit,
      discard,
      getDraft: function() { return cloneState(draft); },
      normalizeState,
      open,
      render,
      resolveModeForSource,
      restoreDefaults,
      setAll
    };
    app.registerModule?.("fileOpeningModeSettings", api);
    return api;
  }

  window.registerMarkdownViewerFileOpeningModeSettings = registerMarkdownViewerFileOpeningModeSettings;
})(window);
