const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const webRoot = path.resolve(__dirname, "..", "resources");

function createApp() {
  return {
    services: {},
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
      this.services[name] = api;
    }
  };
}

function loadClassicScript(relativePath) {
  const context = {
    window: {},
    console,
    Blob,
    URL: {
      createObjectURL() {
        return "blob:preview";
      },
      revokeObjectURL() {}
    },
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, relativePath), "utf8"), context, { filename: relativePath });
  return context.window;
}

function loadFileOpen(overrides = {}) {
  const context = {
    window: {},
    console,
    requestAnimationFrame(callback) {
      callback();
    },
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, "js", "files", "open.js"), "utf8"), context, { filename: "files/open.js" });
  return context.window.registerMarkdownViewerFileOpen(createApp(), {
    getFileName(value) {
      return String(value || "").split(/[\\/]/).pop() || "document.md";
    },
    getMarkdownTitleFromFileName(value) {
      return String(value || "document.md").replace(/\.(md|markdown)$/i, "");
    },
    isGraphFilePath(value) {
      return /\.mdviewer-graph\.json$/i.test(value || "");
    },
    isJsonPath(value) {
      return /\.json$/i.test(value || "");
    },
    isMarkdownPath(value) {
      return /\.(md|markdown)$/i.test(value || "");
    },
    isMermaidPath(value) {
      return /\.mermaid$/i.test(value || "");
    },
    isTextDocumentPath(value) {
      return /\.(md|markdown|json|txt|js)$/i.test(value || "");
    },
    isTextFileLike(file) {
      return String(file?.type || "").startsWith("text/");
    },
    looksLikeGraphDocument(value) {
      return value?.documentType === "graph-view";
    },
    isDiagramCandidatePath() {
      return false;
    },
    isDiagramPath() {
      return false;
    },
    looksLikeDiagramXml() {
      return false;
    },
    largeFileViewer: {
      classifyLargeDocumentOpen() {
        return { useViewer: false };
      },
      shouldUseLargeFileViewer() {
        return false;
      }
    },
    largeJsonOpen: {},
    rememberRecentFile() {},
    openSidebarFileInTab(content, title, source) {
      return { type: "markdown", content, title, source };
    },
    openSavedGraphDocument(source) {
      return { type: "graph", source };
    },
    openFilePreviewInTab(source, title) {
      return { type: "file-preview", source, title };
    },
    Neutralino: {
      filesystem: {
        readFile() {
          throw new Error("readFile should not be called for binary previews");
        },
        getStats() {
          return { size: 1234 };
        }
      }
    },
    NL_VERSION: "test",
    ...overrides
  });
}

test("non-text paths route to file-preview without reading as text", async () => {
  const fileOpen = loadFileOpen();
  const tab = await fileOpen.openDocumentSourceFile({ name: "manual.pdf", path: "C:/vault/manual.pdf" });

  assert.equal(tab.type, "file-preview");
  assert.equal(tab.source.name, "manual.pdf");
  assert.equal(tab.source.path, "C:/vault/manual.pdf");
});

test("known text paths still route to markdown/editor", async () => {
  let readFileCalled = false;
  const fileOpen = loadFileOpen({
    Neutralino: {
      filesystem: {
        readFile() {
          readFileCalled = true;
          return "# Notes";
        },
        getStats() {
          return { size: 8 };
        }
      }
    }
  });
  const tab = await fileOpen.openDocumentSourceFile({ name: "notes.md", path: "C:/vault/notes.md" });

  assert.equal(tab.type, "markdown");
  assert.equal(readFileCalled, true);
});

test("Neutralino text reads release their foreground wait token before the tab opens", async () => {
  const order = [];
  const fileOpen = loadFileOpen({
    foregroundWaitIndicator: {
      begin() {
        order.push("wait-started");
        return () => order.push("wait-released");
      }
    },
    openSidebarFileInTab() {
      order.push("tab-opened");
      return { type: "markdown" };
    },
    Neutralino: {
      filesystem: {
        readFile() {
          order.push("file-read");
          return "class Sample {}";
        },
        getStats() {
          return { size: 15 };
        }
      }
    }
  });

  await fileOpen.openDocumentSourceFile({ name: "sample.js", path: "C:/vault/sample.js" });

  assert.deepEqual(order, ["wait-started", "file-read", "wait-released", "tab-opened"]);
});

