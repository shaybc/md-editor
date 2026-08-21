const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function createPersistence(extraDeps = {}) {
  const source = fs.readFileSync(path.join(webRoot, "js", "tabs", "persistence.js"), "utf8");
  const modules = {};
  const context = {
    window: {},
    console,
    Date,
    Math
  };
  context.global = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "tabs/persistence.js" });
  const app = {
    registerModule(name, api) {
      modules[name] = api;
    }
  };
  const deps = {
    activeTabId: null,
    activeEditorCommands: {},
    normalizeEditorContent(value) {
      return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    },
    getFileName(value) {
      return String(value || "").replace(/\\/g, "/").split("/").pop() || "";
    },
    createTab(content, title, viewMode, options = {}) {
      return {
        id: `restored_${title}`,
        type: "markdown",
        content,
        savedContent: content,
        title,
        viewMode,
        openedSource: options.openedSource || null
      };
    },
    createLargeFileTab(source, title) {
      return { id: `large_${title}`, type: "large-file", title, largeFileSource: source };
    },
    createFilePreviewTab(source, title, options = {}) {
      return {
        id: `preview_${title}`,
        type: "file-preview",
        title,
        filePreviewSource: source,
        sourceFileName: source?.name || null,
        sourceFilePath: source?.path || null,
        isTemporary: options.temporary === true
      };
    },
    createKubernetesTopologyTab(graph, result, options = {}) {
      return {
        id: `topology_${options.title || "Topology"}`,
        type: "kubernetes-topology",
        title: options.title || "Kubernetes Topology",
        viewMode: "preview",
        kubernetesTopology: { graph, result, manifestContent: options.manifestContent || "" },
        kubernetesTopologyLayout: options.layout || { positions: {} },
        kubernetesTopologyDocument: options.document || null,
        kubernetesTopologyDirty: options.dirty === true,
        sourceFileName: options.sourceFileName || null,
        sourceFilePath: options.sourceFilePath || null,
        isTemporary: options.temporary === true
      };
    },
    createHexEditorTab(source, title, options = {}) {
      return {
        id: `hex_${title}`,
        type: "hex-editor",
        title,
        hexEditorSource: source,
        hexEditorState: options.state || {},
        sourceFileName: source?.name || null,
        sourceFilePath: source?.path || null,
        isTemporary: options.temporary === true
      };
    },
    createGraphTab(folderName, options = {}) {
      return {
        id: `graph_${folderName}`,
        type: "graph",
        title: folderName,
        folderName,
        graphDocument: options.graphDocument,
        graphSnapshot: options.graphDocument?.snapshot || null,
        graphViewConfig: options.graphViewConfig || null,
        graphLayout: options.graphLayout || null,
        openedSource: options.openedSource || null
      };
    },
    serializeGraphTab(tab) {
      return {
        schemaVersion: 1,
        documentType: "graph-view",
        folderName: tab.folderName || tab.title,
        snapshot: tab.graphSnapshot || null,
        viewConfig: tab.graphViewConfig || null,
        graphLayout: tab.graphLayout || null
      };
    },
    serializeGraphViewDocument(tab) {
      const snapshot = tab.graphSnapshot || null;
      const filesById = new Map((snapshot?.files || []).map((file) => [file.id, file]));
      const document = {
        schemaVersion: 1,
        documentType: "graph-view",
        folderName: tab.folderName || tab.title,
        snapshot: {
          version: snapshot?.version || 1,
          folderName: snapshot?.folderName || tab.folderName || tab.title,
          nodes: (snapshot?.nodes || []).map((node) => {
            const file = filesById.get(node.id) || {};
            const stripped = {
              id: node.id,
              type: node.type || "file"
            };
            const path = node.path || file.path || node.fullPath || file.fullPath || "";
            if (path) stripped.path = path;
            stripped.tags = Array.isArray(node.tags) ? node.tags : (Array.isArray(file.tags) ? file.tags : []);
            if (node.status && node.status !== "current") stripped.status = node.status;
            return stripped;
          }),
          links: (snapshot?.links || []).map((link) => ({
            ...link,
            source: typeof link.source === "object" ? link.source.id : link.source,
            target: typeof link.target === "object" ? link.target.id : link.target,
            index: undefined
          }))
        },
        viewConfig: tab.graphViewConfig || null
      };
      if (tab.graphLayout?.magneticEnabled === false) document.graphLayout = tab.graphLayout;
      return document;
    },
    isFileBackedGraphTab(tab) {
      return !!tab?.sourceFilePath && tab.graphHasUnsavedChanges !== true;
    },
    stripGraphSnapshotContent(snapshot) {
      return {
        ...snapshot,
        files: (snapshot?.files || []).map((file) => ({
          id: file.id,
          path: file.path || "",
          name: file.name || ""
        }))
      };
    },
    ...extraDeps
  };
  return context.window.registerMarkdownViewerTabPersistence(app, deps);
}

