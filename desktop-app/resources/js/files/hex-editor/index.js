// Managed-tab orchestration for the built-in hex editor.
(function(global) {
  "use strict";

  global.registerMarkdownViewerHexEditor = function registerMarkdownViewerHexEditor(app, deps) {
    const namespace = global.MarkdownViewerHexEditor;
    const views = new Map();
    const EDITABLE_FILE_LIMIT = 10 * 1024 * 1024;

    async function createView(tab, root) {
      const sourceDescriptor = tab.hexEditorSource || {
        name: tab.sourceFileName,
        path: tab.sourceFilePath,
        handle: tab.sourceFileHandle,
        size: tab.hexEditorState?.size || 0
      };
      const source = namespace.createBinarySource(sourceDescriptor, deps);
      let metadata;
      try {
        metadata = await source.refreshMetadata();
      } catch (error) {
        root.innerHTML = `<div class="hex-editor-missing"><h2>Binary file unavailable</h2><p></p></div>`;
        root.querySelector("p").textContent = error?.message || "The source file could not be read.";
        tab.missingSource = true;
        return null;
      }
      tab.missingSource = false;
      tab.hexEditorState = { ...(tab.hexEditorState || {}), size: metadata.size, modifiedAt: metadata.modifiedAt };
      const model = metadata.size <= EDITABLE_FILE_LIMIT
        ? new namespace.HexDocumentModel(await source.readAll())
        : null;
      const view = new namespace.HexEditorView({
        tab,
        root,
        source,
        model,
        onSave: () => saveHexEditorTab(tab),
        onSaveAs: () => saveHexEditorTab(tab, { saveAs: true }),
        onStateChanged: () => deps.onHexEditorStateChanged?.(tab)
      });
      views.set(tab.id, view);
      if (Number(tab.hexEditorState?.scrollTop) > 0) {
        view.scroll.scrollTop = Number(tab.hexEditorState.scrollTop);
        view.renderVisibleRows();
      }
      return view;
    }

    /**
     * Mount a hex editor into an existing managed tab root.
     * @param {object} tab - Hex-editor tab descriptor.
     * @param {HTMLElement} root - Managed tab view root.
     * @returns {Promise<object|null>} Mounted view or a missing-source state.
     */
    async function mountHexEditorTab(tab, root) {
      if (!tab?.id || !root) return null;
      destroyHexEditorTab(tab.id);
      return createView(tab, root);
    }

    function destroyHexEditorTab(tabId) {
      const view = views.get(tabId);
      if (!view) return;
      view.destroy();
      views.delete(tabId);
    }

    function hasUnsavedChanges(tab) {
      return views.get(tab?.id)?.model?.isDirty === true || tab?.hexEditorDirty === true;
    }

    function getPersistedViewState(tab) {
      const view = views.get(tab?.id);
      return view ? { ...view.tab.hexEditorState } : { ...(tab?.hexEditorState || {}) };
    }

    async function writeSaveAs(tab, bytes) {
      const suggestedName = tab.sourceFileName || tab.title || "binary.bin";
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog && deps.Neutralino?.filesystem?.writeBinaryFile) {
        const destination = await deps.Neutralino.os.showSaveDialog("Save binary file", { defaultPath: suggestedName });
        if (!destination) return false;
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        await deps.Neutralino.filesystem.writeBinaryFile(destination, buffer);
        return { path: destination, name: destination.split(/[\\/]/).pop() || suggestedName };
      }
      if (global.showSaveFilePicker) {
        const handle = await global.showSaveFilePicker({ suggestedName });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return { handle, name: handle.name || suggestedName };
      }
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      if (typeof deps.saveAs === "function") {
        deps.saveAs(blob, suggestedName);
        return { downloadOnly: true, name: suggestedName };
      }
      return false;
    }

    async function saveEditableCopy(tab, view) {
      const savedSource = await writeSaveAs(tab, view.model.bytes);
      if (!savedSource) return false;
      if (!savedSource.downloadOnly) {
        const metadataSource = namespace.createBinarySource(savedSource, deps);
        const metadata = await metadataSource.refreshMetadata();
        view.source = metadataSource;
        view.metadata = metadata;
        tab.sourceFileName = savedSource.name || tab.sourceFileName;
        tab.sourceFilePath = savedSource.path || null;
        tab.sourceFileHandle = savedSource.handle || null;
        tab.hexEditorSource = { ...savedSource, ...metadata };
        tab.openedSource = {
          ...(tab.openedSource || {}),
          name: tab.sourceFileName,
          path: tab.sourceFilePath,
          kind: "hex-editor"
        };
        tab.hexEditorState = { ...(tab.hexEditorState || {}), ...metadata };
      }
      view.model.markSaved();
      tab.hexEditorDirty = false;
      view.updateState();
      deps.onHexEditorStateChanged?.(tab);
      return true;
    }

    async function saveReadOnlyCopy(tab, view) {
      const suggestedName = tab.sourceFileName || tab.title || "binary.bin";
      if (typeof deps.NL_VERSION !== "undefined" && view.source.path &&
          deps.Neutralino?.os?.showSaveDialog && deps.Neutralino?.filesystem?.copy) {
        const destination = await deps.Neutralino.os.showSaveDialog("Save binary file", { defaultPath: suggestedName });
        if (!destination) return false;
        await deps.Neutralino.filesystem.copy(view.source.path, destination, { overwrite: true });
        return true;
      }
      const sourceDescriptor = tab.hexEditorSource || {};
      const file = sourceDescriptor.file || (sourceDescriptor.handle?.getFile ? await sourceDescriptor.handle.getFile() : null);
      if (file && typeof deps.saveAs === "function") {
        deps.saveAs(file, suggestedName);
        return true;
      }
      deps.alert?.("Save As for large binary files requires a desktop path or browser file handle.");
      return false;
    }

    async function saveHexEditorTab(tab, options = {}) {
      const view = views.get(tab?.id);
      if (!view) return false;
      if (!view.model) {
        return options.saveAs === true ? saveReadOnlyCopy(tab, view) : false;
      }
      try {
        if (options.saveAs === true || !view.source.canWrite()) {
          return await saveEditableCopy(tab, view);
        }
        const openedMetadata = {
          size: Number(tab.hexEditorState?.size || 0),
          modifiedAt: Number(tab.hexEditorState?.modifiedAt || 0)
        };
        const currentMetadata = await view.source.refreshMetadata();
        const changedExternally = currentMetadata.size !== openedMetadata.size ||
          (openedMetadata.modifiedAt && currentMetadata.modifiedAt !== openedMetadata.modifiedAt);
        if (changedExternally) {
          const reload = global.confirm(
            "This file changed on disk after the hex editor opened it. Press OK to reload it and discard hex edits, or Cancel for overwrite and Save As choices."
          );
          if (reload) {
            await mountHexEditorTab(tab, view.root);
            deps.onHexEditorStateChanged?.(tab);
            return false;
          }
          const overwrite = global.confirm("Press OK to overwrite the changed file, or Cancel to use Save As.");
          if (!overwrite) return saveEditableCopy(tab, view);
        }
        const savedMetadata = await view.source.writeAll(view.model.bytes);
        view.model.markSaved();
        tab.hexEditorState = { ...(tab.hexEditorState || {}), ...savedMetadata };
        tab.hexEditorDirty = false;
        view.updateState();
        deps.onHexEditorStateChanged?.(tab);
        return true;
      } catch (error) {
        console.error("Failed to save binary file:", error);
        deps.alert?.(error?.message || "Unable to save this binary file.");
        return false;
      }
    }

    function openSource(source, options = {}) {
      return deps.openHexEditorInTab?.(source, options.title || source?.name, options) || null;
    }

    const api = {
      EDITABLE_FILE_LIMIT,
      openSource,
      mountHexEditorTab,
      destroyHexEditorTab,
      hasUnsavedChanges,
      saveHexEditorTab,
      getPersistedViewState,
      getView(tabId) {
        return views.get(tabId) || null;
      }
    };
    app.services.hexEditor = api;
    app.registerModule?.("hexEditor", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