test("Neutralino text read failures still release their foreground wait token", async () => {
  let releases = 0;
  const fileOpen = loadFileOpen({
    foregroundWaitIndicator: {
      begin() {
        return () => { releases += 1; };
      }
    },
    Neutralino: {
      filesystem: {
        readFile() {
          throw new Error("read failed");
        },
        getStats() {
          return { size: 15 };
        }
      }
    }
  });

  await assert.rejects(
    fileOpen.openDocumentSourceFile({ name: "sample.js", path: "C:/vault/sample.js" }),
    /read failed/
  );
  assert.equal(releases, 1);
});

test("markdown document open preserves requested view mode", async () => {
  let openOptions = null;
  const fileOpen = loadFileOpen({
    openSidebarFileInTab(_content, _title, _source, options) {
      openOptions = options;
      return { type: "markdown", options };
    },
    Neutralino: {
      filesystem: {
        readFile() {
          return "# Plan";
        },
        getStats() {
          return { size: 6 };
        }
      }
    }
  });

  const tab = await fileOpen.openDocumentSourceFile({ name: "plan.md", path: "C:/vault/plan.md" }, { viewMode: "preview" });

  assert.equal(tab.type, "markdown");
  assert.equal(openOptions.viewMode, "preview");
});

test("graph json detection still wins over text preview", async () => {
  const fileOpen = loadFileOpen({
    Neutralino: {
      filesystem: {
        readFile() {
          return JSON.stringify({ documentType: "graph-view" });
        },
        getStats() {
          return { size: 32 };
        }
      }
    }
  });
  const tab = await fileOpen.openDocumentSourceFile({ name: "graph.mdviewer-graph.json", path: "C:/vault/graph.mdviewer-graph.json" });

  assert.equal(tab.type, "graph");
});

test("Kubernetes topology files reuse an existing source tab", async () => {
  const calls = [];
  const existingTab = { id: "topology-tab", type: "kubernetes-topology" };
  const fileOpen = loadFileOpen({
    isKubernetesTopologyFilePath(value) {
      return /\.mdviewer-k8s-topology\.json$/i.test(value || "");
    },
    findTabForSourceFile(source, requiredType) {
      calls.push(["find", source.path, requiredType]);
      return existingTab;
    },
    switchTab(tabId) {
      calls.push(["switch", tabId]);
    },
    openSavedKubernetesTopologyDocument() {
      throw new Error("should not open duplicate topology tab");
    },
    Neutralino: {
      filesystem: {
        readFile() {
          throw new Error("should not read existing topology file");
        },
        getStats() {
          return { size: 20 };
        }
      }
    }
  });

  const tab = await fileOpen.openDocumentSourceFile({ name: "topology.mdviewer-k8s-topology.json", path: "C:/vault/topology.mdviewer-k8s-topology.json" });

  assert.equal(tab, existingTab);
  assert.deepEqual(calls, [
    ["find", "C:/vault/topology.mdviewer-k8s-topology.json", "kubernetes-topology"],
    ["switch", "topology-tab"]
  ]);
});