test("file preview tab serializes durable source metadata", () => {
  const persistence = createPersistence();
  const descriptor = persistence.serializeTab({
    id: "tab_preview",
    type: "file-preview",
    title: "manual.pdf",
    createdAt: 123,
    sourceFileName: "manual.pdf",
    sourceFilePath: "C:/work/manual.pdf",
    openedSource: { path: "C:/work/manual.pdf", name: "manual.pdf", kind: "file-preview" },
    filePreviewSource: { name: "manual.pdf", path: "C:/work/manual.pdf", size: 4096, mimeType: "application/pdf" }
  });

  assert.equal(descriptor.type, "file-preview");
  assert.equal(descriptor.sourceFilePath, "C:/work/manual.pdf");
  assert.equal(descriptor.filePreviewSource.mimeType, "application/pdf");
  assert.equal(descriptor.filePreviewSource.size, 4096);
});

test("hex editor tab serializes source and clean view metadata without binary contents", () => {
  const persistence = createPersistence();
  const descriptor = persistence.serializeTab({
    id: "tab_hex",
    type: "hex-editor",
    title: "firmware.bin",
    createdAt: 123,
    sourceFileName: "firmware.bin",
    sourceFilePath: "C:/work/firmware.bin",
    openedSource: { path: "C:/work/firmware.bin", name: "firmware.bin", kind: "hex-editor" },
    hexEditorSource: { name: "firmware.bin", path: "C:/work/firmware.bin", size: 8192, modifiedAt: 99 },
    hexEditorState: {
      scrollTop: 240,
      cursor: 18,
      selectionStart: 16,
      selectionEnd: 18,
      endianness: "big",
      bytes: [222, 173, 190, 239]
    },
    hexEditorDirty: true
  });

  assert.equal(descriptor.type, "hex-editor");
  assert.equal(descriptor.sourceFilePath, "C:/work/firmware.bin");
  assert.deepEqual(Object.keys(descriptor.hexEditorState).sort(), [
    "cursor", "endianness", "modifiedAt", "scrollTop", "selectionEnd", "selectionStart", "size"
  ]);
  assert.equal(descriptor.hexEditorState.endianness, "big");
  assert.equal(descriptor.dirty, false);
  assert.equal(JSON.stringify(descriptor).includes("222"), false);
});

test("hex editor tab restores durable source and view state", async () => {
  const persistence = createPersistence();
  const restored = await persistence.restoreHexEditorTab({
    schemaVersion: persistence.SESSION_VERSION,
    id: "tab_hex",
    type: "hex-editor",
    title: "firmware.bin",
    sourceFileName: "firmware.bin",
    sourceFilePath: "C:/work/firmware.bin",
    hexEditorSource: { size: 8192, modifiedAt: 99 },
    hexEditorState: { cursor: 18, selectionStart: 16, selectionEnd: 18, endianness: "big" }
  });

  assert.equal(restored.type, "hex-editor");
  assert.equal(restored.hexEditorSource.path, "C:/work/firmware.bin");
  assert.equal(restored.hexEditorState.cursor, 18);
  assert.equal(restored.hexEditorState.endianness, "big");
});

test("file compare tabs are skipped from session serialization", () => {
  const persistence = createPersistence();
  const descriptor = persistence.serializeTab({
    id: "tab_compare",
    type: "file-compare",
    title: "left.txt <-> right.txt",
    fileCompare: {
      left: { name: "left.txt", content: "left" },
      right: { name: "right.txt", content: "right" }
    }
  });

  assert.equal(descriptor, null);
});


