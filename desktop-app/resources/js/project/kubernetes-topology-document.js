// Save and reopen Kubernetes topology graph documents.
(function(global) {
  "use strict";

  function registerMarkdownViewerKubernetesTopologyDocument(app, deps = {}) {
    const DOCUMENT_TYPE = "kubernetes-topology-view";
    const FILE_EXTENSION = ".mdviewer-k8s-topology.json";
    const SCHEMA_VERSION = 1;

    function getFileName(path) {
      return deps.getFileName ? deps.getFileName(path) : String(path || "").split(/[\\/]/).pop();
    }

    function sanitizeFileName(value) {
      const cleaned = String(value || "kubernetes-topology").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").replace(/^\.+$/, "");
      return cleaned || "kubernetes-topology";
    }

    function isKubernetesTopologyFilePath(path) {
      return /\.mdviewer-k8s-topology\.json$/i.test(path || "");
    }

    function getTopologyTitleFromFileName(name) {
      return String(name || "Kubernetes Topology").replace(/\.mdviewer-k8s-topology\.json$/i, "") || "Kubernetes Topology";
    }

    function getSuggestedTopologyFileName(tab) {
      const commandName = tab?.kubernetesTopology?.result?.commandName || tab?.kubernetesTopology?.result?.tool || tab?.title || "kubernetes-topology";
      return `${sanitizeFileName(commandName)}${FILE_EXTENSION}`;
    }

    function normalizeGraph(graph) {
      return {
        schemaVersion: Number(graph?.schemaVersion || SCHEMA_VERSION) || SCHEMA_VERSION,
        nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
        edges: Array.isArray(graph?.edges) ? graph.edges : [],
        warnings: Array.isArray(graph?.warnings) ? graph.warnings : [],
        sourceRefs: Array.isArray(graph?.sourceRefs) ? graph.sourceRefs : []
      };
    }

    function normalizeLayout(layout) {
      const source = layout && typeof layout === "object" ? layout : {};
      const positions = {};
      Object.entries(source.positions || {}).forEach(([nodeId, position]) => {
        const x = Number(position?.x);
        const y = Number(position?.y);
        if (nodeId && Number.isFinite(x) && Number.isFinite(y)) positions[nodeId] = { x, y };
      });
      const viewport = source.viewport && typeof source.viewport === "object" ? {
        scale: Number(source.viewport.scale) || 1,
        offsetX: Number(source.viewport.offsetX) || 0,
        offsetY: Number(source.viewport.offsetY) || 0
      } : null;
      return viewport ? { positions, viewport } : { positions };
    }

    function getCommandSummary(result) {
      if (!result || typeof result !== "object") return null;
      return {
        tool: result.tool || "",
        commandName: result.commandName || "",
        command: result.command || "",
        exitCode: Number.isFinite(Number(result.exitCode)) ? Number(result.exitCode) : null,
        durationMs: Number.isFinite(Number(result.durationMs)) ? Number(result.durationMs) : null,
        contextSummary: result.contextSummary || null
      };
    }

    function serializeKubernetesTopologyTab(tab) {
      const graph = normalizeGraph(tab?.kubernetesTopology?.graph || tab?.kubernetesTopologyDocument?.topology || null);
      const result = tab?.kubernetesTopology?.result || tab?.kubernetesTopologyDocument?.commandSummary || null;
      return {
        documentType: DOCUMENT_TYPE,
        schemaVersion: SCHEMA_VERSION,
        title: tab?.title || "Kubernetes Topology",
        savedAt: new Date().toISOString(),
        topology: graph,
        layout: normalizeLayout(tab?.kubernetesTopologyLayout || tab?.kubernetesTopologyDocument?.layout || null),
        sourceRefs: Array.isArray(graph.sourceRefs) ? graph.sourceRefs : [],
        commandSummary: getCommandSummary(result),
        manifestSnapshot: tab?.kubernetesTopology?.manifestContent || tab?.kubernetesTopology?.renderedYaml || result?.manifestContent || result?.renderedYaml || ""
      };
    }

    function validateKubernetesTopologyDocument(document) {
      if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("The selected topology file is not a valid document.");
      if (document.documentType !== DOCUMENT_TYPE) throw new Error("The selected JSON file is not an MD-Editor Kubernetes topology document.");
      if (!document.topology || typeof document.topology !== "object") throw new Error("The topology document does not contain graph data.");
      if (!Array.isArray(document.topology.nodes) || !Array.isArray(document.topology.edges)) throw new Error("The topology document graph is incomplete.");
      return true;
    }

    function deserializeKubernetesTopologyDocument(document) {
      validateKubernetesTopologyDocument(document);
      const graph = normalizeGraph(document.topology);
      return {
        title: document.title || "Kubernetes Topology",
        graph,
        layout: normalizeLayout(document.layout || null),
        sourceRefs: Array.isArray(document.sourceRefs) ? document.sourceRefs : graph.sourceRefs,
        result: document.commandSummary || null,
        manifestContent: document.manifestSnapshot || "",
        document
      };
    }

    function getSaveDialogSelectedPath(selection) {
      if (!selection) return "";
      if (typeof selection === "string") return selection;
      if (Array.isArray(selection)) return getSaveDialogSelectedPath(selection[0]);
      if (typeof selection === "object") return selection.path || selection.filePath || selection.file || selection.name || "";
      return "";
    }

    function normalizeSavePath(selectedPath) {
      const path = String(selectedPath || "").trim();
      if (!path) return "";
      return isKubernetesTopologyFilePath(path) ? path : `${path}${FILE_EXTENSION}`;
    }

    async function updateFolderTreeAfterSave(metadata) {
      if (!metadata) return;
      try {
        await app?.modules?.sidebarContextTree?.updateSavedGraphFileInFolderTree?.(metadata);
      } catch (_) {}
    }

    function updateTabAfterSave(tab, metadata) {
      if (!tab) return;
      if (metadata?.name) {
        tab.sourceFileName = metadata.name;
        tab.title = getTopologyTitleFromFileName(metadata.name);
      }
      if (metadata?.handle) tab.sourceFileHandle = metadata.handle;
      if (metadata?.path) tab.sourceFilePath = metadata.path;
      tab.kubernetesTopologyDocument = serializeKubernetesTopologyTab(tab);
      tab.kubernetesTopologyDirty = false;
      deps.setTabOpenedSource?.(tab, {
        path: metadata?.path || null,
        name: metadata?.name || tab.sourceFileName || null,
        kind: "kubernetes-topology-file"
      });
      deps.saveTabsToStorage?.(deps.tabs || []);
      deps.renderTabBar?.(deps.tabs || [], deps.activeTabId);
      deps.updateSaveCurrentFileButtons?.();
    }

    async function writeTopologyFile(path, content) {
      await deps.Neutralino.filesystem.writeFile(path, content);
    }

    async function writeTopologyWithSaveDialog(content, suggestedName) {
      if (typeof deps.NL_VERSION !== "undefined" && deps.Neutralino?.os?.showSaveDialog) {
        const defaultPath = deps.activeFolderPath && deps.joinPath ? deps.joinPath(deps.activeFolderPath, suggestedName) : suggestedName;
        const selectedPath = await deps.Neutralino.os.showSaveDialog("Save Kubernetes Topology", {
          defaultPath,
          filters: [{ name: "MD-Editor Kubernetes topology", extensions: ["json"] }]
        });
        const finalPath = normalizeSavePath(getSaveDialogSelectedPath(selectedPath));
        if (!finalPath) return null;
        await writeTopologyFile(finalPath, content);
        const metadata = { name: getFileName(finalPath), path: finalPath };
        await updateFolderTreeAfterSave(metadata);
        return metadata;
      }
      if (typeof global.showSaveFilePicker === "function" && !deps.isFirefoxBrowser?.()) {
        const handle = await global.showSaveFilePicker({
          suggestedName,
          types: [{ description: "MD-Editor Kubernetes topology", accept: { "application/json": [".json"] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        const metadata = { name: handle.name, handle };
        await updateFolderTreeAfterSave(metadata);
        return metadata;
      }
      deps.saveAs?.(new Blob([content], { type: "application/json;charset=utf-8" }), suggestedName);
      return { name: suggestedName };
    }

    async function saveKubernetesTopologyTabToSource(tab) {
      if (!tab || (!tab.sourceFileHandle && !tab.sourceFilePath)) return false;
      const content = JSON.stringify(serializeKubernetesTopologyTab(tab), null, 2);
      if (tab.sourceFileHandle?.createWritable) {
        const writable = await tab.sourceFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        updateTabAfterSave(tab, { name: tab.sourceFileHandle.name || tab.sourceFileName, handle: tab.sourceFileHandle });
        return true;
      }
      if (typeof deps.NL_VERSION !== "undefined" && tab.sourceFilePath) {
        await writeTopologyFile(tab.sourceFilePath, content);
        updateTabAfterSave(tab, { name: getFileName(tab.sourceFilePath), path: tab.sourceFilePath });
        return true;
      }
      return false;
    }

    async function saveKubernetesTopologyTabWithSaveDialog(tab) {
      if (!tab) return false;
      const content = JSON.stringify(serializeKubernetesTopologyTab(tab), null, 2);
      const metadata = await writeTopologyWithSaveDialog(content, getSuggestedTopologyFileName(tab));
      if (!metadata) return false;
      updateTabAfterSave(tab, metadata);
      return true;
    }

    async function readSourceContent(source) {
      if (source.content !== undefined) return source.content;
      if (typeof deps.NL_VERSION !== "undefined" && source.path) return deps.Neutralino.filesystem.readFile(source.path);
      let file = source.file || null;
      if (!file && source.handle) file = await source.handle.getFile();
      if (!file) throw new Error("No readable Kubernetes topology file was provided.");
      return file.text();
    }

    async function openSavedKubernetesTopologyDocument(source, options = {}) {
      if (!source) return null;
      const name = source.name || getFileName(source.path) || "Kubernetes Topology";
      let parsed;
      try {
        parsed = JSON.parse(await readSourceContent(source));
      } catch (_error) {
        throw new Error("The selected Kubernetes topology file is not valid JSON.");
      }
      const restored = deserializeKubernetesTopologyDocument(parsed);
      const tab = deps.openKubernetesTopologyInTab?.(restored.graph, restored.result, {
        title: getTopologyTitleFromFileName(name) || restored.title,
        layout: restored.layout,
        document: restored.document,
        sourceFilePath: source.path || null,
        sourceFileHandle: source.handle || null,
        sourceFileName: name,
        manifestContent: restored.manifestContent,
        temporary: options.temporary === true,
        pinExisting: options.pinExisting
      });
      if (tab) {
        tab.kubernetesTopologyDirty = false;
        deps.saveTabsToStorage?.(deps.tabs || []);
      }
      return tab || null;
    }

    const api = {
      DOCUMENT_TYPE,
      FILE_EXTENSION,
      isKubernetesTopologyFilePath,
      serializeKubernetesTopologyTab,
      deserializeKubernetesTopologyDocument,
      validateKubernetesTopologyDocument,
      saveKubernetesTopologyTabToSource,
      saveKubernetesTopologyTabWithSaveDialog,
      openSavedKubernetesTopologyDocument
    };
    app?.registerModule?.("kubernetesTopologyDocument", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesTopologyDocument = registerMarkdownViewerKubernetesTopologyDocument;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKubernetesTopologyDocument };
})(typeof window !== "undefined" ? window : globalThis);