test("permanent Kubernetes topology opens pin an existing temporary source tab", async () => {
  const calls = [];
  const existingTab = { id: "topology-tab", type: "kubernetes-topology", isTemporary: true };
  const fileOpen = loadFileOpen({
    isKubernetesTopologyFilePath(value) {
      return /\.mdviewer-k8s-topology\.json$/i.test(value || "");
    },
    findTabForSourceFile(source, requiredType) {
      calls.push(["find", source.path, requiredType]);
      return existingTab;
    },
    switchTab(tabId) {
      calls.push(["switch", tabId]);
    },
    pinTemporaryTab(tabId) {
      calls.push(["pin", tabId]);
    },
    openSavedKubernetesTopologyDocument() {
      throw new Error("should not open duplicate topology tab");
    }
  });

  const tab = await fileOpen.openDocumentSourceFile({ name: "topology.mdviewer-k8s-topology.json", path: "C:/vault/topology.mdviewer-k8s-topology.json" }, { temporary: false });

  assert.equal(tab, existingTab);
  assert.deepEqual(calls, [
    ["find", "C:/vault/topology.mdviewer-k8s-topology.json", "kubernetes-topology"],
    ["switch", "topology-tab"],
    ["pin", "topology-tab"]
  ]);
});
test("detected Kubernetes topology JSON documents reuse an existing source tab", async () => {
  const calls = [];
  const existingTab = { id: "topology-json-tab", type: "kubernetes-topology" };
  const fileOpen = loadFileOpen({
    isKubernetesTopologyFilePath() {
      return false;
    },
    looksLikeKubernetesTopologyDocument(value) {
      return value?.documentType === "kubernetes-topology-view";
    },
    findTabForSourceFile(source, requiredType) {
      calls.push(["find", source.path, requiredType]);
      return existingTab;
    },
    switchTab(tabId) {
      calls.push(["switch", tabId]);
    },
    openSavedKubernetesTopologyDocument() {
      throw new Error("should not open duplicate topology tab");
    },
    Neutralino: {
      filesystem: {
        readFile() {
          return JSON.stringify({ documentType: "kubernetes-topology-view" });
        },
        getStats() {
          return { size: 45 };
        }
      }
    }
  });

  const tab = await fileOpen.openDocumentSourceFile({ name: "topology.json", path: "C:/vault/topology.json" });

  assert.equal(tab, existingTab);
  assert.deepEqual(calls, [
    ["find", "C:/vault/topology.json", "kubernetes-topology"],
    ["switch", "topology-json-tab"]
  ]);
});
test("folder startup lazy markdown indexing runs after the folder tree renders", async () => {
  const scanCalls = [];
  const collectCalls = [];
  const renderCalls = [];
  const order = [];
  let resolveCollect;
  const nodes = [{ kind: "directory", name: "docs", fullPath: "C:/vault/docs", childrenLazy: true, children: [] }];
  const fileOpen = loadFileOpen({
    listMarkdownTreeNeutralino: async (selectedPath, options) => {
      scanCalls.push({ selectedPath, options });
      return nodes;
    },
    collectMarkdownFilesFromTreeNeutralino: async (collectedNodes, parentPath, options) => {
      order.push("collect");
      collectCalls.push({ nodes: collectedNodes, parentPath, options });
      return new Promise((resolve) => { resolveCollect = resolve; });
    },
    renderFolderLoadingState() {},
    renderFolderTree(renderedNodes, options) {
      order.push("render");
      renderCalls.push({ nodes: renderedNodes, options });
    },
    rememberRecentFolder() {},
    saveGlobalState() {}
  });

  await fileOpen.openFolderTreeFromNeutralinoPath("C:/vault", { preferLazyRoot: true, skipSavedGraphPrompt: true });

  assert.equal(scanCalls.length, 1);
  assert.equal(scanCalls[0].selectedPath, "C:/vault");
  assert.equal(scanCalls[0].options.preferLazyRoot, true);
  assert.deepEqual(order, ["render"]);
  assert.equal(renderCalls.length, 1);
  assert.equal(collectCalls.length, 0);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(order.slice(0, 2), ["render", "collect"]);
  assert.equal(collectCalls.length, 1);
  assert.equal(collectCalls[0].parentPath, "");
  assert.equal(collectCalls[0].options.resolveLazyDirectories, true);

  resolveCollect([{ name: "nested.md", fullPath: "C:/vault/docs/nested.md" }]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(renderCalls.length, 1);
});

test("preview MIME helper prefers File.type, extension fallback, then octet-stream", () => {
  const window = loadClassicScript(path.join("js", "files", "preview.js"));
  const preview = window.registerMarkdownViewerFilePreview(createApp(), {
    getFileExtension(value) {
      const match = String(value || "").match(/\.([^.]+)$/);
      return match ? match[1].toLowerCase() : "";
    }
  });

  assert.equal(preview.getPreviewMimeType({ file: { type: "image/png", name: "photo.bin" } }), "image/png");
  assert.equal(preview.getPreviewMimeType({ name: "manual.pdf" }), "application/pdf");
  assert.equal(preview.getPreviewMimeType({ name: "archive.unknown" }), "application/octet-stream");
});

test("preview embedding only uses browser-renderable MIME types", () => {
  const window = loadClassicScript(path.join("js", "files", "preview.js"));
  const preview = window.registerMarkdownViewerFilePreview(createApp(), {});

  assert.equal(preview.canEmbedPreviewMimeType("image/png"), true);
  assert.equal(preview.canEmbedPreviewMimeType("application/pdf"), true);
  assert.equal(preview.canEmbedPreviewMimeType("video/mp4"), true);
  assert.equal(preview.canEmbedPreviewMimeType("application/octet-stream"), false);
  assert.equal(preview.canEmbedPreviewMimeType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), false);
});