test("API Client tabs are skipped from session serialization", () => {
  const persistence = createPersistence();
  const descriptor = persistence.serializeTab({
    id: "tab_api_client",
    type: "api-client",
    title: "API Client",
    apiClient: { history: [{ method: "GET", url: "https://example.com" }] }
  });

  assert.equal(descriptor, null);
});
test("file preview tab restores from durable source path", async () => {
  const persistence = createPersistence();
  const restored = await persistence.restoreFilePreviewTab({
    schemaVersion: persistence.SESSION_VERSION,
    id: "tab_preview",
    type: "file-preview",
    title: "manual.pdf",
    sourceFileName: "manual.pdf",
    sourceFilePath: "C:/work/manual.pdf",
    filePreviewSource: { mimeType: "application/pdf", size: 4096 }
  });

  assert.equal(restored.type, "file-preview");
  assert.equal(restored.sourceFilePath, "C:/work/manual.pdf");
  assert.equal(restored.filePreviewSource.path, "C:/work/manual.pdf");
});

test("untitled draft restore keeps markdown tab source-less", async () => {
  const persistence = createPersistence();

  const restored = await persistence.restoreMarkdownTab({
    schemaVersion: persistence.SESSION_VERSION,
    id: "tab_untitled",
    type: "markdown",
    title: "Untitled 1",
    source: { name: "Untitled 1", path: null, kind: "markdown" },
    sourceFileName: "Untitled 1",
    sourceFilePath: null,
    hasDraft: true,
    draftContent: "draft body",
    viewMode: "split"
  });

  assert.equal(restored.type, "markdown");
  assert.equal(restored.sourceFileName, null);
  assert.equal(restored.sourceFilePath, null);
  assert.equal(restored.viewMode, "split");
});

test("saved markdown tab serializes without copied content", () => {
  const persistence = createPersistence();
  const tab = {
    id: "tab_md",
    type: "markdown",
    title: "Readme",
    content: "# Hello",
    savedContent: "# Hello",
    sourceFilePath: "C:/work/README.md",
    sourceFileName: "README.md",
    openedSource: { path: "C:/work/README.md", name: "README.md", kind: "markdown" }
  };

  const payload = persistence.createBrowserPayload([tab], tab.id);
  assert.equal(payload.version, 2);
  assert.equal(payload.tabs.length, 1);
  assert.equal(payload.tabs[0].type, "markdown");
  assert.equal(payload.tabs[0].sourceFilePath, "C:/work/README.md");
  assert.equal(payload.tabs[0].draftContent, undefined);
  assert.equal(payload.tabs[0].content, undefined);
});

test("dirty markdown profile payload writes a draft and keeps descriptor small", async () => {
  const writes = new Map();
  const persistence = createPersistence({
    getProfileDataFilePath(fileName) {
      return `C:\\Users\\tester\\.md-editor\\${fileName}`;
    },
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    }
  });
  const tab = {
    id: "tab_dirty",
    type: "markdown",
    title: "Note",
    content: "changed",
    savedContent: "saved",
    sourceFilePath: "C:/work/note.md",
    sourceFileName: "note.md"
  };

  const payload = await persistence.createProfilePayload([tab], tab.id);
  const descriptor = payload.tabs[0];

  assert.equal(payload.version, 2);
  assert.equal(descriptor.hasDraft, true);
  assert.equal(descriptor.draft.kind, "markdown");
  assert.ok(descriptor.draft.path.endsWith("\\drafts\\markdown\\tab_dirty.md"));
  assert.equal(descriptor.draftContent, undefined);
  assert.equal(descriptor.content, undefined);
  assert.equal(writes.get(descriptor.draft.path), "changed");
});

test("saved graph tab serializes as a source descriptor without graph snapshot", () => {
  const persistence = createPersistence();
  const tab = {
    id: "tab_graph",
    type: "graph",
    title: "Graph View",
    folderName: "Graph View",
    sourceFilePath: "C:/work/project.mdviewer-graph.json",
    sourceFileName: "project.mdviewer-graph.json",
    graphSnapshot: { nodes: [{ id: "a" }], links: [], files: [] },
    graphViewConfig: { showLabels: true },
    graphLayout: { zoom: { x: 1, y: 2, k: 1.5 }, magneticEnabled: true },
    graphHasUnsavedChanges: false
  };

  const payload = persistence.createBrowserPayload([tab], tab.id);
  const descriptor = payload.tabs[0];

  assert.equal(descriptor.type, "graph");
  assert.equal(descriptor.sourceFilePath, "C:/work/project.mdviewer-graph.json");
  assert.equal(descriptor.graphSnapshot, undefined);
  assert.equal(descriptor.draftDocument, undefined);
  assert.equal(descriptor.viewState.graphLayout, null);
});

