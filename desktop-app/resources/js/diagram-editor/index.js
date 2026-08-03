(function(global) {
  "use strict";

  global.registerMarkdownViewerDiagramEditor = function registerMarkdownViewerDiagramEditor(app, deps) {
    const format = global.MarkdownViewerDiagramFormat;
    const bridgeModule = global.MarkdownViewerDiagramBridge;
    const viewModule = global.MarkdownViewerDiagramView;
    const exportModule = global.MarkdownViewerDiagramExport;
    const controllers = new Map();

    /**
     * Write a draw.io bridge lifecycle event through the application debug logger.
     * @param {object} tab - Diagram tab owning the bridge.
     * @param {object} event - Bridge lifecycle event.
     */
    function logBridgeLifecycle(tab, event) {
      if (!deps.log) return;
      void deps.log(event.level || "info", `[diagram-editor] bridge ${event.phase}`, {
        tabId: tab.id,
        title: tab.sourceFileName || tab.title,
        ...event
      });
    }

    function notifyChanged(tab) {
      deps.onDiagramStateChanged?.(tab);
    }

    function updateXml(tab, xml, markDirty) {
      tab.diagramXml = String(xml || "");
      if (markDirty) tab.diagramDirty = tab.diagramXml !== String(tab.diagramSavedXml || "");
      notifyChanged(tab);
    }

    async function chooseSaveDestination(tab) {
      const suggestedName = tab.sourceFileName || `${format.fileStem(tab.title)}.drawio`;
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
        const path = await deps.Neutralino.os.showSaveDialog("Save Diagram", { defaultPath: suggestedName });
        if (!path) return null;
        const normalizedPath = /\.(drawio|xml)$/i.test(path) ? path : `${path}.drawio`;
        return { path: normalizedPath, name: normalizedPath.split(/[\\/]/).pop() };
      }
      if (typeof global.showSaveFilePicker === "function") {
        const handle = await global.showSaveFilePicker({
          suggestedName,
          types: [{ description: "Draw.io diagram", accept: { "application/xml": [".drawio", ".xml"] } }]
        });
        return { handle, name: handle.name };
      }
      return { name: suggestedName, download: true };
    }

    async function writeDiagram(tab, destination) {
      const xml = controllers.get(tab.id)?.bridge.getXml() || tab.diagramXml || format.createBlankDiagramXml();
      if (destination.path) await deps.Neutralino.filesystem.writeFile(destination.path, xml);
      else if (destination.handle) {
        const writable = await destination.handle.createWritable();
        await writable.write(xml);
        await writable.close();
      } else {
        deps.saveAs(new Blob([xml], { type: "application/xml;charset=utf-8" }), destination.name);
      }
      tab.diagramXml = xml;
      tab.diagramSavedXml = xml;
      tab.diagramDirty = false;
      tab.sourceFileName = destination.name;
      tab.sourceFilePath = destination.path || null;
      tab.sourceFileHandle = destination.handle || null;
      tab.title = destination.name;
      tab.openedSource = { name: destination.name, path: destination.path || null, kind: "diagram-editor" };
      deps.suppressFolderWatcher?.(1000);
      notifyChanged(tab);
      return true;
    }

    async function saveTabAs(tab) {
      if (!tab || tab.type !== "diagram-editor") return false;
      let destination;
      try {
        destination = await chooseSaveDestination(tab);
      } catch (error) {
        if (error?.name === "AbortError") return false;
        throw error;
      }
      return destination ? writeDiagram(tab, destination) : false;
    }

    async function saveTab(tab) {
      if (!tab || tab.type !== "diagram-editor") return false;
      if (tab.sourceFilePath) return writeDiagram(tab, { path: tab.sourceFilePath, name: tab.sourceFileName || tab.sourceFilePath.split(/[\\/]/).pop() });
      if (tab.sourceFileHandle) return writeDiagram(tab, { handle: tab.sourceFileHandle, name: tab.sourceFileName || tab.sourceFileHandle.name });
      return saveTabAs(tab);
    }

    async function runAction(controller, action) {
      controller.view.setBusy(true);
      controller.view.setStatus(action.startsWith("export") ? "Exporting?" : "Saving?");
      try {
        if (action === "save") await saveTab(controller.tab);
        else if (action === "save-as") await saveTabAs(controller.tab);
        else if (action === "export-png") await exportModule.exportPng(controller, { ...deps, format });
        else if (action === "export-pdf") await exportModule.exportPdf(controller, { ...deps, format });
        controller.view.setStatus(controller.tab.diagramDirty ? "Unsaved changes" : "Saved");
        return true;
      } catch (error) {
        console.error(`Diagram Editor ${action} failed:`, error);
        controller.view.setStatus(error.message || "Action failed", true);
        deps.alert?.(error.message || "The Diagram Editor action failed.");
        return false;
      } finally {
        controller.view.setBusy(false);
      }
    }

    function mountDiagramTab(tab, root) {
      let controller = controllers.get(tab.id);
      if (controller) {
        if (!root.contains(controller.view.shell)) root.appendChild(controller.view.shell);
        return controller;
      }
      const view = viewModule.createView(root, { onAction: (action) => void runAction(controller, action) });
      controller = { tab, view, bridge: null };
      controller.bridge = bridgeModule.createBridge(view.iframe, {
        xml: tab.diagramXml || format.createBlankDiagramXml(),
        title: tab.sourceFileName || tab.title,
        onLifecycle(event) { logBridgeLifecycle(tab, event); },
        onReady() { view.setStatus(tab.diagramDirty ? "Unsaved changes" : "Ready"); },
        onFailure(error) {
          view.setStatus(error.message, true);
          deps.alert?.(error.message);
        },
        onChange(xml) {
          updateXml(tab, xml, true);
          view.setStatus(tab.diagramDirty ? "Unsaved changes" : "Saved");
        },
        onSave(xml) {
          updateXml(tab, xml, true);
          void saveTab(tab);
        }
      });
      controllers.set(tab.id, controller);
      return controller;
    }

    function destroyDiagramTab(tabId) {
      const controller = controllers.get(tabId);
      if (!controller) return;
      controller.bridge.dispose();
      controller.view.shell.remove();
      controllers.delete(tabId);
    }

    function createSource(source, xml) {
      return {
        name: source?.name || source?.file?.name || source?.handle?.name || "Untitled Diagram.drawio",
        path: source?.path || source?.fullPath || null,
        handle: source?.handle || null,
        xml: String(xml || source?.content || "")
      };
    }

    function hasUnsavedChanges(tab) {
      return tab?.type === "diagram-editor" && tab.diagramDirty === true;
    }

    /**
     * Export the active Diagram Editor tab through its mounted offline editor.
     * @param {object} tab - Diagram tab to export.
     * @param {"png"|"pdf"} exportFormat - Requested output format.
     * @returns {Promise<boolean>} Whether the export completed successfully.
     */
    async function exportTab(tab, exportFormat) {
      if (tab?.type !== "diagram-editor" || !["png", "pdf"].includes(exportFormat)) return false;
      const controller = controllers.get(tab.id);
      if (!controller) return false;
      return runAction(controller, `export-${exportFormat}`);
    }

    const api = {
      mountDiagramTab,
      destroyDiagramTab,
      saveTab,
      saveTabAs,
      hasUnsavedChanges,
      exportTab,
      getXml(tab) { return controllers.get(tab?.id)?.bridge.getXml() || tab?.diagramXml || ""; },
      createSource,
      createBlankXml: format.createBlankDiagramXml,
      isDiagramPath: format.isDiagramPath,
      isDiagramCandidatePath: format.isDiagramCandidatePath,
      looksLikeDiagramXml: format.looksLikeDiagramXml,
      validateDiagramXml: format.parseDiagramXml
    };
    app.services.diagramEditor = api;
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
