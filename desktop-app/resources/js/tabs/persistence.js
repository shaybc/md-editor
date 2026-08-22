(function(global) {
  global.registerMarkdownViewerTabPersistence = function registerMarkdownViewerTabPersistence(app, deps) {
    const SESSION_VERSION = 2;
    const DRAFT_ROOT = "drafts";
    const DRAFT_EXTENSIONS = {
      markdown: ".md",
      graph: ".mdviewer-graph.json",
      report: ".mdviewer-graph.json",
      "kubernetes-topology": ".mdviewer-k8s-topology.json",
      "image-editor": ".mdimage",
      "diagram-editor": ".drawio",
      file: ".txt"
    };
    const DRAFT_WRITE_CHUNK_SIZE = 256 * 1024;
    const RESTORABLE_TOOL_TAB_TYPES = new Set(["base64-tool", "certificate-decoder", "jwt-tool", "json-yaml-tool", "jsonpath-tool", "xpath-tool", "uuid-tool", "qr-tool", "hash-tool", "json-array-table-tool", "text-escape-tool", "unicode-tool", "string-bytes-tool", "database-connection-string-tool"]);

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/");
    }

    function normalizeContent(value) {
      return typeof deps.normalizeEditorContent === "function"
        ? deps.normalizeEditorContent(value)
        : String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    function getFileName(path) {
      return typeof deps.getFileName === "function"
        ? deps.getFileName(path)
        : normalizePath(path).split("/").pop() || "";
    }

    function clone(value) {
      if (value === undefined) return undefined;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return value;
      }
    }

    function hasSourcePath(tab) {
      return !!normalizePath(tab?.sourceFilePath || tab?.openedSource?.path || "");
    }

    function getOpenedSource(tab, fallbackKind) {
      const source = tab?.openedSource && typeof tab.openedSource === "object" ? tab.openedSource : {};
      const path = normalizePath(source.path || tab?.sourceFilePath || "");
      const name = String(source.name || tab?.sourceFileName || (path ? getFileName(path) : tab?.title || "") || "").trim();
      const kind = String(source.kind || fallbackKind || tab?.type || "unknown").trim();
      return (path || name) ? { path: path || null, name: name || null, kind } : null;
    }

    function getMarkdownContent(tab) {
      const isActive = tab?.id && tab.id === deps.activeTabId;
      if (isActive && deps.activeEditorCommands?.getActiveEditorValue) {
        return normalizeContent(deps.activeEditorCommands.getActiveEditorValue());
      }
      return normalizeContent(tab?.content || "");
    }

    function isDirtyMarkdownTab(tab) {
      if (tab?.isNewUnsavedFile === true) return true;
      const content = getMarkdownContent(tab);
      return normalizeContent(tab?.savedContent || "") !== content;
    }

    function isDraftMarkdownTab(tab) {
      return !hasSourcePath(tab) || isDirtyMarkdownTab(tab);
    }

    function isGraphTabDirty(tab) {
      if (!tab || tab.type !== "graph") return false;
      const isFileBacked = typeof deps.isFileBackedGraphTab === "function" && deps.isFileBackedGraphTab(tab);
      return !isFileBacked || tab.graphHasUnsavedChanges === true;
    }

    function shouldPersistGraphViewLayout(graphLayout) {
      return !!(graphLayout && typeof graphLayout === "object" && graphLayout.magneticEnabled === false);
    }

    function createDescriptorBase(tab, type) {
      return {
        schemaVersion: SESSION_VERSION,
        id: tab?.id || `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        title: tab?.title || tab?.folderName || "Untitled",
        createdAt: Number(tab?.createdAt || Date.now()),
        isTemporary: tab?.isTemporary === true,
        viewMode: tab?.viewMode || (type === "graph" || type === "health-report" || type === "large-file" || type === "file-preview" || type === "diagram-editor" || type === "hex-editor" || type === "kubernetes-topology" || RESTORABLE_TOOL_TAB_TYPES.has(type) ? "preview" : "split"),
        splitViewEditorWidthPercent: Number.isFinite(tab?.splitViewEditorWidthPercent) ? tab.splitViewEditorWidthPercent : null,
        scrollPos: Number(tab?.scrollPos || 0) || 0,
        selectionStart: Number(tab?.selectionStart || 0) || 0,
        selectionEnd: Number(tab?.selectionEnd || tab?.selectionStart || 0) || 0
      };
    }

    function serializeMarkdownTab(tab, options = {}) {
      const descriptor = createDescriptorBase(tab, tab?.isUnsupportedFile ? "unsupported-file" : "markdown");
      descriptor.source = getOpenedSource(tab, tab?.isUnsupportedFile ? "unsupported-file" : "markdown");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.linkBasePath = tab?.linkBasePath || null;
      descriptor.helpBrowser = tab?.helpBrowser ? clone(tab.helpBrowser) : null;
      descriptor.isUnsupportedFile = tab?.isUnsupportedFile === true;
      descriptor.isNewUnsavedFile = tab?.isNewUnsavedFile === true;
      descriptor.largeFileView = tab?.largeFileView ? clone(tab.largeFileView) : null;
      descriptor.transformedForViewing = tab?.transformedForViewing === true;
      descriptor.dirty = isDirtyMarkdownTab(tab);
      descriptor.hasDraft = isDraftMarkdownTab(tab);
      if (descriptor.hasDraft) {
        descriptor.draft = createDraftReference(tab, descriptor.type, options);
        if (options.includeInlineDraft !== false) descriptor.draftContent = getMarkdownContent(tab);
      }
      return descriptor;
    }

    function serializeLargeFileTab(tab, options = {}) {
      const descriptor = createDescriptorBase(tab, "large-file");
      descriptor.source = getOpenedSource(tab, "large-file");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.largeFileSource = tab?.largeFileSource ? {
        ...clone(tab.largeFileSource),
        content: undefined,
        file: null,
        handle: null
      } : null;
      if (!descriptor.sourceFilePath && tab?.largeFileSource?.content) {
        descriptor.draft = createDraftReference(tab, "file", options);
        if (options.includeInlineDraft !== false) descriptor.draftContent = String(tab.largeFileSource.content || "");
      }
      return descriptor;
    }

    function serializeFilePreviewTab(tab) {
      const descriptor = createDescriptorBase(tab, "file-preview");
      descriptor.source = getOpenedSource(tab, "file-preview");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.filePreviewSource = tab?.filePreviewSource ? {
        name: tab.filePreviewSource.name || descriptor.sourceFileName || descriptor.title,
        path: normalizePath(tab.filePreviewSource.path || descriptor.sourceFilePath || "") || null,
        size: Number(tab.filePreviewSource.size || 0) || 0,
        mimeType: tab.filePreviewSource.mimeType || null
      } : null;
      return descriptor;
    }

    function serializeKubernetesTopologyTab(tab) {
      const descriptor = createDescriptorBase(tab, "kubernetes-topology");
      descriptor.source = getOpenedSource(tab, "kubernetes-topology-file");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.kubernetesTopology = {
        graph: clone(tab?.kubernetesTopology?.graph || tab?.kubernetesTopologyDocument?.topology || { nodes: [], edges: [], warnings: [] }),
        result: clone(tab?.kubernetesTopology?.result || tab?.kubernetesTopologyDocument?.commandSummary || null),
        manifestContent: String(tab?.kubernetesTopology?.manifestContent || tab?.kubernetesTopologyDocument?.manifestSnapshot || "")
      };
      descriptor.kubernetesTopologyLayout = clone(tab?.kubernetesTopologyLayout || tab?.kubernetesTopologyDocument?.layout || { positions: {} });
      descriptor.kubernetesTopologyDocument = clone(tab?.kubernetesTopologyDocument || null);
      descriptor.dirty = tab?.kubernetesTopologyDirty === true;
      return descriptor;
    }
    function getGraphDocument(tab) {
      if (typeof deps.serializeGraphTab === "function") {
        return deps.serializeGraphTab(tab, { documentType: deps.GRAPH_DOCUMENT_TYPE_VIEW || "graph-view" });
      }
      return clone(tab?.graphDocument || {
        folderName: tab?.folderName || tab?.title || "Graph View",
        snapshot: tab?.graphSnapshot || null,
        viewConfig: tab?.graphViewConfig || null,
        graphLayout: tab?.graphLayout || null
      });
    }

    function getGraphDraftDocument(tab) {
      if (typeof deps.serializeGraphViewDocument === "function") {
        return deps.serializeGraphViewDocument(tab);
      }
      const document = getGraphDocument(tab);
      if (!document || typeof document !== "object") return document;
      const draftDocument = {
        ...document,
        documentType: deps.GRAPH_DOCUMENT_TYPE_VIEW || document.documentType || "graph-view"
      };
      if (typeof deps.stripGraphSnapshotContent === "function") {
        draftDocument.snapshot = deps.stripGraphSnapshotContent(document.snapshot || tab?.graphSnapshot || null, { preserveFullPath: false });
      }
      delete draftDocument.graphLayout;
      if (shouldPersistGraphViewLayout(document.graphLayout || tab?.graphLayout)) {
        draftDocument.graphLayout = clone(document.graphLayout || tab.graphLayout);
      }
      return draftDocument;
    }

    function serializeGraphTab(tab, options = {}) {
      const isHealthReport = tab?.graphViewKind === "health-report";
      const descriptor = createDescriptorBase(tab, isHealthReport ? "health-report" : "graph");
      descriptor.folderName = tab?.folderName || tab?.title || "Graph View";
      descriptor.graphViewKind = tab?.graphViewKind || "graph";
      descriptor.source = getOpenedSource(tab, isHealthReport ? "health-report" : "graph");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.graphScopeKey = tab?.graphScopeKey || null;
      descriptor.keepSavedGraphMode = tab?.keepSavedGraphMode === true;
      descriptor.graphHealthSourceTabId = tab?.graphHealthSourceTabId || null;
      descriptor.viewState = {
        graphViewConfig: clone(tab?.graphViewConfig || null),
        graphLayout: shouldPersistGraphViewLayout(tab?.graphLayout) ? clone(tab.graphLayout) : null,
        graphComparisonLayout: shouldPersistGraphViewLayout(tab?.graphComparisonLayout) ? clone(tab.graphComparisonLayout) : null
      };
      descriptor.dirty = isGraphTabDirty(tab);
      if (descriptor.dirty) {
        descriptor.draft = createDraftReference(tab, isHealthReport ? "report" : "graph", options);
        if (options.includeInlineDraft !== false) descriptor.draftDocument = getGraphDraftDocument(tab);
      }
      return descriptor;
    }

    function serializeImageEditorTab(tab, options = {}) {
      const descriptor = createDescriptorBase(tab, "image-editor");
      descriptor.source = getOpenedSource(tab, "image-editor");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.imageEditorSource = {
        name: tab?.imageEditorSource?.name || descriptor.sourceFileName || descriptor.title,
        path: normalizePath(tab?.imageEditorSource?.path || descriptor.sourceFilePath || "") || null,
        mimeType: tab?.imageEditorSource?.mimeType || null,
        width: Number(tab?.imageEditorSource?.width || 0) || 0,
        height: Number(tab?.imageEditorSource?.height || 0) || 0
      };
      descriptor.imageEditorState = clone(tab?.imageEditorState || {});
      descriptor.dirty = tab?.imageEditorDirty === true;
      if (descriptor.dirty) descriptor.draft = createDraftReference(tab, "image-editor", options);
      return descriptor;
    }

    function serializeDiagramEditorTab(tab, options = {}) {
      const descriptor = createDescriptorBase(tab, "diagram-editor");
      descriptor.source = getOpenedSource(tab, "diagram-editor");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.dirty = tab?.diagramDirty === true;
      descriptor.diagramSavedXml = String(tab?.diagramSavedXml || "");
      if (descriptor.dirty || !descriptor.sourceFilePath) {
        descriptor.draft = createDraftReference(tab, "diagram-editor", options);
        if (options.includeInlineDraft !== false) descriptor.draftContent = deps.diagramEditor?.getXml?.(tab) || tab?.diagramXml || "";
      }
      return descriptor;
    }

    function serializeHexEditorTab(tab) {
      const descriptor = createDescriptorBase(tab, "hex-editor");
      descriptor.source = getOpenedSource(tab, "hex-editor");
      descriptor.sourceFileName = tab?.sourceFileName || descriptor.source?.name || null;
      descriptor.sourceFilePath = normalizePath(tab?.sourceFilePath || descriptor.source?.path || "") || null;
      descriptor.hexEditorSource = tab?.hexEditorSource ? {
        name: tab.hexEditorSource.name || descriptor.sourceFileName || descriptor.title,
        path: normalizePath(tab.hexEditorSource.path || tab.hexEditorSource.fullPath || descriptor.sourceFilePath || "") || null,
        size: Number(tab.hexEditorState?.size || tab.hexEditorSource.size || 0) || 0,
        modifiedAt: Number(tab.hexEditorState?.modifiedAt || tab.hexEditorSource.modifiedAt || 0) || 0
      } : null;
      const viewState = deps.hexEditor?.getPersistedViewState?.(tab) || tab?.hexEditorState || {};
      descriptor.hexEditorState = {
        scrollTop: Math.max(0, Number(viewState.scrollTop || 0) || 0),
        cursor: Math.max(0, Number(viewState.cursor || 0) || 0),
        selectionStart: Math.max(0, Number(viewState.selectionStart || 0) || 0),
        selectionEnd: Math.max(0, Number(viewState.selectionEnd || 0) || 0),
        endianness: viewState.endianness === "big" ? "big" : "little",
        size: Math.max(0, Number(viewState.size || descriptor.hexEditorSource?.size || 0) || 0),
        modifiedAt: Math.max(0, Number(viewState.modifiedAt || descriptor.hexEditorSource?.modifiedAt || 0) || 0)
      };
      descriptor.dirty = false;
      delete descriptor.draft;
      delete descriptor.draftContent;
      return descriptor;
    }

    function serializeDraftTab(tab, options = {}) {
      return serializeMarkdownTab(tab, options);
    }

    function serializeToolTab(tab) {
      return createDescriptorBase(tab, tab.type);
    }

    function createDraftId(tab, kind) {
      const id = String(tab?.id || `tab_${Date.now()}`).replace(/[^a-zA-Z0-9_-]+/g, "_");
      return `${id}${DRAFT_EXTENSIONS[kind] || ".txt"}`;
    }

    function createDraftReference(tab, kind, options = {}) {
      const fileName = createDraftId(tab, kind);
      return {
        kind,
        id: fileName,
        path: options.profileDraftPathResolver ? options.profileDraftPathResolver(kind, fileName) : null
      };
    }

    function serializeTab(tab, options = {}) {
      if (!tab) return null;
      if (tab.type === "graph") return serializeGraphTab(tab, options);
      if (tab.type === "large-file") return serializeLargeFileTab(tab, options);
      if (tab.type === "file-preview") return serializeFilePreviewTab(tab, options);
      if (tab.type === "kubernetes-topology") return serializeKubernetesTopologyTab(tab, options);
      if (tab.type === "image-editor") return serializeImageEditorTab(tab, options);
      if (tab.type === "diagram-editor") return serializeDiagramEditorTab(tab, options);
      if (tab.type === "hex-editor") return serializeHexEditorTab(tab);
      if (tab.type === "file-compare") return null;
      if (RESTORABLE_TOOL_TAB_TYPES.has(tab.type)) return serializeToolTab(tab);
      if (tab.type === "api-client" || tab.type === "regex-tester") return null;
      if (tab.type === "draft") return serializeDraftTab(tab, options);
      return serializeMarkdownTab(tab, options);
    }

    function createBrowserPayload(tabs, activeTabId, options = {}) {
      return {
        version: SESSION_VERSION,
        updatedAt: Date.now(),
        activeTabId: activeTabId || null,
        tabs: (tabs || []).map((tab) => serializeTab(tab, {
          includeInlineDraft: options.includeInlineDraft !== false
        })).filter(Boolean)
      };
    }

    function getProfileSeparator(path) {
      return String(path || "").includes("\\") ? "\\" : "/";
    }

    function dirname(path) {
      const normalized = String(path || "");
      const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
      return slashIndex > 0 ? normalized.slice(0, slashIndex) : "";
    }

    async function ensureDirectory(path) {
      if (!path || !deps.Neutralino?.filesystem?.createDirectory) return;
      try {
        await deps.Neutralino.filesystem.createDirectory(path);
      } catch (_error) {
        // Existing directories are fine; write/read operations surface real failures.
      }
    }

    async function getDraftPath(kind, fileName) {
      if (!deps.getProfileDataFilePath) return null;
      const markerPath = await deps.getProfileDataFilePath(`${DRAFT_ROOT}/.keep`);
      if (!markerPath) return null;
      const draftRoot = dirname(markerPath);
      const separator = getProfileSeparator(markerPath);
      const draftDir = `${draftRoot}${separator}${kind}`;
      await ensureDirectory(draftRoot);
      await ensureDirectory(draftDir);
      return `${draftDir}${separator}${fileName}`;
    }

    async function writeDraft(descriptor) {
      if (!descriptor?.draft || (!deps.Neutralino?.filesystem?.writeFile && !deps.Neutralino?.filesystem?.writeBinaryFile)) return descriptor;
      const kind = descriptor.draft.kind || "file";
      const draftPath = await getDraftPath(kind, descriptor.draft.id);
      if (!draftPath) return descriptor;
      descriptor.draft.path = draftPath;
      if (descriptor.draftDocument) {
        await writeDraftText(draftPath, JSON.stringify(descriptor.draftDocument, null, 2));
        delete descriptor.draftDocument;
      } else if (descriptor.draftBinary && deps.Neutralino?.filesystem?.writeBinaryFile) {
        await writeDraftBinary(draftPath, descriptor.draftBinary);
        delete descriptor.draftBinary;
      } else if (Object.prototype.hasOwnProperty.call(descriptor, "draftContent")) {
        await writeDraftText(draftPath, String(descriptor.draftContent || ""));
        delete descriptor.draftContent;
      }
      return descriptor;
    }

    async function writeDraftText(path, content) {
      const text = String(content || "");
      const tempPath = `${path}.tmp`;
      const targetPath = deps.Neutralino?.filesystem?.move ? tempPath : path;
      if (targetPath !== path) {
        await deleteDraftPath(tempPath);
      }
      if (deps.Neutralino?.filesystem?.appendFile && text.length > DRAFT_WRITE_CHUNK_SIZE) {
        await deps.Neutralino.filesystem.writeFile(targetPath, "");
        for (let offset = 0; offset < text.length; offset += DRAFT_WRITE_CHUNK_SIZE) {
          await deps.Neutralino.filesystem.appendFile(targetPath, text.slice(offset, offset + DRAFT_WRITE_CHUNK_SIZE));
        }
      } else {
        await deps.Neutralino.filesystem.writeFile(targetPath, text);
      }
      if (targetPath !== path) {
        await deleteDraftPath(path);
        await deps.Neutralino.filesystem.move(targetPath, path);
      }
    }

    async function writeDraftBinary(path, bytes) {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
      const tempPath = `${path}.tmp`;
      const targetPath = deps.Neutralino?.filesystem?.move ? tempPath : path;
      if (targetPath !== path) await deleteDraftPath(tempPath);
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      await deps.Neutralino.filesystem.writeBinaryFile(targetPath, buffer);
      if (targetPath !== path) {
        await deleteDraftPath(path);
        await deps.Neutralino.filesystem.move(targetPath, path);
      }
    }

    function getFilesystemRemove() {
      return deps.Neutralino?.filesystem?.remove || deps.Neutralino?.filesystem?.removeFile || null;
    }

    async function deleteDraftPath(path) {
      const remove = getFilesystemRemove();
      if (!path || !remove) return false;
      try {
        await remove(path);
        return true;
      } catch (_error) {
        return false;
      }
    }

    function getDraftRootPathFromMarkerPath(markerPath) {
      return dirname(markerPath);
    }

    async function getDraftRootPath() {
      if (!deps.getProfileDataFilePath) return null;
      const markerPath = await deps.getProfileDataFilePath(`${DRAFT_ROOT}/.keep`);
      return markerPath ? getDraftRootPathFromMarkerPath(markerPath) : null;
    }

    function getDirectoryEntryPath(parentPath, entry) {
      const name = String(entry?.entry || entry?.name || "").trim();
      if (!parentPath || !name) return "";
      const separator = getProfileSeparator(parentPath);
      return `${parentPath}${separator}${name}`;
    }

    function isDirectoryEntry(entry) {
      return entry?.type === "DIRECTORY" || entry?.type === "directory" || entry?.isDirectory === true;
    }

    async function removeDirectoryContents(path) {
      const filesystem = deps.Neutralino?.filesystem;
      if (!path || !filesystem?.readDirectory) return { deleted: 0, attempted: 0 };

      let entries = [];
      try {
        entries = await filesystem.readDirectory(path);
      } catch (_error) {
        return { deleted: 0, attempted: 0 };
      }

      let deleted = 0;
      let attempted = 0;
      for (const entry of entries || []) {
        const childPath = getDirectoryEntryPath(path, entry);
        if (!childPath) continue;
        if (isDirectoryEntry(entry)) {
          const childResult = await removeDirectoryContents(childPath);
          deleted += childResult.deleted;
          attempted += childResult.attempted;
        }
        attempted += 1;
        if (await deleteDraftPath(childPath)) deleted += 1;
      }
      return { deleted, attempted };
    }

    async function cleanupAllDrafts() {
      const draftRoot = await getDraftRootPath();
      if (!draftRoot) return { deleted: 0, attempted: 0, draftRoot: null };
      const result = await removeDirectoryContents(draftRoot);
      if (typeof deps.appDebugLog === "function") {
        void deps.appDebugLog("debug", "[tabs-session] Cleaned up all tab drafts", {
          draftRoot,
          attempted: result.attempted,
          deleted: result.deleted
        });
      }
      return { ...result, draftRoot };
    }

    async function getPossibleDraftPathsForTab(tab) {
      const paths = new Set();
      const addPath = (value) => {
        const path = String(value || "").trim();
        if (path) paths.add(path);
      };
      addPath(tab?.draft?.path);
      addPath(tab?.draftPath);
      addPath(tab?.draftFilePath);
      const draftKinds = ["markdown", "graph", "report", "image-editor", "diagram-editor", "file", "unsupported-file"];
      for (const kind of draftKinds) {
        const fileName = createDraftId(tab, kind);
        const path = await getDraftPath(kind, fileName);
        addPath(path);
      }
      return Array.from(paths);
    }

    async function cleanupDraftForTab(tab) {
      if (!tab) return { deleted: 0, attempted: 0 };
      const paths = await getPossibleDraftPathsForTab(tab);
      let deleted = 0;
      for (const path of paths) {
        if (await deleteDraftPath(path)) deleted += 1;
      }
      if (typeof deps.appDebugLog === "function") {
        void deps.appDebugLog("debug", "[tabs-session] Cleaned up tab drafts", {
          tabId: tab.id || null,
          title: tab.title || null,
          attempted: paths.length,
          deleted
        });
      }
      return { deleted, attempted: paths.length };
    }

    async function createProfilePayload(tabs, activeTabId) {
      const descriptors = [];
      for (const tab of tabs || []) {
        const descriptor = serializeTab(tab, {
          includeInlineDraft: true,
          profileDraftPathResolver: () => null
        });
        if (!descriptor) continue;
        if (descriptor.type === "image-editor" && descriptor.dirty) {
          descriptor.draftBinary = await deps.imageEditor?.getDraftBinary?.(tab);
        }
        await writeDraft(descriptor);
        descriptors.push(descriptor);
      }
      return {
        version: SESSION_VERSION,
        updatedAt: Date.now(),
        activeTabId: activeTabId || null,
        tabs: descriptors
      };
    }

    function isSessionPayload(value) {
      return !!(value && typeof value === "object" && value.version === SESSION_VERSION && Array.isArray(value.tabs));
    }

    function getPayloadTabs(value) {
      if (isSessionPayload(value)) return value.tabs;
      if (Array.isArray(value)) return value.every((entry) => entry?.schemaVersion === SESSION_VERSION) ? value : [];
      return [];
    }

    async function readDraftText(descriptor) {
      if (descriptor?.draftContent !== undefined) return String(descriptor.draftContent || "");
      const path = descriptor?.draft?.path;
      if (path && deps.Neutralino?.filesystem?.readFile) return deps.Neutralino.filesystem.readFile(path);
      return "";
    }

    function getGraphDocumentCandidatePaths(descriptor) {
      const paths = [];
      const addPath = (value) => {
        const path = normalizePath(value);
        if (path && !paths.includes(path)) paths.push(path);
      };
      addPath(descriptor?.draft?.path);
      addPath(descriptor?.sourceFilePath);
      addPath(descriptor?.source?.path);
      return paths;
    }

    function isKubernetesTopologyDocumentPath(path) {
      return /\.mdviewer-k8s-topology\.json$/i.test(path || "");
    }

    function isLegacyKubernetesTopologyDescriptor(descriptor) {
      if (!descriptor || descriptor.type === "kubernetes-topology") return false;
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || "");
      return isKubernetesTopologyDocumentPath(sourcePath);
    }

    function isKubernetesTopologyDocument(document) {
      return !!(document && typeof document === "object" && document.documentType === "kubernetes-topology-view" && document.topology && Array.isArray(document.topology.nodes) && Array.isArray(document.topology.edges));
    }

    async function readKubernetesTopologyDocument(descriptor) {
      if (isKubernetesTopologyDocument(descriptor?.kubernetesTopologyDocument)) return descriptor.kubernetesTopologyDocument;
      if (!deps.Neutralino?.filesystem?.readFile) return null;
      for (const path of getGraphDocumentCandidatePaths(descriptor)) {
        if (!isKubernetesTopologyDocumentPath(path)) continue;
        try {
          const document = JSON.parse(await deps.Neutralino.filesystem.readFile(path) || "{}");
          if (isKubernetesTopologyDocument(document)) return document;
        } catch (_error) {}
      }
      return null;
    }

    async function restoreLegacyKubernetesTopologyTab(descriptor) {
      const document = await readKubernetesTopologyDocument(descriptor);
      if (!document) return null;
      return restoreKubernetesTopologyTab({
        ...descriptor,
        type: "kubernetes-topology",
        title: descriptor.title || document.title || "Kubernetes Topology",
        kubernetesTopologyDocument: document,
        kubernetesTopology: {
          graph: document.topology,
          result: document.commandSummary || null,
          manifestContent: document.manifestSnapshot || ""
        },
        kubernetesTopologyLayout: document.layout || { positions: {} },
        dirty: false,
        viewMode: "preview"
      });
    }

    async function readGraphDocument(descriptor) {
      if (descriptor?.draftDocument) return descriptor.draftDocument;
      if (!deps.Neutralino?.filesystem?.readFile) return null;
      const failures = [];
      for (const path of getGraphDocumentCandidatePaths(descriptor)) {
        try {
          const raw = await deps.Neutralino.filesystem.readFile(path);
          const document = JSON.parse(raw || "{}");
          if (document && typeof document === "object") return document;
        } catch (error) {
          failures.push({
            path,
            message: error?.message || String(error || "")
          });
        }
      }
      if (failures.length && typeof deps.appDebugLog === "function") {
        void deps.appDebugLog("warning", "[tabs-session] Unable to restore graph document from saved session paths", {
          title: descriptor?.title || null,
          sourceFilePath: descriptor?.sourceFilePath || descriptor?.source?.path || null,
          failures
        });
      }
      return null;
    }

    async function restoreMarkdownTab(descriptor) {
      const draftContent = descriptor.hasDraft || descriptor.draft ? await readDraftText(descriptor) : null;
      let content = draftContent;
      let missingSource = false;
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || "");
      if (content === null) {
        try {
          if (sourcePath && deps.Neutralino?.filesystem?.readFile) {
            content = await deps.Neutralino.filesystem.readFile(sourcePath);
          } else if (sourcePath) {
            throw new Error("Source file access is not available in this runtime.");
          } else {
            content = "";
          }
        } catch (_error) {
          missingSource = true;
          content = [
            "# File Missing",
            "",
            "MD-Editor could not reopen this file from the saved tab session.",
            "",
            sourcePath ? `Path: ${sourcePath}` : "Path: (missing)"
          ].join("\n");
        }
      }
      const tab = deps.createTab(normalizeContent(content), descriptor.title || descriptor.source?.name || "Untitled", descriptor.viewMode || "split", {
        openedSource: descriptor.source || null,
        linkBasePath: descriptor.linkBasePath || null
      });
      applyDescriptorIdentity(tab, descriptor);
      tab.sourceFileName = (sourcePath || descriptor.isNewUnsavedFile === true || descriptor.type === "unsupported-file" || descriptor.isUnsupportedFile === true) ? (descriptor.sourceFileName || descriptor.source?.name || null) : null;
      tab.sourceFilePath = sourcePath || null;
      tab.savedContent = descriptor.dirty || descriptor.hasDraft || missingSource ? normalizeContent(descriptor.sourceSavedContent || "") : normalizeContent(content);
      if (descriptor.hasDraft || descriptor.draft) tab.savedContent = normalizeContent(descriptor.sourceSavedContent || "");
      tab.isUnsupportedFile = descriptor.type === "unsupported-file" || descriptor.isUnsupportedFile === true;
      tab.isNewUnsavedFile = descriptor.isNewUnsavedFile === true;
      tab.largeFileView = descriptor.largeFileView || null;
      tab.transformedForViewing = descriptor.transformedForViewing === true;
      tab.helpBrowser = descriptor.helpBrowser ? clone(descriptor.helpBrowser) : null;
      if (descriptor.draft) {
        tab.draft = clone(descriptor.draft);
        tab.draftFilePath = descriptor.draft.path || null;
      }
      tab.missingSource = missingSource;
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    async function restoreLargeFileTab(descriptor) {
      const source = {
        ...(descriptor.largeFileSource || {}),
        name: descriptor.sourceFileName || descriptor.source?.name || descriptor.title || "Large file",
        path: descriptor.sourceFilePath || descriptor.source?.path || null,
        content: descriptor.draft ? await readDraftText(descriptor) : undefined
      };
      const tab = deps.createLargeFileTab(source, descriptor.title || source.name, { temporary: descriptor.isTemporary === true });
      applyDescriptorIdentity(tab, descriptor);
      if (descriptor.draft) {
        tab.draft = clone(descriptor.draft);
        tab.draftFilePath = descriptor.draft.path || null;
      }
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    function createMissingFilePreviewTab(descriptor) {
      const source = {
        ...(descriptor.filePreviewSource || {}),
        name: descriptor.sourceFileName || descriptor.source?.name || descriptor.title || "File preview",
        path: descriptor.sourceFilePath || descriptor.source?.path || null,
        file: null,
        handle: null
      };
      const tab = deps.createFilePreviewTab
        ? deps.createFilePreviewTab(source, descriptor.title || source.name, { temporary: descriptor.isTemporary === true })
        : deps.createTab("", descriptor.title || source.name || "Preview unavailable", "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      tab.sourceFileName = descriptor.sourceFileName || descriptor.source?.name || null;
      tab.sourceFilePath = descriptor.sourceFilePath || descriptor.source?.path || null;
      tab.savedContent = "";
      tab.missingSource = true;
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    async function restoreFilePreviewTab(descriptor) {
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || descriptor.filePreviewSource?.path || "");
      if (!sourcePath || !deps.createFilePreviewTab) return createMissingFilePreviewTab(descriptor);
      const source = {
        ...(descriptor.filePreviewSource || {}),
        name: descriptor.sourceFileName || descriptor.source?.name || descriptor.title || "File preview",
        path: sourcePath,
        file: null,
        handle: null
      };
      const tab = deps.createFilePreviewTab(source, descriptor.title || source.name, { temporary: descriptor.isTemporary === true });
      applyDescriptorIdentity(tab, descriptor);
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    async function restoreKubernetesTopologyTab(descriptor) {
      const document = descriptor.kubernetesTopologyDocument || null;
      const topology = descriptor.kubernetesTopology || {};
      const graph = topology.graph || document?.topology || { nodes: [], edges: [], warnings: [] };
      const result = topology.result || document?.commandSummary || null;
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || "");
      const sourceFileName = descriptor.sourceFileName || descriptor.source?.name || descriptor.title || null;
      const tab = deps.createKubernetesTopologyTab
        ? deps.createKubernetesTopologyTab(graph, result, {
            title: descriptor.title || document?.title || "Kubernetes Topology",
            layout: descriptor.kubernetesTopologyLayout || document?.layout || { positions: {} },
            document,
            sourceFilePath: sourcePath || null,
            sourceFileName,
            manifestContent: topology.manifestContent || document?.manifestSnapshot || "",
            temporary: descriptor.isTemporary === true,
            dirty: descriptor.dirty === true
          })
        : deps.createTab("", descriptor.title || "Kubernetes Topology", "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      tab.type = "kubernetes-topology";
      tab.sourceFileName = sourceFileName;
      tab.sourceFilePath = sourcePath || null;
      tab.kubernetesTopology = tab.kubernetesTopology || { graph, result, manifestContent: topology.manifestContent || document?.manifestSnapshot || "" };
      tab.kubernetesTopologyLayout = tab.kubernetesTopologyLayout || descriptor.kubernetesTopologyLayout || document?.layout || { positions: {} };
      tab.kubernetesTopologyDocument = document;
      tab.kubernetesTopologyDirty = descriptor.dirty === true;
      restoreCommonViewState(tab, descriptor);
      return tab;
    }
    async function restoreImageEditorTab(descriptor) {
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || descriptor.imageEditorSource?.path || "");
      let draftBytes = null;
      if (descriptor.dirty && descriptor.draft?.path && deps.Neutralino?.filesystem?.readBinaryFile) {
        try {
          draftBytes = new Uint8Array(await deps.Neutralino.filesystem.readBinaryFile(descriptor.draft.path));
        } catch (_error) {
          draftBytes = null;
        }
      }
      const source = {
        ...(descriptor.imageEditorSource || {}),
        name: descriptor.sourceFileName || descriptor.source?.name || descriptor.title || "Image",
        path: sourcePath || null,
        file: null,
        handle: null,
        draftBytes
      };
      const tab = deps.createImageEditorTab
        ? deps.createImageEditorTab(source, descriptor.title || `${source.name} \u2014 Image Editor`, {
            temporary: descriptor.isTemporary === true,
            state: descriptor.imageEditorState || {},
            dirty: descriptor.dirty === true && !!draftBytes,
            draftBytes
          })
        : deps.createTab("", descriptor.title || source.name, "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      if (descriptor.draft) tab.draft = clone(descriptor.draft);
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    async function restoreDiagramEditorTab(descriptor) {
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || "");
      let xml = "";
      if (descriptor.draft || descriptor.draftContent !== undefined) {
        try { xml = await readDraftText(descriptor); } catch (_error) { xml = ""; }
      }
      if (!xml && sourcePath && deps.Neutralino?.filesystem?.readFile) {
        try { xml = await deps.Neutralino.filesystem.readFile(sourcePath); } catch (_error) { xml = ""; }
      }
      if (!xml) xml = deps.diagramEditor?.createBlankXml?.() || "";
      const source = {
        name: descriptor.sourceFileName || descriptor.source?.name || descriptor.title || "Untitled Diagram.drawio",
        path: sourcePath || null,
        xml
      };
      const tab = deps.createDiagramEditorTab
        ? deps.createDiagramEditorTab(source, descriptor.title || source.name, {
            temporary: descriptor.isTemporary === true,
            xml,
            savedXml: descriptor.diagramSavedXml || (descriptor.dirty ? "" : xml),
            dirty: descriptor.dirty === true
          })
        : deps.createTab("", descriptor.title || source.name, "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      if (descriptor.draft) tab.draft = clone(descriptor.draft);
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    async function restoreHexEditorTab(descriptor) {
      const sourcePath = normalizePath(descriptor.sourceFilePath || descriptor.source?.path || descriptor.hexEditorSource?.path || "");
      const source = {
        ...(descriptor.hexEditorSource || {}),
        name: descriptor.sourceFileName || descriptor.source?.name || descriptor.title || "Hex Editor",
        path: sourcePath || null,
        file: null,
        handle: null
      };
      const tab = deps.createHexEditorTab
        ? deps.createHexEditorTab(source, descriptor.title || source.name, {
            temporary: descriptor.isTemporary === true,
            state: descriptor.hexEditorState || {}
          })
        : deps.createTab("", descriptor.title || source.name, "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      tab.hexEditorState = { ...(descriptor.hexEditorState || {}) };
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    function restoreToolTab(descriptor) {
      const factoryNameByType = {
        "base64-tool": "createBase64ToolTab",
        "certificate-decoder": "createCertificateDecoderTab",
        "jwt-tool": "createJwtToolTab",
        "json-yaml-tool": "createJsonYamlToolTab",
        "jsonpath-tool": "createJsonPathToolTab",
        "xpath-tool": "createXPathToolTab",
        "uuid-tool": "createUuidToolTab",
        "qr-tool": "createQrToolTab",
        "hash-tool": "createHashToolTab",
        "json-array-table-tool": "createJsonArrayTableToolTab",
        "text-escape-tool": "createTextEscapeToolTab",
        "unicode-tool": "createUnicodeToolTab",
        "string-bytes-tool": "createStringBytesToolTab",
        "database-connection-string-tool": "createDatabaseConnectionStringToolTab"
      };
      const factory = deps[factoryNameByType[descriptor.type]];
      const tab = typeof factory === "function"
        ? factory()
        : deps.createTab("", descriptor.title || "Tool", "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      tab.type = descriptor.type;
      tab.savedContent = "";
      restoreCommonViewState(tab, { ...descriptor, viewMode: "preview" });
      return tab;
    }

    async function restoreGraphTab(descriptor) {
      const graphDocument = await readGraphDocument(descriptor);
      if (!graphDocument) {
        return restoreMissingGraphTab(descriptor);
      }
      const tab = await deps.createGraphTab(descriptor.folderName || descriptor.title || "Graph View", {
        graphDocument,
        graphViewConfig: descriptor.viewState?.graphViewConfig || graphDocument.viewConfig,
        graphLayout: descriptor.viewState?.graphLayout || graphDocument.graphLayout,
        openedSource: descriptor.source || null,
        graphScopeKey: descriptor.graphScopeKey || graphDocument.graphScopeKey || "",
        skipGraphRenderWarning: true
      });
      if (!tab) return null;
      applyDescriptorIdentity(tab, descriptor);
      tab.graphViewKind = descriptor.type === "health-report" ? "health-report" : (descriptor.graphViewKind || tab.graphViewKind);
      tab.sourceFileName = descriptor.sourceFileName || descriptor.source?.name || null;
      tab.sourceFilePath = descriptor.sourceFilePath || descriptor.source?.path || null;
      tab.keepSavedGraphMode = descriptor.keepSavedGraphMode === true;
      tab.graphHealthSourceTabId = descriptor.graphHealthSourceTabId || null;
      if (descriptor.viewState?.graphComparisonLayout) tab.graphComparisonLayout = descriptor.viewState.graphComparisonLayout;
      if (descriptor.draft) {
        tab.draft = clone(descriptor.draft);
        tab.draftFilePath = descriptor.draft.path || null;
      }
      if (descriptor.draft || descriptor.dirty) tab.graphHasUnsavedChanges = true;
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    async function restoreHealthReportTab(descriptor) {
      return restoreGraphTab({ ...descriptor, type: "health-report", graphViewKind: "health-report" });
    }

    async function restoreDraftTab(descriptor) {
      return restoreMarkdownTab({ ...descriptor, hasDraft: true });
    }

    function restoreMissingGraphTab(descriptor) {
      const tab = deps.createTab("", descriptor.title || "Missing graph", "preview", { openedSource: descriptor.source || null });
      applyDescriptorIdentity(tab, descriptor);
      tab.type = "graph";
      tab.folderName = descriptor.folderName || descriptor.title || "Missing graph";
      tab.graphViewKind = descriptor.type === "health-report" ? "health-report" : "graph";
      tab.graphSnapshot = { version: 1, folderName: tab.folderName, nodes: [], links: [], files: [] };
      tab.graphViewConfig = descriptor.viewState?.graphViewConfig || {};
      tab.graphDocument = {
        schemaVersion: 1,
        documentType: "graph-view",
        folderName: tab.folderName,
        snapshot: tab.graphSnapshot,
        viewConfig: tab.graphViewConfig
      };
      tab.missingSource = true;
      restoreCommonViewState(tab, descriptor);
      return tab;
    }

    function applyDescriptorIdentity(tab, descriptor) {
      tab.id = descriptor.id || tab.id;
      tab.title = descriptor.title || tab.title;
      tab.createdAt = descriptor.createdAt || tab.createdAt;
      tab.isTemporary = descriptor.isTemporary === true;
    }

    function restoreCommonViewState(tab, descriptor) {
      tab.viewMode = descriptor.viewMode || tab.viewMode;
      if (Number.isFinite(descriptor.splitViewEditorWidthPercent)) {
        tab.splitViewEditorWidthPercent = descriptor.splitViewEditorWidthPercent;
      }
      tab.scrollPos = Number(descriptor.scrollPos || 0) || 0;
      tab.selectionStart = Number(descriptor.selectionStart || 0) || 0;
      tab.selectionEnd = Number(descriptor.selectionEnd || descriptor.selectionStart || 0) || 0;
    }

    async function restoreDescriptor(descriptor) {
      if (!descriptor || descriptor.schemaVersion !== SESSION_VERSION) return null;
      if (isLegacyKubernetesTopologyDescriptor(descriptor)) {
        const topologyTab = await restoreLegacyKubernetesTopologyTab(descriptor);
        if (topologyTab) return topologyTab;
      }
      if (descriptor.type === "graph") return restoreGraphTab(descriptor);
      if (descriptor.type === "health-report") return restoreHealthReportTab(descriptor);
      if (descriptor.type === "large-file") return restoreLargeFileTab(descriptor);
      if (descriptor.type === "file-preview") return restoreFilePreviewTab(descriptor);
      if (descriptor.type === "kubernetes-topology") return restoreKubernetesTopologyTab(descriptor);
      if (descriptor.type === "image-editor") return restoreImageEditorTab(descriptor);
      if (descriptor.type === "diagram-editor") return restoreDiagramEditorTab(descriptor);
      if (descriptor.type === "hex-editor") return restoreHexEditorTab(descriptor);
      if (RESTORABLE_TOOL_TAB_TYPES.has(descriptor.type)) return restoreToolTab(descriptor);
      if (descriptor.type === "draft") return restoreDraftTab(descriptor);
      return restoreMarkdownTab(descriptor);
    }

    async function restoreTabsFromPayload(payload) {
      const descriptors = getPayloadTabs(payload);
      const restored = [];
      for (const descriptor of descriptors) {
        const tab = await restoreDescriptor(descriptor);
        if (tab) restored.push(tab);
      }
      return {
        tabs: restored,
        activeTabId: isSessionPayload(payload) ? payload.activeTabId || null : null
      };
    }

    const api = {
      SESSION_VERSION,
      createBrowserPayload,
      createProfilePayload,
      getPayloadTabs,
      isSessionPayload,
      serializeMarkdownTab,
      serializeGraphTab,
      serializeHealthReportTab: serializeGraphTab,
      serializeLargeFileTab,
      serializeFilePreviewTab,
      serializeKubernetesTopologyTab,
      serializeImageEditorTab,
      serializeDiagramEditorTab,
      serializeHexEditorTab,
      serializeUnsupportedFileTab: serializeMarkdownTab,
      serializeDraftTab,
      serializeToolTab,
      serializeTab,
      cleanupDraftForTab,
      cleanupAllDrafts,
      getPossibleDraftPathsForTab,
      restoreMarkdownTab,
      restoreGraphTab,
      restoreHealthReportTab,
      restoreLargeFileTab,
      restoreFilePreviewTab,
      restoreKubernetesTopologyTab,
      restoreImageEditorTab,
      restoreHexEditorTab,
      restoreDraftTab,
      restoreTabsFromPayload
    };

    app.registerModule?.("tabPersistence", api);
    return api;
  };
})(window);