test("unsaved graph profile payload writes lightweight graph-view draft", async () => {
  const writes = new Map();
  const persistence = createPersistence({
    getProfileDataFilePath(fileName) {
      return `C:\\Users\\tester\\.md-editor\\${fileName}`;
    },
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    },
    isFileBackedGraphTab() {
      return false;
    }
  });
  const tab = {
    id: "tab_unsaved_graph",
    type: "graph",
    title: "Folder Graph",
    folderName: "Folder Graph",
    graphSnapshot: {
      nodes: [{ id: "a", content: "very large content", x: 100, y: 200 }],
      links: [{ source: { id: "a", content: "large" }, target: { id: "b", content: "large" }, index: 1 }],
      files: [{ id: "a", path: "a.md", name: "a.md", content: "very large content" }]
    },
    graphViewConfig: { showLabels: true },
    graphLayout: { magneticEnabled: true, nodes: { a: { x: 100, y: 200 } } }
  };

  const payload = await persistence.createProfilePayload([tab], tab.id);
  const descriptor = payload.tabs[0];
  const draftText = writes.get(descriptor.draft.path);

  assert.equal(descriptor.type, "graph");
  assert.equal(descriptor.draft.kind, "graph");
  assert.equal(descriptor.graphSnapshot, undefined);
  assert.equal(descriptor.draftDocument, undefined);
  const draftDocument = JSON.parse(draftText);
  assert.equal(draftDocument.documentType, "graph-view");
  assert.equal(draftDocument.graphLayout, undefined);
  assert.deepEqual(draftDocument.snapshot.nodes, [{ id: "a", type: "file", path: "a.md", tags: [] }]);
  assert.deepEqual(draftDocument.snapshot.links, [{ source: "a", target: "b" }]);
  assert.equal(draftDocument.snapshot.files, undefined);
});

test("dirty source-backed graph profile draft strips embedded file content", async () => {
  const writes = new Map();
  const persistence = createPersistence({
    getProfileDataFilePath(fileName) {
      return `C:\\Users\\tester\\.md-editor\\${fileName}`;
    },
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    },
    isFileBackedGraphTab(tab) {
      return !!tab?.sourceFilePath;
    }
  });
  const tab = {
    id: "tab_dirty_graph",
    type: "graph",
    title: "Huge Graph",
    folderName: "Huge Graph",
    sourceFilePath: "C:/work/huge.mdviewer-graph.json",
    sourceFileName: "huge.mdviewer-graph.json",
    graphSnapshot: {
      nodes: [{ id: "a" }],
      links: [],
      files: [{ id: "a", path: "a.md", name: "a.md", content: "very large content" }]
    },
    graphHasUnsavedChanges: true
  };

  const payload = await persistence.createProfilePayload([tab], tab.id);
  const descriptor = payload.tabs[0];
  const draftText = writes.get(descriptor.draft.path);
  const draftDocument = JSON.parse(draftText);

  assert.equal(descriptor.draft.kind, "graph");
  assert.equal(draftDocument.snapshot.files, undefined);
  assert.deepEqual(draftDocument.snapshot.nodes, [{ id: "a", type: "file", path: "a.md", tags: [] }]);
});

test("non-magnetic graph drafts keep manual layout", async () => {
  const writes = new Map();
  const persistence = createPersistence({
    getProfileDataFilePath(fileName) {
      return `C:\\Users\\tester\\.md-editor\\${fileName}`;
    },
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeFile(filePath, content) {
          writes.set(filePath, content);
        }
      }
    },
    isFileBackedGraphTab() {
      return false;
    }
  });
  const tab = {
    id: "tab_manual_graph",
    type: "graph",
    title: "Manual Graph",
    folderName: "Manual Graph",
    graphSnapshot: { nodes: [{ id: "a" }], links: [], files: [] },
    graphLayout: { magneticEnabled: false, nodes: { a: { x: 10, y: 20 } }, zoom: { x: 1, y: 2, k: 1.5 } }
  };

  const payload = await persistence.createProfilePayload([tab], tab.id);
  const descriptor = payload.tabs[0];
  const draftDocument = JSON.parse(writes.get(descriptor.draft.path));

  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.viewState.graphLayout)), tab.graphLayout);
  assert.deepEqual(draftDocument.graphLayout, tab.graphLayout);
});

