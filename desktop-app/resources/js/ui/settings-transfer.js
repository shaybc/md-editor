(function(window) {
  "use strict";

  const SETTINGS_DOCUMENT_TYPE = "md-editor-settings";
  const SETTINGS_SCHEMA_VERSION = 1;
  const SETTINGS_EXPORT_FILE_NAME = "md-editor-settings.json";

  /**
   * Owns exporting and importing the user's MD-Editor preference state.
   * @param {object} app - Application module registry.
   * @param {object} deps - Runtime dependencies for storage, dialogs, and UI refresh.
   * @returns {object} Settings transfer actions and test helpers.
   */
  function registerMarkdownViewerSettingsTransfer(app, deps = {}) {
    function getDefaultState() {
      const state = typeof deps.getDefaultGlobalState === "function" ? deps.getDefaultGlobalState() : {};
      return state && typeof state === "object" && !Array.isArray(state) ? state : {};
    }

    function getSavedState() {
      const state = typeof deps.loadGlobalState === "function" ? deps.loadGlobalState() : {};
      return state && typeof state === "object" && !Array.isArray(state) ? state : {};
    }

    function getKnownPreferenceKeys() {
      return Object.keys(getDefaultState());
    }

    function copyKnownPreferenceValues(source) {
      const defaults = getDefaultState();
      const settings = Object.assign({}, defaults);
      const imported = source && typeof source === "object" && !Array.isArray(source) ? source : {};
      Object.keys(defaults).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(imported, key)) {
          settings[key] = imported[key];
        }
      });
      return settings;
    }

    /**
     * Build the v1 portable settings document.
     * @returns {object} A serializable settings export payload.
     */
    function buildSettingsExportPayload() {
      return {
        documentType: SETTINGS_DOCUMENT_TYPE,
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        app: "MD-Editor",
        exportedAt: new Date().toISOString(),
        settings: copyKnownPreferenceValues(Object.assign({}, getDefaultState(), getSavedState()))
      };
    }

    /**
     * Parse and validate a settings import file.
     * @param {string} text - JSON file contents.
     * @returns {object} Normalized settings object ready to persist.
     * @throws {Error} When the file is not a supported MD-Editor settings export.
     */
    function parseSettingsImportText(text) {
      let payload = null;
      try {
        payload = JSON.parse(String(text || ""));
      } catch (_error) {
        throw new Error("Choose a valid MD-Editor settings JSON file.");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Choose a valid MD-Editor settings JSON file.");
      }
      if (payload.documentType !== SETTINGS_DOCUMENT_TYPE) {
        throw new Error("This file is not an MD-Editor settings export.");
      }
      if (payload.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
        throw new Error("This settings export version is not supported.");
      }
      if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
        throw new Error("This settings export does not contain preferences.");
      }
      return copyKnownPreferenceValues(payload.settings);
    }

    function ensureJsonFileName(fileName) {
      const name = String(fileName || SETTINGS_EXPORT_FILE_NAME).trim() || SETTINGS_EXPORT_FILE_NAME;
      return /\.json$/i.test(name) ? name : `${name}.json`;
    }

    function isNeutralinoRuntime() {
      return typeof deps.NL_VERSION !== "undefined" && !!deps.Neutralino;
    }

    function isFilePickerAbort(error) {
      return error?.name === "AbortError" || error?.code === 20;
    }

    async function writeBrowserSettingsFile(content) {
      const fileName = SETTINGS_EXPORT_FILE_NAME;
      if (typeof window.showSaveFilePicker === "function" && deps.isFirefoxBrowser?.() !== true) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: "JSON files",
              accept: { "application/json": [".json"] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          return true;
        } catch (error) {
          if (isFilePickerAbort(error)) return false;
          throw error;
        }
      }
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      if (typeof deps.saveAs === "function") {
        deps.saveAs(blob, fileName);
        return true;
      }
      throw new Error("Saving settings files is not available in this browser.");
    }

    async function writeDesktopSettingsFile(content) {
      if (!deps.Neutralino?.os?.showSaveDialog || !deps.Neutralino?.filesystem?.writeFile) {
        throw new Error("Saving settings files requires desktop file access.");
      }
      const selectedPath = await deps.Neutralino.os.showSaveDialog("Export settings", {
        defaultPath: SETTINGS_EXPORT_FILE_NAME,
        filters: [{ name: "JSON files", extensions: ["json"] }]
      });
      if (!selectedPath) return false;
      await deps.Neutralino.filesystem.writeFile(ensureJsonFileName(selectedPath), content);
      return true;
    }

    /**
     * Export current preferences to a user-selected JSON file.
     * @returns {Promise<boolean>} True when a file was written.
     */
    async function exportSettingsFile() {
      const content = JSON.stringify(buildSettingsExportPayload(), null, 2) + "\n";
      if (isNeutralinoRuntime()) {
        return writeDesktopSettingsFile(content);
      }
      return writeBrowserSettingsFile(content);
    }

    function readBrowserFileWithInput() {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.style.display = "none";
        input.addEventListener("change", async () => {
          const file = input.files && input.files[0];
          input.remove();
          if (!file) {
            resolve(null);
            return;
          }
          try {
            resolve(await file.text());
          } catch (error) {
            reject(error);
          }
        }, { once: true });
        input.addEventListener("cancel", () => {
          input.remove();
          resolve(null);
        }, { once: true });
        document.body.append(input);
        input.click();
      });
    }

    async function readBrowserSettingsFile() {
      if (typeof window.showOpenFilePicker === "function" && deps.isFirefoxBrowser?.() !== true) {
        try {
          const handles = await window.showOpenFilePicker({
            multiple: false,
            types: [{
              description: "JSON files",
              accept: { "application/json": [".json"] }
            }]
          });
          const handle = Array.isArray(handles) ? handles[0] : null;
          if (!handle) return null;
          const file = await handle.getFile();
          return file.text();
        } catch (error) {
          if (isFilePickerAbort(error)) return null;
          throw error;
        }
      }
      return readBrowserFileWithInput();
    }

    async function readDesktopSettingsFile() {
      if (!deps.Neutralino?.os?.showOpenDialog || !deps.Neutralino?.filesystem?.readFile) {
        throw new Error("Importing settings files requires desktop file access.");
      }
      const selected = await deps.Neutralino.os.showOpenDialog("Import settings", {
        multiSelections: false,
        filters: [{ name: "JSON files", extensions: ["json"] }]
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return null;
      return deps.Neutralino.filesystem.readFile(selectedPath);
    }

    async function readSettingsFile() {
      if (isNeutralinoRuntime()) {
        return readDesktopSettingsFile();
      }
      return readBrowserSettingsFile();
    }

    async function replaceSettings(settings) {
      if (typeof deps.replaceGlobalState === "function") {
        await deps.replaceGlobalState(settings);
      } else {
        deps.localStorage?.setItem?.(deps.storageKey, JSON.stringify(settings));
        deps.scheduleGlobalProfileWrite?.();
      }
      await deps.refreshPreferences?.(settings);
    }

    /**
     * Import preferences from a selected JSON file and apply them immediately.
     * @returns {Promise<boolean>} True when settings were replaced.
     */
    async function importSettingsFile() {
      const text = await readSettingsFile();
      if (text === null || text === undefined) return false;
      const settings = parseSettingsImportText(text);
      await replaceSettings(settings);
      return true;
    }

    const api = {
      buildSettingsExportPayload,
      exportSettingsFile,
      importSettingsFile,
      parseSettingsImportText,
      _test: {
        copyKnownPreferenceValues,
        ensureJsonFileName,
        getKnownPreferenceKeys
      }
    };

    app.services.settingsTransfer = api;
    app.actions.exportSettingsFile = exportSettingsFile;
    app.actions.importSettingsFile = importSettingsFile;
    app.registerModule?.("settingsTransfer", api);

    return api;
  }

  window.registerMarkdownViewerSettingsTransfer = registerMarkdownViewerSettingsTransfer;
})(window);
