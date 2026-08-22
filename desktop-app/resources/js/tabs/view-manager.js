(function(global) {
  "use strict";

  global.registerMarkdownViewerTabViewManager = function registerMarkdownViewerTabViewManager(app, deps) {
    const api = {};
    const viewRoots = new Map();
    let activeTabView = null;

    const tabViewHost = deps.tabViewHost || null;
    const legacyEditorSurface = deps.legacyEditorSurface || null;
    const largeFileViewer = deps.largeFileViewer || null;
    const filePreview = deps.filePreview || null;
    const imageEditor = deps.imageEditor || null;
    const diagramEditor = deps.diagramEditor || null;
    const hexEditor = deps.hexEditor || null;
    const fileCompare = deps.fileCompare || null;
    const apiClient = deps.apiClient || null;
    const regexTester = deps.regexTester || null;
    const base64Tool = deps.base64Tool || null;
    const certificateDecoder = deps.certificateDecoder || null;
    const jwtTool = deps.jwtTool || null;
    const jsonYamlTool = deps.jsonYamlTool || null;
    const jsonPathTool = deps.jsonPathTool || null;
    const xpathTool = deps.xpathTool || null;
    const uuidTool = deps.uuidTool || null;
    const qrTool = deps.qrTool || null;
    const hashTool = deps.hashTool || null;
    const jsonArrayTableTool = deps.jsonArrayTableTool || null;
    const textEscapeTool = deps.textEscapeTool || null;
    const unicodeTool = deps.unicodeTool || null;
    const stringBytesTool = deps.stringBytesTool || null;
    const databaseConnectionStringTool = deps.databaseConnectionStringTool || null;
    const editorViewManager = deps.editorViewManager || null;

    function getKubernetesTopologyRenderer() {
      return deps.kubernetesTopologyRenderer || app?.modules?.kubernetesTopologyRenderer || null;
    }

    function parkLegacySurface() {
      if (!legacyEditorSurface) return;
      legacyEditorSurface.hidden = true;
      legacyEditorSurface.setAttribute("aria-hidden", "true");
      legacyEditorSurface.classList?.remove?.("active");
      if (legacyEditorSurface.parentElement !== tabViewHost && tabViewHost) {
        tabViewHost.appendChild(legacyEditorSurface);
      }
    }

    parkLegacySurface();

    function getTabId(tabOrId) {
      return typeof tabOrId === "string" ? tabOrId : tabOrId?.id;
    }

    function getViewKind(tab) {
      if (tab?.type === "large-file") return "large-file";
      if (tab?.type === "file-preview") return "file-preview";
      if (tab?.type === "image-editor") return "image-editor";
      if (tab?.type === "diagram-editor") return "diagram-editor";
      if (tab?.type === "hex-editor") return "hex-editor";
      if (tab?.type === "file-compare") return "file-compare";
      if (tab?.type === "api-client") return "api-client";
      if (tab?.type === "regex-tester") return "regex-tester";
      if (tab?.type === "base64-tool") return "base64-tool";
      if (tab?.type === "certificate-decoder") return "certificate-decoder";
      if (tab?.type === "jwt-tool") return "jwt-tool";
      if (tab?.type === "json-yaml-tool") return "json-yaml-tool";
      if (tab?.type === "jsonpath-tool") return "jsonpath-tool";
      if (tab?.type === "xpath-tool") return "xpath-tool";
      if (tab?.type === "uuid-tool") return "uuid-tool";
      if (tab?.type === "qr-tool") return "qr-tool";
      if (tab?.type === "hash-tool") return "hash-tool";
      if (tab?.type === "json-array-table-tool") return "json-array-table-tool";
      if (tab?.type === "text-escape-tool") return "text-escape-tool";
      if (tab?.type === "unicode-tool") return "unicode-tool";
      if (tab?.type === "string-bytes-tool") return "string-bytes-tool";
      if (tab?.type === "database-connection-string-tool") return "database-connection-string-tool";
      if (tab?.type === "kubernetes-topology") return "kubernetes-topology";
      if (!tab || tab.type !== "graph") return "editor";
      return tab.graphViewKind === "health-report" ? "graph-health-report" : "graph";
    }

    function createTabViewRoot(tab) {
      if (!tabViewHost || !tab?.id) return null;
      const root = document.createElement("section");
      root.className = "tab-view";
      root.dataset.tabId = tab.id;
      root.dataset.tabViewKind = getViewKind(tab);
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      tabViewHost.appendChild(root);
      return root;
    }

    function renderEditableTabFailure(root, message) {
      if (!root) return;
      root.textContent = "";
      const failure = document.createElement("div");
      failure.className = "editor-mount-failure";
      const title = document.createElement("h2");
      const body = document.createElement("p");
      title.textContent = "CodeMirror editor failed to load";
      body.textContent = message || "Editable text tabs require CodeMirror 6.";
      failure.appendChild(title);
      failure.appendChild(body);
      root.appendChild(failure);
    }

    function ensureTabView(tab) {
      if (!tab?.id) return null;
      let root = viewRoots.get(tab.id);
      if (!root || !root.isConnected) {
        root = createTabViewRoot(tab);
        if (root) viewRoots.set(tab.id, root);
      }
      if (root) root.dataset.tabViewKind = getViewKind(tab);
      return root;
    }

    function deactivateTabView(tabOrId) {
      const tabId = getTabId(tabOrId);
      const root = tabId ? viewRoots.get(tabId) : activeTabView;
      if (!root) return;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.classList.remove("active");
      if (activeTabView === root) activeTabView = null;
    }

    function activateTabView(tab) {
      if (tab?.type !== "api-client") apiClient?.deactivateApiClientSidebar?.();
      regexTester?.setActiveTab?.(tab);
      const root = ensureTabView(tab);
      if (!root) return null;
      if (activeTabView && activeTabView !== root) deactivateTabView(activeTabView.dataset.tabId);
      parkLegacySurface();
      if (tab?.type === "large-file") {
        editorViewManager?.deactivateEditorView?.();
        largeFileViewer?.mountLargeFileTab?.(tab, root);
      } else if (tab?.type === "file-preview") {
        editorViewManager?.deactivateEditorView?.();
        filePreview?.mountFilePreviewTab?.(tab, root);
      } else if (tab?.type === "image-editor") {
        editorViewManager?.deactivateEditorView?.();
        imageEditor?.mountImageEditorTab?.(tab, root);
      } else if (tab?.type === "diagram-editor") {
        editorViewManager?.deactivateEditorView?.();
        diagramEditor?.mountDiagramTab?.(tab, root);
      } else if (tab?.type === "hex-editor") {
        editorViewManager?.deactivateEditorView?.();
        hexEditor?.mountHexEditorTab?.(tab, root);
      } else if (tab?.type === "file-compare") {
        editorViewManager?.deactivateEditorView?.();
        fileCompare?.mountFileCompareTab?.(tab, root);
      } else if (tab?.type === "api-client") {
        editorViewManager?.deactivateEditorView?.();
        apiClient?.mountApiClientTab?.(tab, root);
        apiClient?.activateApiClientSidebar?.(tab);
      } else if (tab?.type === "regex-tester") {
        editorViewManager?.deactivateEditorView?.();
        regexTester?.mountRegexTesterTab?.(tab, root);
      } else if (tab?.type === "base64-tool") {
        editorViewManager?.deactivateEditorView?.();
        base64Tool?.mountBase64ToolTab?.(tab, root);
      } else if (tab?.type === "certificate-decoder") {
        editorViewManager?.deactivateEditorView?.();
        certificateDecoder?.mountCertificateDecoderTab?.(tab, root);
      } else if (tab?.type === "jwt-tool") {
        editorViewManager?.deactivateEditorView?.();
        jwtTool?.mountJwtToolTab?.(tab, root);
      } else if (tab?.type === "json-yaml-tool") {
        editorViewManager?.deactivateEditorView?.();
        jsonYamlTool?.mountJsonYamlToolTab?.(tab, root);
      } else if (tab?.type === "jsonpath-tool") {
        editorViewManager?.deactivateEditorView?.();
        jsonPathTool?.mountJsonPathToolTab?.(tab, root);
      } else if (tab?.type === "xpath-tool") {
        editorViewManager?.deactivateEditorView?.();
        xpathTool?.mountXPathToolTab?.(tab, root);
      } else if (tab?.type === "uuid-tool") {
        editorViewManager?.deactivateEditorView?.();
        uuidTool?.mountUuidToolTab?.(tab, root);
      } else if (tab?.type === "qr-tool") {
        editorViewManager?.deactivateEditorView?.();
        qrTool?.mountQrToolTab?.(tab, root);
      } else if (tab?.type === "hash-tool") {
        editorViewManager?.deactivateEditorView?.();
        hashTool?.mountHashToolTab?.(tab, root);
      } else if (tab?.type === "json-array-table-tool") {
        editorViewManager?.deactivateEditorView?.();
        jsonArrayTableTool?.mountJsonArrayTableToolTab?.(tab, root);
      } else if (tab?.type === "text-escape-tool") {
        editorViewManager?.deactivateEditorView?.();
        textEscapeTool?.mountTextEscapeToolTab?.(tab, root);
      } else if (tab?.type === "unicode-tool") {
        editorViewManager?.deactivateEditorView?.();
        unicodeTool?.mountUnicodeToolTab?.(tab, root);
      } else if (tab?.type === "string-bytes-tool") {
        editorViewManager?.deactivateEditorView?.();
        stringBytesTool?.mountStringBytesToolTab?.(tab, root);
      } else if (tab?.type === "database-connection-string-tool") {
        editorViewManager?.deactivateEditorView?.();
        databaseConnectionStringTool?.mountDatabaseConnectionStringToolTab?.(tab, root);
      } else if (tab?.type === "kubernetes-topology") {
        editorViewManager?.deactivateEditorView?.();
        getKubernetesTopologyRenderer()?.mountTopologyTab?.(tab, root);
      } else if (tab?.type !== "graph") {
        if (!editorViewManager?.activateEditorTab) {
          renderEditableTabFailure(root, "Editable text tabs require the CodeMirror editor view manager.");
          throw new Error("Editable text tabs require the CodeMirror editor view manager.");
        }
        editorViewManager.activateEditorTab(tab, root);
      } else {
        editorViewManager?.deactivateEditorView?.();
      }
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      root.classList.add("active");
      activeTabView = root;
      return root;
    }

    function destroyTabView(tabId) {
      const root = viewRoots.get(tabId);
      if (!root) return;
      if (legacyEditorSurface && root.contains(legacyEditorSurface)) parkLegacySurface();
      if (activeTabView === root) activeTabView = null;
      largeFileViewer?.destroyLargeFileTab?.(tabId);
      filePreview?.destroyFilePreviewTab?.(tabId);
      imageEditor?.destroyImageEditorTab?.(tabId);
      diagramEditor?.destroyDiagramTab?.(tabId);
      hexEditor?.destroyHexEditorTab?.(tabId);
      fileCompare?.destroyFileCompareTab?.(tabId);
      apiClient?.destroyApiClientTab?.(tabId);
      regexTester?.destroyRegexTesterTab?.(tabId);
      base64Tool?.destroyBase64ToolTab?.(tabId);
      certificateDecoder?.destroyCertificateDecoderTab?.(tabId);
      jwtTool?.destroyJwtToolTab?.(tabId);
      jsonYamlTool?.destroyJsonYamlToolTab?.(tabId);
      jsonPathTool?.destroyJsonPathToolTab?.(tabId);
      xpathTool?.destroyXPathToolTab?.(tabId);
      uuidTool?.destroyUuidToolTab?.(tabId);
      qrTool?.destroyQrToolTab?.(tabId);
      hashTool?.destroyHashToolTab?.(tabId);
      jsonArrayTableTool?.destroyJsonArrayTableToolTab?.(tabId);
      textEscapeTool?.destroyTextEscapeToolTab?.(tabId);
      unicodeTool?.destroyUnicodeToolTab?.(tabId);
      stringBytesTool?.destroyStringBytesToolTab?.(tabId);
      databaseConnectionStringTool?.destroyDatabaseConnectionStringToolTab?.(tabId);
      getKubernetesTopologyRenderer()?.destroyTopologyTab?.(tabId);
      editorViewManager?.destroyEditorTab?.(tabId);
      root.remove();
      viewRoots.delete(tabId);
    }

    function destroyAllTabViews() {
      Array.from(viewRoots.keys()).forEach(destroyTabView);
    }

    function getActiveTabView() {
      return activeTabView;
    }

    Object.assign(api, {
      ensureTabView,
      activateTabView,
      deactivateTabView,
      destroyTabView,
      destroyAllTabViews,
      getActiveTabView,
      getViewRootCount() {
        return viewRoots.size;
      }
    });

    app.services.tabViewManager = api;
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