test("graph restore falls back to source graph when draft is not JSON", async () => {
  const persistence = createPersistence({
    Neutralino: {
      filesystem: {
        async readFile(filePath) {
          if (filePath === "C:/drafts/graph/tab_bad.mdviewer-graph.json") return "text/src/main/java";
          if (filePath === "C:/work/good.mdviewer-graph.json") {
            return JSON.stringify({
              schemaVersion: 1,
              documentType: "graph-view",
              folderName: "Good Graph",
              snapshot: { nodes: [{ id: "ok" }], links: [], files: [] },
              viewConfig: { showLabels: true }
            });
          }
          throw new Error("missing");
        }
      }
    }
  });

  const restored = await persistence.restoreTabsFromPayload({
    version: 2,
    activeTabId: "tab_bad",
    tabs: [{
      schemaVersion: 2,
      id: "tab_bad",
      type: "graph",
      title: "Good Graph",
      folderName: "Good Graph",
      sourceFilePath: "C:/work/good.mdviewer-graph.json",
      sourceFileName: "good.mdviewer-graph.json",
      draft: {
        kind: "graph",
        id: "tab_bad.mdviewer-graph.json",
        path: "C:/drafts/graph/tab_bad.mdviewer-graph.json"
      }
    }]
  });

  assert.equal(restored.tabs.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.tabs[0].graphSnapshot.nodes)), [{ id: "ok" }]);
});

test("draft cleanup removes restored and deterministic draft files", async () => {
  const removed = [];
  const persistence = createPersistence({
    getProfileDataFilePath(fileName) {
      return `C:\\Users\\tester\\.md-editor\\${fileName}`;
    },
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async removeFile(filePath) {
          removed.push(filePath);
        }
      }
    }
  });

  const result = await persistence.cleanupDraftForTab({
    id: "tab_cleanup",
    title: "Cleanup",
    draft: {
      kind: "markdown",
      path: "C:\\Users\\tester\\.md-editor\\drafts\\markdown\\custom.md"
    }
  });

  assert.equal(result.deleted, result.attempted);
  assert.ok(removed.includes("C:\\Users\\tester\\.md-editor\\drafts\\markdown\\custom.md"));
  assert.ok(removed.includes("C:\\Users\\tester\\.md-editor\\drafts\\markdown\\tab_cleanup.md"));
  assert.ok(removed.includes("C:\\Users\\tester\\.md-editor\\drafts\\graph\\tab_cleanup.mdviewer-graph.json"));
  assert.ok(removed.includes("C:\\Users\\tester\\.md-editor\\drafts\\report\\tab_cleanup.mdviewer-graph.json"));
});

test("Kubernetes topology tab serializes durable graph state", () => {
  const persistence = createPersistence();
  const tab = {
    id: "tab_topology",
    type: "kubernetes-topology",
    title: "helm-template-chart",
    createdAt: 123,
    sourceFileName: "helm-template-chart.mdviewer-k8s-topology.json",
    sourceFilePath: "C:/work/helm-template-chart.mdviewer-k8s-topology.json",
    openedSource: {
      path: "C:/work/helm-template-chart.mdviewer-k8s-topology.json",
      name: "helm-template-chart.mdviewer-k8s-topology.json",
      kind: "kubernetes-topology-file"
    },
    kubernetesTopology: {
      graph: { schemaVersion: 1, nodes: [{ id: "namespace/default" }], edges: [], warnings: [] },
      result: { tool: "helm", commandName: "helm-template-chart" },
      manifestContent: "kind: Deployment"
    },
    kubernetesTopologyLayout: { positions: { "namespace/default": { x: 10, y: 20 } } },
    kubernetesTopologyDirty: false
  };

  const descriptor = persistence.serializeTab(tab);

  assert.equal(descriptor.type, "kubernetes-topology");
  assert.equal(descriptor.viewMode, "preview");
  assert.equal(descriptor.sourceFilePath, "C:/work/helm-template-chart.mdviewer-k8s-topology.json");
  assert.equal(descriptor.kubernetesTopology.graph.nodes[0].id, "namespace/default");
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.kubernetesTopologyLayout.positions["namespace/default"])), { x: 10, y: 20 });
});

