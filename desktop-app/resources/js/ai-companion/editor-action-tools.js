(function(window) {
  "use strict";

  function registerMarkdownViewerAiCompanionEditorActionTools(app, deps) {
    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "");
    }

    function isAbsoluteLocalPath(value) {
      const path = String(value || "");
      return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path) || /^\//.test(path);
    }

    function joinWorkspacePath(path) {
      const value = String(path || "").trim();
      if (!value) return "";
      if (isAbsoluteLocalPath(value)) return value;
      const root = String(deps.getWorkspaceRoot?.() || "");
      return deps.joinPath ? deps.joinPath(root, value) : `${root.replace(/[\\/]+$/, "")}/${value.replace(/^[\\/]+/, "")}`;
    }

    function normalizeComparablePath(value) {
      return normalizePath(value).toLowerCase();
    }

    function isPathWithinFolder(path, folder) {
      const root = normalizeComparablePath(folder);
      const fullPath = normalizeComparablePath(path);
      return !!root && !!fullPath && (fullPath === root || fullPath.startsWith(`${root}/`));
    }

    function getWorkspacePath(path) {
      const fullPath = joinWorkspacePath(path);
      const workspaceRoot = deps.getWorkspaceRoot?.() || "";
      if (!fullPath || !isPathWithinFolder(fullPath, workspaceRoot)) throw new Error("Path is outside the workspace.");
      return fullPath;
    }

    function getFileName(path) {
      if (typeof deps.getFileName === "function") return deps.getFileName(path);
      return normalizePath(path).split("/").pop() || "document.md";
    }

    function getActiveTab() {
      const activeTabId = String(deps.getActiveTabId?.() || "");
      return (deps.getTabs?.() || []).find((tab) => String(tab?.id || "") === activeTabId) || null;
    }

    function getTabPath(tab = {}) {
      return normalizePath(tab.sourceFilePath || tab.path || tab.openedSource?.path || "");
    }

    function findTab(args = {}) {
      const tabId = String(args.tabId || "").trim();
      if (tabId) return (deps.getTabs?.() || []).find((tab) => String(tab?.id || "") === tabId) || null;
      const expectedPath = normalizeComparablePath(args.path || args.expectedPath || "");
      if (!expectedPath) return getActiveTab();
      return (deps.getTabs?.() || []).find((tab) => {
        const tabPath = normalizeComparablePath(getTabPath(tab));
        return tabPath === expectedPath || tabPath.endsWith(`/${expectedPath}`);
      }) || null;
    }

    function assertExpectedPath(expectedPath) {
      const expected = normalizeComparablePath(expectedPath);
      if (!expected) return;
      const actual = normalizeComparablePath(getTabPath(getActiveTab()));
      if (!actual || (actual !== expected && !actual.endsWith(`/${expected}`))) {
        throw new Error("Active editor path does not match expectedPath.");
      }
    }

    function ensureEditableActiveTab() {
      const tab = getActiveTab();
      if (!tab || ["graph", "large-file", "file-preview", "file-compare", "api-client"].includes(tab.type)) {
        throw new Error("Active tab is not an editable document.");
      }
      return tab;
    }

    async function saveTab(tab) {
      if (!tab) throw new Error("No tab is active.");
      if (!tab.sourceFilePath && !tab.sourceFileHandle) throw new Error("Editor action requires a saved file-backed tab.");
      const saved = await deps.fileSave?.saveMarkdownTabToSource?.(tab);
      if (!saved) throw new Error("Unable to save editor action result.");
      return true;
    }

    function replaceActiveRange(start, end, replacement) {
      const replaced = deps.activeEditorCommands?.replaceActiveEditorRange?.(start, end, replacement);
      if (!replaced) throw new Error("Unable to edit the active document.");
      return true;
    }

    async function openFileInTab(args = {}) {
      const fullPath = getWorkspacePath(args.path);
      const tab = await deps.openDocumentSourceFile?.(
        { name: getFileName(fullPath), path: fullPath },
        { temporary: false, title: getFileName(fullPath) }
      );
      if (!tab) throw new Error("Unable to open file in tab.");
      if (args.line) deps.focusEditorLine?.(args.line);
      return { changed: false, opened: true, tabId: tab.id || "", path: normalizePath(fullPath) };
    }

    async function createDocumentTab(args = {}) {
      const fullPath = getWorkspacePath(args.path);
      if (args.overwrite !== true && await deps.fileExists?.(fullPath)) throw new Error("Target file already exists.");
      const tab = deps.tabsModule?.newTab?.(String(args.content || ""), args.title || getFileName(fullPath), { viewMode: "editor" });
      if (!tab) throw new Error("Unable to create document tab.");
      tab.sourceFileName = getFileName(fullPath);
      tab.sourceFilePath = fullPath;
      tab.openedSource = { path: fullPath, name: getFileName(fullPath), kind: "file" };
      if (typeof deps.tabsModule?.switchTab === "function") deps.tabsModule.switchTab(tab.id);
      await saveTab(tab);
      return { changed: true, created: true, tabId: tab.id || "", path: normalizePath(fullPath) };
    }

    async function insertAtCursor(args = {}) {
      assertExpectedPath(args.expectedPath);
      const tab = ensureEditableActiveTab();
      const selection = deps.activeEditorCommands?.getActiveEditorSelection?.() || { start: 0, end: 0 };
      replaceActiveRange(selection.start, selection.start, String(args.text || ""));
      await saveTab(tab);
      return { changed: true, tabId: tab.id || "", path: getTabPath(tab) };
    }

    async function replaceSelection(args = {}) {
      assertExpectedPath(args.expectedPath);
      const tab = ensureEditableActiveTab();
      const selection = deps.activeEditorCommands?.getActiveEditorSelection?.() || { start: 0, end: 0 };
      replaceActiveRange(selection.start, selection.end, String(args.replacement || ""));
      await saveTab(tab);
      return { changed: true, tabId: tab.id || "", path: getTabPath(tab) };
    }

    async function replaceDocumentRange(args = {}) {
      const targetTab = findTab(args);
      if (!targetTab) throw new Error("Target tab was not found.");
      if (typeof deps.tabsModule?.switchTab === "function") deps.tabsModule.switchTab(targetTab.id);
      const tab = ensureEditableActiveTab();
      const start = Math.max(0, Number(args.start) || 0);
      const end = Math.max(start, Number(args.end) || start);
      const content = deps.activeEditorCommands?.getActiveEditorValue?.() || "";
      if (typeof args.expectedText === "string" && content.slice(start, end) !== args.expectedText) {
        throw new Error("Current document text does not match expectedText.");
      }
      replaceActiveRange(start, end, String(args.replacement || ""));
      await saveTab(tab);
      return { changed: true, tabId: tab.id || "", path: getTabPath(tab) };
    }

    async function extractSelectionToNote(args = {}) {
      const targetPath = getWorkspacePath(args.path);
      if (await deps.fileExists?.(targetPath)) throw new Error("Target file already exists.");
      const sourceTab = ensureEditableActiveTab();
      const selection = deps.activeEditorCommands?.getActiveEditorSelection?.() || { start: 0, end: 0 };
      const content = deps.activeEditorCommands?.getActiveEditorValue?.() || "";
      const selectedText = content.slice(selection.start, selection.end);
      if (!selectedText) throw new Error("No selected text to extract.");
      const created = await createDocumentTab({ path: args.path, content: selectedText, title: args.title || getFileName(targetPath), overwrite: false });
      if (args.replaceWithLink === true) {
        if (typeof deps.tabsModule?.switchTab === "function") deps.tabsModule.switchTab(sourceTab.id);
        const linkText = args.title || getFileName(targetPath).replace(/\.(md|markdown)$/i, "");
        replaceActiveRange(selection.start, selection.end, `[[${linkText}]]`);
        await saveTab(sourceTab);
      }
      return { changed: true, extracted: true, created: true, replacedSelection: args.replaceWithLink === true, sourceTabId: sourceTab.id || "", createdTabId: created.tabId || "", path: normalizePath(targetPath) };
    }

    async function execute(toolName, args = {}) {
      switch (toolName) {
        case "open_file_in_tab":
          return openFileInTab(args);
        case "create_document_tab":
          return createDocumentTab(args);
        case "insert_at_cursor":
          return insertAtCursor(args);
        case "replace_selection":
          return replaceSelection(args);
        case "replace_document_range":
          return replaceDocumentRange(args);
        case "extract_selection_to_note":
          return extractSelectionToNote(args);
        default:
          throw new Error(`Unsupported editor action: ${toolName}`);
      }
    }

    const api = { execute };
    app.registerModule?.("aiCompanionEditorActionTools", api);
    return api;
  }
  window.registerMarkdownViewerAiCompanionEditorActionTools = registerMarkdownViewerAiCompanionEditorActionTools;
})(window);