test("Kubernetes topology session restores as topology view", async () => {
  const persistence = createPersistence();
  const restored = await persistence.restoreTabsFromPayload({
    version: persistence.SESSION_VERSION,
    activeTabId: "tab_topology",
    tabs: [{
      schemaVersion: persistence.SESSION_VERSION,
      id: "tab_topology",
      type: "kubernetes-topology",
      title: "helm-template-chart",
      sourceFileName: "helm-template-chart.mdviewer-k8s-topology.json",
      sourceFilePath: "C:/work/helm-template-chart.mdviewer-k8s-topology.json",
      source: {
        path: "C:/work/helm-template-chart.mdviewer-k8s-topology.json",
        name: "helm-template-chart.mdviewer-k8s-topology.json",
        kind: "kubernetes-topology-file"
      },
      kubernetesTopology: {
        graph: { schemaVersion: 1, nodes: [{ id: "namespace/default" }], edges: [], warnings: [] },
        result: { tool: "helm", commandName: "helm-template-chart" },
        manifestContent: "kind: Deployment"
      },
      kubernetesTopologyLayout: { positions: { "namespace/default": { x: 10, y: 20 } } },
      dirty: false,
      viewMode: "preview"
    }]
  });

  assert.equal(restored.tabs.length, 1);
  assert.equal(restored.tabs[0].type, "kubernetes-topology");
  assert.equal(restored.tabs[0].viewMode, "preview");
  assert.equal(restored.tabs[0].sourceFilePath, "C:/work/helm-template-chart.mdviewer-k8s-topology.json");
  assert.equal(restored.tabs[0].kubernetesTopology.graph.nodes[0].id, "namespace/default");
  assert.deepEqual(restored.tabs[0].kubernetesTopologyLayout.positions["namespace/default"], { x: 10, y: 20 });
});
test("legacy markdown topology session restores from saved topology file", async () => {
  const persistence = createPersistence({
    Neutralino: {
      filesystem: {
        async readFile(filePath) {
          assert.equal(filePath, "C:/work/helm-template-chart.mdviewer-k8s-topology.json");
          return JSON.stringify({
            documentType: "kubernetes-topology-view",
            schemaVersion: 1,
            title: "helm-template-chart Topology",
            topology: { schemaVersion: 1, nodes: [{ id: "namespace/default" }], edges: [], warnings: [] },
            layout: { positions: { "namespace/default": { x: 10, y: 20 } } },
            commandSummary: { tool: "helm", commandName: "helm-template-chart" },
            manifestSnapshot: "kind: Deployment"
          });
        }
      }
    }
  });

  const restored = await persistence.restoreTabsFromPayload({
    version: persistence.SESSION_VERSION,
    activeTabId: "tab_legacy_topology",
    tabs: [{
      schemaVersion: persistence.SESSION_VERSION,
      id: "tab_legacy_topology",
      type: "markdown",
      title: "helm-template-chart",
      sourceFileName: "helm-template-chart.mdviewer-k8s-topology.json",
      sourceFilePath: "C:/work/helm-template-chart.mdviewer-k8s-topology.json",
      source: {
        path: "C:/work/helm-template-chart.mdviewer-k8s-topology.json",
        name: "helm-template-chart.mdviewer-k8s-topology.json",
        kind: "markdown"
      },
      viewMode: "split"
    }]
  });

  assert.equal(restored.tabs.length, 1);
  assert.equal(restored.tabs[0].type, "kubernetes-topology");
  assert.equal(restored.tabs[0].viewMode, "preview");
  assert.equal(restored.tabs[0].sourceFilePath, "C:/work/helm-template-chart.mdviewer-k8s-topology.json");
  assert.equal(restored.tabs[0].kubernetesTopology.graph.nodes[0].id, "namespace/default");
});
test("old tab sessions are ignored", async () => {
  const persistence = createPersistence();
  const restored = await persistence.restoreTabsFromPayload({
    version: 1,
    activeTabId: "old",
    tabs: [{ id: "old", type: "markdown", content: "legacy snapshot" }]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(restored)), { tabs: [], activeTabId: null });
});
